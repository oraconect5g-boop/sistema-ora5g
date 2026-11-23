#!/usr/bin/env bash
# Registra a publicação DEPOIS de conferida, FORA dos commits do aplicativo (achados F18-04 e F21-03 das auditorias do
# Codex de 18 e 21/11/2026: o checkpoint dentro da main ficava sempre um lote atrás, porque o commit que registra a
# publicação não pode trazer o próprio SHA).
#
# Cada publicação vira uma linha na branch `registro/publicacoes` do mesmo repositório (arquivos PUBLICACOES.md, para
# ler, e publicacoes.jsonl, a fonte), enviada ao GitHub na hora. A branch não tem código: o CI não roda nela e nada dela
# é publicado. O que está no ar é sempre o que https://ora5g.com.br/saude/versao responde; este registro guarda o que foi
# conferido a cada vez: o lote, o commit inteiro, a build, o ambiente, o CI local, as migrations que entraram desde o
# registro anterior e a prova funcional feita no domínio.
#
# Só registra o que a conferência aprova: roda antes o conferir-publicacao.sh (a pasta, o serviço local e o domínio
# servindo o MESMO commit, que é a main, e o ambiente de homologação). Nenhum segredo entra no registro.
#
# Uso: bash deploy/homologacao/registrar-publicacao.sh "<lote>" "<prova funcional no domínio>" [<commit do CI local>]
#   ORA_REGISTRO_SO_MOSTRAR=1   mostra a linha que seria gravada e não grava nem envia nada.
#   ORA_SHA_ESPERADO=<commit>   reversão declarada (o mesmo do conferir-publicacao.sh).
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

LOTE="${1:-}"
PROVA="${2:-}"
CI_LOCAL="${3:-}"
[ -n "$LOTE" ] && [ -n "$PROVA" ] || { echo 'Uso: registrar-publicacao.sh "<lote>" "<prova funcional no domínio>" [<commit do CI local>]'; exit 1; }

AQUI="$(cd "$(dirname "$0")" && pwd)"
REPO="${ORA_REPO_DIR:-$HOME/sistema-ora5g}"
BASE="${ORA_HML_BASE:-$HOME/homologacao}"
DOMINIO="${ORA_HML_DOMINIO:-https://ora5g.com.br}"
BRANCH="registro/publicacoes"

# 1. Só registra o que está mesmo no ar e conferido.
bash "$AQUI/conferir-publicacao.sh" > /dev/null || { echo "A conferência da publicação falhou: nada foi registrado. Rode o conferir-publicacao.sh para ver o motivo."; exit 1; }
VERSAO="$(curl -fsS --max-time 20 -H 'User-Agent: ora5g-registro-de-publicacao' "$DOMINIO/saude/versao")"

# 2. A pasta de trabalho da branch do registro (criada vazia na primeira vez).
PASTA="$BASE/.registro-de-publicacoes"
git -C "$REPO" worktree remove --force "$PASTA" > /dev/null 2>&1 || true
rm -rf "${PASTA:?}"
git -C "$REPO" fetch -q origin
if git -C "$REPO" ls-remote --exit-code --heads origin "$BRANCH" > /dev/null 2>&1; then
  git -C "$REPO" fetch -q origin "$BRANCH"
  git -C "$REPO" worktree add -q --detach "$PASTA" FETCH_HEAD
else
  git -C "$REPO" worktree add -q --detach "$PASTA" origin/main
  git -C "$PASTA" checkout -q --orphan "$BRANCH"
  git -C "$PASTA" rm -rfq . > /dev/null
fi
trap 'git -C "$REPO" worktree remove --force "$PASTA" > /dev/null 2>&1 || true' EXIT

# 3. A linha nova e a página de leitura (o commit anterior do registro dá as migrations que entraram desde então).
# O programa abaixo sai com 3 quando não há o que gravar (já registrada, ou só para mostrar).
SAIDA=0
LOTE="$LOTE" PROVA="$PROVA" CI_LOCAL="$CI_LOCAL" VERSAO="$VERSAO" DOMINIO="$DOMINIO" PASTA="$PASTA" REPO="$REPO" node --input-type=module <<'NODE' || SAIDA=$?
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { LOTE, PROVA, CI_LOCAL, VERSAO, DOMINIO, PASTA, REPO } = process.env;
const versao = JSON.parse(VERSAO);
if (!/^[0-9a-f]{40}$/.test(versao.commit ?? "")) throw new Error("o domínio não informou o commit inteiro em /saude/versao");
const fonte = join(PASTA, "publicacoes.jsonl");
const linhas = existsSync(fonte) ? readFileSync(fonte, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const anterior = linhas.at(-1)?.commit ?? null;
const git = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8" }).trim();
// As migrations do aplicativo que entraram entre o registro anterior e este commit (sem as reversões).
const migrations = anterior === null || anterior === versao.commit ? [] : git("diff", "--name-only", "--diff-filter=A", `${anterior}..${versao.commit}`, "--", "packages/banco/supabase/migrations")
  .split("\n").filter(Boolean).map((c) => c.split("/").at(-1).replace(/\.sql$/, ""));
const repositorio = git("remote", "get-url", "origin").replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
const nova = {
  registrado_em: new Date().toISOString(), lote: LOTE, commit: versao.commit, build: versao.build ?? null, ambiente: versao.ambiente ?? null,
  dominio: DOMINIO, ci_local: CI_LOCAL || null, migrations, prova: PROVA,
  checks_do_github: `https://github.com/${repositorio}/commit/${versao.commit}/checks`,
};
if (linhas.some((l) => l.commit === nova.commit && l.lote === nova.lote && l.prova === nova.prova)) {
  console.log("Esta publicação já está registrada com este lote e esta prova: nada a gravar.");
  process.exit(3);
}
linhas.push(nova);
if (process.env.ORA_REGISTRO_SO_MOSTRAR === "1") {
  console.log(JSON.stringify(nova, null, 2));
  process.exit(3);
}
writeFileSync(fonte, `${linhas.map((l) => JSON.stringify(l)).join("\n")}\n`);
const emBrasilia = (iso) => iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "") : "—";
const celula = (t) => String(t).replace(/\|/g, "/").replace(/\s+/g, " ");
const tabela = linhas.toReversed().map((l) => `| ${emBrasilia(l.registrado_em)} | ${celula(l.lote)} | \`${l.commit.slice(0, 7)}\` | ${emBrasilia(l.build)} | ${celula(l.ambiente ?? "—")} | ${l.ci_local ? `\`${l.ci_local.slice(0, 7)}\`` : "—"} | ${l.migrations.length ? l.migrations.map((m) => `\`${m}\``).join(", ") : "nenhuma"} | ${celula(l.prova)} | [checks](${l.checks_do_github}) |`);
writeFileSync(join(PASTA, "PUBLICACOES.md"), [
  "# Registro das publicações (homologação `ora5g.com.br`)",
  "",
  "Cada linha é uma publicação **conferida depois de feita**: a pasta ativa, o serviço local e o domínio servindo o mesmo commit (o `conferir-publicacao.sh`), com a build e o ambiente lidos em `/saude/versao`. A linha é gravada por `deploy/homologacao/registrar-publicacao.sh`, fora dos commits do aplicativo, para o registro não ficar um lote atrás (achados F18-04 e F21-03 do Codex).",
  "",
  "O que está no ar **agora** é sempre o que <https://ora5g.com.br/saude/versao> responde. Publicado não é homologado: o aceite de cada lote fica em `docs/aceite/` na `main`. As publicações anteriores a este registro estão em `docs/alinhamento/EXECUCAO_INTEGRAL_STATUS.md` na `main`.",
  "",
  "| Registrado em (Brasília) | Lote | Commit no ar | Build (Brasília) | Ambiente | CI local em | Migrations desde o registro anterior | Prova funcional no domínio | GitHub |",
  "|---|---|---|---|---|---|---|---|---|",
  ...tabela,
  "",
].join("\n"));
console.log(JSON.stringify(nova, null, 2));
NODE
[ "$SAIDA" -ne 3 ] || exit 0
[ "$SAIDA" -eq 0 ] || { echo "Não deu para montar o registro (saída $SAIDA): nada foi gravado."; exit "$SAIDA"; }

# 4. Grava e envia (a branch do registro não passa pelo CI nem é publicada).
git -C "$PASTA" add PUBLICACOES.md publicacoes.jsonl
git -C "$PASTA" commit -q -m "registro: $LOTE publicado e conferido no domínio"
git -C "$PASTA" push -q origin "HEAD:refs/heads/$BRANCH"
echo "Registrado na branch $BRANCH (PUBLICACOES.md)."

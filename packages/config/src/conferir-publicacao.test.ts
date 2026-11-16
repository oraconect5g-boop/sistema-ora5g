// #99 (diagnóstico de 15/11/2026): o conferidor da publicação reprova quando o serviço ou o domínio não servem a versão
// esperada. A prova do Codex (PR #97, docs/analises/evidencias/2026-11-15-publicacao/verificador-publicacao.test.ts)
// mostrava "Tudo publicado" com o serviço respondendo um commit antigo ou fora do ar; aqui ela vira regressão do
// comportamento certo. Git e curl SIMULADOS numa pasta temporária; nada toca a homologação real.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../../deploy/homologacao/conferir-publicacao.sh", import.meta.url));
const NOVO = "a".repeat(7) + "1".repeat(33);
const ANTIGO = "b".repeat(7) + "2".repeat(33);
let raiz = "";
afterEach(() => { if (raiz) rmSync(raiz, { recursive: true, force: true }); });

const identidade = (commit: string, ambiente = "homologacao") => JSON.stringify({ commit, versao: "0.1.0", build: "2026-11-16T09:46:00.000Z", ambiente });
function conferir(cenario: { pasta: string; main: string; local?: string; dominio?: string; esperado?: string }) {
  raiz = mkdtempSync(join(tmpdir(), "ora-conferir-"));
  for (const pasta of ["base", "versao"]) mkdirSync(join(raiz, pasta));
  symlinkSync(join(raiz, "versao"), join(raiz, "base/plataforma"), "dir");
  // Git e curl simulados como funções do bash exportadas (valem no script chamado e não dependem de executar arquivos
  // da pasta temporária, que em alguns servidores não permite execução).
  const simuladores = `git() {
  case "$*" in
    *"rev-parse HEAD"*) echo "$MOCK_PASTA" ;;
    *fetch*) return 0 ;;
    *"rev-parse origin/main"*) echo "$MOCK_MAIN" ;;
    *"rev-parse --verify"*)
      for c in "$MOCK_PASTA" "$MOCK_MAIN"; do case "$*" in *"--verify $(echo "$c" | cut -c1-7)"*) echo "$c"; return 0 ;; esac; done
      return 128 ;;
    *log*) echo "aaaaaaa commit que falta publicar" ;;
    *) return 1 ;;
  esac
}
curl() {
  local url=""
  for a in "$@"; do url="$a"; done
  case "$url" in
    http://127.0.0.1*) [ -n "$MOCK_LOCAL" ] || return 7; printf '%s' "$MOCK_LOCAL" ;;
    *) [ -n "$MOCK_DOMINIO" ] || return 7; printf '%s' "$MOCK_DOMINIO" ;;
  esac
}
export -f git curl
`;
  writeFileSync(join(raiz, "simuladores.sh"), simuladores);
  const r = spawnSync("bash", ["-c", 'source "$1"; exec bash "$2"', "_", join(raiz, "simuladores.sh"), SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env, HOME: raiz,
      ORA_HML_BASE: join(raiz, "base"), ORA_REPO_DIR: join(raiz, "repo"), ORA_HML_PORTA: "3190", ORA_HML_DOMINIO: "https://dominio.invalid",
      MOCK_PASTA: cenario.pasta, MOCK_MAIN: cenario.main, MOCK_LOCAL: cenario.local ?? "", MOCK_DOMINIO: cenario.dominio ?? "",
      ...(cenario.esperado ? { ORA_SHA_ESPERADO: cenario.esperado } : {}),
    },
  });
  return { codigo: r.status, saida: r.stdout + r.stderr };
}

describe("o conferidor da publicação (#99)", () => {
  it("a pasta, o serviço local e o domínio com a main inteira e o ambiente certo: aprova", () => {
    const r = conferir({ pasta: NOVO, main: NOVO, local: identidade(NOVO), dominio: identidade(NOVO) });
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).toContain("Tudo publicado");
  });

  it("as provas do Codex: o serviço responde um commit antigo ou está fora do ar — reprova (antes dizia \"Tudo publicado\")", () => {
    for (const local of [identidade(ANTIGO), ""]) {
      const r = conferir({ pasta: NOVO, main: NOVO, local, dominio: identidade(NOVO) });
      expect(r.codigo, r.saida).toBe(1);
      expect(r.saida).not.toContain("Tudo publicado");
      expect(r.saida).toMatch(local ? /Serviço local serve bbbbbbb, não aaaaaaa/ : /Serviço local .* não respondeu/);
    }
  });

  it("o serviço local certo e o domínio com a build antiga, fora do ar, sem o commit inteiro ou em outro ambiente: reprova", () => {
    for (const [dominio, motivo] of [
      [identidade(ANTIGO), /Domínio serve bbbbbbb/], ["", /Domínio .* não respondeu/], [identidade("aaaaaaa"), /Domínio respondeu sem o commit inteiro/],
      [identidade(NOVO, "producao"), /Domínio está no ambiente "producao"/], ["<html>página de erro</html>", /Domínio respondeu sem o commit inteiro/],
    ] as const) {
      const r = conferir({ pasta: NOVO, main: NOVO, local: identidade(NOVO), dominio });
      expect(r.codigo, `${dominio}\n${r.saida}`).toBe(1);
      expect(r.saida).toMatch(motivo);
    }
  });

  it("a main à frente do que está no ar: reprova e lista o que falta; a reversão declarada para o commit no ar aprova", () => {
    const atrasada = conferir({ pasta: ANTIGO, main: NOVO, local: identidade(ANTIGO), dominio: identidade(ANTIGO) });
    expect(atrasada.codigo, atrasada.saida).toBe(1);
    expect(atrasada.saida).toContain("a pasta ativa (bbbbbbb) não é a versão esperada (aaaaaaa)");
    expect(atrasada.saida).toContain("commit que falta publicar");
    const reversao = conferir({ pasta: ANTIGO, main: NOVO, local: identidade(ANTIGO), dominio: identidade(ANTIGO), esperado: "bbbbbbb" });
    expect(reversao.codigo, reversao.saida).toBe(0);
    expect(reversao.saida).toContain("Reversão conferida");
    const declaradaErrada = conferir({ pasta: ANTIGO, main: NOVO, local: identidade(ANTIGO), dominio: identidade(ANTIGO), esperado: "c".repeat(7) });
    expect(declaradaErrada.codigo).toBe(1);
    expect(declaradaErrada.saida).toContain("não existe no repositório");
  });
});

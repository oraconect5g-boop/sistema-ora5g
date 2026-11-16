#!/usr/bin/env bash
# Publica na HOMOLOGAÇÃO uma versão do GitHub (padrão: origin/main) sem derrubar a que está no ar
# se algo der errado (REV-012):
#   1. monta a versão nova numa pasta própria (~/homologacao/versoes/<commit>-<configuração>):
#      npm ci + build; se falhar, a versão atual continua no ar e nada muda;
#   2. troca o link ~/homologacao/plataforma para a versão nova e reinicia;
#   3. se a nova não responder em /saude com o commit dela (/saude/versao, #99), volta o link para a anterior e
#      reinicia a anterior;
#   4. confere a pasta, o serviço local e o domínio público com conferir-publicacao.sh (o mesmo commit inteiro e o
#      ambiente): se o domínio não servir a versão nova, a publicação reprova (o serviço local fica, o Apache é conferido à parte).
#
# Identidade da versão (REV-016): commit + impressão digital (sha256) do arquivo de ambiente.
# Mudou o arquivo, monta de novo, mesmo no mesmo commit: variáveis NEXT_PUBLIC_* e páginas
# estáticas ficam gravadas na build, então build e configuração só valem juntas. Cada pasta
# guarda a SUA cópia do ambiente; voltar para a anterior volta código e configuração juntos.
# Os valores nunca são exibidos; só a impressão digital curta.
#
# Roda no servidor como o usuário dev. Não toca em produção.
# Uso: deploy/homologacao/publicar.sh [referência git]
# Teste isolado, sem tocar na homologação real: ORA_HML_BASE=<outra pasta> ORA_HML_PORTA=<outra porta>
# (sempre as duas juntas) e, se quiser, ORA_REPO_DIR=<outro clone>.
set -euo pipefail

REF="${1:-origin/main}"
REPO="${ORA_REPO_DIR:-$HOME/sistema-ora5g}"
BASE="${ORA_HML_BASE:-$HOME/homologacao}"
PORTA="${ORA_HML_PORTA:-3100}"
REAL="$HOME/homologacao"
if { [ "$BASE" = "$REAL" ] && [ "$PORTA" != 3100 ]; } || { [ "$BASE" != "$REAL" ] && [ "$PORTA" = 3100 ]; }; then
  echo "ORA_HML_BASE e ORA_HML_PORTA mudam juntas (teste isolado) ou nenhuma (homologação real)."
  exit 1
fi
LINK="$BASE/plataforma"
VERSOES="$BASE/versoes"
ENV_HML="$BASE/plataforma.env"
LOGS="$BASE/logs"
GUARDAR=3
mkdir -p "$VERSOES" "$LOGS"

exec 9>"$BASE/.trava-publicacao"
flock -n 9 || { echo "Outra publicação está em andamento."; exit 1; }
[ -f "$ENV_HML" ] || { echo "Falta $ENV_HML (variáveis da homologação, permissão 600)."; exit 1; }

export PATH="$HOME/.local/bin:$PATH" NODE_OPTIONS="--dns-result-order=ipv4first" NEXT_TELEMETRY_DISABLED=1
export ORA_PUBLICANDO=1 ORA_HML_BASE="$BASE" ORA_HML_PORTA="$PORTA"

# Retrato do arquivo de ambiente: a impressão digital e a cópia instalada saem do MESMO conteúdo,
# ainda que o arquivo de origem seja editado durante a publicação.
RETRATO="$BASE/.ambiente-em-publicacao"
install -m 600 "$ENV_HML" "$RETRATO"
# ADR-002 §2.5 e REV-052 (#55): o aplicativo web, que atende as requisições das pessoas, recebe só
# as variáveis da lista de permissão de ambiente-web.sh; segredos (Supabase, banco, Nogle e futuros)
# ficam só na cópia completa do worker (apps/worker).
RETRATO_WEB="$BASE/.ambiente-web-em-publicacao"
bash "$(dirname "$0")/ambiente-web.sh" "$RETRATO" "$RETRATO_WEB"
trap 'rm -f "$RETRATO" "$RETRATO_WEB"' EXIT
CONFIG="$(sha256sum "$RETRATO" | cut -c1-12)"

git -C "$REPO" fetch -q origin
SHA="$(git -C "$REPO" rev-parse --verify "$REF^{commit}")"
CURTO="${SHA:0:7}"
NOVA="$VERSOES/$CURTO-$CONFIG"
ATIVA="$(readlink -f "$LINK" 2>/dev/null || true)"
echo "Versão $CURTO, configuração $CONFIG (impressão digital do arquivo de ambiente; valores não são exibidos)."

no_ar() { curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1:$PORTA/saude"; }
# #99: responder não basta; o serviço precisa servir ESTE commit (inteiro), lido em /saude/versao.
serve_esta_versao() {
  local commit
  commit="$(curl -fsS --max-time 10 "http://127.0.0.1:$PORTA/saude/versao" 2>/dev/null | node -e 'let d="";process.stdin.on("data",(c)=>{d+=c}).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).commit??""))}catch{}})' || true)"
  [ "$commit" = "$SHA" ]
}
# No teste isolado o domínio público não é conferido (ele serve a homologação real).
if [ "$BASE" != "$REAL" ]; then export ORA_HML_DOMINIO="${ORA_HML_DOMINIO:-nenhum}"; fi
# Mesma combinação já montada: build completa, mesmo commit e a mesma cópia do ambiente.
pronta() {
  [ -f "$1/apps/plataforma/.next/BUILD_ID" ] && [ "$(git -C "$1" rev-parse HEAD 2>/dev/null)" = "$SHA" ] &&
    cmp -s "$1/apps/plataforma/.env.local" "$RETRATO_WEB" &&
    { [ ! -d "$1/apps/worker" ] || cmp -s "$1/apps/worker/.env.local" "$RETRATO"; }
}
# Em teste isolado, o garantir-no-ar.sh da versão precisa conhecer ORA_HML_BASE/ORA_HML_PORTA:
# um antigo pararia e reiniciaria a homologação real (porta 3100).
script_seguro() { [ "$BASE" = "$REAL" ] || grep -q 'ORA_HML_PORTA' "$1/deploy/homologacao/garantir-no-ar.sh"; }

if [ "$NOVA" = "$ATIVA" ] && pronta "$NOVA" && no_ar && serve_esta_versao; then
  echo "A versão $CURTO com esta configuração já está no ar; nada a fazer."
  exit 0
fi

# 1. Monta a versão nova fora da cópia em uso.
if pronta "$NOVA"; then
  echo "Versão $CURTO com esta configuração já montada; reaproveitando."
else
  if [ "$NOVA" = "$ATIVA" ]; then
    echo "A pasta da versão no ar ($(basename "$NOVA")) não corresponde ao commit e à configuração; nada mudou. Confira à mão."
    exit 1
  fi
  if [ -e "$NOVA" ]; then git -C "$REPO" worktree remove --force "$NOVA" 2>/dev/null || rm -rf "$NOVA"; fi
  git -C "$REPO" worktree prune
  git -C "$REPO" worktree add -q --detach "$NOVA" "$SHA"
  install -m 600 "$RETRATO_WEB" "$NOVA/apps/plataforma/.env.local"
  if [ -d "$NOVA/apps/worker" ]; then install -m 600 "$RETRATO" "$NOVA/apps/worker/.env.local"; fi
  echo "Montando $CURTO ($REF)..."
  # Ambiente limpo: a build lê a configuração só do arquivo instalado, nunca do terminal de quem
  # publica (um APP_ENV ou NEXT_PUBLIC_* exportado ali iria para a build sem mudar a identidade).
  if ! (cd "$NOVA" && env -i HOME="$HOME" PATH="$PATH" NODE_OPTIONS="$NODE_OPTIONS" NEXT_TELEMETRY_DISABLED=1 \
    sh -c 'npm ci --no-audit --no-fund >"$1/publicar-npm.log" 2>&1 && npm run build -w @ora5g/plataforma >"$1/publicar-build.log" 2>&1' _ "$LOGS"); then
    echo "FALHOU ao montar $CURTO (veja $LOGS/publicar-npm.log e publicar-build.log). A versão no ar não mudou."
    git -C "$REPO" worktree remove --force "$NOVA" 2>/dev/null || rm -rf "$NOVA"
    exit 1
  fi
fi
if ! script_seguro "$NOVA"; then
  echo "O commit $CURTO não conhece ORA_HML_BASE/ORA_HML_PORTA; em teste isolado ele mexeria na homologação real. Nada mudou."
  exit 1
fi

# 2. Troca e reinicia. (Só agora mexe na versão em uso: a montagem acima não a afeta.)
"$NOVA/deploy/homologacao/garantir-no-ar.sh" --parar
# Layout antigo (pasta única, antes do REV-012): vira uma versão guardada para poder voltar a ela.
if [ -d "$LINK" ] && [ ! -L "$LINK" ]; then
  ANTIGA="$VERSOES/$(git -C "$LINK" rev-parse --short=7 HEAD)-antiga"
  git -C "$REPO" worktree move "$LINK" "$ANTIGA"
  ln -sfn "$ANTIGA" "$LINK"
fi
ANTERIOR="$(readlink -f "$LINK" 2>/dev/null || true)"
ln -sfn "$NOVA" "$LINK.novo" && mv -T "$LINK.novo" "$LINK"
if "$LINK/deploy/homologacao/garantir-no-ar.sh" --reiniciar && no_ar && serve_esta_versao; then
  touch "$NOVA" # a lista de versões antigas abaixo ordena pelas usadas por último
  echo "Homologação no ar em 127.0.0.1:$PORTA com a versão $CURTO, configuração $CONFIG."
else
  # 3. Volta para a anterior: código e configuração dela, que ficam na própria pasta.
  echo "A versão $CURTO não subiu ou não serve o commit $CURTO em /saude/versao (veja $LOGS/plataforma.log)."
  if [ -n "$ANTERIOR" ] && [ -d "$ANTERIOR" ] && [ "$ANTERIOR" != "$NOVA" ] && script_seguro "$ANTERIOR"; then
    "$NOVA/deploy/homologacao/garantir-no-ar.sh" --parar || true
    ln -sfn "$ANTERIOR" "$LINK.novo" && mv -T "$LINK.novo" "$LINK"
    "$LINK/deploy/homologacao/garantir-no-ar.sh" --reiniciar && echo "Voltou para a versão anterior: $(basename "$ANTERIOR")."
  fi
  exit 1
fi

# 4. A conferência completa (#99): a pasta, o serviço local e o domínio com o mesmo commit inteiro e o ambiente.
if ! ORA_SHA_ESPERADO="$SHA" ORA_REPO_DIR="$REPO" ORA_HML_BASE="$BASE" ORA_HML_PORTA="$PORTA" bash "$(dirname "$0")/conferir-publicacao.sh"; then
  echo "A versão $CURTO está no ar no serviço local, mas a conferência completa reprovou (veja acima; o domínio passa pelo Apache)."
  exit 1
fi

# Versões antigas NÃO são apagadas sozinhas (pedido do proprietário em 10/11/2026: nada é apagado do
# servidor sem perguntar antes). Só lista as que passam das últimas $GUARDAR e diz como apagar uma,
# depois da autorização. Cada pasta tem ~1,2 GB (código, dependências e build); o disco é conferido à parte.
ATUAL="$(readlink -f "$LINK")"
ANTIGAS="$(ls -1dt "$VERSOES"/*/ 2>/dev/null | sed 's#/$##' | tail -n +$((GUARDAR + 1)) | grep -v -x -F "$ATUAL" || true)"
if [ -n "$ANTIGAS" ]; then
  echo "Versões antigas guardadas (apagar só com autorização do proprietário):"
  echo "$ANTIGAS" | sed 's#^#  #'
  echo "Para apagar uma, depois de autorizado: git -C \"$REPO\" worktree remove --force <pasta>"
fi

#!/usr/bin/env bash
# Worker da Ora Connect (ADR-005). NÃO está agendado: só entra na rotina depois das credenciais da
# Nogle no ambiente do worker, da resposta da P9 e da homologação com linha de teste da Nogle,
# com a autorização do proprietário. Quando autorizado:
#   * * * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-connect.sh
#   15 6 * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-connect.sh --listas
# Usa a versão no ar e a cópia COMPLETA do ambiente que só o worker recebe (apps/worker/.env.local).
# Uma execução por vez; ambiente limpo; log só com contagens (nada de CPF, linha, chave ou token).
set -euo pipefail
BASE="${ORA_HML_BASE:-$HOME/homologacao}"
VERSAO="$BASE/plataforma"
LOGS="$BASE/logs"
mkdir -p "$LOGS"
exec 9>"$BASE/.trava-worker-connect"
flock -n 9 || exit 0
[ -f "$VERSAO/apps/worker/src/executar-connect.ts" ] || exit 0
cd "$VERSAO"
env -i HOME="$HOME" PATH="$HOME/.local/bin:$PATH" NODE_OPTIONS="--dns-result-order=ipv4first" \
  ORA_PASTA_AMBIENTE="$VERSAO/apps/worker" node apps/worker/src/executar-connect.ts "$@" >>"$LOGS/worker-connect.log" 2>&1 8>&- 9>&- || true

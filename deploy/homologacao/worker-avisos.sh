#!/usr/bin/env bash
# Worker dos avisos no celular (lote PWA-b; ADR-014). Agendado desde 17/11/2026 (16:32), com a autorização do
# proprietário, no crontab do usuário dev:
#   * * * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-avisos.sh
# Usa a versão no ar e a cópia COMPLETA do ambiente que só o worker recebe (apps/worker/.env.local). Não precisa da chave
# secreta do Supabase: lê a fila com a chave pública e o segredo dos avisos, que só abre a fila deles. Sem alguma chave,
# ele diz o que falta e termina sem erro; nada sai da fila. Uma execução por vez; ambiente limpo; log só com contagens
# (nada de endereço de celular, chave ou texto do aviso).
set -euo pipefail
BASE="${ORA_HML_BASE:-$HOME/homologacao}"
VERSAO="$BASE/plataforma"
LOGS="$BASE/logs"
mkdir -p "$LOGS"
exec 9>"$BASE/.trava-worker-avisos"
flock -n 9 || exit 0
[ -f "$VERSAO/apps/worker/src/executar-avisos.ts" ] || exit 0
cd "$VERSAO"
env -i HOME="$HOME" PATH="$HOME/.local/bin:$PATH" NODE_OPTIONS="--dns-result-order=ipv4first" \
  ORA_PASTA_AMBIENTE="$VERSAO/apps/worker" node apps/worker/src/executar-avisos.ts "$@" >>"$LOGS/worker-avisos.log" 2>&1 8>&- 9>&- || true

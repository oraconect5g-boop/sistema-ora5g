#!/usr/bin/env bash
# Worker do WhatsApp oficial (K1c; lote WHATS-a). NÃO está agendado: só entra na rotina depois da habilitação na Meta
# (número, token de Usuário do Sistema e modelo de mensagem de utilidade aprovado), do adaptador oficial com o contrato
# verificado e da autorização do proprietário. Quando autorizado:
#   * * * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-whatsapp.sh
# Usa a versão no ar e a cópia COMPLETA do ambiente que só o worker recebe (apps/worker/.env.local). Sem credencial,
# ele diz o que falta e termina sem erro; nada sai da fila. Uma execução por vez; ambiente limpo; log só com contagens
# (nada de telefone, nome, link ou token).
set -euo pipefail
BASE="${ORA_HML_BASE:-$HOME/homologacao}"
VERSAO="$BASE/plataforma"
LOGS="$BASE/logs"
mkdir -p "$LOGS"
exec 9>"$BASE/.trava-worker-whatsapp"
flock -n 9 || exit 0
[ -f "$VERSAO/apps/worker/src/executar-whatsapp.ts" ] || exit 0
cd "$VERSAO"
env -i HOME="$HOME" PATH="$HOME/.local/bin:$PATH" NODE_OPTIONS="--dns-result-order=ipv4first" \
  ORA_PASTA_AMBIENTE="$VERSAO/apps/worker" node apps/worker/src/executar-whatsapp.ts "$@" >>"$LOGS/worker-whatsapp.log" 2>&1 8>&- 9>&- || true

#!/usr/bin/env bash
# Contrato de configuração do aplicativo WEB (REV-052, #55). O web recebe SÓ o que ele lê: as
# variáveis da aplicação e as públicas do Next (NEXT_PUBLIC_*, que vão ao navegador por definição).
# Todo o resto fica só com o worker: chave secreta e banco do Supabase, credenciais da Nogle e
# qualquer chave futura (fiscal, WhatsApp, pagamentos). Lista de PERMISSÃO, não de bloqueio:
# variável nova nunca chega ao web por esquecimento. Valores nunca são exibidos.
# Uso: ambiente-web.sh <arquivo completo> <arquivo do web>
set -euo pipefail
[ "$#" -eq 2 ] || { echo "uso: ambiente-web.sh <arquivo completo> <arquivo do web>" >&2; exit 2; }
# LOJA_ONLINE_ORGANIZACAO (ONLINE-a): o id da organização que a vitrine pública mostra; não é segredo.
PERMITIDAS='APP_ENV|APP_TIMEZONE|APP_DEFAULT_CURRENCY|LOJA_ONLINE_ORGANIZACAO|NEXT_PUBLIC_[A-Z0-9_]+'
install -m 600 /dev/null "$2"
grep -E "^[[:space:]]*(export[[:space:]]+)?(${PERMITIDAS})[[:space:]]*=" "$1" >"$2" || true

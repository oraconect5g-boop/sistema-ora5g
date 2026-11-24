#!/usr/bin/env bash
# Worker dos pagamentos pelo site pela Asaas (lote PAY-014a; ADR-025). AINDA NÃO AGENDADO: entra no crontab do usuário dev
# só com o sim do proprietário, depois de a chave de teste (sandbox) ser gravada pelo comando da lista única e de o
# PAY-014b (o "pago pelo site" no balcão) estar no ar:
#   * * * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-pagamentos.sh
# Usa a versão no ar e a cópia COMPLETA do ambiente que só o worker recebe (apps/worker/.env.local): a chave secreta do
# Supabase e a da Asaas ficam só aqui (o site não recebe nenhuma das duas). Na primeira rodada, registra o aviso
# (webhook) na Asaas com um token que ele mesmo gera: o banco guarda só a impressão digital; o token não aparece em lugar
# nenhum. Sem alguma chave, diz o que falta e termina sem erro; nada sai do banco. Uma execução por vez; ambiente limpo;
# log só com contagens (nada de link, valor, token ou chave).
set -euo pipefail
BASE="${ORA_HML_BASE:-$HOME/homologacao}"
VERSAO="$BASE/plataforma"
LOGS="$BASE/logs"
mkdir -p "$LOGS"
exec 9>"$BASE/.trava-worker-pagamentos"
flock -n 9 || exit 0
[ -f "$VERSAO/apps/worker/src/executar-pagamentos.ts" ] || exit 0
cd "$VERSAO"
env -i HOME="$HOME" PATH="$HOME/.local/bin:$PATH" NODE_OPTIONS="--dns-result-order=ipv4first" \
  ORA_PASTA_AMBIENTE="$VERSAO/apps/worker" \
  node apps/worker/src/executar-pagamentos.ts "$@" >>"$LOGS/worker-pagamentos.log" 2>&1 8>&- 9>&- || true

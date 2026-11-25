#!/usr/bin/env bash
# Worker da Ora Connect (ADR-005). As OPERAÇÕES (ativação, recarga e portabilidade) foram ligadas pelo proprietário em
# 25/11/2026 ("Sim, ligue"; a primeira de cada uma acompanhada), com NOGLE_OPERACOES_HABILITADAS e a habilitação de cada
# tipo no banco; a cada minuto:
#   * * * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-connect.sh
# A LEITURA do estoque de chips (CONNECT-d; só leitura, com o sim do proprietário de 24/11/2026: D-056) já está agendada,
# a cada 30 minutos, das 7h às 22h:
#   */30 7-21 * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-connect.sh --estoque
#   0 22 * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-connect.sh --estoque
# A TRANSFERÊNCIA de chips pedida pelo dono (CONNECT-e; D-057), a cada minuto, só com NOGLE_TRANSFERENCIAS=habilitada:
#   * * * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-connect.sh --transferencias
# As listas oficiais (planos, DDDs, operadoras e cidades), uma vez por dia; com os planos em dia, o caixa vende cada plano
# pelo valor de face (CONNECT-f):
#   0 6 * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-connect.sh --listas
# As AÇÕES que mudam algo na Nogle, pedidas pelo dono e pelos gerentes (CONNECT-j; a D-061), a cada minuto, só com
# NOGLE_ACOES=habilitada; cada uma sai uma vez:
#   * * * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-connect.sh --acoes
# As CONSULTAS que só leem, pedidas na tela (a linha, o chip e a carteira; CONNECT-g, a D-056), uns 50 segundos a cada
# minuto, com a trava própria (não seguram as outras rotinas):
#   * * * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-connect.sh --consultas
# Usa a versão no ar e a cópia COMPLETA do ambiente que só o worker recebe (apps/worker/.env.local).
# Uma execução por vez: a seguinte ESPERA a anterior terminar (até 50 s) em vez de desistir; antes (até 25/11), a leitura
# do estoque das :00 e :30 se perdia quando a fila das transferências, que roda a cada minuto, pegava a trava primeiro.
# Ambiente limpo; log só com contagens (nada de CPF, linha, chave ou token).
set -euo pipefail
BASE="${ORA_HML_BASE:-$HOME/homologacao}"
VERSAO="$BASE/plataforma"
LOGS="$BASE/logs"
mkdir -p "$LOGS"
TRAVA="$BASE/.trava-worker-connect"
ESPERA=50
if [ "${1:-}" = "--consultas" ]; then TRAVA="$BASE/.trava-worker-connect-consultas"; ESPERA=15; fi
exec 9>"$TRAVA"
flock -w "$ESPERA" 9 || exit 0
[ -f "$VERSAO/apps/worker/src/executar-connect.ts" ] || exit 0
cd "$VERSAO"
env -i HOME="$HOME" PATH="$HOME/.local/bin:$PATH" NODE_OPTIONS="--dns-result-order=ipv4first" \
  ORA_PASTA_AMBIENTE="$VERSAO/apps/worker" node apps/worker/src/executar-connect.ts "$@" >>"$LOGS/worker-connect.log" 2>&1 8>&- 9>&- || true

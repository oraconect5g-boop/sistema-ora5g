#!/usr/bin/env bash
# Worker de identidade (convites e bloqueios no Auth), chamado pela rotina agendada a cada minuto:
#   * * * * * bash $HOME/homologacao/plataforma/deploy/homologacao/worker-identidade.sh
# Usa a versão no ar (~/homologacao/plataforma) e a cópia COMPLETA do ambiente que só o worker
# recebe (apps/worker/.env.local, com a chave secreta). Uma execução por vez; ambiente limpo;
# o log tem só contagens e códigos de erro (nada de e-mail, nome ou chave).
set -euo pipefail
BASE="${ORA_HML_BASE:-$HOME/homologacao}"
VERSAO="$BASE/plataforma"
LOGS="$BASE/logs"
mkdir -p "$LOGS"
exec 9>"$BASE/.trava-worker-identidade"
flock -n 9 || exit 0
[ -f "$VERSAO/apps/worker/src/executar-identidade.ts" ] || exit 0
cd "$VERSAO"
env -i HOME="$HOME" PATH="$HOME/.local/bin:$PATH" NODE_OPTIONS="--dns-result-order=ipv4first" \
  ORA_PASTA_AMBIENTE="$VERSAO/apps/worker" node apps/worker/src/executar-identidade.ts >>"$LOGS/worker-identidade.log" 2>&1 8>&- 9>&- || true

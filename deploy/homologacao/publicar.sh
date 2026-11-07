#!/usr/bin/env bash
# Publica na HOMOLOGAÇÃO a versão atual da main do GitHub e reinicia o serviço.
# Roda no servidor como o usuário dev. Não toca em produção.
# Uso: deploy/homologacao/publicar.sh [referência git, padrão origin/main]
set -euo pipefail

REF="${1:-origin/main}"
REPO="${ORA_REPO_DIR:-$HOME/sistema-ora5g}"
BASE="$HOME/homologacao"
DIR="$BASE/plataforma"
ENV_HML="$BASE/plataforma.env"
mkdir -p "$BASE/logs"

exec 9>"$BASE/.trava-publicacao"
flock -n 9 || { echo "Outra publicação está em andamento."; exit 1; }

[ -f "$ENV_HML" ] || { echo "Falta $ENV_HML (variáveis da homologação, permissão 600)."; exit 1; }

export PATH="$HOME/.local/bin:$PATH" NODE_OPTIONS="--dns-result-order=ipv4first" NEXT_TELEMETRY_DISABLED=1

git -C "$REPO" fetch -q origin
if [ -d "$DIR/.git" ] || [ -f "$DIR/.git" ]; then
  git -C "$DIR" checkout -q --detach "$REF"
else
  git -C "$REPO" worktree add -q --detach "$DIR" "$REF"
fi
VERSAO="$(git -C "$DIR" rev-parse --short HEAD)"
echo "Publicando $VERSAO ($REF)..."

install -m 600 "$ENV_HML" "$DIR/apps/plataforma/.env.local"
cd "$DIR"
npm ci --no-audit --no-fund >"$BASE/logs/publicar-npm.log" 2>&1
ORA_PUBLICANDO=1 "$DIR/deploy/homologacao/garantir-no-ar.sh" --parar
npm run build -w @ora5g/plataforma >"$BASE/logs/publicar-build.log" 2>&1
ORA_PUBLICANDO=1 "$DIR/deploy/homologacao/garantir-no-ar.sh" --reiniciar

curl -fsS --max-time 10 http://127.0.0.1:3100/saude >/dev/null
echo "Homologação no ar em 127.0.0.1:3100 com a versão $VERSAO."

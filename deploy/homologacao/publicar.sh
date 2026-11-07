#!/usr/bin/env bash
# Publica na HOMOLOGAÇÃO uma versão do GitHub (padrão: origin/main) sem derrubar a que está no ar
# se algo der errado (REV-012):
#   1. monta a versão nova numa pasta própria (~/homologacao/versoes/<commit>): npm ci + build;
#      se falhar, a versão atual continua no ar e nada muda;
#   2. troca o link ~/homologacao/plataforma para a versão nova e reinicia;
#   3. se a nova não responder em /saude, volta o link para a anterior e reinicia a anterior.
# Roda no servidor como o usuário dev. Não toca em produção.
# Uso: deploy/homologacao/publicar.sh [referência git]
set -euo pipefail

REF="${1:-origin/main}"
REPO="${ORA_REPO_DIR:-$HOME/sistema-ora5g}"
BASE="$HOME/homologacao"
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
export ORA_PUBLICANDO=1

git -C "$REPO" fetch -q origin
SHA="$(git -C "$REPO" rev-parse --verify "$REF^{commit}")"
CURTO="${SHA:0:7}"
NOVA="$VERSOES/$CURTO"

# 1. Monta a versão nova fora da cópia em uso.
if [ -f "$NOVA/apps/plataforma/.next/BUILD_ID" ] && [ "$(git -C "$NOVA" rev-parse HEAD)" = "$SHA" ]; then
  echo "Versão $CURTO já montada; reaproveitando."
else
  if [ -e "$NOVA" ]; then git -C "$REPO" worktree remove --force "$NOVA" 2>/dev/null || rm -rf "$NOVA"; fi
  git -C "$REPO" worktree prune
  git -C "$REPO" worktree add -q --detach "$NOVA" "$SHA"
  install -m 600 "$ENV_HML" "$NOVA/apps/plataforma/.env.local"
  echo "Montando $CURTO ($REF)..."
  if ! (cd "$NOVA" && npm ci --no-audit --no-fund >"$LOGS/publicar-npm.log" 2>&1 && npm run build -w @ora5g/plataforma >"$LOGS/publicar-build.log" 2>&1); then
    echo "FALHOU ao montar $CURTO (veja $LOGS/publicar-npm.log e publicar-build.log). A versão no ar não mudou."
    git -C "$REPO" worktree remove --force "$NOVA" 2>/dev/null || rm -rf "$NOVA"
    exit 1
  fi
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
if "$LINK/deploy/homologacao/garantir-no-ar.sh" --reiniciar && curl -fsS --max-time 10 -o /dev/null http://127.0.0.1:3100/saude; then
  echo "Homologação no ar em 127.0.0.1:3100 com a versão $CURTO."
else
  # 3. Volta para a anterior.
  echo "A versão $CURTO não subiu (veja $LOGS/plataforma.log)."
  if [ -n "$ANTERIOR" ] && [ -d "$ANTERIOR" ] && [ "$ANTERIOR" != "$NOVA" ]; then
    "$NOVA/deploy/homologacao/garantir-no-ar.sh" --parar || true
    ln -sfn "$ANTERIOR" "$LINK.novo" && mv -T "$LINK.novo" "$LINK"
    "$LINK/deploy/homologacao/garantir-no-ar.sh" --reiniciar && echo "Voltou para a versão anterior: $(basename "$ANTERIOR")."
  fi
  exit 1
fi

# Guarda só as últimas versões (a atual e as anteriores mais recentes).
ATUAL="$(readlink -f "$LINK")"
ls -1dt "$VERSOES"/*/ 2>/dev/null | sed 's#/$##' | tail -n +$((GUARDAR + 1)) | while read -r velha; do
  [ "$velha" = "$ATUAL" ] && continue
  git -C "$REPO" worktree remove --force "$velha" 2>/dev/null || rm -rf "$velha"
done
git -C "$REPO" worktree prune

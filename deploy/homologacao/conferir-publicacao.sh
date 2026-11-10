#!/usr/bin/env bash
# Confere o que está no ar na homologação e o que falta publicar. Só leitura: não muda nada no servidor.
# Motivo (10/11/2026): a versão nova estava na main do GitHub e não no site, e isso só foi notado na
# demonstração. Agora o site também mostra a versão no rodapé ("v0.1.0 · <commit> · build <data>").
# Uso: bash deploy/homologacao/conferir-publicacao.sh
set -euo pipefail

REPO="${ORA_REPO_DIR:-$HOME/sistema-ora5g}"
BASE="${ORA_HML_BASE:-$HOME/homologacao}"
PORTA="${ORA_HML_PORTA:-3100}"
LINK="$BASE/plataforma"

ATIVA="$(readlink -f "$LINK" 2>/dev/null || true)"
[ -n "$ATIVA" ] && [ -d "$ATIVA" ] || { echo "Não há versão publicada em $LINK."; exit 1; }
NO_AR="$(git -C "$ATIVA" rev-parse --short=7 HEAD)"
git -C "$REPO" fetch -q origin
MAIN="$(git -C "$REPO" rev-parse --short=7 origin/main)"

echo "No ar (pasta):  $NO_AR  ($(basename "$ATIVA"), publicada em $(date -r "$ATIVA" '+%d/%m/%Y %H:%M'))"
echo "main no GitHub: $MAIN"
# O que o próprio site informa em /saude (versões a partir de 10/11/2026 mostram o commit).
SITE="$(curl -fsS --max-time 10 "http://127.0.0.1:$PORTA/saude" 2>/dev/null | grep -o -E 'v[0-9]+\.[0-9]+\.[0-9]+ · [0-9a-f]{7}' | head -1 || true)"
echo "Site informa:   ${SITE:-sem o commit na tela (versão anterior a 10/11/2026) ou fora do ar}"

FALTAM="$(git -C "$REPO" rev-list --count --no-merges "$NO_AR..origin/main")"
if [ "$(git -C "$REPO" rev-list --count "$NO_AR..origin/main")" = 0 ]; then
  echo "Tudo publicado: o site está na mesma versão da main."
else
  echo "Faltam $FALTAM commit(s) de trabalho da main no site (fora os de junção):"
  git -C "$REPO" log --oneline --no-merges "$NO_AR..origin/main" | sed 's/^/  /'
  echo "Publicar exige autorização do proprietário: bash $ATIVA/deploy/homologacao/publicar.sh"
fi

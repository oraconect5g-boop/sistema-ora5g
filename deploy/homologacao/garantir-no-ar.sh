#!/usr/bin/env bash
# Mantém a plataforma de HOMOLOGAÇÃO no ar em 127.0.0.1:3100 (ADR-001, opção A).
# Roda como o usuário dev: pelo cron a cada 5 minutos e no boot, e pelo publicar.sh.
# Uso: garantir-no-ar.sh [--reiniciar | --parar]
# Teste isolado (REV-016): ORA_HML_BASE=<outra pasta> ORA_HML_PORTA=<outra porta>, sempre juntas.
set -euo pipefail

BASE="${ORA_HML_BASE:-$HOME/homologacao}"
PORTA="${ORA_HML_PORTA:-3100}"
if { [ "$BASE" = "$HOME/homologacao" ] && [ "$PORTA" != 3100 ]; } || { [ "$BASE" != "$HOME/homologacao" ] && [ "$PORTA" = 3100 ]; }; then
  echo "ORA_HML_BASE e ORA_HML_PORTA mudam juntas (teste isolado) ou nenhuma (homologação real)." >&2
  exit 1
fi
DIR="$BASE/plataforma"   # link para a versão ativa em $BASE/versoes/<commit>-<configuração>
LOGS="$BASE/logs"
PID="$BASE/plataforma.pid"
mkdir -p "$LOGS"

# Durante uma publicação (build em andamento) o cron não mexe em nada.
if [ "${ORA_PUBLICANDO:-}" != 1 ]; then
  exec 8>"$BASE/.trava-publicacao"
  flock -n 8 || exit 0
fi

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
export NODE_OPTIONS="--dns-result-order=ipv4first" NEXT_TELEMETRY_DISABLED=1

no_ar() { curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:$PORTA/saude" 2>/dev/null; }

pid_na_porta() { ss -ltnpH "sport = :$PORTA" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

parar() {
  for p in "$(cat "$PID" 2>/dev/null || true)" "$(pid_na_porta)"; do
    [ -n "$p" ] && kill "$p" 2>/dev/null || true
  done
  for _ in $(seq 1 20); do [ -z "$(pid_na_porta)" ] && break; sleep 0.5; done
  rm -f "$PID"
}

# Log simples com limite de 10 MB.
for f in "$LOGS"/*.log; do if [ -f "$f" ] && [ "$(stat -c %s "$f")" -gt 10485760 ]; then mv "$f" "$f.1"; fi; done

case "${1:-}" in
  --parar) parar; exit 0 ;;
  --reiniciar) parar ;;
  *) no_ar && exit 0; parar ;;
esac

[ -f "$DIR/apps/plataforma/.next/BUILD_ID" ] || { echo "$(date -Is) sem build; rode publicar.sh" >>"$LOGS/garantir.log"; exit 1; }

cd "$DIR/apps/plataforma"
# 8>&- 9>&-: o servidor não pode herdar as travas (senão ninguém mais publica nem vigia).
# env -i (REV-016): a configuração vem só do .env.local da versão, a mesma usada na build;
# nada exportado no terminal de quem reinicia passa por cima dela.
nohup env -i HOME="$HOME" PATH="$PATH" NODE_OPTIONS="$NODE_OPTIONS" NEXT_TELEMETRY_DISABLED=1 \
  "$DIR/node_modules/.bin/next" start -H 127.0.0.1 -p "$PORTA" >>"$LOGS/plataforma.log" 2>&1 8>&- 9>&- &
echo $! >"$PID"

for _ in $(seq 1 60); do
  if no_ar; then echo "$(date -Is) no ar (versão $(basename "$(readlink -f "$DIR")"))" >>"$LOGS/garantir.log"; exit 0; fi
  sleep 0.5
done
echo "$(date -Is) FALHOU ao subir; veja $LOGS/plataforma.log" >>"$LOGS/garantir.log"
exit 1

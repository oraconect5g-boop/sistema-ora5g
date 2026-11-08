#!/usr/bin/env bash
# Grava UMA chave no arquivo de ambiente da homologação sem mostrar o valor em lugar nenhum
# (nem na tela, nem no histórico do terminal, nem na lista de processos).
#
#   bash definir-chave.sh NOME_DA_CHAVE [arquivo]   pede o valor (oculto) e grava
#   bash definir-chave.sh --situacao [arquivo]      lista as chaves: preenchida / vazia / ausente
#
# Arquivo padrão: ~/homologacao/plataforma.env (fonte do publicar.sh). Só aceita nomes do
# .env.example da raiz do repositório. Para valer na homologação, publique de novo.
set -euo pipefail
umask 077

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODELO="$RAIZ/.env.example"
NOME="${1:-}"
ARQUIVO="${2:-$HOME/homologacao/plataforma.env}"

[[ -f "$MODELO" ]] || { echo "Não achei o modelo $MODELO." >&2; exit 2; }
mapfile -t CONHECIDAS < <(grep -oE '^[A-Z][A-Z0-9_]*=' "$MODELO" | tr -d '=')

situacao_de() {
  local linha
  linha="$(grep -E "^$1=" "$ARQUIVO" 2>/dev/null | tail -n 1 || true)"
  if [[ -z "$linha" ]]; then echo "ausente"
  elif [[ -z "${linha#*=}" || "${linha#*=}" == "''" || "${linha#*=}" == '""' ]]; then echo "vazia"
  else echo "preenchida"; fi
}

if [[ "$NOME" == "--situacao" ]]; then
  echo "Chaves em $ARQUIVO (só a situação, nunca o valor):"
  for chave in "${CONHECIDAS[@]}"; do printf '  %-40s %s\n' "$chave" "$(situacao_de "$chave")"; done
  exit 0
fi

if [[ -z "$NOME" || ! " ${CONHECIDAS[*]} " == *" $NOME "* ]]; then
  echo "Uso: bash $0 NOME_DA_CHAVE   (ou --situacao)" >&2
  [[ -n "$NOME" ]] && echo "\"$NOME\" não está no .env.example. Confira o nome em docs/PENDENCIAS_DO_PROPRIETARIO.md." >&2
  exit 2
fi

[[ -t 0 ]] || { echo "Rode em um terminal: o valor é digitado ou colado, nunca passado no comando." >&2; exit 2; }
read -rsp "Cole o valor de $NOME e tecle Enter (não aparece na tela): " VALOR
echo
# O read já tira espaços das pontas; o Enter colado do Windows pode deixar um \r no fim.
VALOR="${VALOR//$'\r'/}"
[[ -n "$VALOR" ]] || { echo "Nada foi colado; nada mudou." >&2; exit 1; }

# Como o Next lê o .env.local (@next/env = dotenv + dotenv-expand, conferido no teste
# apps/plataforma/src/lib/definir-chave.test.ts): entre aspas simples a barra invertida e as
# aspas duplas valem como estão, mas "$NOME" e "${NOME}" seriam trocados por outra variável;
# "\$" vira "$". Então todo "$" é gravado como "\$". Valor com aspas simples vai entre aspas
# duplas (lá só "\n" e "\r" mudam), por isso aspas simples junto de barra invertida ou de
# aspas duplas é recusada; e barra invertida no fim, que o leitor confundiria com aspas escapadas.
if [[ "$VALOR" == *\'* && ( "$VALOR" == *\\* || "$VALOR" == *\"* ) ]] || [[ "$VALOR" == *\\ ]]; then
  echo "O valor tem aspas simples junto de aspas duplas ou barra invertida, ou termina em barra invertida; este comando não grava esse caso sem risco. Peça ao Claude Code outro caminho; nada mudou." >&2
  exit 1
fi
ESCAPADO="${VALOR//\$/\\\$}"
if [[ "$VALOR" =~ ^[A-Za-z0-9_./:@?\&=+%,~-]+$ ]]; then LINHA="$NOME=$VALOR"
elif [[ "$VALOR" == *\'* ]]; then LINHA="$NOME=\"$ESCAPADO\""
else LINHA="$NOME='$ESCAPADO'"; fi

mkdir -p "$(dirname "$ARQUIVO")"
[[ -f "$ARQUIVO" ]] || : > "$ARQUIVO"
TEMPORARIO="$(mktemp "$ARQUIVO.XXXXXX")"
trap 'rm -f "$TEMPORARIO"' EXIT
grep -vE "^$NOME=" "$ARQUIVO" > "$TEMPORARIO" || true
printf '%s\n' "$LINHA" >> "$TEMPORARIO"
chmod 600 "$TEMPORARIO"
mv "$TEMPORARIO" "$ARQUIVO"
trap - EXIT
unset VALOR LINHA ESCAPADO

echo "$NOME gravada em $ARQUIVO (valor não exibido; situação: $(situacao_de "$NOME"))."
echo "Para valer na homologação, o Claude Code publica de novo (deploy/homologacao/publicar.sh)."

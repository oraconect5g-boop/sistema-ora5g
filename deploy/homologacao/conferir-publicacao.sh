#!/usr/bin/env bash
# Confere se a homologação serve a versão esperada. Só leitura: não muda nada no servidor.
# A pasta ativa, o serviço local e o domínio público precisam responder o MESMO commit (inteiro, 40 caracteres) e o
# ambiente de homologação, lidos em /saude/versao. Qualquer ausência ou diferença reprova (saída 1): pasta faltando,
# serviço fora do ar, versão sem identidade, commit diferente, domínio servindo outra build ou ambiente trocado (#99,
# diagnóstico de 15/11/2026: antes, "Tudo publicado" saía só pela pasta, mesmo com o serviço antigo ou fora do ar).
# Motivo original (10/11/2026): a versão nova estava na main e não no site, e isso só foi notado na demonstração.
#
# Uso: bash deploy/homologacao/conferir-publicacao.sh
#   ORA_SHA_ESPERADO=<commit>   reversão declarada: o commit para o qual a homologação voltou (a main pode estar à frente);
#   ORA_HML_DOMINIO=<https://…> o domínio público (padrão https://ora5g.com.br; "nenhum" pula, só para teste isolado);
#   ORA_HML_AMBIENTE=<nome>     o APP_ENV esperado (padrão homologacao).
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

REPO="${ORA_REPO_DIR:-$HOME/sistema-ora5g}"
BASE="${ORA_HML_BASE:-$HOME/homologacao}"
PORTA="${ORA_HML_PORTA:-3100}"
DOMINIO="${ORA_HML_DOMINIO:-https://ora5g.com.br}"
AMBIENTE="${ORA_HML_AMBIENTE:-homologacao}"
LINK="$BASE/plataforma"
FALHAS=0
falha() { echo "FALHA: $*"; FALHAS=$((FALHAS + 1)); }

ATIVA="$(readlink -f "$LINK" 2>/dev/null || true)"
[ -n "$ATIVA" ] && [ -d "$ATIVA" ] || { echo "FALHA: não há versão publicada em $LINK."; exit 1; }
NO_AR="$(git -C "$ATIVA" rev-parse HEAD 2>/dev/null || true)"
git -C "$REPO" fetch -q origin
MAIN="$(git -C "$REPO" rev-parse origin/main)"
if [ -n "${ORA_SHA_ESPERADO:-}" ]; then
  ESPERADO="$(git -C "$REPO" rev-parse --verify "${ORA_SHA_ESPERADO}^{commit}" 2>/dev/null || true)"
  [[ "$ESPERADO" =~ ^[0-9a-f]{40}$ ]] || { echo "FALHA: o commit declarado ($ORA_SHA_ESPERADO) não existe no repositório."; exit 1; }
else
  ESPERADO="$MAIN"
fi
if [ "$ESPERADO" = "$MAIN" ]; then
  echo "Esperado:       ${ESPERADO:0:7} (a main no GitHub)"
else
  echo "Esperado:       ${ESPERADO:0:7} (declarado; a main está em ${MAIN:0:7})"
fi
echo "Pasta ativa:    ${NO_AR:0:7} ($(basename "$ATIVA"))"
if [ "$NO_AR" != "$ESPERADO" ]; then
  falha "a pasta ativa (${NO_AR:0:7}) não é a versão esperada (${ESPERADO:0:7})."
  if [ "$ESPERADO" = "$MAIN" ] && [ -n "$NO_AR" ]; then
    echo "Commits da main que não estão no ar:"
    git -C "$REPO" log --oneline --no-merges "$NO_AR..origin/main" 2>/dev/null | sed 's/^/  /' || true
  fi
fi

# A identidade que cada endereço responde em /saude/versao: {"commit": <40 caracteres>, "ambiente": …}.
campo() {
  node -e 'let d="";process.stdin.on("data",(c)=>{d+=c}).on("end",()=>{try{const v=JSON.parse(d)[process.argv[1]];process.stdout.write(typeof v==="string"?v:"")}catch{}})' "$1"
}
conferir() { # rótulo, endereço base
  local resposta commit ambiente
  resposta="$(curl -fsS --max-time 10 -H 'accept: application/json' "$2/saude/versao" 2>/dev/null || true)"
  if [ -z "$resposta" ]; then
    falha "$1 ($2) não respondeu /saude/versao: fora do ar ou uma versão sem a identidade."
    return
  fi
  commit="$(printf '%s' "$resposta" | campo commit)"
  ambiente="$(printf '%s' "$resposta" | campo ambiente)"
  printf '%-15s %s (%s)\n' "$1:" "${commit:0:7}" "${ambiente:-sem ambiente}"
  if ! [[ "$commit" =~ ^[0-9a-f]{40}$ ]]; then falha "$1 respondeu sem o commit inteiro."; return; fi
  [ "$commit" = "$ESPERADO" ] || falha "$1 serve ${commit:0:7}, não ${ESPERADO:0:7}."
  [ "$ambiente" = "$AMBIENTE" ] || falha "$1 está no ambiente \"$ambiente\", não \"$AMBIENTE\"."
}
conferir "Serviço local" "http://127.0.0.1:$PORTA"
if [ "$DOMINIO" = "nenhum" ]; then
  echo "Domínio:        não conferido (ORA_HML_DOMINIO=nenhum)"
else
  conferir "Domínio" "$DOMINIO"
fi

if [ "$FALHAS" -gt 0 ]; then
  echo "Publicação NÃO conferida: $FALHAS falha(s). Publicar ou voltar exige o processo do projeto (deploy/homologacao/publicar.sh)."
  exit 1
fi
if [ "$ESPERADO" = "$MAIN" ]; then
  echo "Tudo publicado: a pasta, o serviço local e o domínio servem ${ESPERADO:0:7}, a main."
else
  echo "Reversão conferida: a pasta, o serviço local e o domínio servem ${ESPERADO:0:7}; a main (${MAIN:0:7}) não está no ar, de propósito."
fi

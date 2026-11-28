#!/usr/bin/env bash
# O aceite isolado do lote AUD-f (o PR #113): só os testes locais de cada cenário, com respostas de mentira no formato oficial.
# Nada aqui chama a Nogle, a Asaas ou o site no ar; nenhum cliente real, cobrança, ativação ou consulta de verdade. As
# identidades são sintéticas (os CPFs de exemplo, com o dígito verificador): A = 123.456.789-09 e B = 529.982.247-25.
# Uso, da raiz do repositório, depois do npm ci: bash scripts/aceite-aud-f.sh
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
falhas=0
cenario() {
  local nome="$1" pasta="$2"
  shift 2
  echo "== $nome"
  local saida
  if saida="$(cd "$raiz/$pasta" && npx vitest run "$@" 2>&1)"; then
    grep -E "Test Files|Tests " <<<"$saida" | sed "s#^#   $pasta: #"
  else
    falhas=$((falhas + 1))
    echo "   FALHOU em $pasta:"
    grep -E "×|FAIL|AssertionError|Expected|Received" <<<"$saida" | head -20 | sed "s#^#     #"
  fi
}

cenario "1. A busca do cadastro pelo CPF, o preenchimento e a troca do documento (A e B)" apps/plataforma \
  src/lib/connect/busca-do-cadastro.test.ts src/lib/clientes/regras.test.ts
cenario "1. (o worker: só a /cliente/buscar, só os campos do formulário, só quem pediu lê)" apps/worker \
  src/connect/ponta-a-ponta.test.ts -t "cadastro do cliente na Nogle"
cenario "1. (o banco: quem pede, o limite, a leitura presa à loja, à sessão e ao documento, o descarte)" packages/banco \
  src/auditoria-connect.test.ts -t "parte B"
cenario "1. (o domínio: a leitura do cadastro, nada deduzido)" packages/dominio src/nogle.test.ts -t "para preencher"
cenario "2. O assistente até Conferir, sem registrar (o documento primeiro, o botão comum, nenhum envio fora do último passo)" apps/plataforma \
  src/app/connect/ativar/assistente.test.ts
cenario "3. A portabilidade com o SMS e o estado simulados (o reenvio do SMS só da gerência; o cancelamento só antes do envio)" packages/banco \
  src/connect-acoes.test.ts src/connect.test.ts
cenario "3. (o worker: a portabilidade sem resposta nunca é reenviada; o \"Sucesso\" da Nogle fica com a gerência)" apps/worker \
  src/connect/ponta-a-ponta.test.ts -t "portabilidade"
cenario "4. O pago na Nogle não é a linha ativa (o banco: o pagamento guardado, a linha só com o ICCID ativo, o eSIM sem ICCID)" packages/banco \
  src/auditoria-connect.test.ts -t "linha ativa|material do eSIM"
cenario "4. (o worker: o físico pago espera a prova da linha; o eSIM com o material à parte)" apps/worker \
  src/connect/ponta-a-ponta.test.ts -t "não é a linha ativa"
cenario "4. (o site: o pago fora da fila do Pix, o link e o Pix copia e cola separados, o material do eSIM só para quem pode)" apps/plataforma \
  src/lib/connect/regras.test.ts src/app/connect/abas.test.ts -t "AUD-f"
cenario "5. A Asaas sem provedor: compras, reservas de 24 h, o pedido pago por 7 dias, estornos, contestação e a retirada" packages/banco \
  src/pagamento-pelo-site.test.ts src/pedido-pago-no-balcao.test.ts
cenario "5. (o worker: a leitura de cada situação da Asaas)" apps/worker src/pagamentos/asaas.test.ts
cenario "5. (o site: a divergência e a conciliação nas Reservas, com os atalhos do balcão)" apps/plataforma src/app/reservas-do-site/reservas.test.ts
cenario "6. A ativação paga pela Asaas, só no domínio (a saída desligada)" packages/dominio src/quitacao-da-ativacao.test.ts

echo
if [ "$falhas" -gt 0 ]; then
  echo "O aceite isolado do AUD-f FALHOU em $falhas grupo(s)."
  exit 1
fi
echo "O aceite isolado do AUD-f passou. O teste do assistente no site no ar (e2e/connect-assistente-real.spec.ts, no celular) e o"
echo "sandbox da Asaas ficam para depois da publicação e dos pré-requisitos (docs/aceite/AUD-f.md)."

# Roteiro de aceite: lote PAY-015c (a assinatura no cartão pela Asaas)

- **Quem faz:** o proprietário, com a sua conta (ou um vendedor), numa loja.
- **Quando:** depois da publicação e **depois que a conta de teste da Asaas estiver pronta** (os passos do roteiro [PAY-015a](PAY-015a.md), "Antes de começar"; a assinatura precisa só da chave de API).
- **O que o lote entrega** (a sua mensagem de 25/11: "tem que ter espaço para cadastrar os cartões, caso a pessoa queira adicionar recorrência", com o cartão guardado **na Asaas**, a decisão D-062): na ficha do cliente (**Clientes** → o cliente), a seção **Cartão e recorrência**:
  - **Gerar QR Code do cartão** com o que é cobrado (ex.: "Plano 10 GB da linha"), o valor de cada cobrança, o ciclo (mensal, o padrão; semanal, quinzenal, bimestral, trimestral, semestral ou anual) e, se quiser, a linha da Ora Connect.
  - O QR Code do **link da assinatura** aparece na ficha. O cliente aponta a câmera do celular e cadastra o cartão **na página da Asaas** (vale por 3 dias: ele pode fazer em casa). O cartão fica guardado na Asaas; o sistema só vê a **bandeira e os 4 últimos dígitos**.
  - Quando o cliente cadastra, a assinatura vira **Ativa**, com o cartão, a **próxima cobrança** e as **cobranças** (paga, pendente, vencida ou estornada). A Asaas cobra sozinha a cada ciclo; o servidor acompanha.
  - **Cancelar esta assinatura** (quem criou, ou o gerente e o dono), com o motivo: o servidor remove a assinatura na Asaas, e as cobranças futuras param.
  - Se o cliente não cadastrar o cartão no prazo, a assinatura fica **"O cartão não foi cadastrado"**, e o link sai da Asaas.
- **O que NÃO entra (a sua decisão):** a **recarga automática da linha** quando a cobrança é paga. Ela pede o crédito da carteira na Nogle (que estava com R$ 0,00) ou a loja pagando o Pix da Nogle a cada mês. Por enquanto, a assinatura cobra o cliente; a recarga segue pelo caixa e pela Ora Connect.
- **Resposta:** "aceito" ou "não aceito".

## Os passos

1. Abra **Clientes**, busque um cliente de teste e abra a ficha.
2. Em **Cartão e recorrência**, preencha "Plano de teste", o valor e o ciclo mensal, e toque em **Gerar QR Code do cartão**. Recarregue a tela em alguns segundos: o QR Code aparece.
3. No celular, leia o QR Code (ou abra a página da assinatura) e cadastre um **cartão de teste** (no sandbox: um número de cartão fictício válido, qualquer validade futura e o código `123`).
4. Recarregue a ficha em até um minuto: a assinatura fica **Ativa**, com a bandeira e o final do cartão, a próxima cobrança e a primeira cobrança.
5. Toque em **Cancelar esta assinatura**, escreva o motivo e confirme: ela fica **Cancelada** (e some da Asaas de teste).
6. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- O link é o **link de pagamento recorrente** da Asaas (`chargeType` RECURRENT, com o ciclo; preenchido, ele cria a assinatura), lido na documentação oficial em 25/11. O servidor acha a assinatura pela primeira cobrança do link (a cobrança traz o `subscription`), lê a assinatura (`GET /v3/subscriptions/{id}`) e as cobranças dela (`GET /v3/subscriptions/{id}/payments`) a cada 30 minutos, e remove a assinatura no cancelamento (`DELETE /v3/subscriptions/{id}`: as cobranças futuras param).
- O banco confere tudo de novo: a assinatura da Asaas veio deste link, com o valor e o ciclo pedidos; o que não fecha vira divergência, sem mudar nada sozinho.
- A documentação não diz se a primeira cobrança sai na hora do cadastro ou na data do ciclo: o ensaio no sandbox confirma (se sair só na data, a assinatura aparece ativa quando a primeira cobrança for gerada).
- Migration `20261125211142_assinatura_no_cartao`; a reversão tira as tabelas e as funções novas e se recusa enquanto houver assinatura viva.

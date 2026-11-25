# Roteiro de aceite: lote PAY-015a (o Pix pela Asaas no caixa)

- **Quem faz:** o proprietário, com a sua conta (ou um vendedor), numa loja com caixa aberto.
- **Quando:** depois da publicação e **depois que a conta de teste da Asaas estiver pronta** (veja "Antes de começar").
- **O que o lote entrega** (as suas respostas de 25/11: "pagamento oficial da loja será a asaas", com o QR Code gerado direto do sistema, o pagamento misto e começar no teste; a decisão D-062): no **Vender**, depois do carrinho, o cartão **Pix pela Asaas**:
  - **Gerar o QR Code do Pix** com o valor (o sistema sugere o que falta pagar; dá para pôr só uma parte e o resto em dinheiro, na maquininha ou no Pix direto: o pagamento misto).
  - O QR Code aparece **na tela**, com o **copia e cola** e a hora em que ele vence (30 minutos). O cliente paga no app do banco dele.
  - Em poucos segundos o QR vira **Pago**, sozinho: o servidor confere na própria Asaas (o aviso da Asaas sozinho não confirma nada). A tela se atualiza enquanto espera.
  - O **pago entra sozinho na venda**: o total mostra "Pago no Pix pela Asaas" e as formas de pagamento cobram só o resto. Na conclusão, a venda ganha a linha "Pix pela Asaas" com o código da cobrança da Asaas, sem comprovante digitado.
  - **Cancelar este QR Code** enquanto ele não foi pago (se o cliente preferir pagar de outro jeito). Se o cliente pagar no mesmo instante, o pago vale.
  - **A segurança:** a venda não conclui enquanto um QR espera; a venda com Pix pago não se cancela pelo caixa (o estorno é pelo painel da Asaas, como o pago pelo site); o QR vale um pagamento só, com o valor certo, e some da Asaas quando é cancelado ou vence; nenhum dado do cliente vai para a Asaas (o QR não pede CPF).
- **Resposta:** "aceito" ou "não aceito".

## Antes de começar (só uma vez)

1. Crie a conta de **teste** da Asaas em `sandbox.asaas.com` e, nela, uma **chave Pix aleatória** (menu Pix → Minhas chaves).
2. Gere a **chave de API de teste** (Integrações → Chave de API) e grave no servidor pelo comando, **nunca pelo chat**:
   ```bash
   bash ~/homologacao/plataforma/deploy/homologacao/definir-chave.sh ASAAS_API_KEY
   ```
3. Grave também o e-mail que recebe os avisos da Asaas (quando a fila de avisos parar):
   ```bash
   bash ~/homologacao/plataforma/deploy/homologacao/definir-chave.sh ASAAS_EMAIL_DOS_AVISOS
   ```
4. Avise o Claude Code ("gravei as chaves da Asaas"). Ele grava o ambiente de teste, liga o worker dos pagamentos a cada minuto e publica de novo.

## Os passos

1. Abra **Vender**, comece uma venda e ponha um acessório no carrinho.
2. No cartão **Pix pela Asaas**, deixe o valor sugerido e toque em **Gerar QR Code do Pix**: em alguns segundos aparecem o QR Code, o copia e cola e a hora em que vence.
3. Toque em **Cancelar este QR Code**: ele fica **Cancelado**.
4. Gere outro QR com só uma parte do valor e confira que a venda **não conclui** enquanto ele espera.
5. **O pagamento no teste:** a Asaas de teste não recebe Pix de banco de verdade. Para simular, a Asaas pede uma **segunda conta de teste** (a que paga), com saldo de teste: pelo painel dela, pague o copia e cola (ou peça ao Claude Code para fazer a simulação). O QR vira **Pago**, o total desconta e a venda conclui com o resto em dinheiro.
6. Responda **"aceito"** ou **"não aceito"**. Depois do aceite, trocar para a conta real é gravar a chave de produção e o ambiente "producao" (o primeiro Pix real, de R$ 1,00, só com o seu sim).

## O que você não vê (feito pelo Claude Code)

- O QR Code é o **estático com valor** da Asaas (`POST /v3/pix/qrCodes/static`, um pagamento só, com validade), lido na documentação oficial em 25/11; quando alguém paga, a Asaas cria a cobrança com o identificador do QR, e o servidor confere por ele (`GET /v3/payments?pixQrCodeId=`), a cada poucos segundos, sem depender do aviso.
- O banco confere tudo de novo: quem pede (só a vendedora da venda, na loja do turno), o valor (até o que falta pagar), o QR, o valor pago e a passagem da situação. O que não fecha vira divergência, sem mudar nada sozinho.
- No caixa, o Pix pela Asaas entra como recebimento do seu meio (o fechamento conta só o dinheiro); o repasse da Asaas fica para a conciliação.
- Migration `20261125192529_pix_da_asaas_no_caixa`; a reversão tira as tabelas e as funções novas e volta a conclusão e o cancelamento da venda ao texto anterior.

# Roteiro de aceite: lote CONNECT-n (o assistente de ativação da demonstração)

- **Quem faz:** o proprietário, com a sua conta (ou um vendedor).
- **Quando:** depois da publicação, uns 5 minutos. **Só leitura**, desde que você pare antes de **Registrar ativação**: até lá, nada sai do celular nem vai à Nogle.
- **O que o lote entrega** (o seu pedido de 25/11: "só as telas do ora connect da demo, que estavam muito boas"): em **Ora Connect → Ativar chip**, o assistente da demonstração, um passo por vez, com os dados de verdade:
  1. **O chip:** o ICCID (o sistema confere o dígito verificador antes de seguir) ou o eSIM. Os chips vendidos na loja nos últimos 7 dias aparecem para tocar, pelo fim do número;
  2. **O cliente:** o nome, o CPF ou CNPJ (conferido), o contato e o endereço. Os dados vão só para a Nogle e saem do sistema depois do envio;
  3. **O plano e o DDD:** os planos da lista oficial da Nogle em cartões, com o valor de face;
  4. **O pagamento à Nogle:** o Pix da Nogle (o padrão) ou o crédito da carteira, e o serviço pago no caixa, se houver;
  5. **Conferir:** o resumo para conferir com o cliente (o documento só pelo fim) e o botão **Registrar ativação**.
  - Em cada passo, o **Continuar** só segue com o passo completo e diz, em português simples, o que falta. O **Voltar** mantém o que já foi digitado.
- **Resposta:** "aceito" ou "não aceito" (e o que mudar).

## Os passos

1. Entre com a sua conta e abra **Ora Connect → Ativar chip**. Veja os 5 passos no alto e "Etapa 1 de 5: Chip".
2. Toque em **Continuar** sem digitar nada: aparece o aviso do que falta.
3. Escolha **eSIM** (ou toque num chip vendido da lista, se houver) e toque em **Continuar**.
4. Preencha um cliente de teste (pode ser de mentira: nada é enviado antes do Registrar) e siga: escolha o plano e o DDD; veja o pagamento com o **Pix da Nogle** marcado.
5. No passo 5, confira o resumo. **Não toque em Registrar ativação**, a não ser que seja uma ativação de verdade.
6. Toque em **Voltar** e veja que o que foi digitado continua lá.
7. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- Sem mudança no banco: o Registrar chama a mesma ação de antes, e o servidor e o banco conferem tudo de novo (o chip vendido, o plano da lista, o serviço pago e a operação repetida).
- Os passos ficam num formulário só; o toque em Registrar confere todos os passos de novo e volta ao que falta, sem enviar.
- As provas: `apps/plataforma/src/app/connect/ativar/assistente.test.ts` (o que falta em cada passo, o resumo e o desenho inicial), a aba em `apps/plataforma/src/app/connect/abas.test.ts` e a prova no site no ar `apps/plataforma/e2e/connect-assistente-real.spec.ts`, que percorre os 5 passos com um cliente fictício e para antes de registrar.

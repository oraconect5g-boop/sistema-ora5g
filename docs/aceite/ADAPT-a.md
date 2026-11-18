# Roteiro de aceite: lote ADAPT-a (as integrações que esperam contrato)

- **Quem faz:** o proprietário, lendo. Não há passo no sistema.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** sete requisitos passam a "bloqueado", cada um com o que falta escrito: ORA-PAY-013, ORA-PAY-014, ORA-META-005, ORA-ONLINE-007, ORA-ONLINE-008, ORA-FISC-007 e ORA-FISC-010. Os três primeiros já têm o adaptador pronto para ligar, desligado.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que cada um precisa de você

| O que | Requisito | O que falta |
|---|---|---|
| Link de pagamento e Pix pela internet | ORA-PAY-014 | Escolher o provedor (PicPay, PagBank ou os dois) e gerar a credencial no painel dele |
| A maquininha PicPay mandando o pagamento sozinha | ORA-PAY-013 | Uma API da PicPay POS confirmada em contrato. Até lá, vale a conciliação pelo comprovante e pelo extrato |
| Mandar à Meta que um contato virou venda | ORA-META-005 | A conta de anúncios, a autorização e a base legal do consentimento (decisões D-022 e D-048) |
| Vender plano, chip e eSIM pelo site | ORA-ONLINE-007 | A Nogle confirmar a operação, e escolher a validação de identidade e o contrato digital |
| Vender para outros estados | ORA-ONLINE-008 | O frete (D-025) e as regras fiscais de cada estado com o contador |
| Os documentos fiscais de cada tipo de venda | ORA-FISC-007 | A matriz fiscal validada pelo contador (D1) |
| Vários estados, vários CNPJs e a reforma tributária | ORA-FISC-010 | O contador (D1) |

## O que você confere

1. Leia a tabela e veja se falta alguma dependência.
2. Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **Ligar as integrações:** cada uma é um lote próprio, quando o que falta chegar.

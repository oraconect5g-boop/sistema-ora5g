# Fluxo de balcão: o que foi trazido da demonstração

Comparação com o código versionado da demonstração em `app/demo/vender/PDV.tsx`, `app/demo/vendas/page.tsx` e `app/demo/estoque/page.tsx`. A demonstração não tem um módulo independente de caixa com abertura, sangria e fechamento; apresenta um resumo fictício de caixa em Financeiro. A operação real conserva seus controles.

| Tela | Demonstração | Ajuste na versão real |
| --- | --- | --- |
| Vender | Busca primeiro, lista de opções só quando solicitada, total fixo no celular | Busca por nome e prioridade para SKU numérico de quatro dígitos da planilha, com zeros intactos. Saldo livre da loja limita a quantidade de acessórios e não oferece Adicionar quando não há saldo. Atalho fixo mostra itens, total e abre a seção de pagamento; não dispara venda. |
| Pagamento | Só aparecem os campos da forma escolhida | Formas mistas continuam disponíveis. Pix e cartão da Asaas começam recolhidos quando ainda não há cobrança; registros e falhas aparecem abertos por padrão. Cliente é opcional e fica recolhido até ser solicitado. |
| Vendas/Comprovante | Lista com detalhes expansíveis | A lista real já pesquisava e filtrava vendas; a página do comprovante preserva histórico, nota, devoluções e estornos, com navegação de volta a Vendas, ao PDV e ao próprio Caixa, conforme loja do turno e permissões. |
| Caixa | Resumo ilustrativo no Financeiro | O caixa real distingue o dinheiro esperado na gaveta dos totais de cartão, Pix e outras formas, e oferece retorno ao PDV para quem pode vender. Nenhum cálculo ou fechamento do banco foi alterado. |
| Estoque/Reservas | Busca e histórico no estoque; dados fictícios da operação online | Atalho entre o saldo do estoque e reservas do site para o vendedor autorizado. Reserva pode voltar ao PDV ou ao estoque sem disparar “Atender” automaticamente. Loja, saldo, prazos e regras de atendimento permanecem no servidor. |

## Aceite
- Procure um produto por nome, por SKU como `0042` e por IMEI/ICCID completo. Se o saldo livre do acessório for zero, a interface não deve oferecer Adicionar. O saldo é da loja ativa, não da rede.
- Em tela estreita, acrescente duas unidades. A barra inferior mostra o total e o botão **Pagamento** rola até a seção, sem efetuar cobrança. Escolha uma forma ou combine duas em ambiente de teste e confira o comprovante. Só a ação **Concluir venda** envia a conclusão.
- O Pix/cartão Asaas ficam recolhidos antes de iniciar uma cobrança; cobranças já geradas e falhas de leitura continuam visíveis. Uma cobrança pendente ainda bloqueia a conclusão. A venda paga pelo site, o troco em dinheiro e os limites de PayJoy/Aiva não mudaram.
- Em **Identificar cliente**, informe e-mail inválido, feche o bloco e tente enviar. O navegador deve reabrir o bloco para apontar o campo. Não deve existir nova exigência de CPF, telefone ou e-mail.
- No comprovante de venda própria na loja do turno, abra **Ver meu caixa**. Dinheiro em gaveta e os outros meios devem aparecer separados. Com outro operador, o atalho não está disponível.
- De **Estoque → Reservas do site**, volte ao PDV ou ao estoque sem iniciar atendimento. A permissão de venda continua obrigatória.

## Fora deste lote
A simulação tinha um diálogo que recapitulava toda a venda; este lote não insere outro passo obrigatório além da confirmação real. Não altera gráficos, pagamentos/fiscal, relatórios financeiros, a lógica de reservas ou papel de cada loja. Para implantar esta branch inteira, considere que ela contém o commit anterior de maquininhas e sua migração; este lote de interface não acrescenta migração. Não houve homologação real com adquirentes, clientes ou dinheiro.

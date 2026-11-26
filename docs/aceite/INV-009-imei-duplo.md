# Aceite: dois IMEIs de um aparelho na entrada

- Em homologação, use apenas aparelhos e IMEIs fictícios, num perfil com permissão de receber.
- Em **Estoque → Entrada de mercadoria → Carga inicial**, selecione a variação exata e digite uma unidade por linha. Quando houver dois códigos para o mesmo aparelho, escreva `IMEI 1/IMEI 2`, sem digitar os rótulos. O contador deve mostrar uma unidade para essa linha. IMEI único e ICCID continuam como antes.
- Depois de registrar, confira a entrada e o saldo: dez pares aumentam o estoque em dez, e o detalhe exibe os dois IMEIs em um só registro por aparelho. Ambos devem localizar o mesmo aparelho em **Estoque** e em **Vender**; não finalize venda.
- Sem completar cadastro real, verifique que o mesmo código não entra de novo, mesmo trocado entre IMEI principal e secundário. O estorno permitido de uma entrada baixa uma vez por aparelho. A reentrada mantém sua identidade; um IMEI secundário antigo não é trocado ou removido por importação.
- A carga inicial não cria pedido de compra, fornecedor ou valor de custo. Não use novos cadastros de produto para contornar divergência de variante. A compra de fornecedor continua usando a entrada normal e a mesma ligação opcional ao pedido.
- Publicação: aplicar a migração antes de liberar a interface com pares. Para reverter, volte a interface primeiro e aplique o SQL de reversão; o estoque e os IMEIs já cadastrados permanecem.

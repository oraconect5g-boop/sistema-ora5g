# Roteiro de aceite: lote MKTPL-a (o lucro de cada pedido dos marketplaces)

- **Quem faz:** o proprietário, no computador, com a conta de dono.
- **Quanto tempo leva:** uns 10 minutos.
- **O que precisa:** acesso ao painel do vendedor de um dos canais (Mercado Livre, Shopee ou TikTok Shop), para exportar o relatório de vendas de alguns dias.
- **O que o lote entrega:** ORA-MKTPL-005 e ORA-MKTPL-008 (passam a testado); ORA-MKTPL-003, ORA-MKTPL-004 e ORA-MKTPL-006 (passam a parcial). Os adaptadores de cada canal ficam prontos para ligar, sem conversar com o canal: ORA-MKTPL-001, ORA-MKTPL-002 e ORA-MKTPL-007 ficam bloqueados até o contrato. Plano de 16/11, Onda 3, item "Marketplaces".
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que não bateu.

## O que mudou

1. **Os pedidos dos marketplaces entram por arquivo:** o relatório de vendas exportado do painel do vendedor de cada canal. Você diz qual coluna é cada campo; o sistema sugere pelo nome.
2. **O mesmo pedido nunca se repete.** O arquivo novo atualiza a situação e os valores do pedido que já existe.
3. **A tela mostra, por canal, por anúncio e por pedido:**
   - o bruto;
   - o que ficou com o canal (as tarifas, o frete e os reembolsos);
   - o líquido;
   - o custo do produto e o lucro estimado.
4. **Os produtos se ligam pelo código do anúncio** que já está no catálogo (códigos de outros canais) ou pelo SKU.
5. **Nada mexe no estoque, nas vendas da loja, nas notas ou nas comissões.**

## O que você faz

1. **No painel do vendedor do canal:** exporte o **relatório de vendas** de alguns dias, em CSV ou Excel.
2. **No sistema:** abra **Gestão → Relatórios** e toque em **"Marketplaces: pedidos, tarifas e lucro por canal"**.
3. **Em Importar pedidos:**
   - escolha o canal;
   - diga como os valores do pedido vêm no arquivo: em cada linha, ou repetidos em todas as linhas do pedido;
   - escolha o arquivo e confira a coluna de cada campo: **o número do pedido, a data e o valor do item (ou o preço)** são obrigatórios.
   - Embaixo aparece quantos pedidos foram lidos, o bruto e as tarifas.
4. Toque em **Importar os pedidos**.
5. **Confira com o painel do canal:**
   - o bruto;
   - as tarifas;
   - o líquido de alguns pedidos.
6. **Importe o mesmo arquivo de novo:** o sistema avisa que nada mudou.

## O que você confere

1. Os valores de alguns pedidos batem com o painel do canal.
2. O mesmo pedido não aparece duas vezes.
3. Os itens sem produto ligado aparecem contados.
   - Para ligar: no catálogo, cadastre o código do anúncio na variação (códigos de outros canais).
4. Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **A conexão direta com os canais:** depende do aplicativo aprovado em cada canal e da sua autorização.
- **A baixa do estoque pelo pedido do canal:** é uma decisão sua; hoje a loja registra a saída como já faz.
- **A etiqueta e o rastreio do envio:** dependem da conexão direta com os canais.

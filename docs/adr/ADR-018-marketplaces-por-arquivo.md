# ADR-018 — Os pedidos do Mercado Livre, da Shopee e do TikTok Shop por arquivo, com o lucro de cada pedido

**Situação:** proposta (17/11/2026), reversível; aplicada no lote MKTPL-a. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo plano do proprietário de 16/11/2026 (Onda 3, item "Marketplaces", a parte que não depende do contrato com os canais; ORA-MKTPL-003, ORA-MKTPL-005 e ORA-MKTPL-008, e partes de ORA-MKTPL-001, ORA-MKTPL-004 e ORA-MKTPL-006).

## Contexto

1. **A rede vende nos marketplaces (DEC-U13),** mas a plataforma não sabia quanto cada pedido rendeu depois das tarifas, do frete e dos reembolsos.
2. **A conexão direta com os canais** (os aplicativos aprovados nos portais, a autorização da conta do vendedor e a documentação oficial conferida) ainda não existe. Nada do contrato de um canal pode ser suposto (instrução permanente do projeto).
3. **O painel do vendedor de cada canal exporta o relatório de vendas** em arquivo (CSV ou Excel).
4. **O catálogo já liga cada anúncio à variação** pelos códigos de outros canais (CAT-009).

## Decisões

1. **O pedido entra por arquivo, sem supor o formato do canal.**
   - A pessoa diz qual coluna é cada campo, com sugestão pelo nome da coluna:
     - **obrigatórios:** o número do pedido, a data e o valor do item (ou o preço de uma unidade);
     - **opcionais:** a situação, o código do anúncio ou SKU, o título, a quantidade, as tarifas, o frete pago pelo vendedor, os reembolsos, o líquido e a data do repasse.
   - **Cada linha é um item;** as linhas com o mesmo número formam o pedido.
   - **A pessoa diz como os valores do pedido vêm:** em cada linha (somar) ou repetidos em todas as linhas do pedido (contar uma vez; se as linhas discordam, o arquivo é recusado e a linha, apontada).
2. **O mesmo pedido nunca vira dois.**
   - O número do canal é único por canal e por rede.
   - O arquivo novo com o mesmo pedido atualiza a situação, os valores e os itens.
   - O mesmo arquivo devolve a mesma importação.
   - Cada importação guarda quem, quando, o período e quantos pedidos foram novos e atualizados.
3. **A situação é a que o canal escreve:** nada é traduzido nem inventado.
4. **O item se liga ao catálogo** pelo código do anúncio (CAT-009, ativo) ou pelo SKU da variação. O item sem produto ligado é contado, para ser ligado no cadastro.
5. **O lucro estimado de cada pedido:**
   - **o líquido:** o do arquivo; sem ele, o bruto menos as tarifas, o frete e os reembolsos (marcado como estimado);
   - **o custo:** o do cadastro que valia no dia do pedido; o pedido reembolsado por inteiro não leva o custo;
   - **o lucro estimado:** o líquido menos o custo, só quando todo item tem produto e custo; os outros pedidos ficam fora do lucro e são contados.
6. **Por anúncio:** o líquido do pedido é dividido pelos itens na proporção do valor de cada um.
7. **Nada aqui mexe no estoque, nas vendas da loja, nas notas ou nas comissões.** O pedido do canal é a conta do canal, para ver o lucro.
8. **Só o dono vê e importa** (`resultado.ver`, a mesma permissão do resultado do mês), como o custo dos anúncios (ADR-017).
9. **Os adaptadores de cada canal ficam separados e desligados** (worker, `marketplaces/adaptadores.ts`):
   - cada um tem a interface e o formato comum do pedido, conferido com as regras da importação por arquivo;
   - cada um diz o que falta pelos nomes das variáveis já documentadas;
   - nenhum fala com o canal até o contrato ser verificado.

## O que fica de fora

1. **A conexão direta e a sincronização quase em tempo real** (ORA-MKTPL-001 e ORA-MKTPL-007): dependem do contrato de cada canal.
2. **A baixa do estoque pelo pedido do canal e a sincronização de preço e estoque** (ORA-MKTPL-002). Ligar o pedido do canal ao estoque é uma decisão nova do proprietário: hoje a loja registra a saída como já faz.
3. **A etiqueta e o rastreio** (ORA-MKTPL-004): dependem da conexão com o canal.
4. **O estorno no estoque, no fiscal e na comissão do pedido cancelado** (ORA-MKTPL-006): o reembolso aparece no pedido e no lucro, e nada mais muda.
5. **A conciliação do repasse do canal com o extrato do banco** (EXT-a): o valor e a data do repasse ficam no pedido, para a conferência manual.

## Atualização de 18/11/2026: o repasse casado com o extrato do banco (lote REPASSE-a)

- **O repasse:** os pedidos do mesmo canal com a mesma data de repasse. O esperado é a soma do líquido deles (o do arquivo ou o estimado, como no painel).
- **Casar:** dizer qual linha de crédito do extrato do banco da rede é o repasse. A tela sugere as linhas do dia do repasse até 5 dias depois, o mesmo valor primeiro. Quando o valor difere, o motivo é obrigatório e fica registrado.
- **Um para um:** uma linha casa com um repasse só, e um repasse com uma linha só (OR045). Desfazer pede o motivo, e a auditoria guarda o que era.
- **Os pedidos que mudam depois:** um arquivo novo do canal pode mudar o líquido ou os pedidos de um repasse já casado. O casamento guarda o esperado e os pedidos daquele momento, e a tela avisa quando mudaram.
- **A linha do extrato não muda de situação:** casar o repasse não é conciliar uma venda. **(Substituído em 23/11: a linha passa a ter a situação "repasse"; ver a atualização abaixo.)**

## Atualização de 23/11/2026: o repasse ocupa a linha do extrato (lote AUD-c, achado F21-02 do Codex)

- **O defeito:** como a linha não mudava de situação, a conciliação das vendas (ADR-016) continuava oferecendo e aceitando a linha que já era de um repasse, e o repasse aceitava a linha já conciliada com uma venda.
- **Agora casar o repasse ocupa a linha:** ela passa à situação "repasse" e não serve a mais nada. A linha conciliada com uma venda ou fora da conta não recebe repasse (OR046).
- **O painel só oferece linha pendente,** e o extrato mostra a linha de repasse com o canal e a data, sem o botão de conciliar.
- **Casar de novo o mesmo repasse na mesma linha** devolve o que já estava gravado, marcado como repetido.
- **Desfazer o repasse** devolve a linha a pendente. Pelo extrato não se desfaz um repasse: a tela manda para os repasses.
- **O resto da decisão está na ADR-016** (a mesma trava, a ordem dela e os gatilhos).

## Consequências

1. **O dono vê, por canal, por anúncio e por pedido,** o bruto, o que ficou com o canal (tarifas, frete e reembolsos), o líquido, o custo e o lucro estimado. A receita bruta e a líquida aparecem separadas.
2. **O número depende do arquivo:** a conferência com o relatório real de cada canal faz parte do aceite.
3. **Reverter:** a reversão da migration tira as importações, os pedidos, os itens e as funções; nada mais muda.

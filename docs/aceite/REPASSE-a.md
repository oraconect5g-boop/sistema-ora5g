# Roteiro de aceite: lote REPASSE-a (o repasse dos marketplaces casado com o extrato do banco)

- **Quem faz:** o proprietário.
- **Onde:** no sistema real, em **ora5g.com.br**, com a sua conta de dono.
- **Quanto tempo leva:** uns 10 minutos, com um relatório de vendas de um canal e um extrato do banco dos mesmos dias.
- **O que o lote entrega:** os pedidos do Mercado Livre, da Shopee e do TikTok Shop já entravam por arquivo (lote MKTPL-a), com o líquido de cada um. Faltava conferir se o dinheiro caiu no banco. Agora cada **repasse** pode ser casado com a linha do extrato do banco em que o dinheiro caiu, e a diferença fica registrada com o motivo.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **O que é um repasse:** os pedidos do mesmo canal com a mesma data de repasse. O canal junta esses pedidos e paga de uma vez.
2. **O esperado** é a soma do líquido desses pedidos:
   - o líquido que o arquivo do canal traz;
   - sem ele, o bruto menos as tarifas, o frete e os reembolsos (marcado como estimado).
3. **A tela Repasses no banco** mostra cada repasse:
   - já casado: a linha do extrato, o valor recebido e a diferença, com o motivo;
   - ainda sem linha: as linhas de crédito do extrato do banco que podem ser ele, do dia do repasse até 5 dias depois. A de mesmo valor vem primeiro.
4. **Casar com valor diferente pede o motivo.** Por exemplo, "tarifa de saque". A diferença fica registrada.
5. **Desfazer pede o motivo.** A auditoria guarda o que era.
6. **Se os pedidos mudarem depois de casar** (um arquivo novo do canal), a tela avisa.
7. **A linha do extrato não muda de situação:** casar o repasse não é conciliar uma venda.

## Os passos (no sistema real)

1. Entre em **ora5g.com.br** com a sua conta.
2. Abra **Gestão → Relatórios → Marketplaces** e toque em **Repasses no banco**.
3. Se ainda não houver pedidos com data de repasse, importe o relatório de vendas de um canal em **Marketplaces**. Escolha a coluna da data de repasse.
4. Importe o extrato do banco dos mesmos dias em **Conciliação de pagamentos → Extratos**, com o tipo "Do banco".
5. Volte à tela **Repasses no banco**. Escolha a linha em que o dinheiro caiu e toque em **Casar**. Se o valor for diferente, escreva o motivo.
6. Confira o resumo: o esperado, o recebido e a diferença.
7. Responda **"aceito"** ou **"não aceito"**.

## O que fica de fora

- **A importação automática dos pedidos de cada canal.** Depende do contrato e da autorização de cada canal (ORA-MKTPL-001).
- **O dinheiro que fica na conta do canal antes de ir para o banco** (por exemplo, no Mercado Pago). Hoje o repasse se confere quando chega ao banco.
- **O arquivo real de cada canal,** para conferir o desenho.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/marketplace-repasses.test.ts`):
  - o esperado é a soma do líquido dos pedidos do repasse, com o estimado contado;
  - a linha de mesmo valor vem primeiro, e a de antes do repasse não aparece;
  - o valor diferente pede o motivo; a mesma linha ou o mesmo repasse não casa duas vezes;
  - só a linha de crédito do extrato do banco da rede;
  - desfazer pede o motivo e fica na auditoria;
  - o gerente de uma loja e a outra rede não veem nem casam.
- **Na tela** (em `apps/plataforma/src/`: `lib/marketplaces/repasses.test.ts` e `app/relatorios/marketplaces/repasses/repasses.test.ts`):
  - a leitura estrita (forma inesperada é falha, nunca zero);
  - os formulários e as mensagens de cada recusa.

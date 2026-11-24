# Roteiro de aceite: lote FIN-002a (a taxa da PayJoy e da Aiva no resultado do mês)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, pelo celular ou pelo computador.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** a parte do item ORA-FIN-002 ("o resultado gerencial com custo, taxa e desconto") que faltava nas taxas: a da PayJoy e da Aiva. O item **segue parcial**: faltam o imposto sobre a venda calculado (depende do contador e do emissor fiscal) e a comissão (decisão D-014).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** o resultado do mês tirava as taxas de cartão e Pix, mas não a da PayJoy e da Aiva. A tela dizia "ainda não entra (falta o contrato)", e o resultado aparecia maior do que é nas vendas financiadas.
2. **Agora entra a taxa observada:** quando o repasse da financeira é registrado (em **Gestão → A receber das financeiras**), a diferença entre o valor financiado e o que caiu na conta é a taxa. Ela entra no resultado do **mês da venda**, numa linha própria, **"Taxas da PayJoy e da Aiva"**, logo abaixo da linha das taxas de cartão e Pix. Não precisa do contrato: é o que de fato aconteceu, como a taxa do cartão vista na conciliação.
3. **A conta sem repasse registrado não entra** (a taxa dela ainda não se conhece) e aparece num aviso, **"Repasses das financeiras a registrar"**, com o atalho para registrar.
4. **A venda cancelada sai,** como no cartão e no Pix: o acerto com a financeira fica no estorno da venda.
5. **Na planilha** (Excel e CSV), as duas linhas das taxas, com a coluna de cada loja, e a regra nas observações.
6. **Continua não sendo a contabilidade:** é o resultado gerencial com o que está lançado no sistema.

## O que fica de fora (por isso o ORA-FIN-002 segue parcial)

- **O imposto sobre a venda calculado:** só entra quando lançado nas contas a pagar. O cálculo depende do contador e do emissor fiscal.
- **A comissão:** depende da regra da comissão (decisão D-014).

## Os passos (só leitura; nada é gravado)

1. Abra **Gestão → Resultado do mês**. Se já for dezembro, volte para **Novembro de 2026** com a seta da esquerda.
2. Toque em **Santa Cândida (teste)**, no filtro "Onde".
3. No demonstrativo, logo depois de "Taxas de cartão e Pix", está a linha **"Taxas da PayJoy e da Aiva"**: **−R$ 49,00**, "1 repasse registrado". É a venda nº 23, financiada pela PayJoy: R$ 1.099,00 a receber e R$ 1.050,00 repassados em 21/11.
4. Em **"Como ler este resultado"**, toque em "Ver as regras de cada linha": a regra nova da PayJoy e da Aiva.
5. Se quiser, toque em **"Baixar planilha"**: a linha "Taxas da PayJoy e da Aiva (observadas no repasse)" com R$ 49,00.
6. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/resultado-do-mes.test.ts`): a diferença entre o financiado e o repasse entra nas taxas, no mês da venda (o repasse registrado em outro mês não muda isso); a conta sem repasse é contada à parte (quantas e quanto); na rede, a taxa aparece na loja da venda e na série dos meses; a venda cancelada depois do repasse sai da conta; a conta das linhas continua fechando (resultado = margem bruta − taxas − contas − caixa − rede).
- **Na tela** (`apps/plataforma/src/app/resultado/resultado.test.ts`): as duas linhas no demonstrativo, o aviso da conta sem repasse com o atalho, a regra nova, a planilha com as duas linhas e a coluna de cada loja, e a resposta do banco que não fecha tratada como falha (as taxas têm de ser a soma das duas partes, e as lojas têm de somar a rede). Com o banco de antes, a tela mostra a linha de sempre.
- **No banco do site, sem gravar nada** (24/11), com as contas de teste: o resultado de novembro da Santa Cândida (teste) mostrou R$ 51,29 de taxas (R$ 2,29 de cartão e Pix e R$ 49,00 da PayJoy), o mesmo na rede e na série dos meses; com o repasse desfeito só dentro da prova, a taxa da financeira foi a zero e a conta apareceu como "sem repasse" (R$ 1.099,00); com o repasse registrado de novo, com R$ 1.000,00, a taxa foi a R$ 99,00 e o resultado caiu R$ 50,00; o Gerente (teste) foi recusado. Tudo foi desfeito no fim: o repasse da venda nº 23 está como estava (R$ 1.050,00 em 21/11).
- **A prova de leitura no site** (`apps/plataforma/e2e/taxa-das-financeiras-real.spec.ts`): só abre a tela e baixa a planilha. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Migration:** `20261124103408_taxa_das_financeiras_no_resultado` (aplicada no banco da homologação em 24/11, com a reversão guardada): só a função do resultado do mês refeita. Nenhuma tabela mudou.

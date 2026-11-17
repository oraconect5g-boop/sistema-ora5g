# Roteiro de aceite: lote META-a (quanto custou cada contato e cada venda dos anúncios)

- **Quem faz:** o proprietário, no computador, com a conta de dono.
- **Quanto tempo leva:** uns 10 minutos.
- **O que precisa:** acesso ao Gerenciador de Anúncios da Meta da empresa, para exportar um relatório dos últimos dias.
- **O que o lote entrega:** ORA-META-003, ORA-META-004 e ORA-META-006 (passam a testado) e ORA-META-001 por arquivo (passa a parcial: falta a conexão com a conta de anúncios). Plano de 16/11, Onda 3, item "Meta Ads".
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que não bateu.

## O que mudou

1. **O custo dos anúncios entra por arquivo:** o relatório exportado do Gerenciador de Anúncios, por dia. Você diz qual coluna é o dia, a campanha e o valor usado; o sistema sugere pelo nome da coluna, em português ou em inglês.
2. **Para cada campanha, o sistema junta o custo aos contatos e às vendas que vieram dela:**
   - **os contatos:** as reservas do site com a campanha no link e as oportunidades do CRM com a campanha digitada;
   - **as vendas:** as concluídas que vieram desses contatos.
3. **A tela mostra, por campanha:**
   - quanto custou cada contato (CPL) e cada venda (CPA);
   - o retorno sobre o gasto (ROAS) e o custo de cada cliente novo (CAC);
   - a margem;
   - o que já é dinheiro de fato (o dinheiro no caixa e o cartão ou Pix conciliado).
4. **As fórmulas ficam no fim da tela,** com o período.

## O que você faz

1. **No Gerenciador de Anúncios:**
   - abra **Relatórios**;
   - escolha o período, por exemplo, os últimos 7 dias;
   - no **Detalhamento**, escolha **Por tempo → Dia**;
   - exporte em **CSV** ou **Excel**.
2. **No sistema:** abra **Gestão → Relatórios** e toque em **"Anúncios (Meta): custo e retorno por campanha"**.
3. Em **Importar o custo**, escolha o arquivo.
   - Confira a coluna de cada campo: **o dia, a campanha e o valor usado** são obrigatórios; as impressões, os cliques no link e os resultados ajudam.
   - Embaixo aparece quantas campanhas foram lidas, o período e o valor usado.
4. Toque em **Importar o custo**.
5. **Confira o resumo e a lista por campanha:** o valor usado de cada campanha tem de bater com o do Gerenciador.
6. **Importe o mesmo arquivo de novo:** o sistema avisa que nada mudou.

## O que você confere

1. O valor usado de cada campanha bate com o do Gerenciador de Anúncios.
2. As campanhas com custo e sem contato aparecem marcadas.
   - Isso é esperado enquanto o link do anúncio não leva o nome da campanha.
   - No anúncio, use no link `utm_campaign={{campaign.name}}`.
3. Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **Ver o custo por venda de verdade.** Ele precisa de reservas e vendas registradas no sistema com a campanha: vem com a loja piloto e as contas de teste.
- **A conexão direta com a conta de anúncios** (sem arquivo): depende da sua autorização para ligar a conta (decisão D-022) e da revisão do acesso.
- **O contato que chega pelo WhatsApp:** depende da integração oficial do WhatsApp.

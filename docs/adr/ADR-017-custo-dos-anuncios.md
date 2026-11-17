# ADR-017 — O custo dos anúncios da Meta por arquivo, junto aos contatos e às vendas de cada campanha

**Situação:** proposta (17/11/2026), reversível; aplicada no lote META-a. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo plano do proprietário de 16/11/2026 (Onda 3, item "Meta Ads", a parte que não depende do acesso à conta de anúncios; ORA-META-001, ORA-META-003, ORA-META-004 e ORA-META-006). A política de atribuição é a decisão pendente D-022: este ADR propõe um padrão reversível.

## Contexto

1. **O MKT-a (ADR-013) guarda a campanha do link** em cada reserva do site, e a oportunidade do CRM guarda a campanha que quem atende digita. Falta o custo de cada campanha para saber quanto custou cada contato e cada venda.
2. **A conta de anúncios da Meta** (a API de insights, com OAuth) ainda não foi ligada: depende da conta e da autorização do proprietário (D-022) e da revisão dos escopos.
3. **O Gerenciador de Anúncios exporta o relatório em arquivo** (CSV ou Excel), em português ou em inglês, com o detalhamento por dia.

## Decisões

1. **O custo entra por arquivo**, sem supor o formato: a pessoa diz qual coluna é o dia, a campanha e o valor usado (obrigatórios), as impressões, os cliques no link e os resultados, com sugestão pelo nome da coluna.
2. **O arquivo vem por dia.** Se o fim do período de uma linha não é o mesmo dia, o arquivo é recusado e a tela pede o detalhamento por dia: o gasto de um mês inteiro não pode cair num dia só.
3. **O dia da campanha é a unidade.** As linhas do mesmo dia e da mesma campanha (o arquivo por conjunto ou por anúncio) somam; o arquivo novo do mesmo dia substitui o anterior; o mesmo dia nunca conta duas vezes. O mesmo arquivo devolve a mesma importação, e cada importação guarda quem, quando, o período, o gasto e quantos dias substituiu.
4. **A campanha do arquivo casa com a campanha do link** pelo nome, sem diferença de maiúsculas, acentos e espaços. Para casar, o link do anúncio leva o nome da campanha no `utm_campaign` (no Gerenciador, o parâmetro dinâmico `{{campaign.name}}`).
5. **A atribuição padrão (D-022, reversível):** a venda vem da campanha do contato que a originou: a reserva do site atendida, ou a oportunidade do CRM ganha. Uma venda conta uma vez: se veio dos dois, vale a reserva (o clique no link). Contam os contatos do período e as vendas que vieram deles, mesmo concluídas depois.
6. **As fórmulas, na tela, com o período:**

   | Métrica | Fórmula |
   |---|---|
   | CTR | cliques ÷ impressões |
   | CPC | valor usado ÷ cliques |
   | Custo por resultado (da Meta) | valor usado ÷ resultados do arquivo |
   | CPL (custo por contato) | valor usado ÷ contatos no sistema (reservas e oportunidades da campanha) |
   | CPA (custo por venda) | valor usado ÷ vendas concluídas da campanha |
   | ROAS | receita das vendas ÷ valor usado |
   | ROAS da margem | margem das vendas ÷ valor usado |
   | CAC | valor usado ÷ clientes novos (a primeira compra do cliente) |

   Quando o divisor é zero, a métrica não aparece ("—").
7. **Estimado × recebido (META-006):** a receita é a das vendas concluídas; o "recebido" é o que já é dinheiro de fato (o dinheiro no caixa e o cartão ou Pix conciliado, pelo líquido). A margem é a dos itens com custo gravado; a venda com item sem custo é contada à parte.
8. **Só o dono vê e importa** (`resultado.ver`, a mesma permissão do resultado do mês): o custo dos anúncios é da rede.

## O que fica de fora

1. **A conexão com a conta de anúncios** (OAuth e escopos): depende da conta e da autorização do proprietário (D-022).
2. **A Conversions API** (ORA-META-005): depende da base legal e do consentimento.
3. **O contato que chega pelo WhatsApp** com a campanha: depende da integração oficial (ORA-WHATS-001).
4. **Outras plataformas de anúncio** (Google, TikTok): o modelo aceita outra plataforma, mas só a Meta está ligada.

## Consequências

1. **O dono vê quanto custou cada contato, cada venda e cada cliente novo** de cada campanha, e o retorno sobre o gasto, com o que já é dinheiro separado do que é estimativa.
2. **O número depende de o link do anúncio levar o nome da campanha.** A campanha com custo e sem contato aparece marcada, para corrigir o link.
3. **Reverter:** a reversão da migration tira as importações, os custos e as funções; nada mais muda.

# ADR-013 — De onde veio a reserva do site: a campanha do link, o cookie da loja online e o que se guarda

**Situação:** proposta (17/11/2026), reversível; aplicada no lote MKT-a. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo plano do proprietário de 16/11/2026 (Onda 2, "Programação"): "ONLINE-003 e META-002 (origem e UTM do pedido e do lead)".

## Contexto

1. **O canal online de hoje é a reserva do site** (lote ONLINE-b, ADR-009). O visitante reserva sem login e paga na retirada, na loja. Não existe ainda o pedido do site com pagamento (ONLINE-002 e ONLINE-005, que esperam o provedor).
2. **Os requisitos:**
   - **ORA-ONLINE-003:** atribuir a origem online, a campanha e o vendedor, quando couber, sem atribuição indevida nem comissão dupla.
   - **ORA-META-002:** capturar o UTM e a origem dos contatos do site e do WhatsApp, ligando a campanha, a oportunidade e a venda quando possível.
3. **Os anúncios marcam o link com parâmetros de campanha** (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content` e `utm_term`). Exemplo: `ora5g.com.br/loja?utm_source=instagram&utm_campaign=natal`. O visitante entra por um produto e reserva duas ou três telas depois, sem os parâmetros no endereço.
4. **O site é público e não tem sessão.** Nada do visitante fica guardado entre uma tela e outra.

## Decisões

1. **A origem é guardada na entrada da loja online e vai junto com a reserva.**
   - **Quem guarda:** o proxy do Next, só nos endereços `/loja`. Ali ele não renova sessão nenhuma e não chama o banco.
   - **Quando guarda:**
     - o link traz parâmetros de campanha: guarda a campanha;
     - o visitante vem de outro site: guarda o site.
   - **Quando não muda nada:** na navegação dentro do próprio site, e quando não há informação. O que já estava guardado continua valendo, ou seja, vale o último link de campanha ou o último site de fora.
   - **Onde guarda:** num cookie (`ora_origem`) com estas regras:
     - **da sessão do navegador:** some quando o navegador fecha;
     - **só da loja online:** `Path=/loja`;
     - **fora do alcance do JavaScript da página:** `HttpOnly`;
     - **só no mesmo site:** `SameSite=Lax`;
     - **só por conexão segura:** `Secure`, quando é https.
   - **A resposta que grava o cookie não vai para cache compartilhado.**
2. **O que se guarda não identifica a pessoa.** É o que estava no link em que ela tocou:
   - **a origem**, numa lista fechada: Google, Instagram, Facebook, WhatsApp, TikTok, YouTube, e-mail, outro site, outra campanha ou direto;
   - **os cinco parâmetros de campanha**, em minúsculas, até 100 letras cada;
   - **o domínio do site que mandou o visitante**, sem o caminho nem os parâmetros do endereço.
   - **O aviso:** o formulário da reserva diz que a reserva guarda por onde a pessoa chegou ao site e que isso não a identifica.
3. **Como a origem é decidida:**
   - **Com `utm_source`:** a fonte decide, com as grafias comuns (por exemplo, `ig` e `instagram` são Instagram). A fonte fora da lista é "outra campanha", e a fonte fica guardada (por exemplo, `panfleto`).
   - **Com campanha, sem a fonte:** vale o site que mandou o visitante; sem ele, "outra campanha".
   - **Sem campanha, vindo de outro site:** o site decide (por exemplo, `google.com.br` é Google, `l.instagram.com` é Instagram, `wa.me` é WhatsApp). O site fora da lista é "outro site".
   - **Sem cookie na hora de reservar:** "direto".
4. **O banco confere de novo e decide o que guarda** (`public.loja_reservar`, com o parâmetro novo `p_origem`).
   - **O que ele limpa:** os mesmos limites da tela; a origem fora da lista e o domínio inválido ficam vazios.
   - **A reserva não é recusada por causa da origem.**
   - **A chave da reserva:** a origem não entra na conferência dela. A mesma chave devolve a mesma reserva, com a origem da primeira vez.
   - **A tabela também recusa o que foge do formato:** é a última barreira.
5. **O vendedor é o da venda, uma vez só.** A reserva atendida abre uma venda normal no PDV, e a venda tem um vendedor (`vendas.vendedor_id`), o que concluiu. A origem fica na reserva, ligada à venda (`loja_reservas.venda_id`), e não cria uma segunda atribuição. O bônus e as metas seguem contando a venda uma vez.
6. **As reservas de antes ficam "sem registro".** Nada é inventado para o passado.
7. **A leitura:**
   - **Para a equipe:** a tela Reservas do site mostra de onde veio cada reserva.
   - **Para a gerência:** os Relatórios têm o quadro "Reservas do site por origem", da função `public.reservas_do_site_painel`. Ela lê com a permissão de quem pede, e mostra:
     - **por origem, fonte e campanha:** as reservas do período, as atendidas, canceladas e vencidas, e as vendas concluídas que vieram delas, com o valor;
     - **por vendedor:** as vendas concluídas que vieram das reservas, com o nome pela mesma regra do ranking.

## O que fica de fora (e por quê)

1. **O contato do WhatsApp.** Não há integração oficial com a Meta (espera a habilitação: F1). Quando houver, o contato que chega pelo WhatsApp leva a origem do mesmo jeito.
2. **A oportunidade do CRM.** A reserva não cria oportunidade sozinha. O cadastro do cliente pede consentimento e dados que a reserva não tem. A oportunidade já guarda a origem e a campanha, digitadas por quem atende.
3. **O pedido do site com pagamento.** Ele ainda não existe. Quando existir, usa as mesmas colunas e a mesma regra.
4. **Cookie de terceiros, pixel de anúncio e identificador do visitante.** Não há nenhum: a atribuição é só pelo link e pelo site de onde a pessoa veio.

## Consequências

1. **A atribuição é a do último toque** (o último link de campanha ou site de fora antes de reservar) e vale só enquanto o navegador está aberto. Quem volta outro dia, digitando o endereço, conta como "direto".
2. **O visitante pode forjar o link.** Qualquer pessoa pode montar um link com uma campanha. Isso vale para qualquer marcação de campanha, e o dado serve para medir campanhas, não para pagar ninguém.
3. **Reverter:** a reversão da migration tira as colunas e o painel e volta a função de reserva à versão anterior; tirar a captura é tirar o ramo `/loja` do proxy. As reservas continuam, sem a origem.

# Roteiro de aceite: lote FIN-007b (o aviso do repasse atrasado e a previsão de caixa com o vencimento)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, pelo celular ou pelo computador.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** a segunda parte da "gestão de inadimplência e cobranças" (item ORA-FIN-007, que segue **parcial**) e a previsão de caixa com a data em que cada financeira deve pagar (item ORA-FIN-010, que já estava testado).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** o atraso de uma financeira só aparecia para quem abrisse a tela "A receber das financeiras". E a previsão de caixa mostrava o que as financeiras devem como "sem data", mesmo com o prazo gravado.
2. **Agora o sistema avisa.** No **Início** e no **sino** do topo, quem concilia os pagamentos da loja (o gerente e o dono) vê dois alertas novos, que só aparecem quando há o que fazer:
   - **Repasses atrasados:** quantas contas da loja passaram do prazo de repasse.
   - **Cobranças a retomar:** quantas contas têm a data combinada de "voltar ao assunto" em hoje ou antes.
   O toque no alerta abre a tela "A receber das financeiras".
3. **Na tela das financeiras,** a conta com o dia de voltar ao assunto chegado ganha o selo "retomar a cobrança", e o cartão do topo diz quantas são. Registrar outra cobrança tira o lembrete da anterior.
4. **A previsão de caixa usa o vencimento.** Com o prazo de repasse gravado, cada conta a receber entra na semana em que vence, como um fato com data. A tela separa o que entra na previsão do que fica de fora:
   - o que **vence no período** entra, na semana do vencimento;
   - o que **já passou do prazo** não entra (o dinheiro já devia ter caído: cobre a financeira);
   - o que **vence depois do período** e o que **não tem prazo gravado** também ficam de fora.
5. **Sem prazo gravado, nada muda:** nenhum alerta de atraso aparece e a previsão segue mostrando as financeiras "sem data". Nenhum prazo foi inventado.
6. **O valor é o "a receber", sem a taxa da financeira.** A taxa só se conhece quando o repasse cai. A tela diz isso nas premissas.

## O que fica de fora (por isso o ORA-FIN-007 segue parcial)

- **A cobrança ao cliente final.** A loja não vende a prazo próprio (essa é a decisão D-013, que segue em aberto), e a mensagem ao cliente depende do WhatsApp oficial e do consentimento dele.
- **O sistema não manda mensagem nenhuma à financeira:** ele avisa a equipe e guarda o que foi feito.

## Os passos

1. Entre na **Santa Cândida (teste)**. No **Início**, veja os cartões do que espera você. Hoje não há repasse atrasado: os alertas "Repasses atrasados" e "Cobranças a retomar" **não** aparecem. É o esperado.
2. Toque no **sino**, no topo: a lista é a mesma do Início.
3. Abra **Gestão → Previsão de caixa**. Em **Fatos de hoje**, a linha "A receber das financeiras" diz "Nada em aberto" (a loja de teste não tem conta em aberto).
4. Responda **"aceito"** ou **"não aceito"**.

Para ver o alerta aceso e a previsão com uma conta na semana do vencimento, é preciso uma venda financiada em aberto na loja de teste e um prazo gravado. Isso grava, e eu só faço com o seu sim.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/aviso-do-repasse-e-previsao.test.ts`):
  - sem prazo, o alerta fica em zero; com o prazo, conta o que passou dele na loja do turno, igual à lista da tela; no dia do vencimento ainda não conta; a conta recebida ou de venda cancelada sai;
  - a cobrança a retomar vale pela cobrança mais recente de cada conta; outra cobrança tira o lembrete;
  - só quem concilia na loja recebe os dois alertas: o vendedor e o administrador não;
  - na previsão, cada conta entra na semana do vencimento; as quatro partes (atrasado, no período, depois e sem prazo) somam o total, e as semanas somam o que vence no período;
  - a previsão continua só do dono.
- **Na tela** (`apps/plataforma/src/lib/inicio/pendencias.test.ts`, `apps/plataforma/src/app/pagamentos/financeiras.test.ts` e `apps/plataforma/src/app/previsao/previsao.test.ts`): os dois alertas; o selo e o aviso de retomar a cobrança; a previsão com o repasse na semana do vencimento, na tabela, no gráfico e na planilha; a resposta do banco que não fecha tratada como falha, nunca como número.
- **No banco do site, sem gravar nada** (23/11), com as contas de teste: com a conta da venda nº 23 em aberto só dentro da prova, a cobrança com a volta para hoje acendeu o alerta do gerente; com 1 dia de prazo, o alerta de atraso contou 1 e a previsão mostrou R$ 1.099,00 como atrasado, fora das semanas; com 45 dias, a conta entrou na semana de 04 a 10/01/2027; o Vendedor (teste) não recebeu os alertas, e só o Dono (teste) leu a previsão. Tudo foi desfeito no fim: 0 prazos e 0 cobranças gravados.
- **A prova de leitura no site** (`apps/plataforma/e2e/aviso-do-repasse-real.spec.ts`): só abre telas. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Migration:** `20261124021740_aviso_do_repasse_e_previsao_com_vencimento` (aplicada no banco da homologação em 23/11, com a reversão guardada): duas funções de leitura refeitas. Nenhuma tabela mudou.

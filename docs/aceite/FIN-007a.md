# Roteiro de aceite: lote FIN-007a (o que as financeiras devem e já passou do prazo, e as cobranças feitas)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, pelo celular ou pelo computador.
- **Quanto tempo leva:** uns 10 minutos.
- **O que o lote entrega:** a primeira parte da "gestão de inadimplência e cobranças" (item ORA-FIN-007, que passa de não iniciado a **parcial**) e o vencimento das contas a receber (item ORA-FIN-003, que passa a **testado**).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** a tela "A receber das financeiras" mostrava há quantos dias cada venda financiada esperava o repasse. Ela não dizia o que estava **atrasado**, porque o prazo de cada financeira é do contrato, e não havia onde gravá-lo.
2. **Agora você grava o prazo na própria tela.** No cartão novo, "O que está atrasado", há "O prazo de repasse de cada financeira": os dias corridos desde a venda para a PayJoy e para a Aiva, com o motivo (de onde veio o prazo). Só quem concilia pela rede inteira define: hoje, o dono. Cada mudança fica na auditoria, e o prazo pode ser retirado.
3. **Com o prazo, o sistema diz o que venceu.** Cada conta em aberto ganha o selo "vence em…", "vence hoje" ou **"atrasada há N dias"**. O cartão soma quanto está atrasado e separa pela idade do atraso: até 7 dias, de 8 a 30 dias e mais de 30 dias.
4. **Sem o prazo, nada é chamado de atrasado.** A tela diz que falta o prazo. Nenhum prazo foi inventado: os dois começam em branco.
5. **A cobrança fica registrada.** Em cada conta em aberto, a gerência registra a cobrança feita à financeira: por onde foi (telefone, e-mail, portal…), o que foi combinado, o protocolo e a data para voltar ao assunto. Fica o histórico, com a data e quem fez. A cobrança registrada não muda nem some.
6. **O dono vê a rede inteira:** em "Na rede inteira", quantas contas cada loja tem em aberto e quanto está atrasado em cada uma.
7. **Quem vê:** quem concilia os pagamentos (o gerente, na loja dele; o dono, em todas). O vendedor não vê, e o banco também recusa.

## O que fica de fora (por isso o ORA-FIN-007 segue parcial)

- **O aviso no Início e no sino** quando um repasse atrasa, ou quando chega o dia de voltar ao assunto. É o próximo passo deste assunto.
- **A cobrança ao cliente final.** A loja não vende a prazo próprio (essa é a decisão D-013, que segue em aberto), e a mensagem ao cliente depende do WhatsApp oficial.
- **O sistema não manda mensagem nenhuma à financeira:** ele guarda o que você fez.

## Os passos

1. Entre na **Santa Cândida (teste)** e abra **Gestão → A receber das financeiras**.
2. Veja o cartão **O que está atrasado**. Hoje a loja de teste não tem conta em aberto: o cartão diz "Nenhuma conta em aberto com as financeiras".
3. Em **O prazo de repasse de cada financeira**, a PayJoy e a Aiva aparecem como "sem prazo definido". Só você vê os campos para gravar.
4. Mais abaixo, em **Na rede inteira**, a tela diz hoje "Nenhuma loja da rede tem conta em aberto com as financeiras". O gerente não vê essa parte.
5. Se quiser experimentar: escreva um prazo (por exemplo, 30) e o motivo ("teste do roteiro") e toque em **Gravar**. A tela confirma. Para voltar ao que era, apague os dias, escreva o motivo e toque em **Gravar** de novo.
6. O prazo de verdade é o do contrato de cada financeira: grave quando tiver essa resposta.
7. Responda **"aceito"** ou **"não aceito"**.

Para ver uma conta atrasada e o registro de uma cobrança no site, é preciso uma venda financiada em aberto na loja de teste. Isso grava, e eu só faço com o seu sim.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/repasses-atrasados.test.ts`):
  - sem prazo, nenhuma conta é atrasada; com o prazo, o vencimento é o dia da venda mais o prazo; no dia do vencimento ainda não está atrasada; mudar ou retirar o prazo muda o resultado;
  - só o dono define o prazo; o gerente, o vendedor e o administrador são recusados; cada rede tem o prazo dela;
  - a cobrança só vale para conta em aberto, na loja de quem cobra; o duplo clique não grava duas; a cobrança e o prazo gravados não mudam nem somem;
  - cada um lê só as lojas dele, também pela leitura direta das tabelas.
- **Na tela** (`apps/plataforma/src/app/pagamentos/financeiras.test.ts` e `apps/plataforma/src/lib/pagamentos/atrasados.test.ts`): o cartão com atraso (com as faixas da idade do atraso), sem prazo e no prazo; a rede inteira com contas, sem nenhuma e em falha; a falha de leitura, que nunca vira "nada atrasado"; os dois formulários e cada recusa do banco com a sua mensagem.
- **No banco do site, sem gravar nada** (23/11), com as contas de teste: sem prazo, a conta da venda nº 23 ficou "sem prazo"; com 1 dia de prazo, definido pelo Dono (teste), ficou "atrasada há 1 dia"; o Gerente (teste) registrou a cobrança, e a repetição não gravou outra; o Gerente 2 (teste) e o Vendedor (teste) foram recusados. Tudo foi desfeito no fim: 0 prazos e 0 cobranças gravados.
- **A prova de leitura no site** (`apps/plataforma/e2e/repasses-atrasados-real.spec.ts`): só abre telas. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Migration:** `20261123230314_repasses_atrasados` (aplicada no banco da homologação em 23/11, com a reversão guardada): duas tabelas novas, só de inserção, e três funções. As contas a receber não mudaram.

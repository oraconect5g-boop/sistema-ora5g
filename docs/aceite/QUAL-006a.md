# Roteiro de aceite: lote QUAL-006a (o aviso no celular quando o servidor dá erro)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, pelo celular ou pelo computador.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** a parte "o aviso no celular quando há erro do servidor" de dois itens: o ORA-QUAL-006 ("observabilidade de erros, latência, filas e conciliação") e o ORA-QUAL-013 ("processo de resposta a incidentes e suporte às lojas"). Os dois **seguem parciais** (veja "O que fica de fora").
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** quando uma tela mostrava a página de erro ("avise o administrador com o código ..."), o erro só aparecia na tela Saúde da operação. Você só ficava sabendo se abrisse a tela.
2. **Agora, o seu celular recebe o alerta "Erro no servidor do site"** (ou "Erros no servidor do site"), com quantos erros houve e a tela do último. Ao tocar no alerta, abre a Saúde da operação.
3. **No máximo um alerta por hora.** Os erros que acontecerem nesse meio vão juntos no alerta seguinte; nada se perde, nem quando o site é publicado de novo.
4. **O site fora do ar:** se o site ficar 5 minutos sem responder, chega "O site não responde"; quando ele voltar, chega "O site voltou". (O servidor tenta religar o site sozinho a cada 5 minutos; a publicação de uma versão nova deixa o site fora só por alguns segundos e não avisa.)
5. **Os pedidos estranhos não tocam o seu celular.** Robôs da internet testam o site o tempo todo com pedidos malformados ou para endereços que não existem. De 18 a 24/11, 11 dos 13 "erros" foram assim. Agora eles ficam numa linha à parte no cartão ("Fora da conta: N pedidos estranhos") e não contam como erro.
6. **Quem recebe:** o dono e o administrador da rede, nos celulares em que os avisos estão ligados (os mesmos avisos do lote PWA-b, que você ligou no seu celular em 17/11). O gerente e o vendedor não recebem.
7. **Você vê se o aviso está funcionando:** no fim do cartão "Erros do servidor", a frase "Aviso no celular ligado" diz quando o programa que confere o site olhou pela última vez (ele olha a cada minuto) e quando saiu o último alerta. Se esse programa parar, a frase vira um aviso vermelho: "O aviso no celular dos erros está parado".

## As regras que foram escolhidas (e que você pode mudar)

- **Um alerta de erro por hora, no máximo.** Se preferir a cada 30 minutos (ou a cada 2 horas), é só pedir: muda sem programar.
- **O site sem responder vira alerta depois de 5 minutos.** Também muda sem programar.

## O que fica de fora (por isso os dois itens seguem parciais)

- **Se o servidor inteiro cair** (o computador que roda o site), ninguém avisa: o programa que manda os alertas roda nesse mesmo servidor. Para isso é preciso um monitoramento de fora, que também mede o tempo de resposta do site (o outro pedaço que falta no ORA-QUAL-006). Ele ainda está para ser escolhido.
- **A atividade do worker do WhatsApp:** ele continua desligado até a Meta.
- **No ORA-QUAL-013:** o canal pelo qual a loja avisa, os horários, quem atende fora do horário e os prazos (a decisão D-042).

## Os passos (só leitura; nada é gravado)

1. Abra **Gestão → Saúde da operação**.
2. Desça até o cartão **"Erros do servidor"**.
3. No fim do cartão, leia a frase que começa com **"Aviso no celular ligado: o worker dos avisos confere o site a cada minuto"**. Ela diz quando foi a última vez (deve ser "agora há pouco" ou "há 1 min") e se já saiu algum alerta de erro.
4. Se algum robô tiver mandado pedido estranho desde a publicação, aparece também a linha **"Fora da conta: N pedidos estranhos"**.
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/aviso-do-erro-do-servidor.test.ts`, 8 testes): só com o segredo dos avisos; o relato fora do formato é recusado (o instante, a conta, a rota com valores do endereço, o erro sem o último e o último sem erro); sem erro, nada; com erro, um alerta para cada rede ativa, para quem gere as lojas pela rede inteira (o dono e o administrador; o gerente e o vendedor, não), com o endereço da Saúde da operação; o mesmo relato não repete; no máximo um alerta por hora, e os erros desse meio vão no seguinte, mesmo depois de uma publicação; a regra da hora muda sem migration; o site sem resposta só avisa depois de 5 minutos, de novo a cada hora enquanto durar, e a volta avisa; a rede inativa não recebe; a situação só para quem recebe o alerta.
- **Quem não tem acesso** (`packages/banco/src/autorizacao-funcoes.test.ts`): as duas funções novas recusam os 13 tipos de atacante (219 funções conferidas); o visitante sem login só chama o relato, que pede o segredo.
- **No worker** (`apps/worker/src/avisos/erros-do-site.test.ts`, 7 testes): a leitura do site (o relato, o site que responde outra coisa, o que não responde a tempo e o que está fora do ar); o relato fora do formato não vai ao banco; a linha do log só com contagens; e de ponta a ponta, com um site de mentira e o banco de teste: os erros viram o alerta na fila, para o celular do dono.
- **No site** (`apps/plataforma/src/lib/saude/erros-do-servidor.test.ts`, `apps/plataforma/src/app/saude/erros/erros.test.ts` e `apps/plataforma/src/app/operacao/operacao.test.ts`): o pedido estranho fora da conta; o relato sem o texto do erro nem os valores do endereço; o endereço do relato só para quem está dentro do servidor (pelo domínio, 404, mesmo fingindo ser de dentro); e cada frase do aviso na Saúde da operação (ligado, parado, ainda não começou, o site sem resposta, a leitura que falha e quem não recebe).
- **No servidor local** (24/11): o endereço do relato respondeu ao pedido de dentro e deu 404 a cada sinal do Apache (o IP de quem pediu, o domínio, o https e o nome do servidor).
- **No banco do site, sem gravar nada** (24/11): com um segredo trocado só dentro da prova, o relato sem erro não avisou; o com 2 erros pôs 1 alerta na fila ("Erros no servidor do site: 2 erros novos; o último às 09:17, em /vendas/[id]"), para a única rede ativa, sem loja e com o endereço da Saúde da operação; o mesmo relato e o erro seguinte na mesma hora não avisaram; uma hora depois, o erro que esperava foi no alerta seguinte; o segredo errado, o relato fora do formato e a rota com valores foram recusados; recebem o alerta o Dono (teste) e o Administrador (teste) (3 pessoas na rede, com a sua conta); o Gerente (teste) e o Vendedor (teste), não; o site sem resposta agora não avisou, depois de 6 minutos avisou uma vez só, e a volta avisou; o Dono (teste) e o Administrador (teste) leram a situação, e o gerente e o vendedor foram recusados. Tudo foi desfeito no fim: nenhum relato, nenhum alerta do servidor e o segredo igual ao de antes.
- **A prova de leitura no site** (`apps/plataforma/e2e/aviso-do-erro-do-servidor-real.spec.ts`): só abre telas e pede o endereço do relato pelo domínio. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Migration:** `20261124121856_aviso_do_erro_do_servidor` (aplicada no banco da homologação em 24/11, com a reversão guardada): a tabela do relato, as duas funções novas e a permissão do alerta da rede; nenhuma função em uso foi refeita.

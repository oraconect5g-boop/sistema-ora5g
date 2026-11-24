# Roteiro de aceite: lote PAY-014a (o pagamento pelo site com Pix, pela Asaas)

- **Quem faz:** o proprietário.
- **Quando:** em duas vezes. **Agora**, pelo celular, uns 2 minutos: o que já está no ar com o pagamento desligado. **Depois**, quando a chave de teste da Asaas estiver gravada no servidor (pelo comando da lista única, nunca na conversa) e você disser "sim" para ligar o worker dos pagamentos: o ensaio inteiro com o dinheiro de mentira do sandbox da Asaas, uns 10 minutos.
- **O que o lote entrega:** a sua escolha de 24/11 ("pagamento pelo site é simples, vai ser usado o gateway de pagamento da Asaas"). O item ORA-PAY-014 (o Pix e o link pelo provedor) deixa de esperar a escolha e passa a **parcial**: falta a chave, o ensaio no sandbox e o PAY-014b (no balcão, a venda do pedido pago registra o "pago pelo site" sem cobrar de novo). O ORA-ONLINE-002 (o pedido do site) **segue parcial**. **O pagamento pelo site fica desligado até o PAY-014b entrar.**
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## Como vai funcionar (quando ligado)

1. O cliente reserva o pedido no site, como hoje. Na tela do pedido aparece **"Pagar agora com Pix (R$ ...)"**, com "Ou pague na loja, na retirada" logo abaixo.
2. Ao tocar, a tela mostra "Preparando o Pix..." e, em poucos segundos, o botão **"Pagar R$ ... com Pix"**, que abre a página de pagamento da Asaas, com o QR Code e o Pix copia e cola. Quem pede os dados de quem paga é a página da Asaas: o nosso site não guarda CPF nem cartão.
3. Pago o Pix, a Asaas avisa o nosso sistema. O aviso sozinho não confirma nada: o sistema pergunta de novo à Asaas e só então marca **"Pago pelo site"**, conferindo que o pagamento é do link daquele pedido e do valor certo.
4. O pedido pago fica guardado por **7 dias** (o não pago vence em 24 horas, como hoje). Na tela **Reservas do site**, a loja vê **"Pago pelo site em ..."** e a frase "Já pago pelo site: não cobre de novo". O pedido pago não se cancela pelo sistema: se o cliente desistir, o dinheiro volta pela Asaas (o estorno) antes.
5. O link do pedido que venceu ou foi cancelado sem pagar é desativado na Asaas.

## Os passos de agora (só leitura; nada é gravado)

1. Abra `ora5g.com.br/loja`, escolha qualquer produto e vá ao **Carrinho**. Embaixo do formulário, a frase continua: "Você paga na loja, na retirada. O pagamento pelo site ainda não está disponível." É o certo enquanto ele está desligado.
2. Abra `ora5g.com.br/loja/pedido?codigo=ABC234` (é o endereço para onde a Asaas devolve o cliente depois de pagar). O campo **"Código do pedido"** já vem com **ABC234**; o WhatsApp a pessoa digita.
3. Responda **"aceito"** ou **"não aceito"** para esta parte.

## Os passos do ensaio (depois da chave de teste e do seu "sim")

1. Na Asaas, crie a conta de teste (sandbox) e gere a chave de teste (ela começa com `$aact_hmlg_`). Grave no servidor com o comando da lista única (`docs/PENDENCIAS_DO_PROPRIETARIO.md`, seção 4): `ASAAS_AMBIENTE` = sandbox, `ASAAS_API_KEY` e `ASAAS_EMAIL_DOS_AVISOS` (o e-mail que a Asaas avisa se a fila de avisos parar). Nunca mande a chave pela conversa.
2. Diga "sim" para o worker dos pagamentos rodar. Na primeira rodada ele registra o aviso na Asaas, com um token que ele mesmo cria: ninguém vê o token, e o banco guarda só a impressão digital dele.
3. Com o Claude Code, numa das lojas de teste: um pedido de teste, o "Pagar agora com Pix", o pagamento confirmado no painel do sandbox (dinheiro de mentira) e, de volta ao site, **"Pago pelo site"** em "Meu pedido" e em **Reservas do site**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/pagamento-pelo-site.test.ts`, 11 casos, e o inventário de autorização, com as funções novas): desligado, ninguém pede para pagar; ligar só pelo worker; o pedido certo (o código e o WhatsApp juntos) vira um pagamento só; o aviso só passa com o token conferido, guardado uma vez pelo id do evento (que pode trazer "&", como no exemplo oficial da Asaas); só a reconsulta confirma, conferindo o link e o valor; pago, o pedido fica 7 dias e não se cancela pelo sistema (OR048); o pagamento depois do pedido cancelado e o estorno sem pagamento viram divergência para a conciliação.
- **No worker** (`apps/worker/src/pagamentos/`: o cliente da Asaas contra um servidor local no papel da Asaas, o processamento com tudo simulado e o caminho inteiro com o banco de teste): os caminhos, os cabeçalhos e o corpo de cada pedido à Asaas, como a documentação oficial descreve; o resultado desconhecido procura o link antes de criar outro; a chave nunca vai para o log.
- **No site** (`apps/plataforma/src/app/api/pagamentos/asaas/route.test.ts`, `src/app/loja/carrinho/pagamento.test.ts`, `carrinho.test.ts` e `src/app/reservas-do-site/reservas.test.ts`): a rota do aviso repassa ao banco só o token e os campos que o worker usa e responde 200 só depois de guardar; sem o token, 401 sem ir ao banco; cada situação do Pix na tela do cliente; o selo do Pix na tela da loja e a mensagem do pedido pago que não se cancela.
- **A prova de leitura no site** (`apps/plataforma/e2e/pagamento-pelo-site-real.spec.ts`): o aviso recusa sem o token e com um token fictício; "Meu pedido" com o código na volta da Asaas; a loja de teste abre as Reservas do site sem erro. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **A migration** `pagamento_pelo_site` (a tabela dos pagamentos do site, os avisos da Asaas e as funções do worker; a reversão volta tudo ao lote ONLINE-d).

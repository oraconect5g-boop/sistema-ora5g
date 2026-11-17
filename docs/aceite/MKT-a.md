# Roteiro de aceite: lote MKT-a (de onde veio a reserva do site)

- **Quem faz:** o proprietário, em `https://ora5g.com.br`, com o login de dono.
- **Quanto tempo leva:** uns cinco minutos.
- **O que o lote entrega:** o item "origem e UTM do pedido e do lead" da onda 2 do plano de 16/11. Os requisitos ligados são o ORA-ONLINE-003, que passa a testado, e o ORA-META-002, que passa a parcial (o WhatsApp espera a integração oficial).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.
- **No ar:** desde 17/11, às 15:02, no commit `2e3fa24`. O rodapé pode mostrar um commit mais novo, de um lote seguinte.

## O que mudou

1. **A reserva do site guarda de onde o cliente chegou.**
   - **Com um link de campanha:** por exemplo, o anúncio do Instagram com `?utm_source=instagram&utm_campaign=natal`. A reserva guarda "Instagram" e a campanha "natal".
   - **Vindo de outro site:** por exemplo, de uma busca no Google. A reserva guarda "Google".
   - **Sem nenhum dos dois:** a reserva guarda "Direto".
   - **O que não se guarda:** nada que identifique a pessoa. O formulário da reserva avisa isso ao cliente.
2. **A equipe vê de onde veio cada reserva.** Na tela **Reservas do site**, cada reserva tem a linha "Veio de", por exemplo "Instagram · campanha natal".
3. **Os Relatórios ganharam o quadro "Reservas do site por origem".**
   - **O que ele mostra, para o período escolhido:** quantas reservas vieram de cada origem e campanha, quantas foram atendidas e as vendas concluídas que saíram delas, com o valor.
   - **Quem vendeu:** a lista de quem vendeu as reservas do site.
   - **As reservas de antes de hoje** aparecem como "Sem registro".
4. **A venda continua sendo do vendedor que a concluiu, uma vez só.** A origem não cria outra atribuição nem conta duas vezes no bônus ou nas metas.

## Os passos

### 1. O quadro novo nos Relatórios

Entre com o seu login e abra **Relatórios**, no menu.

**Tem de acontecer:** mais abaixo, depois do quadro do Ora Connect, aparece o quadro **"Reservas do site por origem"**. Hoje ele diz "Nenhuma reserva do site no período", porque ainda não houve reserva pelo site.

### 2. A reserva com a origem (quando houver produto no site)

Este passo só dá para fazer quando houver produto com estoque na loja online. Isso depende da carga do estoque da planilha da Rein (lote REIN-a). Se ainda não houver, pule para o passo 3.

1. No celular, abra o link <https://ora5g.com.br/loja?utm_source=instagram&utm_campaign=teste>.
2. Escolha um produto, toque em **Reservar** numa loja e faça a reserva com o seu nome e o seu WhatsApp.
3. Com o login, abra **Reservas do site**, na loja da reserva.

**Tem de acontecer:**

- a reserva aparece com **"Veio de: Instagram · campanha teste"**;
- nos **Relatórios**, o quadro mostra "Instagram · teste" com 1 reserva.

Depois, cancele a reserva na mesma tela, com o motivo "teste do roteiro".

### 3. Responder

Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **Os contatos que chegam pelo WhatsApp.** Eles dependem da integração oficial com a Meta, que espera a habilitação da conta.
- **A oportunidade do CRM.** A reserva não cria oportunidade sozinha. A oportunidade continua guardando a origem e a campanha que quem atende digita.
- **O pedido do site com pagamento.** Ainda não existe; quando existir, guarda a origem do mesmo jeito.

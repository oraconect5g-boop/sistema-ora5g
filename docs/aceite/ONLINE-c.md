# Roteiro de aceite: lote ONLINE-c (a loja online sem erro de servidor)

- **Quem faz:** o proprietário, no celular, em `https://ora5g.com.br`. Não precisa entrar com senha: a loja online é pública.
- **Quanto tempo leva:** uns três minutos.
- **O que o lote entrega:** parte do ORA-ONLINE-001 (a loja online) e do ORA-ONLINE-006 (a reserva do site). É o item 2 da onda 0 do plano de 16/11.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

Quase nada do que se vê. A mudança é no que o banco responde quando alguém abre o endereço de um produto que não está no site.

1. **Antes:** a tela mostrava "Página não encontrada", o que está certo. Mas, por trás, o banco registrava um erro de servidor (o código 500) a cada vez. Um robô que percorresse endereços do site enchia o registro de erros, e um erro de verdade ficaria escondido no meio deles.
2. **Agora:** o banco responde "não tem", sem erro, e a tela continua mostrando "Página não encontrada".
3. Se o banco falhar de verdade, a tela diz **"A loja online está fora do ar agora"**. Essa mensagem não pode aparecer nos passos abaixo.

## Antes de começar

- Hoje nenhum produto está marcado para o site. Por isso a loja online mostra "Em breve".
- Os endereços dos passos 2 e 3 usam, de propósito, um código de produto que não existe.
- Confira a versão no ar: abra <https://ora5g.com.br/entrar>. No fim da página, abaixo de "Ver a demonstração", aparece `ora5G · v0.1.0 · commit · build`. O lote foi ao ar no commit `dc12dce`, em 17/11. O rodapé pode mostrar um commit mais novo, que só muda documentos: vale o que o Claude Code informou ao pedir o aceite.

## Os passos

### 1. Abrir a loja online

Abra <https://ora5g.com.br/loja>.

**Tem de acontecer:** abre a página "Celulares e acessórios, com retirada na loja", com o campo de busca e o aviso **"Em breve"**.

### 2. Abrir um produto que não está no site

Abra <https://ora5g.com.br/loja/00000000-0000-4000-8000-000000000001>.

**Tem de acontecer:** abre a página com **"404"** e **"Página não encontrada"**, e o botão "Ir para a página inicial". Não pode aparecer "A loja online está fora do ar agora" nem uma página de erro.

### 3. Abrir a reserva de um produto que não está no site

Abra este endereço (é comprido: toque nele ou copie inteiro):

<https://ora5g.com.br/loja/00000000-0000-4000-8000-000000000001/reservar?variante=00000000-0000-4000-8000-000000000001&loja=00000000-0000-4000-8000-000000000001>

**Tem de acontecer:** a mesma página "Página não encontrada" do passo 2.

### 4. Voltar à loja online

Abra de novo <https://ora5g.com.br/loja>.

**Tem de acontecer:** a mesma página do passo 1. A loja continua no ar.

### 5. Responder

Responda **"aceito"** ou **"não aceito"**.

## O que você não vê no celular (medido pelo Claude Code)

A diferença está na resposta do banco. Foi medida pela internet, como um visitante sem login, com códigos sorteados que não existem. Nada foi gravado.

| O que | Antes (17/11, 01:06) | Depois (17/11, 04:16) |
|---|---|---|
| Detalhe de um produto fora do site | erro de servidor (500) | resposta vazia, sem erro (200) |
| Reserva de um produto fora do site | erro de servidor (500) | pedido recusado (400), com o código próprio `OR036` |

**Conferido depois da publicação** (17/11, 09:10): o Claude Code abriu os passos 1, 2 e 3 pela internet, num navegador com a tela do tamanho de um celular. Os passos 2 e 3 mostraram "Página não encontrada". No registro da homologação, as duas consultas desse produto ao banco tiveram resposta normal (200), e nenhuma resposta 500 apareceu. O registro do banco, no Supabase, confirma: nenhuma resposta 500 nas consultas da loja online desde a mudança no banco (17/11, 04:14).

## O que este roteiro não cobre

- **Um produto de verdade no site.** Nenhum está marcado ainda. A página e a reserva de um produto que está no site não mudaram neste lote e seguem cobertas pelos testes automáticos.
- **As telas com login.** No banco, 114 funções das telas com login e dos serviços internos ainda dizem "não encontrado" com o código antigo, e cada resposta dessas fica registrada como erro de servidor (500). O visitante não alcança nenhuma delas. Trocar o código nelas é um lote à parte.
- **A página "não encontrada" da loja.** Ela é a mesma da plataforma, e o botão leva à página inicial da plataforma. Uma página própria da loja online fica para o lote da loja online.

Por isso o ORA-ONLINE-001 e o ORA-ONLINE-006 continuam "parcial" mesmo com o "aceito".

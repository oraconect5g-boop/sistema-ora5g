# Roteiro de aceite: lote VEL-a (telas com login mais rápidas)

- **Quem faz:** o proprietário, no celular, com a conta do dono, em `https://ora5g.com.br`.
- **Quanto tempo leva:** uns dez minutos.
- **O que o lote entrega:** parte do ORA-QUAL-010 (desempenho no celular) e do ORA-POS-002 (busca rápida e carrinho). Decisão ligada: D-047 (metas de desempenho).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. Abrir uma tela com login pede menos idas ao banco. A sessão e o menu vêm numa ida só. O PDV lê o caixa, a venda e o carrinho em outra.
2. Todo botão que envia alguma coisa trava no toque e mostra um texto de espera ("Adicionando…", "Tirando…").
3. Toda tela do menu mostra um desenho cinza da própria tela no toque, enquanto os dados chegam.

## Antes de começar

- Use a loja **Santa Cândida (teste)**. Tudo ali é dado de teste: nenhuma venda é de verdade.
- Nessa loja o seu caixa já está aberto e existe uma venda em andamento, sem itens (a nº 3).
- Confira a versão no ar: toque em **Mais**, na barra de baixo. No fim da lista aparece `ora5G · v0.1.0 · commit · build`. O lote foi ao ar no commit `087ef53`, em 17/11. O rodapé pode mostrar um commit mais novo, que só muda documentos: vale o que o Claude Code informou ao pedir o aceite.
- O log de tempos fica ligado enquanto você faz o roteiro. Ele grava o caminho, a duração e o código da resposta de cada ida ao banco, e nada do que você digita (nem a busca, nem a senha). O Claude Code lê o log depois e preenche a tabela de "depois" em `docs/operacao/DESEMPENHO_NO_CELULAR.md`.

## Os passos

### 1. Sair e entrar de novo

Toque em **Mais** e em **Sair**. Na tela de entrada, preencha e-mail e senha e toque em **Entrar na plataforma**. Se o sistema pedir o código de segurança, digite.

**Tem de acontecer:** o botão **Sair** mostra "Saindo…". O botão de entrada trava e mostra **"Entrando…"**. Depois abre "Em qual loja você está?".

### 2. Escolher a loja

Toque em **Santa Cândida (teste)**.

**Tem de acontecer:** o botão trava e mostra "Aguarde…". Abre o Início, com "Santa Cândida (teste)" no alto.

### 3. Abrir o PDV

Toque em **Vender**, na barra de baixo.

**Tem de acontecer:** no toque aparece o desenho cinza da tela. Em seguida abre o PDV, com "Santa Cândida (teste)" acima de "Vender" e o cartão **"Venda nº 3"**, "Em andamento". Se aparecer o botão **Nova venda**, toque nele: ele mostra "Abrindo a venda…" e o cartão da venda abre.

Antes: 2,5 a 2,8 s. Meta proposta: até 1,5 s.

### 4. Buscar um produto

No campo "Produto, marca, SKU, código de barras ou IMEI/ICCID", digite `capa` e toque em **Buscar**.

**Tem de acontecer:** o botão mostra "Buscando…" e o carrinho continua na tela. Aparece "Capa de proteção", `ACE-0001 · R$ 79,00`, com o botão **Adicionar**.

Antes: 4,7 s. Meta proposta: até 2 s.

### 5. Adicionar ao carrinho

Toque em **Adicionar**.

**Tem de acontecer:** o botão trava e mostra **"Adicionando…"**. A capa aparece no cartão "Carrinho" e o campo da busca volta vazio.

Antes: 3,6 s. Meta proposta: até 2 s.

### 6. Tirar do carrinho

No cartão "Carrinho", toque em **Tirar**.

**Tem de acontecer:** o botão trava e mostra **"Tirando…"**. O carrinho volta a dizer "Busque um produto para começar."

Antes: 5,9 s. Meta proposta: até 2 s.

### 7. Adicionar de novo e concluir em dinheiro

Busque `capa` e toque em **Adicionar** outra vez. No cartão "Pagamento", deixe o meio em dinheiro e o valor que já vem preenchido (R$ 79,00). Toque em **Concluir venda**.

**Tem de acontecer:** o botão trava e mostra **"Confirmando a venda no sistema…"**. Abre a tela da venda com o aviso verde "Venda concluída: Estoque baixado e pagamento registrado no seu caixa."

Meta proposta: até 3 s.

### 8. Passear pelas telas mais usadas

Toque em **Vendas**, na barra de baixo. Depois, por **Mais**, abra **Estoque e conferência**, **Catálogo e fotos**, **Clientes** e **Caixa**, uma de cada vez.

**Tem de acontecer:** em cada toque o desenho cinza aparece na hora e a tela abre em seguida. Nenhuma tela fica parada sem resposta.

Antes: Caixa 1,2 s; Clientes 1,8 s; as outras, 2,5 a 2,8 s. Neste lote elas ganharam a sessão e o menu numa ida só. A leitura única de cada uma vem no lote seguinte (VEL-b); a meta proposta de até 2 s vale a partir dele.

### 9. Um botão de outra tela

Em **Estoque e conferência**, digite `capa` na busca e toque em **Buscar**.

**Tem de acontecer:** o botão trava e mostra "Buscando…". A capa aparece com uma unidade a menos do que antes da venda do passo 7.

### 10. Responder

Responda **"aceito"** ou **"não aceito"**. Se mediu os tempos, mande junto.

## Tempos (opcional, mas ajuda)

Para comparar com 16/11, meça do mesmo jeito daquele dia: mesmo navegador, mesma internet.

| O que | Antes (16/11) | Meta proposta | Depois |
|---|---:|---:|---:|
| Abrir o PDV (`/vender`) | 2,5 a 2,8 s | até 1,5 s | |
| Buscar no PDV (`/vender` com busca) | 4,7 s | até 2 s | |
| Botão "Adicionar" | 3,6 s | até 2 s | |
| Botão "Tirar" | 5,9 s | até 2 s | |
| Botão "Concluir venda" | não medido | até 3 s | |
| `/vendas`, `/estoque`, `/catalogo` | 2,5 a 2,8 s | até 2 s, com o VEL-b | |
| `/clientes` | 1,8 s | até 2 s | |
| `/caixa` | 1,2 s até o primeiro byte | até 2 s | |

As metas são propostas (D-047): você aprova ou muda. O aceite deste lote olha o PDV e as ações do carrinho.

## O que este roteiro não cobre

Estes três pontos do lote continuam abertos e não dependem do seu aceite:

- **O teste automático no celular que adiciona, tira e conclui uma venda.** Precisa de uma conta de teste, e criar a conta precisa da chave secreta do Supabase gravada no servidor.
- **A medida das telas com login feita por script.** Depende da mesma conta de teste.
- **O teste no celular e na internet da loja piloto, com o vendedor.** É da piloto.

Por isso o ORA-QUAL-010 e o ORA-POS-002 continuam "parcial" mesmo com o "aceito".

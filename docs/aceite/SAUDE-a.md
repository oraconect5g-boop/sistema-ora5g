# Roteiro de aceite: lote SAUDE-a (o que é fila na Saúde da operação, e a página /saude lendo o banco)

- **Quem faz:** o proprietário, no celular, em `https://ora5g.com.br`, com a conta de dono.
- **Quanto tempo leva:** uns cinco minutos.
- **O que o lote entrega:** o item 6 da onda 0 do plano de 16/11. A decisão está escrita no [ADR-012](../adr/ADR-012-o-que-e-fila-e-a-leitura-do-banco-na-saude.md). Os requisitos ligados são o ORA-QUAL-006 e o ORA-FISC-008. Nenhum deles muda de estado.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.
- **No ar:** desde 17/11, às 12:28, no commit `7e1ff5f`. O rodapé pode mostrar um commit mais novo, de um lote seguinte.

## O que mudou

1. **A venda concluída sem o pedido da nota virou fila.**
   - Ela aparece na Saúde da operação como **"Vendas sem pedido de nota"**, com quantas são e há quanto tempo está a mais antiga.
   - Só o dono e a gerência veem essa fila.
   - Tocar nela leva à conciliação das notas, onde está a lista.
2. **O estoque abaixo do mínimo não é fila, e agora isso está dito na tela.**
   - Ele aparece na Saúde da operação num quadro à parte, **"Estoque abaixo do mínimo"**, como aviso, com o mesmo número do Início.
   - Ele não entra em "Itens esperando": não espera a decisão de ninguém e some quando o estoque volta ao mínimo, com compra ou transferência.
3. **A página `/saude` lê o banco.** Sem login, ela mostra:
   - quanto o banco levou para responder;
   - se o banco tem a última alteração que esta versão do sistema espera.

   Se o banco não responder, ou se faltar essa alteração, o topo da página fica vermelho. Ela não mostra dado de ninguém.

## Antes de começar

- Confira a versão no ar: na tela de entrada, no fim da página, aparece `ora5G · v0.1.0 · commit · build`. O Claude Code informa o commit ao pedir o aceite.
- No banco de teste há **uma venda concluída sem o pedido da nota**: a de 16/11, na Santa Cândida (teste). Por isso a fila nova deve mostrar 1.

## Os passos

### 1. A página de saúde

Abra <https://ora5g.com.br/saude>.

**Tem de acontecer:**

- no topo, em verde: "Em funcionamento";
- "Banco de dados: respondeu em" um número de milissegundos (ms);
- "Migrations: em dia com esta versão";
- a tela não corre para o lado.

### 2. Entrar

Abra <https://ora5g.com.br/entrar> e entre com a sua conta de dono, na loja **Santa Cândida (teste)**.

**Tem de acontecer:** abre o Início. Anote o número de "Estoque abaixo do mínimo", se aparecer.

### 3. Abrir a Saúde da operação

Toque em **Mais** e depois em **"Saúde da operação"**.

**Tem de acontecer:** em "O que está parado", aparece **"Vendas sem pedido de nota"**, com 1 e "há 1 dia" (ou mais, conforme o dia em que você fizer o roteiro).

### 4. A fila leva à conciliação

Toque em **"Vendas sem pedido de nota"**.

**Tem de acontecer:** abre a conciliação das notas, e a venda de 16/11, da Santa Cândida (teste), aparece em "Vendas sem pedido de nota".

### 5. O aviso do estoque

Volte para a Saúde da operação e desça a tela.

**Tem de acontecer:**

- aparece o quadro **"Estoque abaixo do mínimo"**, com a frase "Um aviso, não uma fila";
- o número é o mesmo do Início, do passo 2. Se o Início não mostrou o aviso, o quadro diz "Nenhum produto abaixo do mínimo";
- o número do estoque **não** entra em "Itens esperando", no topo.

### 6. Responder

Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **Aviso fora da tela**, quando uma fila passa do limite: depende do site instalável com notificação (Onda 1).
- **Erros do sistema e tempo de resposta das telas:** dependem do monitoramento do servidor, a escolher.

# Roteiro de aceite: lote ENTREGAS-a (o botão Comprar e a tela de entregas)

- **Quem faz:** o proprietário, no celular, em `https://ora5g.com.br`, com a conta de dono.
- **Quanto tempo leva:** uns cinco minutos.
- **O que o lote entrega:** dois pedidos da revisão do Codex de 16/11 (o adendo da loja, dos canais e da publicação):
  - **A01:** o botão "Comprar" no topo do site, separado do "Entrar". Faz parte do ORA-ONLINE-001.
  - **A18:** uma tela para você acompanhar as entregas do projeto. Ela não tem um número próprio entre os 179 requisitos.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **A página inicial** ganhou o botão **"Comprar"** no topo, ao lado de **"Entrar"**:
   - "Comprar" leva à loja online, para quem quer comprar;
   - "Entrar" continua levando à plataforma, para a equipe.
2. **A tela "Entregas do projeto"**, no menu Gestão, só para o dono e o administrador, mostra:
   - quantos requisitos estão homologados, de 179;
   - quais lotes esperam o seu aceite;
   - um gráfico com a situação dos 179 requisitos;
   - cada lote, do mais novo para o mais antigo: o que entregou, desde quando está no ar, quando o aceite foi pedido, a sua resposta e o link do roteiro;
   - a versão que está no ar.

   Os números saem do registro do projeto, o mesmo que o Claude Code atualiza a cada lote. Ninguém digita nada nessa tela.

## Antes de começar

- Confira a versão no ar: na tela de entrada, no fim da página, aparece `ora5G · v0.1.0 · commit · build`. O Claude Code informa o commit ao pedir o aceite.

## Os passos

### 1. O botão Comprar

Abra <https://ora5g.com.br>.

**Tem de acontecer:**

- no topo aparecem "Comprar" e "Entrar", lado a lado;
- a tela não corre para o lado.

### 2. Comprar leva à loja

Toque em **"Comprar"**.

**Tem de acontecer:** abre a loja online ("Celulares e acessórios, com retirada na loja"). Hoje ela mostra "Em breve", porque nenhum produto está marcado para o site.

### 3. Entrar leva à plataforma

Volte, toque em **"Entrar"** e entre com a sua conta de dono, na loja **Santa Cândida (teste)**.

**Tem de acontecer:** abre o Início da plataforma, como sempre.

### 4. Abrir as entregas

Toque em **Mais** e depois em **"Entregas do projeto"**.

**Tem de acontecer:** abre a tela "Entregas do projeto" com três quadros:

- "Homologados", com o número de 179;
- "Esperando o seu aceite", com os lotes;
- "Testados em desenvolvimento".

### 5. O gráfico e os lotes

Desça a tela.

**Tem de acontecer:**

- aparece o gráfico "Os 179 requisitos", com uma barra para cada situação;
- aparece a lista "Lotes com roteiro de aceite", com o mais novo primeiro;
- cada lote tem a situação ("Esperando o seu aceite" ou outra) e "Ver o roteiro de aceite".

### 6. Um roteiro

Toque em **"Ver o roteiro de aceite"** de qualquer lote.

**Tem de acontecer:** abre o roteiro daquele lote, no GitHub.

### 7. A versão

Volte e vá até o fim da tela de entregas.

**Tem de acontecer:** aparece "Versão no ar agora:", com o mesmo commit do rodapé.

### 8. Responder

Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **A compra na loja online.** O botão leva à loja, mas a compra com pagamento é de um lote da Onda 3 e depende do contrato de um meio de pagamento.
- **Atualização sozinha da tela.** Os números mudam quando o Claude Code registra um lote e publica. Se você responder um aceite agora, ele aparece na tela na publicação seguinte.

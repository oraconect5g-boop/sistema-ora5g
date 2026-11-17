# Roteiro de aceite: lote ROT-a (as rotinas automáticas do banco)

- **Quem faz:** o proprietário, no celular, em `https://ora5g.com.br`, entrando com a conta de dono.
- **Quanto tempo leva:** uns dez minutos, com cinco de espera no passo 5.
- **O que o lote entrega:**
  - o vencimento automático das reservas (ORA-INV-005);
  - parte da reserva do site (ORA-ONLINE-006): as vencidas saem sozinhas;
  - parte da Saúde da operação (ORA-QUAL-006): as rotinas aparecem nela.

  É o item 3 da onda 0 do plano de 16/11.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** nenhuma rotina rodava sozinha. Uma reserva vencida, do balcão ou do site, continuava segurando o aparelho até alguém mexer no mesmo produto ou abrir o PDV da loja.
2. **Agora:** o próprio banco confere as reservas a cada 5 minutos e solta as vencidas. Cada rodada fica anotada.
3. Na **Saúde da operação** aparece o cartão **"Rotinas automáticas"**, com:
   - cada rotina;
   - de quanto em quanto tempo ela roda;
   - quando foi a última rodada certa.

   Se uma rotina falhar ou atrasar, aparece um aviso vermelho no topo da tela.

## Antes de começar

- Entre com a sua conta de dono e escolha a loja **Santa Cândida (teste)**.
- Confira a versão no ar: toque em **Mais**, na barra de baixo. No fim da lista aparece `ora5G · v0.1.0 · commit · build`. O Claude Code informa o commit ao pedir o aceite.

## Os passos

### 1. Abrir a Saúde da operação

Toque em **Mais** e depois em **Saúde da operação**.

**Tem de acontecer:** abre a tela "Saúde da operação", com as filas e, mais abaixo, o cartão **"Rotinas automáticas"**.

### 2. Ver o vencimento das reservas

No cartão "Rotinas automáticas", procure **"Vencimento das reservas (PDV e site)"**.

**Tem de acontecer:**

- aparece "a cada 5 minutos";
- aparece "última rodada certa", seguido de "agora há pouco" ou de "há 1 min" até "há 5 min";
- o selo verde diz **"Em dia"**.

### 3. Ver a limpeza do registro

No mesmo cartão, procure **"Limpeza do registro das rotinas"**.

**Tem de acontecer:** aparece "todo dia às 03:30". O selo depende de quando você abre:

- antes da primeira madrugada depois da publicação: **"Aguardando a 1ª rodada"**;
- depois dela: **"Em dia"**.

### 4. Conferir que não há aviso

Volte ao topo da tela.

**Tem de acontecer:** **não** aparece o aviso vermelho dizendo que uma rotina automática do banco pede atenção.

### 5. Recarregar depois de alguns minutos

Espere uns 5 minutos e recarregue a tela: puxe a tela para baixo, ou feche e abra de novo.

**Tem de acontecer:** no vencimento das reservas, o "há N min" volta a um número pequeno. Isso mostra que a rotina rodou de novo sozinha.

### 6. Responder

Responda **"aceito"** ou **"não aceito"**.

## O que você não vê no celular (medido pelo Claude Code)

- **No banco de desenvolvimento:** a primeira rodada automática foi em 17/11, às 09:45:00. Ela deu certo, não havia reserva vencida para soltar, e levou 7 milésimos de segundo. O agendador anotou a tarefa como concluída.
- **Nos testes automáticos,** que provam o resto:
  - a reserva vencida do balcão e a do site saem na rodada, e o aparelho volta a ficar livre;
  - uma falha fica anotada com o código do erro e aparece como **"Com falha"**;
  - duas rodadas ao mesmo tempo não repetem o trabalho;
  - um aparelho preso por uma venda em andamento fica para a rodada seguinte, sem travar a rotina;
  - só o dono e a gerência veem as rotinas.

## O que este roteiro não cobre

- **Ver uma reserva vencer de verdade.** Isso pede uma reserva feita e 15 minutos de espera. Os testes automáticos cobrem esse caso.
- **A limpeza das fotos.** Ela apaga arquivos no armazenamento de fotos, fora do banco, e continua manual pelo cartão "Arquivos sem registro".
- **Um aviso fora da tela** quando uma rotina falha, no celular, sem abrir o sistema. Ele fica para o aviso no celular (o site instalável, na Onda 1).

Por isso o ORA-ONLINE-006 e o ORA-QUAL-006 continuam "parcial" mesmo com o "aceito". O ORA-INV-005 fica inteiro.

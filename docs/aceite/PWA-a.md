# Roteiro de aceite: lote PWA-a (o Ora 5G na tela inicial do celular)

- **Quem faz:** o proprietário, no celular, em `https://ora5g.com.br`.
- **Quanto tempo leva:** uns cinco minutos.
- **O que o lote entrega:** a primeira parte do item 7 da onda 1 do plano de 16/11, que é o site instalável. Os requisitos ligados são o ORA-QUAL-010 e o ORA-POS-015, e nenhum deles muda de estado.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo, o celular (Android ou iPhone) e o que aconteceu.
- **No ar:** desde 17/11, às 13:51, no commit `ccdf342`. O rodapé pode mostrar um commit mais novo, de um lote seguinte.

## O que mudou

1. **O Ora 5G pode ficar na tela inicial do celular**, com o ícone "5G" e o nome "Ora 5G". Aberto por ali, ele ocupa a tela inteira, sem a barra do navegador, e começa no Início.
2. **Sem internet, aparece uma página clara**, "Sem internet agora", em vez do erro do navegador. Ela lembra que o que já foi gravado continua no sistema e tem o botão "Tentar de novo".
3. **Nada é feito sem internet.** O sistema não guarda vendas nem telas no celular: vender, consultar o estoque e aprovar continuam precisando da internet, como foi decidido no projeto.

## Os passos

### 1. Instalar

Abra <https://ora5g.com.br> no navegador do celular.

- **Android (Chrome):** toque nos três pontinhos, no canto de cima, e em **"Instalar app"** ou **"Adicionar à tela inicial"**. Confirme.
- **iPhone (Safari):** toque em **Compartilhar** (o quadrado com a seta para cima) e em **"Adicionar à Tela de Início"**. Confirme.

**Tem de acontecer:** aparece na tela inicial o ícone azul-escuro com "5G" em verde-água e o nome "Ora 5G".

### 2. Abrir pelo ícone

Toque no ícone "Ora 5G".

**Tem de acontecer:**

- o sistema abre em tela cheia, sem a barra de endereço do navegador;
- abre a tela de entrada ou, se você já tinha entrado, o Início.

### 3. Sem internet

Ligue o **modo avião**. Com o Ora 5G aberto, toque num item do menu (por exemplo, Início).

**Tem de acontecer:** aparece a página **"Sem internet agora"**, com o texto "O Ora 5G precisa de internet para vender, consultar o estoque e aprovar" e o botão **"Tentar de novo"**.

### 4. A volta da internet

Desligue o modo avião e toque em **"Tentar de novo"**.

**Tem de acontecer:** a tela volta ao normal.

### 5. Responder

Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **O aviso no celular** de desconto, nota ou saída de caixa para aprovar (Web Push). É a segunda parte do mesmo item do plano. Ela precisa de um par de chaves de envio de avisos, que é uma credencial, e por isso espera a sua autorização.
- **Vender sem internet.** Não existe, de propósito: a venda só vale quando o banco grava.

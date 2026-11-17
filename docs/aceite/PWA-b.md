# Roteiro de aceite: lote PWA-b (o aviso no celular para aprovar num toque)

- **Quem faz:** o proprietário, no celular, em `https://ora5g.com.br`, com o login de dono.
- **Quanto tempo leva:** uns cinco minutos.
- **O que o lote entrega:** a segunda parte do item 7 da onda 1 do plano de 16/11 (o objetivo "o dono aprova em um toque"). Os requisitos ligados são o ORA-REPORT-002 e o ORA-QUAL-006, e o estado deles não muda.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo, o celular (Android ou iPhone) e o que aconteceu.
- **No ar:** desde 17/11, às 16:22, no commit `252bcad`. O rodapé pode mostrar um commit mais novo, de um lote seguinte.
- **Resposta do proprietário:** **aceito**, em 17/11, depois do aviso de teste entregue no celular dele (Android · Chrome) às 18:04. O caminho pelo menu, "Avisos no celular", entrou no mesmo dia, às 17:58.

## O que mudou

1. **Os avisos se ligam em cada celular**, em **Minha conta → Avisos no celular**.
2. **O aviso chega em quem decide, menos em quem pediu**, quando um destes pedidos espera decisão:
   - **desconto para aprovar:** vai para quem aprova desconto na loja;
   - **nota para aprovar:** vai para quem aprova nota;
   - **saída de caixa para autorizar:** vai para quem confere o caixa.
3. **Tocar no aviso abre a tela da aprovação:** Aprovações, Notas ou Caixa.
4. **O aviso leva só a loja e o número da venda (ou o valor da saída).** Nome de cliente não vai.
5. **As chaves dos avisos foram geradas no servidor em 17/11**, com a sua autorização. O valor delas não passou pelo chat.

## Antes de começar

- **O envio dos avisos roda a cada minuto no servidor** desde 17/11, às 16:32, com a sua autorização.
- **O aviso de teste chega em até um minuto** depois do pedido.

## Os passos

### 1. Ligar os avisos

- **Android:** abra <https://ora5g.com.br> no Chrome.
- **iPhone:** abra pelo ícone do Ora 5G instalado na tela inicial (roteiro PWA-a). No Safari aberto direto, o iPhone não recebe avisos de site.

Entre com o seu login e escolha a loja do turno. No menu, toque em **"Avisos no celular"**:

- **no celular:** na barra de baixo, toque em **Mais**; o item fica no fim da lista;
- **no computador:** toque no seu nome, no alto da tela.

Ou abra direto o endereço **ora5g.com.br/conta/avisos**. Depois:

1. Toque em **"Receber avisos neste celular"**.
2. Quando o celular perguntar, toque em **"Permitir"**.

**Tem de acontecer:**

- aparece "Pronto: este celular recebe os avisos";
- o selo muda para "avisos ligados";
- o seu celular aparece na lista, por exemplo "Android · Chrome".

### 2. O que você recebe

**Tem de acontecer:** a tela diz que o aviso chega quando houver um desconto, uma nota ou uma saída de caixa para decidir numa loja sua.

### 3. O aviso de teste

Toque em **"Mandar um aviso de teste"**.

**Tem de acontecer:** em até um minuto chega no celular o aviso **"Aviso de teste"**. Tocar nele abre o Início do Ora 5G.

### 4. Desligar, se quiser

Toque em **"Desligar neste celular"**.

**Tem de acontecer:**

- aparece "Este celular não recebe mais os avisos";
- o celular sai da lista.

Ligue de novo, se quiser continuar recebendo.

### 5. Responder

Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **O aviso de um pedido de verdade.** Ele precisa de outra pessoa pedindo um desconto, uma nota ou uma saída de caixa numa loja. Hoje não há conta de teste para isso: depende da chave secreta do Supabase no servidor. Quem pede nunca recebe o aviso do próprio pedido.
- **O aviso quando uma fila passa do limite.** O canal agora existe; a regra de quando avisar fica para um lote seguinte.

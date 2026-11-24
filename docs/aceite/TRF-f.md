# Roteiro de aceite: lote TRF-f (a transferência em andamento não some da tela)

- **Quem faz:** o proprietário (ou um gerente de loja, com ele junto).
- **Quando:** agora, pelo celular, uns 5 minutos. Só lê: nada é pedido, enviado nem recebido.
- **O que o lote entrega:** os achados F24-01 a F24-04 da revisão do Codex de 24/11, na jornada do estoque e da transferência (J03 e J04). O item ORA-INV-007 (transferências) **segue testado**, agora sem esse defeito; falta o seu aceite.
  - **F24-01 (o mais grave):** a tela de Transferências mostrava só as 50 mais novas, de qualquer situação. Um pedido antigo, ainda reservando estoque, sumia da tela atrás de 50 canceladas mais novas. Agora a tela tem duas partes: **Em andamento**, que sempre aparece, e **Histórico**, cada uma com a contagem e as suas páginas. E dá para **achar uma transferência pelo número**.
  - **F24-02:** no saldo da loja, o que estava reservado aparecia como "em venda", mas a reserva também vem de transferência. Agora diz **"reservado"**.
  - **F24-03:** ao abrir um produto na lista do estoque, a busca e a página se perdiam. Agora o **nome do produto** (e o "na rede") abre "Onde tem" **mantendo a busca e a página**, e **"fechar"** volta para a mesma lista.
  - **F24-04:** o botão "Registrar envio" só pedia a transferência, não enviava. Agora se chama **"Pedir a transferência"**, e as duas telas explicam os passos: **pedir** (reserva na origem) → **separar** → **enviar** (sai do físico) → **receber** (entra no destino).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## Os passos (só leitura)

1. Entre com a sua conta, escolha uma loja e abra **Estoque → Transferências**. Confira os títulos **"Em andamento (N)"** e **"Histórico (N)"** e o texto dos passos (pedir → separar → enviar → receber).
2. Em **"Achar pelo número"**, digite o número de uma transferência que você conhece (por exemplo, 1) e toque em **"Achar"**. Aparece só ela; **"Ver todas"** volta para a lista.
3. Abra **Estoque**, busque um produto pelo nome e toque no **nome** de um resultado. O cartão **"Onde tem"** abre em cima da mesma lista, com a busca mantida. Toque em **"fechar"**: a lista continua com a busca.
4. Em **"Onde tem"**, confira o botão **"Pedir a transferência"** na sua loja (não toque nele) e a frase "o envio é um passo depois, na tela Transferências".
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/transferencias-tela.test.ts`): o teste do Codex (1 pedido e 50 cancelados mais novos: o pedido segue na tela), mais de 50 em andamento divididas em páginas sem repetir, a busca pelo número só para a origem e o destino (a loja de fora não vê), e a recebida com divergência em andamento até tudo o que faltou ter destino. As regras do estoque (reservar, enviar, receber) não mudaram: só a leitura.
- **No site** (os testes da tela e da leitura): as páginas de cada parte, a navegação que guarda a página da outra parte e o número fora da forma ignorado.
- **No domínio** (`e2e/transferencias-abertas-real.spec.ts`, só lê): as duas partes, a busca pelo número 1, o estoque abrindo o produto e voltando à lista.
- **A reversão** volta a função de antes (provado no teste das migrations, que aplica e desfaz).

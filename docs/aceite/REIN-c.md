# Roteiro de aceite: lote REIN-c (a diferença entre o físico e o disponível na carga do estoque)

- **Quem faz:** o proprietário.
- **Quando:** quando duas coisas estiverem prontas: a planilha da Rein no servidor e a conta do administrador (ela espera a chave secreta do Supabase no servidor). Até lá, este roteiro é só de leitura.
- **Quanto tempo leva:** uns 10 minutos, com a planilha.
- **O que o lote entrega:** o achado F18-03 da reanálise do Codex de 18/11, na carga do estoque inicial (ORA-INV-004).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **Antes:** um acessório com 10 na loja e 8 livres (o "disponível" da Rein) entrava com as 10 livres para vender. As 2 de diferença podiam estar reservadas para um cliente ou a caminho de outra loja.
2. **Agora a linha fica parada, esperando a sua decisão.** A carga não se aplica enquanto houver linha sem decisão. Para cada linha, há três decisões possíveis:
   - **lançar só o disponível (8):** as 2 ficam fora até alguém contar, pelo inventário;
   - **lançar o físico (10):** você conferiu na loja e as 2 estão lá, livres;
   - **deixar a linha de fora:** nada entra dela agora.
3. **Cada decisão pede um motivo.** O sistema guarda quem decidiu, quando e o texto.
4. **Para muitas linhas, há a decisão de uma vez.** Ela só oferece as duas decisões que não liberam o que pode estar comprometido. Lançar o físico é sempre linha a linha.
5. **Os aparelhos e os chips** continuam entrando pela Entrada de mercadoria, com o IMEI. Se tiverem diferença, a linha avisa para conferir quais unidades estão reservadas antes de dar a entrada.

## Os passos (com a planilha no servidor e a conta do administrador)

1. **Com a conta do administrador:**
   - abra **Estoque e catálogo → Cadastro de produtos → Importar planilha → "Estoque de cada loja"** (ou direto em `/estoque/carga`) e gere a prévia da Santa Cândida;
   - abra a carga: ela abre em **"Físico maior que o disponível"**, se houver alguma linha assim;
   - decida uma linha com "lançar só o disponível" e escreva o motivo;
   - confira que aparece "Decisão: Lançar só o disponível", com o seu nome e a hora.
2. **Com a sua conta (o dono):**
   - abra a mesma carga;
   - enquanto houver linha sem decisão, no lugar do botão "Aplicar a carga" aparece o aviso para decidir antes;
   - quando todas tiverem decisão, aplique;
   - o estoque da loja recebe o que foi decidido. Na linha de 10 com 8 livres e "lançar só o disponível", entram 8.
3. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/estoque-carga.test.ts`):
  - cada decisão lança o que foi decidido (8, 10 ou nada);
  - a carga com linha sem decisão é recusada;
  - desfazer devolve o que entrou;
  - o vendedor e outra rede não decidem;
  - a decisão de uma vez não aceita "lançar o físico";
  - a auditoria guarda cada decisão.
- **Na tela** (`apps/plataforma/src/app/estoque/carga/carga.test.ts`):
  - a vista das diferenças, com o formulário e as decisões;
  - o aviso no lugar de "Aplicar";
  - cada recusa do banco vira a mensagem certa.
- **Na segurança** (`packages/banco/src/autorizacao-funcoes.test.ts`): a função nova recusa os 13 tipos de atacante do inventário.

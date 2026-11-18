# Roteiro de aceite: lote AUD-b (os dois defeitos da importação apontados pela reanálise de 18/11)

- **Quem faz:** o proprietário. Este roteiro é só de leitura, até a planilha da Rein chegar ao servidor.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** os achados F18-01 e F18-02 da reanálise do Codex de 18/11, na importação de produtos (ORA-CAT-002) e na carga do estoque (ORA-INV-004). Também corrige a tela "Entregas do projeto" e a lista de dependências (F18-04).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **A quantidade fracionária não vira centenas de unidades.** Antes, no Excel, a célula numérica 0,625 virava 625 unidades na carga do estoque. Agora:
   - o número do Excel vale pelo que é;
   - fração, como 0,625 ou 1,5, vai para "conferir" e nada entra do estoque daquela linha;
   - o texto continua na regra brasileira: "1.234" é mil duzentos e trinta e quatro.
2. **O preço e o custo também.** Antes, um custo do Excel com três casas, como 12,345, virava R$ 12.345,00. Agora a linha mostra "Custo com mais de duas casas decimais: confira na planilha", e nada é arredondado sem aviso.
3. **A última linha só sai sozinha quando é rodapé comprovado.** Comprovado quer dizer:
   - tem a palavra "Total"; ou
   - só tem números, pelo menos um deles é a soma das linhas de cima, e não tem código de barras, marca nem outro dado do produto.

   Se não for assim (por exemplo, uma linha sem código e sem nome, mas com o código de barras e o preço), ela vai para a prévia com o aviso "Confira a linha N". Ela só sai se você enviar o arquivo de novo marcando "deixar de fora a última linha", e a prévia guarda essa decisão.
4. **A tela "Entregas do projeto":** o lote que entrou na versão no ar e ainda não teve a publicação registrada aparece como "Nesta versão", e não mais como "ainda não está no ar".

## Os passos

1. Abra **Entregas do projeto** (menu Gestão). O lote AUD-b aparece como "Nesta versão" ou "No ar". Nenhum lote que está no site aparece como "ainda não está no ar".
2. Quando a planilha da Rein estiver no servidor, a importação de produtos tem de mostrar:
   - 2.271 produtos, em duas partes de 2.000 e 271;
   - "Ficou de fora a linha 2273 da planilha", com o motivo.

   Se, em vez disso, aparecer "Confira a linha 2273", diga ao Claude Code: os totais do rodapé não conferiram, e a decisão passa a ser sua.
3. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **As provas da auditoria:** falhavam no código anterior (625 em vez de "conferir", e a linha incompleta saindo como total) e passam agora, sem nenhuma mudança nelas. Estão em `apps/plataforma/src/lib/importacao/auditoria-20261118.test.ts`.
- **A prova com a planilha original** está na suíte e roda quando o arquivo privado estiver no servidor: 83 colunas, 2.271 produtos e a linha 2.273 de fora.

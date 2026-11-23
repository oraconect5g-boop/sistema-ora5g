# Roteiro de aceite: lote REIN-d (o relatório de verdade da Rein lido de ponta a ponta)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência no computador (a planilha tem 83 colunas).
- **Quanto tempo leva:** uns 15 minutos para conferir a prévia, quando ela existir (veja "O que depende de você").
- **O que o lote entrega:** a planilha `relatorioProdutos131258.xlsx`, que você mandou em 23/11, lida sem erro do começo ao fim (itens ORA-CAT-002 e ORA-INV-004, que seguem **parciais** até a carga de verdade e o seu aceite).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que aconteceu

Você mandou a planilha em 23/11. Ela foi guardada no servidor, numa pasta protegida, **fora do GitHub**. A primeira coisa feita com ela foi rodar a prova que esperava por esse arquivo, e **a prova reprovou**: o sistema lia 2.272 linhas, e o certo são 2.271 produtos. A correção de 23/11 cedo tinha sido testada com uma planilha montada por mim, porque a de verdade não estava no servidor. Com a de verdade, apareceram cinco coisas, todas corrigidas neste lote:

1. **O rodapé com os totais deslocados.** A última linha do relatório traz os totais, mas fora do lugar: o total do "Custo do Estoque" de cada loja aparece debaixo da coluna "Qtd. Disponível" da mesma loja. O sistema procurava a soma na própria coluna, não achava e deixava a linha como "talvez rodapé". Agora ele reconhece o rodapé também quando os números são a soma de **outra** coluna (pede pelo menos duas somas, para uma coincidência não tirar uma linha de produto) e diz isso na prévia.
2. **As colunas que a tela sugere.** Com os nomes de verdade do relatório, a tela não sugeria o código de barras, a família nem o custo, e na carga do estoque não sugeria a quantidade de nenhuma loja (cada loja tem três colunas que falam em "estoque": a quantidade, o custo e a localização). Agora sugere: **Código** (4 dígitos), **Produto**, **Família** (como categoria), **Marca**, **Código de Barras** e **Custo Unit. (R$)**; e, de cada loja, a "Qtd." e a "Qtd. Disponível". **O preço não é sugerido**, porque o relatório traz três tabelas.
3. **O custo e o preço com mais de duas casas.** 38 custos (o custo médio, como 31,1823) e 5 preços (como 368,9999) faziam a linha inteira virar erro. Agora são arredondados para o centavo mais próximo, e a prévia diz **quantos e em que linhas**, para você conferir. Um valor com cara de milhar ("1.299") numa coluna que não mostra o ponto como decimal continua parando para conferir, como antes.
4. **"SEM GTIN" e os códigos de barras de 15 dígitos.** "SEM GTIN" é o que a nota fiscal usa para o produto sem código de barras: agora vale como vazio. Quatro celulares têm no campo do código de barras um número de 15 dígitos (o tamanho de um IMEI): o campo fica em branco, o produto entra, e a prévia avisa as linhas.
5. **O tipo de cada família.** O relatório não diz o que é aparelho e o que é acessório, e a tela só deixava escolher um tipo para o arquivo inteiro: os 206 celulares entrariam como acessório, sem IMEI. Agora a tela lista as **28 famílias** do arquivo e você diz o tipo de cada uma. "CELULARES" já vem marcada como **Aparelho**; as outras ficam com o tipo padrão até você mudar. A escolha fica gravada na prévia, à vista de quem aprova.

## O que a planilha traz (posição de 10/11, 13:20)

- **2.271 produtos**, todos com código (4 dígitos, sem repetir), nome, família e custo; 2.269 com preço em cada uma das três tabelas; 105 com marca. O campo do código de barras vem preenchido em 119: 105 com um código válido, 10 com "SEM GTIN" e 4 com 15 dígitos.
- **28 famílias.** As maiores: FONES (270), ASSISTÊNCIA (243), CELULARES (206), SUPORTE (206), ACESSÓRIOS (197), CABOS (177), CAIXA DE SOM (169), INFORMÁTICA (166) e CARREGADORES (148).
- **12 locais** (as 11 lojas e DEFEITOS), os mesmos nomes do sistema. 693 produtos têm estoque em algum local.
- **Santa Cândida:** 233 produtos com estoque, 2.024 unidades; o físico e o disponível são iguais em todos, e não há quantidade negativa. Dessas, 6 unidades são celulares, que entram um a um, com o IMEI.
- **Nas outras lojas** há linhas para conferir antes de carregar: quantidade negativa (de 1 a 23 linhas por loja) e físico diferente do disponível (de 1 a 27).

## O ensaio (sem gravar nada no site)

O caminho inteiro foi ensaiado com a planilha de verdade num banco de teste em memória, que some no fim:

- **O catálogo:** as duas partes (2.000 e 271 linhas) geram a prévia com **0 linha com erro** e são aplicadas: 2.271 produtos (2.065 acessórios e 206 aparelhos), 28 categorias, 17 marcas, 2.269 preços e 2.271 custos. (No ensaio, o preço usado foi o da TABELA NORMAL, só para o ensaio: a escolha é sua.)
- **O estoque da Santa Cândida:** 233 linhas; **227 entram** (2.018 unidades) e 6 ficam como "aparelho: entra com o IMEI". A carga é aplicada e o saldo confere: 227 produtos, 2.018 unidades.
- **O estoque da Colombo** (a maior): 390 linhas; 358 entram (8.664 unidades), 28 ficam para conferir (23 com quantidade negativa e 5 com o físico maior que o disponível) e 4 são aparelhos.

## Os passos

A importação pede **duas pessoas**: o administrador envia a planilha e gera a prévia; o dono confere e aplica. Com a sua conta de dono, a tela de envio não aparece. Por isso o roteiro tem duas partes.

**Agora (não depende de nada):**

1. Abra **Estoque e catálogo → Cadastro de produtos → Importar planilha**. Com a conta de dono, a tela diz "Quem envia a planilha é o administrador; você confere e aplica as prévias". É assim mesmo.
2. Responda na conversa as decisões da seção abaixo.

**Depois que a prévia existir (com o seu sim, eu a gero com a conta de administrador de teste):**

3. Na mesma tela, em "Importações recentes", abra as duas partes da planilha (2.000 e 271 linhas).
4. Em cada uma, confira:
   - **Novos:** 2.000 na primeira e 271 na segunda; **Com erro:** 0;
   - "Ficou de fora a linha 2273 da planilha: rodapé de totais no fim da planilha…";
   - as notas da leitura: os custos e os preços arredondados e os códigos de barras em branco, com as linhas;
   - "Tipo por categoria: CELULARES = Aparelho; …; as outras linhas, Acessório";
   - a lista das linhas, com o nome, a categoria, o preço e o custo de cada produto.
5. Se estiver certo, escreva o motivo e aplique a primeira parte e depois a segunda. Se não estiver, descarte: **nada muda no catálogo** enquanto você não aplicar, e o que foi aplicado pode ser desfeito.
6. Responda **"aceito"** ou **"não aceito"**.

## O que depende de você (para a importação de verdade)

1. **Qual tabela de preço vale na loja:** TABELA NORMAL, MERCADO LIVRE ou NOVA TABELA. As tabelas são diferentes em cerca de mil produtos, e eu não escolho por você.
2. **O tipo das outras famílias.** Só "CELULARES" vem como aparelho. Confirme se alguma outra é aparelho (com IMEI) ou chip (com ICCID), e se "ASSISTÊNCIA" (243 itens) é peça (acessório, por quantidade) ou serviço. O tipo de um item não muda depois por outra importação.
3. **O código do produto:** a sugestão é o "Código" de 4 dígitos, que a Rein usa e nunca se repete. O relatório também tem a coluna "SKU", igual ao Código em 1.908 produtos e diferente em 363.
4. **O seu sim para a prévia.** Com as três respostas, eu envio a planilha com a conta de administrador de teste e gero a prévia. Ela **não mexe no catálogo**: quem aplica é você.
5. **O estoque de cada loja** se carrega com um relatório do dia em que a loja começar a usar o sistema: a posição de 10/11 já mudou.

## O que você não vê (provado pelo Claude Code)

- **Com a planilha de verdade** (`apps/plataforma/src/lib/importacao/auditoria-planilha-real.test.ts`, que só roda no servidor, com o arquivo privado): 83 colunas, 2.271 produtos, o rodapé de fora (a linha 2.273), as partes de 2.000 e 271, nenhuma linha com erro de leitura, os 38 custos e os 5 preços arredondados, os 4 códigos de barras em branco e as 12 lojas com as duas colunas sugeridas. Nenhum número comercial fica escrito no repositório.
- **Com uma planilha fictícia no mesmo desenho** (`rein-relatorio-original.test.ts`, que roda sempre): os 83 nomes de coluna, os totais deslocados, e os casos em que a linha **não** pode sair sozinha (uma coincidência só, o zero, a coluna de uma célula e a linha com código de barras).
- **A tela de envio no site** (`apps/plataforma/e2e/importar-planilha-leitura-real.spec.ts`), com o Administrador (teste): escolhe a planilha de verdade nas duas telas (catálogo e estoque) e confere as colunas sugeridas (SKU = "Codigo (coluna A)", Nome = "Produto (coluna D)", Categoria = "Familia (coluna I)", Código de barras = "Codigo Barras (coluna C)", Custo = "Custo Unit. (R$) (coluna Y)"; o Preço sem sugestão), as 28 famílias com "CELULARES" como Aparelho, e a "Qtd." e a "Qtd. Disponivel" de cada uma das 12 lojas. A prova **não envia nada** e confere isso. Roda depois da publicação; o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Sem migration:** nada mudou no banco. As notas da leitura ficam gravadas junto com a prévia, no lugar que já existia.

# ADR-021: O estoque inicial de cada loja pelo relatório de produtos da Rein, com prévia, aprovação e o livro

**Situação:** proposta (18/11/2026), reversível; aplicada no lote REIN-b e atualizada no lote REIN-c (18/11, a decisão 8 e a seção "Atualização de 18/11"). **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário.

**Pedida por:**

- a auditoria do Codex de 17/11 (PR #104): a orientação "Primeiro lote", o achado F03 e a seção 4 do relatório;
- o plano do proprietário de 16/11 (Onda 1, item 3: a carga do estoque por local);
- os requisitos ORA-INV-004 (estoque inicial validado) e ORA-CAT-002 (a Rein só por arquivo).

## Contexto

1. **O relatório de produtos da Rein:** o proprietário já entregou o de 10/11 às 13:20, com 2.271 produtos, 83 colunas e 12 locais. Ele traz, por produto, o físico e o disponível de cada local, em colunas separadas. Esse arquivo ainda não está no servidor do programador.
2. **O que já existia:** o catálogo e os preços entram pela importação do catálogo (REIN-a). O estoque de cada loja não tinha como entrar pelo arquivo.
3. **As 12 unidades confirmadas** (as 11 lojas e o DEFEITOS) existem desde 17/11 sem nenhum saldo.
4. **O que a auditoria pede:**
   - a prévia por loja, com a data de corte e a origem de cada número;
   - os negativos e os seriais tratados, sem inventar IMEI nem ICCID;
   - os lotes idempotentes, com aprovação por papéis e aplicação pelo livro;
   - o relatório das diferenças;
   - nada de truncar ou sumir com linhas calado.
5. **A posição do arquivo não é o estoque de hoje.** Ela vale na data de corte. O que acontece depois (venda, transferência) precisa continuar valendo.

## Decisões

1. **O formato da Rein não é suposto.**
   - A pessoa confirma a coluna do código do produto e, de cada loja, a coluna do físico e, se houver, a do disponível.
   - A sugestão vem do nome da loja no cabeçalho. Cada coluna fica com a loja de nome mais longo que ela traz: a coluna da "Santa Cândida (teste)" não vai para a "Santa Cândida". Na dúvida, nada é sugerido.
   - O rodapé de totais no fim do arquivo fica de fora, pela mesma regra da importação do catálogo (F01).
2. **Uma prévia por loja e por arquivo.**
   - O banco classifica cada produto da loja e não mexe no estoque:
     - **entrar:** o acessório com físico positivo, sem saldo no sistema na data de corte;
     - **serializado:** o aparelho ou o chip, que entra pela Entrada de mercadoria (carga inicial) com o IMEI ou o ICCID de cada unidade;
     - **sem produto:** o código fora do catálogo; importe o catálogo antes;
     - **conferir:** a quantidade que não é número inteiro, a negativa, o disponível maior que o físico, o código repetido, o produto inativo, o tipo sem estoque, ou a loja que já tinha o produto no sistema na data de corte;
     - **nada:** o físico zero.
   - O mesmo arquivo da mesma loja devolve a mesma prévia. O arquivo já aplicado naquela loja é recusado (OR023).
3. **Os papéis são os da importação do catálogo.**
   - Gera a prévia quem tem `importacao.executar` (o administrador).
   - Aplica e desfaz quem tem `importacao.aprovar` (o dono), e nunca quem gerou a prévia (OR024).
   - Descarta quem tem uma das duas.
   - Hoje só o dono existe: a conta do administrador espera a chave do servidor (J1). A separação de funções fica como está, como a auditoria pede.
4. **A aplicação é pelo livro.**
   - Cada linha "entrar" vira uma `entrada_importacao` no livro, com chave própria (`estoque_carga:<carga>:<linha>`): repetir não duplica.
   - O motivo traz o número da carga, o arquivo e a data de corte.
   - A carga lança só o que o arquivo diz que havia na data de corte. O que veio depois continua valendo, e a loja que já tinha o produto na data de corte vai para conferência, sem lançar nada.
5. **Uma carga aplicada por loja de cada vez** (OR041). A segunda espera a primeira ser desfeita, e assim um arquivo novo nunca soma com o antigo.
6. **Desfazer é pelo livro:** um ajuste negativo, linha a linha, onde a loja ainda tem a quantidade livre. O que já foi vendido, reservado ou transferido fica e é contado, e a correção vai pelo inventário.
7. **O DEFEITOS recebe a carga como as lojas** e continua sem vender (ADR-007). A Entrada de mercadoria continua só para loja física e depósito.
8. **O disponível não vira reserva.** A diferença entre o físico e o disponível do arquivo não é reservada, porque não se sabe o que ela é. **Desde o REIN-c, ela também não vira estoque livre:** a linha espera uma decisão registrada (veja "Atualização de 18/11").

## Atualização de 18/11/2026: a diferença entre o físico e o disponível (lote REIN-c)

**Pedida por:** o achado F18-03 da reanálise do Codex de 18/11 (PR #104): "não inventar reserva" não significa "liberar tudo para venda".

**O problema:** até o REIN-b, o acessório com físico 10 e disponível 8 entrava com as 10 unidades livres. A diferença de 2 aparecia só como informação. O sistema novo podia vender o que a Rein considerava comprometido: uma reserva de cliente, uma transferência a caminho ou um erro.

**As decisões:**

1. **A linha fica pendente.** O acessório com o físico maior que o disponível vai para "conferir", com o motivo e a pendência `fisico_maior_que_disponivel`. A prévia não presume nada.
2. **A carga não se aplica com pendência sem decisão.** O banco recusa com o código OR042.
3. **Quem importa ou aprova decide cada linha, com o motivo.** A decisão pode mudar enquanto a carga é prévia. As três decisões possíveis:
   - **lançar só o disponível:** a diferença fica fora do estoque até a contagem, pelo inventário;
   - **lançar o físico:** conferido na loja, a diferença está lá e livre para vender;
   - **deixar a linha de fora:** nada entra dela; a contagem e o lançamento vão depois, pelo inventário.
4. **A decisão fica registrada.** A linha guarda quem decidiu, quando e o motivo. A auditoria da carga guarda cada decisão, com o texto.
5. **Decisão em bloco, só a conservadora.** Para muitas linhas, dá para decidir de uma vez as que ainda não têm decisão. Valem só as duas decisões que não liberam o que pode estar comprometido: lançar só o disponível, ou deixar de fora. Lançar o físico é sempre linha a linha.
6. **Aplicar lança a quantidade decidida, e desfazer devolve a mesma.** A quantidade fica na coluna `lancar` da linha. Ela vale o físico quando não havia diferença e o decidido quando havia.
7. **O aparelho e o chip com diferença levam o aviso.** A carga não lança serializados, que entram pela Entrada de mercadoria. O motivo da linha avisa para conferir quais unidades estão reservadas ou a caminho antes de dar entrada.
8. **Continua sem inventar nada:** nenhuma reserva, nenhum trânsito e nenhum destino sai da diferença.

**Reverter:** a migration do lote tem reversão, que volta as três funções à versão do REIN-b e tira a função da decisão e as colunas novas. As cargas aplicadas com uma decisão são desfeitas antes, pela tela.

## Atualização de 23/11/2026: a célula de número escrita com vírgula (lote AUD-c, achado F21-01 do Codex)

Vale para a importação do catálogo e para a carga do estoque, que usam o mesmo leitor.

- **O defeito:** a Rein grava os 18 totais do rodapé em células marcadas como número, mas escritas com vírgula ("1.234,56"), o que não é número para o Excel. O leitor não reconhecia o rodapé: 2.272 linhas em vez de 2.271 produtos.
- **A regra:** o que a célula declara e o que ela traz são coisas diferentes. A célula marcada como número só é tratada como número quando o conteúdo é um número do Excel (dígitos, ponto decimal e expoente). Quando não é, ela vale pelo texto, pelas mesmas regras de uma célula de texto, e o leitor guarda que ela veio assim.
- **Nada é convertido na leitura:** "0.625" numa célula de número segue sendo fração (F18-01), e o dinheiro escrito com vírgula não é arredondado.
- **O rodapé continua tendo de provar que é rodapé:** as somas conferem e a linha não tem código, nome nem código de barras. O último produto incompleto com código de barras não sai como rodapé (F18-02), e o rodapé cuja soma não confere fica à vista na prévia, para decidir.
- **A prévia diz o que veio assim:** quantos totais do rodapé e, nas linhas de produto, quantas células e em que linhas.
- **A prova:** uma planilha fictícia no formato da Rein (83 colunas, 2.271 produtos, o rodapé com 18 totais, as partes de 2.000 e 271) roda no CI. A prova com o arquivo original é privada e roda fora do GitHub.

## O que fica de fora

1. **Os aparelhos e os chips:** o arquivo não traz o IMEI nem o ICCID de cada unidade. Eles entram pela Entrada de mercadoria (carga inicial), um a um.
2. **O custo:** a carga não mexe no custo. O custo vem da importação do catálogo.
3. **A conciliação com a Rein depois da data de corte:** enquanto a Rein opera, a posição envelhece. Na virada, a carga é feita com um relatório novo, do dia.

## Consequências

1. **O dono vê, loja por loja,** o que entra, o que precisa do IMEI, o que está fora do catálogo e o que precisa de conferência, antes de qualquer número entrar no estoque.
2. **A prova com o arquivo original** depende de ele estar no servidor (`~/entrada/rein/`) e da conta de administrador (J1). Os testes usam uma planilha fictícia no desenho que a auditoria descreveu.
3. **Reverter:**
   - desfazer cada carga aplicada;
   - voltar a plataforma para a versão anterior ao lote REIN-b;
   - aplicar a reversão da migration, que tira as tabelas e as funções.
   O que as cargas lançaram no livro fica, porque o livro só aceita inserção. Por isso as cargas são desfeitas antes.

## Adendo de 23/11/2026 — O relatório de verdade (lote REIN-d)

O arquivo original chegou ao servidor em 23/11 (`~/entrada/rein/`, fora do repositório). A prova com ele reprovou, e a leitura mudou em cinco pontos, que valem para o catálogo e para a carga:

1. **O rodapé com os totais deslocados.** No relatório, o total de uma coluna está debaixo de outra (o do "Custo do Estoque" de cada loja debaixo da "Qtd. Disponivel" da mesma loja). A linha sem código e sem nome, só com números e sem campo de identidade, é rodapé comprovado quando um número é a soma da própria coluna (como antes) **ou** quando pelo menos dois números são, cada um, a soma de outra coluna. Para a soma de outra coluna não vale o zero nem a coluna com uma célula só. Uma coincidência só deixa a linha como candidata, à vista na prévia (F18-02 continua valendo).
2. **As colunas sugeridas** seguem os nomes do relatório. Na carga, a coluna que fala em custo, valor, preço, margem ou localização não é quantidade, mesmo com "estoque" no nome. O preço não é sugerido: o relatório traz três tabelas, e a escolha é de quem importa.
3. **O valor com mais de duas casas.** O custo e o preço que vieram como número do Excel com mais de duas casas (o custo médio, o preço calculado) são arredondados ao centavo mais próximo, e a prévia guarda quantos e em que linhas. O valor com cara de milhar ("1.299") só é lido como decimal quando a própria coluna prova o ponto decimal (tem "12.5" ou "31.1823"); sem a prova, a linha para, como no F18-01. O texto (CSV, ou a célula fora do padrão) não muda: segue a planilha brasileira, sem arredondar.
4. **O código de barras.** "SEM GTIN" é o produto sem código de barras. O que não tem de 8 a 14 dígitos fica em branco, o item entra, e a prévia guarda quantos e em que linhas (no relatório, quatro celulares com 15 dígitos, o tamanho de um IMEI). Antes, a linha virava erro, e uma linha com erro impede aplicar a parte inteira.
5. **O tipo de cada categoria.** O relatório não tem coluna de tipo. A tela lista as categorias do arquivo (lidas no aparelho) e quem importa diz o tipo de cada uma; a escolha vai na linha, fica gravada com a prévia e faz parte da identidade dela. A coluna do tipo, quando o arquivo tem, vale mais. A sugestão só existe para a família dos celulares (aparelho) e a dos chips: o resto fica com o tipo padrão até a pessoa dizer.

**Sem migration.** As notas vão no `mapeamento` da prévia. **Reverter:** voltar a plataforma para a versão anterior ao lote; as prévias já gravadas continuam legíveis (as notas são campos a mais).

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

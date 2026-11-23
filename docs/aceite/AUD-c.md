# Roteiro de aceite: lote AUD-c (os dois defeitos da auditoria do Codex de 21/11 e o registro das publicações)

- **Quem faz:** o proprietário.
- **Quando:** a leitura, quando quiser. Os passos com arquivo, quando houver o primeiro extrato de verdade (parte A) e quando a planilha da Rein estiver no servidor (parte B).
- **Quanto tempo leva:** uns 5 minutos de leitura; uns 10 minutos com os arquivos.
- **O que o lote entrega:** os achados F21-01 a F21-03 da auditoria integral do Codex de 21/11 (PR #105), nos itens ORA-PAY-009, ORA-FIN-006, ORA-MKTPL-005, ORA-CAT-002 e ORA-INV-004. O F21-04 (as duas transferências de teste para a Muffato Santa) **não** foi executado: espera a sua resposta (veja o fim deste roteiro).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

### 1. O mesmo dinheiro do extrato não vale duas vezes (F21-02)

1. **Antes:** a mesma linha de crédito do extrato do banco podia confirmar uma venda (na Conciliação) **e** ser o recebimento de um repasse de marketplace (em Repasses no banco). O mesmo dinheiro aparecia duas vezes, e o sistema aceitava nas duas ordens.
2. **Agora cada linha do extrato tem um uso só:**
   - **pendente:** ainda sem uso;
   - **conciliada:** confirmou uma venda;
   - **de repasse:** é o recebimento de um repasse de marketplace;
   - **fora da conta:** alguém tirou, com motivo.
3. **Quem tenta o segundo uso é recusado, com o caminho para resolver:**
   - casar um repasse numa linha já conciliada: "Esta linha do extrato já tem outro uso (conciliada com uma venda ou fora da conta): desfaça no extrato antes.";
   - conciliar uma venda numa linha de repasse: "Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes, em Repasses dos marketplaces."
4. **Desfazer libera a linha**, dos dois lados, e fica na auditoria quem desfez e por quê.
5. **Clicar duas vezes não grava duas vezes:** o segundo clique responde "Este repasse já estava casado com esta linha: nada foi gravado de novo."
6. **Duas pessoas ao mesmo tempo:** se uma concilia e outra casa o repasse na mesma linha, a segunda espera a primeira terminar e é recusada. A linha nunca fica com dois usos.
7. **Na tela:** a lista de extratos mostra quantas linhas são "de repasse"; dentro do extrato há o filtro **De repasse**, e cada linha dessas diz de qual canal e de que dia é o repasse, com o atalho para a tela dos repasses.

### 2. O rodapé da planilha da Rein volta a ser reconhecido (F21-01)

1. **O defeito:** a última linha da planilha é o total geral. A Rein grava esses 18 totais como "número", mas escritos com vírgula (por exemplo, "1.234,56"), o que o Excel não considera número. O leitor do sistema não reconhecia a linha como rodapé e contava 2.272 linhas em vez de 2.271 produtos.
2. **Agora:** a célula marcada como número, mas escrita desse jeito, é lida como está escrita, pelas mesmas regras de um texto, e o sistema guarda que ela veio assim. O rodapé continua tendo de **provar** que é rodapé: os totais batem com a soma das colunas e a linha não tem código, nome nem código de barras.
3. **Nada some sem aviso:** a prévia diz que a linha do rodapé ficou de fora e por quê, e quantos totais vieram escritos com vírgula. Se uma célula de um **produto** vier assim, a prévia avisa as linhas para conferir.
4. **O que já estava certo continua:** "0.625" segue sendo fração (não vira 625), e o último produto, mesmo incompleto, entra se tiver código de barras.

### 3. O registro de cada publicação (F21-03)

1. **Antes:** o documento de estado dizia o que estava no ar, mas ficava sempre um lote atrás, porque era gravado antes da publicação.
2. **Agora:** depois de publicar e conferir no domínio, uma linha é gravada num registro à parte (a branch `registro/publicacoes` do repositório): o lote, o commit, a hora, as migrations e a prova feita no site. O que está no ar **agora** é sempre o que `https://ora5g.com.br/saude/versao` responde.
3. **A lista do que depende de você** (`docs/PENDENCIAS_DO_PROPRIETARIO.md`) foi refeita: não pede mais o que já chegou (a chave secreta do Supabase, as contas de teste, a chave de acesso da Nogle) e diz o que falta de verdade.
4. **A tela Entregas do projeto** passa a mostrar os lotes que faltavam (do J1-a ao J3-f, os de velocidade e este).

## Os passos

### Parte A: quando houver um extrato do banco e um relatório de marketplace de verdade

1. Abra **Gestão → Conciliação**, toque em **"Extratos por arquivo: importe e concilie de uma vez"** e importe o extrato do banco.
2. Abra **Gestão → Relatórios → Marketplaces**, importe o relatório de vendas do canal e toque em **Repasses no banco**.
3. Escolha a linha em que o repasse caiu e toque em **Casar**.
4. Volte ao extrato: a linha aparece como **De repasse**, com o canal e a data, e não oferece mais "conciliar com uma venda".
5. Em **Repasses no banco**, a linha já usada não aparece mais entre as linhas livres para outro repasse.
6. Em **Repasses no banco**, desfaça o repasse, com o motivo: a linha volta a ficar pendente no extrato.

### Parte B: quando a planilha da Rein estiver no servidor

1. Com a conta do administrador, abra **Estoque e catálogo → Cadastro de produtos → Importar planilha** e envie a planilha.
2. A prévia mostra **2.271 produtos** e a linha do total geral fora, com o motivo.
3. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/linha-do-extrato-um-uso.test.ts`):
  - as duas provas do Codex (venda e depois repasse; repasse e depois venda), que antes passavam e agora são recusadas;
  - a linha tirada da conta não recebe repasse;
  - desfazer libera, dos dois lados;
  - a repetição devolve o que já estava gravado;
  - as sugestões só oferecem linha sem uso;
  - quem tenta gravar direto na tabela, sem passar pelas funções, também é barrado;
  - a outra rede e quem não concilia pela rede não usam a linha, por nenhum dos caminhos.
- **Com duas conexões ao mesmo tempo, num PostgreSQL de verdade** (`linha-do-extrato-um-uso-concorrencia.test.ts`): cinco ordens diferentes; em nenhuma a linha termina com dois usos.
- **No banco da homologação, em 23/11, sem gravar nada:** com a identidade do Dono (teste), dentro de uma operação desfeita no fim, as recusas saíram como nos testes. Depois dela: nenhum extrato, nenhuma linha, nenhum repasse e nenhum registro de auditoria a mais.
- **Na leitura da planilha** (`apps/plataforma/src/lib/importacao/auditoria-20261121.test.ts`):
  - a prova do Codex, que antes falhava;
  - uma planilha fictícia no formato da Rein (83 colunas, 2.271 produtos, o rodapé com 18 totais escritos com vírgula), dividida em 2.000 e 271 linhas, como a tela faz;
  - quatro contratos: o número do Excel vale pelo que é (0.625 é fração); o último produto incompleto, com o código de barras, não some como rodapé; o rodapé cuja soma não confere não sai sozinho (fica à vista na prévia, para decidir); e, numa linha de produto, a célula escrita com vírgula vale pelo texto, sem arredondar o dinheiro, e a prévia diz onde.
- **No site, só lendo** (`apps/plataforma/e2e/extratos-e-entregas-real.spec.ts`, num celular de 360 px, com as contas de teste):
  - o Dono (teste) abre os extratos e os repasses dos marketplaces (as duas telas leem funções que a migration refez), a importação da planilha, a carga do estoque e as entregas do projeto, com o AUD-c e os lotes que faltavam;
  - o Gerente (teste) abre os extratos da loja dele, e o Vendedor (teste) lê o aviso, sem os dados;
  - a mesma prova, rodada no site antes da publicação, reprova nas entregas (43 lotes em vez de 64): ela distingue a versão;
  - ela não importa extrato nem casa repasse no site: isso grava, e pede o seu sim.
- **O que falta provar:** a leitura com o **arquivo original** (`auditoria-planilha-real.test.ts`). Ele não está neste servidor e não pode ir para o GitHub. A prova roda quando o arquivo estiver em `~/entrada/rein/`.
- **Migration:** `20261123121828_linha_do_extrato_um_uso` (aplicada no banco da homologação em 23/11, com a reversão guardada).

## A sua resposta sobre o F21-04 (as duas transferências de teste para a Muffato Santa)

Em 17/11, pela sua conta, saíram da **Santa Cândida (teste)** para a **Muffato Santa** uma capa e um Galaxy A15 de teste. Seguem "enviadas".

- **O que não foi feito:** receber as duas na Muffato e devolver. Isso poria mercadoria de teste no livro de uma loja de verdade.
- **O caminho proposto:** registrar na Muffato Santa que **não chegaram** (nada entra no estoque dela) e devolver os dois à loja de teste. O segundo passo (devolver à origem o que não chegou) ainda não existe no sistema e é o próximo lote (TRF-d).
- **O que preciso:** o seu "sim" para registrar o "não chegou" na Muffato Santa, quando o TRF-d estiver no ar. Sem o sim, nada é mexido.

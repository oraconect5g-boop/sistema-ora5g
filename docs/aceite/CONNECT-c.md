# Roteiro de aceite: lote CONNECT-c (a conciliação da Ora Connect com os relatórios da Nogle)

- **Quem faz:** o proprietário.
- **Quando:** depois que a Nogle estiver ligada (as chaves no servidor e o tipo da chave confirmado). Até lá, este roteiro é só de leitura: a tela mostra o motivo de não haver conciliação.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o ORA-CONNECT-009, na parte que a API da Nogle permite: a produção da Ora conferida com os relatórios oficiais de ativações e de recargas.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **O servidor busca os relatórios oficiais da Nogle** de ativações e de recargas do período e confere cada linha com as operações confirmadas na Ora:
   - pelo ICCID ou pela linha;
   - no mesmo dia ou no dia vizinho.
2. **A tela Conciliação com a Nogle** (link em **Ora Connect**, para quem gere) mostra, para cada relatório:
   - as conferidas;
   - as com valor diferente;
   - as que só a Nogle tem (pode ser a renovação feita pelo cliente);
   - as que só a Ora tem.
3. **Nada muda nas operações:** a conciliação só mostra o que fecha e o que não fecha.
4. **A tela mostra só o final da linha e do ICCID.** O nome do cliente que vem no relatório não é guardado.

## O que fica de fora (e o que falta de fora)

- **As comissões e as bonificações:** a Nogle respondeu em 10/11 que não há na API. Para conciliar os repasses, a Nogle (ou você) precisa indicar a fonte oficial, como um relatório ou um extrato, com o formato. Nenhum valor é calculado e apresentado como repasse oficial.
- **O extrato do saldo:** o exemplo oficial da Nogle não traz os campos da resposta. Ele entra quando a primeira resposta real os confirmar.

## Os passos (com a Nogle ligada)

1. Abra **Ora Connect → Conciliação com os relatórios da Nogle**.
2. Confira os números de uma semana em que você sabe quantas ativações e recargas houve.
3. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/connect-conciliacao.test.ts`):
  - a ligação pelo ICCID e pela linha;
  - o dia vizinho;
  - o valor diferente;
  - uma operação para uma linha só;
  - o "só na Ora";
  - outra rede nunca liga;
  - só o worker grava, e só quem gere lê.
- **No worker** (`apps/worker/src/connect/`):
  - a leitura página por página com os exemplos oficiais da Nogle;
  - nada gravado se uma página falhar;
  - nada pedido sem o GET com corpo ligado.
- **Na tela** (`apps/plataforma/src/app/connect/conciliacao/conciliacao.test.ts`):
  - o que não fecha;
  - só o final dos números;
  - a falha de leitura que não vira tela vazia.

# Roteiro de aceite: lote CONNECT-i (as outras consultas da Nogle)

- **Quem faz:** o proprietário, com a sua conta; se quiser, também um vendedor e um gerente.
- **Quando:** depois da publicação. **Só consultas:** nada muda na Nogle (a decisão D-056).
- **O que o lote entrega** (o seu pedido de 25/11, "todas as funções da Nogle"): as 16 rotas da documentação oficial que o sistema ainda não usava, em **Ora Connect → Consultar linha**. Com elas, o sistema usa as 62 funções da coleção oficial da Nogle.
  - **Para a loja (quem opera a Ora Connect):** o **titular da linha** (o CPF/CNPJ que o cliente diz é o do titular? antes da portabilidade ou de um atendimento); **conferir o CNPJ** e **o CEP**; o **rastreio da compra de chip** (pelo número do pedido); o **pagamento de uma solicitação** (o link, o boleto ou o Pix de uma ativação, recarga ou compra, para reenviar ao cliente que perdeu o link); as **informações da Nogle**: as dúvidas frequentes (cada categoria vira um botão com as perguntas e as respostas), os planos de campanha e os estados.
  - **Para a gerência (o dono e os gerentes):** o **custo do chip e do frete** (a logística da Nogle) e **conferir o CPF** (a Nogle devolve o nome e o nascimento: fica só com a gerência, e a consulta fica registrada com o nome de quem pediu).
  - **Para quem gere a rede (o dono):** na carteira, o **extrato** (as saídas, com o valor cobrado da Ora em cada ativação, recarga e compra, e as entradas, o crédito posto) e as **recargas programadas** (dos próximos 7 a 90 dias, com a soma); e os **relatórios da rede**: as **portabilidades** (dos últimos 7 dias ao último ano, com a conta por situação) e as **listas de linhas e de clientes** da Ora na Nogle, por página.
  - **A segurança:** o banco confere quem pede cada consulta; a resposta só quem pediu vê e ela é apagada em 24 horas; o CPF e o CNPJ (da validação e da titularidade) aparecem só mascarados e saem do registro junto com a resposta; nas listas, o documento aparece mascarado, também dentro do apelido da linha; o login de quem cadastrou a recarga programada não é guardado.
- **Resposta:** "aceito" ou "não aceito".

## Os passos

1. Entre com a sua conta e abra **Ora Connect → Consultar linha**.
2. Em **Informações da Nogle**, toque em **Dúvidas frequentes**: em alguns segundos aparecem as categorias; toque numa delas e abra o relatório com as perguntas e as respostas.
3. Em **O titular da linha**, digite uma linha sua e o seu CPF: a resposta diz se você é o titular.
4. Na aba **Carteira e relatórios** (desde o CONNECT-o, 25/11; antes ficava em Consultar linha), peça o **extrato** das entradas dos últimos 90 dias e toque em **Ver as programadas**; em **Portabilidades**, peça as dos últimos 30 dias; em **Linhas e clientes da Ora na Nogle**, a primeira página das linhas. Abra cada relatório.
5. Se quiser, entre com um vendedor: ele vê o titular, o CNPJ, o CEP, o rastreio, o pagamento e as informações, mas não a gerência, a carteira nem os relatórios da rede.
6. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- Cada rota segue a coleção oficial (o método, o caminho e os campos); as que são POST (as validações, o rastreio e o pagamento) só leem.
- Onde a documentação não traz o exemplo da resposta (a lista de clientes e o extrato, cujo exemplo repete o pedido), o sistema lê só os campos da tabela oficial e aceita a lista em "data" (como a das linhas) ou solta; a primeira consulta de verdade confirma.
- As listas grandes guardam até cerca de 90 KB (os primeiros itens) e dizem quantos ficaram de fora; a Nogle tem a lista inteira.
- Migration `20261125180630_outras_consultas_da_nogle`; a reversão volta as regras do CONNECT-h e apaga as consultas novas já gravadas.

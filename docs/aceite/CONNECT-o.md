# Roteiro de aceite: lote CONNECT-o (a aba Carteira e relatórios da demonstração)

- **Quem faz:** o proprietário, com a sua conta; se quiser, também um vendedor.
- **Quando:** depois da publicação, uns 5 minutos. **Só leitura:** as consultas à Nogle só leem (a decisão D-056, "só consultas"); nada muda na Nogle nem no sistema.
- **O que o lote entrega** (o seu pedido de 25/11: "só as telas do ora connect da demo, que estavam muito boas"): em **Ora Connect → Carteira e relatórios**, a aba da demonstração com os dados de verdade:
  - **para você e para quem gere a rede:** os 4 cartões da demonstração (o **saldo na Nogle**, as **saídas**, as **entradas** e as **recargas programadas**), o **extrato** numa lista só (as saídas e as entradas), as **recargas programadas**, as **portabilidades** da operadora e as **listas de linhas e de clientes** da rede. Cada um mostra a última consulta que você pediu: o botão fica no cartão **Consultar na Nogle**, a resposta chega em poucos segundos e a tela se atualiza sozinha. Só você vê a resposta, e ela é apagada em 24 horas;
  - a **conciliação** mais recente com os relatórios oficiais da Nogle, com o atalho para a tela dela;
  - **para todos que veem a aba:** as **ativações e as recargas por vendedor** do período (hoje, 7 ou 30 dias), com o atalho para o relatório completo (imprimir e planilha). O vendedor vê só as dele.
  - O saldo, o extrato e as programadas saíram de **Consultar linha**, que agora aponta para esta aba.
- **Resposta:** "aceito" ou "não aceito" (e o que mudar).

## Os passos

1. Entre com a sua conta e abra **Ora Connect → Carteira e relatórios**.
2. Em **Consultar na Nogle**, toque em **Consultar o saldo**: em alguns segundos o cartão **Saldo na Nogle** mostra o valor, com a hora da consulta. Confira com o painel da Nogle.
3. Peça o **extrato** (saídas ou entradas, o período que quiser) e as **recargas programadas**: os cartões e as listas se enchem sozinhos.
4. Em **Portabilidades**, escolha o período e toque em **Ver as portabilidades**.
5. Veja as **ativações e recargas por vendedor** (troque o período) e a **conciliação**.
6. Se puder, entre como vendedor: ele vê só as próprias ativações e recargas, sem a carteira nem os relatórios da rede.
7. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- Sem mudança no banco: as consultas são as mesmas de antes (pedidas ao banco, que confere quem pode; o servidor consulta a Nogle), e a aba só as mostra no formato da demonstração. O nome do cliente que vem no extrato e nas programadas fica fora da aba (o relatório de cada consulta tem tudo).
- Cada consulta pedida desta aba volta para ela (só para ela ou para Consultar linha: não é um endereço livre).
- As provas: `apps/plataforma/src/lib/connect/carteira.test.ts` (o estado de cada consulta e a leitura das respostas), `apps/plataforma/src/app/connect/carteira/carteira.test.ts` (o que cada papel vê e a volta das consultas) e, no site no ar, `apps/plataforma/e2e/connect-consultas-real.spec.ts` (o dono consulta o saldo na aba nova e o valor chega).

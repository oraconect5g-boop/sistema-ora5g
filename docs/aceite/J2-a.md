# Roteiro de aceite: lote J2-a (as provas com login dos relatórios e do estoque, só lendo)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o seu sim de 19/11 às provas da Onda 2 com as contas de teste, começando pelos relatórios e pelo estoque. É a "jornada com login" que faltava no ORA-REPORT-001, no ORA-REPORT-002, no ORA-REPORT-005 e no ORA-INV-001. O teste só lê: não grava venda, transferência, ajuste nem conferência.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que o teste faz

Quatro provas no site no ar, num celular simulado de 360 px, com as quatro contas de teste. Cada uma cruza a mesma informação em telas e pessoas diferentes: o que uma mostra, a outra tem de mostrar igual. E cada pessoa só vê o que pode.

1. **O estoque da capa de proteção (ORA-INV-001):**
   - o número da lista do Estoque da Santa Cândida (teste) é o mesmo no "na rede" (o "Onde tem") e no painel do estoque;
   - o número da Loja de teste 2 no "Onde tem" é o mesmo que o Gerente 2 (teste) vê na lista da loja dele;
   - o Vendedor (teste) vê o mesmo número que o gerente da loja dele;
   - no painel, o total "Disponível para vender" é a soma dos modelos.
2. **O aparelho pelo IMEI (ORA-INV-001):**
   - um Galaxy A15 da loja de teste aparece, com a loja, a situação e o histórico, para o gerente e para o vendedor da loja;
   - o Gerente 2 (teste), de outra loja, não vê o aparelho.
3. **O Início e os Relatórios (ORA-REPORT-001 e ORA-REPORT-002), em 30 dias:**
   - o Administrador (teste), que vê a rede inteira, filtrando a Santa Cândida (teste), vê as mesmas vendas, o mesmo vendido, os mesmos descontos e as mesmas devoluções e cancelamentos que o gerente da loja; o mesmo com a Loja de teste 2 e o Gerente 2 (teste);
   - na rede inteira, as lojas somam o total, e o Vendedor (teste) aparece nos melhores vendedores com as mesmas vendas da equipe do gerente;
   - hoje, 7 dias e 30 dias crescem nessa ordem;
   - o vendedor vê só as próprias vendas, as mesmas que a equipe do gerente mostra para ele, e não vê o ranking dos colegas (a decisão P3 continua sua);
   - os Relatórios mostram os mesmos números do Início, para o gerente e para o administrador; o vendedor não abre os Relatórios.
4. **O Financeiro (ORA-REPORT-005), em 30 dias:**
   - as vendas e o recebido do Financeiro do gerente são os mesmos do Início;
   - o administrador, filtrando a loja de teste, vê os mesmos números e os mesmos pagamentos por meio.

Leva cerca de 1 minuto e 20 segundos. Rodou duas vezes em 19/11 e passou nas duas. Na hora, a Santa Cândida (teste) tinha 5 vendas concluídas e 1 cancelada em 30 dias, do Vendedor (teste) e do Dono de teste; a Loja de teste 2 não tinha venda concluída.

## O que fica gravado

Só as entradas e saídas das contas de teste: o teste não muda nenhum dado. No fim, ele sai de todas as contas, e nenhuma sessão de teste fica aberta.

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a **Santa Cândida (teste)**.
2. No **Início**, escolha **30 dias** e a loja **Santa Cândida (teste)**: anote as vendas realizadas.
3. Abra **Relatórios** e escolha **30 dias** e a loja **Santa Cândida (teste)**: as vendas devem ser as mesmas do Início.
4. Abra **Estoque** e busque **ACE-0001** (a capa de proteção). Toque em **na rede**: o número da Santa Cândida (teste) deve ser o mesmo da lista.
5. Responda **"aceito"** ou **"não aceito"**.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/relatorios-e-estoque-real.spec.ts --project=celular-360
```

Rode sozinho: as provas que gravam (J1-b, J1-c e J1-d) mudam as vendas e o estoque no meio da conferência.

## O que fica de fora

- **O aviso no celular de um pedido de verdade (ORA-REPORT-002):** precisa gravar um pedido (de desconto, de nota ou de saída de caixa) e receber o aviso num celular inscrito. Fica para uma prova que grava, com o seu sim.
- **A conferência com o arquivo de cada maquininha (ORA-REPORT-005):** depende do arquivo real do extrato (item E3 dos pontos em aberto).
- **O ranking com os colegas para o vendedor:** depende da sua decisão P3.
- **No CI:** o teste precisa do arquivo das contas de teste, que só existe no servidor. No CI, ele fica pulado.

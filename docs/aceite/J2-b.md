# Roteiro de aceite: lote J2-b (as provas de acesso por papel e por loja, só lendo)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o seu sim de 19/11 às provas de acesso por papel e por loja, só lendo. É a "homologação" que faltava no ORA-ORG-004 (o acesso por loja e por papel) e no ORA-QUAL-002 (cada um só lê o que pode), feita com as contas de teste no site no ar. O teste só abre telas: não envia nenhum formulário.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que o teste faz

Quatro provas no site no ar, num celular simulado de 360 px, com as quatro contas de teste:

1. **O menu de cada papel é o esperado,** nem uma tela a mais, nem uma a menos:
   - **o Vendedor (teste)** vê 13 telas além do Início: vender, vendas, reservas do site, clientes, funil, agenda, caixa, Ora Connect, assistência, estoque, transferências, catálogo e metas;
   - **os dois gerentes de teste** veem essas 13 e mais 11: financeiro, relatórios, contas a pagar, conciliação, recebíveis, financeiras, maquininhas, aprovações, notas, saúde da operação e auditoria;
   - **o Administrador (teste)** vê 12: vendas, estoque, transferências, catálogo, cadastro de produtos, financeiro, relatórios, saúde da operação, entregas, auditoria, equipe e lojas.
2. **A tela de outro papel, aberta pelo endereço, mostra o aviso e nenhum dado** (nenhum resumo, nenhuma tabela):
   - o vendedor tenta 11 telas da gerência e da administração;
   - o gerente tenta 4 telas da administração (equipe, lojas, cadastro de produtos e entregas);
   - o administrador tenta 6 telas da loja (vender, reservas do site, contas a pagar, conciliação, maquininhas e metas).
3. **A venda de outra pessoa ou de outra loja não abre pelo endereço:**
   - o vendedor abre o comprovante da venda dele, mas não o da venda de outra pessoa da mesma loja, mesmo digitando o endereço: a tela diz "Página não encontrada", porque o banco não entrega a venda;
   - o Gerente 2 (teste), de outra loja, não abre nenhuma das duas;
   - o administrador, que vê a rede, abre as duas.
4. **A loja de outra pessoa posta no endereço não muda o que o gerente vê:** com o endereço da Santa Cândida (teste), o Início, os Relatórios, o Financeiro e o painel do Estoque do Gerente 2 (teste) continuam mostrando a Loja de teste 2, com os números dela. As duas lojas têm números diferentes (vendas e estoque), então a prova distingue uma da outra.

Leva cerca de 1 minuto e 15 segundos. Em 19/11, passou duas vezes seguidas (a segunda junto com as provas do J2-a), depois de duas correções no teste, não no sistema:

- a lista de Vendas abre em "Hoje", e as vendas de outra pessoa na loja de teste eram de outros dias: o teste passou a abrir 30 dias;
- a lista da gerência não mostra o nome de quem vendeu (o primeiro achado abaixo): o teste passou a separar as vendas pela lista do próprio vendedor.

## Dois achados

- **A lista de Vendas da gerência não mostra quem vendeu:** em todas as vendas aparece "Outro vendedor". O banco só deixa ler o nome de outra pessoa a quem cuida da equipe, e a lista lê os nomes direto; o Início mostra os nomes por outro caminho, que o gerente pode usar. A segurança está certa (ninguém vê o que não pode); o defeito é só de informação na tela. A correção fica proposta para o lote seguinte.
- **O banco de teste é pequeno para a pré-carga do menu:** cada tela aberta pré-carrega as telas do menu (até 17), e cada pré-carga consulta o banco. Na primeira rodada, abrir umas 20 telas em um minuto com quatro pessoas deu 702 pedidos ao banco de teste (o plano Micro do Supabase), que parou por dois minutos (até 17 s por pedido e 6 erros). O navegador das provas passou a recusar só a pré-carga; a tela é a mesma. Isso não muda o site, mas pesa na escolha do banco da produção e numa pré-carga mais leve (seção 4.13 de `docs/operacao/DESEMPENHO_NO_CELULAR.md`).

## O que fica gravado

Só as entradas e saídas das contas de teste: o teste não muda nenhum dado. No fim, ele sai de todas as contas, e nenhuma sessão de teste fica aberta.

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a **Santa Cândida (teste)**.
2. Abra **Vendas**, escolha **30 dias** e abra uma venda: o comprovante aparece.
3. Se quiser, entre também com uma conta de vendedor ou de gerente e veja que o menu mostra só as telas do papel.
4. Responda **"aceito"** ou **"não aceito"**.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/acesso-por-papel-real.spec.ts --project=celular-360
```

Rode sozinho: as provas que gravam (J1-b, J1-c e J1-d) mudam as vendas e o estoque no meio da conferência.

## O que fica de fora

- **A troca de loja por formulário** (escolher uma loja em que a pessoa não trabalha): mexe na sessão. Está provada nos testes do banco, não aqui.
- **Duas organizações:** o site de teste tem uma só. O isolamento entre organizações está provado nos testes do banco.
- **No CI:** o teste precisa do arquivo das contas de teste, que só existe no servidor. No CI, ele fica pulado.

# Roteiro de aceite: lote GRAF-a (os gráficos reais: a falha nunca vira "sem dados")

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** a parte dos gráficos da orientação de 18/11: "estado vazio não pode mascarar falha de consulta", "custo/margem por permissão e exportações" e "demonstração não alimenta relatório real".
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **Relatórios → Canais de venda.** Quando a margem das lojas ou as reservas do site não respondem, a tela agora:
   - avisa "Parte dos números não pôde ser lida agora", com o link **Tentar de novo**;
   - mostra a margem como "não deu para ler agora".

   Antes, a margem que falhava aparecia como "sem o custo", como se faltasse o custo dos produtos.
2. **O resto foi conferido e já estava certo.** A tabela abaixo mostra cada tela.

## A conferência das telas de gráficos

| Área | Tela | Quando a leitura falha | Custo e margem | Exportação |
|---|---|---|---|---|
| Financeiro | `/financeiro` | A página de erro, com o tentar de novo. O banco sem a leitura mostra "indisponível". O vazio só aparece com a leitura funcionando, e diz isso | A tela não mostra custo | 403 sem permissão; a falha derruba o arquivo inteiro |
| Resultado do mês | `/resultado` | O aviso da falha no lugar dos números | Só o dono | 403 sem permissão, 503 sem a leitura no banco; a falha derruba o arquivo |
| Recebíveis | `/pagamentos/recebiveis` | O aviso da falha no lugar dos números | Não mostra custo | Sem exportação própria |
| Caixa | `/caixa` | A página de erro | Não mostra custo | Sem exportação própria |
| Vendas | `/vendas` e o painel do Início | A página de erro. No painel, o período anterior que falha vira "não pôde ser lido agora: sem comparação", nunca zero | A margem só com a permissão de ver o custo | Pelos Relatórios |
| Estoque | `/estoque` | O aviso da falha no painel e no valor a custo | O valor a custo só para quem vê o custo | 403 para o local que a pessoa não vê; a falha derruba o arquivo; o custo não entra |
| Relatórios | `/relatorios` | Cada bloco com o seu aviso de falha | A margem só com a permissão de ver o custo | 403 para a margem sem essa permissão; a falha derruba o arquivo |
| Canais de venda | `/relatorios/canais` | **Corrigido neste lote** (item 1) | Só o dono | Sem exportação própria |

**A demonstração não alimenta nenhum relatório real.** Nenhuma tela real usa os dados fictícios. O teste `apps/plataforma/src/demo/isolamento.test.ts` lê o código e prova isso nos dois sentidos.

## Os passos

1. Entre como dono em **ora5g.com.br**.
2. Abra **Relatórios → Canais de venda** e confira que os números aparecem como antes.
3. Abra Financeiro, Resultado, Recebíveis, Estoque e Relatórios: nada muda na tela quando o banco responde.
4. Responda **"aceito"** ou **"não aceito"**.

O aviso de falha não se testa pela tela: ele só aparece quando o banco não responde. Por isso a prova está nos testes abaixo.

## O que fica de fora

- **Os números com a base real** dependem de três coisas:
  - a carga da planilha da Rein;
  - as contas de teste (a chave do Supabase no servidor, J1);
  - as vendas de verdade nas lojas.

  Até lá, os gráficos reais mostram o banco de homologação, com dados de teste.
- **Gráficos novos** não entram neste lote. A orientação pede para "preservar e completar" os gráficos, e mais gráficos sobre uma base vazia não resolvem a operação.

## O que você não vê (provado pelo Claude Code)

- **Os canais:**
  - `apps/plataforma/src/app/relatorios/canais/canais.test.ts` testa a tela com a margem e o site falhando, e com o banco sem a função;
  - `apps/plataforma/src/lib/canais/painel.test.ts` testa as regras do texto.
- **As outras telas, com os testes que já existiam:**
  - `app/financeiro/financeiro.test.ts`, `app/resultado/resultado.test.ts`, `app/caixa/caixa.test.ts` e `app/vendas/vendas.test.ts`;
  - `app/estoque/painel.test.ts` e `app/estoque/exportar.test.ts`;
  - `app/relatorios/relatorios.test.ts`, `app/inicio/inicio.test.ts` e `lib/pagamentos/recebiveis.test.ts`.

  Todos ficam em `apps/plataforma/src/`.
- **A demonstração isolada:** `apps/plataforma/src/demo/isolamento.test.ts`.

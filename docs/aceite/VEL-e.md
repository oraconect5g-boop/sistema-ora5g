# Roteiro de aceite: lote VEL-e (a sessão e o sino com as permissões numa conta só)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o que a medida com login de 19/11 mostrou ser o maior atraso de toda tela com login, dentro do que a orientação de 18/11 libera ("medir antes/depois em celular autenticado; não remover RLS ou cachear permissões entre usuários").
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **Toda tela com login começa lendo a sessão:** quem é você, a loja do turno e o que você pode fazer. Essa leitura fazia 45 perguntas de permissão, uma a uma, e cada pergunta conferia a sessão inteira de novo (a conta ativa, o turno, o segundo fator, os vínculos e a loja). Agora a mesma regra é aplicada às 45 de uma vez.
2. **O sino de avisos e o Início** faziam 11 dessas perguntas; agora, uma.
3. **Nada muda no que você vê.** O mesmo menu, as mesmas telas liberadas e as mesmas pendências, para cada papel e cada loja.
4. **A segurança é a mesma.** A regra das permissões não mudou. As ações (vender, abrir o caixa, aprovar desconto...) continuam conferindo a permissão no banco, uma por uma, como antes. Nenhuma permissão nova, nenhum papel muda e nada fica guardado entre uma pessoa e outra.

## Antes e depois

No banco, com a sessão da conta de teste do vendedor na Santa Cândida (teste), a mediana de 3 chamadas seguidas:

| Leitura | Antes | Depois |
|---|---|---|
| A sessão (em toda tela com login) | 0,19 s | 0,023 s |
| O sino de avisos | 0,052 s | 0,016 s |

No site, com as contas de teste do vendedor e do gerente num celular simulado (3 aberturas de cada tela por conta; tudo na seção 4.10 de `docs/operacao/DESEMPENHO_NO_CELULAR.md`):

| Medida | Antes (só o VEL-d) | Depois (com o VEL-e) |
|---|---|---|
| Uma ida ao banco para ler a sessão (mediana de 309 e de 308 idas) | 0,54 s | 0,18 s |
| Até o servidor começar a responder (todas as telas) | de 0,36 a 0,40 s | de 0,18 a 0,23 s |
| O PDV (Vender), até a tela carregar | 0,59 s | 0,37 s |
| O Início do vendedor | 0,68 s | 0,48 s |
| Vendas | de 0,90 a 0,92 s | de 0,52 a 0,58 s |
| Catálogo | de 0,56 a 0,59 s | de 0,39 a 0,45 s |
| Estoque | de 0,54 a 0,58 s | de 0,39 a 0,44 s |
| Caixa | 0,61 s | 0,38 s |
| Relatórios (gerente) | 1,09 s | 0,81 s |

## Os passos

1. Entre como dono em **ora5g.com.br**, de preferência pelo celular.
2. Abra três ou quatro telas do menu (Início, Vendas, Estoque, Caixa):
   - o menu deve ter os mesmos itens de antes;
   - o sino deve mostrar as mesmas pendências;
   - as telas devem abrir mais rápido.
3. Responda **"aceito"** ou **"não aceito"**. Se algum item do menu sumir ou aparecer a mais, diga qual.

## O que fica de fora

- **A ação do carrinho** ainda lê a sessão duas vezes: espera a revisão do Codex e o seu sim (ADR-010).
- **Os painéis do Início e dos Relatórios** (o do estoque, o da margem, o das metas) levam de 0,3 a 0,4 s por ida. Ficam para um próximo lote, com a mesma medida.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/permissoes-numa-conta.test.ts`):
  - a conta só responde exatamente o que a pergunta uma a uma responde, para o catálogo inteiro de permissões, em todo papel (dono, administrador, gerente, vendedor, técnico, outra rede, sem vínculo, vínculo encerrado), perguntando pela loja do turno, por outra loja da mesma rede, pela loja de outra rede e sem loja;
  - bloqueado, fora do turno, prazo vencido, depois de sair e com o segundo fator pendente: nada, como antes;
  - quem não entrou não executa.
- **Os testes de antes continuam valendo sem mudança:** o molde da sessão (`sessao-molde-e-pdv.test.ts`, que já comparava cada permissão com a pergunta uma a uma) e o sino (`pendencias-numa-ida.test.ts`).
- **No banco do servidor, sem gravar nada:** com a sessão do vendedor de teste, a sessão e o sino novos deram exatamente as mesmas respostas dos de antes, antes de a migration ser aplicada.

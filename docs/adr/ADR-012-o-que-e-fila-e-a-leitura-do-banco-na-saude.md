# ADR-012 — O que é fila na Saúde da operação, e a leitura leve do banco na página /saude

**Situação:** proposta (17/11/2026), reversível; aplicada no lote SAUDE-a. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo proprietário no plano de 16/11/2026 (Onda 0.6): "O Início mostra 'Estoque abaixo do mínimo: 5'; a Saúde da operação diz 0 itens em 15 filas. Decida se estoque mínimo e venda concluída sem pedido de nota são filas, e documente." e "`/saude` só confere o Auth. Acrescente uma leitura leve do banco."

## Contexto

1. **A Saúde da operação (lote Q1) lista filas.** Cada fila é algo que espera a decisão ou o trabalho de alguém. Ela mostra quantos itens há e há quanto tempo está o mais antigo. Cada fila aparece só para quem decide sobre ela.
2. **O Início mostra também o estoque abaixo do mínimo** (lote REPORT-001b): a contagem dos pares de produto e loja com o disponível abaixo do mínimo, a mesma conta do painel do estoque. Na Saúde da operação esse número não aparecia. Com o Início dizendo "5" e a Saúde dizendo "0 itens", parecia que uma das telas estava errada.
3. **A venda concluída sem o pedido da nota não aparecia em lugar nenhum fora da conciliação fiscal** (lote L10b), que é lida por período. Pedir a nota depois da venda é um passo de alguém, e o dever de emitir não espera.
4. **A página /saude é pública.** Ela conferia o aplicativo e o serviço de login, e não lia o banco. Uma versão publicada antes da migration do lote abre as telas com login com erro (o VEL-a avisou isso), e a /saude não mostrava.

## Decisões

1. **Fila é o que espera a decisão ou o trabalho de alguém e tem a data em que começou a esperar.** É isso que permite dizer "há quanto tempo está o mais antigo".
2. **A venda concluída sem o pedido da nota é fila.** O nome na tela é "Vendas sem pedido de nota".
   - **Quem vê:** quem aprova nota (`nota.aprovar`: o dono e a gerência), nas lojas onde tem essa permissão.
   - **A data:** a conclusão da venda.
   - **O destino:** a conciliação das notas.
   - **A conta:** a do grupo "sem pedido" da conciliação fiscal. Entra a venda concluída sem o pedido vivo da nota de venda e que não foi devolvida inteira. A venda cancelada, a devolvida inteira e a que tem o pedido em andamento ou a nota emitida ficam fora.
   - **Sem período:** a fila mostra tudo o que espera, mesmo a venda antiga.
   - **Onde a conta é feita:** numa função do banco, `public.notas_vendas_sem_pedido()`, porque a API não filtra sozinha a venda sem o pedido vivo.
3. **O estoque abaixo do mínimo não é fila: é um aviso.**
   - Ele não espera a decisão de ninguém: é o estado do estoque.
   - Não tem a data em que começou: o banco não guarda quando o disponível cruzou o mínimo.
   - Some quando o estoque volta ao mínimo, com compra ou transferência.

   A Saúde da operação mostra o aviso à parte, num cartão próprio, com o mesmo cálculo do painel do estoque, nas lojas que a pessoa acompanha. O número não entra em "Itens esperando". O Início continua mostrando o aviso, na loja ou na rede, conforme a visão escolhida.
4. **A /saude faz uma leitura leve do banco, sem login.** `public.saude_do_banco(p_migracao)` devolve só duas coisas:
   - a hora do banco;
   - se a última migration desta versão está no histórico do banco: sim, não ou "não se sabe".

   A versão sabe qual é a sua última migration porque a build grava a da pasta das migrations (`ORA_MIGRACAO_ESPERADA`, em `next.config.ts`). A página mostra:
   - quanto o banco levou para responder;
   - "em dia com esta versão" ou "falta no banco a migration desta versão".

   Sem resposta em 4 segundos, ou com a migration faltando, o topo da página muda para "Em funcionamento, com problema no banco". A função não lê tabela de negócio nem devolve dado de ninguém. Por isso o visitante executa, de propósito, como a vitrine da loja online, e o inventário de autorização lista as duas.
5. **A versão de migration só é procurada com 14 dígitos.** Qualquer outro texto não é procurado e devolve "não se sabe". O visitante não lê o histórico das migrations direto: só pela função.

## Consequências

- **O dono vê o mesmo problema nas duas telas.** O número do estoque abaixo do mínimo está no Início e na Saúde da operação. Na Saúde ele vem com a explicação de que é aviso, não fila.
- **A venda sem o pedido da nota fica visível todo dia**, e não só quando alguém abre a conciliação de um período.
- **Uma publicação à frente do banco aparece na /saude**, sem login, para quem publica e para quem confere.
- **Cada migration nova muda a versão esperada sozinha**, porque a build lê a pasta. Um teste confere que a build grava a última.
- **A conta da fila é a mesma da conciliação fiscal.** Se a regra do contador mudar o que é "sem pedido" (por exemplo, uma operação que não pede nota), as duas mudam juntas, na mesma função, por migration.

## Alternativas descartadas

- **Pôr o estoque abaixo do mínimo como fila:** o número cresceria e diminuiria sem ninguém decidir nada, e "há quanto tempo" seria inventado.
- **Contar a venda sem pedido pela API, sem função:** a API não compara o devolvido com o total, nem exclui só o pedido vivo da nota de venda.
- **Ler uma tabela de negócio na /saude:** mostraria que o banco responde, mas daria ao visitante uma leitura que ele não precisa.

## Atualização de 18/11/2026: os erros do servidor (lote OBS-a)

Erro do servidor não é fila (ninguém decide sobre ele), mas é o que a Saúde da operação ainda não mostrava.

- **De onde vem:** o Next chama `onRequestError` (`instrumentation.ts`) a cada erro que vira a página de erro ou uma resposta 500. Cada erro vira uma linha `[erro]` no log e entra numa lista em memória, a do processo que serve o site. A conta recomeça a cada publicação.
- **O que mostra:** quantos na última hora e nas últimas 24 horas, as telas com erro e os mais recentes, com o código que a página de erro mostra à loja. O aviso no topo aparece quando houve erro na última hora.
- **Quem vê:** quem gere a rede (`unidades.gerir`). O erro é do sistema inteiro, não de uma loja.
- **O que nunca entra:** o texto do erro, os valores do endereço (só o molde da rota), cabeçalhos, corpo e a sessão.
- **Alternativa adiada:** um serviço de monitoramento (o tempo de resposta e o aviso no celular dependem dele, a escolher). Com mais de um processo servindo o site, a lista em memória deixa de bastar.

## Reversão

- **Banco:** `supabase/reversao/20261117145723_saude_do_banco_e_vendas_sem_nota.sql` tira as duas funções.
- **Plataforma:** sem a função, a fila some da Saúde da operação, e a /saude mostra "sem resposta" no banco. Nada mais muda.

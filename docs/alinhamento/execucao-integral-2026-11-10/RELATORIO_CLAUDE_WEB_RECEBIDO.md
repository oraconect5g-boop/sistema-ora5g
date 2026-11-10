# Relatório original recebido do Claude Web

Origem: arquivo "Texto colado.txt" fornecido pelo proprietário nesta conversa. Reprodução histórica; não é norma atual. A revisão e o PROMPT_MESTRE corrigem propostas superadas sobre devolução automática ao estoque, receita presumida, importação de estoque e OS. A referência antiga à skill "sistema-supercell"/seção 24 não substitui as instruções atuais do repositório.

---

Percorri as 24 telas e abas da demonstração e cliquei em todos os botões, exceto os “Exportar CSV”, porque eles baixariam arquivos. Todos os botões respondem. O que está fora do lugar não são botões que não fazem nada: são funções do Ora Connect que se repetem em dois lugares com regras diferentes, e telas onde falta o botão para concluir a tarefa.
Os três botões funcionam e colocam itens no carrinho, mas cada um contradiz a tela do Ora Connect:
- Chip + ativação: escolhe o chip sozinho (ICCID •••• 0014, depois 0022). Não pede plano, DDD nem CPF. A ativação de verdade acontece em Ora Connect › Ativar chip, em 5 etapas, e essa própria tela diz “a venda do chip é feita em Nova venda”. O nome do botão promete uma ativação que ele não faz. Sugestão: chamar só de “Chip” e, ao concluir a venda, abrir a ativação já com aquele chip preenchido.
- Portabilidade: coloca no carrinho um chip novo e uma portabilidade de R$ 0,00. Não pede o número a ser trazido nem a operadora atual. Já a aba Portabilidade do Connect diz que o cliente “já precisa ter uma linha Ora Connect ativa”. As duas regras se contradizem. Eu tiraria esse botão da Nova venda ou faria ele abrir o fluxo do Connect.
- Recarga: são três versões diferentes da mesma coisa: 
  - Na Nova venda, valores livres de R$ 15 a R$ 100, chamados de “valor de face”.
  - No Connect, planos fechados: 4 GB a R$ 29,90, 7 GB a R$ 44,90 e assim por diante.
  - No extrato da Contel, uma recarga de 7 GB custa R$ 35,90 para a Ora.
- Recarga como receita: a tela diz “não é receita”, mas o catálogo mostra a recarga com custo R$ 0,00 e margem de 100%. O Início também conta R$ 535,00 de Ora Connect no faturamento, e R$ 455,00 disso são recargas.
- Catálogo de produtos: Ativação e Portabilidade estão cadastradas como produtos sem cobrança. São operações da operadora, não mercadoria. Não deveriam aparecer em Produtos e preços nem como linha de venda.
- Caixa (atalho na barra de baixo): a tela só mostra números. Não há botão para abrir o caixa, registrar sangria, justificar a diferença ou fechar o caixa, embora a própria tela diga “justificar antes de fechar”. Contas a pagar e a receber também só aparecem para leitura.
- Vendas: as linhas da lista não abrem. Não tem como ver o detalhe da venda, o comprovante, pedir cancelamento ou estornar. O escopo pede tudo isso, e os pedidos de cancelamento aparecem em Aprovações sem um lugar de onde sejam feitos.
- Venda cancelada com nota emitida (PV-24908): não existe fluxo de cancelamento ou devolução da nota. A venda também tem uma recarga, que não pode ser desfeita depois de confirmada pela operadora.
- Importação: o menu diz “Importar CSV da Rein”, mas a página importa estoque, com quantidade e sem coluna de IMEI. O escopo fala em importar produtos e preços, e importar estoque ainda era uma premissa a confirmar. Celular sem IMEI quebra o controle por aparelho.
- Lojas e usuários: só existem os botões Bloquear e Desbloquear. Não dá para criar nem editar usuário ou loja. Os 5 papéis em vez dos 12 do escopo combinam com o que você já disse (não há gerente oficial), mas essa decisão deveria ficar registrada no escopo.
- Canais online: a tela é só informativa, sem nenhum botão. Pelo escopo é da Fase 5, então valeria marcar como “em breve” ou esconder do menu.
- Assistência (OS): funciona, mas não está entre os 16 módulos do escopo. Se ficar, precisa entrar no escopo.
Quer que eu transforme isso numa lista de correções para o agente de desenvolvimento seguir?
crie um prompt que corrija todas as falhas
Este prompt é para colar no agente que programa (Claude Code ou Codex). As decisões que só você pode tomar ficaram marcadas como “PERGUNTAR”, para o agente não inventar regra.
```
CONTEXTO
Projeto Ora 5G (repositório oraconect5g-boop/sistema-ora5g). Siga o escopo do projeto (skill "sistema-supercell") e as regras da seção 24: não inventar integrações, não deixar botões sem função, regra de negócio no servidor, testar antes de dar por concluído, dados de demonstração identificados como tal.

Uma revisão da demo (ora5g.com.br/demo) encontrou as falhas abaixo. Corrija em etapas pequenas, uma por commit, sem quebrar o que já funciona. Antes de começar, apresente um plano curto com a ordem das correções e os arquivos que vai alterar. Nos itens marcados "PERGUNTAR", não decida sozinho: liste as perguntas no início do plano e, até ter resposta, implemente o comportamento indicado como "padrão provisório", deixando um aviso visível na tela.

=====================================================
BLOCO 1 — ORA CONNECT x NOVA VENDA (prioridade alta)
=====================================================
Regra geral: a Nova venda vende mercadoria (chip físico/eSIM com valor). Toda operação da operadora (ativação, portabilidade, recarga) acontece num fluxo único do módulo Ora Connect. Não pode haver duas versões da mesma operação com regras diferentes.

1.1 Botão "Chip + ativação" (Nova venda)
- Problema: escolhe o ICCID sozinho e não pede plano, DDD ou CPF. A ativação real fica em Connect › Ativar chip.
- Corrigir: renomear para "Chip Ora Connect". Ao clicar, o vendedor escolhe ou digita o ICCID entre os chips VIRGENS da loja (mesma fonte de Connect › Chips e entrega), com tipo físico ou eSIM. Um ICCID reservado num carrinho não aparece para outro vendedor (reserva com expiração, como no IMEI).
- Ao concluir a venda, mostrar o botão "Ativar este chip agora", que abre Connect › Ativar chip já com o ICCID e o cliente da venda preenchidos.
- Remover a linha "Ativação de linha Ora Connect" do carrinho. A ativação é registrada como operação do Connect, ligada à venda pelo id, com status vindo da operadora (pendente, confirmada ou falhou).

1.2 Botão "Portabilidade" (Nova venda)
- Problema: põe no carrinho um chip mais uma portabilidade de R$ 0,00, sem número nem operadora. Isso contradiz a regra do Connect: "o cliente já precisa ter uma linha Ora Connect ativa".
- Corrigir: remover o botão da Nova venda. A portabilidade fica só em Connect › Portabilidade. Se o cliente ainda não tem linha, o fluxo é vender o chip, ativar e depois pedir a portabilidade. No fim da ativação, oferecer "Trazer número de outra operadora", que leva à aba Portabilidade com a linha nova preenchida.

1.3 Recarga — unificar
- Problema: existem três versões. Nova venda usa valores livres de R$ 15 a R$ 100 como "valor de face". Connect usa planos (4 GB R$ 29,90, 7 GB R$ 44,90, 12 GB R$ 54,90, 20 GB R$ 69,90, campanha). O extrato da Contel cobra R$ 35,90 por uma recarga de 7 GB.
- Corrigir: uma única tabela de planos e recargas, mantida no módulo Connect e usada pela Nova venda e pela aba Recarga. Cada plano guarda: preço ao cliente, custo cobrado pela Contel, vigência e origem do dado.
- O botão "Recarga" na Nova venda pede o número da linha e o plano dessa tabela, sem valor livre. Recarga só é confirmada com resposta da operadora. Se falhar, a venda fica pendente e aparece na fila de pendências.
- PERGUNTAR ao dono: a Ora fica com a diferença entre preço e custo (margem/comissão, que conta como receita) ou a recarga é só repasse (não é receita)?
  Padrão provisório: tratar como repasse. A receita da Ora é apenas a diferença preço − custo, registrada à parte.

1.4 Catálogo de produtos
- Remover "Ativação de linha Ora Connect" (CON-0002) e "Portabilidade Ora Connect" (CON-0004) de Produtos e preços. São operações, não produtos.
- "Recarga Ora Connect" (CON-0003) sai do catálogo e passa a vir da tabela de planos do item 1.3. Acabar com "custo R$ 0,00 / margem 100%".
- "Chip Ora Connect" continua como produto, com estoque por ICCID.

1.5 Indicadores
- Início, Relatórios, Metas e Caixa precisam separar: faturamento de mercadoria, receita de serviços Ora Connect (pela regra do 1.3) e valores de repasse (recarga em valor de face). Hoje o "Mix de vendas" e o "Faturamento" somam recargas como receita (R$ 455 dos R$ 535 de Ora Connect).
- O card "Chips, ativações e recargas" conta só operações confirmadas pela operadora (manter).

1.6 Ora Connect › "Vender chip"
- Manter o atalho para a Nova venda, mas abrindo direto o seletor de ICCID do item 1.1.

=====================================================
BLOCO 2 — VENDAS, CANCELAMENTO E NOTA
=====================================================
2.1 Lista de Vendas: cada venda abre uma página de detalhe com cliente, vendedor, loja, itens, IMEIs/ICCIDs, preços, descontos, pagamentos, situação da nota, histórico de status (sale_status_history) e operações Connect ligadas.
- Ações no detalhe, com permissão validada no servidor:
  - "Reenviar comprovante"
  - "Pedir cancelamento", com motivo obrigatório e anexo opcional, que vai para Aprovações
  - "Pedir nota fiscal", se ainda não pediu
- Ninguém aprova o próprio pedido.

2.2 Cancelamento: venda cancelada com "Nota emitida" (ex.: PV-24908) não pode ficar sem tratamento.
- Se a nota foi emitida, o cancelamento gera a pendência "Cancelar nota / emitir nota de devolução" na camada fiscal desacoplada, sem inventar integração fiscal.
- Cancelar devolve ao estoque os IMEIs e acessórios, dentro de uma transação, sem dupla movimentação.
- Item Connect já confirmado pela operadora (recarga, ativação) NÃO é estornado automaticamente. Ele aparece como "não reversível: tratar com a operadora" e o valor fica como pendência financeira.

2.3 Os estados da venda seguem o escopo: pendente, aprovada, paga, concluída, cancelada, estornada. Concluir uma venda exige idempotência.

=====================================================
BLOCO 3 — CAIXA E FINANCEIRO
=====================================================
3.1 Hoje a tela só mostra números. Criar as ações:
- "Abrir caixa": valor de abertura, quem abriu, hora.
- "Sangria" e "Suprimento": valor, motivo e quem fez.
- "Fechar caixa": valor contado. Se houver diferença, a justificativa é obrigatória. Fechamento com diferença acima do limite vai para Aprovações.
- Não deixa vender em dinheiro com o caixa fechado.
- Tudo registrado na auditoria.

3.2 Contas a pagar e a receber: no mínimo listar, filtrar, lançar e dar baixa, com confirmação do meio de pagamento. Parcela não é marcada como paga sem confirmação.

3.3 Financeiras (PayJoy, Aiva): o repasse depende da resposta P8. Mostrar "aguardando definição P8" em vez de prazo inventado.

=====================================================
BLOCO 4 — IMPORTAÇÃO DA REIN
=====================================================
4.1 O nome do menu ("Importar CSV da Rein") e o título da página ("Importar estoque da Rein") não batem. Padronizar.

4.2 PERGUNTAR ao dono: a importação traz só produtos e preços (como no escopo) ou também o saldo de estoque?
Padrão provisório: importar produtos e preços. Estoque de acessórios por quantidade só se o dono confirmar.

4.3 Celular nunca entra por quantidade. Ou o arquivo traz o IMEI de cada aparelho, ou o aparelho entra como "aguardando conferência de IMEI" e não pode ser vendido até a conferência física registrar o IMEI.

4.4 Manter o restante: prévia, erros por linha, duplicidade, aprovação do dono, histórico e usuário responsável. O envio real de arquivo só liga quando o formato estiver confirmado (pendência B3).

=====================================================
BLOCO 5 — LOJAS E USUÁRIOS
=====================================================
5.1 Hoje só existem Bloquear e Desbloquear. Criar:
- Novo usuário, editar usuário, vincular a lojas, trocar papel, redefinir senha (fluxo seguro, sem ver a senha) e o histórico.
- Editar loja: nome, código, CNPJ da filial, endereço, telefone, horário, meta.

5.2 Papéis: manter os 5 atuais (dono, administrador, gerente, vendedor, técnico), porque refletem a operação real (não há gerente oficial e vendedores fazem venda, caixa e lançamento). Registrar essa decisão em docs/decisoes (ADR) e mostrar como as permissões do escopo foram mapeadas para esses 5 papéis.

=====================================================
BLOCO 6 — MÓDULOS FORA DA FASE OU DO ESCOPO
=====================================================
6.1 Canais online (Fase 5): tela só informativa, sem ações. Marcar como "Em breve: Fase 5" no menu e na tela, sem números que pareçam reais. Nada de integração não oficial com WhatsApp.

6.2 Assistência técnica (OS): não está entre os módulos do escopo. PERGUNTAR se entra.
Padrão provisório: manter e documentar em docs/ como módulo adicional, com tabelas e permissões próprias.

6.3 Clientes e WhatsApp: os botões "Enviar" e "Usar como rascunho" só podem simular envio e precisam dizer isso. Envio real somente pela API oficial.

=====================================================
BLOCO 7 — VARREDURA GERAL
=====================================================
7.1 Fazer um teste Playwright que percorre todas as rotas /demo, clica em cada botão e falha se:
- algum botão não muda nada na tela, não navega e não abre diálogo;
- algum link leva a 404;
- algum texto contradiz outra tela (no mínimo verificar: tabela de recarga única, ativação e portabilidade fora do catálogo, venda cancelada sem pendência de nota).

7.2 Testar os botões "Exportar CSV": o arquivo precisa vir com cabeçalho e as mesmas linhas do filtro aplicado.

7.3 Testes Vitest das regras: reserva de ICCID/IMEI, cálculo de receita da recarga, cancelamento devolvendo estoque sem duplicar, fechamento de caixa com diferença.

=====================================================
ENTREGA (para cada bloco)
=====================================================
- O que mudou e quais arquivos.
- Migrações criadas (nada destrutivo sem me avisar antes).
- Como testar na demo, passo a passo.
- Resultado de lint, typecheck, build, Vitest e Playwright.
- O que ficou pendente e as perguntas para o dono.
Não faça deploy em produção sem minha aprovação.
```
# Prompt de continuidade para Claude Code

Atue como programador sênior do Ora 5G. Temos cinco dias para uma versão estável demonstrável. Continue da main atual; não reinicie o projeto, não troque a linguagem e não declare conclusão por número de commits.

## 1. Leia e reconcilie antes do próximo lote

Leia integralmente este pacote: README, RELATORIO, COMPOSICAO_VISUAL_E_NAVEGACAO, FLUXOS_E_ACEITE, PLANO_5_DIAS, SKILLS_PARA_O_PRAZO, SOLUCOES_PARA_AVALIACAO e os inventários/evidências. Leia também AGENTS.md, CLAUDE.md, a skill `engenheiro-senior-ora5g`, estado/passagem, pendências, ADRs, backlog/status/checkpoint e roteiros de aceite.

Busque os relatórios anteriores pelas PRs #104 e #105 e branches listadas no README, mesmo se não estiverem na main. Use o índice de documentos para registrar cada relatório pertinente como lido, já incorporado, superado por decisão posterior ou ainda pendente. Não alegue leitura de um arquivo indisponível; registre caminho/branch faltante. Não duplique integralmente o planejamento nem reabra decisões respondidas.

Compare a main com o corte `003421d`. Este relatório registra 73 testados/78 parciais/14 não iniciados/12 bloqueados/2 restrições; 0 homologados; 81 roteiros, 1 aceito. Consulte o estado atual para detectar avanços posteriores. O banco já tem carga e fotos: não repita pedidos antigos sem verificar cobertura.

## 2. Trate os achados na ordem

Reproduza F24-01 com o teste anexado. Corrija a causa na fila e no histórico, incluindo paginação/busca e acesso por número, sem esconder pendências e sem mudar as regras transacionais. Não substitua a expectativa do teste pelo comportamento defeituoso.

Depois resolva F24-02 a F24-04: reserva não deve ser chamada de venda; abrir o produto mantém contexto; “solicitar” e “enviar” são etapas distintas. Reconcilie F24-05 e explique disponibilidade comercial no caso F24-06, sem remover a obrigação do CNPJ.

## 3. Feche uma jornada por vez

Siga D1–D5 e a matriz de jornadas. Cada entrega deve incluir tela, action/route, regra, RPC/migration quando necessária, tratamento de falha, autorização, teste e evidência no domínio. Reduzir a quantidade de telas significa melhorar menu/abas e reaproveitar componentes; não criar um componente monolítico ou duplicar regras do banco.

Priorize catálogo/estoque/transferência, PDV/caixa/cliente, financeiro/gráficos e pedido do site. Termine PAY-014b antes de ligar Pix: o pago no site não pode ser cobrado novamente na loja. Asaas é o caminho de pagamento do varejo conforme D-052; Nogle mantém sua autoridade no telecom. Não invente endpoints para Nogle, financeiras, fiscal, WhatsApp ou marketplaces.

Os 179 requisitos e extras continuam no escopo. Para cada função fora da versão estável, explique exatamente o componente ausente e a dependência. Não chame importação manual de API, reserva de venda paga, teste com mock de homologação externa ou domínio de homologação de produção comercial.

## 4. Use skills como apoio delimitado

A skill específica Ora governa o contexto. Se disponíveis e compatíveis, use systematic-debugging/verificação para defeitos, vercel-react-best-practices para React/Next, web-design-guidelines para UI e Supabase/Postgres para banco. frontend-design só para composição com identidade atual. Não instale dez pacotes nem reformule todo o processo. Spartan, PlanetScale e Terraform não são pré-requisitos desta entrega. Os exemplos de SOLUCOES_PARA_AVALIACAO são propostas: avaliar e adaptar, não aplicar automaticamente.

## 5. Teste, publique e demonstre

Execute os checks exigidos no repositório, além dos testes específicos de dinheiro, estoque, idempotência, concorrência e permissões. E2E ignorado precisa de motivo e cobertura alternativa; não vale como prova de operação real. Leia a documentação da versão instalada do Next antes de mudar suas APIs.

Publique cada lote aprovado tecnicamente na homologação conforme a autorização existente. Confira commit no domínio, migrations compatíveis, workers e jornada com usuário de teste. A entrada comercial exige os dados, a recuperação ensaiada e a decisão do proprietário; não ultrapasse essa fronteira por causa do prazo.

Atualize a rastreabilidade no mesmo lote, separando implementado, testado, publicado, integrado ao fornecedor e homologado. Apresente aceites agrupados por jornada, com IDs dos requisitos e partes restantes. Não registre resposta de aceite em nome do proprietário.

## 6. Entrega diária obrigatória

Informe: jornada finalizada; SHA/PR; resultado dos testes e pulados; URL e SHA publicado; migrations; prova visual/operacional; bugs remanescentes; itens que dependem do proprietário/fornecedor; próxima tarefa. Separe bugs de código de falta de dados. Nunca envie credenciais, arquivos privados de clientes ou extratos reais ao GitHub.

No quinto dia, congele funcionalidades novas e apresente o candidato de release com critérios de entrada em operação. Seja explícito se algum fluxo crítico ainda impede uma versão comercial estável. Não prometa “100%” enquanto houver partes não executadas ou não homologadas.

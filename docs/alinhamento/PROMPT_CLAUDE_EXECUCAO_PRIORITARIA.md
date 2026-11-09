# Claude Code — execução prioritária da plataforma Ora 5G

> **Orientação consolidada vigente, 09/11/2026:** leia e execute primeiro [PROMPT_CLAUDE_CONSOLIDADO_2026-11-09.md](PROMPT_CLAUDE_CONSOLIDADO_2026-11-09.md) e o [índice das revisões Codex](INDICE_RELATORIOS_CODEX_2026-11-09.md), inclusive pela PR #33 se ainda não integrados. Este texto preserva a sequência histórica; decisões recentes prevalecem: 11 lojas comerciais + DEFEITOS, Supabase/PostgreSQL e stack atual, revalidação dos achados contra a main mais recente.

Você é o programador principal do projeto Ora 5G. O Codex atua como revisor e analista de sistemas. Execute o trabalho a seguir no repositório oraconect5g-boop/sistema-ora5g, preservando integralmente a stack, o escopo aprovado e as decisões mais recentes do proprietário.

OBJETIVO DO PROPRIETÁRIO

Concluir as pendências apontadas pelo Codex e colocar VENDAS, PAGAMENTOS/CAIXA e ORA CONNECT funcionando de ponta a ponta. Esse núcleo deve permitir substituir a Rein na loja piloto com segurança e depois nas 14 lojas. Em seguida, avançar as demais funcionalidades do planejamento por dependência e prioridade.

A prioridade atual é o núcleo operacional real. A apresentação visual deve acompanhar as entregas, sem consumir o lugar das integrações, persistência e regras de negócio.

Trabalhe com autonomia nas atividades já autorizadas. Não encerre a tarefa apenas entregando um plano ou pedindo autorização para cada alteração rotineira. Consulte o estado existente, implemente, teste, documente e continue a próxima entrega independente. Preserve as aprovações humanas de produção e decisões de negócio ainda não tomadas.

1. LEITURA E RECONCILIAÇÃO OBRIGATÓRIAS

Antes de editar, leia:
- docs/ESTADO_ATUAL_E_PASSAGEM.md;
- docs/alinhamento/ANALISE_DO_PLANO.md;
- AGENTS.md, CLAUDE.md e README.md;
- backlog.json, docs/01_REQUISITOS.md, docs/alinhamento/status-requisitos.json e docs/alinhamento/RASTREABILIDADE.md;
- docs/analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md;
- docs/analises/MATRIZ_DOS_172_REQUISITOS_2026-11-08.md;
- docs/alinhamento/REVISOES_CODEX.md e as issues correspondentes;
- docs/alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md;
- docs/alinhamento/FOTOS_DOS_PRODUTOS_2026-11-08.md;
- docs/PENDENCIAS_DO_PROPRIETARIO.md;
- ADRs, decisões de negócio e especificações de dados, fluxos, permissões, pagamentos, fiscal e integrações;
- docs/integracoes/NOGLE_API_REFERENCIA.md, coleção oficial versionada e catálogo gerado.

Confira a PR #25. Na preparação deste prompt, ela ainda estava aberta e continha auditoria, correções de rastreabilidade e o novo requisito de fotos. Incorpore essas mudanças pelo fluxo de branches, verificações e integração já autorizado no projeto. Se já tiver sido integrada, use o conteúdo atual da main. Não sobrescreva alterações concorrentes nem suponha que um documento esteja ausente sem procurar na PR e nas branches.

Referência inicial: main 7f5fd41. Verifique o HEAD atual, o diff, as issues e o CI antes de decidir o que falta. Os documentos de 172 requisitos são fotografias históricas; o backlog atualizado tem 173, incluindo ORA-CAT-011, e 71 no recorte do piloto. Recalcule os números quando entregar funcionalidades.

Se a deploy key não permitir consultar Actions/issues pela API, use os commits, documentos e reproduções disponíveis no Git, execute as verificações localmente e registre a conferência externa para o Codex. Não paralise o trabalho nem solicite um token amplo só para contornar essa limitação.

Crie uma fila executável: requisito → issue → dependências → critério de aceite → branch/PR → teste → resultado. Use a decisão mais recente do proprietário quando um documento antigo divergir. Não atribua conteúdo a conversas privadas que não estejam disponíveis.

2. STACK, ARQUITETURA E AUTONOMIA

Mantenha TypeScript, React/Next.js, Tailwind, Node.js e SQL/PostgreSQL/Supabase, com a arquitetura modular existente. Reaproveite componentes, regras puras e migrations válidas. Toda evolução de schema deve ocorrer por migration nova; preserve conteúdo, nomes e hashes das já aplicadas.

Continue no ambiente de desenvolvimento/homologação autorizado, conforme ADR-001, com usuário dev, IPv4 e serviços ligados a 127.0.0.1 nas portas corretas. Não acesse ambiente de produção, WHM, DNS ou e-mail administrativo fora das autorizações existentes.

Implemente em entregas pequenas e completas, organizadas por fluxo. Atualize contratos, autorização, estados de erro, testes e documentação no mesmo trabalho. Evite uma PR gigantesca que misture todos os domínios.

Não peça confirmação para tarefas reversíveis já autorizadas. Documente escolhas técnicas compatíveis e avance. Decisões comerciais, fiscais e acessos externos não disponíveis devem aparecer na lista consolidada de dependências, bloqueando somente o trecho que depende delas.

3. PRIMEIRA ENTREGA: LISTA CONSOLIDADA DE APIS E HABILITAÇÕES

Produza e mantenha docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md. Entregue essa lista cedo ao proprietário para que ele possa providenciar acessos enquanto você continua a implementação.

Para cada integração, informe:
- prioridade: núcleo/piloto, expansão ou posterior;
- função que depende dela e requisitos relacionados;
- fornecedor/produto contratado ou escolha ainda necessária;
- documentação oficial e situação do contrato: confirmado, parcialmente confirmado ou pendente;
- APIs/recursos realmente necessários e permissões do tipo de conta;
- autenticação e NOMES das variáveis/credenciais, nunca valores;
- como obter o acesso no canal oficial, distinguindo informação verificada de hipótese;
- ambiente de teste e habilitações necessárias;
- URLs de retorno/webhook, ou o contrato para defini-las quando a rota existir;
- eventos, verificação da origem, idempotência e reconciliação;
- o que já funciona, o que está implementado aguardando acesso e o que ainda falta desenvolver.

Organize assim:
A. Núcleo: Supabase/Auth/Storage; Nogle/Contel; provedor efetivamente escolhido para Pix/link/pagamentos online; emissor fiscal conforme contador e operação.
B. Expansão: WhatsApp oficial, Mercado Livre, TikTok Shop e logística escolhida para a loja online.
C. Escopo posterior/condicional: Shopee, Meta avançado, IA e outros serviços previstos que efetivamente exijam fornecedor.

SMTP é configuração de envio, não uma API comercial de pagamento. Chaves internas de cron, criptografia e web push devem ser geradas pelo sistema no ambiente autorizado quando necessárias, sem transferir esse trabalho ao proprietário.

Não pedir API da Rein. Não presumir API de maquininha PicPay/PagSeguro nem API PayJoy/Aiva: o projeto admite registro operacional e conferência manual desses meios conforme as decisões existentes. Automatização adicional exige contrato oficial e deve ser distinguida do fluxo manual real.

Inclua um bloco curto de dependências indispensáveis que não são APIs: arquivo da Rein, lojas/CNPJs, usuários autorizados, fotos, políticas de desconto, condições dos repasses, definições fiscais/certificados e aceite para entrada em produção. Aproveite dados já fornecidos; não volte a pedir o que está disponível.

A comunicação ao proprietário deve ser objetiva, centrada nessa lista e em bloqueios reais. Detalhes de código, resultados e andamento ficam no GitHub para revisão do Codex. Não interrompa todo o projeto aguardando uma integração. Não envie mensagens a fornecedores ou clientes sem autorização específica.

4. CORRIGIR A INTEGRIDADE ANTES DOS FLUXOS DEPENDENTES

Reproduza e corrija os achados ainda abertos, sem refazer correções já confirmadas:
- #19 / REV-020: unicidade conjunta entre IMEI principal e IMEI2 de aparelhos diferentes, inclusive sob concorrência;
- #20 / REV-021: a mesma chave de reserva não pode aceitar quantidade, origem ou conteúdo incompatível;
- #21 / REV-022: colisão de chave não pode devolver outro aparelho nem criar item sem movimento correspondente;
- #22 / REV-023: nova entrada do mesmo aparelho já presente não pode inflar o saldo;
- #23 / REV-024: transferência de eSIM deve respeitar e baixar a origem;
- #24 / REV-025: pagamento LINK confirmado deve conservar seu meio e sua correta relação com caixa/carteira;
- #11 / REV-009: comprovar renovação e persistência de cookies com sessão válida;
- #26 / ORA-CAT-011: fotos obrigatórias, na etapa do catálogo.

Use as reproduções em docs/analises/evidencias/2026-11-08 como base. Transforme os casos em regressões permanentes, adaptando-os ao contrato final sem enfraquecer as invariantes.

Para estoque, prove tanto saldo = soma dos movimentos quanto posição correta de cada item serializado. Mantenha saídas e devoluções legítimas possíveis. Defina ordem de locks e trate conflitos; repetir a mesma operação deve ser seguro, e reutilizar a chave com outro conteúdo deve ser recusado.

Faça teste com duas conexões simultâneas em PostgreSQL de desenvolvimento para mesmo IMEI, mesma chave, saldo insuficiente, liberação e expiração. Teste sequencial de PGlite não comprova concorrência real.

Registre evidências e deixe os achados prontos para conferência do Codex. Não declare revisão ou homologação que não ocorreu.

5. CONCLUIR ACESSO, CATÁLOGO, ESTOQUE E FOTOS

Complete login real, escolha de loja na sessão, vínculos, bloqueio/revogação, recuperação de senha e sessão por turno. Confirme autorização no servidor e no banco, inclusive mudança de papel/vigência durante a sessão. Use usuários de teste autorizados; mantenha dados fictícios restritos ao desenvolvimento.

O login SSR usa o par público do Supabase. Não exigir chave administrativa ou conexão SQL só para entrar. Configure cada serviço quando seu módulo precisar dele.

Integre as telas ao banco com consultas/serviços e tipos gerados. Vendedor não recebe custos, margem ou lista completa de documentos de clientes no navegador. Faça busca de cliente pelo contrato autorizado, com auditoria quando exigida.

Conclua catálogo, variantes, preços/custos históricos, política de desconto, estoque por loja, IMEI/ICCID, reserva, expiração, conferência física e disponibilidade da rede. Valores financeiros devem preservar centavos e limites seguros na conversão entre SQL e TypeScript.

Fotos:
- foto principal correspondente para todo produto;
- imagem própria quando a variante muda visualmente;
- miniatura com nome/SKU na busca, estoque e PDV e ampliação no celular;
- envio pela câmera/galeria, validação e recuperação de falha;
- metadados e arquivos com autorização por organização;
- identidade estável do objeto; URL assinada não é identidade permanente;
- produtos sem foto ficam identificados como pendentes; placeholder não conta como foto;
- seguir a especificação da issue #26, inclusive tipos não físicos e regra de completude.

Importe Rein somente por arquivo, com prévia, validação, aprovação, identidade do lote, idempotência, relatório de divergências e auditoria. Não presumir colunas antes de examinar o arquivo autorizado. A falta de fotos pode gerar pendências de cadastro sem destruir ou duplicar a importação.

6. PRIORIDADE: VENDAS/PDV REAL

Formalize os contratos de operação comercial, pagamentos e caixa no ADR correspondente, preservando os aceites humanos pendentes para uso real.

Entregue um fluxo completo no celular:
cliente quando exigido → escolha de loja/vendedor → produto/foto/variante → IMEI/ICCID disponível → carrinho misto → preço vigente e política → aprovação quando necessária → pagamento → conclusão transacional → comprovante e solicitação fiscal.

Requisitos essenciais:
- venda e itens persistentes, vinculados a loja, vendedor, cliente e canal;
- preço, custo aplicável e regra comercial registrados no momento;
- cálculo e autorização no servidor;
- reserva e baixa consistentes com a venda;
- conclusão idempotente, protegida contra clique duplo e reenvio;
- aprovação com autor, motivo, validade e limites; impedir autoaprovação indevida;
- alteração do carrinho invalida aprovação incompatível;
- rascunho, pendência, falha, cancelamento, devolução e estorno com estados explícitos;
- efeitos em estoque, financeiro, fiscal e comissão rastreáveis e compensatórios.

Navegar por um mockup ou alterar useState não comprova venda operacional.

7. PRIORIDADE: PAGAMENTOS, CAIXA E FINANCEIRO OPERACIONAL

Entregue dinheiro, Pix, cartões/maquininhas, link, pagamento misto e financiamento conforme os contratos e decisões existentes.

Implemente:
- abertura, suprimento, sangria, recebimento, fechamento, diferença e conferência;
- pagamento separado de autorização, liquidação, estorno e conciliação;
- confirmação manual rastreável quando esse for o fluxo aprovado, diferenciada de confirmação automática do provedor;
- troco apenas sobre dinheiro recebido, com soma correta dos meios;
- contas a receber, taxas, repasses, vencimentos e conciliação;
- comprovantes e identificadores do provedor quando disponíveis;
- prevenção de dupla confirmação e dupla baixa.

PayJoy/Aiva: registrar preço do aparelho, entrada recebida e restante a receber da financeira. Juros cobrados pela financeira não viram receita, meta ou comissão da Ora. E-mail do cliente é obrigatório no fluxo PayJoy, conforme decisão existente. Não inventar taxa ou prazo de repasse.

Integrações: usar contratos oficiais; processar webhooks autenticados com deduplicação, eventos fora de ordem, reconsulta e reconciliação. Não confirmar pagamento pelo retorno visual do navegador. Evitar nova cobrança quando houver timeout com resultado desconhecido. Não armazenar PAN/CVV de cartão.

Extrato, caixa, venda, receita e comissão devem permitir chegar ao fato de origem.

8. PRIORIDADE: ORA CONNECT REAL

Transforme a fundação Nogle em adaptador exclusivamente no servidor e operações persistentes, com vendedor, loja, cliente, ICCID/MSISDN, identificadores externos e auditoria.

Implemente as funções aplicáveis ao contrato/tipo de chave da Ora: chip físico/eSIM e estoque; cadastro e consulta; venda de chip; ativação; consulta de linha/plano/saldo/consumo; recarga; portabilidade; carteira/repasses; atendimento e gestão permitidos.

As 62 funções documentadas não são 62 integrações já implementadas. Confira acesso de franquia, marca/MVNO ou PDV. Resolva as dúvidas registradas: 25 GETs com corpo, formato da recarga, exemplo contraditório de portabilidade, validade do token, limites, ambiente de teste, idempotência e webhooks. Não invente rota, verbo, parâmetro, transporte ou permissão para contornar a dúvida.

Pode adiantar contratos, implementação baseada no que está confirmado e testes com fixtures sem credenciais. Chamadas reais dependem do acesso e transporte válidos; habilite somente as operações verificadas.

Venda do chip, solicitação de ativação, confirmação da operadora e portabilidade são fatos separados. Só confirmar estado externo com evidência externa. Recarga deve separar valor de face, recebimento, débito da carteira e receita da Ora. Atribua produção ao vendedor/loja de origem, sem duplicidade.

Use estados persistentes e rotinas de reconsulta/reprocessamento. Expiração de token, rede indisponível, resposta ambígua ou repetida não podem gerar cobrança, ativação ou produção duplicadas. Não reativar automaticamente uma operação de resultado desconhecido.

9. FISCAL E CONDIÇÕES PARA SAIR DA REIN

Prepare fila fiscal, avisos, aprovação interna, emissão, consulta, anexos, envio e correções conforme os documentos aplicáveis à operação e a homologação do contador/provedor. Não inventar tributação, certificado, modelo de nota ou prazo. Aprovação interna não pode atrasar obrigação legal.

A independência da Rein exige critérios observáveis:
- catálogo e estoque piloto importados e conferidos;
- usuários, permissões e fotos completos para o piloto;
- vendas e pagamentos reais reconciliáveis;
- caixa diário fechado e divergências tratadas;
- Ora Connect homologada com linha/chip autorizados;
- obrigações fiscais atendidas;
- cancelamentos e devoluções testados;
- backup e restauração de banco/anexos comprovados;
- contingência e suporte documentados.

Mantenha a transição controlada prevista: 2–4 semanas de operação paralela e comparação diária, salvo decisão posterior explícita do proprietário. Defina qual sistema é a fonte oficial em cada fase para não contar a mesma venda duas vezes nem baixar o estoque duas vezes.

Apresente o go/no-go da loja piloto com evidências. Desligamento operacional da Rein, corte para produção e expansão dependem do aceite do proprietário. Não apagar histórico nem desativar a Rein por iniciativa própria.

10. AVANÇAR O RESTANTE DO ESCOPO

Depois de estabilizar as entregas do núcleo, avance continuamente os demais requisitos por dependência:
- gestão de lojas/usuários e importação completa;
- CRM, histórico e contratos;
- transferências, compras, devoluções e inventário;
- turnos, metas, performance e comissões por evento idempotente;
- assistência/OS: custódia, orçamento, autorização do cliente, execução/entrega, avisos e comissão;
- financeiro/relatórios com rastreabilidade;
- ondas 1 → 3 → 7 → 14 lojas;
- Mercado Livre, loja online, TikTok Shop e WhatsApp oficial;
- demais canais, Meta avançado, IA e BI conforme o planejamento.

Formalize os IDs de OS que faltam no backlog, sem contá-los como concluídos. Trate P3/P5 e outras decisões pendentes com contratos reversíveis e negação por padrão; não conceda permissões por suposição.

Segurança, LGPD, auditoria, observabilidade, performance mobile e restauração acompanham todas as etapas. IA não autoriza autonomamente pagamento, desconto, crédito, fiscal ou ativação sensível.

11. CREDENCIAIS, AMBIENTES E INTEGRAÇÕES BLOQUEADAS

Solicite somente nomes, tipo de acesso, habilitações e instruções oficiais. Nunca peça senhas, tokens, certificados ou bases de clientes no chat ou GitHub.

Valores ficam no gerenciador de segredos/ambiente autorizado. Atualize .env.example e documentação com nomes e exemplos seguros conforme o código precisar; não exigir todas as integrações para o aplicativo iniciar.

Não converter ausência de acesso em sucesso fictício. Separe: implementado/testado localmente; aguardando credencial/contrato; integração testada no ambiente do fornecedor; homologado pelo proprietário.

Não enviar mensagens reais, criar cobranças, ativar linhas ou emitir notas em ambiente real sem a autorização correspondente. Use ambientes/contatos de teste autorizados. Não contratar serviços pagos nem alterar produção implicitamente.

12. TESTES E CRITÉRIO DE ENTREGA

Execute as verificações adequadas a cada entrega e a sequência completa combinada antes da integração:
- instalação limpa com npm ci, Node e versões do projeto;
- scanner de segredos e histórico;
- geradores de rastreabilidade e catálogo Nogle conferidos;
- lint, typecheck, testes, build e audit --omit=dev;
- Playwright em celular e computador, sem disputar a porta da homologação.

Não remover testes, mascarar erros ou transformar casos necessários em skipped/TODO para obter CI verde. Registre os casos não executados e o motivo.

Para o núcleo, prove:
A. Venda à vista e mista, com foto, IMEI/ICCID, baixa, recebimento e comprovante.
B. Desconto autorizado/negado e tentativa de autoaprovação.
C. Dois vendedores disputando o mesmo estoque.
D. Reenvio de requisição e webhook duplicado/fora de ordem.
E. Financiamento com entrada e repasse, sem incluir juros da financeira.
F. Chip vendido, ativação pendente/confirmada, recarga e portabilidade sem dupla produção.
G. Rede/provedor indisponível, renovação da sessão e recuperação após falha.
H. Cancelamento/devolução/estorno e fechamento diário conciliável.
I. Tentativas de acesso de outro papel, loja e organização.
J. Restauração de backup e retorno de uma versão defeituosa.

Teste crítico pulado, demonstração com fixture ou saúde HTTP 200 não comprovam funcionamento transacional de ponta a ponta.

13. DOCUMENTAÇÃO, REVISÃO E CONTINUIDADE

Em cada entrega, mantenha atualizados:
- estado e passagem de contexto;
- plano e fila de execução priorizada;
- backlog, status real e rastreabilidade regenerada;
- ADRs, contratos e políticas;
- issues/PRs com requisito, mudança, schema, testes, evidências e reversão;
- lista de APIs/habilitações e pendências do proprietário.

Mantenha o papel do Codex como revisor. Não declare que ele aprovou algo sem registro. Siga o processo de integração já autorizado: branches, verificações completas em instalação limpa, integração pelo Claude conforme a decisão vigente e revisão do Codex. Se não puder abrir PR pela API, publique a branch e seu link de comparação, com o relatório completo; não declare uma PR criada sem que ela exista. Preserve o fluxo de integração já autorizado. Produção conserva a aprovação exigida pelo proprietário.

Se a sessão/contexto terminar, deixe tarefas concluídas, próxima tarefa, branch/SHA, comandos, resultados e bloqueios no documento de passagem. Na retomada, continue do ponto registrado.

14. COMEÇAR AGORA

Confirme o estado atual e as mudanças da PR #25, publique a lista inicial de APIs/habilitações e inicie a correção dos achados de integridade. Em seguida, entregue acesso e catálogo reais e desenvolva os fluxos completos de vendas, pagamentos e Ora Connect.

Avance os itens independentes quando houver dependência externa. Não finalize com uma proposta genérica, telas simuladas ou uma lista de tarefas sem implementação.

Ao comunicar ao proprietário, entregue a lista consolidada do que ele precisa providenciar e a evidência objetiva das entregas. Todo o detalhamento técnico deve ficar acessível no GitHub para o Codex. A meta é uma operação real, testada e homologável que permita sair da Rein pelo processo de transição aprovado.

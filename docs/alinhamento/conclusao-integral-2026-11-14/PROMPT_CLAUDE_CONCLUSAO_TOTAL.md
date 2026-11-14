# Prompt de execução integral — continuar e concluir a Ora 5G / Ora Connect

Você é o Claude Code, programador responsável pela implementação da Ora 5G/Ora Connect. Atue como engenheiro de software e analista de sistemas sênior. O Codex faz revisão independente.

**Pedido do proprietário:** implementar as correções identificadas e continuar de onde você parou até concluir todas as funcionalidades do aplicativo. Comece a executar depois da conferência inicial; não devolva somente um plano, não reinicie o sistema e não pergunte a cada lote se deve continuar. Prossiga pelas partes autorizadas e executáveis. O refinamento visual fino vem depois da funcionalidade completa, preservando os gráficos e a usabilidade móvel necessários à operação.

Este prompt autoriza o trabalho de desenvolvimento dentro do escopo solicitado. Não transforma credencial ausente em contrato aprovado nem autoriza cobrança, ativação real, emissão fiscal real ou deploy crítico fora do processo do projeto. Bloqueie somente o ato dependente, registre exatamente o que falta e continue as demais entregas. Não declare “concluído” enquanto houver requisito essencial sem prova.

## 1. Ponto de retomada: não começar de novo

- Base reanalisada em **14/11/2026:** `dd31e91465335b7ad4a4f1ff59e80f7981ddd78d`.
- Últimas entregas: **L9a**, regras de bônus por meta, cartão e extrato do vendedor; **L9b**, conferência/contestação da gerência, aprovação do dono e fechamento imutável. As migrations de ambos foram registradas no desenvolvimento. Preserve essas entregas e complete somente o que falta.
- **53 migrations** no Git e no registro versionado `packages/banco/supabase/aplicadas-dev.json`, com os 53 MD5 conferidos pelo revisor. Isso não substitui a prova autenticada no ambiente. Não repetir a informação antiga de que faltam as 12 migrations do G2b ao L8c; elas já foram registradas como aplicadas.
- Site conferido em `dd31e91`, build de **14/11 às 07:50**, observado às 09:38 de São Paulo. Novas rotas reais, inclusive `/metas/bonus`, `/metas/extrato` e `/metas/fechamento`, existem e exigem login. Não confundir a aplicação real com `/demo`.
- Planejamento: **179 IDs**; no corte atual, **38 marcados como testados em desenvolvimento, 65 parciais, 73 não iniciados, 2 bloqueados e 1 restrição respeitada**. Nenhum homologado. Não tratar contagem de testes ou telas como percentual de projeto pronto.
- **Cinco bugs continuam reproduzíveis:** #78, #79, #80, #82 e #83. A regra de cliente/nota/WhatsApp de #76 e PR #77 continua pendente no código.
- O CI exato de `dd31e91` havia sido cancelado em E2E; o Codex solicitou reexecução e a **tentativa 2 da run `43587125655` passou**, com 1.729 testes (um TODO), 243 E2E e 11 ignorados. Conferir novamente se houver novo commit, sem usar o verde de outro SHA como aprovação automática do topo.

Se a main ou sua worktree avançaram depois desse corte, faça uma comparação curta e atualize o estado, sem descartar alterações suas ou refazer correção já integrada.

## 2. Leitura obrigatória e fontes

Leia integralmente, nesta ordem:

1. `docs/ESTADO_ATUAL_E_PASSAGEM.md`, `AGENTS.md`, `CLAUDE.md` e a skill `.claude/skills/engenheiro-senior-ora5g/SKILL.md`.
2. `docs/alinhamento/EXECUCAO_INTEGRAL_STATUS.md`, `execucao-integral-status.json`, `status-requisitos.json`, `RASTREABILIDADE.md`, `PEDIDO_DE_REVISAO_CODEX.md` e decisões vigentes em `docs/10_DECISOES_PENDENTES.md`.
3. Este pacote: `ESTADO_VERIFICADO.md`, `FILA_INTEGRAL_179.md`, `FONTES_OBRIGATORIAS.md` e `evidencias/LEIA-ME.md`.
4. ADRs e documentos do domínio antes de cada implementação. Use os 111 Markdown inventariados em `FONTES_OBRIGATORIAS.md`; não omita relatórios porque estão fora da main.
5. PRs documentais **#67, #68, #77, #81, #85, #66 e #33**, incluindo arquivos/evidências pertinentes. A #67 preserva o pacote mestre, as fontes históricas e o relatório do Claude Web. A #85 contém a revisão mais recente anterior a esta. Leia pela branch/Git ou pelo GitHub; não é necessário mesclar para ler.

Relatórios são vinculados a SHA/data. Conclusões antigas sobre três gráficos no real, build `0b6b45e`, falta de 12 migrations ou comissão por venda foram superadas. Preserve as evidências históricas, mas não use sua redação antiga para desfazer o código atual. Não faça merge em massa de branches documentais antigas: podem conter versões do checkpoint anteriores aos novos lotes.

Precedência: pedido explícito recente do proprietário e decisões vigentes → contratos/ADRs aceitos → código/testes como evidência de implementação → requisitos → pesquisas/mockups. Registre conflitos em vez de decidir silenciosamente.

## 3. Stack e arquitetura obrigatórias

Preserve **TypeScript, Next.js/React/Tailwind, Node.js e Supabase/PostgreSQL**, npm workspaces e o monólito modular:

- `apps/plataforma`: UI real, ações/rotas de servidor e acesso autorizado.
- `apps/worker`: rotinas administrativas e integrações com segredos.
- `packages/dominio`: contratos e regras compartilhadas.
- `packages/banco`: schema, RPCs, RLS, tipos e testes transacionais.
- `packages/config`: ambiente, segurança e validação.

Não migrar para Firebase, outra linguagem, banco operacional paralelo ou microsserviços para contornar pendência. Não criar um segundo cadastro de cliente, produto, pedido ou estoque por canal. Use migrations incrementais e contratos extensíveis para reduzir retrabalho, sem prometer que nunca será necessário evoluir código/schema.

Demo é referência visual com dados fictícios. Funcionalidade real lê/grava no backend autorizado e apresenta estados reais. Não copiar números de demonstração para esconder erro, fonte ausente ou integração desligada.

## 4. Decisões de negócio que não devem ser perguntadas novamente

1. A rede tem **11 lojas comerciais e o local DEFEITOS**. DEFEITOS guarda itens com problema e não vende. Transferências devem funcionar entre lojas e para/de DEFEITOS. Santa Cândida é o piloto; 14 lojas é meta de expansão.
2. **Fotos dos produtos** são necessárias para identificação visual. Exibir no catálogo, busca, estoque, PDV e pedido de transferência, com associação correta à variação visual. Placeholder não comprova requisito atendido. Importação pode produzir pendências de foto para resolução, sem inventar fotografia nem afirmar que o catálogo está completo.
3. **Cliente rápido:** nome completo e WhatsApp; e-mail sempre opcional. No fluxo fiscal, coletar endereço completo e demais dados exigidos pelo documento. A nota precisa poder ser enviada pela integração oficial do WhatsApp. E-mail do cliente é diferente do login dos funcionários.
4. **Rein somente por arquivos** de produtos, preços e estoque; não desenvolver API operacional Rein.
5. **Nogle/Contel é um sistema externo integrado por API**, fonte oficial dos fatos telecom e dos respectivos pagamentos/repasses. Toda operação local precisa de correlação e reconciliação com o registro externo aplicável. Não é um servidor/aplicativo a substituir.
6. Prioridade comercial: vendas, pagamentos/caixa e Ora Connect funcionando de ponta a ponta para a transição homologada. Gateway, recorrência, carteira, extratos e repasses Nogle fazem parte da conclusão, não são enfeites de dashboard.
7. **D-014 atual: a Ora não paga comissão por venda; paga bônus por meta mensal.** Contam vendido líquido, aparelhos, acessórios em valor e Ora Connect confirmado. Venda conta na conclusão, inclusive financiada; cancelamentos/devoluções descontam no mês do fato. Regras só do dono; gerência confere/contesta; dono aprova; vendedor vê seu extrato. Fechamento aprovado é imutável. Não recriar comissão por evento, margem ou campanha a partir de pesquisas antigas.
8. **D-036–D-038:** contas a pagar por categoria, parcelas/repetição, dono na rede e gerente na própria loja; DRE gerencial só do dono, pelo vencimento e com rateio central conforme decisão; previsão só do dono, estimativa identificada e saldo digitado somente no navegador. Não transformar estimativa em saldo confirmado.
9. As **três contas fictícias de teste — vendedor, gerente e dono — já foram solicitadas/autorizadas nesta conversa**. Não manter J1 bloqueado por nova pergunta equivalente. Execute no ambiente de teste permitido, preserve a conta do dono já indicada e use canal privado para acesso. Não publique e-mail pessoal/senha em relatório ou código.
10. O arquivo `relatorioProdutos131258.xlsx` já foi recebido: posição de **10/11/2026 às 13:20**, com 2.271 produtos/83 colunas. Não pedir novamente nem assumir que é estoque de hoje. O importador CSV de catálogo atual não cobre sozinho esse layout por local.

Pendências específicas continuam específicas: **D-039** (bônus aprovado gerar conta a pagar, forma de pagamento, vencimento/competência), **P3** (nomes dos colegas no ranking), **P5** (acesso do técnico), **D-035** (combos/regras comerciais) e contratos externos. Não inventar taxa, imposto, CNPJ, saldo, foto, regra de folha ou endpoint. Prepare proposta/contrato/configuração revisável, registre a dependência e avance no restante.

## 5. Primeiro lote: corrigir os bugs confirmados

Trabalhe por issue/branch, com mudança mínima completa. Leia o corpo e a prova atual antes de editar. Os testes observacionais dos relatórios passam ao reproduzir bugs; **não são critérios de aceite**. Crie regressões com o resultado seguro e preserve as provas históricas ligadas ao SHA.

### #78 — quem contou aprova o próprio ajuste

- Fonte: `20261111142726_inventario.sql`, `inventario_decidir`, guarda que considera apenas criador/enviador.
- Reprodução: gerente abre/envia, dono conta e aprova; `contado_por = decidido_por` e ajuste aplicado.
- Corrigir a segregação considerando o contador efetivo dos itens. Recontagem por outra pessoa deve ter regra clara e trilha; não basta esconder botão.
- Aceite: impedir autoaprovação via RPC, inclusive com vários contadores e tentativa direta; permitir a pessoa autorizada e independente; preservar auditoria e estoque concorrente.

### #79 — IMEI e IMEI2 duplicam contagem

- Fonte: `inventario_contar`, quantidade calculada por cardinalidade dos identificadores.
- Corrigir a resolução para identidade física, contando uma vez por aparelho. Separar identificador desconhecido/fora da loja/variação com alerta.
- Aceite: dois aparelhos, um dual SIM e três identificadores, contam dois; testar repetição, IMEI2, ICCID e origem diversa. Não acrescentar/remover saldo silenciosamente.

### #80 — conferência diária anuncia conclusão após truncar em 500

- Fonte: ramo de conferência em `app/estoque/page.tsx`.
- Calcular total/conferidos/pendentes no banco sobre o conjunto autorizado completo; paginar a lista com ordem estável e sem confundir falta de página com estoque zero.
- Aceite: 501 itens, primeiros 500 conferidos e último pendente, jamais resulta em “Tudo conferido”. Testar mais de 1.000, outra loja/organização e dia anterior.

### #82 — previsão desconta estorno externo ainda pendente

- Fonte atual: `20261114013159_previsao_de_caixa.sql`, CTE `reembolsos`.
- Separar solicitação de estorno de saída monetária efetiva. Dinheiro segue movimento real; Pix/cartão só entram como devolvidos quando confirmados, na data da confirmação.
- Aceite: pendente não reduz base como pago; confirmação em outra semana entra na semana correta, uma vez. Testar reembolso misto, vale-troca, cancelamento e reprocessamento.

### #83 — desfazer repasse reabre crédito de venda cancelada

- Fonte atual: `20261114012722_financeiras_a_receber.sql`, `financeira_desfazer_recebimento` e `financeira_receber`.
- Validar o estado comercial em ambas as transições. Preservar o recebimento histórico e a compensação/estorno sem reabrir como crédito exigível de venda cancelada.
- Aceite: registrar repasse, cancelar venda e desfazer/corrigir não permite novo recebimento indevido; testar cancelamento antes/depois do repasse e corrida entre decisões.

### Exportação e regressões anteriores

- `consultarContas` pede 5.001 linhas de uma vez; com teto simulado de API 1.000, exporta 1.000 de 1.001 sem aviso. O teto remoto não foi medido. Implementar paginação completa abaixo do teto, ordenação com desempate por ID e indicação correta do limite. Verificar consultas filhas e downloads semelhantes.
- Provar que R1/R2 continuam seguros: custo protegido, prévia desatualizada não sobrescreve preço, IMEI estornado reentra sem duplicar, produto inativo não recebe, unicidade concorrente e desfazer por identidade preservam edição posterior.
- Não inferir IDs: REV-NOV-004 é #71; 005 é #72; 006 é #73; 007 é #74. R1 = #69/#71/#72 + entradas da #75; R2 = #70/#73/#74 + importação da #75.

## 6. Segundo lote: configuração real, acesso e J1

1. Conferir projeto/ambiente, versão publicada, histórico efetivo das **53 migrations** e hashes. Não reaplicar migrations por leitura de texto histórico. Se outro ambiente usou nomes antigos, reconciliar o histórico explicitamente; não duplicar SQL nem apagar dados.
2. Conferir nomes/configuração no servidor autorizado do programador. O web recebe somente a allowlist pública; segredos Supabase/Nogle/fiscal/WhatsApp ficam no worker. Nunca mandar `.env`, token, certificado ou senha ao Codex/chat/GitHub.
3. Com MCP indisponível, avaliar CLI/cliente já autorizado, lendo versão/ajuda; não esperar indefinidamente por um conector específico. Se realmente faltar acesso, registrar só o nome/capacidade ausente e seguir outro item.
4. Criar/vincular as três contas fictícias já autorizadas e validar Auth, perfil, loja, vigência/turno e recuperação/revogação. Não enfraquecer RBAC/RLS para conseguir entrar.
5. Executar J1 autenticado com cada papel: login → loja → Início/gráficos → catálogo/foto → estoque/transferência → caixa/venda mista → cliente/nota → cancelamento/devolução/estorno → financeiro → metas/bônus/extrato/fechamento conforme a permissão.
6. Validar vendedor isolado de colegas/custos, gerente restrito à loja, dono na rede; acesso negado também em RPC/download/endereço digitado. Testar sessão expirada/bloqueada e outra organização.
7. Conferir números contra fatos, mais de uma página, nenhum movimento, falha, fonte ausente e sem permissão. Falha não vira zero. Saúde conectada ao Auth e 307 sem login não são J1.

## 7. Terceiro lote: cliente, fiscal e WhatsApp prioritários

Implemente #76/PR #77 em todas as camadas: formulário rápido e completo, validação compartilhada, RPC, schema/tipos, edição, cliente da venda e destinatário fiscal.

- Nome completo e WhatsApp no rápido; e-mail ausente deve ser aceito. Normalizar/validar telefone e tratar compartilhamento/deduplicação sem mesclar pessoas por suposição.
- Pedir endereço completo no passo fiscal pertinente, sem obrigar endereço no rápido: CEP, logradouro, número, complemento quando houver, bairro, município e UF; demais códigos conforme o contrato fiscal. Validar documento e campos tributários conforme documento/fornecedor.
- Não criar e-mail fictício para passar em financiamento. Se contrato externo verificado exigir informação adicional, tratar a operação específica sem reintroduzir obrigação no cadastro geral/nota.
- Envio oficial da nota: documento vinculado à venda/cliente, outbox/worker, autorização/finalidade, mídia/template quando necessário, assinatura de eventos, idempotência, tentativas, entrega/falha e acesso privado/temporário ao documento.
- Botão de abrir WhatsApp não conclui a integração. Mensagem transacional de nota não exige adesão de marketing. Nunca enviar ao cliente/documento errado nem expor Storage publicamente por conveniência.
- Fiscal sem fornecedor: concluir contratos e estados locais testáveis; operação oficial só com contador/provedor e habilitação. Não mostrar nota como emitida só porque foi solicitada internamente.

## 8. Núcleo operacional e Nogle: prioridade até funcionar de ponta a ponta

### Catálogo, estoque e dados reais

Concluir fotos e busca intuitiva por produto/variação/identificador, com “onde tem” por loja, físico/reservado/disponível/trânsito, pendências e solicitação interna de transferência. Preservar DEFEITOS e prova de expedição/recebimento/divergência.

Preparar importação do XLSX recebido com mapeamento explícito dos 12 locais, prévia/aprovação, validação de SKU/códigos, unidades de medida, números brasileiros, cabeçalhos/rodapés, negativos/divergências e linhas sem correspondência. Não converter metro em peça, inventar IMEI/ICCID ou ignorar erro para fazer o total bater. Preservar o original; conciliar movimentos posteriores à posição histórica. Não publicar a base/custos no GitHub.

### Vendas, pagamentos e financeiro

Completar os fluxos faltantes de PDV móvel, preço/campanha/combos decididos, misto/financiamento, comprovante, reserva/baixa, troca/diferença, pós-venda e retorno físico conferido. Separar venda, autorização, pagamento, liquidação, estorno e conciliação.

Concluir contas/recebíveis/vencimentos, importação de extratos, taxas/parcelas/repasse, bancos/multiempresa, chargebacks/antecipação/ajustes e inadimplência autorizada. Reutilizar caixa, terminais, contas a pagar, DRE e previsão; corrigir os bugs antes de ampliar cálculos. Identificar origem da despesa para não contar o mesmo fato em saída de caixa e conta a pagar.

Concluir exportações autorizadas **CSV/XLSX/PDF**, paginação e completude; CSV que abre no Excel não é XLSX nativo. Impressão/salvar PDF deve mostrar os filtros/dados corretos e respeitar acesso. Custos/margem protegidos também em arquivos e agregados.

### Nogle/Contel: C1 e C2

Implementar/homologar o que falta de compra/estoque de chips, ativação, recarga, portabilidade, gateway/cobrança, recorrência, carteira/extrato e repasse usando **somente contratos/endpoints verificáveis**.

- Confirmar tipo/escopo da conta franquia/marca/PDV e correlação por organização/loja/vendedor/ICCID/linha/operação/cobrança externa.
- Credenciais somente no worker. Habilitar apenas tipos homologados; controlar GET com corpo e consulta de pagamento conforme a documentação confirmada.
- Um fato/cobrança/operação por identidade idempotente; SALDO e LINK têm efeitos diferentes. Serviço já pago não deve gerar segunda cobrança; timeout ambíguo vai para consulta/reconciliação, sem reenvio cego.
- Não presumir webhook quando o contrato usa reconsulta. Validar referência, valor, estado e origem oficial antes de confirmar. Cobrança aceita não é ativação concluída, e ativação concluída não é repasse liquidado.
- Conciliar relatórios/estoque/carteira/valores locais com Nogle. Produção atribuída ao vendedor de origem, inclusive quando gerência resolve pendência. Não somar valor de face de recarga como receita por suposição.
- Recorrência: ciclo/vencimento, falha, alteração/cancelamento, reprocessamento e reversão pelo contrato. Agendamento com exclusão mútua, última execução e alertas; exit zero do cron não prova operação.
- Homologar em sandbox ou linha/chip de teste autorizados. Credencial ausente bloqueia a chamada externa, não o restante do código. Registro local ou revisão gerencial não substituem comprovação oficial.

## 9. Concluir bônus e gestão sem recriar comissão

L9a/L9b já existem. Preserve faixas versionadas, extrato, contestação, aprovação e imutabilidade. Complete o que a matriz ainda aponta: margem por vendedor para gestão, metas coletivas/regional e rankings conforme P3, trilha/relatórios e recomendações assistivas PERF-010.

**D-039:** o bônus aprovado ainda não gera automaticamente conta a pagar nem comprova pagamento. Prepare integração com origem única no fechamento, prevenção de duplicidade, estados e proposta/configuração de vencimento/competência/meio. Submeta a decisão específica ao proprietário com resultado revisável; até ela existir, não lançar nem pagar por hipótese. Continue os demais domínios. Aprovação, obrigação a pagar, pagamento e conciliação precisam ser estados diferentes.

## 10. Finalizar todos os demais domínios

Não encerrar no piloto ou após o financeiro. Percorra **cada linha** de `FILA_INTEGRAL_179.md`, inclusive os IDs que hoje não têm entrada em `status-requisitos.json`.

| Domínio | IDs | Escopo que deve ser concluído |
|---|---|---|
| Organização | ORG-001–010 | Empresa/lojas/perfis, escopos, vigência, acesso reforçado, configurações, regional e multi-CNPJ/UF |
| Catálogo | CAT-001–011 | Produto/variação/foto/tipos, busca, códigos, preço/custo, importação e regras |
| Estoque | INV-001–012 | Livro/serializados/reserva, conferência, transferências/DEFEITOS, inventário, compras/fornecedor e logística |
| CRM | CRM-001–010 | Cliente, identificadores protegidos, histórico, funil/agenda, consentimentos, mesclagem, contratos/anexos e segmentação |
| PDV | POS-001–016 | Jornada móvel, itens mistos, autorização, pagamentos, fiscal, troca/devolução, regras e câmera/contingência |
| Pagamentos | PAY-001–014 | Meios, financiamento, estados, caixa, terminais, conciliação/extratos, estornos/repasse e integrações confirmadas |
| Financeiro | FIN-001–010 | Resumo, margem/DRE, pagar/receber, repasses, bancos, inadimplência, consolidação, exportações e previsão |
| Performance | PERF-001–010 | Produção, metas/bônus vigentes, extrato, reversões, fechamento, regional/ranking e IA assistiva |
| Fiscal | FISC-001–010 | Solicitar/aprovar sem atraso legal, cadastro tributário, emissão/protocolo, reprocesso/contingência, devolução e multi-UF |
| Telecom | CONNECT-001–011 | Operações e registro oficial Nogle, estoque/chips/linhas, cobrança/recorrência/carteira/repasse e conciliação |
| Online | ONLINE-001–008 | Loja nacional, mesmo catálogo/estoque/pedido, checkout, fiscal/logística e pós-venda |
| Marketplaces | MKTPL-001–008 | Adaptadores oficiais, OAuth/renovação, eventos, catálogo/preço/estoque/pedido/devolução e repasses |
| WhatsApp | WHATS-001–008 | API oficial, caixa multiatendente, atribuição, histórico, SLA/templates, pós-venda e humano |
| Meta | META-001–006 | Contas/campanhas, leads/eventos/atribuição consentidos e relatórios |
| IA | AI-001–007 | Sugestões/qualificação/análise avaliadas, permissões/LGPD, limite e supervisão humana |
| Relatórios | REPORT-001–008 | Gestão/gerente/vendedor, telecom/pagamento/margem/alertas e expansão, com fatos auditáveis |
| Qualidade | QUAL-001–014 | CI/RLS/auditoria/segredos, restauração, observabilidade, migrations, contingência, piloto/mobile, LGPD/carga/incidentes |
| Assistência | OS-001–006 | Entrada/diagnóstico/orçamento, autorização, peças/execução, garantia/entrega e financeiro |

Use IDs completos com prefixo `ORA-` nos registros. Os intervalos somam 179. Os aceites efetivos devem incorporar as decisões recentes, sem excluir IDs ou marcar uma função como pronta porque há uma tela.

Para OS, implementar o fluxo local sem esperar P5 para todo o módulo; bloquear somente a modalidade de acesso externo indecidida. Para canais, reutilizar reserva/pedido/fiscal/cliente, tratar cancelamento parcial, evento duplicado/fora de ordem, expiração/renovação de token e reconciliação. Para IA, não permitir aprovação autônoma de dinheiro, desconto, crédito, fiscal ou ativação.

## 11. Contratos externos: lista única e progresso contínuo

Atualize a lista existente `docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`. Não criar outra lista concorrente com estado diferente.

Para cada dependência, registrar: fornecedor/capacidade, IDs bloqueados, código já implementado, contrato oficial/fonte, nomes das variáveis, ambiente de teste, callback/eventos a implementar, tratamento de assinatura/idempotência, teste de desbloqueio, responsável e próxima ação. Não incluir valores de chaves nem dados reais.

Separar **falta de código**, **falta de configuração**, **falta de contrato/acesso** e **falta de aceite**. Configurar token não implementa o módulo. Adapter com fixture permite desenvolvimento/teste, mas não deve aparecer como integração real em produção. Não inventar taxas, prazos, endpoints, documentos fiscais ou disponibilidade de API de maquininha.

Agrupar somente dúvidas realmente bloqueadoras em um registro objetivo com proposta revisável. Não repetir decisões ou arquivos já fornecidos. Enquanto aguarda uma resposta externa, avançar no próximo item independente; não parar o projeto inteiro.

## 12. Processo por lote e verificação

1. Definir issue/IDs/aceite e ler a implementação existente. Não editar o mesmo schema/arquivo simultaneamente com outra worktree.
2. Implementar uma fatia vertical completa: contrato/domínio → schema/RLS/RPC/worker → UI/ações → testes → evidências/estado. Manter o código anterior útil e remover caminho substituído apenas após provar referências, migração e reversão; não deixar dois fluxos operacionais concorrentes.
3. Manter operações monetárias em centavos, estoque consistente, locks/idempotência e transação de efeitos relacionados. Testar concorrência, retry, estorno/cancelamento, alteração posterior e acesso negado em operações críticas.
4. Para Next.js, ler a documentação da versão instalada em `node_modules/next/dist/docs` quando aplicável; respeitar as instruções locais. Para Supabase, verificar a documentação/CLI vigente, gerar migrations pelo fluxo suportado, grants/RLS/tipos e advisors conforme o ambiente.
5. Em checkout limpo do lote e na ordem correta: `npm ci`, scanner `npm run segredos`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --omit=dev`, geradores de rastreabilidade/catálogo com `--conferir` e `npm run test:e2e`. O E2E do projeto usa a build de produção: gerar antes. Não desabilitar teste, reduzir guardas ou afrouxar tipos para obter verde.
6. Registrar testes executados, ignorados/TODO e limites. Reproduções de bug não são teste de aceite; E2E com mock não é J1; CI de outro commit não aprova o atual.
7. Atualizar checkpoint, JSON de requisitos, rastreabilidade, pedido de revisão e a lista central de integrações no mesmo lote. Usar os estados válidos; “testado” é desenvolvimento, “homologado” depende de aceite real do proprietário/especialista.
8. Apresentar PR pequena ao Codex com commit, contrato/schema/compatibilidade, evidências, riscos, reversão/compensação e pendências específicas. A integração pelo Claude segue as autorizações já registradas; publicação de homologação por lote segue o escopo autorizado, sem repetir confirmação equivalente. Produção e operações reais obedecem ao processo aplicável.
9. Na publicação, conferir SHA, app/schema, ambiente, rotas reais, sessões, Storage/rotinas e casos autenticados. Não apagar versões/dados nem reexecutar migrations por conveniência. Logs nunca expõem credenciais/PII.

## 13. Critérios para declarar conclusão total

Só declarar o aplicativo concluído quando houver evidência de todos os itens aplicáveis:

- Os 179 IDs reconciliados, sem requisito esquecido, tela fictícia como entrega ou status “testado” escondendo bug conhecido. Condicionais só podem ser encerrados como não aplicáveis por decisão formal, sem alterar arbitrariamente a contagem/escopo.
- Cinco bugs corrigidos com regressões seguras; cadastro/nota/WhatsApp conforme a decisão do usuário; conflitos de merge e duplicação de efeito tratados.
- Todos os setores com UI real funcional, backend/persistência/autorização e estados de erro/sem dados coerentes, inclusive downloads e acessos por URL/RPC direta.
- Loja piloto, fotos/catálogo/estoque e transferências conciliados; três perfis testados no destino, sem vazamento entre lojas/organizações.
- Venda mista/financiada, caixa, pós-venda/retorno físico, estorno confirmado, recebíveis/contas/banco e relatórios fecham com os fatos; bônus conforme D-014 e integração D-039 conforme decisão efetiva.
- Nogle e demais provedores necessários homologados com referência externa; fiscal oficial e envio de documento com prova; operação incerta não é sucesso.
- CI completo do commit entregue, segurança/LGPD, backup/restauração de banco e anexos, observabilidade/alertas, carga/mobile, contingência e incidentes ensaiados.
- Documentação de operação, configuração por nomes, instalação/migrations, recuperação/reversão, aceite de usuário e go/no-go da saída da Rein registrados.

Se faltar uma habilitação/decisão externa, entregue tudo que for independente e informe precisamente o item restante. Não chamar de “100% pronto”, “homologado” ou “produção operacional” enquanto a condição essencial não existir. O objetivo é concluir de fato, não encerrar por mensagem.

## 14. Comece agora e continue até os critérios

Primeira resposta: informe SHA/worktree, último lote reconhecido, delta desde esta análise e a primeira issue de correção que vai executar. **Em seguida, faça o trabalho.** Após cada lote, continue para o próximo item executável sem pedir “posso continuar?”. Preserve checkpoint para retomada quando houver limite de contexto.

Ao final, entregue: PRs/commits, matriz dos 179 com evidências e aceite, estado de publicação/schema, relatório de testes/jornadas, lista única de APIs/habilitações/dados/decisões restantes e instruções operacionais. Não exponha segredos. Submeta ao Codex as mudanças concretas para revisão e corrija os achados antes do aceite final.

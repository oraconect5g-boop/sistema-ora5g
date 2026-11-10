# PROMPT MESTRE — concluir todas as áreas da plataforma Ora 5G/Ora Connect

**Pedido atual do proprietário, 10/11/2026:** continuar o desenvolvimento até implementar todas as funções de todas as áreas do sistema; o refinamento visual vem depois. Ler profundamente os relatórios e não deixar nenhum deles fora da execução.

**Repositório:** `oraconect5g-boop/sistema-ora5g`. **Base desta leitura:** `0b6b45ebb3387862c3e8eeb61cdd86afa79a9d82`.
**Pacote:** `docs/alinhamento/execucao-integral-2026-11-10/`.

## 1. Missão e continuidade

Você é o programador Claude Code. O Codex é o revisor. Conclua a plataforma empresarial inteira — CRM, ERP/estoque, PDV, financeiro, Ora Connect, fiscal, metas/comissões, assistência, atendimento, canais e análise — sobre o repositório existente.

Este pedido amplia a execução anterior: **não encerre o trabalho ao terminar um dashboard, a issue #65, um MVP ou a loja piloto**. Use entregas pequenas e completas para chegar ao escopo total. Não crie dezenas de telas vazias para dizer que cobriu todas as áreas.

A prioridade é completude funcional integrada. Adie polimento de marca, animações, rearranjos estéticos e perfeccionismo visual; preserve o visual azul aprovado e reutilize os componentes. Segurança, integridade monetária, autorização, usabilidade mínima no celular, tratamento de erro e testes necessários são parte da funcionalidade e entram agora.

Comece a implementar após uma reconciliação breve. Não responda apenas com outro plano. Não solicite nova confirmação para programação e testes já autorizados no ambiente permitido. Merges, publicação, operações externas reais, dados e produção seguem as decisões vigentes; este pedido não anula os limites de AGENTS/ADRs.

Continue por lotes enquanto houver trabalho executável. Uma API, chave, arquivo ou regra comercial faltante bloqueia somente a parte dependente. Não use isso para parar CRM, estoque, financeiro local ou outro módulo independente.

## 2. Leia todo o pacote e as fontes, com prova de cobertura

Primeiro leia `docs/ESTADO_ATUAL_E_PASSAGEM.md`, `docs/alinhamento/ANALISE_DO_PLANO.md`, `AGENTS.md`, `CLAUDE.md` e a skill `.claude/skills/engenheiro-senior-ora5g/SKILL.md`. Depois leia:

1. `LEIA-ME.md` e este `PROMPT_MESTRE.md`.
2. `ESTADO_VERIFICADO.md`: distingue o código atual do que era pendente nos relatórios anteriores.
3. `REQUISITOS_179.md`: todos os requisitos, critérios de aceite, estado, notas e evidências declaradas.
4. `INDICE_DE_FONTES.md` e `MANIFESTO_FONTES.json`: inventário verificável, sem seleção só dos documentos mais recentes.
5. Os cinco `FONTES_GITHUB_*.md`: corpos das 66 issues/PRs e 70 comentários coletados, com dados potencialmente sensíveis suprimidos.
6. `RELATORIO_CLAUDE_WEB_RECEBIDO.md`, junto à revisão de 08/11 que corrige suas propostas antigas.

O manifesto cobre os **507 arquivos da main, 495 textos com hash conferido, 108 Markdown, 138 referências a variantes documentais de PRs (93 conteúdos distintos fora da main), 41 referências Markdown específicas e o relatório Web original**. Os links acrescentaram cinco conteúdos históricos. Não ignore evidências em SQL/TypeScript/JSON/HTML por não terem extensão Markdown.

Consulte integralmente a documentação 00–13, ADRs 001–007, decisões/pendências, fila, matriz demo × real, rastreabilidade, integrações, pesquisas originais e relatórios/reconciliações/respostas. Os arquivos de evidência associados também fazem parte da leitura e da reprodução dos achados aplicáveis.

O índice aponta os relatórios das PRs #1, #8, #15, #25, #33, #61, #64 e #66, abertas ou fechadas. Verifique o que entrou por merge, cherry-pick ou branch diferente. **PR aberta não prova conteúdo ausente; issue aberta não prova bug ainda reproduzível.**

Se não houver API GitHub ou `gh`, leia os arquivos locais e o arquivo de corpos/comentários. Para versões de PR, use o Git autorizado para obter `refs/pull/NUMERO/head` e ler `git show SHA:caminho`, conforme o manifesto. Não é necessário fazer checkout nem mesclar uma PR antiga para ler documentação.

Leia textos longos por partes. Registre fonte/ref/hash, cobertura, decisões aplicáveis, defeitos ainda válidos, correções já presentes e prova. Mesmo conteúdo com o mesmo blob pode ser lido uma vez, registrando todos os vínculos. Uma versão diferente exige confronto. Não declare leitura de trecho truncado nem de conversa privada que não foi exportada.

Compare os arquivos presentes hoje com o manifesto e acrescente fontes novas. A main continuará evoluindo; a base acima é uma fotografia. A coleção tem limite temporal explícito, não autorização para ignorar relatórios posteriores.

## 3. Precedência e o que não deve voltar para trás

Use a decisão explícita mais recente do proprietário, as regras/ADRs vigentes e a implementação comprovada. Pesquisas, prompts e revisões antigos explicam a evolução; não são autorização para restaurar uma arquitetura superada.

- Stack: **TypeScript, React/Next.js, Tailwind, Node.js e PostgreSQL/Supabase**, com os workspaces/módulos atuais. Não migrar para Firebase, WordPress, GoHighLevel ou outra plataforma central.
- Rede atual: **11 lojas comerciais e DEFEITOS**, que é local de exceção e não vende. Os nomes já estão em `docs/cadastros/LOJAS_CONFIRMADAS_2026-11-09.json`. Não inventar três lojas para completar a antiga contagem de 14.
- Piloto Santa Cândida é etapa de homologação; a plataforma completa continua incluindo todas as áreas e expansão configurável.
- Rein: **somente arquivos de importação**. Produtos, preços e estoque inicial foram aprovados; não pedir novamente autorização genérica para estoque nem criar API Rein.
- Fotos são obrigatórias por produto e por variante visualmente diferente, com gestão de pendências conforme a especificação vigente. Um placeholder não é foto do produto.
- Ora Connect usa a **API oficial da Nogle**. “Contel” na documentação/endereço do provedor não cria uma segunda integração.
- Assistência/OS já pertence ao escopo e tem seis requisitos formais. Não repetir a pergunta histórica sobre incluir o módulo.
- Cancelamento não repõe estoque automaticamente. Retorno físico, condição, IMEI/ICCID, reembolso, fiscal e telecom são fatos separados.
- Demonstração não vira sistema real ao retirar um aviso. Dados, contexto e geradores de `demo/` não alimentam os módulos reais.
- Preservar a conta de dono de teste já vinculada em #63. Não duplicar conta, resetar senha ou refazer bootstrap por suposição.
- A PR #64 prepara o gerente de teste; reconciliar a versão atual antes de criar outro script.
- Manter o visual aprovado. “Refinar no final” não significa quebrar navegação, acessibilidade básica, leitura de dados ou ações existentes.

### Relatório original do Claude Web: observações úteis, recomendações superadas

O relato original percorreu a demo e não testou exportações naquele momento. Confronte-o com as provas posteriores do Codex, não o trate como certificação de backend.

Não restaurar suas propostas de reposição automática de estoque, receita/comissão presumida por diferença, novo pedido de autorização da OS/importação ou remoção indiscriminada de itens de serviço do catálogo. Serviços comerciais e operações da operadora precisam ser classificados e vinculados conforme os ADRs atuais, não apagados por rótulo. A referência histórica a outra skill/seção não substitui AGENTS/CLAUDE e a skill atual.

Testar jornadas e efeitos de negócio; não exigir que todo botão produza mudança visual a cada clique, inclusive quando a ação é idempotente, desabilitada ou legitimamente recusada.

## 4. Reconcilie o que já foi implementado

O **lote 1 do financeiro real já entrou na main em 0b6b45e**. Existem:
- `/financeiro`, filtros/escopo, gráficos, detalhamento e CSV;
- `public.financeiro_painel` com SECURITY INVOKER e agregação do período completo;
- resumo financeiro no início;
- `docs/alinhamento/MATRIZ_DEMO_REAL.md`;
- 23 migrations na base examinada.

A base teve CI aprovado; o Codex também executou 29 testes específicos do financeiro. **Não mandar recriar esse lote**. Revisar, completar as lacunas e avançar margem, relatórios, contas, conciliação, DRE, repasses e os demais domínios.

Código integrado não comprova publicação, acesso autenticado ou homologação. Confira a versão realmente servida no rodapé/`/saude`, a migration do ambiente e as provas atuais. Não perpetue como atuais os relatos antigos de /financeiro ausente, /vendas 404 ou zero usuários.

Na consulta pública desta preparação (10/11, aproximadamente 20:10 de São Paulo), o domínio ainda identificava **84ecefe** e `/financeiro` retornava 404, enquanto a main já era **0b6b45e**. Revalide esse dado: o atraso de publicação não autoriza reconstruir o módulo. O ESTADO_VERIFICADO separa as evidências de código e do site.

O registro da base declara 19 requisitos testados em desenvolvimento, 47 parciais, seis em demo, dois bloqueados, 104 não iniciados e uma restrição respeitada. São estados documentais, não percentual de conclusão ou novos aceites.

Reproduza os achados relevantes antes de corrigir. Preserve regressões dos lotes anteriores. Se houver aparente duplicidade de requisito, como solicitação fiscal em POS-011/FISC-001, valide os aceites e atualize a rastreabilidade; não construa outra fila.

## 5. Inventário de execução dos 18 domínios — nenhum pode ser abandonado

A matriz anexa contém cada ID e seu aceite. Os tópicos abaixo complementam a visão integrada; não substituem nem reduzem aqueles 179 itens.

### 5.1 Organização, lojas e usuários — ORA-ORG-001 a 010

Completar cadastro/edição de organizações, empresa, unidades e dados fiscais/operacionais; múltiplas lojas por pessoa; função/vigência; convite e recuperação; revogação imediata; trilha; autenticação reforçada para privilegiados; horários e contexto de turno; grupos/regiões e expansão multi-CNPJ/UF.

Aplicar servidor e RLS. Respeitar os cinco papéis existentes e mapear necessidades adicionais sem inventar gerentes reais em todas as lojas. Administrador do sistema não recebe automaticamente poderes comerciais de dono. Ninguém se autopromove nem remove o último dono por concorrência. Criar vendedor/gerente de teste pelo mecanismo administrativo correto, sem publicar senha ou escrever usuários diretamente em `auth.users`.

### 5.2 Catálogo e precificação — ORA-CAT-001 a 011

CRUD real de categorias, marcas, produtos, variantes, SKUs e atributos; natureza aparelho/acessório/chip/serviço; preços por vigência/loja/canal; promoções; custos e margem protegidos; busca por nome/SKU/identificador; mapeamento externo e carga assistida de fotos/atributos.

Concluir importador de produtos/preços e vínculo com estoque autorizado, com prévia, erro por linha, aprovação, lote auditado e repetição idempotente. Uma amostra de arquivo valida o mapeamento; não é desculpa para deixar toda a infraestrutura do importador inexistente.

Fotos: principal e variante correta, Storage privado, metadados/RLS, câmera/galeria, limites/tipos, miniatura/ampliação acessível, substituição/versionamento, recuperação de URL e falhas parciais, limpeza segura e retry sem duplicar upload/metadados. Usar a mesma mídia no catálogo, busca, estoque e PDV.

### 5.3 Estoque, identidade e suprimentos — ORA-INV-001 a 012

Disponibilidade por local; IMEI, IMEI2, serial e ICCID íntegros; entradas/saídas em livro; carga inicial conferida; reserva/expiração; bloqueio de venda indisponível; compras/fornecedor/recebimento; inventário cíclico, ajustes autorizados; histórico de condição/reparo/devolução; CD/alocação para canais.

Completar a busca visual “onde tem”, foto, físico/disponível/reservado/trânsito e pendências de transferência com origem/destino/IDs/estado. Pedido → separação de identidade → envio → recebimento/conferência/divergência; recusa/cancelamento e regularização auditados. DEFEITOS tem saldo separado, não vende e só retorna por transferência autorizada.

Não usar a fotografia de estoque como carga nem corrigir arbitrariamente suas diferenças. Não presumir que físico menos disponível seja igual à soma das pendências. Reservas de venda/transferência não consomem o mesmo item duas vezes; recebimento no destino não antecede conferência. Chip pode exigir correlação física e também no PDV oficial Nogle.

### 5.4 CRM e contratos — ORA-CRM-001 a 010

Cadastro mínimo/finalidade, cliente ligado a compras/IMEIs/chips/linhas/OS/atendimentos; busca exata/autorizada por identificadores protegidos; leads/origem/etapas/responsável; tarefas/follow-up; perdas; duplicidades e mesclagem controlada; consentimento; contratos/anexos; histórico físico/online e segmentação.

A venda atual com nome/e-mail não encerra CRM. Não criar outro cadastro de pessoa em cada módulo. Planejar identificação, relacionamento e migração dos registros existentes sem perder a origem.

### 5.5 PDV e vendas — ORA-POS-001 a 016

Concluir o fluxo mobile com carrinho, busca/foto, itens mistos, identidade física, cálculo autoritativo, preço/desconto, aprovação, pagamento misto, loja/vendedor/canal/cliente, rascunho/retomada, pendências, detalhe/comprovante, pedido de nota, cancelamento/devolução/troca/vale, financiamento, campanhas/combos, scanner/câmera e estados de falta de rede.

Ações completas, com erro recuperável e autorização. Evitar dois fluxos concorrentes de ativação/recarga. Atalho comercial converge para o domínio responsável. Não autoaprovar solicitação nem permitir venda duplicada por dois operadores. Offline transacional não é presumido; implementar a contingência definida.

### 5.6 Pagamentos e caixa — ORA-PAY-001 a 014

Dinheiro, Pix, PicPay POS, cartões, financiamento/boleto e online conforme contrato; estados de autorização/pagamento/liquidação/estorno/conciliação; abertura/movimentos/fechamento/conferência; saída autorizada; comprovantes/NSU/terminais; conciliação manual e por arquivos; taxas, parcelas, repasse, chargeback, antecipação e ajustes; webhooks/links quando habilitados.

Preservar idempotência e concorrência da conclusão. Troco somente do dinheiro; entrada financiada comprovada conforme regra; saldo da financeira separado; estorno externo só concluído com evidência. Maquininha usada na loja não prova disponibilidade de uma API. Configurar provedores/terminais por loja sem duplicar recebimento.

### 5.7 Financeiro e controladoria — ORA-FIN-001 a 010

Evoluir o painel existente para resumo diário completo, margem/DRE gerencial, contas a receber e a pagar, fornecedores/origem, parcelas, vencimentos/baixas/aging, repasses por loja/adquirente, bancos/contas multiempresa, conciliação, inadimplência/cobrança autorizada, consolidado, CSV/XLSX/PDF e projeção/simulações.

Lançar, editar quando permitido, aprovar, liquidar/baixar, estornar e auditar títulos com evidência; não entregar somente listagem. Classificação de despesas/receitas, transferências internas e centros de responsabilidade devem alimentar os relatórios de forma consistente. DRE gerencial não é contabilidade formal homologada.

Cada indicador tem definição, data, fonte, status, escopo e detalhamento. Preservar o lote 1 e separar resultado comercial, recebimento, extrato bancário e repasse. Sem contas/contrato/histórico, mostrar indisponibilidade, não lucro ou previsão fabricados.

### 5.8 Metas, produção e comissões — ORA-PERF-001 a 010

Eventos únicos por fato confirmado; quantidades por categoria; bruto, receita elegível, margem e comissão separados; metas por vendedor/loja/categoria/período e coletivas; campanhas/bonificação versionadas; regras de atribuição/compartilhamento; reversões por cancelamento; fechamento/conferência/aprovação; rankings conforme política e IA assistiva supervisionada.

Não somar chip vendido como ativação nem atribuir a operação ao reconsultor em vez do vendedor de origem. Recorrência paga e recorrência que gera produção/comissão são controles diferentes. Sem regra/contrato aprovado, o valor de comissão permanece pendente, não inferido.

### 5.9 Fiscal — ORA-FISC-001 a 010

Reaproveitar a fila/pedido/aprovação e referência manual já existentes. Completar natureza por produto/serviço/UF/CNPJ, documentos corretos, emissor homologado, chave/protocolo/anexos, falhas/reprocessamento/contingência, conciliação, devolução/cancelamento/correção e expansão tributária.

Validação do contador e contrato do emissor são necessários para operação real. Não inventar alíquota/documento nem supor que aprovação interna pode atrasar obrigação legal. Estados manual, solicitado, emitido e confirmado pelo emissor são distintos. Operação telecom pode ter tratamento fiscal diferente de aparelho/acessório.

### 5.10 Ora Connect/Nogle — ORA-CONNECT-001 a 011

Completar a integração oficial: chip/estoque/vendedor; venda versus operação; ativação, recarga, plano, linha, portabilidade, eSIM e contratação/entrega; evidência oficial; recuperação; produção de origem; carteira/extrato; compra/transferência oficial; cobrança/gateway, consulta/pagamento, recorrência e repasse/bonificação reconciliados.

Ler a referência, coleção e catálogo gerado das 62 funções em 16 grupos. Dar destino às capacidades documentadas: implementada e usada, dependente de habilitação/contrato ou fora do escopo com justificativa. Não afirmar integração completa por haver transporte e três operações.

Usar apenas contratos verificáveis. Não inventar endpoint, campo, webhook, sandbox, taxa, prazo, idempotência externa ou unicidade temporal. Preservar controles LINK × SALDO, titular na chave, unicidade/reuso de evidência e custo protegido. Consulta pelo UUID só habilitada segundo o contrato/toggle vigente.

Toda operação precisa de intenção/tentativas/resultado duráveis, correlação oficial, loja/vendedor, reconsulta e reconciliação. Resultado desconhecido não é reenviado cegamente. Separar cliente pagando pelo LINK, serviço pago na loja, débito da carteira e repasse recebido. Comissão/recarga/ativação não se confirmam por estimativa local.

Não habilitar worker ou operação real para testar uma tela. Homologar com chave/perfil e linha/ICCID autorizados, verificando o painel/extrato oficial.

### 5.11 Loja online e vendas nacionais — ORA-ONLINE-001 a 008

Catálogo/planos, carrinho/checkout, pedido/estados, origem/campanha/vendedor, CEP/frete/retirada/rastreio, devolução/arrependimento/reembolso, identidade e reserva por canal, chip/eSIM quando habilitado, multi-UF/CNPJ e logística.

Reutilizar cliente/produto/preço/pagamento/estoque e fiscal. Um pedido externo não cria uma segunda baixa ou venda. Definir OMS/fulfillment sem inventar política de estoque. Aplicar a regra real de financiamento/entrega quando houver dependência jurídica/contratual.

### 5.12 Marketplaces — ORA-MKTPL-001 a 008

Adaptadores separados Mercado Livre, Shopee e TikTok Shop; OAuth/escopos; SKU/anúncio/preço/estoque; pedidos e IDs externos; etiquetas/frete/rastreio; taxas/comissões/repasse; cancelamento/devolução/reembolso; eventos/atualização e indicadores.

Garantir deduplicação por provedor/conta/pedido/evento, eventos fora de ordem e reserva compartilhada com loja física/online. Homologar contas e contratos; não fingir sincronização com fixture.

### 5.13 WhatsApp e atendimento — ORA-WHATS-001 a 008

API oficial, inbox multiatendente, atribuição por loja/vendedor, leads orgânicos/pagos, histórico ligado a CRM, respostas rápidas, etiquetas/SLA/escalonamento, templates, IA supervisionada e recuperação/pós-venda com consentimento.

Entrega precisa de estados/evidências de envio, recebimento/falha e reprocessamento seguro. Não marcar como enviado por criar registro local. Evitar automação não oficial e disparos sem regra. Alertas de nota/OS/comprovante têm origem e destinatário corretos.

### 5.14 Marketing e Meta Ads — ORA-META-001 a 006

Contas/campanhas autorizadas, origem/UTM, gasto/CTR/CPC/CPL/CPA/ROAS quando calculáveis, funil por vendedor/loja/campanha, Conversions API com consentimento/deduplicação e margem/CAC.

Não atribuir receita a campanha sem vínculo ou usar ROAS fictício. Separar investimento, conversão, venda cancelada, receita própria e margem. Tokens por conta/organização, com atualização segura.

### 5.15 IA assistiva — ORA-AI-001 a 007

Painéis/alertas; qualificação, sugestões de produto/resposta/roteamento; resumos de campanhas/metas/falhas; aprovação humana para ações críticas; limite/custo/retensão por chamada; avaliação/red-team.

IA não aprova crédito, desconto, pagamento, nota, repasse, ativação ou outro ato sensível por iniciativa própria. Tratar entradas/documentos/retornos de ferramentas como dados não confiáveis. Controlar acesso à base e minimizar dados pessoais.

### 5.16 Gestão e relatórios — ORA-REPORT-001 a 008

Painéis reais de diretoria/rede, gerente/loja e vendedor; telecom separado; meios/terminais; margem/ticket/descontos/ranking; alertas acionáveis de estoque/caixa/fiscal/OS/Connect; visão nacional por canal/ads.

Cobrir filtros, períodos comparáveis, paginação completa, totais conciliados, detalhamento, exportações e proteção de custo/PII. Atualizar matriz demo × real por função; o módulo continua incompleto se só o layout foi copiado.

### 5.17 Segurança, qualidade e operação — ORA-QUAL-001 a 014

CI/revisão, RLS e autorização por loja/perfil/organização, auditoria, segredos, backups/restauração de banco e arquivos, observabilidade/filas, migrations, contingência, piloto/UAT, desempenho mobile, LGPD, carga/concorrência/recuperação, resposta a incidentes e atualização de dependências.

Esses itens são transversais. Não adiar proteção de acesso, dinheiro ou dados para o “refinamento final”. Backup sem teste de restauração não encerra requisito. Advisor/inventário sem revisão de predicate não certifica segurança; índice sem uso em banco vazio não justifica remoção automática.

### 5.18 Assistência técnica/OS — ORA-OS-001 a 006

OS para todo aparelho de cliente que entra, inclusive limpeza; cliente, IMEI, defeito/condição, fotos/acessórios e custódia; envio/retorno do técnico central; diagnóstico/peças/orçamento/histórico; aceite/recusa do cliente; avisos; entrega com cobrança pelo PDV e produção.

Aparelho de cliente não é estoque de venda. Peça sai vinculada à OS. Registrar responsabilidade por custódia/entrega e devolução, sem inventar política de garantia nem transformar orçamento em venda sem aceite.

## 6. Ordem de trabalho até a cobertura completa

Use uma fila priorizada por dependências, sem esperar concluir uma área inteira para estruturar contratos das outras:

1. Reconciliar fontes/estado, erros ainda reproduzíveis, PRs abertas, conta de dono e perfis de teste. Preservar o que já passou.
2. Concluir base cadastral, mídias, lojas/DEFEITOS, importador, estoque, compras/inventário e cliente compartilhado necessários ao núcleo.
3. Completar jornadas de venda/pagamento/caixa/retorno/fiscal manual e Ora Connect prioritária em paralelo contratual.
4. Evoluir o financeiro e os gráficos já existentes para contas, margem/relatórios, baixa, taxas, conciliação, repasses e projeções.
5. Completar CRM, metas/produção/comissões, assistência e fiscal automático conforme habilitações.
6. Completar WhatsApp/atendimento, loja online, marketplaces, logística/expansão, marketing e IA.
7. Fechar todas as lacunas da matriz de 179, testes integrados e operação/homologação aplicável.
8. Só então concentrar o refinamento visual final, identidade completa, microinterações e ajustes cosméticos.

Segurança, backup, documentação, integrações contratadas e preparação fiscal caminham desde o início. Se parte de uma etapa estiver bloqueada, execute a próxima fatia independente. Não retire módulos do escopo para alcançar uma conclusão artificial.

## 7. Invariantes comuns a todas as áreas

- PostgreSQL/Supabase é a fonte transacional. Toda operação tem organização/unidade/autor/origem e estados auditáveis.
- Restrições, transações, locks, reservas e idempotência são garantidos no servidor/banco; duas telas/operadores não podem produzir dois efeitos do mesmo fato.
- Estoque, venda, pagamento, liquidação, estorno, telecom, produção e comissão têm identidades/eventos correlacionados, não uma única coluna de status para tudo.
- Valores em centavos, precisão preservada, datas/fuso explicitados. Itens/pagamentos/retornos em joins não multiplicam totais.
- Fundo/suprimento não são receita; sangria não é despesa; troco, entrada financiada, vale, custo de carteira e face de recarga são tratados conforme contratos.
- Nada externo é concluído sem evidência verificável. Tempo esgotado não significa falha certa nem autoriza cobrar novamente.
- Cancelamento/reembolso fiscal/financeiro/retorno físico têm compensações próprias; histórico não é apagado.
- Custo e margem só para quem tem permissão, inclusive agregados, logs, exportação e URLs de anexos.
- Nenhuma consulta limitada a 200/500/1000 linhas representa automaticamente o período completo. Filtrar antes do limite, ordenar de forma estável e testar volume/paginação.
- Falha/indisponibilidade/sem permissão/sem fatos são estados distintos. Gráficos vazios não recebem dados demo para parecer completos.
- Todos os módulos reais usam sessão, navegação, entidades e contratos consistentes. Nenhuma ação existente desaparece por mudança de UI.
- Segredos só no backend autorizado/worker; allowlist do web; tokens OAuth por conta/organização protegidos conforme documentação. Nunca publicar valores de .env, senha, CPF, certificado, token ou dados reais em chat/PR/log.
- Fora de ambiente autorizado, usar dados fictícios identificados. Não semear produção com a organização/unidades de desenvolvimento.

## 8. Banco, merges e remoção de versões antigas

Inspecione o schema/migrations já aplicados e os tipos gerados antes de alterar. Use migrations novas, compatíveis e versionadas; não renumerar ou reescrever migration implantada, nem apagar dados/histórico por conveniência. Testar instalação do zero e atualização sobre a versão anterior.

Uma substituição precisa de paridade comprovada: localizar chamadores/imports/rotas/jobs/policies, portar correções, testar contrato e só então remover o caminho obsoleto. Não deixar `*_old.ts`, workers/cron antigos ou consumidores duplicados ativos. Preservar versões de retorno referenciadas.

TypeScript e SQL podem implementar a mesma regra em camadas diferentes, com vetores de teste comuns; isso não é duplicação a apagar automaticamente. Catálogo Nogle gerado e coleção de origem têm fonte canônica e verificação. Triggers de UPDATE/DELETE e TRUNCATE podem ser proteções complementares. Conferir sobrecargas, policies, índices/FKs e planos antes de consolidar/remover.

## 9. Dependências externas: implementar tudo que puder sem fingir integração

Atualize a lista única de APIs/habilitações existente. Para cada capacidade: contrato/documentação, estado, conta/ambiente, nomes das variáveis, ação mínima do responsável, aceite e tarefas que continuam independentes.

Classificar: disponível, configuração pendente, habilitação/contrato, decisão comercial, arquivo/dados faltantes ou não precisa de API. Gráficos e CRUDs locais não dependem automaticamente da Nogle. Não pedir nomes das lojas ou decisões já registrados.

Conferir os modelos `.env.example` e os grupos de configuração por capacidade no root, no web e no worker; completar exemplos necessários sem valores reais e sem exigir todas as variáveis antes de usá-las. Usar os scripts/flags atuais de validação. Diferenciar segredo de infraestrutura e token OAuth por organização, com guarda/renovação seguras conforme a documentação; não copiar todos os segredos para o ambiente do navegador.

Quando faltar política, preparar configuração versionada e estados seguros sem inventar direito comercial, aprovação ou taxa. Quando faltar contrato externo, completar núcleo local, interface/adaptador, validação, fixtures e testes verificáveis; deixar a operação real explicitamente pendente. Isso não encerra a integração nem autoriza apresentar simulação como sucesso.

No ponto inevitavelmente dependente de uma resposta, pedir somente o necessário, por canal seguro quando for segredo/dado real. Enquanto isso, prosseguir nas tarefas independentes. Não encerrar o projeto com uma lista de APIs antes de acabar toda implementação local possível.

## 10. Testes, evidências e entregas por lote

Cada lote é uma issue delimitada com IDs/aceites, branch/worktree própria e PR revisável. Não editar simultaneamente a mesma área de outro agente. Conferir as mudanças de main antes de integrar; preservar trabalho alheio.

Testar contrato, estados, autorização, erros, repetição e concorrência onde importam. Cobrir:
- cliente → venda → pagamento → caixa → nota → estoque → relatório;
- chip → operação oficial → confirmação → produção → cobrança/carteira/repasse;
- compra/transferência/devolução/DEFEITOS e disputa de identidade;
- CRM → atendimento → campanha → venda;
- OS → custódia/orçamento/aceite → peças → cobrança/entrega;
- pedido online/marketplace → reserva → pagamento → fiscal → envio → devolução/repasse;
- metas/comissões e reversões sem dupla contagem;
- outra loja/organização/perfil, revogação e custo protegido;
- volume acima da página REST, upload/câmera e falhas parciais, downloads e filtros;
- eventos duplicados/fora de ordem, timeout, restart de worker e recuperação.

Executar os checks atuais exigidos: instalação limpa quando requerida, scanner de segredos/commits, geradores de rastreabilidade e catálogo Nogle, lint, typecheck, testes, build, auditoria e E2E. Usar versões/scripts do repositório, não comandos presumidos. Não enfraquecer testes, marcar skip/TODO ou criar mocks que escondem o caminho real apenas para deixar CI verde.

Em cada PR: problema/resultado, requisito, contrato/schema, arquivos, evidência e resultado, riscos/limitações, dependências e retorno. Codex revisa pelo fluxo vigente. Estados: implementado, testado em desenvolvimento, revisado, homologado e produção separados.

## 11. Checkpoint e retomada até o final

Mantenha um registro persistente do programa, por exemplo `docs/alinhamento/EXECUCAO_INTEGRAL_STATUS.md` e um JSON complementar:
- base/SHA/branch e último lote;
- 179 IDs com estado, implementação, teste, pendência, próximo passo e revisão;
- fontes/ref/hash lidos e os não lidos;
- decisões/contratos, conflitos resolvidos e perguntas indispensáveis;
- tarefas prontas, em execução e bloqueadas, com dependência concreta;
- versão publicada por ambiente e o que falta publicar.

Ao trocar de sessão ou compactar contexto, carregar o checkpoint e continuar do próximo item executável. Não reiniciar o projeto, reabrir decisões confirmadas, refazer o financeiro inicial ou pedir outro prompt a cada lote.

Quando um lote terminar, atualizar documentação e avançar para a próxima fatia independente dentro da autorização. Não se declarar concluído no primeiro módulo entregue. Não usar “aguardando API” para ocultar CRUD, ledger, UI ou teste local que ainda falta.

## 12. Publicação e conclusão verificável

Merges e publicações seguem AGENTS/ADRs e decisões já concedidas; não invente nova aprovação para programação rotineira nem infira aprovação de produção. Preparar alterações/testes/retorno concretos antes de solicitar uma decisão humana realmente necessária.

Verificar artefato/commit ativo, rodapé e /saude, migrations do ambiente, navegação e os percursos principais depois de publicação autorizada. Código integrado sem publicação não explica sozinho o que o usuário vê. Não ativar worker sensível como efeito colateral de outro deploy.

A saída da Rein e a operação comercial seguem o go/no-go. Preservar o sistema oficial da fase e a reconciliação; evitar dupla contagem/estoque. Não considerar homologação fiscal, de fornecedor ou do proprietário como feita por passar teste local.

O programa só pode ser apresentado como funcionalmente completo quando:
1. Os 179 requisitos e demais demandas explícitas rastreadas têm uma disposição verificável, sem omissão de área. Toda mudança de escopo é formalizada.
2. As funções implementáveis têm frontend, backend/domínio, persistência, autorização, auditoria, erros/recuperação e testes integrados.
3. Cada ação exibida tem efeito correto e os fluxos críticos chegam ao encerramento, não só a uma lista ou modal.
4. Paridade da referência foi reconciliada; nada funcional desapareceu por UI/merge.
5. Nenhum parcial/bloqueado é chamado de concluído. Se depender de credenciais, contrato, dado ou homologação, registrar exatamente o que falta e o que já está pronto.
6. Versão e ambiente são identificados; aceites/homologação/produção estão separados.
7. O refinamento final pode se concentrar em apresentação e ajustes de experiência, sem esconder lacunas básicas de regras, segurança ou integração.

**Primeira ação:** conferir o estado atual, os documentos e a fila; reconhecer o financeiro lote 1 já existente; escolher a próxima fatia de maior dependência/valor que ainda não foi implementada e começar. **Continue até concluir todo o trabalho executável de todas as áreas, mantendo os bloqueios externos explícitos e sem simular que o sistema inteiro está pronto.**


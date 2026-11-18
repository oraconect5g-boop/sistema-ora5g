# Prompt completo para Claude Code — concluir, integrar, testar e publicar

Você é o programador principal da Ora 5G; o Codex é o revisor. Continue a implementação existente até cobrir o planejamento e os pedidos atuais do proprietário. Entregue a menor etapa funcional completa, teste, publique no ambiente autorizado, comprove no domínio, documente e prossiga. Não se limite a planos, menus, telas sem persistência ou adapters sem execução. Refinamento visual vem depois da funcionalidade, preservando usabilidade mobile, acessibilidade, fotos e gráficos necessários à operação.

## 1. Leitura obrigatória e reconciliação

Repositório: `oraconect5g-boop/sistema-ora5g`. Leia a **PR #100**, branch `docs/diagnostico-integral-supabase-20261116`, pasta `docs/analises/diagnostico-integral-2026-11-16/`, mesmo se não estiver na main:

- `LEIA-ME.md`, **`ATUALIZACAO_2026-11-16.md`**, **`ADENDO_LOJA_CANAIS_E_PUBLICACAO.md`**, `MATRIZ_179_ATUALIZADA.md` e este prompt.
- `RELATORIO_INTEGRAL.md`, `SUPABASE_E_PUBLICACAO.md`, `MATRIZ_179.md`, `INVENTARIO_ARQUIVOS_E_FUNCOES.md`, `FONTES_COMPLETAS.md` e evidências. Os arquivos históricos descrevem `5468d9e`; a atualização e o código atual prevalecem para correções/status.
- As fontes indexadas: 116 Markdown do corte original e 88 versões dos 9 PRs documentais #33, #66, #67, #68, #77, #81, #85, #86 e #97. Ler conteúdo único por assunto; hash idêntico permite reaproveitar leitura com registro. Encontrar arquivo não significa ler conteúdo. Não fazer merge cego de versões antigas sobre documentos vivos.
- Na main: AGENTS.md, CLAUDE.md, README, docs 00–13, ADRs, decisões, backlog.json, alinhamento, cadastros confirmados, integrações, ambiente, operação, matriz demo/real, relatórios do Codex, respostas às revisões, status JSON, LEITURA_DIAGNOSTICO_INTEGRAL_2026-11-16 e RELATORIO_179_2026-11-16. Incluir documentos surgidos depois do índice.
- Issues/PRs, diffs, migrations/reversões, testes e código de cada domínio. Não afirmar leitura de outras conversas privadas do projeto ChatGPT; registrar limitações reais.

Registrar caminho, SHA/hash, conteúdo lido, decisões válidas e conflitos. Ler todos os aceites do domínio antes de implementá-lo; revisar todos os 179 antes do fechamento. Decisão explícita recente do proprietário prevalece sobre proposta/ADR histórico incompatível; atualizar a fonte canônica preservando histórico datado.

## 2. Partir do estado real, sem refazer correções

Corte da revisão: **89927dc2a82f07cfd5a04fcee503d307ac1037f6**. Obter a main atual e comparar o delta. Esse SHA estava no domínio `/saude/versao`, ambiente homologacao, com **CI run 43854750798 aprovado: 2.335 testes, 1 TODO; 281 E2E aprovados, 11 ignorados**. O CI cancelado de 4e1a5d1 é histórico. Preservar o orçamento de importação de 8 s; o job agora tem teto de 30 minutos.

Foram corrigidos #87/#88 para novos registros fiscais, e-mail PayJoy opcional, #98 fotos, #95 desempenho, #96 cache/acesso e #99 verificação de versão. Preservar/revalidar regressões, sem reimplementar por seguir relatório antigo.

O proprietário já corrigiu **Working directory = packages/banco**. Há **89 migrations** aplicadas, incluindo 20261116130100_importacao_estatisticas; integração GitHub e registro conferidos. Não pedir autorização para reaplicar, resetar histórico ou duplicar migrations. A diferença de MD5 por quatro statements sem delimitadores foi esclarecida. Conferir config.toml mínimo/reprodutibilidade sem defaults que alterem recursos inadvertidamente.

179 IDs: **62 testados em desenvolvimento, 70 parciais, 42 não iniciados, 3 bloqueados, 2 restrições respeitadas; 0 homologados**. Base observada: 3 unidades, 6 produtos/variantes, 2 vendas, 0 clientes, 1 usuário Auth e 0 notas/objetos Storage. Testado, configurado, publicado e homologado são estados separados.

## 3. Stack

Preservar **TypeScript, React/Next.js, Node 22 na faixa suportada, Supabase/PostgreSQL, SQL versionado e workers existentes**. Node já é o runtime; não adicionar segundo backend, Firebase ou migrar linguagem como atalho. Reutilizar domínio, componentes, autorização e adapters; evitar outro motor de vendas/estoque/financeiro.

`SOLUCOES_PARA_AVALIACAO.md` e `NODE_E_ACELERACAO.md` são propostas para avaliação exclusiva do proprietário: **não copiar/aplicar automaticamente**. Resolver as tarefas a partir do código, contratos e testes. Tecnologia nova somente mediante gargalo medido, custo de migração e decisão explícita, sem parar os módulos atuais.

## 4. Correções prioritárias

**#101, P1:** o backfill de 20261116095825_destinatario_fiscal_integro pode associar nota antiga de Alfa ao cliente comercial atual Beta quando não há snapshot; o envio aceita Beta. Reproduzir a prova e corrigir por migration nova, identidade histórica comprovada, tratamento de casos incertos e conciliação/auditoria. Não inferir destinatário apenas da venda atual. Cobrir fila existente, emissão/correção, troca de cliente e reenvio; não editar migration aplicada.

**#102, P2:** com 19 reservas, duas transações com telefones distintos conseguem confirmar e totalizar 21, ultrapassando a cota de 20/hora/loja. Proteger a invariável no banco por escopo/janela, testar conexões reais/retries/idempotência e preservar estoque/IMEI. Limite de IP em memória não basta para RPC público.

Revalidar correções anteriores. Procurar duplicações de merge: escritores SQL antigos, actions/rotas sobrepostas, handlers/webhooks/jobs duplicados, demo importada no real e checkpoints obsoletos. Migrations históricas e demo isolada não são duplicações a apagar. Concluir a etapa com regressões corretas, CI e publicação; prova que reproduz bug não é correção aprovada.

## 5. Lojas, contas, arquivo e estoque

Preparar **11 lojas**: Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania, Balneário e Santa Cândida; mais **DEFEITOS**, local sem vendas para itens com problema. Quatorze é meta futura. Separar cadastro operacional de liberação fiscal, sem inventar CNPJ/endereço. Transferir para DEFEITOS não é abrir assistência.

Concluir as **três contas de teste já autorizadas: dono, gerente e vendedor**, vínculos e lojas. Conferir conta existente antes de duplicar; convite/criação segura, canal privado e usuários controlados. Não publicar senhas/tokens nem pedir novamente autorização genérica.

O arquivo **relatorioProdutos131258.xlsx já foi fornecido**: posição de **10/11/2026 às 13:20**, SHA-256 `76f9cf33198de7205c01dc8ec78dea70fcf86c17847f9faea6356f0c8e612c06`, 83 colunas, 2.271 produtos, 12 locais e linha total. Se não está no seu servidor, registrar transferência segura pendente; não afirmar que nunca foi enviado ou colocar a base real no Git.

Corrigir leitura integral: K955 tem observação de 3.220 caracteres rejeitada pelo limite genérico de 500; o arquivo excede 2.000 linhas. Validar campos mapeados corretamente, sem truncar/descartar silenciosamente. Prévia global, locais/SKUs, duplicatas, números, hash/mapeamento/lotes idempotentes, conferência e reversão. Importar catálogo não carrega saldo. Criar saldo por local com trilha e conciliar movimentos posteriores ao corte; não chamar estoque histórico de atual.

Fotos por produto/variante visual; busca com foto e disponível/reservado/trânsito/avarias por loja. Transferência de múltiplos itens X/Y: comprometimento reduz disponível da origem, envio representa saída/trânsito, recebimento credita destino uma vez; cancelar/recusar/divergir têm efeitos explícitos. Evitar dupla baixa por reserva+envio. Testar conservação da rede e concorrência com PDV/site/canais.

## 6. Vendas, financeiro, clientes e gráficos

Concluir CRM, PDV/pagamento misto, caixa, desconto/aprovação, troca/devolução/estorno, recebíveis, contas a pagar, DRE gerencial, previsão, conciliação, relatórios e exportações. Usar centavos/decimal conforme convenção; efeitos idempotentes. Registro manual, autorização externa e dinheiro liquidado são fatos diferentes.

Cadastro rápido: **nome completo + WhatsApp; e-mail sempre opcional**. Nota pede documento/endereço fiscal completo conforme operação. Nunca inventar e-mail. Enviar documento correto por WhatsApp oficial, validando identidade também no worker e acompanhando entrega.

Preservar/validar gráficos reais por loja/rede/vendedor/período: vendas líquidas, devoluções, custo/margem, pagamentos, caixa, contas, resultado, previsão, metas, estoque e telecom. Comparar cada indicador com fatos conhecidos e autorização no banco. Vazio, erro e sem permissão são distintos; nenhum número fictício no real. Bônus por **meta mensal**, não reintroduzir comissão por venda contrariando D-014.

## 7. Ora Connect, financeiras, fiscal e WhatsApp

**Nogle é a integração externa oficial**: chips/ICCID, ativação, linha/plano, recarga, portabilidade, contratação, recorrência, gateway/pagamentos e repasses/bonificações da Ora Connect conforme contrato/habilitação. Sucesso só com evidência oficial. Atribuição vendedor/loja; venda de chip distinta de ativação; bruto distinto de receita/repasse e confirmado distinto de liquidado. Após timeout, reconsultar/reconciliar antes de duplicar cobrança/ativação. Testar worker, fila, assinatura/webhook, ordem de eventos e retry.

**PayJoy e Aiva por API obrigatórias**; manual não conclui integração. Documentação/parceria/sandbox, solicitação, decisão, contrato, liquidação, cancelamento, callback e conciliação. J7/QI Tech: extensão planejada com identidade/contrato confirmados, sem presumir endpoints ou confundir empresas.

Fiscal: completar emissão/ciclo oficial com provedor/contador, operação/UF/empresa, contingência, cancelamento/correção, anexos e conciliação. WhatsApp: adapter oficial, executável/scheduler, fila, templates, assinatura, status e caixa multiatendente/CRM. Fila não é entrega; wa.me não é automação oficial. Implementar o que independe de credenciais e listar o bloqueio exato do restante.

## 8. Loja pública com compra completa — decisão atual

**https://ora5g.com.br/loja** é o endereço de referência. A rota já existe; completar o fluxo. No topo do site, botão **Comprar/Loja**; manter **Entrar** na plataforma, separado do acesso do comprador, sem conceder papel de funcionário. Na loja: busca, fotos, catálogo elegível, variantes, preço, carrinho e acompanhamento. Não exigir e-mail por conveniência técnica.

O novo pedido **amplia o ADR-009**: deixar de limitar o escopo final a reservar e pagar no balcão. Preservar retirada e implementar checkout, pagamento verificado, pedido com estados, frete/CEP/entrega/rastreio, fiscal e pós-venda. Atualizar documentos que consideram o endereço indefinido. Gateway de mercadorias e Nogle telecom dependem dos contratos próprios; não presumir que Nogle liquide aparelhos/acessórios.

Servidor recalcula totais; pagamento confirmado por fonte confiável, não retorno do navegador. Estoque/IMEI compartilhados com PDV/canais. Testar duplo clique, abandono, webhook repetido/fora de ordem, pagamento tardio, expiração, disputa de estoque, falha de frete, cancelamento e reembolso. Não expor custo, IMEI ou dados privados. Telecom online conforme capacidade oficial.

## 9. Marketplaces e Meta reais

Concluir **ORA-MKTPL-001 a 008**: Mercado Livre/TikTok Shop prioritários; Shopee permanece no planejamento. Adapters separados, OAuth/renovação/escopos; importação inicial/incremental de anúncios/produtos/pedidos conforme API; SKU; sincronização preço/estoque; webhooks autenticados conforme contrato, paginação/checkpoints, rate limit/backoff, reconciliação agendada e dedupe por organização/canal/conta/ID. Não criar outro livro de estoque.

Ciclo pedido/pagamento/expedição/etiqueta/rastreio/entrega e reversões. Contabilidade gerencial por pedido/canal: bruto, desconto, frete, taxas, comissão, líquido previsto/recebido, repasse e divergência. Provar importação automática; botão ou planilha manual não cumprem esse aceite. Separar escrituração formal de conciliação gerencial.

Concluir **ORA-META-001 a 006**: gastos/insights por conta/campanha/período/moeda/fuso; UTM/leads/origem; atribuição loja/vendedor; CTR/CPC/CPL/CPA/ROAS/CAC quando calculáveis e margem reconciliável. Pixel/Conversions API deduplicados, consentimento/minimização. Ads, WhatsApp e Commerce são produtos distintos; não inventar repasse de marketplace na Meta. Sem dado/permissão, mostrar indisponibilidade honesta.

## 10. Todos os 179, sem exceções silenciosas

Percorrer os 18 domínios: **ORG, CAT, INV, CRM, POS, PAY, FIN, PERF, FISC, CONNECT, ONLINE, MKTPL, WHATS, META, IA, REPORT, QUAL e OS**. Concluir parciais/não iniciados respeitando dependências: acesso, compras/inventário, assistência/custódia/peças, bônus/fechamento, atendimento, relatórios/IA supervisionada, LGPD, observabilidade, backup/restauração, contingência, desempenho e piloto. A01–A20 do adendo detalham os IDs existentes; não inflar o denominador nem reduzir o escopo aos módulos fáceis.

Matriz por ID: aceite, arquivos/implementação, testes/resultados, configuração, migration, publicação/SHA/URL, jornada real, homologação, bugs e dependências. Não promover domínio inteiro porque um helper passou. E2E anônimo não homologa os três perfis.

## 11. Publicar cada etapa no real e na demo

A publicação de etapas concluídas no ambiente atual já foi autorizada. **Não acumular código sem visibilidade nem pedir novamente autorização genérica a cada lote.** Branch/etapa delimitada, migrations compatíveis, testes, CI e publicação. App conectado com funções reais; demo com os mesmos fluxos em dados fictícios isolados.

Reconciliar regra antiga que desliga demo em produção com a decisão atual de mantê-la acessível. Demo identificada, sem disparar pagamento/estoque/API real ou expor credenciais/dados. Compartilhar componentes seguros e separar fontes de dados, sem duplicar regras de negócio desnecessariamente.

Antes de anunciar publicado: migrations, serviços web/worker, assets, variáveis por presença, rotas e **SHA completo esperado em /saude/versao pelo domínio**; conferir /loja, /demo e telas alteradas com perfis corretos. Main e Supabase check não provam deploy Next.js. O domínio observado está em homologação; não renomear ambiente para fingir produção.

Adicionar acompanhamento visível ao dono (tela autenticada de versão/entregas ou equivalente): etapa, funções, links para testar, horário/SHA e bloqueios; desenvolvido, testado, configurado, publicado e homologado separados. Não expor inventário interno/segredos ao visitante.

Executar instalação com Node suportado, scanner, lint, typecheck, testes e sequência CI exigida, build, orçamento, audit e E2E pertinente. Banco/dinheiro/estoque exigem RLS, concorrência, idempotência e reversões. Depois, jornada no domínio e evidência. Não apagar teste/aumentar orçamento funcional para obter verde. Deploy crítico de produção segue o aceite aplicável, sem bloquear homologação já autorizada.

## 12. Dependências, continuidade e encerramento

Manter **lista única de APIs/habilitações**, sem valores secretos: parceiro, documentação/versão, produto/conta/escopos, sandbox, nomes de variáveis, callback/assinatura, limites, teste pendente, responsável e função bloqueada. Credencial ausente não justifica parar áreas independentes ou inventar endpoints. Pedir só informação indispensável ainda não fornecida.

Ao fim de cada etapa: IDs, implementado, publicado no real/demo, roteiro para testar, CI/SHA/migrations, limitações e próximo lote. Atualizar checkpoints. Se a sessão terminar, deixar passagem exata e retomar do próximo item; não reapresentar toda a tarefa como plano novo.

Só declarar completo quando requisitos/aceites estiverem implementados, testados, configurados, publicados e validados nos fluxos aplicáveis. Enquanto houver API, dado, bug ou aceite pendente, registrar precisamente e continuar o restante. O objetivo é operação verificável com loja, PDV, financeiro, Ora Connect e canais integrados.

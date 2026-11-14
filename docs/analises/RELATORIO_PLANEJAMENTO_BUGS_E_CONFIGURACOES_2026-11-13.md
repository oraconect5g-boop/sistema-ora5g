# Planejamento × implementação, bugs e configurações — Ora 5G / Ora Connect

**Data:** 13/11/2026, America/Sao_Paulo. **Revisor:** Codex. **Base final:** `51417a8af70e1277328c78962fee2397a4d2a171`, atualizando a base funcional `46638ee07acade6fc85cba3dc635416f3f74d836` examinada no início. Comparação com a auditoria anterior, `51fc428`. Repositório: `oraconect5g-boop/sistema-ora5g`.

## 1. Diagnóstico para o Claude Code

O projeto avançou na **aplicação real**, incluindo a recuperação dos gráficos. Durante a revisão, o problema inicial de migrations declaradas pendentes recebeu uma atualização: **`51417a8` registra as 51 migrations aplicadas**, e os **51 MD5 registrados coincidem com os arquivos**. As 12 antes pendentes foram renomeadas para as versões registradas pelo Supabase, com o SQL idêntico. Não tratá-las mais como ausentes nem reaplicá-las às cegas. Falta validar o ambiente em jornadas autenticadas; a conferência do Codex é sobre o registro versionado, sem leitura direta remota. **Cinco bugs continuam reproduzíveis**: três de inventário/conferência e dois financeiros novos. A regra recente do cliente/WhatsApp ainda não entrou no código.

Não reiniciar o projeto, trocar a stack ou reimplementar os módulos entregues. A próxima fatia deve reconciliar o ambiente, corrigir esses erros e executar as jornadas reais dos três perfis. Depois, seguir a fila integral, preservando os 179 requisitos.

**Evidência de publicação atualizada:** às **22:28 de 13/11**, `/saude` informou **`46638ee`, build 22:20**. `/inicio`, `/financeiro`, `/produtos`, `/estoque`, `/metas`, `/relatorios`, `/contas-a-pagar`, `/resultado`, `/previsao`, `/pagamentos/financeiras`, `/clientes` e `/crm` responderam **307 para `/entrar`**, e `/demo` respondeu 200. Portanto, a conclusão da auditoria anterior sobre a build antiga `0b6b45e` está **superada**. As rotas novas foram publicadas; o login e o alcance do Auth não comprovam que suas RPCs e tabelas estejam disponíveis.

O **CI da base final `51417a8` está aprovado**, run [43542297795](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43542297795); o da base funcional `46638ee` também passou. Isso não elimina os bugs de negócio nem substitui homologação com o banco de destino. O CI aplica todas as migrations em bancos descartáveis; não prova por si só o histórico do Supabase hospedado.

## 2. O que foi analisado

- Árvore completa: **165 diretórios, 752 arquivos, 740 textos com SHA de blob validado, 111 Markdown e 12 binários somente inventariados**. Não há checkout Git local independente: a revisão usa materialização pelo conector, sem alegar `git status` limpo.
- **38 commits e 177 arquivos alterados** desde `51fc428`, incluindo a atualização final do registro de aplicação. Sem alteração exclusiva das pastas de demo nesse intervalo; componentes compartilhados foram alterados.
- **179 requisitos**, ADRs, decisões, passagem, checkpoint/JSON, rastreabilidade, pedido de revisão, documentação dos módulos e integrações. [Matriz funcional completa](MATRIZ_FUNCIONAL_179_2026-11-13.md).
- **90 branches** na reconferência final, 12 PRs recuperadas, 81 issues/PRs e 82 comentários existentes no início da coleta. Os contadores de comentários coincidem com a coleta. Novas #82/#83/#84 abertas nesta revisão.
- Todos os documentos da main, fontes históricas e PRs documentais fora dela estão identificados em [Fontes, diretórios e versões](FONTES_DIRETORIOS_E_VERSOES_2026-11-13.md). A revisão aprofundou as mudanças transacionais; arquivos preservados reaproveitam as auditorias anteriores. Isso não equivale a certificar cada linha de todo o histórico.
- Aplicação local das **51 migrations** e inventário do schema efetivo: **73 tabelas** nos schemas `public`/`privado` e **254 funções**, incluindo auxiliares/extensões. Há **115 funções públicas SECURITY DEFINER executáveis por authenticated**; concessão de EXECUTE não substitui a guarda interna. [Funções e tabelas efetivas](FUNCOES_E_TABELAS_EFETIVAS_2026-11-13.md).
- Provas independentes com banco descartável e API simulada, sempre identificados. Nenhum acesso ao servidor, `.env`, dados reais ou projeto Supabase remoto.

**Limite da conversa vinculada:** o endereço do projeto ChatGPT abriu sem conteúdo legível. Não foram presumidas outras conversas ocultas. Foram consideradas as decisões recebidas nesta conversa e as decisões registradas no GitHub, com a precedência da instrução recente do usuário.

## 3. Planejamento e entregas atuais

| Área | O que existe no código real | O que falta para completar |
|---|---|---|
| Organização, lojas e acesso | Auth/sessão, turno/loja, RBAC/RLS, vínculos, cadastro/configuração de lojas e contagem da equipe por papel | Três contas fictícias no Auth com vínculos corretos e prova J1; dados definitivos das 11 lojas e DEFEITOS; operação de equipe completa |
| Catálogo/fotos/preços | Cadastro de produto/variação, tipos, SKU/códigos, fotos privadas e URLs assinadas, preços e campanhas; regra aplicada gravada no item vendido | Fotos dos produtos reais, carga de catálogo e estoque, escala/paginação; combos e regras por loja D-035 |
| Importação | CSV, mapeamento/prévia, aprovação separada, comparação versionada, aplicação transacional, desfazer por identidade, paginação da prévia | Suporte/conversão segura do XLSX amplo recebido; saldo por local e identificação serializada; conciliar posição histórica antes de carga |
| Estoque e transferências | Livro físico/reservado/disponível/trânsito, onde tem na rede, pedidos/envio/recebimento, DEFEITOS, fornecedor/entrada/estorno/reentrada, inventário cíclico e painel G3 | Corrigir #78/#79/#80; confirmar migration G3; homologar transferência completa e carga da loja piloto, sem inventar saldo |
| Clientes e CRM | Cadastro compartilhado, dados privados/máscaras, revelação auditada, busca exata, consentimentos, ficha, funil/agenda, duplicados/mesclagem e segmentos | #76/PR #77: rápido com nome completo e WhatsApp, e-mail opcional; endereço completo no fluxo fiscal; nota pelo WhatsApp oficial; contratos/anexos e histórico omnichannel |
| PDV e vendas | Venda móvel, reserva, serializados, pagamentos mistos, desconto/aprovação, cliente, solicitação de nota, câmera, pendências, aviso sem rede e origem do preço | Jornadas reais e pós-venda completo; combos/regras D-035; contingência. Aviso sem rede não entrega offline transacional |
| Pagamentos/caixa | Abertura/fechamento, terminais, conciliação manual de Pix/cartão, recebível/repasse manual das financeiras, pedido e decisão de saída de caixa por gerente/dono, sem autoaprovação | #83; schema correspondente; banco/adquirentes/extratos e prazos/taxas contratuais; automatização por API somente quando verificada |
| Financeiro | Painel registrado × liquidado, contas a pagar com categoria/parcelas/repetição, DRE gerencial mensal, rateio central e previsão/simulador, CSV e impressão/salvar PDF | #82, compatibilidade do schema, conciliação bancária, recebíveis com vencimento, inadimplência, repasses oficiais, XLSX nativo e demais lacunas dos IDs FIN |
| Metas/produção/comissões | Metas mensais de loja/vendedor, ritmo diário, histórico de mudanças, indicadores no Início/Relatórios e produção Connect confirmada | Validar as migrations agora registradas na jornada autenticada; motor completo de eventos/regras versionadas, reversões, bônus, comissão e fechamento. Meta não é comissão paga |
| Ora Connect / Nogle | Cliente/worker/fila, envio/consulta e resultados incertos, referências, reconciliação local e produção por evidência/origem | Habilitar/homologar C1/C2: autenticação/escopo, operações, gateway, recorrência, carteira/extrato e repasses oficiais; operação externa real não foi comprovada |
| Fiscal | Solicitação/fluxo local, destinatário da venda e registros manuais | Contador/provedor, regras por operação/UF/CNPJ, emissão oficial, rejeição/cancelamento/contingência, evidências e entrega da nota |
| Assistência/OS | Demonstração/requisitos | Os seis requisitos OS: entrada, orçamento/diagnóstico, autorização, peças/execução, garantia/entrega e financeiro; definir acesso do técnico |
| Loja online/marketplaces | Planejamento/referências | ONLINE-001–008 e MKTPL-001–008: pedido, pagamento confirmado, reserva única, catálogo, estoque, fiscal, logística, devolução e reconciliação |
| WhatsApp/Meta/IA | Planejamento e variáveis exemplificadas | WHATS-001–008, META-001–006 e AI-001–007; integrar adaptadores/workers/eventos e controles. Antecipar a entrega transacional da nota; o atendimento completo pode seguir depois |
| Operação/qualidade | CI, testes, auditoria de negócio, scripts de homologação e workers | Jornadas autenticadas, schema remoto, backup/restauração ensaiada, observabilidade/alertas, carga, incidentes, contingência e aceite do piloto |

### Gráficos: conclusão atualizada

Os painéis reais foram recuperados e ampliados no código: há **34 instâncias JSX de gráficos em rotas reais/componentes compartilhados**, contra **25 na demo**. A contagem é estática, não representa gráficos distintos/simultâneos nem homologação de todos os dados. Entraram G1, G2a/G2b, G3, G4a/G4b/G4c, G5 e os painéis L8. Não repetir a conclusão antiga “só há três gráficos no real”.

O ponto atual é **disponibilidade da fonte**: sem as migrations de cada módulo, o código mostra “Indisponível neste ambiente”, corretamente sem trocar falha por zero. Ter mais gráficos que a demo não prova completude de banco, integrações, permissões ou números.

### Contagem dos requisitos

| Estado declarado no JSON | Quantidade |
|---|---:|
| Testado em desenvolvimento | 34 |
| Parcial | 64 |
| Não iniciado | 78 |
| Bloqueado | 2 |
| Restrição respeitada | 1 |
| **Total** | **179** |
| **Homologado** | **0** |

O JSON classifica os cinco requisitos antes “somente demonstração” agora como parciais. Isso não torna o restante da demo funcional: vários módulos completos continuam não iniciados. Não apresentar esses totais como percentual de projeto pronto.

## 4. Erros e bugs reproduzidos

| ID / ticket | Evidência na base atual | Impacto e correção necessária |
|---|---|---|
| **REV-PLAN-001 / #82 — P2, novo** | Migration `20261114013159_previsao_de_caixa.sql`, CTE `reembolsos` (aprox. linhas 105–113); após devolução Pix de 7.900 centavos fictícios, `estornos_externos` continua pendente/sem confirmação, mas a base da previsão desconta 7.900 | Trata pedido de estorno como saída monetária já paga. Usar dinheiro efetivamente devolvido e data da confirmação externa; testar pendência, confirmação em outra semana e reembolso misto |
| **REV-PLAN-002 / #83 — P2, novo** | Migration `20261114012722_financeiras_a_receber.sql`, `financeira_desfazer_recebimento`/`financeira_receber`; registrar repasse, cancelar venda e desfazer repasse deixa venda cancelada e crédito aberto; novo recebimento é aceito | Reabre crédito exigível de venda cancelada e permite outro registro de repasse. Validar estado comercial em ambas as RPCs e preservar o histórico do recebimento/estorno; testar concorrência e correção de referência |
| **REV-DIR-001 / #78 — P2, persiste** | Migration `20261111142726_inventario.sql:276`; gerente abre/envia, dono conta e aprova: contador = aprovador e ajuste -1 aplicado | Segregação não considera `inventario_itens.contado_por`. Incluir contadores efetivos na regra e testar recontagem/múltiplos contadores |
| **REV-DIR-002 / #79 — P2, persiste** | Mesma migration, linhas 168–175; dois aparelhos, um dual SIM, geram sistema 2 / contado 3 ao ler três IMEIs | Resolver IMEI/IMEI2 para a mesma identidade física e contar uma vez. A prova não demonstra criação de saldo extra; demonstra contagem/divergência incorreta |
| **REV-DIR-003 / #80 — P2, persiste** | `app/estoque/page.tsx`, ramo da conferência, `limit(500)`; 501 itens, primeiros 500 conferidos e último pendente: página real mostra 500/500, Tudo conferido e Nenhum pendente | Falsa conclusão operacional. Somar totais autorizados no banco e paginar pendentes com ordem estável; não somar apenas a amostra |

As cinco provas de bugs **passam ao reproduzir o comportamento incorreto**. Não são aceite. Na correção, criar regressões com o resultado seguro e preservar a reprodução ligada ao SHA auditado. Nenhum bug de negócio foi corrigido por esta PR documental; a implementação volta ao Claude.

### Exportação: falha reproduzida sob limite de API, a conferir no destino

`lib/contas-a-pagar/consulta.ts:145–164` pede até **5.001 linhas numa única chamada**, para exportar até 5.000 e avisar se houver mais. Em API simulada com teto de 1.000, uma base de 1.001 volta com **1.000 exportadas e `mais:false`**, sem aviso. O teste executa a função real de consulta.

**Não foi medido o `max_rows` do projeto remoto.** Este é um resultado condicionado ao teto configurado, separado dos cinco bugs acima. A implementação deve paginar abaixo do teto, usar desempate estável por ID e verificar completude; aumentar apenas o `limit()` solicitado não supera o teto do servidor. Conferir também a integralidade das consultas filhas de catálogo/fotos/fornecedores e das exportações.

### Correções antigas: não reabrir bugs apenas porque a issue está aberta

Quatro provas antigas agora retornam resultado seguro: **#69**, custo da entrada bloqueado ao vendedor (42501); **#70**, prévia desatualizada devolve nova comparação sem sobrescrever preço posterior; **#71**, reentrada de identidade estornada na loja correta sem duplicar; **#72**, entrada em produto inativo recusada (22023). As regressões R2 de unicidade/concorrência (#73), desfazer por identidade (#74) e paginação de importação/entradas (#75) permanecem cobertas pela suíte atual. #80 é outro fluxo.

O checkpoint trocou os números de quatro issues. Correspondência conferida: **REV-NOV-004 = #71; REV-NOV-005 = #72; REV-NOV-006 = #73; REV-NOV-007 = #74**. **R1: #69/#71/#72 + entradas da #75. R2: #70/#73/#74 + importação da #75.** Esta entrega corrige a documentação, sem encerrar automaticamente tickets históricos.

## 5. Configuração prioritária: aplicativo × schema

**CFG-001 / #84 — validação do ambiente.** O corte inicial `46638ee` declarava as 12 migrations abaixo pendentes; em `51417a8` o programador registrou sua aplicação no desenvolvimento e regenerou os tipos. O revisor verificou que **os 51 MD5 do registro correspondem aos arquivos** e que as 12 migrations renomeadas mantêm o mesmo blob SQL. Não houve consulta direta ao banco remoto pelo Codex. Em banco descartável limitado às 39, G1/G2a existem e RPCs posteriores retornam 42883: essa prova explica o problema histórico, **não descreve mais o estado remoto declarado**. #84 foi atualizada para acompanhar a prova J1 e a coerência do ambiente, sem mandar reaplicar SQL.

| Lote | Migration agora registrada como aplicada |
|---|---|
| G2b | `20261114012326_financeiro_conciliacao.sql` |
| G3 | `20261114012407_estoque_painel.sql` |
| G4a | `20261114012431_connect_painel.sql` |
| G4b | `20261114012538_metas.sql` |
| G4c | `20261114012604_metas_lojas.sql` |
| G5 | `20261114012623_equipe_por_papel.sql` |
| L6b | `20261114012647_venda_item_regra_de_preco.sql` |
| L7b | `20261114012722_financeiras_a_receber.sql` |
| L7c | `20261114012802_caixa_saida_autorizada.sql` |
| L8a | `20261114012952_contas_a_pagar.sql` |
| L8b | `20261114013120_resultado_do_mes.sql` |
| L8c | `20261114013159_previsao_de_caixa.sql` |

Procedimento agora: confirmar projeto/ambiente e executar as RPCs com dono/gerente/vendedor; registrar os resultados reais de J1 e corrigir textos antigos do checkpoint. Se outro ambiente tiver usado os nomes anteriores, reconciliar seu histórico antes de aplicar os novos. Não reaplicar migration existente nem renomear/apagar arquivo já aplicado para “alinhar” o histórico. Se faltar acesso no futuro, avaliar CLI/cliente autorizado com versão/ajuda; não exigir um conector específico quando há outro caminho permitido.

Coordenar app/schema e registrar compatibilidade no processo de publicação. `importacao_aplicar` mudou de dois para três argumentos no R2; categoria de contas a pagar mudou de três para quatro no L8b. As versões do banco e do cliente precisam concordar. Os estados de indisponibilidade evitam telas falsas, mas não tornam o módulo operacional.

O checklist completo, com nomes das variáveis, ambiente responsável e prova de aceite, está em [CONFIGURACOES_E_HABILITACOES_CLAUDE](CONFIGURACOES_E_HABILITACOES_CLAUDE_2026-11-13.md).

## 6. Decisões desta conversa que precisam prevalecer

1. **Stack preservada:** TypeScript/Next.js/React/Tailwind, Node.js e Supabase/PostgreSQL. Não introduzir Firebase ou outro sistema para contornar pendências.
2. **11 lojas comerciais + DEFEITOS**, com transferências entre lojas e para/de DEFEITOS. Este local guarda problemas/avarias e não vende. Os 14 locais das pesquisas são meta histórica de expansão, não lojas atuais a inventar.
3. **Fotos dos produtos** para identificação no catálogo, busca, estoque, PDV e pedido interno. Recurso de upload não prova que os produtos reais foram fotografados.
4. **Arquivo recebido:** `relatorioProdutos131258.xlsx`, posição declarada de **10/11/2026 às 13:20**. São 2.271 produtos/83 colunas no relatório já analisado. O importador atual é CSV de catálogo com teto de 2.000 linhas/60 colunas; ainda falta conversão/layout de estoque por local. Não pedir novamente um arquivo já recebido nem assumir que essa posição histórica é saldo de hoje. Não publicar a base/custos no GitHub nem ajustar divergências arbitrariamente.
5. **Cliente rápido:** nome completo + WhatsApp, e-mail opcional. Cadastro fiscal com endereço completo; opção de envio oficial da nota por WhatsApp. Hoje `lib/clientes/regras.ts:137–143` e a RPC de clientes ainda exigem e-mail para financiamento e permitem documento sem telefone. #76/PR #77 documentam a decisão, ainda não a implementam. Não usar e-mail fictício para satisfazer validação de fornecedor; tratar eventual exigência externa por operação/contrato, sem bloquear o cadastro geral/fiscal.
6. **Nogle/Contel é API de outro sistema integrado**, não servidor/aplicativo substituto. Chips, ativações, recargas, recorrência e os pagamentos/repasses telecom precisam do registro oficial e de reconciliação. Registro interno, produção local e resposta desconhecida não substituem confirmação oficial. **C1 e C2 são prioritários para operação completa da Ora Connect**, mesmo que listas antigas coloquem parte disso para depois.
7. **Três usuários de teste já foram solicitados:** vendedor, gerente e dono. Essa criação está autorizada pela conversa; não manter A1 bloqueado por uma nova pergunta equivalente. Executar em ambiente de teste autorizado, com vínculos e sessão corretos, e entregar acesso por canal privado. Não registrar senha no relatório, chat de desenvolvimento ou GitHub.
8. **Vendas, pagamentos e Ora Connect reais são prioritários** para a transição. A Rein continua somente por arquivo; a substituição operacional depende de piloto conciliado e aceite, não da aparência do front-end.

## 7. Ordem de trabalho para concluir o planejamento

1. Ler este pacote e as PRs #67/#68/#77/#81; conferir o delta se a main avançou após `51417a8`. Corrigir rastreabilidade e registrar os bugs atuais sem reaplicar patches antigos em massa.
2. Resolver **#84**: validar as 51 migrations agora registradas, permissões/RLS, Storage e configuração pública/worker no ambiente correto. Corrigir textos antigos e registrar a prova autenticada, sem segredos ou reaplicação cega.
3. Corrigir **#78/#79/#80/#82/#83**, avaliar o teto/paginação da exportação e a integridade de cancelamento/repasse. Migrations incrementais, reversão e testes de concorrência onde houver dinheiro/estoque.
4. Executar **J1** com dono/gerente/vendedor: entrar, escolher loja, sessão renovada/bloqueio, catálogo/foto, estoque/transferência, caixa/venda mista, devolução/estorno, cliente/nota e painéis. Conferir números com os fatos e impedir acesso entre lojas/organizações. Não considerar mocks como essa homologação.
5. Aplicar **#76** no formulário, domínio/RPC, banco e destinatário fiscal; iniciar outbox/worker para envio da nota pelo WhatsApp oficial. O envio transacional da nota foi solicitado agora e não deve esperar o atendimento omnichannel inteiro.
6. Preparar carga da loja piloto: cadastro definitivo dos locais, fotos, produtos/preços e estoque por arquivos, IMEI/ICCID quando houver, prévia/erros/aprovação, conciliação da posição histórica e movimentos posteriores. Não lançar dados fictícios na base operacional.
7. Fechar pós-venda e financeiro: recebíveis com prazo/taxa real, baixas/estornos, contas/bancos/extratos, conciliação, inadimplência autorizada e repasses. Finalizar XLSX nativo e documentos exportados, preservando permissões também nas rotas de download.
8. Em paralelo, homologar **Nogle C1/C2**: acesso/escopo, uma operação de teste autorizada, evidência externa, consulta de pagamento, gateway/recorrência/carteira/extrato/repasse. Ligar a rotina só após homologação; conservar resposta incerta e prevenção de duplicidade. Não inventar endpoints para “terminar”.
9. Concluir fiscal com contador/provedor: cadastros tributários, documentos por operação, emissão, rejeição/reprocesso/contingência/cancelamento e entrega. Fila interna não é nota emitida.
10. Completar eventos de produção, metas/comissão/bonificação, reversões e fechamento com regras versionadas. Atribuir origem ao vendedor/loja sem dupla contagem e separar valor vendido, recebido, liquidado e repassado.
11. Seguir contratos/anexos, assistência/OS, online, marketplaces, WhatsApp de atendimento, Meta e IA conforme a matriz dos 179 requisitos. Reutilizar clientes, pedidos, estoque e financeiro; não criar cadastros paralelos.
12. Concluir qualidade/operação: restauração ensaiada, observabilidade/alertas, carga, contingência e incidentes. Homologar piloto ponta a ponta e só então expandir/desligar a operação anterior conforme o go/no-go.

As decisões D-014, D-017 e D-035–D-038 constam do repositório; respeitar as partes já decididas. Bloquear apenas dependências externas específicas. Credenciais, contratos e configurações **não substituem código faltante**.

## 8. Duplicidades, documentação e riscos de merge

- Não apareceram marcadores de conflito. As 12 migrations antes não aplicadas no desenvolvimento foram renomeadas no lote final para as versões registradas no Supabase, sem mudar seu SQL; todas as 51 têm reversão. Conferir qualquer outro ambiente que tenha usado os nomes antigos. A lista de blobs idênticos contém documentos históricos, templates e configurações. Similaridade estrutural de layouts não basta para excluir arquivos ou remover guardas de autenticação por rota.
- O checkpoint ainda tinha IDs de issues inferidos e o quadro “Falta publicar” dizia que G2b–L8c não tinham sido aplicadas, enquanto a linha seguinte já registrava 51 aplicadas. O L8d já foi observado no ar. Esta entrega corrige IDs e esse quadro, preservando a distinção entre registro versionado e validação remota independente.
- A lista antiga A1/B1 e as prioridades de WhatsApp/C2 precisam refletir esta conversa: contas de teste já solicitadas, arquivo já recebido, nota pelo WhatsApp antecipada e repasses Nogle essenciais. Não pedir novamente o que já foi decidido ou entregue.
- As PRs documentais #33/#66/#67/#68/#77/#81 não foram integradas. Ler arquivos sem merge é válido; aplicar seus patches antigos sem conciliação pode sobrescrever avanços. As conclusões sobre build/gráficos de #81 são históricas; seus bugs de inventário continuam atuais.
- O aplicativo publicado é homologação conforme o repositório. A documentação de 13/11 registra autorização para publicar ao fim de cada lote; não repetir automaticamente o pedido antigo “a cada vez” dentro desse escopo. Produção e operação real seguem o processo de aprovação aplicável.
- DRE é gerencial; faltam impostos calculados, algumas taxas e comissões, conforme contratos/fiscal. Tratar riscos de registrar a mesma despesa em saída de caixa e conta a pagar: definir vínculo/origem antes de automatizar para não duplicar resultado. Este último é risco de modelo/processo, não reprodução de lançamento duplicado identificável nesta rodada.

## 9. Evidências e verificação

Resultados completos em [evidencias/2026-11-13-planejamento](evidencias/2026-11-13-planejamento/LEIA-ME.md), incluindo manifesto, schema local, publicação, checks e reprodução. Repetição local integral da base funcional: **1.649 testes passaram**, um TODO, e **237 E2E passaram / 11 ignorados**. Lint, tipos, build, geradores e auditoria de produção passaram, com zero vulnerabilidades reportadas. Depois do delta `51417a8`, tipos e as **11 provas independentes** foram repetidos; o CI completo dessa base final também passou. `verificacoes.json` distingue as bases e o escopo de cada execução.

O inventário técnico de 73 tabelas se limita a `public`/`privado`: 67 públicas com RLS e seis privadas. Isso não certifica Storage/Auth remoto nem permissões por simples presença de RLS. Os testes do projeto verificam acesso/transações em cenários fictícios. Nenhum segredo foi lido; os exemplos/nomes de configuração foram examinados sem supor os valores no servidor.

**Parecer:** houve avanço real relevante, os gráficos foram recuperados no código e o aplicativo funcional foi publicado. A aplicação das 51 migrations passou a ter registro consistente no GitHub durante esta revisão; falta a prova autenticada do ambiente. Permanecem cinco bugs reproduzidos, regras recentes pendentes e 78 requisitos não iniciados. Não há evidência para declarar todas as áreas completas ou a integração Nogle operacional de ponta a ponta.

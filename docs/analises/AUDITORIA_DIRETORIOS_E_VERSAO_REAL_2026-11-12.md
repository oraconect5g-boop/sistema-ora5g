# Auditoria de diretórios, entregas e versão real — 12/11/2026

Revisor: Codex. Repositório `oraconect5g-boop/sistema-ora5g`. Base examinada: **`51fc428c80c5399bdc332d98ce1e1b6fe164a67f`**; comparação com `953b21e0b90f4823759de9bba8f38452dd6769e8`. Datas em America/Sao_Paulo. Snapshot materializado pelo GitHub, com hashes conferidos, sem checkout Git local independente. Nenhum acesso ao servidor, `.env` ou banco remoto; nenhum deploy/importação real foi realizado.

## Resultado principal

**O Claude está desenvolvendo a aplicação real. O site público não recebeu as entregas recentes.** Entre as duas bases há **19 commits e 108 arquivos alterados**, sem alteração em `apps/plataforma/src/app/demo` ou `apps/plataforma/src/demo`. Foram entregues módulos reais de inventário, clientes, CRM, PDV e pagamentos, além das correções R1/R2. Componentes compartilhados podem atender às duas interfaces, mas esse intervalo não é trabalho exclusivo na demo.

O domínio `https://ora5g.com.br` continua servindo **`0b6b45e`, build de 10/11/2026 às 20:45**. A conferência externa em 12/11 às 21:44, repetida às **22:02 com o mesmo resultado**, confirmou `/saude` e `/demo` com HTTP 200; `/produtos`, `/estoque/entrada`, `/estoque/inventario`, `/clientes`, `/crm` e `/pagamentos/conciliacao` com **404**. `/inicio` redireciona a `/entrar`. Sem login não foi feita homologação funcional no domínio. `/financeiro` retorna 200 na versão antiga por streaming; isso isoladamente não demonstra exposição de dados.

**CI aprovado não significa publicação.** Existe somente `.github/workflows/ci.yml`; a homologação usa scripts em `deploy/homologacao` e publicação manual autorizada, conforme o próprio LEIA-ME. O domínio principal é descrito como acesso temporário à homologação, não como produção homologada. Falta publicar aplicativo e schema compatíveis, conferir SHA no rodapé/saúde e executar aceite por papel. Não é possível atribuir o problema a cache: a evidência é uma build antiga ainda publicada.

**A diferença de gráficos permanece:** 25 instâncias na demo e três na aplicação real, todas em `financeiro/ConteudoFinanceiro.tsx`; `/inicio` real tem zero. O último merge P0 traz **matriz e contratos dos indicadores, somente documentação**. Não implementa G1–G5/J1 nem restaura os painéis de gestão. Os três gráficos financeiros existentes usam leituras persistentes; os demais painéis da demo não são prova de implementação real.

## Cobertura e fontes

- **147 diretórios, 620 arquivos, 608 textos com SHA de blob validado, 110 Markdown, 37 migrations e 37 reversões.** Todos os diretórios constam de [DIRETORIOS_E_DUPLICIDADES](DIRETORIOS_E_DUPLICIDADES_2026-11-12.md).
- [REQUISITOS_E_PENDENCIAS](REQUISITOS_E_PENDENCIAS_2026-11-12.md) lista os **179 requisitos**, prioridade, estado declarado, nota de implementação e lote/dependência.
- [VERSOES_ROTAS_E_COBERTURA](VERSOES_ROTAS_E_COBERTURA_2026-11-12.md) registra as **73 branches**, cinco PRs documentais abertas, todas as rotas e limites da revisão. Sem tags ou releases na coleta.
- Recuperados os corpos das 77 issues/PRs e os 74 comentários existentes no início da coleta. Soma dos contadores = comentários coletados. #78, #79 e #80 foram abertas depois, nesta auditoria.
- Considerados o checkpoint/JSON atuais, backlog, ADRs, rastreabilidade, passagem, pedidos de revisão, integrações, operação e análises anteriores. Pacotes fora da main: PRs #66, #67, #68 e #77. A PR #33 é histórica e parte de seu conteúdo chegou por outros commits; não fazer merge antigo indiscriminadamente.
- Revisão aprofundada das mudanças transacionais e áreas reais, testes completos e provas independentes; arquivos preservados reaproveitam a revisão anterior. Inventário completo **não equivale a certificação de cada linha de todo o histórico**. Doze binários foram inventariados, sem revisão integral do vídeo. O link privado do projeto ChatGPT não disponibiliza as demais conversas; foram consideradas as decisões efetivamente recebidas nesta conversa.

## O que foi feito e o que falta por área

| Área / diretórios principais | Implementado no código real | Pendências materiais |
|---|---|---|
| Acesso, lojas, equipe (`app/entrar`, `conta`, `escolher-loja`, `lojas`, `equipe`, `lib/acesso`) | Auth/sessão, turno/loja, RBAC/RLS, vínculos e configurações versionadas; cadastro e inativação de lojas | Cadastrar dados reais das 11 lojas + DEFEITOS, completar gestão de equipe e validar dono/gerente/vendedor. DEFEITOS não vende; meta futura de 14 não autoriza inventar lojas |
| Catálogo e fotos (`app/catalogo`, `produtos`, `lib/catalogo`) | Produtos/variações, tipo, SKU, códigos, fotos privadas assinadas, preço/campanhas, busca na fonte | Garantir foto dos produtos reais; escala/paginação de variantes e fotos; migração de dados e aceite. Placeholder não comprova produto fotografado |
| Importação (`produtos/importar`, `lib/importacao`) | CSV com mapeamento/prévia, aprovação separada, comparação versionada, aplicação transacional e desfazer por identidade | XLSX de estoque amplo não implementado. O arquivo recebido tem 2.271 produtos/83 colunas; importador atual é CSV de catálogo, até 2.000 linhas/60 colunas, sem tradução pronta do estoque dos 12 locais |
| Entradas/estoque (`estoque/entrada`, `lib/estoque`) | Fornecedor, compra/carga inicial, quantidade ou IMEI/ICCID, custo protegido, estorno e reentrada auditada, histórico paginado | Homologar carga inicial e movimentações reais. Posição fornecida de 10/11 às 13:20 é histórica; conciliar vendas/transferências posteriores antes de assumir saldo atual |
| Estoque e transferências (`estoque`, `transferencias`) | Saldo/foto, busca, onde tem na rede, físico/reservado/disponível/trânsito, pedido/envio/recebimento, divergências e DEFEITOS | Indicadores/agregações sem truncamento, jornada móvel completa com dados reais, importação de saldo e conciliação de divergências; corrigir #80 |
| Inventário cíclico (`estoque/inventario`) | Abrir, contar, enviar, decidir, justificar, auditar e ajustar sem apagar histórico | Corrigir #78 e #79, recontagem/segregação e homologação de inventário com movimentos concorrentes |
| Clientes (`clientes`, `lib/clientes`) | Cadastro compartilhado da rede, dados privados, máscaras/revelação auditada, busca exata, consentimentos, ficha, mesclagem e segmentos | **Regra recente #76 / PR #77 ainda não implementada:** nome completo + WhatsApp no rápido; e-mail sempre opcional; endereço completo no fluxo fiscal; envio da nota via WhatsApp oficial. Faltam contratos/anexos privados |
| CRM (`crm`, `lib/crm`) | Funil, origem/campanha, responsável, próximo passo, ganho/perda, reabertura e agenda com resultado/histórico | Integrações com canais, automações e aceite operacional. Funil local não equivale a WhatsApp ou campanha funcionando |
| PDV/vendas (`vender`, `vendas`, `lib/vendas`) | Carrinho/reservas, serializados, pagamentos mistos, cliente, nota em seu nome, pendências, câmera, confirmação e aviso sem internet | L6b, contingência real, pós-venda completo, crédito/integrações e homologação ponta a ponta. Aviso sem rede não é PDV offline com sincronização |
| Caixa/pagamentos (`caixa`, `pagamentos`, `lib/pagamentos`) | Abertura/fechamento, registros, terminais por loja, estado do dinheiro e **conciliação manual** com referência/líquido/data | L7b: saída autorizada, devolução confirmada de valores, repasses/recebíveis das financeiras; Pix/maquininha automática somente com contrato/API homologados, além de chargebacks e exceções |
| Financeiro/relatórios (`financeiro`, `lib/financeiro`) | Indicadores persistentes, três gráficos, comparação temporal e CSV; separação entre registro, financiamento e estorno pendente | G1–G3/J1, margem protegida por `custo.ver`, contas a pagar/receber, baixas/vencimentos/aging, repasses, DRE/fluxo, XLSX/PDF e previsão com premissas |
| Metas/comissões/produção | Regras iniciais de domínio; produção Connect confirmada com origem preservada | L9/G4: eventos idempotentes para todos os fatos, metas/regras versionadas, reversões e fechamento; não confundir contagem da demo com comissão operacional |
| Ora Connect / Nogle (`connect`, `integracoes/nogle`, `worker/src/connect`) | Registro local e worker de fila, reivindicação, envio, consulta, respostas incertas, referências e conciliação; catálogo baseado em documentação oficial | Habilitar e homologar operações/escopo da conta, consulta de pagamento, gateway, recorrência, saldo/extrato e repasses. Chip vendido, ativação solicitada, operação confirmada e dinheiro liquidado são fatos diferentes. Registro oficial deve ser Nogle; não inventar endpoints ou confirmar operação só localmente |
| Fiscal (`notas`, `lib/notas`) | Solicitação local, fila/estado e destinatário associado ao cliente | Emissor/contador, cadastro tributário, emissão/retorno oficial, cancelamento/contingência/numeração e entrega por WhatsApp; solicitações locais não são NF-e/NFC-e emitidas |
| Assistência/OS | Demonstração e escopo L12 | As seis funções OS não iniciadas: entrada, diagnóstico/orçamento, autorização, peças/execução, garantia/entrega e financeiro; alinhar acesso do técnico |
| Loja online e marketplaces | Telas/referências da demo e planejamento | ONLINE-001–008 e MKTPL-001–008 não iniciados: catálogo, pedidos/pagamentos, reserva única de estoque, logística, cancelamentos e conciliação |
| WhatsApp, Meta e IA | Especificações/variáveis e referências visuais | WHATS-001–008, META-001–006 e AI-001–007 não iniciados; faltam adaptadores/workers/webhooks oficiais, assinatura, idempotência e interface operacional. Envio transacional de nota não deve exigir opt-in de marketing |
| Auditoria/operação (`auditoria`, `deploy`, `config`, `.github`) | Auditoria de ações, CI e detectores, scripts de homologação e workers | Ensaio de restauração, observabilidade/alertas, carga, incidentes, contingência, deploy versionado com migrações/rollback e aceite do piloto |

## Requisitos: contagem sem confundir desenvolvimento com conclusão

| Estado declarado | Quantidade |
|---|---:|
| Implementado/testado em desenvolvimento | 32 |
| Parcial | 55 |
| Não iniciado | 84 |
| Somente demonstração | 5 |
| Bloqueado | 2 |
| Restrição respeitada | 1 |
| **Total** | **179** |
| **Homologado** | **0** |

Esses estados vêm do JSON do implementador e não são percentual de prontidão. Um requisito parcial pode conter várias entregas; “testado” ainda depende de revisão/aceite. O cadastro recente do usuário complementa os IDs existentes e ainda precisa entrar no código. Rein continua somente por arquivos, sem integração à API.

## Defeitos confirmados nesta rodada

| Achado | Evidência | Impacto / correção |
|---|---|---|
| **REV-DIR-001 — #78 (P2)** | `inventario_decidir`, migration `20261111142726_inventario.sql:276`: guarda compara somente criador/enviador. Gerente abre/envia; dono conta e aprova; `contado_por = decidido_por`; ajuste -1 aplicado | Falha na segregação da contagem/aprovação. Considerar os contadores efetivos dos itens; testar recontagem/múltiplos contadores. Nova migration e reversão |
| **REV-DIR-002 — #79 (P2)** | Mesma migration, linhas 168–175: quantidade = número de identificadores distintos. Dois aparelhos, um dual SIM, três IMEIs: RPC retorna sistema 2 / contado 3 | Contagem física e divergência incorretas. Resolver IMEI/IMEI2 para uma identidade física e contar uma vez. A prova não demonstra criação de saldo extra, pois a baixa serializada usa a identidade |
| **REV-DIR-003 — #80 (P2)** | `app/estoque/page.tsx:61–83`, consulta limitada a 500 e totais calculados no client/server React sobre a amostra. Página real com API simulada: 501 itens, primeiros 500 conferidos e último pendente → “500 de 500”, “Tudo conferido”, “Nenhum pendente” | Falsa conclusão da conferência diária. Agregar totais autorizados no banco e paginar pendentes com ordem estável; não carregar toda a base sem limite |
| **REV-DIR-004 — rastreabilidade** | Checkpoint inferiu IDs das issues sem consultar seus corpos: trocou #71/#72/#73/#74 | Esta PR corrige apenas a documentação e a correspondência abaixo. Não encerrar ticket por número inferido |
| **Regra do usuário ainda pendente — #76** | `lib/clientes/regras.ts:137–143` e migration de clientes: aceitam documento OU telefone e exigem e-mail para financiamento; endereço só é obrigatório para entrega | Diverge da decisão recente: WhatsApp no rápido, e-mail nunca obrigatório no cadastro e endereço completo para nota. PR #77 documenta a mudança, não a implementa. Ajustar UI, RPC, tipos, destinatário fiscal e worker WhatsApp sem e-mail fictício |

Provas em [evidencias/2026-11-12-diretorios](evidencias/2026-11-12-diretorios/LEIA-ME.md). Três testes observam bugs e passam por reproduzi-los: isso **não aprova o comportamento**. Quatro testes verificam resultados seguros das correções antigas. Nenhum dado real foi utilizado.

## Correções anteriores: situação e IDs corretos

| Achado anterior | Issue correta | Evidência atual |
|---|---|---|
| REV-NOV-001 — vazamento de custo da entrada | #69 | **Reprodução antiga bloqueada:** vendedor sem `custo.ver` recebe SQLSTATE 42501 no SELECT de custo. Regressões de coluna, RPC e auditoria passaram |
| REV-NOV-002 — prévia velha sobrescreve preço posterior | #70 | **Reprodução antiga bloqueada:** retorno `atualizada:true`, comparação 2, preço posterior preservado em 12.000 centavos fictícios |
| REV-NOV-004 — IMEI estornado sem caminho de reentrada | #71 | **Reprodução antiga resolvida:** uma identidade reentra disponível na loja correta, sem duplicar |
| REV-NOV-005 — receber produto inativo | #72 | **Reprodução antiga bloqueada:** SQLSTATE 22023 e saldo preservado |
| REV-NOV-006 — categoria duplicada por caixa/concor­rência | #73 | Índices normalizados/travas comuns e testes R2/concorrência passaram na suíte completa; não foi reaberto como bug por a issue continuar aberta |
| REV-NOV-007 — desfazer clobbera alteração posterior pelo mesmo valor | #74 | R2 guarda identidade de preço/custo/auditoria; testes de edição posterior com mesmo valor e migração de legado passaram. OBS REV-NOV-003 não era ticket independente |
| REV-NOV-008/009 — prévia truncada / histórico de entradas limitado | #75 | R1 histórico/detalhe paginados; R2 prévia de 100 linhas/página com filtros. Testes do módulo e navegador passaram; #80 é outro fluxo, conferência diária |

**R1 = #69, #71, #72 e parte de entradas da #75. R2 = #70, #73, #74 e parte de importação da #75.** Issues ainda abertas não demonstram persistência dos bugs. Nenhuma foi fechada automaticamente. Homologação remota e verificação do teto de carga do R2 ainda faltam.

## Duplicidades, merges e compatibilidade

- Nove grupos de arquivos com conteúdo exatamente igual: fontes históricas da skill/originais, cópia da auditoria da skill, templates de issue/PR e configurações ESLint/Vitest. **Nenhuma duplicação exata de lógica de produto executável foi identificada por esse método.** Isso não exclui semelhança semântica entre trechos diferentes.
- Não há marcadores de conflito em TS/TSX/SQL/JSON/MJS/SH; nenhuma das migrations anteriores foi modificada/removida no intervalo; todas as 37 têm reversão. Redefinir função numa migration nova é evolução histórica, não motivo para apagar o SQL anterior.
- `importacao_aplicar(uuid,text)` foi removida no R2 e substituída por `(uuid,text,int)`. A aplicação atual envia a versão da comparação. **App e migration precisam ser publicados de forma compatível**; cliente antigo com schema novo pode falhar. Validar limite de travas/tempo no Supabase de destino antes de carga no teto; medições locais não comprovam o timeout remoto.
- A main incorpora entregas de 68 heads; cinco branches documentais/revisões divergem. Branch antiga preservada não executa um segundo backend. O pacote #67, a revisão #68 e a regra #77 ainda podem ser consultados sem merge; integrar conteúdo atual necessário, sem restaurar arquivos antigos.
- Custos no importador dependem da relação atual entre permissão de importar e `custo.ver`, presa por teste. Não foi demonstrado vazamento atual por esse caminho. Se a matriz mudar, fechar a exposição das colunas antes de conceder importação a papel sem custo.
- Truncamentos de listagens do estoque e filhos do catálogo precisam ser tratados no G3/#40; busca na fonte foi corrigida, mas indicador agregado não pode somar apenas 500 linhas. #80 demonstra o problema no fluxo de conferência.

## Ambiente e integrações: o que a existência dos arquivos comprova

Existem `.env.example` na raiz e em `apps/plataforma`; não existe exemplo próprio do worker. O worker lê sua pasta de ambiente ou `ORA_PASTA_AMBIENTE`, conforme o script. O exemplo central contém grupos Supabase, SMTP, Nogle, fiscal, WhatsApp e demais fornecedores; variáveis previstas não equivalem a adaptadores implementados. Não foram lidos arquivos de ambiente reais, portanto **não está comprovado que as credenciais, buckets, cron e webhooks estejam configurados**.

O endpoint público `/saude` confere disponibilidade do Auth; não lê dados de negócio e não valida RLS/migrations/Storage. Para Nogle: manter API externa como sistema oficial de operação/repasse telecom, com referência externa e estados auditáveis; separar pagamento/ativação/recorrência, baixa gerencial e liquidação. Habilitar somente rotas documentadas e autorizadas pela Nogle. Falta homologar gateway, recorrência, extrato e repasses; informar apenas chaves não entrega essas funções. Fiscal e WhatsApp também exigem implementação, além da configuração.

## Ordem de execução recomendada

1. Corrigir rastreabilidade (esta PR), ler #76–#80 e o pacote #67, integrar a decisão recente da PR #77. Não reiniciar funcionalidades já entregues nem restaurar código antigo.
2. Corrigir #78/#79/#80 no backend/UI respectivos, com regressões, nova migration/reversão onde necessário e revisão cruzada. Concluir validação de carga/compatibilidade do R2.
3. Preparar uma publicação revisável da versão real: versão app/schema, backup/reversão e teste dono/gerente/vendedor; publicar após autorização prevista para homologação. Conferir SHA em `/saude` e todas as rotas novas. Para produção permanece o processo de aprovação do repositório.
4. Implementar G1–G5/J1 a partir da matriz P0: agregações no banco, por período/loja/rede e permissão, depois gráficos/UI. Priorizar Início, financeiro/caixa, vendas/margem, estoque, produção/metas e Connect. Testar ausência de dados, estornos, custo proibido e bases acima dos limites de resposta.
5. Preparar carga real de catálogo/fotos/preços e estoque por arquivos; suportar o XLSX amplo com prévia, mapeamento dos 12 locais, erros e auditoria. Preservar o arquivo original; tratar a posição de 10/11 como histórica e conciliar movimentos posteriores.
6. Aplicar cadastro rápido/fiscal conforme #76: nome completo + WhatsApp, e-mail opcional, endereço no fluxo fiscal; completar CRM e contratos/anexos privados. Não criar e-mail fictício para passar validação de fornecedor.
7. Fechar L6b/L7b: PDV, pós-venda, saídas de caixa, devolução de valores confirmada e estado financeiro confiável. Completar financeiro L8, pagar/receber, repasses, margem, exportações e previsão.
8. Em paralelo ao trabalho local, homologar **Nogle como prioridade operacional**: ativações, chips, recorrência, gateway, referências, consulta de pagamento, saldos/extratos e repasses oficiais. Manter conciliação entre livro local e Nogle e produção atribuída ao vendedor de origem. Nenhuma confirmação local substitui o registro oficial.
9. Completar L9/L10: eventos de produção/metas/comissões versionadas e reversíveis; emissor fiscal/contador, regras tributárias, documentos oficiais e envio via WhatsApp com worker/outbox, tentativas e estados de entrega.
10. Seguir L12–L17: assistência/OS, online, marketplaces, WhatsApp comercial, Meta e IA, compartilhando cliente/estoque/pedido/financeiro. Reutilizar a arquitetura atual; não criar sistemas paralelos nem trocar a stack.
11. Concluir requisitos transversais: restauração ensaiada, observabilidade, alertas, carga, incidentes, contingência e piloto em uma loja. Homologar operação ponta a ponta antes de expansão e desligamento operacional da Rein.

As dependências externas estão na lista única `docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md` e no checkpoint. Manter TypeScript/Next.js/React/Tailwind/Node.js/Supabase/PostgreSQL; não incluir Firebase nem outro backend para contornar implementação pendente.

## Verificações realizadas

- GitHub Actions da main `51fc428`: [run 43287637302](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43287637302), job Verificações aprovado, incluindo scanner, geradores, instalação, lint, tipos, testes, build, dependências e E2E.
- Repetição local com Node 22 e instalação limpa: lint, tipos, build, geradores de rastreabilidade/catálogo Nogle e `npm audit --omit=dev` aprovados, **zero vulnerabilidades de produção reportadas**.
- **1.118 testes automatizados passaram**, 102 arquivos; **1 TODO**. Banco inclui migrations/RLS/concorrência com PGlite e PostgreSQL descartável; isso não atesta o estado do projeto remoto.
- **223 E2E passaram / 11 ignorados**, em 234 casos, com navegador local. Testes locais não substituem conta e integração reais no domínio.
- **7 provas independentes:** quatro confirmam correções antigas e três reproduzem os bugs #78/#79/#80. Passar nesses três testes observacionais não é aceite.
- Detector do projeto executado nos 608 textos da árvore e nos arquivos da entrega: sem achados; história remota verificada pelo CI. Não foi alegada varredura de histórico Git local inexistente.
- Nenhuma mudança de código do produto ou migração, nenhuma importação real, merge, publicação ou alteração no Supabase remoto nesta revisão. Somente documentação e evidências, com correção pequena da tabela de issues no checkpoint.

**Decisão do revisor:** houve avanço real relevante e o CI está aprovado, mas ainda existem bugs confirmados, regras recentes não implementadas, muitos requisitos abertos e publicação defasada. A versão atual ainda não está homologada para substituir integralmente a operação existente.

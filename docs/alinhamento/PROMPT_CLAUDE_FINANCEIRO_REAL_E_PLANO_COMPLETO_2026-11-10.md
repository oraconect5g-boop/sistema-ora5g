# Prompt de execução para Claude Code — financeiro real e conclusão da plataforma

**Preparado em 10/11/2026. Repositório: `oraconect5g-boop/sistema-ora5g`.**
**Primeira entrega: issue #65. Relatório completo: `docs/analises/PARIDADE_DEMO_REAL_E_PLANO_COMPLETO_2026-11-10.md`, incluído junto deste prompt.**

Você é o programador do projeto Ora 5G/Ora Connect e trabalha com o Codex como revisor. Execute este pedido sobre o projeto existente. O proprietário quer utilizar a aplicação real, recuperar nela a riqueza funcional da demonstração e avançar até o escopo completo. A prioridade imediata é o painel financeiro real com gráficos; vendas, pagamentos/caixa e Ora Connect continuam sendo o núcleo prioritário.

Não entregue apenas outro planejamento. Faça um inventário breve e comece a primeira implementação completa e revisável que estiver liberada. Continue os trabalhos independentes quando um fornecedor bloquear outra parte. Respeite as autorizações vigentes e os limites de ambientes, merges e publicações; este pedido não libera automaticamente produção nem operações financeiras/telecom reais.

## 1. Leia e reconcilie antes de alterar

Leia integralmente:

1. `docs/ESTADO_ATUAL_E_PASSAGEM.md` e `docs/alinhamento/ANALISE_DO_PLANO.md`.
2. `AGENTS.md`, `CLAUDE.md` e a skill `.claude/skills/engenheiro-senior-ora5g/SKILL.md`.
3. O relatório `docs/analises/PARIDADE_DEMO_REAL_E_PLANO_COMPLETO_2026-11-10.md`, incluindo os **179 requisitos**.
4. `docs/alinhamento/INDICE_RELATORIOS_CODEX_2026-11-09.md` e os relatórios do Codex nele referenciados; `docs/alinhamento/RECONCILIACAO_CODEX_2026-11-09.md`. Diferencie achados antigos já corrigidos de defeitos ainda reproduzíveis.
5. `backlog.json`, `docs/alinhamento/status-requisitos.json`, `docs/alinhamento/RASTREABILIDADE.md`, `docs/alinhamento/FILA_DE_EXECUCAO.md` e `docs/alinhamento/PROMPT_CLAUDE_CONSOLIDADO_2026-11-09.md`.
6. `docs/07_ROADMAP.md`, `docs/08_DESIGN_E_TELAS.md`, `docs/09_TESTES_E_ACEITE.md`, `docs/PENDENCIAS_DO_PROPRIETARIO.md` e `docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`.
7. ADRs e código/testes/migrations dos domínios que você tocar; o go/no-go em `docs/operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md`.

Fontes no GitHub:
- Issue principal: https://github.com/oraconect5g-boop/sistema-ora5g/issues/65
- Relatório integral: https://github.com/oraconect5g-boop/sistema-ora5g/issues/65#issuecomment-6780418609
- Primeiro acesso: https://github.com/oraconect5g-boop/sistema-ora5g/issues/63
- Gerente de teste: https://github.com/oraconect5g-boop/sistema-ora5g/pull/64
- Integração Nogle: https://github.com/oraconect5g-boop/sistema-ora5g/issues/54

Se a API do GitHub ou `gh` não estiver disponível, leia os documentos desta branch pelo Git usando o acesso já autorizado. O relatório integral foi incluído como arquivo para isso. Não interrompa o trabalho somente porque um comentário não abre no servidor; use a cópia versionada, os requisitos locais e este prompt, registrando a limitação.

A análise que originou este prompt usou a main `84ecefea496afe1159f355e14491b995240a347e`, cujo CI passou. Confira a main, a branch de trabalho, PRs e a versão publicada atuais; não congele o trabalho nesse SHA nem sobrescreva alterações posteriores. Não limpe trabalho alheio.

Os estados documentais nessa base eram 19 testados em desenvolvimento, 42 parciais, 10 em demonstração, 2 bloqueados, 105 não iniciados e 1 restrição respeitada; nenhum homologado. Recalcule se houver mudanças. Não use esses números como percentual de conclusão.

## 2. Preserve estas decisões

- Manter TypeScript, React/Next.js, Tailwind, Node.js e PostgreSQL/Supabase, com os módulos e workspaces existentes. Não migrar para Firebase nem introduzir outra arquitetura central.
- Manter o visual azul atual, navegação no computador/celular, componentes e padrões aprovados. Ampliar a funcionalidade sem retirar ações já implementadas.
- A rede atual tem **11 lojas comerciais e DEFEITOS**. DEFEITOS recebe itens por transferência e não vende. Não criar três lojas inexistentes para completar a antiga contagem de 14.
- Os nomes confirmados já estão em `docs/cadastros/LOJAS_CONFIRMADAS_2026-11-09.json`; não pedi-los novamente. Códigos/CNPJ/endereço e dados comerciais devem ser obtidos pelo canal seguro quando faltarem.
- Rein é somente importação por arquivos. Não criar API Rein.
- Ora Connect integra o sistema oficial da **Nogle via API**. Não é um servidor/aplicativo separado nosso nem uma integração alternativa chamada Contel.
- Preservar a separação entre demonstração e aplicação real. Não remover o aviso de demo e apresentar dados simulados como operação.
- Aplicar decisões explícitas recentes do proprietário e ADRs vigentes; pesquisas e textos antigos não anulam essas decisões.
- Reutilizar código e planejar contratos estáveis. Evoluir o schema com migrations versionadas e seguras quando necessário, sem prometer zero alterações futuras.

## 3. Entenda a diferença que motivou o pedido

Os gráficos continuam em:
- `apps/plataforma/src/app/demo/_paineis/PainelGestao.tsx`;
- `apps/plataforma/src/app/demo/financeiro/page.tsx`;
- `apps/plataforma/src/app/demo/relatorios/page.tsx`;
- `apps/plataforma/src/componentes/graficos.tsx`.

Porém, na base analisada:
- `apps/plataforma/src/app/inicio/page.tsx` mostra pendências e atalhos;
- `apps/plataforma/src/app/caixa/page.tsx` atende à operação do caixa;
- a rota real `/financeiro` não existe;
- `lib/acesso/menu.ts` não define um módulo financeiro/relatórios completo.

A comparação da última UI não mostrou remoção dos gráficos nem alteração dessas páginas reais. Resolva a falta de paridade real × demo; não volte apenas ao layout antigo.

Crie uma matriz rastreável: função da referência → rota real → fonte persistente → regra/permissão → teste → estado. Cubra painéis, financeiro, relatórios, metas, CRM, catálogo, estoque, PDV, Connect, fiscal, assistência e canais.

## 4. Primeira implementação obrigatória: issue #65

Comece pelos indicadores que podem usar as fontes locais existentes. **Não espere uma nova API para implementar gráficos de vendas e caixa.**

### 4.1 Contrato e fontes

Para cada indicador, defina:
- significado de negócio, fonte/tabelas e status incluídos;
- data de ocorrência/competência, corte e fuso `America/Sao_Paulo`;
- loja, organização, vendedor e canal quando aplicáveis;
- moeda/unidade, arredondamento e tratamento de valores grandes;
- cancelamentos, devoluções, estornos e comparações;
- autorização e acesso aos registros que explicam o total.

Inspecione as tabelas de vendas, itens/custos, pagamentos, caixas/movimentos, devoluções, retornos, estornos e recebíveis. Não invente outra fonte de verdade.

### 4.2 Entrega funcional inicial

Implementar, em lotes pequenos da mesma entrega se necessário:
1. Leitura agregada autorizada do período completo no servidor/banco.
2. Rota real `/financeiro` e entrada no menu por permissão.
3. Resumo financeiro e atalho no `/inicio`, preservando pendências e demais atalhos.
4. Gráfico de vendas concluídas/devoluções por período.
5. Gráfico de pagamentos registrados por meio.
6. Gráfico de movimentação dos caixas e visão de fechamentos/diferenças.
7. Filtros de período, loja e situação; loja selecionada primeiro e consolidação da rede somente no escopo permitido.
8. Tabelas acessíveis, detalhamento dos fatos e exportação autorizada.
9. Estados de carregamento, erro, vazio e indisponibilidade.

Use os componentes gráficos e o molde real existentes. Extraia auxiliares neutros quando útil, sem importar contexto, dados ou geradores de `demo/` nas páginas reais. A distribuição horária fictícia da demo não pode virar histórico real.

Compare períodos equivalentes e sinalize histórico insuficiente. Não fabrique vendas para preencher gráficos. É permitido usar fixtures nos testes, e dados de teste no ambiente identificado para isso; o software real lê registros persistidos.

Quando a fonte existe e não há fatos, mostre vazio/zero adequadamente. Quando falta módulo/contrato, mostre indisponibilidade. Não apresentar conta a pagar, saldo bancário, meta ou previsão inventados como reais.

### 4.3 Regras financeiras indispensáveis

- Venda, pagamento, recebimento, liquidação, repasse, margem e comissão são fatos diferentes.
- Pagamento confirmado no registro local não comprova liquidação no extrato.
- Fundo/suprimento não são receita; sangria não é despesa ou prejuízo. Enquanto houver apenas o livro da gaveta, use “movimentação dos caixas”, sem apresentar isso como fluxo financeiro completo empresarial.
- Entrada PayJoy/Aiva e principal a receber não somam o preço duas vezes. Não inventar prazo/taxa de repasse.
- Vale-troca não é dinheiro recebido.
- Troco, cancelamento, devolução e estorno não podem ser abatidos duas vezes.
- Estorno externo pendente não equivale a reembolso comprovado. Preservar os estados atuais e as confirmações.
- Cancelar não repõe estoque automaticamente: retorno físico continua sendo conferido por IMEI/ICCID e condição.
- Valor de face de recarga não é receita integral da Ora. Carteira Nogle, pagamento do cliente e repasse são separados.
- Margem bruta usa custo histórico autorizado; não rotular como lucro líquido/DRE antes de despesas, taxas e tributos estarem modelados.
- Agregar itens, pagamentos e devoluções sem multiplicação de joins.
- Não usar os primeiros 200/500/1000 registros como total do período. O resumo limitado de `/vendas` não é uma consolidação financeira completa. Verificar limites REST e paginação.
- Usar os utilitários monetários existentes e proteger precisão em centavos.

### 4.4 Autorização

Dono: escopo autorizado da organização; gerente: loja permitida; vendedor: próprias vendas/caixa/produção conforme matriz; administrador: limites do ADR-002. Não ampliar privilégios por conveniência.

Custo/margem dependem de `custo.ver`. Proteger consultas, totais, gráficos, detalhamento e exportações no servidor/banco. Um botão oculto não é autorização. Abrir caixa não pode liberar automaticamente todo o financeiro.

Se precisar acrescentar permissão/consulta, faça a mudança mínima versionada, com RLS e testes. Não resolver acesso com grant amplo, chave privilegiada no cliente ou desativação de RLS. Toda consolidação deve continuar isolando outras organizações.

### 4.5 Testes que precisam demonstrar o resultado

Cobrir:
- cartões, gráficos, tabela e exportação reconciliando com os livros;
- pagamento misto e financiamento com entrada;
- múltiplos itens/pagamentos/devoluções sem duplicação;
- troco, vale-troca, cancelamento e devolução parcial;
- estorno pendente versus comprovado;
- ausência de fatos e de histórico comparável;
- limite de dia no fuso do negócio;
- volume maior que o limite da API;
- dono/gerente/vendedor, outra loja e outra organização;
- proteção de custos;
- celular de 360px e computador, tabelas acessíveis e detalhamento autorizado.

Não considerar a primeira versão do painel como conclusão de todo o financeiro.

## 5. Retome os acessos sem recriar o que já funciona

A conta informada pelo proprietário já recebeu perfil ativo e vínculo de **dono de teste na organização de desenvolvimento**, com auditoria (#63). Confira o estado atual e preserve-o. Não redefina senha, duplique conta ou reaplique bootstrap por suposição.

A PR #64 adiciona gerente ao script de vínculos de teste e teve CI aprovado. Confira se já foi integrada ou se precisa reconciliar o conteúdo. Não criar outra implementação concorrente.

Concluir vendedor/gerente de teste pelo mecanismo administrativo oficial do Supabase, somente no ambiente autorizado, com confirmação e entrega privada de acesso. Não inserir usuários diretamente em `auth.users`, publicar senhas/tokens ou usar os sufixos da semente para promover pessoas reais.

Validar login, renovação, saída, revogação, segunda visita, contexto de loja e diferenças entre perfis. A posse de uma conta de dono não substitui testes de vendedor/gerente nem permite autoaprovar solicitações quando a regra proíbe.

## 6. Avance o restante por dependência

Use o anexo completo dos 179 requisitos como inventário, preservando o que já existe:

0. Segurança/acesso/ambientes, backup/restauração, alertas, contingência e testes são transversais.
1. Painel financeiro real inicial e paridade visual/funcional (#65).
2. Lojas/DEFEITOS, catálogo/fotos, preços/custos, importação Rein por arquivo, estoque/IMEI/ICCID, compras e inventário.
3. Concluir/homologar PDV, pagamento misto/financiado, caixa, descontos, cancelamento/devolução/troca e pedido fiscal existente.
4. Ora Connect oficial pela Nogle, em paralelo ao núcleo.
5. Financeiro completo: pagar/receber, vencimentos/baixas/aging, taxas/parcelas, terminais, extratos, conciliação, repasses, DRE gerencial e previsão.
6. Fiscal, com contratação/definição do contador iniciadas desde já.
7. CRM, consentimento/histórico, metas, produção e comissões por evento idempotente.
8. Assistência: OS, custódia/fotos/acessórios, trânsito ao técnico, orçamento, aprovação, peças, entrega e cobrança.
9. WhatsApp oficial, atendimento, atribuição, templates e notificações.
10. Loja online, pedidos/checkout/frete/retirada, marketplaces e expansão.
11. Marketing/atribuição, BI ampliado e IA supervisionada.

Essas trilhas não exigem que todas as dependências externas de uma fase estejam resolvidas para trabalhar na próxima parte independente. Também não autorizam pular o núcleo e construir só telas.

Reconcilie divergências de rastreabilidade antes de duplicar funções. Exemplo identificado: ORA-POS-011 não iniciado versus ORA-FISC-001 testado para solicitação fiscal da venda. Verifique implementação/aceite; não crie uma segunda fila nem eleve status sem prova.

## 7. Regras específicas da Nogle e outras integrações

Toda ativação, recarga, portabilidade e demais operações da Ora Connect devem ser registradas/reconciliadas com a Nogle conforme contrato oficial. Loja e vendedor precisam estar correlacionados, sem dupla produção ou comissão.

Concluir cobrança/gateway, consulta de pagamento, carteira/extrato, compra/transferência de chips, recorrência e repasse somente com contratos verificados. A existência de três operações e um transporte HTTP não encerra a #54.

Nunca inventar endpoint, campo, webhook, taxa, prazo, sandbox, idempotência externa ou evidência de confirmação. Resposta ambígua/timeout pede consulta e tratamento do desconhecido, não reenvio cego. UUID e data isolados não são garantia de correlação sem contrato.

Segredos Nogle e Supabase administrativo ficam no worker; web recebe somente a allowlist. Não habilitar operações externas ou rotinas financeiras reais como consequência de publicar gráficos.

PicPay/PagSeguro usados na maquininha não significam API POS disponível. Registro/comprovante manual não é conciliação bancária. PayJoy/Aiva exigem regra/relatório de repasse. Fiscal depende de contador, documento correto e emissor homologado.

## 8. Consolide o que falta do proprietário/fornecedores

Mantenha uma única lista atualizada por capacidade, aproveitando os arquivos existentes. Para cada dependência, registre:

- funcionalidade bloqueada e o que pode avançar sem ela;
- fornecedor e documentação/contrato verificável;
- estado: não necessária, já disponível, configuração, habilitação, decisão comercial ou contrato ausente;
- ambiente e apenas os nomes das variáveis necessárias;
- ação mínima do responsável e teste que comprova desbloqueio.

Inclua arquivos Rein, dados fiscais/códigos das lojas, fotos/custos, políticas de desconto/troca/comissão, SMTP/usuários, Nogle, financeiras, fiscal e canais.

Não peça novamente informações já registradas nem valores de chaves pelo chat. Não trave os gráficos locais esperando fornecedores. Se uma resposta for indispensável, delimite somente a parte dependente e continue o trabalho independente.

## 9. Processo de implementação e documentação

Para cada lote:
1. Conferir estado/branch/SHA, alterações existentes e concorrência de arquivos.
2. Definir issue/IDs/aceite e contrato. Criar branch/worktree própria.
3. Implementar a menor fatia completa, sem duplicar domínios ou somar módulos pela aparência.
4. Testar regras, banco/autorização, concorrência quando pertinente, UI e integrações por contrato.
5. Executar os checks exigidos pelo repositório: instalação limpa quando requerida, segredos, geradores de rastreabilidade/catálogo Nogle, lint, tipos, testes, build, auditoria e E2E. Usar os scripts/versões atuais; não presumir que um CI antigo valida código novo.
6. Documentar e apresentar PR com escopo, IDs, schema, evidências, limitações, riscos e retorno.
7. Atualizar matriz demo × real, status/rastreabilidade, estado de passagem e lista única de dependências. Pedir revisão do Codex pelo fluxo vigente.

Estados separados: planejado, implementado, testado em desenvolvimento, revisado, homologado e produção. Um screenshot, botão, migration aplicada ou CI verde não substitui aceite operacional.

Não encerrar issue ampla por entregar apenas sua primeira parte. Não prometer prazo fechado nem zero migrações. Preservar histórico e fazer correções compensatórias.

## 10. Publicação e aceite final

Código integrado não aparece no site até a publicação. Compare o SHA aprovado com o rodapé e `/saude`; use `deploy/homologacao/conferir-publicacao.sh` e o procedimento existente de publicação. Conferir link ativo/processo/reversão quando necessário, sem expor ambiente.

Faça programação e testes já autorizados sem novas confirmações rotineiras. Para merge/publicação, siga as decisões atuais de AGENTS/ADRs e as autorizações já concedidas. Não assuma liberação de produção ou troca da Rein a partir deste prompt.

Antes de uma aprovação realmente necessária, deixe a versão concreta, testes, impacto, migrações e retorno prontos para revisão; peça apenas a decisão faltante. Não pedir ao proprietário para aprovar algo ainda indefinido.

Após publicação autorizada, verificar:
- SHA correto;
- `/financeiro` real, menu e início;
- login e escopo por perfil;
- gráficos/tabelas/exportação batendo;
- fontes vazias/indisponíveis tratadas sem números fabricados;
- ausência de regressão nos fluxos de venda, estoque, caixa, Connect, notas e equipe.

A saída da Rein continua condicionada ao go/no-go, dados/estoque/caixa reconciliados, fiscal, Nogle aplicável, restauração e contingência.

## 11. O que entregar ao terminar cada lote

Responda objetivamente:
- entrega real e requisito atendido;
- branch, PR, SHA e versão publicada se houve publicação;
- testes e resultados, com limites;
- migrations/impacto/retorno;
- diferença visível no sistema real em relação à demo;
- pendências externas realmente bloqueadoras;
- próxima fatia executável.

**Comece agora pelo inventário breve da #65 e pela primeira implementação de gráficos financeiros reais sobre vendas e caixa. Preserve o visual aprovado e mantenha a plataforma inteira no roteiro.**

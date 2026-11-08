# Auditoria funcional — front-end, backend, migrations e Supabase

**Data:** 07/11/2026 (Brasília)
**Base do GitHub:** 56ec9dec83e291729aa58d36fda132df3a1b3655
**Ambiente consultado:** Supabase de desenvolvimento ora5g-dev, somente leitura
**Programador:** Claude Code · **Analista/revisor:** Codex
**Stack preservada:** TypeScript, React/Next.js, Tailwind, Node.js e PostgreSQL/Supabase.

## 1. Resultado principal

O projeto tem uma interface interativa ampla para apresentação, regras de domínio reutilizáveis e uma fundação real de autenticação/autorização. As operações comerciais continuam demonstrativas: não existem tabelas de produtos, clientes, vendas, pagamentos, caixa, estoque, OS, aprovações ou telecom no banco consultado.

O Supabase está saudável. Há dez tabelas públicas de acesso, três migrations lógicas aplicadas, 14 funções SQL e RLS nas dez tabelas. A estrutura examinada corresponde ao SQL versionado, mas os identificadores do histórico de migrations diferem dos arquivos do GitHub; essa pendência foi registrada na [#17 / REV-018](https://github.com/oraconect5g-boop/sistema-ora5g/issues/17).

A nova correção de desconto foi confirmada e a #13 encerrada. Persistem o erro de parâmetro na entrada (#16) e resíduos já conhecidos; foi encontrado também excesso de quantidade de acessório permitido no PDV demonstrativo (#18).

## 2. O que significa funcionar nesta auditoria

| Categoria | Evidência exigida | Situação atual |
|---|---|---|
| Interface funcional | Abre, navega, valida e responde a interações | Confirmada na build local e nos E2E; com duas falhas adicionais reproduzidas |
| Backend implementado | Código executado no servidor, com contrato e efeitos identificáveis | Auth, leitura de conta, proxy SSR, validação de ambiente e saúde; filtros da demonstração usam fixtures |
| Persistência de negócio | Operação gravada e recuperável no banco com autorização/transação | Ainda não implementada |
| Banco instalado | Objetos existentes no Supabase, não só arquivos SQL | Confirmado por consultas de metadados e contagens agregadas |
| Fluxo real homologado | Usuário autorizado completa a jornada com serviços reais | Não comprovado; Auth está sem usuários e cadastro operacional está vazio |

Não foram consultados registros pessoais individuais, valores de chaves, arquivos do servidor ou .env real. As consultas remotas foram SELECTs de metadados/contagens e um teste somente de leitura do validador de CNPJ. Não houve DDL, reparo do histórico, seed, criação de usuário, cobrança ou implantação.

## 3. Front-end existente: inventário das rotas demonstrativas

Contagem do código: **17 páginas sob /demo, incluindo a escolha de perfil**, além de entrada, conta, saúde, inicial, carregamento, erro e 404. Cinco perfis demonstrativos: dono, administrador, gerente, vendedor e técnico. O uso efetivo de login do técnico continua dependendo da decisão P5.

Todos os dados da tabela seguinte vêm de src/demo/dados e de estado local; não representam cadastros/transações do Supabase.

| Rota | Funções disponíveis na demonstração | Limite para operação real |
|---|---|---|
| /demo | Painéis por perfil, indicadores, gráficos, metas, resumo da loja e alertas | Não consulta vendas, caixa ou estoque reais |
| /demo/perfil | Troca entre os cinco perfis fictícios | Cookie de apresentação; não autentica pessoa nem concede papel real |
| /demo/vender | Busca de produto/IMEI, carrinho, cliente por busca exata/cadastro local, desconto, pedido simulado, meios mistos, confirmação e comprovante | Preço, custo, aprovação, saldo e conclusão ainda são avaliados/simulados no navegador |
| /demo/vendas | Filtros de vendas, detalhes, situações, valores e CSV | Lista fictícia; não é recuperação de vendas persistidas |
| /demo/produtos | Produtos, custos/margens autorizados na tela, histórico visual e alteração de preço com motivo | Alteração só muda o componente; não cria preço vigente/histórico no banco |
| /demo/estoque | IMEIs, movimentos de exemplo, acessórios/chips, transferências, disponibilidade e conferência | Não grava ledger, reserva, contagem, recebimento ou transferência |
| /demo/clientes | Busca exata, ficha 360, conversas, consentimentos e oportunidades ilustrativas | Não há CRM real, busca auditada no banco ou envio de mensagem |
| /demo/aprovacoes | Fila, filtros, confirmação, aprovar/negar e justificativa | Decisão local; sem aprovador real, transação ou auditoria persistente |
| /demo/connect | Operações de chip, ativação, portabilidade, recarga e estados da operadora | Não há chamadas à Nogle |
| /demo/assistencia | Lista de OS, abertura/orçamento/avanço de etapa simulados e visão do técnico | Não há custódia, OS ou orçamento persistidos nem envio ao cliente |
| /demo/metas | Produção por categoria, visão própria/equipe, metas e comparativos | Não existe ledger de performance ou apuração de comissão no banco |
| /demo/financeiro | Caixa, recebimentos, financeiras, contas e fluxo ilustrativos | Não abre/fecha caixa nem registra recebimento ou repasse real |
| /demo/relatorios | Períodos, gráficos, comparativos, tabelas e CSV | Relatórios de dados fictícios; XLSX/PDF operacional não implementados |
| /demo/canais | Visão de canais, campanhas, integrações e pendências | Não há adaptadores externos operacionais |
| /demo/lojas | Unidades, usuários, vínculos e bloquear/desbloquear visualmente | O bloqueio da tela não altera perfil/vínculo/Auth no Supabase |
| /demo/importacao | Prévia fictícia, problemas de linhas e envio/aprovação simulados | Não há parser/importador real nem aplicação transacional do CSV |
| /demo/auditoria | Linha do tempo e filtros de exemplos | Não lê nem grava public.auditoria |

Recursos compartilhados ativos: menu por grupos, seletor de loja, avisos, menu de perfil, navegação móvel, diálogo de confirmação, gráficos SVG, tabelas, exportação CSV e formatação brasileira. No componente de entrada, mostrar/esconder senha funciona; “Esqueci minha senha” abre uma explicação, sem iniciar recuperação.

A guarda APP_ENV=producao remove a demonstração, inclusive as rotas de troca de perfil/loja. O E2E existente confirmou esse comportamento.

## 4. Backend: o que já existe de verdade

A plataforma é Next.js com execução no servidor; não existe um serviço separado de API comercial nem apps/worker operacional.

| Ponto | Implementação atual | O que ainda falta |
|---|---|---|
| entrar, em /entrar/acoes.ts | Normaliza e-mail, valida presença e chama signInWithPassword; mensagens neutras e redirect | Usuário de teste autorizado e prova de entrada válida, além do fluxo completo da sessão |
| sair | Chama signOut e retorna à entrada | Prova de revogação/expiração e requisitos de sessão por turno |
| /conta | getUser; SELECT de nome/e-mail/status do próprio perfil e de unidades filtradas por RLS | Seleção real da unidade, jornada de trabalho e tratamento homologado de bloqueio/expiração |
| clienteSupabaseServidor | Cliente SSR com chave pública e cookies do usuário | Tipos Database gerados e testes de falha/renovação com a aplicação real |
| proxy.ts | getClaims antes de /conta, propagação de cookies e cabeçalhos anti-cache | Teste de renovação após expiração com usuário real |
| configuracaoSupabase | Valida URL/chave pública, rejeita chave privilegiada e configuração parcial | Compatibilidade dos guias/comandos antigos e configuração por consumidor futuro |
| conferirConexaoSupabase | GET de /auth/v1/health com timeout e no-store | Não comprova consulta SQL, políticas, usuários ou jornada comercial |
| / e /saude | Renderização dinâmica, versão/horário e indicação de conexão | Não equivalem a verificação transacional de todos os módulos |
| GET /demo/perfil/usar e /demo/loja/usar | Trocam cookies da demonstração, validando valores/retorno | Usar sessão e vínculos reais no produto; não transformar cookies fictícios em autorização |
| src/demo/consultas.ts | Filtra fixtures por perfil/loja e calcula agregações antes de renderizar | Substituir origem por consultas reais autorizadas, preservando os contratos de visibilidade |

A busca no código encontrou somente duas consultas de tabelas de negócio/acesso pelo SDK: perfis_usuario e unidades, ambas em /conta. Não há insert/update de operação comercial, RPC de seleção de unidade chamado pela aplicação, recuperação de senha, upload de anexo, assinatura Realtime ou integração de pagamentos/fiscal/Nogle.

### Regras de domínio reutilizáveis

packages/dominio contém 22 funções públicas, incluindo helpers em forma de arrow function:

- Dinheiro: exigirCentavos, centavos, somarCentavos, multiplicarCentavos, lerReais, formatarBRL, pb, exigirPontosBase e aplicarPercentual.
- Identificação: imeiValido, iccidValido, mascararIdentificador, completarComDigitoVerificador, cpfValido e normalizarTelefone.
- Venda: validarItem, totalDoItem, totaisDaVenda e producaoDaVenda.
- Desconto: limiteDeDesconto e avaliarDesconto.
- Pagamento: conferirPagamentos.

São regras reais e testadas em TypeScript; usá-las na UI não cria endpoint autorizado nem grava transação. O cálculo do produto real deverá ocorrer no servidor. O resíduo de arredondamento da #10 em valores muito altos continua no domínio inalterado.

## 5. Banco remoto confirmado

Projeto de desenvolvimento esperado, status ACTIVE_HEALTHY, PostgreSQL 17.11. A contagem foi agregada; não foram lidos nomes/e-mails de pessoas.

| Tabela | Função | Registros na consulta |
|---|---|---:|
| organizacoes | Rede/tenant | 0 |
| empresas | Empresa e CNPJ raiz | 0 |
| unidades | Filiais, online, assistência e depósito | 0 |
| perfis_usuario | Perfil ligado ao usuário Auth | 0 |
| papeis | Dono, administrador, gerente, vendedor, técnico | 5 |
| permissoes | Catálogo de permissões | 31 |
| papel_permissoes | Relação papel × permissão | 69 |
| vinculos | Pessoa, organização, papel, unidade e vigência | 0 |
| contexto_sessao | Unidade escolhida na sessão | 0 |
| auditoria | Eventos imutáveis | 0 |

Auth: **zero usuários e zero sessões** na consulta. Portanto, o projeto consultado ainda não dispõe de um usuário que permita demonstrar entrada válida + perfil + unidade. O sucesso de uma recusa de senha não comprova essa jornada.

Não existem tabelas de catálogo, estoque/IMEI, clientes, vendas/itens, pagamentos/caixa, aprovações, fiscal, OS, comissões, telecom ou canais. numeric(14,2) é a decisão para valores futuros, não uma coluna monetária operacional já criada neste esquema.

### Controles instalados

- Dez tabelas com RLS habilitada e dez políticas SELECT.
- authenticated tem SELECT nessas tabelas; não há INSERT/UPDATE/DELETE direto concedido a esse papel nos grants examinados.
- anon não tem grants de tabela; não pode executar as três funções públicas e não tem USAGE no esquema privado.
- 29 índices, cinco gatilhos, 51 constraints comparáveis e 68 colunas.
- Validação de CNPJ e coerência de empresa/unidade/vínculo; vigência/status participam dos filtros.
- Auditoria rejeita update/delete/truncate; o gatilho completa/verifica a organização do evento.
- Ainda faltam gatilhos de auditoria de alterações em perfis, papéis e vínculos. Regras de autoaprovação, busca de cliente e isolamento de OS ainda dependem das respectivas tabelas.

Os quatro TODOs de teste deixam isso explícito: T4 autoaprovação do vendedor, T5 autoaprovação do dono, T11 busca exata de cliente e T12 OS do técnico. Não são quatro testes aprovados.

## 6. Funções SQL instaladas

As três funções públicas são SECURITY DEFINER com search_path vazio e execução limitada a authenticated; o conteúdo foi comparado ao GitHub.

| Função | Papel na fundação |
|---|---|
| public.selecionar_unidade(uuid) | Valida UID/sessão/unidade permitida, grava contexto e eventos de seleção/negação |
| public.unidade_atual() | Retorna unidade do contexto válido do usuário |
| public.tem_permissao(text,uuid) | Avalia permissão e escopo da organização/unidade |
| privado.usuario_ativo() | Verifica perfil ativo |
| privado.vinculos_vigentes() | Filtra vínculo, papel, organização e unidade vigentes/ativos |
| privado.unidades_visiveis() | Calcula unidades autorizadas |
| privado.sessao_atual() | Extrai session_id das claims |
| privado.organizacoes_com_permissao(text) | Calcula organizações gerenciáveis para a permissão |
| privado.perfis_que_gero() | Restringe perfis à organização gerida |
| privado.cnpj_valido(text) | Valida formato e dígitos do CNPJ |
| privado.validar_unidade() | Gatilho de coerência entre empresa, unidade e emissora |
| privado.validar_vinculo() | Gatilho de papel/escopo/unidade e encerramento |
| privado.auditoria_imutavel() | Impede alteração/exclusão/truncate da auditoria |
| privado.auditoria_completar_organizacao() | Associa evento à organização da unidade e rejeita contradição |

O teste remoto somente de leitura de cnpj_valido recusou zeros/dígitos repetidos e aceitou um exemplo sintético com dígitos verificadores corretos. Não foi invocada selecionar_unidade nem qualquer rotina remota com gravação.

## 7. Migrations: conteúdo consistente, versões divergentes

| Finalidade | Arquivo GitHub | Histórico aplicado no Supabase |
|---|---|---|
| Fundação de acesso | 20261107120000_fundacao_acesso.sql | 20261107140352 — fundacao_acesso |
| Índices de chaves estrangeiras | 20261107130000_indices_chaves_estrangeiras.sql | 20261107140448 — indices_chaves_estrangeiras |
| Correções de isolamento/vínculos | 20261107140000_correcoes_revisao_codex.sql | 20261107151305 — correcoes_revisao_codex |

Comparação independente: criei banco descartável local com as três migrations, sem alterar o Supabase, e comparei com os metadados remotos.

| Objeto examinado | Comparação |
|---|---|
| 14 funções: assinatura, hash do corpo, SECURITY DEFINER, volatilidade, search_path | Correspondem |
| 68 colunas: tipo, nulabilidade, default e identidade | Correspondem |
| 51 constraints comparáveis | Correspondem |
| 29 índices | Correspondem |
| Cinco gatilhos | Correspondem |
| Dez grants de tabela anon/authenticated | Correspondem |

O PGlite local é PostgreSQL 18.6; o remoto é 17.11. Na comparação de constraints, foram desconsideradas as entradas internas separadas de NOT NULL da versão 18; a nulabilidade foi comparada pelas 68 colunas. Não é certificação de comportamento idêntico entre todas as versões ou serviços Auth.

**Achado REV-018 / #17:** os timestamps divergentes impedem tratar os dois históricos como sincronizados. A documentação da CLI explica que db push compara o histórico aplicado por versão. Não executei push para provocar falha, repair ou reset. O próximo passo é um procedimento revisado de conciliação, preservando o esquema/dados e evitando reaplicar CREATEs.

Fonte: [gestão e correção de histórico de migrations](https://supabase.com/docs/guides/deployment/database-migrations#diagnosing-and-fixing-sync-errors).

## 8. Supabase: serviços e diagnósticos

| Produto/capacidade | Estado observado |
|---|---|
| Database | Projeto saudável, fundação instalada; cadastro operacional vazio |
| Auth | Integração por senha/SSR no código; zero usuários/sessões no projeto consultado |
| Storage | Nenhum bucket configurado |
| Edge Functions | Nenhuma função implantada |
| Realtime | Nenhuma tabela pública/privada do aplicativo na publicação supabase_realtime |
| Cron, Queues e Vector | pg_cron, pgmq e vector ausentes da lista de extensões consultada |
| SMTP do Auth, URLs de retorno, política de senha e recuperação | Não foram inspecionados por esta auditoria; o fluxo de recuperação não existe no app |
| Produção | Não foi auditada; não confundir o projeto de dev com o ambiente produtivo |

Advisors consultados:

- **Health:** nenhum aviso.
- **Security:** três WARN de SECURITY DEFINER executáveis por authenticated, correspondentes às três RPCs públicas intencionais. Os corpos, guardas e grants foram examinados; não equivale a prova de exploração nem justifica trocar tudo para SECURITY INVOKER automaticamente. [Orientação do aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- **Performance:** 12 índices ainda não utilizados. O cadastro está vazio e não há carga operacional; não há fundamento nesta amostra para remover índices de FK/RLS/auditoria. [Orientação do aviso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## 9. Defeitos e situações atualizados

| Item | Estado nesta auditoria |
|---|---|
| REV-015 / #13 — desconto inválido derrubava PDV | Corrigido e confirmado nos dois viewports, com erro no campo, carrinho preservado e recuperação; issue encerrada |
| REV-017 / #16 — parâmetro herdado no login | Continua: /entrar?erro=__proto__ produz 500. O catálogo ERROS ainda usa leitura sem chave própria |
| REV-018 / #17 — controle das migrations | Novo: versões locais/remotas divergentes, apesar de os objetos examinados corresponderem |
| REV-019 / #18 — quantidade acima do saldo | Novo: com N unidades de acessório exibidas, o carrinho aceita N+1 e mantém Conferir e concluir venda habilitado |
| REV-008 / #10 | Resíduo de arredondamento em valores muito altos continua pendente |
| REV-009 / #11 | Refresh estrutural implementado; expiração/renovação/revogação real continuam sem prova com usuário autorizado |
| REV-016 / #14 | Script de publicação inalterado: reaproveitar mesmo SHA ainda pula atualização do ambiente |
| CONFIG-001 / #12 | Grupos público/servidor, modelo mínimo e guia já estão na main; compatibilidade de referências antigas continua pendente |
| REV-014 | Tratamento de falha de consulta implementado por inspeção; ainda falta teste que force erro do serviço |

### Quantidade de acessório acima do saldo

Reprodução local independente: vendedor → Capa de proteção → ler N na busca → adicionar → aumentar até N+1 → escolher Dinheiro. O botão de conclusão continuou habilitado. As rotinas de incremento e a validação do carrinho não comparam a quantidade com dados.saldos.

P2 na demonstração; não houve persistência, cobrança ou prejuízo real. Bloquear/explicar a quantidade inválida na UI e cobrir zero, uma unidade, limite exato e acima do limite. O produto real continuará exigindo revalidação e reserva transacional no servidor, inclusive sob concorrência.

## 10. Limites a respeitar na transição para dados reais

- DadosPdv atualmente envia produtos com custo, políticas e uma lista de clientes fictícios ao navegador. O vendedor não vê a margem na tela, mas isso não é proteção para dados reais. Criar busca exata autenticada/auditada e respostas por permissão; calcular limite de desconto no servidor.
- Não trocar fixtures por SELECTs em massa mantendo a mesma exposição. Retornar só os campos necessários ao perfil e à ação autorizada.
- Cookie de perfil/loja da demonstração não substitui usuário Auth, vínculo vigente e contexto real.
- Aprovar, bloquear, alterar preço, cadastrar cliente, abrir OS e emitir nota não podem continuar sendo apenas setState quando forem apresentados como operação real.
- Autoaprovação não tem garantia SQL instalada enquanto não houver tabela/ação de aprovação. A frase da tela sobre ninguém aprovar o próprio pedido deve representar essa regra como prevista.
- Gerar e usar tipos Database do Supabase antes de ampliar consultas reais; o cliente SSR atual não declara o genérico de schema.
- Implementar por módulo com transação, auditoria, idempotência, falhas recuperáveis e testes de autorização. Preservar componentes e regras TypeScript reutilizáveis.

## 11. Evidência executada

| Verificação | Resultado |
|---|---|
| CI da main 56ec9de | Sucesso no run [42407927190](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42407927190); job completo sem falhas |
| Testes locais existentes | 210 aprovados: aplicação 52, banco 44, configuração 42, domínio 72; quatro TODO no banco |
| E2E local, sem credenciais reais | 63 aprovados, nove pulados; a entrega declarada pelo Claude tem outra configuração de execução e não foi tomada como contagem local |
| Motivo dos nove pulados | Cinco duplicações/recortes de viewport e quatro casos dependentes do par público (dois de recusa de credenciais e dois de visibilidade da senha) |
| Visibilidade da senha | Os dois casos passaram em execução separada com URL/chave fictícias válidas só em formato; sem autenticação real |
| Casos adversariais adicionais | Dois falharam reproduzindo #16 e #18; removidos da árvore do produto após registrar evidência |
| Lint, tipos e build | Passaram; avisos conhecidos de pages em pacotes sem Next não reprovaram o comando |
| Supabase remoto | Metadados, policies, grants, índices, gatilhos, migrations, contagens agregadas e advisors consultados somente em leitura |
| Leitura HTTP pública normal | /demo e /demo/produtos responderam 200; /saude respondeu 200 e indicou conectado |

Os GETs públicos não identificam o commit implantado nem provam transação SQL ou login. Não foram enviados parâmetros de falha, formulários ou credenciais ao site público.

Os testes locais de RLS usam Auth simulado no PGlite; os metadados reais foram comparados, mas não houve teste com tokens de pessoas reais. A consulta do histórico remoto não fazia parte dos testes anteriores do CI, o que explica por que a divergência de versões não aparece no resultado verde.

## 12. Sequência recomendada

1. Conciliar o controle de migrations por procedimento revisado; corrigir #16 e #18 e os resíduos conhecidos.
2. Inicializar, no processo autorizado do programador/proprietário, organização/filial e usuário de teste com perfil/vínculo, sem dados reais no Git.
3. Concluir ORA-006 e auditoria automática de acesso, com provas reais de sessão, seleção de unidade, bloqueio e recuperação.
4. Aceitar ADR-003; implementar catálogo → importação CSV Rein → estoque/IMEI concorrente.
5. Conectar a primeira jornada comercial às telas existentes: preço/estoque/permissão no servidor, pagamentos/caixa e aprovações com persistência.
6. Completar módulos e homologar o piloto conforme o plano completo; não tratar presença de tela como aceite operacional.

Esta auditoria altera apenas a documentação de revisão. A correção de aplicação e banco continua com o Claude, com revisão do Codex, na mesma linguagem e arquitetura.

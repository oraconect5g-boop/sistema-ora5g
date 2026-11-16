# Arquivo de fontes do GitHub

Coleção de corpos e comentários obtidos na coleta de 10/11/2026. São fontes históricas e não ordens novas: decisões atuais e o PROMPT_MESTRE prevalecem. Dados potencialmente sensíveis foram suprimidos; comandos históricos com marcações não devem ser executados literalmente. As URLs originais e hashes preservam a referência.

## PR #1 — feat(ORA-002): esqueleto do monorepo com a página /saude

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/1
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Resumo, issues e requisitos
ORA-002: esqueleto do monorepo com `apps/plataforma` (Next.js), `packages/config` (TypeScript estrito e ESLint), Vitest, Playwright, versões fixadas e a página `/saude`. Prepara ORA-QUAL-001 (CI vem no ORA-003).

## Contratos / arquivos alterados
Só arquivos novos, mais 2 linhas no `.gitignore`. A rota `/saude` mostra serviço, versão e horário e avisa que confere só o aplicativo.

Versões: Next 16.4.5, React 19.3.1, TypeScript 6.0.3, ESLint 9.39.5, Vitest 5.1.0, Playwright 1.65.0, `@types/node` 22.20.5.

## Migrations, banco e autorização (RLS/RBAC)
Nenhuma. `/saude` é pública e não lê banco nem variáveis de ambiente.

## Evidência de testes reais executados
Rodados no servidor, Node 22.23.4, após apagar `node_modules` e `.next`:
- `npm ci`, `lint`, `typecheck`, `build`: sucesso
- `npm test`: 4 de 4
- `npm run test:e2e`: 10 de 10 (5 testes em 360 px e em 1280 px)
- Teste do teste: sem `force-dynamic`, a rota vira estática e o E2E de horário reprova
- Com `next start`, a porta escuta só em `[IP omitido]:3100`; o IP público não responde nela

Ainda não há CI: nada disso rodou no GitHub (ORA-003).

## Fluxos de falha / retry / rollback / compliance
Rollback: reverter o commit. Sem dados nem efeitos externos.

## Capturas de telas (se UI) — sem dados de clientes
Não incluídas; o E2E confere a página nas duas larguras.

## Verificação de segurança, credenciais e LGPD
Sem segredos nem dados pessoais. `npm audit --omit=dev`: 0 vulnerabilidades. Na instalação completa há 8 alertas moderados (`minimatch`, via `eslint-config-next`), só em ferramenta de lint; o "fix" do npm rebaixaria para `eslint-config-next` 15, então não foi aplicado.

## Revisão por agente independente
Codex. Pontos para olhar:
1. ESLint 9.39.5 aparece como sem suporte, mas `eslint-plugin-react`, `jsx-a11y` e `import` não aceitam ESLint 10.
2. TypeScript 6.0.3, porque `typescript-eslint` exige `<6.1.0` (a última é a 7).
3. Tailwind e Zod ficaram de fora até a primeira tarefa que os usar.
4. A porta 3100 é a da homologação no ADR-001; o E2E falhará se a homologação estiver no ar na mesma máquina.
5. Branch criada a partir da `main`: os ADRs citados estão em `docs/adr-002-acesso`, ainda sem merge.
6. O plano atribuía o ORA-002 ao Codex; vale a decisão de papéis fixos (Claude programa, Codex revisa).

## Aceite humano requerido?
Sim, aprovação do proprietário para o merge.

## Plano de implantação, feature flag e observabilidade
Sem implantação neste PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


---

## Issue #2 — [REV-001][P1] Restringir leitura de perfis à organização administrada

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/2
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Problema comprovado
A política `perfis_ler` autoriza qualquer linha de `perfis_usuario` quando `tem_permissao('usuarios.gerir')` é verdadeira, sem correlacionar o perfil alvo com as organizações administradas pelo solicitante.

Fonte: [migration, linhas 446–450](https://github.com/oraconect5g-boop/sistema-ora5g/blob/17524a5da68815e61b4c1eacd85b519b118969bf/packages/banco/supabase/migrations/20261107120000_fundacao_acesso.sql#L446).

## Reprodução
Usar `criarBanco`, `montarCenario` e `comoUsuario` já existentes. Como `ids.administrador` da organização A, consultar `perfis_usuario` filtrando `ids.donoOutraOrg`. A consulta devolve o ID e o e-mail fictício da organização B; deveria devolver zero linhas. Um segundo teste também mostrou enumeração de um perfil sem vínculo.

## Impacto e prioridade
P1: quebra de isolamento e exposição de dados pessoais quando há organizações distintas no mesmo banco. O projeto relata uma organização operacional hoje; a reprodução usa as duas organizações fictícias dos testes. Não é evidência de vazamento em produção.

## Escopo e rastreabilidade
ORA-004/005; ORA-ORG-004; ORA-QUAL-002; ADR-002 §2.5. Correção na política/função de leitura, preservando leitura do próprio perfil e gestão autorizada. Definir explicitamente o acesso a convidados/usuários sem vínculo; não resolver liberando todos os perfis.

## Aceite
- [ ] Administrador e dono de A não leem perfis exclusivos de B.
- [ ] Administrador e dono de A leem os perfis que legitimamente administram em A.
- [ ] Usuário comum continua limitado ao próprio perfil; usuário bloqueado não ganha acesso.
- [ ] Usuários sem vínculo têm regra explícita, sem enumeração global.
- [ ] Testes positivos e negativos adicionados à suíte e executados no CI.

## Alinhamento obrigatório
- Implementação: Claude Code. Análise e revisão: Codex. Preservar Next.js/React/TypeScript/Node.js e SQL PostgreSQL/Supabase.
- Alterar o banco por nova migration SQL, sem reescrever migrations já aplicadas nem apagar a auditoria.
- Trabalhar em branch, apresentar evidências e rodar os checks pertinentes. Nenhuma autorização de implantação ou de acesso a segredos é dada por esta issue.
- Origem: revisão da `main` no commit `17524a5`, em 07/11/2026; reproduções locais com dados fictícios, sem acesso ao servidor ou ao banco real.


---

## Issue #3 — [REV-002][P1] Isolar por organização os eventos de auditoria sem unidade

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/3
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Problema comprovado
A política `auditoria_ler` libera registros com `unidade_id is null` para quem tenha `auditoria.ver` em qualquer organização. A tabela não registra `organizacao_id`, portanto não consegue correlacionar esses eventos à organização correta.

Fonte: [migration, linhas 472–480](https://github.com/oraconect5g-boop/sistema-ora5g/blob/17524a5da68815e61b4c1eacd85b519b118969bf/packages/banco/supabase/migrations/20261107120000_fundacao_acesso.sql#L472).

## Reprodução
Com o cenário existente, como `ids.donoOutraOrg` e uma sessão fictícia, chamar `selecionar_unidade(null)`. A função grava `sessao.unidade_negada` com unidade nula. Como `ids.administrador` de A, consultar a auditoria desse usuário de B: a linha fica visível.

## Impacto e prioridade
P1: registros potencialmente contendo ator, dados anteriores/posteriores e motivos ficam sem isolamento organizacional. Reprodução em duas organizações fictícias; não houve consulta a dados reais.

## Escopo e rastreabilidade
ORA-004/005; ORA-ORG-004/005; ORA-QUAL-002/003; ADR-002. Definir a propriedade organizacional do evento na gravação, inclusive tentativas recusadas e eventos de sistema. Não confiar apenas no alvo arbitrário enviado pelo cliente para definir quem pode ler o registro.

## Aceite
- [ ] Eventos de A e B, com e sem unidade, respeitam a organização do evento.
- [ ] Gerente continua limitado à unidade autorizada.
- [ ] Eventos históricos sem organização identificável não viram leitura global.
- [ ] Auditoria continua imutável; preservar evidências históricas.
- [ ] Testes reproduzem a chamada pública descrita e a negação da leitura cruzada.

## Alinhamento obrigatório
- Implementação: Claude Code. Análise e revisão: Codex. Preservar Next.js/React/TypeScript/Node.js e SQL PostgreSQL/Supabase.
- Alterar o banco por nova migration SQL, sem reescrever migrations já aplicadas nem apagar a auditoria.
- Trabalhar em branch, apresentar evidências e rodar os checks pertinentes. Nenhuma autorização de implantação ou de acesso a segredos é dada por esta issue.
- Origem: revisão da `main` no commit `17524a5`, em 07/11/2026; reproduções locais com dados fictícios, sem acesso ao servidor ou ao banco real.


---

## Issue #4 — [REV-003][P2] Verificar histórico de segredos também nos pushes da main

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/4
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Problema comprovado
A etapa histórica do CI tem condição exclusiva para `pull_request`. No fluxo vigente, Claude integra commits na `main`; o CI por `push` verifica apenas o estado final dos arquivos.

Fonte: [ci.yml, linhas 35–39](https://github.com/oraconect5g-boop/sistema-ora5g/blob/17524a5da68815e61b4c1eacd85b519b118969bf/.github/workflows/ci.yml#L35). Na [execução 42380089530](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42380089530), a etapa "Procurar segredos nos commits do PR" está `skipped`.

## Reprodução
Em repositório local descartável: adicionar um token inteiramente fictício em um commit e removê-lo no seguinte. A varredura dos arquivos finais informa "Nenhum segredo encontrado"; a varredura do intervalo histórico encontra o token. Nenhuma credencial real foi usada.

## Impacto e rastreabilidade
P2; ORA-003; ORA-QUAL-004; decisão de merges de 07/11/2026. Um segredo removido antes do push continua no histórico. O CI atua após o envio; detecção não impede que o segredo já enviado tenha sido exposto e não substitui rotação de credenciais quando necessário.

## Aceite
- [ ] Eventos de PR e push na main examinam os commits relevantes, além do estado final.
- [ ] Intervalos iniciais/sem commit anterior e commits de merge têm tratamento definido.
- [ ] Teste de adicionar/remover segredo fictício falha na checagem esperada.
- [ ] Logs mostram apenas arquivo, linha e regra, sem valores.
- [ ] Preservar o fluxo de merges aprovado, sem impor uma mudança silenciosa de processo.

## Alinhamento obrigatório
- Implementação: Claude Code. Análise e revisão: Codex. Preservar Next.js/React/TypeScript/Node.js e SQL PostgreSQL/Supabase.
- Alterar o banco por nova migration SQL, sem reescrever migrations já aplicadas nem apagar a auditoria.
- Trabalhar em branch, apresentar evidências e rodar os checks pertinentes. Nenhuma autorização de implantação ou de acesso a segredos é dada por esta issue.
- Origem: revisão da `main` no commit `17524a5`, em 07/11/2026; reproduções locais com dados fictícios, sem acesso ao servidor ou ao banco real.


---

## Issue #5 — [REV-004][P2] Rejeitar credencial privilegiada legada no campo público do Supabase

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/5
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Problema comprovado
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` rejeita somente valores iniciados por `sb_secret_`. Um JWT fictício com claim `role: service_role` foi aceito pelo validador, pois ele não tem esse prefixo. Uma chave privilegiada legada válida também não seria barrada por esta regra.

Fonte: [ambiente.ts, linhas 27–30](https://github.com/oraconect5g-boop/sistema-ora5g/blob/17524a5da68815e61b4c1eacd85b519b118969bf/packages/config/src/ambiente.ts#L27).

## Impacto e limites
P2, preventivo antes de ORA-006: uma configuração errada poderá enviar credencial privilegiada ao navegador quando o cliente Supabase for implementado. Na versão analisada, esse cliente ainda não existe; não foi demonstrada exposição real de chave. O teste usa somente dados fictícios e não comprova autenticação de um JWT sem assinatura válida.

## Rastreabilidade
ORA-003/006; ORA-QUAL-004; ADR-002 §2.5; `.env.example` e documento de variáveis.

## Aceite
- [ ] Aceitar explicitamente o formato de chave pública escolhido pelo projeto.
- [ ] Rejeitar chaves secretas novas e credenciais privilegiadas legadas.
- [ ] Se houver necessidade de chave anon legada, documentar a compatibilidade e distinguir os papéis sem tratar decodificação como verificação de autenticidade.
- [ ] Testes positivos/negativos usam valores fictícios e não imprimem valores.
- [ ] Manter validação no servidor e impedir importação de segredos em módulos do cliente.

## Alinhamento obrigatório
- Implementação: Claude Code. Análise e revisão: Codex. Preservar Next.js/React/TypeScript/Node.js e SQL PostgreSQL/Supabase.
- Alterar o banco por nova migration SQL, sem reescrever migrations já aplicadas nem apagar a auditoria.
- Trabalhar em branch, apresentar evidências e rodar os checks pertinentes. Nenhuma autorização de implantação ou de acesso a segredos é dada por esta issue.
- Origem: revisão da `main` no commit `17524a5`, em 07/11/2026; reproduções locais com dados fictícios, sem acesso ao servidor ou ao banco real.


---

## Issue #6 — [REV-005][P2] Permitir encerrar vínculo de um papel desativado

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/6
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Problema comprovado
`validar_vinculo` exige que o papel esteja ativo em qualquer INSERT ou UPDATE, inclusive uma atualização que apenas encerra o vínculo preenchendo `fim`.

Fonte: [migration, linhas 214–216](https://github.com/oraconect5g-boop/sistema-ora5g/blob/17524a5da68815e61b4c1eacd85b519b118969bf/packages/banco/supabase/migrations/20261107120000_fundacao_acesso.sql#L214).

## Reprodução
No banco de teste: desativar `papeis.ativo` para `vendedor`; em seguida atualizar `vinculos.fim = now()` para `ids.vendedorA`. A atualização é rejeitada com código `23514`, "Papel inexistente ou inativo".

## Impacto e rastreabilidade
P2; ORA-ORG-002/005; ORA-004/005; ADR-002. Impede encerrar vínculos antigos durante manutenção de um papel, embora o encerramento seja o mecanismo previsto para desativação sem exclusão. Não há evidência de concessão imediata de acesso pelo papel inativo.

## Aceite
- [ ] Encerrar vínculo existente funciona com o papel inativo, sem reativá-lo.
- [ ] Criar ou reabrir vínculo para papel inativo continua negado.
- [ ] Continuam válidas as regras de escopo, organização e vigência.
- [ ] Testar que reativar o papel não reativa um vínculo corretamente encerrado.
- [ ] Tratar por nova migration e registrar a alteração.

## Alinhamento obrigatório
- Implementação: Claude Code. Análise e revisão: Codex. Preservar Next.js/React/TypeScript/Node.js e SQL PostgreSQL/Supabase.
- Alterar o banco por nova migration SQL, sem reescrever migrations já aplicadas nem apagar a auditoria.
- Trabalhar em branch, apresentar evidências e rodar os checks pertinentes. Nenhuma autorização de implantação ou de acesso a segredos é dada por esta issue.
- Origem: revisão da `main` no commit `17524a5`, em 07/11/2026; reproduções locais com dados fictícios, sem acesso ao servidor ou ao banco real.


---

## Issue #7 — [REV-006][P3] Incluir organização na unicidade dos vínculos organizacionais

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/7
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Limitação comprovada para expansão
O índice `vinculos_um_aberto` usa usuário, papel e unidade, substituindo unidade nula por um UUID fixo. Como não inclui `organizacao_id`, o mesmo usuário não pode ter o papel de dono ou administrador em duas organizações distintas.

Fonte: [migration, linhas 144–146](https://github.com/oraconect5g-boop/sistema-ora5g/blob/17524a5da68815e61b4c1eacd85b519b118969bf/packages/banco/supabase/migrations/20261107120000_fundacao_acesso.sql#L144).

## Reprodução
Usar o dono de A do cenário existente e inserir um vínculo de `dono`, com escopo `organizacao`, para B. O banco rejeita com `23505` em `vinculos_um_aberto`.

## Prioridade e rastreabilidade
P3: limitação de expansão, não bloqueia o piloto atual com uma organização. ORA-ORG-002/010; ADR-002 §2.1. As 14 lojas da Ora são unidades da mesma organização, portanto não confundir este problema com impossibilidade de operar nas 14 lojas.

## Aceite
- [ ] O mesmo usuário pode ter o mesmo papel organizacional em A e B quando autorizado.
- [ ] Duplicatas dentro da mesma organização continuam negadas.
- [ ] Vínculos por unidade continuam preservando a unicidade pretendida.
- [ ] A permissão em A não concede acesso a B sem vínculo próprio.
- [ ] Correção por nova migration, com teste de expansão e sem alterar a stack.

## Alinhamento obrigatório
- Implementação: Claude Code. Análise e revisão: Codex. Preservar Next.js/React/TypeScript/Node.js e SQL PostgreSQL/Supabase.
- Alterar o banco por nova migration SQL, sem reescrever migrations já aplicadas nem apagar a auditoria.
- Trabalhar em branch, apresentar evidências e rodar os checks pertinentes. Nenhuma autorização de implantação ou de acesso a segredos é dada por esta issue.
- Origem: revisão da `main` no commit `17524a5`, em 07/11/2026; reproduções locais com dados fictícios, sem acesso ao servidor ou ao banco real.


---

## PR #8 — docs: análise de sistemas, aderência ao escopo e andamento da Ora 5G

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/8
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

A Ora 5G mantém TypeScript, React/Next.js, Node.js e SQL PostgreSQL/Supabase. O relatório compara código, escopo integral, ADRs e marcos de seis meses; distingue operação real, regras compartilhadas, demonstração e dependências ainda abertas.

A main avançou durante a revisão. O documento preserva a fotografia inicial em `17524a5` e atualiza o estado em sua seção 15 para `a152516d`, que já inclui login parcial, demonstração, domínio e scripts de homologação.

## Conteúdo
- `docs/analises/ANALISE_SISTEMAS_2026-11-07.md`: análise completa, acertos, pendências, riscos, cronograma e evidências.
- `docs/alinhamento/REVISOES_CODEX.md`: registro no caminho solicitado pelo Claude e pelas instruções atuais dos agentes, com 14 achados, requisito, arquivo/linha, gravidade e correção esperada.

## Acompanhamento
Issues #2–#7: isolamento de perfis/auditoria, histórico de segredos, configuração pública, encerramento de vínculos e expansão. Issues #9–#11: leitura de valores monetários, validação de centavos e renovação da sessão SSR. Os demais achados estão detalhados em REVISOES_CODEX.

As issues permanecem abertas. As correções voltam ao Claude; Codex analisa e revisa. A análise não autoriza troca de linguagem, mudança silenciosa do escopo ou publicação.

## Validação
Base complementar `a152516d`, executada localmente: instalação limpa, scanner de arquivos, lint, tipos, build, rastreabilidade gerada e auditoria de produção passaram; 110 testes passaram, 4 todo; 28 E2E passaram, 4 pulados. Os testes pulados e os limites da sessão real estão explícitos nos documentos.

Testes adversariais adicionais reproduzem erros de isolamento, dinheiro e cookie demonstrativo. Os casos temporários não foram integrados como testes vermelhos ao produto. Os scripts de homologação foram inspecionados e passaram em bash -n; não houve acesso à VPS, banco real, segredos ou implantação.

Links relativos da documentação conferidos. CI da main analisada: https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42383556054.

## Escopo e risco
Somente dois documentos novos. Preserva código de aplicação, SQL, dependências, stack e infraestrutura existentes. A árvore incorpora a main analisada para não perder os commits concorrentes. Nenhum merge na main ou deploy realizado. Reversão: remover os documentos.


---

## Issue #9 — [REV-007][P1] Corrigir leitura de reais com milhares sem casas decimais

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/9
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Defeito comprovado
`lerReais('1.000')` devolve 100 centavos (R$ 1,00), em vez de 100000 (R$ 1.000,00). `lerReais('1.000.000')` também devolve 100. A expressão regular aceita os grupos de milhares, mas a normalização só remove os pontos se houver vírgula.

[dinheiro.ts, linhas 14–19](https://github.com/oraconect5g-boop/sistema-ora5g/blob/a152516dd2651ea403d7bd158d4cc3a4fe14a6cb/packages/dominio/src/dinheiro.ts#L14). A função é usada no PDV demonstrativo para pagamentos e descontos. A demonstração não movimenta dinheiro real, mas o pacote é previsto para os módulos reais.

## Impacto e rastreabilidade
P1; ORA-POS-005/007, ORA-PAY-002, DEC-U38/41. A interpretação monetária é incorreta por fator 1000 ou maior. Corrigir na regra compartilhada antes de reutilizá-la na operação real.

## Aceite
- [ ] Testes para 1.000, 1.000.000, 1.000,00, 1299.90, R$ 79 e formatos inválidos.
- [ ] Definir formatos aceitos e tratar ambiguidades sem perda silenciosa de dígitos.
- [ ] Resultado sempre em centavos inteiros seguros; incluir limites extremos.
- [ ] Regressão no PDV para digitação com separador de milhares.
- [ ] Suíte existente continua verde.

Implementador: Claude Code. Analista/revisor: Codex. Preservar TypeScript, React/Next.js, Node.js e SQL PostgreSQL/Supabase. Base: `a152516d`, 07/11/2026. Reprodução local com dados fictícios; sem alteração do produto ou acesso ao servidor/banco real.

---

## Issue #10 — [REV-008][P1] Validar integralidade e limites monetários nas regras de domínio

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/10
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Defeitos comprovados
1. `conferirPagamentos(100000, [{meio:'aiva', valor:100000, entrada:0.5}])` retorna válido e divide os valores em frações de centavo.
2. `validarItem` aceita desconto negativo (preço 1000, desconto -500), o que aumenta o total, sem apontar erro.
3. `validarItem` aceita preço NaN sem erro.
4. `lerReais('9007199254740991,99')` não rejeita o resultado fora da faixa segura de inteiros do JavaScript.

Fontes: [pagamento.ts, linhas 41–48](https://github.com/oraconect5g-boop/sistema-ora5g/blob/a152516dd2651ea403d7bd158d4cc3a4fe14a6cb/packages/dominio/src/pagamento.ts#L41), [venda.ts, linhas 33–43](https://github.com/oraconect5g-boop/sistema-ora5g/blob/a152516dd2651ea403d7bd158d4cc3a4fe14a6cb/packages/dominio/src/venda.ts#L33), [dinheiro.ts, linha 19](https://github.com/oraconect5g-boop/sistema-ora5g/blob/a152516dd2651ea403d7bd158d4cc3a4fe14a6cb/packages/dominio/src/dinheiro.ts#L19).

## Impacto e limites
P1; ORA-POS-005/007, ORA-PAY-002, QUAL-012; regra de dinheiro em centavos. A tipagem `Centavos = number` não valida entrada em runtime, e o helper de validação não é imposto pelos pontos públicos. Os módulos persistentes ainda não existem: não é prova de prejuízo real.

## Aceite
- [ ] Todas as entradas monetárias aceitam somente inteiros seguros e os sinais permitidos pela operação.
- [ ] Rejeitar frações de centavo, NaN, infinitos e excesso de faixa, inclusive após soma/multiplicação.
- [ ] Desconto negativo/inválido é recusado antes de calcular o total.
- [ ] Entrada de financeira é inteira, não negativa e não excede o valor financiado.
- [ ] Testes de borda e combinações mistas preservam as regras aprovadas.
- [ ] Manter números em centavos na aplicação e a stack atual; não mudar linguagem para resolver validação.

Implementador: Claude Code. Analista/revisor: Codex. Preservar TypeScript, React/Next.js, Node.js e SQL PostgreSQL/Supabase. Base: `a152516d`, 07/11/2026. Reprodução local com dados fictícios; sem alteração do produto ou acesso ao servidor/banco real.

---

## Issue #11 — [REV-009][P2] Persistir renovação dos cookies de sessão no SSR do Next.js

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/11
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

## Problema identificado por inspeção
O cliente SSR chama `loja.set` dentro de `setAll`, mas ignora qualquer erro de escrita. Em Server Components como `/conta`, cookies são somente leitura. Não há `proxy.ts`/middleware de renovação na árvore analisada. Assim, uma renovação disparada por `getUser()` durante renderização pode não chegar ao navegador; depender de uma futura Server Action não cobre visitas normais à página.

Fonte: [servidor.ts, linhas 15–20](https://github.com/oraconect5g-boop/sistema-ora5g/blob/a152516dd2651ea403d7bd158d4cc3a4fe14a6cb/apps/plataforma/src/lib/supabase/servidor.ts#L15). Documentação oficial consultada: [Supabase SSR / Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs), seção de Proxy para renovar tokens e gravar cookies.

## Impacto e limites
P2; ORA-006 / ORA-ORG-006; ADR-002 §2.6. Risco de sessão não persistir depois da expiração/rotação. Não foi usado um usuário real nem reproduzido um incidente na VPS; a evidência é o caminho de código e a ausência da camada exigida para cookies de leitura. O login implementado é parcial.

## Aceite
- [ ] Renovação ocorre em contexto com escrita de cookies, no padrão compatível com Next.js 16 e a versão fixada de @supabase/ssr.
- [ ] Cookies renovados chegam tanto ao render no servidor quanto à resposta ao navegador; preservar cabeçalhos de cache apropriados.
- [ ] Testar login bem-sucedido, expiração, renovação, segunda visita, saída e revogação com provedor de teste autorizado.
- [ ] Não confiar apenas em cookie/getSession para autorizar; preservar validação de usuário/claims e RLS.
- [ ] Não confundir renovação com sessão por turno: o limite de 12 horas continua requisito separado.

Implementador: Claude Code. Analista/revisor: Codex. Preservar TypeScript, React/Next.js, Node.js e SQL PostgreSQL/Supabase. Base: `a152516d`, 07/11/2026. Reprodução local com dados fictícios; sem alteração do produto ou acesso ao servidor/banco real.

---

## Issue #12 — [CONFIG-001][P2] Separar configuração da apresentação, Auth público e serviços administrativos

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/12
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Problema e objetivo
O modelo da raiz reúne 60 variáveis de fases diferentes. O runtime da demonstração exige só aplicação; o login por senha utiliza URL e chave pública do Supabase. Porém o grupo de validação `supabase` junta Auth público, `SUPABASE_SECRET_KEY` e `DATABASE_URL`. O comando documentado `aplicacao,supabase` acaba exigindo credenciais administrativas para conferir uma configuração de front/login que não as utiliza.

Há também instruções antigas de caminhos de arquivos diferentes do caminho consumido pelo Next e pelo publicar.sh. A ausência de um .env no Git é proposital, não defeito.

## Evidência
Base `b5164468` (07/11/2026); aplicação igual à revisão complementar `a152516d`.
- `packages/config/src/ambiente.ts:23–35`: quatro variáveis no mesmo grupo.
- `apps/plataforma/src/lib/supabase/configuracao.ts:2–5`: URL e chave pública, sem conexão SQL.
- `apps/plataforma/src/instrumentacao-node.ts:6`: inicialização valida somente aplicação.
- `apps/plataforma/README.md:40`: comando que valida ambos os grupos.
- Modelo mínimo proposto em `apps/plataforma/.env.example`, com seis nomes e sem credenciais.

## Implementação pelo Claude, análise/revisão pelo Codex
Preservar TypeScript/Next.js/Zod/PostgreSQL/Supabase. Complementa a issue #5 (validação da chave pública), sem substituí-la.

## Critérios de aceite
- [ ] Apresentação com dados fictícios inicia sem credenciais de provedores, banco ou chave privilegiada.
- [ ] Auth público tem validação própria de URL/chave, sem exigir DATABASE_URL ou SUPABASE_SECRET_KEY.
- [ ] Par Auth parcialmente preenchido/inválido é diagnosticado por nome, sem imprimir valores.
- [ ] Contextos SQL, API administrativa e integrações validam apenas as dependências que realmente utilizam.
- [ ] Não exigir SQL para signInWithPassword nem chave administrativa para requisições de usuário.
- [ ] Documentar comandos existentes e novos, compatibilidade/migração do grupo supabase e nenhum valor real.
- [ ] Documentar o caminho correto da .env.local do aplicativo, a origem externa do ambiente de homologação e o momento de build.
- [ ] SMTP do aplicativo não é tratado como configuração automática do Supabase Auth gerenciado.
- [ ] Testes de configuração por capacidade e segredo indevido; atualizar rastreabilidade com evidência.

Sem criação de credenciais, acesso à VPS ou alteração de configurações de produção nesta issue.

---

## Issue #13 — [REV-015][P1] Desconto acima do preço derruba a tela de venda demonstrativa

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/13
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: `00a35f970d977e3766571de4f3ac67978e7a2ef1`.

A validação monetária do REV-008 passou a lançar erro corretamente no domínio, mas o componente chama o cálculo de totais mesmo com item inválido. Isso interrompe uma apresentação com uma entrada comum do usuário.

## Reprodução local em navegador

1. Entrar em `/demo` como vendedor e abrir Nova venda.
2. Buscar `capa` e adicionar Capa de proteção (R$ 79,00).
3. Digitar `100,00` no campo Desconto R$.

Resultado: página de erro “This page couldn’t load”; a mensagem “Desconto maior que o item” não é exibida e o carrinho deixa de ser utilizável. Um teste Playwright independente reproduziu o problema na build atual. Os E2E existentes não incluem esse cenário.

## Causa e correção esperada

`apps/plataforma/src/app/demo/vender/PDV.tsx`, linhas 118–122, calcula `totaisDaVenda(itensVenda)` antes de condicionar o fluxo a `temErros`. `packages/dominio/src/venda.ts` lança RangeError em `totalDoItem` quando desconto supera o bruto. Os erros coletados por `validarItem` não impedem essa chamada.

Manter as validações fortes do domínio. Na UI, tratar o rascunho inválido antes dos cálculos e mostrar erro junto ao campo, preservando carrinho e entradas; não truncar silenciosamente o desconto nem permitir concluir a venda inválida. Revisar os demais pontos que passaram a lançar erro.

## Aceite

- R$ 100,00 de desconto em item de R$ 79,00 mostra mensagem, mantém a tela e impede concluir.
- Corrigir o desconto para valor válido recupera o fluxo sem recarregar nem perder o carrinho.
- Testar também digitação intermediária, valor malformado e limites, no celular e desktop.

Implementação com o Claude; revisão com o Codex. TypeScript/React/Next.js e regras de negócio preservados; nenhuma alteração de servidor ou dados reais.

---

## Issue #14 — [REV-016][P2] Reaproveitar release no mesmo commit ignora novo arquivo de ambiente

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/14
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: `00a35f970d977e3766571de4f3ac67978e7a2ef1`.

A publicação em diretório de versão com retorno à anterior é uma melhoria sobre REV-012. Há uma pendência de configuração na reutilização da versão.

## Evidência por inspeção

Em `deploy/homologacao/publicar.sh`, a condição que encontra `.next/BUILD_ID` com o mesmo SHA entra em “já montada; reaproveitando”. O `install -m 600` do arquivo externo de ambiente está somente no `else`, junto da montagem. Portanto, se a origem da configuração mudar e o mesmo commit for publicado de novo, a cópia usada pelo aplicativo continua com os valores anteriores. Não houve teste na VPS ou leitura de credenciais reais nesta revisão.

## Efeito

O operador atualiza a configuração autorizada, republica/reinicia e a aplicação pode continuar com URL, par público Supabase ou APP_ENV antigos. Se valores públicos já estiverem incorporados ao artefato, apenas copiar o arquivo e reiniciar também não resolve todos os casos.

## Correção esperada

Definir o artefato pela revisão do código e pela configuração relevante à build. Detectar mudança sem imprimir valores, montar nova versão quando necessário e atualizar a configuração de runtime de forma coerente antes da troca. Preservar o release anterior e seu ambiente para retorno, em vez de modificar a versão ativa antes do sucesso.

## Aceite

Em ambiente descartável, publicar o mesmo SHA com duas configurações fictícias diferentes e comprovar que a segunda é usada; repetir com falha de build/start e comprovar retorno à combinação anterior de artefato e configuração. Logs devem mostrar somente nomes/resultados, nunca valores de credenciais.

Não executar esses testes na homologação compartilhada sem a autorização operacional já prevista. Mantém Bash/Node.js/TypeScript e a infraestrutura escolhida.

---

## PR #15 — docs: auditoria funcional do front-end, backend e Supabase

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/15
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

A auditoria confirmou que a plataforma possui uma demonstração interativa ampla e uma fundação real de acesso. As operações comerciais continuam sem persistência. Pela primeira vez nesta revisão, o Supabase de desenvolvimento foi consultado diretamente, em modo de leitura, para confrontar banco e GitHub.

Base: 56ec9dec83e291729aa58d36fda132df3a1b3655. Stack preservada: TypeScript, React/Next.js, Tailwind, Node.js e PostgreSQL/Supabase.

## Inventário confirmado

- Front-end: 17 páginas sob /demo contando perfil, cinco perfis, gráficos, consultas, ações simuladas, CSV e comprovante.
- Backend: Auth por senha/SSR, /conta lendo perfil/unidades com RLS, proxy de sessão, validação de ambiente e saúde. As regras de domínio têm 22 funções públicas reutilizáveis.
- Banco real: dez tabelas RLS, 14 funções, 29 índices, cinco gatilhos, 68 colunas e 51 constraints comparáveis.
- Cadastro operacional e Auth estão vazios na consulta; existem cinco papéis, 31 permissões e 69 relações de acesso.
- Sem buckets de Storage, Edge Functions implantadas ou tabelas do aplicativo na publicação Realtime.
- Nenhuma tabela de vendas, clientes, estoque, pagamentos, caixa, aprovações, fiscal ou OS.

## Achados e correções

- #13 / REV-015 encerrada: correção do desconto inválido confirmada no celular e no computador, com recuperação do carrinho.
- #16 / REV-017 continua reproduzível: parâmetro herdado no catálogo de mensagens provoca HTTP 500 no login.
- #17 / REV-018 nova: as três migrations lógicas existem, e os objetos comparados correspondem, mas seus identificadores diferem entre Git e histórico remoto. Conciliar sem reset ou reaplicação cega.
- #18 / REV-019 nova: carrinho aceita N+1 acessórios quando a tela informa saldo N e mantém conclusão habilitada.
- #10, #11 e #14: resíduos de arredondamento, comprovação de sessão real e ambiente de release continuam com seus limites.
- #12: modelo mínimo e guia já foram incorporados pela main; a documentação antiga ainda precisa de compatibilidade.

## Documentação proposta

- docs/analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md: inventário por rota e serviço, tabelas/funções SQL, histórico de migrations, comparação remota, advisors, testes e sequência de integração.
- docs/alinhamento/REVISOES_CODEX.md: registro atualizado, preservando o histórico.
- docs/analises/REVISAO_INCREMENTAL_2026-11-07_8e1625d.md: análise anterior preservada com sua base.

O modelo de ambiente e os guias já adotados pela main foram preservados; o diff atual contém somente estes três documentos.

## Validação

CI da main em sucesso, run 42407927190. Localmente passaram lint, tipos, build e 210 testes (quatro TODO no banco). E2E: 63 passaram, nove pulados por configuração/viewport; dois casos adicionais de mostrar/esconder senha passaram com configuração pública fictícia. Dois testes adversariais reproduziram #16/#18 e foram retirados da árvore do produto.

Comparação com banco descartável criado pelas migrations confirmou funções, colunas, constraints, índices, gatilhos e grants examinados. PGlite é PG18.6 e remoto PG17.11; normalização de NOT NULL e limites do teste estão documentados. Scanner de segredos e links relativos conferidos.

## Limites e segurança

As consultas Supabase leram metadados, contagens e diagnósticos; não houve leitura de registros pessoais individuais, chaves, arquivos ou .env real. Sem DDL/DML remoto, reparo do histórico, usuário criado, autenticação com pessoa real, cobrança, implantação ou merge na main pelo Codex.

O diagnóstico não homologa produção. As três RPCs SECURITY DEFINER têm avisos esperados do advisor, com guardas e grants examinados; índices sem uso em cadastro vazio não foram removidos. Valores, IDs de projeto e dados pessoais não foram copiados para os novos documentos.


---

## Issue #16 — [REV-017][P2] Parâmetro de erro herdado provoca HTTP 500 na página de login

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/16
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: `8e1625ddff5d320e26cef44be518884408ef1007`.

## Defeito comprovado

Um GET local a `/entrar?erro=__proto__` retorna HTTP 500. Um valor desconhecido comum retorna 200. O cenário foi reproduzido por teste Playwright na build atual, sem configurar ou acessar o Supabase real.

Fonte: `apps/plataforma/src/app/entrar/page.tsx`, linhas 11–15 e 26. `ERROS` é um objeto comum; `ERROS[erro]` também encontra propriedades herdadas. Para `__proto__`, a página tenta passar um objeto como conteúdo ao componente Aviso, e a renderização falha. A declaração Record<string,string> não garante o tipo do valor lido em runtime.

## Causalidade e impacto

Defeito preexistente identificado nesta revisão; o arquivo de login não foi alterado pelo lote de polimento/Apache. O erro afeta a requisição com esse parâmetro e não comprova queda global, invasão ou exposição de dados. A tela pública de entrada deve lidar com parâmetros inválidos sem falhar.

## Correção esperada

Validar que o parâmetro é uma string e pertence às chaves próprias do catálogo antes de renderizar a mensagem; usar Object.hasOwn ou estrutura equivalente. Ignorar com segurança códigos desconhecidos. Preservar as mensagens neutras de credenciais e a stack TypeScript/React/Next.js.

## Aceite

- `/entrar?erro=__proto__`, `constructor`, `toString` e código desconhecido retornam 200 e mantêm a tela utilizável.
- `credenciais`, `dados` e `configuracao` continuam exibindo a mensagem correta.
- Cobrir também parâmetro repetido/ausente, sem vazamento de credenciais em logs.

Claude implementa; Codex revisa. Não houve tentativa com esses parâmetros no site público, acesso SSH ou leitura de .env real.

---

## Issue #17 — [REV-018][P2] Conciliar versões das migrations do GitHub com o histórico do Supabase

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/17
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Divergência confirmada por consulta de leitura

Base: `56ec9dec83e291729aa58d36fda132df3a1b3655`; projeto de desenvolvimento esperado, sem alteração de dados ou histórico.

| Migration | Arquivo GitHub | Registro Supabase |
|---|---|---|
| fundacao_acesso | 20261107120000 | 20261107140352 |
| indices_chaves_estrangeiras | 20261107130000 | 20261107140448 |
| correcoes_revisao_codex | 20261107140000 | 20261107151305 |

As três existem nos dois lados, mas os identificadores não coincidem. Comparei o banco remoto com uma base descartável criada pelas migrations: 14 funções (incluindo hashes dos corpos, SECURITY DEFINER e search_path), 68 colunas, 51 constraints comparáveis, 29 índices, cinco gatilhos e dez grants de tabela corresponderam. A estrutura examinada está alinhada; a divergência constatada é de controle de aplicação.

## Impacto

O fluxo da CLI compara versões de arquivos com supabase_migrations.schema_migrations. O histórico divergente precisa ser conciliado antes de depender de migration list/db push nas próximas entregas. Não foi executado db push, repair ou reset no remoto; o efeito de um push não foi provocado no banco.

## Correção esperada

Claude prepara um procedimento de reconciliação versionado, preservando o SQL já aplicado e os dados. Escolher os identificadores canônicos e alinhar histórico/arquivos somente após comparar os conteúdos, registrar o mapeamento e revisar o procedimento. Não reaplicar CREATEs existentes e não usar reset remoto como atalho.

## Aceite

- Histórico local/remoto sem versões divergentes.
- Prévia do próximo envio não tenta reaplicar as três migrations existentes.
- Banco novo continua sendo criado por toda a cadeia de migrations.
- Comparação de esquema após a conciliação preserva tabelas, funções, políticas, grants e dados.
- Processo das próximas migrations usa o mesmo identificador entre Git e Supabase.

Fonte oficial: https://supabase.com/docs/guides/deployment/database-migrations#diagnosing-and-fixing-sync-errors. O repair altera o controle de histórico e exige revisão do estado real; nenhuma correção foi aplicada nesta auditoria.

---

## Issue #18 — [REV-019][P2] PDV demonstrativo permite quantidade de acessório acima do saldo exibido

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/18
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: `56ec9dec83e291729aa58d36fda132df3a1b3655`.

## Reprodução independente no navegador local

1. Escolher vendedor e abrir /demo/vender.
2. Buscar Capa de proteção e observar N unidades em estoque na própria tela.
3. Adicionar ao carrinho e aumentar a quantidade até N+1.
4. Escolher Dinheiro.

A quantidade ultrapassa o saldo e Conferir e concluir venda continua habilitado. O teste obteve N da tela, sem fixar um saldo no código, e falhou ao exigir que a conclusão fosse bloqueada.

## Causa

Em PDV.tsx:143 e 369, adicionar novamente/aumentar quantidade incrementa sem comparar com dados.saldos. A validação do carrinho verifica tipo/quantidade monetária, mas não a disponibilidade do acessório. Na busca, qtd considera o saldo original, sem descontar a quantidade já no carrinho.

## Impacto e limite

P2 na demonstração; não houve venda persistida, cobrança ou prejuízo real. Deve haver coerência entre o saldo mostrado e a simulação. A validação de estoque no servidor e a reserva transacional do produto real continuam obrigatórias e não são substituídas pelo bloqueio na UI.

## Aceite

- Aumentar ou adicionar repetidamente não permite concluir acima do saldo.
- Mostrar mensagem clara e permitir recuperação ao reduzir/remover o item.
- Cobrir saldo zero, uma unidade, limite exato e tentativa acima do limite.
- Ao integrar o backend, revalidar/reservar na transação e tratar concorrência/conflito.

Manter TypeScript/React/Next.js e o domínio em centavos; implementação com o Claude, revisão com o Codex.

---

## Issue #19 — [REV-020][P1] IMEI principal pode se repetir no IMEI2 de outro aparelho

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/19
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: `7f5fd413eee756015723a53b29680db0ec655a1f` (08/11/2026). Requisitos: ORA-INV-002, ORA-INV-006.

Código: [migration, linha 198](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql#L198).

Os índices únicos de `imei` e `imei2` são independentes. Com dois aparelhos distintos, atualizar o IMEI2 do segundo para o IMEI principal do primeiro é aceito. Ambos passam pelo Luhn e pela validação do tipo; o mesmo identificador passa a apontar para dois aparelhos.

Reproduzido em PGlite com todas as seis migrations da main e as fixtures de `cenario-catalogo.ts`: `update public.itens_serializados set imei2 = cat.imei1 where id = itens.a2`. O teste exigindo rejeição recebeu sucesso. Nenhum dado remoto foi alterado.

Garantir unicidade do conjunto dos IMEIs de cada organização, incluindo cruzamento entre principal e secundário e concorrência. Uma tabela de identificadores com índice único é uma opção; uma consulta de gatilho sem trava não basta. Preservar devoluções e os dois IMEIs válidos do mesmo aparelho.

Correção por migration nova: não editar SQL já aplicado e registrado por hash. Manter TypeScript e PostgreSQL/Supabase. Bloqueia uso transacional real até correção e regressão; não houve venda real nem execução de DDL/DML remoto pelo Codex. Evidências completas serão registradas na auditoria de 08/11 no GitHub.

---

## Issue #20 — [REV-021][P1] Reserva aceita outra quantidade ou origem com a mesma chave

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/20
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: `7f5fd413eee756015723a53b29680db0ec655a1f` (08/11/2026). Requisitos: ORA-INV-005, ORA-POS-004.

Código: [migration, linha 603](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql#L603).

O caminho de repetição em `reservar_estoque` compara autor, variante, item e unidade, mas ignora quantidade e origem. Reservar 1 acessório e repetir a chave pedindo 9 devolve sucesso com a reserva antiga de 1. Trocar `pdv` por `online` também é aceito. Isso quebra o contrato declarado de OR004 para chave usada em outra operação e pode deixar o checkout acreditar que reservou outra quantidade.

Dois testes independentes, como `authenticated` e com unidade selecionada, esperavam OR004 e receberam sucesso. Testes executados somente em banco descartável.

Comparar o conteúdo normalizado relevante antes de aceitar repetição, incluindo quantidade e origem; definir o contrato do prazo. Repetição idêntica deve devolver a mesma reserva, sem efeito adicional. Também falta testar duas conexões simultâneas repetindo a mesma chave: a consulta anterior à trava não resolve sozinha essa corrida.

Correção por migration nova: não editar SQL já aplicado e registrado por hash. Manter TypeScript e PostgreSQL/Supabase. Bloqueia uso transacional real até correção e regressão; não houve venda real nem execução de DDL/DML remoto pelo Codex. Evidências completas serão registradas na auditoria de 08/11 no GitHub.

---

## Issue #21 — [REV-022][P1] Colisão de chave na entrada pode devolver outro IMEI ou criar item sem movimento

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/21
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: `7f5fd413eee756015723a53b29680db0ec655a1f` (08/11/2026). Requisitos: ORA-INV-003, ORA-INV-004, ORA-QUAL-007.

Código: [migration, linha 439](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql#L439).

`registrar_item_serializado` trata qualquer movimento com a mesma chave como a mesma entrada, sem conferir variante, loja e identificadores. Com a chave de um aparelho existente e outro IMEI, devolve o aparelho antigo. Com a chave de uma entrada de acessórios, a consulta encontra `item_serializado_id = null`, cria o novo aparelho e chama `lancar_movimento`; o ON CONFLICT desse lançamento ignora a colisão. A função devolve o item novo, mas ele não possui entrada correspondente no livro.

Os dois caminhos foram reproduzidos sobre as seis migrations e fixtures, em banco descartável. Os testes que exigiam OR004 receberam sucesso. Isso afeta a declaração de ORA-INV-003 como testado: nem toda entrada produz o fato correspondente.

Validar o conteúdo da chave em `registrar_item_serializado` e `lancar_movimento`; rejeitar colisões de outra operação, garantindo rollback de item e movimento juntos. Preparar teste de duas chamadas simultâneas com a mesma chave.

Correção por migration nova: não editar SQL já aplicado e registrado por hash. Manter TypeScript e PostgreSQL/Supabase. Bloqueia uso transacional real até correção e regressão; não houve venda real nem execução de DDL/DML remoto pelo Codex. Evidências completas serão registradas na auditoria de 08/11 no GitHub.

---

## Issue #22 — [REV-023][P1] Livro aceita nova entrada do mesmo aparelho já presente e infla saldo

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/22
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: `7f5fd413eee756015723a53b29680db0ec655a1f` (08/11/2026). Requisitos: ORA-INV-002, ORA-INV-003.

Código: [migration, linha 324](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql#L324).

O gatilho `validar_movimento` confere variante, loja e quantidade ±1, mas não impede registrar outra entrada +1 do mesmo item serializado já presente. `privado.lancar_movimento` aceita a segunda entrada com chave nova. No cenário de teste, o saldo da loja passa de 2 para 3 aparelhos, embora existam apenas 2 aparelhos disponíveis.

Reproduzido em banco descartável: chamar `privado.lancar_movimento` com +1, `entrada_compra`, `itens.a1` e chave inédita. A igualdade saldo × quantidade de itens disponíveis falhou: 3 versus 2. A soma do livro continua igual ao saldo, por isso o teste existente não detecta o erro.

Controlar a posição de estoque por item e suas transições sob trava; uma entrada não pode tornar positivo duas vezes o mesmo item. Não criar uma unicidade permanente do item no livro, pois saída e devolução legítimas precisam continuar possíveis. Função interna sem acesso direto de authenticated; o risco está no caminho privilegiado de importação/operação, não em escrita direta pela interface.

Correção por migration nova: não editar SQL já aplicado e registrado por hash. Manter TypeScript e PostgreSQL/Supabase. Bloqueia uso transacional real até correção e regressão; não houve venda real nem execução de DDL/DML remoto pelo Codex. Evidências completas serão registradas na auditoria de 08/11 no GitHub.

---

## Issue #23 — [REV-024][P2] Demonstração transfere eSIM acima do estoque central sem baixá-lo

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/23
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

Base: `7f5fd413eee756015723a53b29680db0ec655a1f`, 08/11/2026. Requisitos: ORA-CONNECT-001, ORA-CONNECT-011.

[Código, linha 54](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/ChipsConnect.tsx#L54).

O caminho de transferência eSIM apenas valida quantidade de 1 a 100 e soma ao estoque da loja. Não limita pela quantidade em `virgem` nem remove unidades da origem. A tela informa 4 eSIM no estoque central, mas aceita transferir 5 (e até repetir), elevando 15 para 20 na loja e mantendo a origem em 4.

Reproduzido em Playwright, como gerente, em 360 px e 1280 px: Chips e entrega → eSIM → quantidade 5 → Transferir. A mensagem de sucesso aparece. Os dois testes que exigiam recusa falharam.

Simular também a reserva/baixa da origem e recusar quantidade acima do disponível. Definir a identidade do eSIM transferido para não reaproveitar unidades. É bug da demonstração: nenhuma operação real foi enviada à Contel.

Preservar TypeScript/React/Next.js. A regressão deve corrigir o fluxo da demonstração e servir de contrato para a integração real.

---

## Issue #24 — [REV-025][P2] Recarga paga pelo LINK aparece como saldo e recebimento na loja

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/24
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

Base: `7f5fd413eee756015723a53b29680db0ec655a1f`, 08/11/2026. Requisitos: ORA-CONNECT-003, ORA-PAY-003, ORA-FIN-001.

[Código, linha 65](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/RecargaConnect.tsx#L65).

Depois de escolher LINK, solicitar e clicar em `Cliente pagou (simulação)`, o pedido mantém `pagamento: LINK`, mas o ramo confirmado mostra sempre `feita pelo saldo` e `O cliente pagou ... na loja`. O valor da carteira permanece sem débito nesse caminho. Assim a mesma operação aparece como link antes e saldo/recebimento na loja depois.

Reproduzido em Playwright nos dois tamanhos de tela; o teste que exigia ausência de `feita pelo saldo` após pagamento LINK falhou em ambos.

Renderizar a confirmação conforme `pedido.pagamento`, mantendo separados pagamento do cliente, débito da carteira da Ora e recebimento do caixa. Cobrir LINK confirmado e SALDO confirmado. É bug de informação na demonstração; não houve movimentação financeira real.

Preservar TypeScript/React/Next.js. A regressão deve corrigir o fluxo da demonstração e servir de contrato para a integração real.

---

## PR #25 — docs: auditoria e execução prioritária do núcleo operacional

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/25
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

O plano agora prioriza concluir o núcleo real de vendas, pagamentos/caixa e Ora Connect para substituir a Rein por transição homologada. A PR reúne a auditoria do Codex, o requisito de fotos e um prompt completo de execução para o Claude Code.

## Execução prioritária

docs/alinhamento/PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md orienta o Claude a corrigir os achados, concluir acesso/catálogo/estoque, implementar os fluxos reais e avançar os demais módulos. Define autonomia nas tarefas autorizadas, lista consolidada de APIs/habilitações, testes, revisão e critérios de saída da Rein. O plano principal referencia a prioridade nova.

Não trata credenciais como única dependência: dados de migração, regras comerciais, fiscal e aceite do corte ficam explícitos. Não autoriza cobranças, ativações, notas reais ou produção fora do processo vigente.

## Auditoria e requisitos

- Revisão da main 7f5fd41: 29 commits/90 arquivos; quatro bugs de integridade (#19–#22) e dois de demonstração (#23/#24).
- Inventário das 33 funções SQL, matriz histórica de 172 requisitos e reproduções TypeScript fora da suíte normal.
- ORA-CAT-011/#26: foto obrigatória por produto/variante visual, no catálogo, busca, estoque e PDV.
- Backlog atual: **173 requisitos**; 1 testado, 28 parciais, 22 demonstrações, 2 bloqueados, 119 não iniciados, 1 restrição respeitada e 0 homologados. Recorte piloto: 71.
- Status do livro de estoque corrigido para parcial; rastreabilidade regenerada; gerador com total dinâmico.

## Validação e limites

CI da main auditada aprovado (42510057118). Localmente passaram lint/tipos/build, 314 testes existentes (4 TODO) e 106 E2E (10 pulados). Adversariais reproduziram seis falhas de banco e quatro de navegador. Histórico/hashes das seis migrations e objetos comparados correspondem ao banco limpo.

O HEAD com o prompt `f472635` passou no CI: https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42515517098. A versão anterior de fotos também passou (42514356033). Conteúdos publicados foram validados e nenhum segredo/valor de ambiente foi copiado.

Esta PR documenta e orienta a implementação; não entrega upload, vendas ou integrações novas. Stack preservada. Sem DDL/DML remoto, dados pessoais individuais, .env real, criação de usuário, operações externas, deploy ou merge pelo Codex.

---

## Issue #26 — [ORA-CAT-011][P0] Foto obrigatória por produto e identificação visual no catálogo/PDV

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/26
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Decisão explícita do proprietário em 08/11/2026: todos os produtos precisam ter fotos para distinguir itens com nomes semelhantes.

**Requisito ORA-CAT-011, P0, catálogo/piloto.** ORA-CAT-010 permanece como importação em lote de fotos/atributos; não cobre a obrigatoriedade da foto no uso diário.

Critérios de aceite:
- Todo produto tem foto principal correspondente. Variante com diferença visual (ex.: cor) usa imagem própria.
- Imagem e nome/SKU aparecem juntos no catálogo, busca, consulta de estoque e PDV; tocar na imagem permite ampliar no celular.
- Cadastro de foto pelo celular (câmera ou galeria), com validação do arquivo e miniatura leve.
- Ausência ou falha da imagem gera indicação clara e pendência de cadastro; um placeholder não atende ao requisito de foto.
- Produtos importados por CSV podem entrar como pendentes de imagem; manter o SKU e reconciliar o cadastro, sem API Rein. A homologação do catálogo piloto exige completar as fotos.
- Metadados vinculam produto/variante e organização; armazenamento de arquivos, leitura e alteração obedecem às permissões do catálogo. Nunca gravar chave secreta no navegador ou URL temporária como identidade permanente da imagem.
- Cobrir dois produtos de nomes parecidos, variantes de cores diferentes, imagem ausente, upload inválido, usuário sem permissão e isolamento entre organizações.

Sequência proposta: preparar o contrato visual do mockup; implementar mídia ao integrar o catálogo real e o acesso, antes de homologar o PDV piloto. Preparar foto principal e estrutura para imagens adicionais. Não implementar bloqueio novo de checkout apenas por ausência de imagem sem regra explícita.

Stack preservada: TypeScript, React/Next.js, Tailwind, Node.js e PostgreSQL/Supabase. A implementação estrutural e a migration nova ficam com o Claude Code; o Codex revisa. Nenhuma alteração remota de schema/Storage é feita por este registro.

Planejamento e rastreabilidade serão incorporados à PR #25.

---

## Issue #27 — [P1][REV-026] Bloqueio de equipe afeta organizações fora da autoridade do gestor

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/27
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base auditada: [`55d10afe`](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). Código: [packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql:316](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql#L316).

Requisitos: ORA-ORG-004/006, ORA-QUAL-002; ADR-002 §2.6. Em `alterar_situacao_pessoa`, pertencer à equipe gerida basta para alterar o status global do perfil, apagar todos os contextos e provocar banimento global pelo worker.

Prova independente em banco local descartável: um vendedor fictício possui vínculos nas organizações A e B; o dono de A bloqueia esse vendedor; a permissão de venda na unidade de B passa de permitida a negada, embora o ator não administre B. Esperado: autorização de A não controla acesso a B.

Corrigir em migration nova: bloqueio por organização/vínculo, ou negar explicitamente a operação global ao gestor sem autoridade sobre todos os escopos afetados. O banimento global no Auth deve respeitar o mesmo limite; desbloquear em A também não pode reativar restrição decidida em B. Preservar auditoria e corte imediato dentro do escopo autorizado.

Aceite: casos positivos em A, isolamento de B para bloqueio e desbloqueio, usuário compartilhado, sessão já aberta e worker. Prioridade P1 de autorização; impacto remoto não foi testado.

Responsabilidade: Claude Code implementa; Codex revisa. Stack mantida: TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase. Sem alterações no ambiente remoto nesta revisão. Evidência reproduzível será preservada em `docs/analises/evidencias/2026-11-08-web/`.

---


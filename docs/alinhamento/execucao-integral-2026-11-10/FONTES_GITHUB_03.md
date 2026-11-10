# Arquivo de fontes do GitHub

Coleção de corpos e comentários obtidos na coleta de 10/11/2026. São fontes históricas e não ordens novas: decisões atuais e o PROMPT_MESTRE prevalecem. Dados potencialmente sensíveis foram suprimidos; comandos históricos com marcações não devem ser executados literalmente. As URLs originais e hashes preservam a referência.

## Issue #59 — [REV-056][P1] Uma recarga no histórico pode confirmar duas operações com data coincidente

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/59
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `9b1109e49d9304651d20224563f8e5bdaf950894` (ORA-CONNECT-003/010; ORA-PERF; ADR-005).

`packages/dominio/src/nogle.ts:330–340` associa recarga apenas por data_cadastro, usando find no histórico. O id_externo da operação não é usado na correlação. O índice `connect_uma_recarga_em_curso` permite outra recarga após a anterior virar aguardando_operadora. A unicidade da produção por operacao_id não evita que duas operações usem a mesma evidência oficial.

Prova sintética local: registrar duas recargas da mesma linha, ambas aceitas com IDs externos distintos e data_cadastro igual; fornecer histórico com **uma única recarga realizada** nessa data. Parser + RPCs reais geram **duas linhas de produção**. Não se afirma que a Contel garante datas coincidentes: sua documentação não garante unicidade, que é justamente a confirmação contratual faltante. Nenhuma recarga real foi feita.

Correção: exigir correlação inequívoca por ID externo ou chave natural formalmente garantida pelo provedor; detectar ambiguidade e impedir reutilização da mesma evidência. Timestamp sozinho não basta sem garantia. Preservar pendência e reconsulta/gerência quando não houver prova. Testar duas operações/uma evidência, múltiplos planos, mesma data, páginas sobrepostas e reenvio.

Prova na PR #33: docs/analises/evidencias/2026-11-09-nogle-9b1109/banco.repro.ts. Pergunta prioritária ao responsável pela API: qual campo liga id da recarga ao histórico e qual a unicidade/resolução temporal de data_cadastro?

---

## Issue #60 — [P0][ORA-INV-004/005/006] Busca visual e pedido interno de transferência nas 11 lojas e DEFEITOS

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/60
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Decisão explícita do proprietário em 09/11/2026, após imagem do estoque: são **11 lojas comerciais** (Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania, Balneario, Santa Candida) e o local **DEFEITOS**, usado para transferências de itens com erro/problema. Substitui a premissa anterior de 14 lojas; não é uma 12ª loja comercial.

Objetivo: buscar produto com foto, tocar e ver em quais lojas há saldo/pendência, e pedir transferência dentro da Ora, com fluxo simples no celular.

Estado na main 9b1109e: /estoque real com fotos, saldo, histórico de IMEI/ICCID e disponibilidade da rede. Faltam pedidos de transferência persistentes, separação/expedição/recebimento e divergências correlacionados. Livro interno e demonstração não entregam esse processo.

A imagem exige conciliação de regra: físico total 6755 bate com as linhas; disponível do cabeçalho 6688 difere da soma 6725 (37); pendências totalizam31, enquanto a diferença físico-disponível das linhas é30. Almirante Tamandaré: 468 físico/465 disponível/4 pendentes. Não ajustar saldo arbitrariamente; identificar reservas, trânsito e exceções na exportação.

Aceite: painel por produto/variante com foto e loja atual; disponibilidade na rede, físico, reservas e transferências com detalhes; solicitação → autorização/separação → envio → recebimento ou divergência/cancelamento. Reservas não excedem saldo, trânsito não é disponível no destino, reenvio não duplica movimentos e DEFEITOS possui tratamento/regularização auditados. Custo permanece protegido.

Definir matriz de permissões sem supor gerente oficial em todas as lojas. Para chips/eSIM, ligar o pedido interno à transferência de PDV Nogle quando o contrato exigir; resposta externa não comprova entrega física. Demais produtos usam o livro da Ora.

Especificação, referência estruturada da imagem e proposta visual serão publicadas na PR #33. Preservar TypeScript/React/Next.js/Tailwind/Node.js/PostgreSQL/Supabase; não semear banco real com dados fictícios.

---

## PR #61 — docs: instalar skill de engenharia sênior Ora 5G e prompt de leitura para Claude

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/61
Estado na coleta: closed. Corpo integral com supressões de dados potencialmente sensíveis.

## Objetivo
Adicionar a habilidade `engenheiro-senior-ora5g` para Claude Code, incluindo os documentos de contexto e auditoria anteriores, histórico de conversas disponível, três relatórios de pesquisa e um novo prompt de leitura e reconciliação.

## Conteúdo
- `.claude/skills/engenheiro-senior-ora5g/SKILL.md` e seus arquivos `references/` (contexto, fluxos, auditoria, roteiro, dossiê, histórico e pesquisas);
- `docs/skills/engenheiro-senior-ora5g/` (auditoria, manifesto, instalação e prompts);
- `docs/skills/engenheiro-senior-ora5g/PROMPT_LEITURA_E_RECONCILIACAO_2026-11-10.md` (prompt recomendado para o primeiro diagnóstico do Claude Code).

## Segurança e escopo
- Apenas documentação: não altera código de aplicação, migrations, infraestrutura, autenticação, `.env`, `CLAUDE.md` ou `AGENTS.md`.
- Não habilita integrações, não executa transações nem modifica banco/produção.
- A auditoria de 09/11/2026 é uma fotografia histórica; conferir `main` atual e PR #33 antes de implementar.
- Arquivos históricos são referência, não substituem decisões recentes e evidências atuais.
- Verificação preliminar de padrões comuns de segredos no pacote não identificou ocorrências; revisor deve confirmar antes do merge.

## Aceite
- Skill localizada em `.claude/skills/engenheiro-senior-ora5g/SKILL.md`, com frontmatter YAML e referências existentes;
- Prompt disponível no repositório e direcionando o Claude a diagnosticar sem realizar alterações;
- Documentos originais preservados em pastas rastreáveis;
- Revisão e merge humanos; não fazer merge automático.

**Atenção:** o projeto já contém mudanças posteriores à auditoria. Essa PR não tenta corrigir issues ou reconciliar a PR #33; isso fica para a próxima tarefa do Claude e Codex.

---

## Issue #62 — [ORA-QUAL-001/006][P2] Homologação não acompanha a main: /vendas e /auditoria retornam 404

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/62
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

## Diagnóstico do Codex — 10/11/2026

Pedido do proprietário: verificar por que as atualizações não aparecem no site. Escopo: **publicação/homologação e identificação da versão**; requisitos existentes **ORA-QUAL-001 e ORA-QUAL-006**, sem criar uma implementação paralela. Stack TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase preservada.

**Resultado:** `https://ora5g.com.br` entrega uma versão que **não contém as últimas mudanças da main**. Reproduzido por HTTPS e navegador novo, sem autenticação e sem usar cache local. O CI da main passou, mas **não executa publicação**.

### Evidências observadas no site

Coleta pública em 10/11, aproximadamente 17:04–17:10, horário de São Paulo.

| Caminho | Resultado observado | Comportamento esperado no código atual |
|---|---|---|
| `/` | HTTP 200; “Plataforma própria · 14 lojas” | “11 lojas” |
| `/entrar` | HTTP 200; painel ilustrativo ainda diz “14 lojas” | “11 lojas” |
| `/demo/lojas` | HTTP 200; 14 lojas fictícias, “14 + 2”, sem DEFEITOS | 11 lojas fictícias + unidades especiais, incluindo DEFEITOS |
| `/vendas` | **HTTP 404**, “Página não encontrada” | Página real já criada; sem sessão deve levar a `/entrar` |
| `/auditoria` | **HTTP 404**, “Página não encontrada” | Página real já criada; sem sessão deve levar a `/entrar` |
| `/estoque`, `/connect`, `/transferencias` | Sem login, chegam a `/entrar` | Controle de acesso esperado; não confundir com página ausente |
| `/saude` | HTTP 200, “0.1.0”, login Supabase “conectado” | Não identifica o commit nem comprova banco/fluxos de negócio |

A raiz repetiu o conteúdo antigo com parâmetro único na URL, `Cache-Control: no-cache` e `Pragma: no-cache`. Respostas indicam `private, no-cache, no-store, max-age=0, must-revalidate`. O navegador foi testado em contextos novos, desktop 1360px e celular 360px. Nas oito navegações observadas não houve erro JavaScript nem recurso `/_next/` com HTTP >=400. **Limpar o cache do usuário não resolve a divergência reproduzida.** Cache/proxy interno e encaminhamento da origem ainda precisam ser conferidos pelo operador.

O primeiro Chromium não reconheceu a CA do ambiente de execução; a repetição aceitou somente as chaves públicas das CAs já instaladas neste ambiente. As consultas HTTPS do Python usaram validação normal do sistema. Não há evidência de defeito no certificado do site.

### Código e publicação são etapas diferentes

- Main verificada: [`eb0a947`](https://github.com/oraconect5g-boop/sistema-ora5g/commit/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07), merge das telas reais consistentes, em 10/11 às 14:39 de São Paulo.
- [CI 42867119645](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42867119645): **success**. Job “Verificações” aprovou segredos, geradores, instalação, lint, tipos, testes, build, auditoria e E2E.
- [`ci.yml`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/.github/workflows/ci.yml) tem esses testes, **sem etapa de deploy**. É o único workflow presente na árvore analisada.
- [Estado atual](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/docs/ESTADO_ATUAL_E_PASSAGEM.md) declara homologação publicada em `8f7a458`. A [comparação até a main](https://github.com/oraconect5g-boop/sistema-ora5g/compare/8f7a458c2b91dfca3ce98cbba4214739b62593cb...eb0a94798960aba5a71a1b8e8fbae0ef2f120e07) tem **10 commits**, incluindo documentos/testes e a implementação `14b0f8a` das telas/menu/busca.
- O código posterior à publicação inclui `MoldeReal.tsx`, menu por permissão, novas páginas `/vendas` e `/auditoria`, painel inicial, busca comum e demo com 11 lojas/DEFEITOS.
- [`publicar.sh`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/deploy/homologacao/publicar.sh) faz build separada, troca a versão ativa e reinicia; [o procedimento](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/deploy/homologacao/LEIA-ME.md) distingue **publicar** de **só reiniciar**. Atualizar o clone de desenvolvimento ou fazer merge não troca a aplicação publicada.
- A página pública se identifica como **homologação**. Não interpretar o domínio principal como prova de produção liberada.

**Causa demonstrada:** descompasso entre o código da main e o artefato servido pelo domínio. **Explicação operacional consistente com os registros:** a última publicação ocorreu antes do lote novo. Sem acesso ao servidor, não é possível distinguir se o novo publish não foi executado, falhou com preservação/retorno da versão anterior ou se o domínio aponta para outro processo. O SHA exato em execução **não foi comprovado**: `/saude` mostra somente a versão do package.json.

### Procedimento objetivo para o Claude Code

1. No ambiente autorizado, conferir o SHA da main remota e o SHA da **versão ativa**, o destino do link de homologação e o processo atendido pelo domínio. Publicar só esses SHAs e o resultado; nunca conteúdos de `.env`, IDs privados da infraestrutura ou logs brutos com segredos.
2. Conferir o registro da última publicação: não executada, build recusada ou rollback. Se já estiver na versão nova, comparar resposta local com domínio e revisar encaminhamento/cache do proxy. **Não alterar DNS ou WHM por suposição.**
3. Selecionar um SHA revisado e com CI aprovado; referência desta análise: `eb0a94798960aba5a71a1b8e8fbae0ef2f120e07`. Validar dependências do ambiente, guardar a versão anterior e usar o **script existente de publicação de homologação**, conforme autorização de publicação aplicável. Somente reiniciar a versão antiga não inclui o código novo.
4. Manter a allowlist do ambiente web; não colocar chaves Nogle/Supabase secret no front-end. Não habilitar workers ou executar operação financeira/telecom real para testar a publicação.
5. Conferir publicamente raiz/login com “11 lojas”, demo com 11 e DEFEITOS, e `/vendas`/`/auditoria` redirecionando ao login quando anônimo. Com usuário fictício autorizado, conferir menu real, busca e permissões. Registrar SHA implantado, CI, horário e smoke test e atualizar o estado documental.
6. Se falhar, usar a reversão já prevista, registrar o motivo e manter a issue aberta. Não confundir HTTP 200 em `/saude` com aceite das telas novas.

A comparação dos 10 commits não adiciona migrations; isso não atesta a situação das migrations anteriores no ambiente. Não há justificativa nesta análise para aplicar migrations destrutivas ou substituir a stack.

### Limitações independentes da publicação

- `/demo/*` usa dados fictícios; os módulos reais estão fora de `/demo` e exigem sessão/permissões. Publicar não transforma a demonstração em operação real.
- Mesmo a main mantém **nomes genéricos “Loja 02” a “Loja 11”** em [`demo/dados/organizacao.ts`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/apps/plataforma/src/demo/dados/organizacao.ts). A contagem e DEFEITOS foram corrigidos, mas os nomes confirmados pelo proprietário ainda não foram usados nessa fixture. Relacionado a #60; não inventar CNPJ/IDs reais.
- O protótipo de estoque em `docs/prototipos/` é material de referência; sua presença no Git não o publica como rota do aplicativo.
- Credenciais/contratos e homologação da Nogle, usuários de teste e cadastros reais continuam sendo dependências próprias; não explicam a ausência pública das novas páginas.
- PR #33 aberta não significa que todos os seus conteúdos estejam ausentes: a reconciliação documenta partes incorporadas por outra branch.

### Critério de encerramento

Versão ativa identificada e correspondente ao SHA aprovado; marcadores e rotas públicas acima corretos; nenhuma regressão de acesso; registro atualizado de publicação. Recomenda-se incluir identificação segura do commit na verificação operacional de release, pois “0.1.0” sozinho não permite rastrear implantação.

Revisão somente leitura do aplicativo e dos serviços. Nenhum servidor, arquivo `.env`, dado pessoal real, operação Nogle ou configuração de produção foi acessado/alterado. Codex permanece como revisor conforme [AGENTS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/AGENTS.md). Para esta análise foi aplicada a [skill de engenharia do projeto](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/.claude/skills/engenheiro-senior-ora5g/SKILL.md).


---

## Issue #63 — [P0][ORA-ORG] Liberar primeiro acesso à aplicação real: Auth sem usuários e sem vínculos

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/63
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

## Prioridade explícita do proprietário — aplicação real e primeiro acesso

Em 10/11/2026, após confirmar que estava em `https://ora5g.com.br/demo`, o proprietário determinou: **“eu preciso da real agora não da demonstração”**. Também confirmou: **“Ainda não tenho acesso”**.

**Objetivo:** liberar o primeiro acesso à aplicação real com autenticação, perfil, vínculos e contexto de loja corretos; publicar a versão validada das telas reais e provar um percurso operacional. **Aprimoramentos da demonstração ficam depois deste objetivo.** Não basta trocar o link ou retirar o aviso de demonstração.

Escopo rastreável: ORA-ORG-001/002/003/004/005, ORA-QUAL-001/002; relacionado a #11 (sessão no navegador), #62 (publicação), #60 (lojas/transferências) e #54 (Nogle). Stack atual preservada: TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase.

### Diagnóstico reproduzido pelo Codex

Main analisada: `eb0a94798960aba5a71a1b8e8fbae0ef2f120e07`.

Consulta **somente de contagens agregadas** no projeto de desenvolvimento:
- usuários em `auth.users`: **0**;
- perfis em `public.perfis_usuario`: **0**;
- vínculos ativos: **0**;
- vínculos administrativos ativos: **0**;
- organizações: **1**, empresas: **1**, unidades: **3**.

Não foram consultados nomes, e-mails, credenciais ou registros pessoais. São contagens de um ambiente de desenvolvimento, não um inventário de produção.

Verificação pública sem autenticação:
- `/entrar`: HTTP 200 com formulário;
- `/inicio`, `/escolher-loja`, `/equipe` e `/vender`: chegam a `/entrar`;
- `/vendas`: ainda HTTP 404; publicação divergente, detalhada em #62.

**Conclusão:** existe interface de login, mas não há nenhuma conta cadastrada nesse banco. Não existe ainda a cadeia completa usuário Auth → perfil → vínculo/papel → loja/turno que permita o acesso operacional. Criar somente o usuário no Auth também não resolve os vínculos: [a escolha de loja](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/apps/plataforma/src/app/escolher-loja/page.tsx) mostra aviso quando nenhuma unidade está liberada.

A documentação atual declara `SUPABASE_SECRET_KEY` ausente e worker de identidade desligado; isso é **estado documental**, não leitura do arquivo de ambiente pelo Codex. O Claude deve conferir no ambiente autorizado. [Pendências](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/docs/PENDENCIAS_DO_PROPRIETARIO.md), linhas A1/B1/B2; [estado atual](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/docs/ESTADO_ATUAL_E_PASSAGEM.md).

### Trabalho delimitado para o Claude Code, em ordem

1. **Identificar ambiente e versão.** Reconciliar main, aplicação ativa e banco atendido pelo domínio. Corrigir a publicação conforme #62, preservando retorno à versão anterior. Confirmar quais ambientes estão separados conforme ADR-001; não colocar dados comerciais reais na semente de desenvolvimento.
2. **Preparar a identidade no servidor autorizado.** Conferir apenas os nomes das variáveis necessárias. O segredo administrativo fica somente no worker. O procedimento existente permite ao proprietário gravá-lo sem enviá-lo ao chat: `bash ~/homologacao/plataforma/deploy/homologacao/definir-chave.sh SUPABASE_SECRET_KEY`. O valor vem do painel Supabase. Não ler ou publicar valores em logs/PRs. Esse passo configura criação/convites; a entrada normal usa chave pública.
3. **Resolver o primeiro responsável administrativo.** Hoje ninguém consegue entrar para emitir o primeiro convite pela equipe. Providenciar um procedimento restrito, idempotente e auditado de bootstrap, ou documentar e executar um procedimento já existente e adequado. Criar identidade pelo mecanismo administrativo suportado do Supabase, em contexto servidor; não fazer INSERT manual em `auth.users`. Usar identidade/e-mail confirmados e entrega privada de acesso. Vincular perfil ativo, organização, papel e contexto permitidos. Nunca transformar “primeiro usuário que se cadastrar” em dono.
4. **Respeitar os papéis já definidos.** O [ADR-002](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/docs/adr/ADR-002-empresa-unidades-perfis-e-permissoes.md) distingue donos e administrador do sistema. Não dar automaticamente o papel de dono ao solicitante nem liberar venda/aprovação ao administrador por conveniência. O bootstrap dos responsáveis iniciais deve refletir a decisão vigente e ser auditado. Criar contas de vendedor/gerência **fictícias** para a prova de permissões; nunca apresentar essas contas como usuários reais.
5. **Completar convite e definição de senha.** Conferir URLs de retorno, fluxo de confirmação/recuperação, SMTP/modelos quando usados e processamento do worker de identidade. Senha, token e link de acesso não entram em GitHub/chat/logs. A senha é definida pelo próprio usuário pelo fluxo privado adequado. Repetição não cria dois perfis/vínculos; falha parcial pode ser retomada sem promoção indevida.
6. **Provar o percurso autenticado.** Login → escolha de loja → `/inicio` → menu por papel → catálogo/estoque/fotos → caixa/PDV → venda/comprovante → lista de vendas. Cobrir logout, renovação e revogação, segunda visita e negação entre lojas/perfis (#11). Testes de operação usam dados fictícios identificados e ambiente de teste; não produzir uma venda real como smoke test sem preparação.
7. **Preparar o piloto com os dados corretos.** Usar os 11 nomes comerciais confirmados e DEFEITOS, que não vende; código/CNPJ/endereço e arquivo de produtos/preços/estoque da Rein seguem B1/B2 e precisam ser recebidos pelo canal seguro já definido. Não usar CNPJ de exemplo nem IDs de semente como cadastro oficial. Registrar o que ainda falta; não preencher com invenções.
8. **Separar dependências da Ora Connect.** Login e estoque não dependem das chaves Nogle. A integração Nogle real depende dos contratos, credenciais no worker e linha/ICCID autorizados de #54. Não marcar ativação, cobrança, pagamento ou repasse como concluído por simulação; não habilitar automaticamente os workers externos ao corrigir o acesso.

### Atenção aos scripts já existentes

[`semente/LEIA-ME.md`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/packages/banco/supabase/semente/LEIA-ME.md) diz que as sementes são **apenas de desenvolvimento**. [`vincular-usuarios-de-teste.sql`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/packages/banco/supabase/semente/vincular-usuarios-de-teste.sql) usa usuários com sufixos `+vendedor`/`+dono` e organização/unidades fictícias. Isso pode servir ao teste previsto, **não ao provisionamento da conta real do proprietário**. Não renomear esses dados e apresentá-los como produção.

O [worker de identidade](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/apps/worker/src/executar-identidade.ts) sai informando “desligado” quando falta configuração. Deve haver prova de processamento e autorização, e não somente um cron instalado ou processo que termina com código zero.

### Aceite

- O proprietário recebe acesso pelo canal privado e entra em `https://ora5g.com.br/entrar`, com papel e contexto corretos; não é encaminhado a `/demo`.
- O fluxo Auth/perfil/vínculos funciona e mantém isolamento por loja e organização.
- A aplicação pública serve o SHA aprovado; rotas reais novas existem.
- Prova E2E autenticada com usuários fictícios e perfis diferentes; resultados de login/renovação/revogação e do percurso operacional registrados, com distinção entre teste e uso comercial.
- A conta e seu bootstrap são idempotentes e auditados; sem grant amplo para anônimo, bypass de RLS ou autoatribuição de dono.
- Acessos, dados do piloto e integrações pendentes têm estado explícito. **Código real em homologação não equivale à liberação de produção.**
- Atualizar `ESTADO_ATUAL_E_PASSAGEM.md`, lista de pendências e evidências. Nenhuma chave/senha/token/e-mail real deve ser incluído na issue.

### Referência e divisão de execução

Claude Code implementa/provisiona no ambiente autorizado e Codex revisa, conforme [AGENTS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07/AGENTS.md) e ADR-001. Esta solicitação torna primeiro acesso e aplicação real a prioridade; não altera automaticamente as regras vigentes de acesso ao servidor, segregação de ambiente ou liberação comercial.

A [referência oficial do Supabase](https://supabase.com/docs/reference/javascript/auth-admin-createuser) foi reconferida: criação administrativa de usuário é exclusiva do servidor; chave privilegiada nunca vai ao browser. A [skill Supabase](skill://plugin_asdk_app_69d3e5ee6a708191baa733f7b8931995/supabase/SKILL.md) foi usada nesta checagem.


---

## PR #64 — fix(banco): vincular gerente junto aos usuários de teste

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/64
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

O script de desenvolvimento só vinculava vendedor e dono; uma conta `+gerente` ficava sem perfil e sem loja. Agora o gerente de teste recebe vínculo apenas na Santa Cândida de teste, com aprovação local e isolamento das demais unidades.

O procedimento documenta as três contas fictícias pedidas pelo proprietário e separa a criação no Supabase Auth da vinculação no banco. Mantém TypeScript/SQL e a stack existente.

Validação local sobre as 22 migrations da main `eb0a947`:
- 7 testes de semente aprovados: repetição sem duplicar, estoque/livro e auditoria preservados, contas reconhecidas, vendedor/dono e novo gerente com escopo correto;
- gerente aprova só na própria loja, não seleciona a outra e não recebe gestão dos usuários da rede;
- typecheck do recorte de banco e lint do teste aprovados; diff sem erro de espaçamento.

Sem migration ou alteração da matriz de permissões. Não altera senha, não cria contas no Auth e não toca em produção. A operação permanece restrita à semente fictícia de desenvolvimento; o SQL pode ser repetido sem duplicar vínculos.

**Pendente para completar o pedido:** criar as três contas no Auth pelo painel ou pela API administrativa no servidor autorizado e executar a vinculação no `ora5g-dev`, seguido do login real. O conector desta sessão não oferece criação administrativa no Auth; nenhuma conta foi criada por este PR. Retorno: não executar o novo vínculo até revisão; se aplicado, encerrar o vínculo específico do gerente pelo procedimento auditado em vez de apagar histórico.

Relacionado a #63 e #11. Claude Code revisa/integra; não encerrar #63 só com este ajuste.

---

## Issue #65 — [P0][ORA-FIN/REPORT] Implementar gráficos e painel financeiro com dados reais

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/65
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

## Problema e prioridade do proprietário

O proprietário entrou na aplicação real e relatou falta dos gráficos de controle financeiro que via na demonstração, além da sensação de perda de funcionalidades com a nova UI. Solicita uma sequência para completar o sistema.

**Objetivo desta primeira entrega:** disponibilizar visão financeira operacional **real**, sobre os registros do PostgreSQL/Supabase, preservando o visual azul atual e o isolamento por loja/perfil. Não aumenta os 179 requisitos: atende partes de **ORA-FIN-001/008/009, ORA-REPORT-001/002/003/005 e ORA-PAY-003/007**. DRE, previsão e contas completas terão entregas próprias.

### Evidência da diferença

Base: `84ecefea496afe1159f355e14491b995240a347e`, CI [42904572452](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42904572452) aprovado.

- [Início real](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/app/inicio/page.tsx): pendências e atalhos, sem gráficos financeiros.
- [Caixa real](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/app/caixa/page.tsx): abertura, movimentos por meio, sangria/suprimento, fechamento/conferência; não é painel financeiro.
- [Financeiro da demo](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/app/demo/financeiro/page.tsx): recebimentos por meio, fluxo ilustrativo, contas, financeiras e caixas; dados de `demo/dados`.
- [Relatórios da demo](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/app/demo/relatorios/page.tsx): séries de faturamento, margem, ticket e ranking fictícios.
- Na verificação pública de 10/11, `/demo/financeiro` responde 200 e mostra os cartões; `/financeiro` responde 404. A árvore atual também não contém página real `/financeiro`.
- Comparação `eb0a947...84ecefe`: nenhum arquivo removido; início/caixa reais e a página financeira da demo não mudaram. Os componentes gráficos continuam em [`componentes/graficos.tsx`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/componentes/graficos.tsx). A diferença demonstrada é de **paridade funcional entre demo e aplicação real**; não há prova de que os gráficos foram apagados pela nova cor/UI.

### Escopo mínimo completo, para Claude Code

1. Definir contrato dos indicadores: fonte, moeda em centavos, data de corte/fuso São Paulo, escopo autorizado, status incluídos, cancelamento/devolução e ligação ao fato de origem.
2. Criar leitura agregada autorizada no servidor/banco para o período inteiro, sem somar apenas uma página de resultados. Começar pela loja selecionada e preparar consolidação das lojas permitidas para o dono. Respeitar RLS/organização e `custo.ver`; não usar chave privilegiada no front-end.
3. Criar `/financeiro` real com entrada no menu por permissão; incluir resumo/atalho no `/inicio`. Preservar pendências/ações existentes. Dono vê o escopo autorizado da rede; gerente, sua loja; vendedor mantém suas vendas/caixa. Administrador segue ADR-002. Registrar eventual nova permissão em migration revisada, em vez de liberar finanças só porque alguém abre caixa.
4. Entregar três visões com tabela acessível e ligação aos registros: **vendas concluídas e devoluções por período**, **pagamentos registrados por meio** e **movimentação dos caixas/fechamentos com diferenças**. Filtros de período, loja e situação; estados de carregamento, falha, vazio e dados indisponíveis.
5. Reusar `MoldeReal`, componentes gráficos atuais e exportador autorizado. Não importar dados, contextos ou geradores de `demo/` nas páginas reais. Extrair auxiliares visuais neutros quando útil; preservar a demonstração como referência visual.
6. Acrescentar comparações somente para períodos equivalentes com histórico suficiente. Sem dados reais registrados, mostrar vazio/zero quando a fonte é válida; módulo ainda inexistente deve aparecer como indisponível, não zero fictício.

### Regras que o gráfico deve preservar

- Venda não equivale a recebimento, liquidação, repasse ou produção. Pagamento `confirmado` no registro local não prova crédito no extrato bancário.
- Fundo/suprimento não são receita; sangria não é despesa ou prejuízo. Gráfico do livro da gaveta deve se chamar **movimentação dos caixas**, não fluxo financeiro completo da empresa.
- Entrada PayJoy/Aiva e saldo financiado são separados; vale-troca não é dinheiro recebido. Troco e estorno não podem ser subtraídos duas vezes.
- Cancelamento, devolução parcial, estorno pendente e estorno comprovado mantêm fatos e datas próprios. Nada de estoque reposto por desenho de relatório.
- Recarga pelo valor de face não vira receita da Ora; carteira/débito Nogle e repasse são fatos separados. Recursos externos continuam sob #54.
- Margem bruta depende de custo histórico autorizado; lucro/DRE exigem despesas, taxas e tributos que ainda não estão completos.
- As consultas atuais de vendas são limitadas e avisam resumo parcial; não reutilizar esses totais como consolidação completa. Testar volume acima dos limites REST, não só poucos registros.

### Aceite e prova

- Totais dos cartões, gráficos, tabela e exportação reconciliados com os livros e os fatos de origem.
- Casos de pagamento misto, duas linhas/mais de um pagamento sem multiplicação de joins, entrada financiada, troco, vale, cancelamento, devolução parcial e estorno externo pendente/confirmado.
- Período vazio, ausência de histórico anterior, mudança do dia em São Paulo e volume maior que o limite da API.
- Dono/gerente/vendedor e outra organização: dados e custo isolados no servidor/banco; drill-down também autorizado.
- Celular 360px e computador; tabelas acessíveis e sem gráfico cortado.
- CI, testes financeiros e E2E adequados ao escopo; plano de retorno da leitura/UI. Nenhuma migration destrutiva, alteração da stack ou operação real de cobrança.
- Atualizar a matriz de paridade demo × real, rastreabilidade e estado com limitações. Não marcar o financeiro completo como concluído por entregar esta primeira etapa.

### Dependências e limites

**Não depende de uma nova API** para gráficos sobre fatos locais. Depende dos registros existentes e de homologar os cálculos. Fontes: vendas, itens/custos protegidos, pagamentos, livros de caixa, devoluções e estornos. `contas_a_receber` já existe para PayJoy/Aiva, mas baixa, vencimento/aging e repasse completo continuam pendentes.

Integrações, Nogle/repasse, contas a pagar, conciliação e previsão têm trilhas posteriores descritas no relatório completo desta issue. Segurança, preparação do piloto e fiscal seguem em paralelo. Claude implementa; Codex revisa. TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase preservados.

---

## PR #66 — docs: prompt para financeiro real e conclusão do planejamento

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/66
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

O proprietário pediu um prompt executável para levar os gráficos e controles financeiros da demo à aplicação real e seguir o planejamento completo. Este PR inclui o prompt integral e a cópia versionada do relatório da #65, permitindo leitura pelo Git mesmo quando o servidor do Claude não acessa a API do GitHub.

A primeira entrega é a #65: agregações autorizadas, `/financeiro`, resumo no início e gráficos reais de vendas/pagamentos/caixa. O prompt preserva a UI azul, stack, RLS, regras financeiras e o estado do acesso já corrigido; delimita Nogle/fornecedores, testes, publicação e as demais trilhas.

Validação documental: 179 IDs no anexo, todos únicos; referências/escopo conferidos; verificações de padrão sem IP, e-mail real ou chave secreta. Documentação apenas: não altera aplicação, schema, contas, configuração ou publicação. Não executa os testes financeiros futuros nem declara a entrega da #65 concluída.

Relacionado a #65, #63, #64 e #54.

---

## Comentário 6709011375 — issue/PR #12

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/12#issuecomment-6709011375
Criado em: 2026-11-07T15:29:06Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Atualização da revisão em `00a35f970d977e3766571de4f3ac67978e7a2ef1`: Claude implementou `supabase_publico` e `supabase_servidor`, integrou a validação no helper/boot e exige o par público completo se qualquer parte estiver preenchida. Os testes locais atuais de configuração passaram; login público não exige SQL/chave administrativa. Portanto, os itens centrais desta issue estão atendidos.

Restam compatibilidade/documentação do grupo antigo `supabase` (removido da CLI, ainda citado nos guias antigos), modelo mínimo no diretório do app e roteiro de SMTP/URLs de retorno. Estou preparando esses documentos/modelo em nova branch; não houve leitura ou alteração de `.env` real. O grupo servidor ainda junta SQL/API administrativa; separar quando o primeiro consumidor precisar apenas de uma capacidade.

---

## Comentário 6709146775 — issue/PR #10

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/10#issuecomment-6709146775
Criado em: 2026-11-07T15:38:34Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência independente em `00a35f97`: os quatro casos originais foram corrigidos, e as provas independentes de fração/NaN/desconto negativo/faixa passaram. A integração do erro com a interface é acompanhada separadamente na #13.

Encontrei um resíduo de arredondamento apenas em valores muito altos ainda aceitos pelos tipos/helpers: `limiteDeDesconto({ preco: 2000000000012, custo: 1999800000001, taxaMeioPagamento: 0, politica: { tetoCategoria: 1, margemMinima: 1 } })` retorna `maximoSemAprovacao = 11`, mas o teto inteiro exato é 10 centavos. A referência foi calculada com `(BigInt(custo)*10000n + 9999n - 1n)/9999n`; um teste Vitest independente confirmou esperado 10/recebido 11. Não é evidência de erro em venda habitual do piloto; é uma pendência dos limites aceitos e da promessa de aritmética exata.

Causa: Math.ceil da divisão em ponto flutuante em `limiteDeDesconto`, sem preservar o teto racional exato; revisar também os intermediários do cálculo da margem. Completar aritmética inteira exata ou estabelecer/rejeitar explicitamente uma faixa de negócio segura antes de calcular. BigInt interno é recurso da mesma stack TypeScript/JavaScript, não uma troca de linguagem. Manter a issue aberta para esse resíduo; a prioridade P1 dos casos originais não deve ser confundida com o impacto deste caso extremo.

A conferência completa e o roteiro estão no PR #15. Nenhum teste vermelho temporário foi integrado ao produto.

---

## Comentário 6709169418 — issue/PR #2

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/2#issuecomment-6709169418
Criado em: 2026-11-07T15:40:04Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

REV-001: a nova política e os testes independentes confirmam que administrador de A não lê perfil exclusivo de B nem enumera perfil sem vínculo. Os casos legítimos previstos continuam passando.

Revisão Codex em `00a35f970d977e3766571de4f3ac67978e7a2ef1`: 172 testes existentes, 14 provas independentes e CI 42386097423 passaram. Encerrando este defeito específico como corrigido no código revisado. Não equivale a homologação operacional nem a teste do banco/servidor real pelo Codex. Conferência detalhada no PR #15.

---

## Comentário 6709173192 — issue/PR #3

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/3#issuecomment-6709173192
Criado em: 2026-11-07T15:40:19Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

REV-002: evento sem unidade é filtrado pela organização explícita; evento sem organização fica oculto; a associação à unidade não pode contradizer a organização. A prova independente do vazamento anterior e as regressões passaram.

Revisão Codex em `00a35f970d977e3766571de4f3ac67978e7a2ef1`: 172 testes existentes, 14 provas independentes e CI 42386097423 passaram. Encerrando este defeito específico como corrigido no código revisado. Não equivale a homologação operacional nem a teste do banco/servidor real pelo Codex. Conferência detalhada no PR #15.

---

## Comentário 6709176679 — issue/PR #4

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/4#issuecomment-6709176679
Criado em: 2026-11-07T15:40:32Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

REV-003: workflow agora examina o histórico no push; teste com valor fictício adicionado e removido passou. O passo correspondente do CI de push também concluiu com sucesso.

Revisão Codex em `00a35f970d977e3766571de4f3ac67978e7a2ef1`: 172 testes existentes, 14 provas independentes e CI 42386097423 passaram. Encerrando este defeito específico como corrigido no código revisado. Não equivale a homologação operacional nem a teste do banco/servidor real pelo Codex. Conferência detalhada no PR #15.

---

## Comentário 6709182574 — issue/PR #5

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/5#issuecomment-6709182574
Criado em: 2026-11-07T15:40:55Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

REV-004: validador recusa a chave secreta nova e JWT service_role legado; helper e inicialização compartilham a regra. Testes de configuração e E2E do boot passaram. A compatibilidade dos nomes antigos de grupos é acompanhada na #12.

Revisão Codex em `00a35f970d977e3766571de4f3ac67978e7a2ef1`, com CI 42386097423 em sucesso e checks locais concluídos. Encerrando este defeito específico como corrigido no código, preservando as pendências distintas. Não é homologação de sessão, operação ou configuração real. Conferência no PR #15.

---

## Comentário 6709185968 — issue/PR #6

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/6#issuecomment-6709185968
Criado em: 2026-11-07T15:41:09Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

REV-005: encerrar vínculo com papel inativo funciona; criar/reabrir com papel inativo e trocar conteúdo por esse atalho continuam recusados. Regressões e reprodução independente passaram.

Revisão Codex em `00a35f970d977e3766571de4f3ac67978e7a2ef1`, com CI 42386097423 em sucesso e checks locais concluídos. Encerrando este defeito específico como corrigido no código, preservando as pendências distintas. Não é homologação de sessão, operação ou configuração real. Conferência no PR #15.

---

## Comentário 6709189510 — issue/PR #7

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/7#issuecomment-6709189510
Criado em: 2026-11-07T15:41:23Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

REV-006: índice passou a considerar a organização, permitindo mesmo dono em duas organizações sem duplicar vínculo aberto na mesma. Regressão e reprodução independente passaram.

Revisão Codex em `00a35f970d977e3766571de4f3ac67978e7a2ef1`, com CI 42386097423 em sucesso e checks locais concluídos. Encerrando este defeito específico como corrigido no código, preservando as pendências distintas. Não é homologação de sessão, operação ou configuração real. Conferência no PR #15.

---

## Comentário 6709192773 — issue/PR #9

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/9#issuecomment-6709192773
Criado em: 2026-11-07T15:41:37Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

REV-007: leitura de 1.000 e 1.000.000 preserva os milhares em centavos; valores ambíguos/fora da faixa são recusados. Regressões e provas originais independentes passaram. O problema de tratar desconto inválido na UI segue na #13; a aritmética de limite em valores altos segue na #10.

Revisão Codex em `00a35f970d977e3766571de4f3ac67978e7a2ef1`, com CI 42386097423 em sucesso e checks locais concluídos. Encerrando este defeito específico como corrigido no código, preservando as pendências distintas. Não é homologação de sessão, operação ou configuração real. Conferência no PR #15.

---

## Comentário 6709199007 — issue/PR #11

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/11#issuecomment-6709199007
Criado em: 2026-11-07T15:42:02Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência em `00a35f97`: `src/proxy.ts` foi implementado conforme a convenção do Next.js 16, chama getClaims antes de /conta e propaga cookies/cabeçalhos; build e caminho E2E sem sessão passaram. A mudança atende à parte estrutural da revisão.

A issue permanece aberta até comprovar expiração/renovação, persistência do cookie, acesso subsequente e revogação com usuário de teste autorizado. Codex não usou credenciais reais e não repetiu teste contra o projeto Supabase. Registrar o cenário e o resultado sem tokens/valores. Conferência e roteiro no PR #15.

---

## Comentário 6709209493 — issue/PR #15

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/15#issuecomment-6709209493
Criado em: 2026-11-07T15:42:44Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência final do Codex:

- HEAD `5b98ade0e713c2195abf7b17da2895fbe4071da7`: CI concluído com sucesso — https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42387418689.
- PR aberto e sem conflitos; exatamente quatro arquivos de documentação/modelo. Conteúdo remoto conferido com o preparado localmente.
- Issues #2, #3, #4, #5, #6, #7 e #9 encerradas após confirmação das correções específicas e registro das evidências.
- #10 permanece aberta pelo resíduo de arredondamento em valores extremos; #11 por prova de sessão real; #12 por configuração/documentação residual. #13 e #14 documentam os novos defeitos encontrados.
- Antes da apresentação: corrigir #13 preservando a validação do domínio. Depois, seguir o roteiro de acesso real → ADR-003/catálogo → CSV Rein → estoque/IMEI → primeira jornada persistida.

A conversa privada do link do projeto não ficou disponível; não foi atribuída causalidade às melhorias sem ler essa fonte. O relatório compara o planejamento e os commits efetivamente disponíveis. Stack e escopo preservados; nenhuma configuração real ou implantação foi realizada por esta revisão.

---

## Comentário 6712061740 — issue/PR #13

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/13#issuecomment-6712061740
Criado em: 2026-11-07T19:35:45Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Revisão incremental em `8e1625ddff5d320e26cef44be518884408ef1007`: reproduzi novamente em navegador local o desconto de R$ 100,00 na Capa de proteção de R$ 79,00. A tela continua caindo, sem mostrar a validação. O novo lote alterou textos e rolagem do PDV, mas não o cálculo incondicional em PDV.tsx:118.

O CI desse lote passou (run 42392229369), pois os testes existentes não cobrem o caso. Um teste independente continuou falhando exatamente na mensagem ausente; o teste positivo do novo botão/conclusão com rolagem ao topo passou.

Mantida P1 e a prioridade antes da apresentação. Corrigir o consumidor da regra monetária sem retirar as validações do domínio e acrescentar regressão ao CI. Nenhuma cobrança, dado real, servidor SSH ou .env real foi usado.

---

## Comentário 6712140797 — issue/PR #15

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/15#issuecomment-6712140797
Criado em: 2026-11-07T19:43:07Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência final da revisão incremental:

- Main examinada: `8e1625ddff5d320e26cef44be518884408ef1007`; CI passou: https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42392229369.
- HEAD deste PR: `73990bcc676e2efcfbbd596ed9623b6272582f95`; CI também passou: https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42407381654.
- Diff conferido: apenas cinco arquivos de documentação/modelo; conteúdo remoto comparado com o preparado localmente. A aplicação do Claude foi incorporada sem alterações de runtime nesta branch.
- Revisão por arquivo: 10 commits/19 arquivos desde 503fa541, mais o contexto documental já conhecido. Testes atuais: 18 de aplicação e 39 E2E passaram, 5 E2E pulados; três verificações extras passaram e duas reproduziram #13/#16.
- Prioridade antes da apresentação: corrigir o tratamento do desconto inválido e do parâmetro de erro na entrada, com regressão. Acesso real/sessão e configuração de release mantêm seus aceites próprios.

A documentação compartilhada deve distinguir inspeção de regressão automática: o estado diz “13 com teste”, mas a resposta de REV-014 registra somente inspeção e ausência de teste que force falha do serviço. O relatório registra esses limites; não promover inspeção a teste ou homologação.

Consultas públicas foram somente GETs normais. Nenhum acesso SSH, leitura de .env real ou implantação pelo Codex.

---

## Comentário 6713175276 — issue/PR #13

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/13#issuecomment-6713175276
Criado em: 2026-11-07T21:21:36Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Correção confirmada pelo Codex na main `56ec9dec83e291729aa58d36fda132df3a1b3655`.

O E2E REV-015 em demonstracao.spec.ts:87 passou no celular e no computador: desconto de R$ 100,00 em item de R$ 79,00 mostra erro, preserva o carrinho, bloqueia conclusão, suporta formatos intermediários inválidos e se recupera ao corrigir o valor. A redução de quantidade também é coberta. O domínio continua rejeitando o valor inválido; a UI agora calcula os totais só dos itens válidos.

Nesta rodada passaram 210 testes existentes e a suíte E2E local terminou com 63 aprovados e 9 pulados por configuração/viewport. CI da main em sucesso no run 42407927190. Encerrando este defeito específico. O controle de quantidade contra saldo de acessórios é acompanhado separadamente na #18; não é o mesmo problema de desconto.

---

## Comentário 6713177405 — issue/PR #16

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/16#issuecomment-6713177405
Criado em: 2026-11-07T21:21:48Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Reproduzido novamente na nova interface da main `56ec9de`: GET local /entrar?erro=__proto__ retornou HTTP 500. O novo layout manteve a leitura ERROS[erro] sem verificação de chave própria. O teste extra foi executado após a suíte existente passar; permanece aberto para correção e regressão.

---

## Comentário 6713289808 — issue/PR #12

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/12#issuecomment-6713289808
Criado em: 2026-11-07T21:32:49Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Atualização em `56ec9de`: o modelo mínimo apps/plataforma/.env.example e o guia CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md já estão na main, além dos grupos supabase_publico/supabase_servidor e da validação integrada no boot/helper. Não são mais arquivos pendentes de integração.

Permanece alinhar referências/consumidores do grupo antigo supabase e completar a organização por capacidade nos serviços futuros. Auth público continua usando apenas URL/chave pública; não exige SQL/chave administrativa para senha. Não houve leitura de .env real.

A auditoria do banco de dev confirmou que ainda não há usuários Auth, perfis, unidades ou vínculos. A ausência desses cadastros impede comprovar entrada válida + /conta; é inicialização da operação, distinta de faltar variável para o mockup. Relatório completo no PR #15.

---

## Comentário 6713311081 — issue/PR #15

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/15#issuecomment-6713311081
Criado em: 2026-11-07T21:34:55Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência final da auditoria funcional e Supabase:

- Código examinado: `56ec9dec83e291729aa58d36fda132df3a1b3655`; CI da main passou no run 42407927190.
- HEAD documental `5f4dec7079b57effa0e555b536ad7f0550ec5e87`: CI passou — https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42416163064.
- Diff conferido: somente três documentos. Conteúdo remoto verificado; nenhum arquivo de aplicação ou SQL alterado nesta proposta.
- O relatório inventaria as 17 páginas de demonstração, backend efetivo, 22 funções de domínio, dez tabelas, 14 funções SQL e serviços Supabase. Contagens e advisors foram consultados no desenvolvimento em leitura; sem registros pessoais individuais ou valores de credenciais.
- Comparação estrutural aprovada nos objetos examinados; divergência do histórico de versões documentada na #17. Quantidade acima do saldo na demonstração documentada na #18. #16 continua reproduzível; #13 foi encerrada após confirmar correção.
- 210 testes locais passaram, quatro TODO no banco; E2E 63 passaram/nove pulados, além de dois casos de senha aprovados em execução separada com configuração fictícia. Não foi efetuado login com usuário real; o cadastro Auth estava vazio na consulta.

Antes da primeira jornada operacional: conciliar o histórico de migrations, preparar o cadastro autorizado de teste, concluir sessão/unidade e auditoria de acesso e avançar pelo ADR-003. O diagnóstico e a publicação de documentação não aplicam essas alterações no banco.

---

## Comentário 6725501083 — issue/PR #10

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/10#issuecomment-6725501083
Criado em: 2026-11-08T18:41:38Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência independente do Codex em 08/11/2026, main `7f5fd41`.

REV-008: conferi a aritmética BigInt em `desconto.ts` e executei a suíte atual de domínio: 82 testes passaram, incluindo limites/margens em valores altos. O resíduo de 1 centavo da revisão anterior está corrigido; não há valores NaN/fracionários/negativos escapando nos casos cobertos.

Encerrando este achado específico como corrigido. Isso não homologa o sistema completo. A auditoria consolidada de 08/11 registrará as evidências e novos achados.

---

## Comentário 6725503638 — issue/PR #12

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/12#issuecomment-6725503638
Criado em: 2026-11-08T18:41:52Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência independente do Codex em 08/11/2026, main `7f5fd41`.

CONFIG-001: conferi o modelo mínimo, `lerGrupos`, o CLI e as instruções novas. Os testes de configuração (53) e o E2E de inicialização somente com o par público passaram. O grupo antigo produz orientação explícita; login não exige chave secreta nem DATABASE_URL. Configuração administrativa permanece separada.

Encerrando este achado específico como corrigido. Isso não homologa o sistema completo. A auditoria consolidada de 08/11 registrará as evidências e novos achados.

---

## Comentário 6725505528 — issue/PR #14

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/14#issuecomment-6725505528
Criado em: 2026-11-08T18:42:03Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência independente do Codex em 08/11/2026, main `7f5fd41`.

REV-016: executei os scripts atuais em clone/worktrees, pasta e porta locais isolados, com servidor e npm fictícios. Confirmados: mesmo commit com arquivo diferente cria nova versão; mesma combinação reaproveita; ambiente do terminal não sobrepõe o arquivo; cópia anterior é preservada com modo 600; falha da nova versão reverte para código e ambiente anteriores. Três builds simuladas. Nenhum acesso ao servidor ou .env real. Build real da aplicação também passou separadamente.

Encerrando este achado específico como corrigido. Isso não homologa o sistema completo. A auditoria consolidada de 08/11 registrará as evidências e novos achados.

---

## Comentário 6725521132 — issue/PR #16

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/16#issuecomment-6725521132
Criado em: 2026-11-08T18:43:29Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência independente do Codex em 08/11/2026, main `7f5fd41`.

REV-017: o catálogo do login agora aceita somente chaves próprias e rejeita parâmetros repetidos. Os E2E passaram para nomes herdados e desconhecidos, preservando as mensagens válidas. As quatro telas com busca/filtro também passaram nos parâmetros repetidos. O HTTP 500 reproduzido antes foi eliminado nos casos cobertos.

Encerrando este achado específico como corrigido. A auditoria consolidada de 08/11 preservará o histórico e os limites da verificação.

---

## Comentário 6725523298 — issue/PR #17

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/17#issuecomment-6725523298
Criado em: 2026-11-08T18:43:40Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência independente do Codex em 08/11/2026, main `7f5fd41`.

REV-018: consulta direta, somente de leitura, confirmou versão, nome e MD5 das SEIS migrations do histórico remoto iguais aos arquivos/registro atuais. A comparação com banco limpo criado pelas migrations confirmou também 33 funções, 167 colunas, 131 constraints comparáveis, 83 índices, 19 gatilhos, 20 policies e 20 grants examinados. Os três conteúdos anteriores foram preservados por renomeação; não fiz repair, reset ou aplicação remota. Houve novos bugs de lógica no catálogo/estoque, registrados separadamente em #19–#22; não são divergência de histórico.

Encerrando este achado específico como corrigido. A auditoria consolidada de 08/11 preservará o histórico e os limites da verificação.

---

## Comentário 6725525365 — issue/PR #18

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/18#issuecomment-6725525365
Criado em: 2026-11-08T18:43:51Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Conferência independente do Codex em 08/11/2026, main `7f5fd41`.

REV-019: os testes de quantidade cobrem zero, uma unidade e acima do saldo; o E2E atual, em celular e computador, confirma limite de 3 unidades, botão de aumento desabilitado, recusa de adicionar pela busca e conclusão permitida no limite exato. O aviso some ao iniciar nova busca. A correção é da demonstração; a concorrência real continua exigindo reserva no servidor/banco.

Encerrando este achado específico como corrigido. A auditoria consolidada de 08/11 preservará o histórico e os limites da verificação.

---

## Comentário 6725628767 — issue/PR #19

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/19#issuecomment-6725628767
Criado em: 2026-11-08T18:53:21Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Auditoria e evidências publicadas na [PR #25](https://github.com/oraconect5g-boop/sistema-ora5g/pull/25).

- [Relatório completo](https://github.com/oraconect5g-boop/sistema-ora5g/blob/9f865f2fa66783c2dcfa4351799b0446b3a2149b/docs/analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md).
- [Reprodução TypeScript](https://github.com/oraconect5g-boop/sistema-ora5g/blob/9f865f2fa66783c2dcfa4351799b0446b3a2149b/docs/analises/evidencias/2026-11-08/banco.repro.ts).
- [Como executar em ambiente descartável](https://github.com/oraconect5g-boop/sistema-ora5g/blob/9f865f2fa66783c2dcfa4351799b0446b3a2149b/docs/analises/evidencias/2026-11-08/LEIA-ME.md).

Reproduzido com as seis migrations da main; correção deve entrar por migration nova.

---

## Comentário 6725629632 — issue/PR #20

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/20#issuecomment-6725629632
Criado em: 2026-11-08T18:53:26Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Auditoria e evidências publicadas na [PR #25](https://github.com/oraconect5g-boop/sistema-ora5g/pull/25).

- [Relatório completo](https://github.com/oraconect5g-boop/sistema-ora5g/blob/9f865f2fa66783c2dcfa4351799b0446b3a2149b/docs/analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md).
- [Reprodução TypeScript](https://github.com/oraconect5g-boop/sistema-ora5g/blob/9f865f2fa66783c2dcfa4351799b0446b3a2149b/docs/analises/evidencias/2026-11-08/banco.repro.ts).
- [Como executar em ambiente descartável](https://github.com/oraconect5g-boop/sistema-ora5g/blob/9f865f2fa66783c2dcfa4351799b0446b3a2149b/docs/analises/evidencias/2026-11-08/LEIA-ME.md).

Reproduzido com as seis migrations da main; correção deve entrar por migration nova.

---

## Comentário 6725630560 — issue/PR #21

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/21#issuecomment-6725630560
Criado em: 2026-11-08T18:53:31Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Auditoria e evidências publicadas na [PR #25](https://github.com/oraconect5g-boop/sistema-ora5g/pull/25).

- [Relatório completo](https://github.com/oraconect5g-boop/sistema-ora5g/blob/9f865f2fa66783c2dcfa4351799b0446b3a2149b/docs/analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md).
- [Reprodução TypeScript](https://github.com/oraconect5g-boop/sistema-ora5g/blob/9f865f2fa66783c2dcfa4351799b0446b3a2149b/docs/analises/evidencias/2026-11-08/banco.repro.ts).
- [Como executar em ambiente descartável](https://github.com/oraconect5g-boop/sistema-ora5g/blob/9f865f2fa66783c2dcfa4351799b0446b3a2149b/docs/analises/evidencias/2026-11-08/LEIA-ME.md).

Reproduzido com as seis migrations da main; correção deve entrar por migration nova.

---


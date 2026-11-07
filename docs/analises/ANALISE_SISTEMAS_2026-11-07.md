# Análise de sistemas, aderência ao escopo e andamento — 07/11/2026

**Projeto:** Ora 5G Platform · **Analista/revisor:** Codex · **Implementador:** Claude Code  
**Bases de código:** revisão inicial `17524a5da68815e61b4c1eacd85b519b118969bf`; revisão complementar `a152516dd2651ea403d7bd158d4cc3a4fe14a6cb`.  
**Pedido do proprietário:** analisar defeitos e andamento, documentar no GitHub e preservar a linguagem e a arquitetura já adotadas.

> **Evolução durante a revisão:** a main avançou. As seções 1–14 preservam a fotografia inicial em `17524a5`; o **estado mais recente está na seção 15** e no [registro de achados](../alinhamento/REVISOES_CODEX.md). O login parcial, a demonstração, as regras de domínio e os scripts novos já foram considerados na revisão complementar.

## 1. Parecer executivo

O código está alinhado à fundação do monorepo Next.js/React/TypeScript e PostgreSQL/Supabase. Há uma página pública de saúde, validação de ambiente, CI, detecção de segredos e a primeira estrutura de acesso no banco. Não há, nessa versão, login de usuário, catálogo, estoque, PDV, caixa, fiscal ou integração operacional externa.

A ausência desses fluxos decorre principalmente de funcionalidades ainda não implementadas. Não há evidência de que a linguagem escolhida seja a causa de falha do sistema. A revisão encontrou dois defeitos de isolamento entre organizações, três ajustes de segurança/manutenção e uma limitação de expansão. Corrigi-los dentro da stack existente é a recomendação; trocar linguagem, framework ou banco não é a solução proposta.

A execução do CI dessa revisão está [verde](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42380089530). Os testes extras encontraram cenários não cobertos pela suíte existente. CI verde comprova os checks executados, sem equivaler a homologação de todos os requisitos de negócio.

Não foi diagnosticada uma indisponibilidade específica da VPS: não houve acesso ao servidor, ao seu `.env`, ao painel do Supabase ou ao banco real. As afirmações sobre configuração e implantação relatadas por Claude estão identificadas como documentadas, não verificadas remotamente pelo Codex.

## 2. Fontes e precedência

Fontes lidas e utilizadas:

- Esta conversa: revisão do PR #1, confirmação de CI, revisão da main e a diretriz de análise de sistemas sênior com preservação da stack.
- [Estado atual e passagem](../ESTADO_ATUAL_E_PASSAGEM.md), [AGENTS](../../AGENTS.md) e [CLAUDE](../../CLAUDE.md).
- [Decisões de 06/11](../etapa-0/ETAPA_0_DECISOES_2026-11-06.md), [base consolidada](../etapa-0/ETAPA_0_BASE_CONSOLIDADA.md), [contexto](../00_CONTEXTO_E_DECISOES.md) e [pendências](../10_DECISOES_PENDENTES.md).
- [ADR-001](../adr/ADR-001-infraestrutura-ipv4-portas-e-ambientes.md), principalmente §2.7 e §4A; [ADR-002](../adr/ADR-002-empresa-unidades-perfis-e-permissoes.md).
- [Plano do mês 1](../etapa-1/PLANO_DE_INICIO_DA_IMPLEMENTACAO.md), [requisitos](../01_REQUISITOS.md), [arquitetura](../02_ARQUITETURA.md), [dados](../03_DADOS.md), [fluxos](../04_FLUXOS.md), [permissões](../05_PERMISSOES.md), [integrações](../06_INTEGRACOES.md), [roadmap](../07_ROADMAP.md) e [testes/aceite](../09_TESTES_E_ACEITE.md).
- [Operação dos agentes](../11_OPERACAO_DOS_AGENTES.md), [variáveis](../integracoes/VARIAVEIS_DE_AMBIENTE.md), [backlog original](../../backlog.json), READMEs dos pacotes e código versionado.

Prevalece a decisão explícita recente do proprietário, seguida por ADRs/decisões aceitas. Propostas antigas, pesquisas e referências visuais não substituem essas decisões. Conversas de outros chats não disponíveis ao revisor não foram presumidas nem reconstruídas como fatos.

**Diretriz permanente desta análise:** Claude programa; Codex atua como analista de sistemas e revisor. Ambos seguem o mesmo escopo e a mesma stack. Toda divergência deve ser registrada antes de mudar uma decisão de produto ou arquitetura.

## 3. Linguagens, ferramentas e arquitetura a preservar

| Camada | Escolha existente/desejada | Evidência e situação |
|---|---|---|
| Linguagem da aplicação | TypeScript | Aplicação, configuração, scripts e testes em TS/TSX; TypeScript 6.0.3; configuração estrita |
| Interface | React 19.3.1 + Next.js 16.4.5 | `apps/plataforma`; App Router; atualmente somente `/saude` |
| Servidor e futuro worker | Node.js 22, com TypeScript | `.nvmrc` 22.23.4; worker ainda não criado |
| Dados e autorização | SQL PostgreSQL + Supabase gerenciado | Migrations SQL, RLS, funções e gatilhos em `packages/banco` |
| Estilo | CSS; Tailwind previsto | CSS simples na página atual. Tailwind ainda não instalado; sua adoção prevista não representa troca de linguagem |
| Validação | Zod 4.6.7 | Usado em `packages/config/src/ambiente.ts` |
| Testes | Vitest 5.1.0, Playwright 1.65.0, PGlite 0.5.15 | Testes de aplicação/configuração, navegador e PostgreSQL em memória |
| Dependências | npm workspaces, versões diretas fixadas e lockfile | Instalação limpa passou; dependências externas do lockfile resolvem no registro npm |
| Integração contínua | GitHub Actions, YAML | CI de PR e push na main |
| Arquitetura | Monólito modular em monorepo | Não introduzir microsserviços nem outro backend para contornar defeitos pontuais |

Não propor migração da aplicação para Python, PHP, Java, C# ou outra linguagem, nem substituir React/Next.js ou PostgreSQL/Supabase. Scripts de análise descartáveis no ambiente do revisor não integram a aplicação nem alteram sua stack.

Plataforma, futura loja e worker devem compartilhar as mesmas regras de domínio em TypeScript. SQL continua responsável por integridade, transações, RLS e garantias que não podem depender apenas da tela. Nomes e vocabulário de negócio permanecem consistentes com o projeto.

## 4. O escopo de negócio que deve orientar o desenvolvimento

- Plataforma própria integrada de CRM, ERP, PDV, estoque/IMEI, pagamentos/caixa, financeiro, fiscal, metas/comissões, Ora Connect, assistência e canais digitais.
- 14 lojas; piloto Santa Cândida; expansão em ondas 3 → 7 → 14.
- Uma organização inicial, empresa com CNPJ raiz e filiais por unidade; preparação para expansão sem misturar dados.
- Vendedor usa celular e pode trabalhar em várias lojas; operações pertencem à unidade da sessão e ao responsável. Venda online pura pode não ter vendedor de loja, conforme a regra mais recente do plano.
- Rein permanece oficial durante o piloto paralelo. Importação somente por CSV, incluindo produtos, preços e estoque conforme DEC-U24; sem API e sem migração de clientes.
- Pagamento misto e conciliação separados de venda/receita. PayJoy/Aiva: preço do aparelho e entrada, sem incorporar juros da financeira à receita.
- Desconto depende de margem e limites aprovados; vendedor não altera preço livremente. Ninguém aprova a própria solicitação.
- Nota fiscal solicitada pelo celular, aprovação por dono/gerente e envio digital; automatização depende de provedor e validação fiscal.
- Assistência centralizada com OS e custódia dos aparelhos; produção de chips, ativações, portabilidades, recargas e assistência atribuída corretamente.
- Nogle por contrato oficial verificado; não inventar rotas. PicPay/PagSeguro POS não têm integração automática presumida.
- Loja online/marketplaces usam catálogo e estoque comuns, com reservas e prevenção de duplicidade.
- Cada fato tem efeito idempotente, trilha de auditoria e reversão apropriada. IA não autoriza crédito, pagamento, nota ou desconto.

## 5. Andamento das tarefas iniciais

| Tarefa | Evidência atual | Avaliação |
|---|---|---|
| ORA-001 — ADRs e infraestrutura | ADR-001 e ADR-002 registrados; decisões recentes no arquivo de passagem | Decisões estruturais documentadas; perguntas de ranking/técnico e dependências externas continuam abertas |
| ORA-002 — monorepo e saúde | `apps/plataforma`, `packages/config`, TypeScript, lint, Vitest, Playwright e rota dinâmica `/saude` | Implementada e testada no escopo de esqueleto; não representa sistema operacional completo |
| ORA-003 — CI, ambiente e segredos | Workflow, `instrumentation.ts`, Zod, detector e testes | Implementada com correções REV-003 e REV-004 pendentes |
| ORA-004 — banco inicial | Duas migrations, dez tabelas, reversões e aplicação do zero em PGlite | Código presente/testado; aplicação em Supabase dev é informação do arquivo de passagem, não conferida pelo revisor no serviço |
| ORA-005 — RLS e negativos | 33 testes de banco passam; 4 `todo` de módulos futuros | Fundação parcial: corrigir REV-001/002/005 e ampliar testes; não declarar todos os T1–T12 concluídos |
| ORA-006 — login | Não há telas, cliente Auth nem fluxo de recuperação de senha | Próxima entrega de acesso; sessão por turno e senha recente para ações sensíveis ainda não implementadas |
| ORA-007/008 — catálogo e telas | Ausentes | Desenvolver dentro da stack atual; catálogo inclui custo, histórico de preço, código de barras e preparação online |
| ORA-009 — importador Rein | Ausente | Depende de CSV anonimizado; prévia, erros, aprovação e rastreabilidade antes de gravar |
| ORA-010/011 — estoque e telas | Ausentes | Ledger, IMEI, reserva concorrente, consulta e conferência pelo celular |
| ORA-012 — homologação | Não há artefatos de publicação/configuração operacional versionados | Seguir cPanel/Apache + systemd na família Red Hat 9, conforme decisão recente; DNS/HTTPS e conectividade precisam de aceite |

As dependências de credenciais Supabase e SMTP para ORA-006 estão relatadas no arquivo de passagem. O Codex não verificou seus valores ou presença no servidor. A validação atual de inicialização exige somente o grupo `aplicacao`, coerente com a única rota existente; a ativação do login precisará integrar a validação das dependências efetivamente utilizadas.

## 6. Cobertura do escopo total: 172 requisitos originais

Os números abaixo vêm do backlog original; não são percentuais de conclusão nem novos compromissos de entrega.

| Domínio | Requisitos | O que existe / o que falta |
|---|---:|---|
| Organização e acesso (ORG) | 10 | Estrutura SQL, papéis e RLS parciais; faltam login, gestão por tela/serviço, sessões e expansão completa |
| Catálogo (CAT) | 10 | Não implementado; produtos/variações/tipos, custo, preço histórico, código de barras e publicação online |
| Estoque (INV) | 12 | Não implementado; ledger, IMEI/ICCID, saldos, reservas, transferências e concorrência |
| CRM | 10 | Não implementado; cliente, busca exata auditada e histórico; base inicia vazia |
| PDV (POS) | 16 | Não implementado; venda móvel, itens mistos, descontos, aprovações, cancelamento e devolução |
| Pagamentos e caixa (PAY) | 14 | Não implementado; meios mistos, financeira, link, confirmação, caixa e conciliação |
| Financeiro (FIN) | 10 | Não implementado; recebíveis, repasses, taxas e distinção entre receita e recebimento |
| Metas e comissões (PERF) | 10 | Não implementado; turno, produção por categoria, metas, regras versionadas e estornos |
| Fiscal (FISC) | 10 | Não implementado; solicitação, aprovação, provedor homologado, envio e contingência |
| Ora Connect (CONNECT) | 11 | Não implementado; contrato Nogle parcial em documentação, sem adaptador operacional |
| Loja online (ONLINE) | 8 | Tipo de unidade online no banco; vitrine, carrinho, pedido e entrega ausentes |
| Marketplaces (MKTPL) | 8 | Não implementado; Mercado Livre/TikTok no plano, Shopee depois |
| WhatsApp (WHATS) | 8 | Não implementado; API oficial, consentimento, mensagens e avisos |
| Meta Ads (META) | 6 | Não implementado; credenciais, coleta e atribuição previstas para etapa posterior |
| IA | 7 | Não implementada; assistência supervisionada, sem decisões financeiras/fiscais autônomas |
| Relatórios (REPORT) | 8 | Não implementados; exigir rastreabilidade até os fatos de origem |
| Qualidade e operação (QUAL) | 14 | CI, testes, detector e migrations presentes; faltam correções, observabilidade, restauração comprovada, contingência e homologação |

Assistência/OS é parte explícita das decisões recentes, embora não apareça como um domínio próprio nesse backlog original. Deve ter tarefas rastreáveis e aceite sem desaparecer entre CRM/PDV/estoque. Não a considerar implementada por existir o papel `tecnico`.

O `backlog.json` continua com status inicial `planned-not-implemented` em todos os itens. Ele é baseline de requisitos, não quadro atualizado de execução. ORA-002/003/004/005 são tarefas do plano, distintas dos IDs de requisito ORA-ORG-*, ORA-QUAL-* etc. Não marcar requisitos inteiros como prontos só pela existência dessas tarefas.

## 7. Defeitos e limitações comprovados

| ID / issue | Prioridade | Resultado observado | Correção esperada na stack atual |
|---|---|---|---|
| [REV-001 / #2](https://github.com/oraconect5g-boop/sistema-ora5g/issues/2) | P1 | Admin/dono de A lê perfil exclusivo de B; também foi possível enumerar perfil sem vínculo | Nova migration SQL para correlacionar leitura ao escopo organizacional; preservar autoleitura e gestão autorizada |
| [REV-002 / #3](https://github.com/oraconect5g-boop/sistema-ora5g/issues/3) | P1 | Evento de B sem unidade fica visível para administrador de A | Propriedade organizacional explícita do evento e política de leitura; manter auditoria imutável |
| [REV-003 / #4](https://github.com/oraconect5g-boop/sistema-ora5g/issues/4) | P2 | Push da main pula a varredura histórica; adicionar/remover segredo fictício passa na leitura do estado final | Cobrir intervalo de commits de push e PR no workflow e detector existentes |
| [REV-004 / #5](https://github.com/oraconect5g-boop/sistema-ora5g/issues/5) | P2 | Validador aceita JWT fictício com papel service_role no campo público | Validação explícita da chave pública no módulo TypeScript/Zod antes de consumir o campo no navegador |
| [REV-005 / #6](https://github.com/oraconect5g-boop/sistema-ora5g/issues/6) | P2 | Encerrar vínculo de papel inativo falha com 23514 | Ajustar gatilho por nova migration para permitir encerramento sem permitir criação/reabertura indevida |
| [REV-006 / #7](https://github.com/oraconect5g-boop/sistema-ora5g/issues/7) | P3 | Mesmo dono em duas organizações falha com 23505 | Incluir organização na unicidade; preservar bloqueio de duplicatas locais |

As issues contêm reprodução, impacto, requisitos relacionados e critérios de aceite. As duas primeiras foram demonstradas com as duas organizações fictícias do cenário de teste. Há uma organização operacional prevista hoje; não foi comprovado vazamento real. REV-006 é limitação de expansão e não impede as 14 lojas de uma única organização.

REV-004 comprova uma falha no validador, não autenticação de JWT fictício nem exposição real de chave. O cliente Supabase ainda não está implementado. Nenhuma credencial real foi usada ou publicada.

### Observações técnicas adicionais

- O validador de URL rejeita `localhost`, mas aceita um literal IPv6 como `http://[::1]:3100`. Reforçar essa regra antes da homologação IPv4 da ORA-012; o nome interno `enderecoIpv4` não garante essa restrição.
- O build passa com aviso de `process.exit` em código analisado para Edge. A função retorna quando não está no runtime Node, e o encerramento sem ambiente foi testado; não há prova de falha funcional no alvo Node da VPS.
- Os scripts atuais usam porta 3100, adequada à homologação. A ORA-012 precisa definir comandos/configuração de produção em 30xx e isolamento entre ambientes.
- Os testes de banco são PostgreSQL em memória via PGlite, com Auth simulado. Provam o SQL testado, mas não substituem teste de integração do Supabase Auth/Data API e da sessão real.
- A auditoria atual registra seleção/tentativa de unidade. Não existe ainda uma implementação completa da auditoria dos futuros serviços de alteração de usuário, papel, venda ou pagamento.

## 8. Acertos que devem ser preservados

1. Stack consistente, TypeScript estrito, versões diretas fixadas e instalação reproduzível.
2. Rota de saúde dinâmica, sem afirmar verificar banco ou integrações inexistentes.
3. Interface em português, idioma HTML e verificação em 360 px e 1280 px.
4. Bind dos comandos do aplicativo em 127.0.0.1.
5. Negação de escrita direta para usuário autenticado nas tabelas de acesso; nenhum acesso anônimo liberado por padrão.
6. RLS, checagem de perfil ativo, vigência de vínculos, seleção de unidade por sessão e testes de bloqueio.
7. Funções privilegiadas com search_path vazio e privilégios de execução explícitos.
8. Auditoria protegida contra alteração/exclusão pelo fluxo normal; reversão destrutiva claramente limitada a bancos sem dados reais.
9. Modelo de unidade já contempla loja física, online, assistência e depósito.
10. Integrações externas ainda não implementadas não foram apresentadas como funcionando.

## 9. Evidências de validação

Execução local da revisão no commit indicado, com Node 22.23.4, instalação limpa e dados fictícios:

| Verificação | Resultado |
|---|---|
| npm ci | Passou |
| npm run segredos, nos arquivos obtidos do GitHub | Passou; nenhuma ocorrência detectada pelo scanner atual |
| npm run lint | Passou; avisos informativos da configuração Next em pacotes sem páginas |
| npm run typecheck | Passou |
| npm test | 69 passaram: 4 aplicação, 33 banco, 32 configuração; 4 todo no banco |
| npm run build | Passou; /saude dinâmica; aviso Edge citado acima |
| npm run test:e2e | 11 passaram, 1 pulado intencionalmente no projeto celular para não duplicar o teste de inicialização |
| npm audit --omit=dev | Zero vulnerabilidades reportadas |
| npm audit completo | 8 alertas moderados na cadeia de lint/minimatch, já relatados no PR original |
| Testes adversariais adicionais de banco | 5 falharam conforme esperado, demonstrando 4 causas distintas: perfis (2 testes), auditoria, vínculo de papel inativo e unicidade entre organizações |
| Checagens adicionais de configuração/histórico | Campo público aceita JWT fictício privilegiado; URL IPv6 aceita; scanner histórico encontra segredo fictício ausente no estado final |

Os testes adversariais foram temporários e não foram integrados como testes vermelhos ao código do produto. As correções devem incluir as regressões correspondentes e deixá-las verdes.

[CI da main, execução 42380089530](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42380089530): sucesso; a etapa de histórico do PR foi pulada por ser evento push. A aplicação deve continuar passando a suíte existente depois das correções.

## 10. Cronograma e avanço desejado

A análise é de **07/11/2026**. A primeira semana do plano detalhado começa em **09/11**, e o marco do mês 1 vai até **04/12/2026**. Não há fundamento para afirmar atraso a partir desta fotografia. Também não há velocidade medida que permita garantir o prazo de seis meses ou declarar um percentual confiável de conclusão.

| Marco desejado | Situação nesta revisão | Dependência para aceitar |
|---|---|---|
| Mês 1, nov–dez | Fundação iniciada; login/catálogo/importador/estoque ausentes | Vendedor de teste entra no celular, escolhe Santa Cândida e consulta estoque importado/conferido em homologação |
| Mês 2, dez–jan | Não implementado | PDV, pagamentos mistos/link, caixa, desconto por margem e solicitação/aprovação de nota; venda completa testada |
| Mês 3, jan–fev | Não implementado | Piloto paralelo com Rein oficial, 2–4 semanas de fechamentos reconciliados, produção/OS e primeiras integrações Nogle |
| Mês 4, fev–mar | Não implementado | Fiscal homologado, ativação/recarga e conciliação; go/no-go antes de desligar Rein na piloto |
| Mês 5, mar–abr | Não implementado | Ondas 3 → 7 → 14, Mercado Livre e vitrine em homologação conforme plano |
| Mês 6, abr–início de mai/2027 | Não implementado | TikTok Shop, loja básica com entrega, WhatsApp oficial, operação estável e restauração de backups comprovada |
| Depois | Mantido no backlog | Shopee, atribuição Meta avançada, IA e BI avançados |

O plano detalhado de início ainda tem status de proposta; esta análise usa suas datas como referência desejada, sem transformá-las em compromisso aprovado. Não antecipar aparência de ERP completo usando telas de demonstração.

## 11. Divergências documentais e como evitar retrabalho

| Texto antigo | Decisão/evidência mais recente | Orientação |
|---|---|---|
| Codex implementa telas e Claude implementa banco, com alternância | AGENTS/CLAUDE, ADR-001 §2.7 e arquivo de passagem: Claude programa; Codex revisa; pedido atual acrescenta análise sênior | Usar os papéis fixos atuais |
| ORA-012 com Ubuntu, Docker/Caddy e somente 22/80/443 | ADR-001 §4A: manter cPanel; família Red Hat 9, Apache e systemd; SSH configurado em 22022 no arquivo de passagem | Não reinstalar a VPS ou fechar portas de serviços existentes por seguir o plano antigo |
| API Rein em pesquisas antigas ou importação limitada a produtos/preços | DEC-U24 inclui estoque por CSV; API continua vedada | Implementar importador com prévia e aprovação |
| Todo P0 equivale ao primeiro piloto | Plano recente recorta por fase e mantém seis meses como objetivo do núcleo | Não tentar implementar os 172 requisitos antes de validar a piloto |
| Backlog inteiro marcado como não implementado | Monorepo, CI e fundação SQL existem | Atualizar rastreabilidade por requisito e evidência; não marcar tudo pronto por tarefa de fundação |
| Toda nota precisa de aprovação, sem detalhar obrigação legal | Regra fiscal deve ser homologada e cumprir prazo legal | Aprovação interna não suspende obrigação de emissão |
| Aplicação de migration no Supabase relatada como concluída | Codex comprovou execução local em PGlite e consultou o GitHub | Distinguir execução local, relato do programador e homologação do serviço real |

Os textos históricos permanecem como referência de evolução. Esta análise registra a precedência para que uma orientação antiga não seja aplicada como decisão atual. Este PR acrescenta somente o relatório; os arquivos de instruções e os planos anteriores não foram alterados e ainda precisam ser consultados considerando essa precedência.

## 12. Próxima sequência recomendada

1. Claude corrige REV-001/002 com novas migrations e testes de isolamento. Corrige também REV-004 antes de colocar a chave pública em uso no login.
2. Ajustar REV-003 no CI para refletir o fluxo de merges atual; tratar REV-005 com regressão. REV-006 pode acompanhar uma migration de acesso ou ficar planejada para expansão.
3. Entregar ORA-006 em TypeScript/Next.js/Supabase: login por e-mail, recuperação neutra, seleção de unidade, sessão por turno, bloqueio e revogação. Usar a sessão do usuário nas requisições; chave privilegiada não substitui RLS.
4. Entregar catálogo e UI (ORA-007/008), com custo e preço histórico preparados para desconto por margem.
5. Validar amostra CSV anonimizada; implementar prévia/importação (ORA-009), depois ledger de estoque/IMEI e testes de concorrência (ORA-010/011).
6. Preparar ORA-012 com a infraestrutura escolhida, DNS/HTTPS, portas, ambientes separados e teste de integração com Supabase. Registrar evidência de homologação pelo celular.
7. Só então avançar ao aceite de PDV e caixa; iniciar em paralelo as definições de fiscal, Nogle e canais cujas aprovações externas podem comprometer os marcos seguintes.

Decisões pendentes continuam visíveis: ranking, acesso do técnico, regras de repasse das financeiras, provedor/tipo fiscal e contador, tipo da chave Nogle, CNPJ/estoque/frete da loja online e confirmação de DNS. Ver o arquivo de passagem para o estado mais recente; não solicitar valores de credenciais no chat.

## 13. Contrato de análise e entrega para os dois agentes

Cada tarefa/correção deve registrar:

1. Decisão e requisito atendido; escopo incluído e excluído.
2. Commit e arquivos analisados/alterados, na stack vigente.
3. Defeito reproduzido ou comportamento novo observável; distinguir hipótese, lacuna planejada e falha comprovada.
4. Impacto em unidade, usuário, autorização, auditoria e, quando aplicável, estoque, dinheiro, fiscal e integrações.
5. Teste do fluxo positivo, da negação, da falha e da concorrência/idempotência pertinentes.
6. Resultado local e CI separados; limitações e dependências explícitas.
7. Estratégia de migration compatível e reversão/roll-forward, sem perder dados ou auditoria.
8. Atualização do arquivo de passagem, da issue e da matriz requisito → tarefa → commit/PR → teste → aceite.
9. Revisão do Codex depois da implementação pelo Claude. Correção proposta não é correção concluída.
10. Deploy conforme processo e aprovação do proprietário; este documento não autoriza publicação.

## 14. Limites e manutenção desta análise

A cobertura corresponde ao código/configuração da main no commit informado e ao lockfile; não é uma auditoria manual linha por linha de dependências de terceiros ou de todas as branches históricas. O protótipo HTML é referência visual sem conexão à aplicação operacional; imagens e vídeos não são evidência de módulos implementados.

As conclusões valem para esta fotografia. Ao corrigir uma issue, atualizar resultado, commit e evidência sem apagar a constatação original. Se a main avançar, comparar os novos commits antes de reaproveitar este parecer. Os resultados desta revisão não permitem afirmar que produção está publicada, que sofreu invasão ou que está indisponível.

## 15. Revisão complementar da evolução até a152516d

Durante a documentação, a main recebeu nove commits depois da fotografia inicial: regras de domínio, demonstração, login, scripts de homologação, alinhamento/rastreabilidade e duas correções do vigia. Esta seção atualiza o andamento; não deve ser lida como implantação ou aceite de produção.

### 15.1 Estado atual comparado ao plano

| Área | Evolução verificada no código | O que ainda falta |
|---|---|---|
| Stack | TypeScript/React/Next.js/Node/PostgreSQL mantidos; Tailwind, Lucide e clientes Supabase com versões fixadas acrescentados | Nenhuma mudança de linguagem recomendada |
| ORG / ORA-006 | Login por senha no servidor, mensagem neutra, cookies SSR, /conta com getUser e consultas ao RLS | Recuperação, seleção da unidade na sessão, limite por turno, fluxo de usuário de teste e correção da renovação SSR |
| CAT | Tipos de item e validadores no pacote dominio; telas e produtos fictícios | Catálogo persistente, custo/preço histórico, busca real e ADR-003 |
| INV | Validação de IMEI/ICCID e seleção simulada na demonstração | Ledger, unicidade, saldo/reserva real, transferências e concorrência no banco |
| CRM | Telas e busca em dados fictícios | Busca exata real, auditoria da consulta, autorização e cadastro/histórico |
| POS | Regras compartilhadas, carrinho e conclusão demonstrativa | Corrigir valores monetários, revalidar no servidor, persistir operação e garantir idempotência |
| PAY | Regra de pagamento misto/financeira e troco com testes | Corrigir limites/inteiros; pagamentos, repasses e confirmação externa reais |
| FIN | Tela demonstrativa | Recebíveis, caixa, conciliação e lançamentos persistentes |
| PERF | Contagem pura por categoria e confirmação telecom | Ledger idempotente, turnos, metas e regras reais de comissão |
| FISC | Fila/telas demonstrativas | Provedor, contador, matriz legal, solicitação/aprovação e emissão reais |
| CONNECT | Demonstração de consultas/operações | Adaptador Nogle, contrato completo e testes autorizados |
| ONLINE / MKTPL | Demonstração de canais | Loja, pedidos, reservas, frete e adaptadores externos |
| WHATS / META / AI | Não há integração operacional | Credenciais/contratos, consentimentos e implementação nas fases previstas |
| REPORT | Painéis com selo fixo de demonstração | Números reais e rastreabilidade até os fatos persistentes |
| QUAL | 110 testes existentes, E2E ampliado e rastreabilidade gerada/conferida no CI | Novas regressões, testes de sessão real, restauração, observabilidade, auditoria completa e homologação |
| ORA-012 | Scripts e configuração de proxy versionados; correção de herança das travas presente | Publicação externa e supervisão dependem do proprietário; robustez de publicação e rollback precisam de melhoria |

As tabelas operacionais de venda, pagamento e estoque continuam ausentes. A demonstração é identificada, não persiste dados e é desativada em produção. Ela é avanço de UX, não comprovação de operação real.

A documentação nova do Claude foi consultada: [análise do plano](../alinhamento/ANALISE_DO_PLANO.md), [pedido ao Codex](../alinhamento/PEDIDO_DE_REVISAO_CODEX.md), [rastreabilidade](../alinhamento/RASTREABILIDADE.md) e status-requisitos.json. Concordância com o escopo geral e a stack não significa aprovação irrestrita dos aceites: os achados bloqueantes precisam ser corrigidos.

### 15.2 Achados adicionais e efeitos nos já registrados

- **REV-007 / [#9](https://github.com/oraconect5g-boop/sistema-ora5g/issues/9), bloqueante de dinheiro:** lerReais('1.000') e lerReais('1.000.000') retornam 100 centavos. O primeiro valor deveria ser 100000 e o segundo 100000000.
- **REV-008 / [#10](https://github.com/oraconect5g-boop/sistema-ora5g/issues/10), bloqueante de dinheiro:** entrada financeira de 0.5 centavo é aceita; validarItem aceita desconto negativo e preço NaN; leitura de reais não rejeita inteiro inseguro.
- **REV-009 / [#11](https://github.com/oraconect5g-boop/sistema-ora5g/issues/11), importante de sessão:** escrita de cookie na renderização é ignorada e não existe proxy de renovação. Revisão estática confrontada com a documentação oficial; não foi testada expiração com usuário real.
- **REV-010, importante na demonstração:** ehPerfil usa o operador in, aceitando constructor, __proto__ e toString. Teste HTTP local: trocar para constructor faz /demo responder 500; sem cookie, responde 200. Não concede acesso a dados reais, mas quebra a demonstração.
- **REV-011, importante de rastreabilidade:** ORA-QUAL-002 e ORA-QUAL-004 aparecem como feito apesar dos defeitos abertos; ORA-ORG-006 ainda diz que falta login na aplicação, embora o login parcial já exista. Atualizar status e evidência pelo gerador, sem editar o Markdown gerado manualmente.
- **REV-012, importante de operação:** publicar.sh instala dependências sobre a cópia em uso, para o serviço e só depois gera a build. Uma falha de instalação/build não tem retorno automático ao artefato anterior. É risco derivado do script, não diagnóstico de queda real na VPS.
- **REV-013, importante de aderência da UX:** o PDV da demonstração exibe a margem resultante ao vendedor; o ADR-002 permite apenas indicar limite/aprovação. A busca demonstrativa aceita final de CPF/telefone, enquanto o fluxo real exige busca exata e auditada. Dados são fictícios; não foi demonstrado vazamento real. Alinhar o protótipo antes de transformá-lo em interface real.
- **REV-014, importante de diagnóstico:** /conta descarta os campos error das consultas e apresenta falha de perfil/unidades como ausência de cadastro/vínculo. Distinguir erro do serviço de resultado vazio, com mensagem segura e diagnóstico sem segredo.

REV-001 a REV-006 permanecem aplicáveis: os arquivos SQL e o validador apontados não mudaram nessa evolução; o workflow ainda pula o histórico no evento push. A nova configuracaoSupabase lê URL/chave com trim e não usa o grupo de validação Supabase. Com o login em uso, integrar essa validação passa a ser requisito imediato, sem exigir chave privilegiada para requisições de usuário.

A ausência de SUPABASE_SECRET_KEY ou DATABASE_URL não bloqueia por si só o login por senha via API pública: esse fluxo usa URL, chave pública e Auth. São dependências de worker/migrations/acesso SQL quando esses recursos forem usados. A análise do Claude mistura esses grupos no bloqueio B1; corrigir a documentação sem solicitar ou expor valores.

### 15.3 Evidência adicional desta revisão

| Check em a152516d | Resultado local |
|---|---|
| Instalação limpa, scanner de arquivos, lint, tipos e build | Passaram |
| Testes existentes | 110 passaram: 4 aplicação, 33 banco, 32 configuração, 41 domínio; 4 todo no banco |
| E2E | 28 passaram; 4 pulados: 2 testes de credenciais Supabase sem configuração e 2 duplicações intencionais dos testes auxiliares no celular |
| Rastreabilidade gerada | --conferir passou com o conteúdo original preservado, inclusive suas quebras de linha |
| Auditoria de produção | Zero vulnerabilidades reportadas |
| Sintaxe dos dois scripts de homologação | bash -n passou; scripts não executados no servidor |
| Testes adversariais adicionais | 9 testes falharam conforme esperado: 3 de leitura/limite de reais, 3 de validação monetária e 3 de perfil herdado |
| Cookie de perfil herdado | /demo retornou HTTP 500 com constructor; sem cookie, HTTP 200 |
| Sessão real e implantação | Não testadas: sem uso de credenciais reais, sem acesso à VPS, sem ligar tarefa persistente |

[CI da main em a152516d](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42383556054): sucesso. CI não comprova os testes pulados nem os novos casos adversariais. Não é possível certificar estabilidade da sessão real ou da implantação por essa execução.

### 15.4 Ordem recomendada atualizada

1. Corrigir as duas falhas de isolamento SQL e as regras monetárias (REV-001/002/007/008); endurecer a configuração do login (REV-004).
2. Concluir sessão SSR e ORA-006, além de tratar auditoria automática de acesso e as demais correções importantes.
3. Atualizar a rastreabilidade honestamente e revisar/aceitar ADR-003.
4. Implementar catálogo, importação CSV em prévia e estoque/IMEI concorrente; substituir as telas demonstrativas uma a uma.
5. Homologar por fluxo real e por usuário/perfil no celular, sem reutilizar o cookie de demonstração como autorização.
6. Manter o restante do plano de seis meses e suas dependências externas visíveis. A linguagem e o escopo de negócio permanecem os mesmos.

O registro estruturado para o Claude está em [REVISOES_CODEX.md](../alinhamento/REVISOES_CODEX.md), no caminho previsto pelas instruções atuais dos agentes. Ele complementa esta análise histórica e evita exigir alteração ampla dos arquivos de instruções.

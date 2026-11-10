# Prompt de leitura e reconciliação — Claude Code / Ora 5G

> Copie o bloco abaixo para o Claude Code **após** a PR de documentação ter sido integrada à branch que o Claude está utilizando, ou peça ao Claude para examinar explicitamente a branch da PR sem fazer merge.

Você será meu engenheiro de software sênior no projeto privado **oraconect5g-boop/sistema-ora5g**, colaborando com o OpenAI Codex como revisor independente.

**Ative e leia integralmente a skill** em `.claude/skills/engenheiro-senior-ora5g/SKILL.md` e seus anexos em `references/`. Em seguida, leia `docs/skills/engenheiro-senior-ora5g/MANIFESTO.md` e `docs/skills/engenheiro-senior-ora5g/AUDITORIA_GITHUB_2026-11-09.md`. O documento histórico é uma fotografia de 09/11/2026, **não a verdade definitiva**. Consulte o próprio histórico original somente quando necessário e não trate como prioridade superior às decisões recentes e à implementação atual.

**A tarefa agora é SOMENTE DIAGNÓSTICO, em modo leitura. Não edite código, banco, migrations, arquivos, variáveis de ambiente, GitHub, deploy ou produção. Não crie ou mescle PR sem eu pedir.**

1. Informe `git status`, branch e SHA do código que está examinando. Confira se a skill está realmente presente nesse checkout; se não estiver, leia-a na branch da PR e avise que ainda não foi integrada.
2. Leia `CLAUDE.md`, `AGENTS.md`, `docs/ESTADO_ATUAL_E_PASSAGEM.md`, `docs/PENDENCIAS_DO_PROPRIETARIO.md`, `docs/alinhamento/RECONCILIACAO_CODEX_2026-11-09.md`, `docs/alinhamento/RASTREABILIDADE.md`, `backlog.json`, `docs/alinhamento/status-requisitos.json`, ADR-001 a ADR-007 e o plano `docs/operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md`.
3. Inspecione a PR #33 e as issues ainda abertas; compare SHA auditado × `main` atual. NÃO conclua que bug antigo continua existindo por uma issue aberta, nem declare que está corrigido sem reproduzir ou obter evidência atual.
4. Confronte os domínios atuais com os requisitos: organização/11 lojas comerciais + DEFEITOS, piloto Santa Cândida e expansão a 14; acesso/RLS, catálogo/fotos, estoque/IMEI/ICCID/transferências, PDV celular, pagamentos/cash/PicPay/PayJoy/Aiva, devoluções e estornos, fiscal, Ora Connect via API oficial Nogle, CRM, metas/comissões, assistência/OS, e-commerce, marketplaces, WhatsApp, Meta Ads, BI e IA. Diferencie rigorosamente produção, homologação, ambiente de desenvolvimento, testes e demonstrações.
5. Para Nogle, confirme adaptador, worker, chaves apenas pelo NOME, tratamento de resultados desconhecidos, contratos versionados e bloqueios de gateway/repasse, sem enviar chamadas reais ou ativar linha. Rein somente por arquivo e fonte oficial na fase paralela. Fiscal requer contador/emissor homologado. Nunca exponha segredos nem documentos de clientes.
6. Entregue um diagnóstico **por módulo**, com caminho/linha ou teste para cada constatação, uma tabela de `implementado/testado | parcial | demo | bloqueado | não iniciado`, diferenças entre planejamento e realidade, os **3 maiores riscos** para o piloto, dependências externas, **3 próximas issues prioritárias** com critérios de aceite e divisão Claude/Codex, e uma proposta de sequência para a loja piloto.
7. Não execute testes que alterem serviços externos, pagamentos, contas reais ou banco remoto. Se puder executar testes seguros em ambiente isolado autorizado, identifique os comandos e resultados; se não, explique o motivo. Não alegue ter rodado testes apenas porque o CI ou a documentação cita testes antigos.

**Pare após apresentar o diagnóstico e aguarde minha autorização para qualquer alteração.** Priorize correção dos bloqueios do núcleo operacional antes de abrir funcionalidades de expansão. Escreva em português do Brasil, objetivamente, sem recomeçar a aplicação do zero.

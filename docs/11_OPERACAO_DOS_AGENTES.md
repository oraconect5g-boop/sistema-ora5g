# 11 — Coordenação Claude Code × OpenAI Codex

## Princípio
**Dois agentes no mesmo projeto, nunca dois agentes mudando o mesmo domínio/arquivo/schema sem coordenação.** Os dois não constituem substituto para auditor fiscal, contador, especialista em meios de pagamento, segurança ou validação de colaboradores da loja.

## Papéis padrão (podem alternar por issue)
| Atividade | Executor inicial | Revisor independente | Aceite |
|---|---|---|---|
| ADRs, contratos de domínio, modelagem | Claude Code | Codex | Proprietário/área especialista |
| Interfaces e componentes | Codex | Claude Code | Vendedor/gerente piloto |
| Fluxos críticos PDV/estoque/financeiro | Claude Code | Codex + testes adversariais | Gestor, financeiro |
| Integrações via adapter | Claude Code | Codex | Responsável técnico do fornecedor |
| Testes E2E, perf, CI | Codex | Claude Code | Engenharia + área piloto |
| Segurança e RLS | Claude Code + Codex | Revisor humano quando crítico | Responsável de segurança |
| Fiscal/nota/Crédito | Agente responsável por issue | Outro agente | Contador/jurídico/financeiro |
| Infra/deploy produção | Engenheiro/agent | Outro agente | Aprovação humana obrigatória |

## Sequência de trabalho por issue
1. O Product Owner valida escopo e critério de aceitação; associar ID `ORA-...` e fase.
2. Claude Code ou Codex faz `git fetch`, lê `AGENTS.md`, `CLAUDE.md`, ADRs, requirements e inspeciona código existente.
3. Criar branch `feature/ORA-...-slug` e/ou worktree isolada.
4. Escrever plan de impacto: arquivos e dados, API/contrato, RBAC, teste, rollback.
5. Implementar e executar `lint`, `typecheck`, unit/integration/E2E necessários; sem simular CI.
6. Fazer PR com matriz requisito→arquivo→teste→evidência→aceite.
7. Outro agente realiza code review real, tenta casos negativos, pede correções.
8. Humanos aprovam mudanças de produto/custo/segurança/fiscal/banco/deploy.
9. Deploy staging; validar logs, métricas e invariantes; registrar go/no-go.

## Template de issue
```markdown
### ORA-XXX-000 — Nome da funcionalidade
**Contexto e objetivo:**
**Decisão/ADR:**
**Prioridade e etapa:**
**Perfis e loja envolvidos:**
**Pré-condições:**
**Fluxo feliz:**
**Falhas, concorrência, idempotência e reversões:**
**Integrações externas e documentação oficial:**
**Critérios de aceitação observáveis:**
**Testes (unit/integration/e2e/security):**
**Não escopo:**
**Responsável Claude Code/Codex; Revisor outro agente:**
**Aprovação humana necessária:**
```

## Template de PR
```markdown
### Resumo e Issue
- Requisitos atendidos:
- Decisões/ADRs relacionadas:
### Arquivos e contratos alterados
- UI/backend/db/worker/API:
- Migrations: sim/não — compatibilidade e plano de restauração:
### Testes executados e resultados verificáveis
- lint / typecheck / unit / integration / E2E / segurança:
- Cenários negativos e de falha:
### Segurança, LGPD e riscos
- RBAC/RLS:
- Secrets/PII:
- Efeitos em estoque/caixa/fiscal/telecom:
### Release
- Staging evidência:
- Rollback / feature flag:
- Revisão cruzada por:
- Aceite humano por:
```

## Tarefas iniciais sem riscos de produção
1. Fazer **inventário real do repositório** e listar tecnologia/código/testes implementados. Não presumir repositório vazio.
2. Validar requisitos `ORA-ORG-*`, `ORA-CAT-*`, `ORA-INV-*`, `ORA-POS-*` com usuário piloto.
3. Criar ADRs 001–010 (sem rodar migrations), contratos conceituais e estados.
4. Criar estrutura de design system a partir de PNG/HTML, em branch isolada, usando mocks tipados e sem alegar produção.
5. Criar pipeline CI e testes RLS de exemplo, depois implementar organização/lojas/autorização com migrações revisadas.

## Regras de comunicação com o proprietário
- Usar português claro; relatar o que realmente existe vs planejado.
- Explicar impacto financeiro/operacional antes de pedir assinatura ou comprar serviço.
- Não pedir secrets no chat nem oferecer automação de emissão fiscal/crédito sem homologação.
- Toda entrega deve terminar com evidência, limitações, pontos abertos e próximo passo objetivo.

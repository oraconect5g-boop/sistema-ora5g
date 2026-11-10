# Proveniência, integridade e limites — Skill Ora 5G

**Criação:** 2026-11-09. **Objetivo:** guardar contexto do planejamento disponível e permitir continuidade técnica da plataforma no clone **atual**.

## Hierarquia de confiança

1. Decisão explícita e recente do proprietário e aceite formal.
2. Fonte **atual**, inspecionada e executada em contexto autorizado: código do GitHub, testes, banco, provedor externo (cada qual prova dimensões diferentes).
3. ADRs vigentes, documentação de status e critérios de go/no-go.
4. Backlog rastreado e requisitos vigentes.
5. Auditoria estática de 09/11/2026 (snapshot, pode ficar desatualizada).
6. Conversas históricas, três pesquisas, protótipos e hipóteses técnicas anteriores (contexto; não prova de implementação).

## Fontes preservadas

- **GitHub**: `https://github.com/oraconect5g-boop/sistema-ora5g`; não foi copiado nem alterado. Auditoria estática detalhada em `AUDITORIA_GITHUB_2026-11-09.md` e manifesto estruturado em `AUDITORIA_MANIFESTO.json`.
- **Contexto antigo do ChatGPT**: pasta `references/historico/`, contendo reconstrução cronológica da conversa, dossiê mestre anterior, conversa histórica inicial e três relatórios de pesquisa conservados do pacote entregue em 05/11.
- **Dados atualizados do repositório**: documentação `docs/ESTADO_ATUAL_E_PASSAGEM.md`, ADRs, árvore de código, backlog, rastreabilidade, PR #33, 35 issues abertas na data da auditoria.

## Limites auditáveis

Não foi possível exportar uma transcrição oficial completa de todas as conversas históricas do usuário. Os documentos legados e a reconstrução contêm **o contexto disponível** e algumas citações verbatim, não todas as mensagens originais. Nenhuma execução independente de CI/teste local ou acesso a ambiente real ocorreu na auditoria. Nenhuma integração externa foi habilitada. A skill deve verificar novamente o HEAD do GitHub a cada tarefa.

## Segurança

Este pacote é documentação de engenharia para uso **privado**. Não inclui credenciais de servidor, tokens do GitHub, chaves de Nogle ou payloads reais de clientes. Jamais incluir segredos futuros em PRs nem em mensagens a modelos.

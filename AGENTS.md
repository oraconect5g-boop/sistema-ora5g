# AGENTS.md — Orientação para Codex e quaisquer outros agentes

Leia primeiro `docs/ESTADO_ATUAL_E_PASSAGEM.md`; depois `CLAUDE.md`, `README.md` e as especificações de `docs/`. Essas regras são obrigatórias independentemente do agente executor.

**Meta:** desenvolver a plataforma operacional própria da Ora 5G para 14 lojas (piloto 1 loja), móvel e omnichannel, preservando a arquitetura e a integração entre CRM, PDV, estoque, IMEI, telecom, fiscal, financeiro, metas e canais digitais.

## Processo de tarefa
1. Receba uma única issue delimitada, ID de requisito e critérios de aceitação.
2. Inspecione o código existente, os testes, as decisões e as migrações ANTES de editar.
3. Crie branch/worktree individual; não concorra com outro agente no mesmo arquivo ou schema.
4. Planeje contrato de entrada/saída, autorização, estados, tratamento de falhas e testes.
5. Implemente a menor mudança completa. Proibidos endpoints falsos apresentados como reais, permissões apenas no client, mock mascarado como produção, migrations destrutivas não aprovadas e segredos em código.
6. Execute lint, typecheck, testes adequados, revisão de RLS/concorrência nas partes transacionais e E2E quando pertinente.
7. Apresente PR com checklist de aceite, diferenças de schema, riscos, evidências, plano de reversão e dúvidas restantes.
8. Peça revisão cruzada; aguarde aprovação humana para deploy crítico.

## Responsabilidades complementares
- **Claude Code**: pode liderar estrutura de domínio, contracts, regras e backend, e revisar trabalhos do Codex.
- **Codex**: pode liderar UI, testes E2E, automação, hardening ou módulos delimitados, e revisar trabalhos do Claude. Papéis não são exclusivos; alternância por issue é permitida.
- **Proprietário e especialistas**: priorizam requisitos, homologam UX, fiscal, crédito, conciliação e liberam produção.

## Fontes e limitações
A hierarquia é: decisão explícita recente do usuário > regras validadas/ADRs > requisitos propostos > pesquisas históricas > referências visuais > inferências de agentes. Se houver conflito, não faça suposições silenciosas.

## Não-negociáveis
Rein apenas importação por arquivos; Nogle sem endpoints presumidos; PicPay POS sem assumir integração automática; segurança/LGPD; vendedores mobile-first; venda mista por categoria e por pagamento; contabilidade gerencial vs formal separadas; comissão por evento idempotente; auditoria e reconciliação.

## Papéis e acesso ao servidor (decisão do proprietário, 06/11/2026)
- **Claude Code = programador.** Trabalha por SSH no servidor, com o usuário `dev`, na área de desenvolvimento/homologação (portas 31xx). Tem acesso ao `.env` de desenvolvimento e de homologação; nunca exibe valores de chaves em mensagens, logs, commits ou PRs.
- **Codex = revisor.** Não acessa o servidor nem o `.env`. Revisa cada PR no GitHub: confere aderência ao plano e aos ADRs, procura bugs e falhas de permissão, aponta correções. Pode fazer apenas correções pequenas; mudanças maiores voltam ao Claude Code.
- Os dois acompanham o mesmo repositório; todo código passa por branch.
- **Merges (decisão do proprietário, 07/11/2026):** o Claude Code integra na `main` depois de rodar no servidor a sequência completa do CI. O Codex revisa os commits integrados e aponta correções, que voltam ao Claude Code.
- Produção: só por deploy do GitHub Actions aprovado pelo proprietário. Nenhum agente acessa o `.env` de produção.
- Detalhes: `docs/adr/ADR-001-infraestrutura-ipv4-portas-e-ambientes.md`, seção 2.7.

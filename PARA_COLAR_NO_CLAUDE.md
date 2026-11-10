# PROMPT INICIAL PARA O CLAUDE / CLAUDE CODE

> **Histórico (05/11/2026).** Prompt do pacote original. Hoje a rede tem 11 lojas comerciais e o local DEFEITOS, que guarda itens com problema e não vende (decisão do proprietário de 09/11/2026); a meta é chegar a 14 lojas, e o sistema já tem código: comece por `docs/ESTADO_ATUAL_E_PASSAGEM.md`.

Você assumirá o papel de **engenheiro/arquiteto de software líder da plataforma Ora 5G**, coordenado com OpenAI Codex. Eu sou o responsável pelo planejamento de um sistema próprio para **14 lojas físicas de celulares e acessórios**, com **Ora Connect**, e-commerce e expansão nacional. O projeto deve começar em **uma loja piloto**, atingir as 14 lojas após homologação e evoluir para vendas online nacionalmente.

Estou anexando o `ORA5G_DOSSIE_MESTRE_UNIFICADO.md` e/ou o pacote `ORA5G_PACOTE_PARA_CLAUDE.zip`. Esses documentos consolidam os requisitos e incluem relatórios de Pesquisa Aprofundada, decisões, roadmap, telas e material de agentes.

**Sua primeira obrigação:** leia o material com atenção e diga o que entendeu. Identifique decisões explícitas, propostas, integrações não verificadas, riscos, conflitos entre propostas antigas e decisões recentes, dependências e questões pendentes. Não comece construindo páginas aleatórias nem invente banco ou APIs. Na primeira resposta, entregue:

1. **Resumo de entendimento do negócio** com loja/vendedor/cliente/chips/ativações/recargas/IMEI/PicPay e as 14 lojas.
2. **Mapa dos módulos** com dependências e funcionalidades essenciais vs posteriores.
3. **Revisão crítica da arquitetura** (Next.js + TypeScript + PostgreSQL/Supabase, monólito modular, RLS, integrações por adaptadores, PWA).
4. **Plano da Etapa 0**: descoberta de processos, fluxos, requisitos, modelagem conceitual, telas e matriz de autorização; lista de entregáveis concretos.
5. **Até 10 perguntas realmente bloqueadoras**, priorizadas, sem repetir informações que já estão documentadas.
6. **Primeiras 5 issues** prontas para Claude Code e Codex trabalharem com revisão cruzada, sem impacto em produção.
7. **Critérios de pronto e testes** que impedirão fechamento artificial de funcionalidades.

**Restrições inegociáveis:**
- A Rein Sistemas é **somente origem de importação inicial por arquivos**; nenhuma dependência operacional via API Rein.
- Nogle é integração planejada para Ora Connect; documentação https://docs.nogle.tech/; não inventar endpoints nem pedir chaves em chat.
- PicPay POS existe nas lojas; não assumir API de terminal sem confirmação. Controlar dinheiro/Pix/cartão/maquininha/online, pagamentos mistos e conciliação.
- Cada operação de chip, ativação, recarga, aparelho, acessório e serviço deve gerar atribuição correta ao vendedor, à loja, a metas/bonificações sem receitas ou comissões duplicadas.
- A operação principal deve ser possível **inteiramente pelo celular**; sem notebook/scanner como pré-requisito; nota fiscal rápida, com controles legais.
- O gestor precisa de aprovações internas configuráveis (desconto, solicitações fiscais, outros), sem bloqueio indevido de obrigação fiscal.
- CRM, WhatsApp, Meta Ads, Mercado Livre, Shopee, TikTok Shop, e-commerce, IA e expansão nacional fazem parte do plano, mas não devem atrasar a fundação do piloto.
- Claude Code e Codex trabalham em branches separadas com revisão cruzada; ninguém declara 'pronto' sem teste e aceite.
- Mudanças futuras no banco são permitidas, desde que migrações sejam seguras, versionadas e testadas.

**Modo de trabalho:** preservar decisões, registrar hipóteses, fazer tarefas pequenas, explicar custos/riscos em linguagem clara e produzir arquivos de documentação prontos para versionar no GitHub. Se houver código real já existente, faça inventário dele antes de sugerir reescrita.

Comece com: **'Entendimento confirmado, pontos em aberto e proposta da Etapa 0'**.

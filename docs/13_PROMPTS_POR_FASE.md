# 13 — Prompts operacionais prontos para dividir o trabalho

## Etapa 0 — Engenharia de requisitos (Claude Code)
> Leia `README.md`, `CLAUDE.md`, `docs/00_CONTEXTO_E_DECISOES.md`, `docs/01_REQUISITOS.md`, `docs/10_DECISOES_PENDENTES.md`, `docs/12_HISTORICO_E_PROVENIENCIA.md` e os relatórios de pesquisa. Não edite o banco e não implemente telas. Produza uma revisão de consistência, um mapa das jornadas AS-IS/TO-BE, riscos, 10 ADRs propostas, critérios de aceite do piloto e as primeiras issues. Classifique definido, recomendado, pendente e superado. Não repita perguntas que o proprietário já respondeu.

## Etapa 0 — Revisão independente (Codex)
> Audite a proposta do Claude Code usando os 172 requisitos de `docs/01_REQUISITOS.md` e `backlog.json`: identifique omissões, acoplamentos, hipóteses travestidas de fatos, falhas potenciais em estoque/caixa/fiscal, inconsistências de UX mobile e critérios de aceite insuficientes. Faça uma lista de blockers sem implementar código. Proponha testes negativos e de concorrência.

## Etapa 1 — Fundação (Claude Code)
> Após aprovação dos ADRs, verifique o repositório real e implemente de forma incremental a estrutura modular, autenticação, organização/lojas, RBAC/RLS, auditoria e CI. Não use segredos reais; migrations só em ambiente dev e após revisão. Produza testes positivos/negativos de isolamento entre duas lojas. Entregue um PR por tarefa.

## Etapa 1 — Contraprova (Codex)
> Revise IAM, RLS, migrations e pipeline de CI. Teste `store_id` adulterado, IDOR e acesso entre usuários de lojas diferentes, e verifique se nenhuma autorização depende apenas da UI. Documente achados e bloqueie merge em falhas de acesso.

## Etapas 2–3 — Catálogo/importação e estoque (Claude Code)
> Construa importação de produtos e preços Rein SOMENTE por CSV/XLSX (staging/dry-run/validação/dedupe), depois modelo de estoque/IMEI, ledger de movimentos e reserva concorrente. Prove que IMEI não pode ser vendido duas vezes e que estoque da Loja A não é consumido por Loja B. Não implemente API Rein.

## Etapas 4–5 — CRM e PDV móvel (Claude Code/Codex)
> Implemente CRM com cliente 360 e PDV mobile-first usando os PNGs/HTML como referência não vinculante, sem copiar dados fictícios. Faça quatro passos cliente→itens→pagamentos→conclusão, suporte a aparelho/IMEI/acessório/chip/ativação/recarga e pagamento misto. Adicione aprovação de desconto no celular do gerente. Ligue backend só a contratos reais. Construa E2E completos com estados de erro, operação pendente e concorrência.

## Etapas 6–7 — Financeiro, comissões e fiscal (Claude Code/Codex)
> Separe venda/pagamento/liquidação/conciliação; registre PicPay POS manual/arquivo conforme disponível sem supor API. Faça metas, bonificações e performance ledger idempotentes por vendedor/loja/categoria. Para fiscal, faça arquitetura de adapter e fila; emissão real depende de matriz validada por contador/provedor. O gerente controla aprovações internas sem atrasar obrigação legal.

## Etapa 8 — Homologação do piloto (ambos)
> Crie roteiro de UAT e test report verificável para uma loja: login mobile, venda IMEI, dinheiro/Pix PicPay/cartão, fechamento caixa, estoque, nota e comissão. Documente incidentes, processo contingência, suporte, reversão e go/no-go. Nenhuma expansão até aceite do proprietário e especialistas.

## Etapa 9 — Rollout 14 lojas (ambos)
> Transforme a validação do piloto em runbook por unidade: inventário inicial físico, usuários/caixas/maquininhas, fiscal, treinamentos, migração, suporte, monitoramento, go/no-go. Ondas 1+2+4+7 lojas; não duplicar vendas reais em sistemas paralelos nem depender da Rein diariamente.

## Etapa 10 — Integração Nogle (Claude Code implementa, Codex testa)
> Consulte documentação **oficial autorizada** em https://docs.nogle.tech/ e/ou contrato OpenAPI obtido legalmente; inventarie endpoints reais, autenticação e rate limits. Não invente rotas. Implemente adapter tipado com testes de contrato, retries/idempotência, estados de ativação/recarga, logs redigidos, performance por vendedor, repasse e conciliação. Documente bloqueios de acesso sem pedir chaves em chat.

## Etapa 11 — Omnichannel (ambos por adapters separados)
> Implemente gradualmente site/e-commerce, Mercado Livre, Shopee, TikTok Shop, WhatsApp Business e Meta Ads usando contratos oficiais verificados, conta/escopos autorizados, LGPD e stock reservation central. Desenhe testes de webhook duplicado, venda física concorrendo com pedido externo, reembolso, fees e margem por canal. Separar implementação por PR/adapter, sem arquivos compartilhados simultâneos.

## Etapa 12 — IA (ambos)
> Implemente recursos assistivos supervisionados para lead, WhatsApp e BI. Use base de conhecimento versionada, autorização por perfil, logs redigidos, orçamento, avaliação e handoff humano. Não executar ações de crédito/pagamento/nota/ativação/desconto sem fluxo autorizado e revisão humana. Testar prompt injection, PII e uso fora da função.

## Etapa 13 — Segurança e evolução (ambos)
> Rode testes de carga realista, backup e restore, auditoria RLS, análise de incidentes, revisão de migrations e observabilidade. Meça latência/erros antes de prometer números. Documente DR, contratos de suporte, custos reais e roadmap de melhoria contínua.

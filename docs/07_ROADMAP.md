# 07 — Roadmap por ciclos, etapas, entregáveis e gates

**Atenção:** estimativas indicativas de esforço de planejamento. Não são cronograma contratado, nem somam linearmente (há dependências e sobreposição), e a disponibilidade dos agentes não elimina validações humanas. Prazos devem ser recalibrados após a Etapa 0 e inspeção do ambiente/repositório real.

## Marcos de produto
- **Marco A / MVP operacional da loja piloto:** login/perfis, cadastro de loja, clientes/produtos/preços, importação Rein por arquivos, estoque/IMEI, PDV mobile, pagamentos/caixa, aprovação interna, fiscal aplicável, auditoria, suporte e relatórios básicos. Chip/ativação/recarga com status/atribuição ficam em trilha prioritária conforme acesso Nogle; definir no gate do piloto se operação real depende da integração.
- **Marco B / Operação das 14 lojas:** Marco A estabilizado, transferências/compras/inventários, conciliações, metas/comissões, governança multiunidade, treinamentos e rollout gradual.
- **Marco C / Plataforma expandida:** Ora Connect com integrações homologadas, e-commerce nacional, marketplaces, WhatsApp, Meta Ads, BI avançado, IA e logística/fiscal interestaduais.

## Etapas completas
| Etapa | Duração estimada do estudo anterior | Dependências / entregáveis | Gate de aceite |
|---|---|---|---|
| **0. Engenharia de requisitos** | 2–4 sem | Levantamento nas lojas, mapa AS-IS/TO-BE, inventário fiscal, decisões, wireframes, matriz RBAC, métricas, contrato Nogle a obter | Assinatura de baseline do proprietário e responsáveis de operação |
| **1. Fundação tecnológica** | 3–5 sem | GitHub privado, ADRs, ambientes, Next.js/TS, DB Supabase, auth, CI, logging, testes | CI verde; isolamento de lojas comprovado |
| **2. Cadastros/importação Rein** | 3–5 sem | Empresas/lojas/usuários/cliente, catálogo/preço, CSV/XLSX staging/dry-run | Importação reproduzível; zero dependência operacional Rein |
| **3. Estoque e IMEI** | 5–8 sem | Livro estoque, serial, reserva, contagem, transferências básicas | Teste de concorrência sem IMEI duplicado; inventário piloto conferido |
| **4. CRM** | 4–6 sem | Cliente 360, leads, tarefas, vínculo vendedor/loja, histórico | Lead→cliente→venda rastreável |
| **5. PDV** | 6–10 sem | Carrinho mobile, cliente, IMEI, descontos/aprovação, pagamento misto, caixa, cancelamentos | Vendedor faz venda real no celular com caixa confiável |
| **6. Financeiro/comissões** | 5–8 sem | Contas, liquidação, conciliação, metas e comissões versionadas | Fechamento diário e bonificação sem dupla contagem |
| **7. Fiscal/segurança/conformidade** | 5–10 sem | Provedor fiscal, contingência, LGPD, auditoria, backups | Documentos/status homologados e teste de recuperação |
| **8. Piloto 1 loja** | 4–8 sem | Treinamento, paralelismo controlado, conciliação, incidentes, UAT | Go/no-go documentado com caixa/estoque/fiscal íntegros |
| **9. Rollout 14 lojas** | 6–12 sem | Ondas, treinamento, migração de estoque por contagem e suporte | Critérios por loja; 1 + 2 + 4 + 7 = 14 |
| **10. Ora Connect** | 5–9 sem | Contrato Nogle verificado, chip/ICCID, ativação, recarga, eventos e conciliação | E2E com sandbox autorizado, falhas recuperáveis |
| **11. E-commerce e omnichannel** | 8–16 sem | Site, pedidos, estoque, Mercado Livre/Shopee/TikTok, WhatsApp e Meta conforme fases | Fluxo pedido→estoque→entrega→reembolso válido |
| **12. BI, automações e IA** | 6–12 sem | KPIs avançados, análise de campanhas, IA supervisionada | Métricas reproduzíveis, custo IA controlado, guardrails |
| **13. Consolidação/evolução** | 4–8 sem iniciais, contínua | Testes de carga, DR, observabilidade, governança, escala nacional | SLOs, restauração, suporte e monitoramento aprovados |

**Observação importante:** 10–12 podem ocorrer parcialmente antes do rollout se o piloto comercial precisar de telecom/WhatsApp; planejar por dependências reais. Financeiro, fiscal, segurança e indicadores básicos têm trabalho transversal desde o início — não deixar tudo para etapas finais.

## Primeiros 7 dias
1. Confrontar documentos com operações reais: escolher loja piloto, entrevistar gerente/vendedor/caixa, financeiro, fiscal e responsável Ora Connect.
2. Inventariar equipamentos, conexão, fechamento de caixa, maquininha PicPay, etiquetas/códigos, regras de desconto, termos PayJoy, nota fiscal e jornadas de chip/recarga.
3. Inventariar exports de produtos/preços da Rein (sem credenciais/APIs); testar amostras **fictícias ou anonimizadas**.
4. Verificar acesso autorizado à documentação Nogle e contrato da empresa; nunca pedir chaves em mensagem.
5. Capturar telas de referência e aprovar a navegação básica (login, vendedor, gerente, PDV, estoque, fiscal).
6. Definir critérios de aceite e decisões pendentes críticos; registrar responsáveis e riscos.
7. Criar GitHub privado e primeiras ADRs / issues documentais, com Claude Code implementando documentação e Codex revisando.

## Primeiros 30 dias (plano granular)
- **Semana 1:** fluxo AS-IS, perfis, equipamento, operação piloto.
- **Semana 2:** PRD e arquitetura TO-BE, protótipos e contratos conceituais, matriz de permissão, decisões de saldo/estoque/fiscal.
- **Semana 3:** repositório, ambiente dev/staging, CI, auth inicial, regras AGENTS/CLAUDE.
- **Semana 4:** cadastro org/loja/usuário, catálogo inicial, importador Rein com modo dry-run e testes, revisão de arquitetura antes de avançar.

## Primeiros 90 dias
- **Dias 1–30:** base documental aprovada, backlog e setup real da engenharia.
- **Dias 31–60:** IAM, lojas, catálogo e importador, testes de RLS, estoque/IMEI prototipado e schema auditado.
- **Dias 61–90:** movimentos, reserva e concorrência de estoque; primeira jornada end-to-end PDV com meios de pagamento simulados em staging, sem assumir implantação real; plano de homologação fiscal e Nogle validado.

## Estimativas de calendário discutidas anteriormente
| Capacidade | Piloto real | Plataforma expandida |
|---|---|---|
| Um desenvolvedor experiente com IA e especialistas pontuais | ~9–15 meses | ~18–30 meses |
| Proprietário desenvolvendo sobretudo com Claude Code/Codex enquanto aprende | ~12–24 meses | ~24–36 meses ou mais |
| Equipe experiente de 3–5 profissionais, paralelismo coordenado | ~6–10 meses | ~12–20 meses |

Outros relatórios históricos mencionam horizonte de **10 meses** como programa de engenharia. Isso é **cenário de equipe/capacidade**, não prazo garantido nem compromisso já assumido. Reavaliar após definir requisitos e alocação reais.

## Rollout e aceite por onda
**Piloto 1 loja → +2 lojas (3 no total) → +4 (7) → +7 (14).**
Antes de cada onda: inventário físico assinado, configuração fiscal/local, cadastro de funcionários, sessão de caixa e POS, treinamento, backup/rollback, suporte, contingência e reconciliação das primeiras operações. A loja recém-ativada não deve consumir estoque da loja ainda não migrada sem reconciliação.

## Critérios go/no-go (mínimo)
- Zero duplicidade conhecida de IMEI/venda/pagamento após testes concorrentes.
- Fechamento de caixa, conciliação POS e relatórios comerciais batem com amostras auditadas.
- Documentos fiscais legalmente requeridos são emitidos de forma homologada e pendências visíveis.
- Permissões multi-loja testadas; segredos e dados de cliente protegidos.
- Contingência, help desk e procedimento de retorno ao sistema anterior durante piloto definidos.
- Usuários reais completam PDV no celular, e gerente consegue revisar aprovações.
- Backup e restauração demonstrados em staging; monitoração e responsáveis ativos.

## Gestão de custos
A filosofia é começar econômico e só aumentar custos após uso comprovado. Gastos potenciais: GitHub/IA, Supabase, deploy/servidor, backup independente, provedor fiscal, WhatsApp, Meta, adquirentes, serviços de email/SMS, integrações marketplace e monitoramento. Valores de mensalidades contidos em pesquisas antigas exigem cotação atualizada e **não devem ser adotados como orçamento fechado**. Separar sempre licenças dos agentes de custos de API de IA e das tarifas transacionais de pagamento/mensageria.

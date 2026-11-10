# 00 — Contexto, objetivo, escopo e decisões

> **Atualização de 10/11/2026:** a DEC-U02 foi superada. Hoje a rede tem 11 lojas comerciais e o local DEFEITOS, que guarda itens com problema e não vende (decisão do proprietário de 09/11/2026); a meta é chegar a 14 lojas. Decisões posteriores: [ETAPA_0_DECISOES_2026-11-06.md](etapa-0/ETAPA_0_DECISOES_2026-11-06.md) e [ESTADO_ATUAL_E_PASSAGEM.md](ESTADO_ATUAL_E_PASSAGEM.md).

**Baseline de 05/11/2026.** Este documento consolida as decisões verbalizadas pelo proprietário e as propostas técnicas discutidas. Nenhum código ou integração está declarado como implementado.

## Contexto real do negócio
- **Marca:** Ora 5G; domínio público já existente: `ora5g.com.br`.
- **Operação:** rede de **14 lojas físicas** de celulares e acessórios. Vendedores e gestores em cada unidade; parte das lojas **não possui notebook** e **não possui leitor de código de barras**.
- **Operação telecom:** **Ora Connect** — venda de chips/SIM, potenciais eSIM (a verificar), ativações, recargas, planos, contratos, consulta de linha e serviços, com integração planejada ao **Nogle ERP**.
- **Vendas de aparelhos parcelados/financiados:** uso operacional existente de **PayJoy** em lojas físicas; vendas no boleto/financiamento também são prioridade de canal digital, mas detalhes de API/convênio/fluxo exigem homologação.
- **Pagamento presencial:** dinheiro, Pix, Pix na maquininha, cartão na maquininha; **PicPay POS é muito usado nas lojas**, além de meios online.
- **Gestão:** rastrear absolutamente cada transação por vendedor e loja; metas individuais, bonificações, fechamento diário, financeiro e painel dos gestores.
- **Rollout:** implantar e homologar **1 loja piloto**, expandir gradualmente às **14 lojas existentes** e depois expandir digitalmente pelo Brasil e abrir unidades adicionais.
- **Construção:** ferramenta e código **próprios**, GitHub privado, Claude Code + OpenAI Codex, baixo custo inicial. O proprietário valoriza planejamento prévio, telas de referência, instruções passo a passo e independência de sistemas de terceiros.

## Proposta de valor
Uma plataforma central em que a jornada `lead → cliente → venda → pagamento → estoque/telecom → fiscal → resultado financeiro → meta/comissão → pós-venda` é rastreável. Não é somente CRM, e não são vários sistemas desconectados.

### Indicadores precisam ser separados
1. **Produção comercial:** quantidades de aparelhos, acessórios, chips, ativações, recargas, planos, serviços por vendedor/loja/período.
2. **Faturamento/valor transacionado:** valor bruto da venda; receita contábil não é sempre o valor de face de recarga ou do financiamento.
3. **Pagamento/recebimento/liquidação:** valor cobrado, autorizado, pago, repassado e reconciliado, com taxas por adquirente.
4. **Margem e comissões:** custo, descontos, taxa, receita apropriável, regras de elegibilidade e estornos.
5. **Fiscal:** documentação e tributos relativos à natureza e ao responsável da operação; validação externa obrigatória.

## Decisões explícitas do proprietário — status 'definido'
| ID | Decisão | Consequência |
|---|---|---|
| DEC-U01 | Construir plataforma própria de CRM + operação completa | Planejar CRM, ERP, PDV, telecom, digital e BI juntos |
| DEC-U02 | São 14 lojas físicas (**superada em 09/11/2026:** 11 lojas comerciais + DEFEITOS; meta de 14) | Multi-loja desde o modelo inicial |
| DEC-U03 | Piloto em uma loja, depois escalar | Impõe gates de homologação e rollout gradual |
| DEC-U04 | Rein **somente arquivos de produtos/preços** | Não projetar integração de API Rein no runtime |
| DEC-U05 | Ora Connect deve integrar Nogle, doc em `docs.nogle.tech` | Contrato de API precisa ser verificado antes de implementar |
| DEC-U06 | Dinheiro, Pix, maquininha e PicPay | Vários pagamentos por venda, diferentes liquidações, caixa e conciliação |
| DEC-U07 | Chips/ativação/recarga entram na produção individual | Ledger de eventos com categoria, atribuição e prevenção de duplicidade |
| DEC-U08 | Cada vendedor tem cadastro, metas e bonificações | Controle de performance, elegibilidade e regras versionadas |
| DEC-U09 | Gestor enxerga toda a loja/rede conforme perfil | Dashboards com RBAC e filtros auditáveis |
| DEC-U10 | Gestor precisa aprovar solicitações de nota | Workflow interno com política e legalidade fiscal preservadas |
| DEC-U11 | Interface deve ser ágil e acessível pelo celular | Mobile-first, touch, sem dependência de notebook |
| DEC-U12 | Não há leitores de código; podem existir futuramente | Busca manual + abstração de scanner/câmera |
| DEC-U13 | Integrar futuramente Mercado Livre, Shopee e TikTok Shop | Channel manager e estoque unificado com reservas |
| DEC-U14 | Meta Ads, WhatsApp e IA para leads orgânicos/pagos | Omnichannel, attribution, automação supervisionada |
| DEC-U15 | Criar esboços antes de implementar | Design system e protótipos disponíveis como referência |
| DEC-U16 | Preparar expansão nacional online e física | Multiempresa/CNPJ/UF a confirmar, logística e fiscal extensíveis |
| DEC-U17 | Claude Code e Codex desenvolverão e revisarão em conjunto | Repositório único, branches isoladas, maker-checker e QA |

## Propostas técnicas mais recentes — status 'recomendado, sujeito a ADR'
- Monólito modular, **Next.js + React + TypeScript + Tailwind**, **PostgreSQL/Supabase**, GitHub privado, auth, RLS, controle por organização/loja, CI/CD, testes e observabilidade.
- App web responsivo/PWA; subdomínio inicial sugerido `app.ora5g.com.br`; possíveis `api.ora5g.com.br`, `loja.ora5g.com.br`, `connect.ora5g.com.br` **não são aprovações de DNS/hospedagem**.
- Eventos de domínio, transactional outbox, workers e adaptadores para integrar terceiros. Monólito modular NÃO implica abrir conexão de banco diretamente ao navegador para operações críticas.
- Ledgers de estoque, financeiro, produção/comissões; entradas imutáveis e reversões em vez de apagar histórico.
- Desenvolvimento local econômico; avaliar pagamento de infraestrutura de produção somente após requisitos reais de disponibilidade, backups e volume.
- Mercado digital sob a mesma fonte de verdade de catálogo/estoque, reservas por canal, anti-overselling e logística posterior.

## Propostas antigas superadas ou apenas comparativas
No texto inicial `originais/historico/conversa_inicial_colada.md`, apareceram recomendações de **WordPress/WooCommerce, GoHighLevel, Bling, Tiny, Linx, Chatwoot, Make/n8n** como estrutura principal. Eram sugestões de uma fase exploratória de contratação de plataformas prontas. A decisão posterior do usuário é **criar sistema próprio**, logo essas opções NÃO são stack obrigatória. Podem ser avaliadas como benchmark, ferramenta periférica ou fallback com ADR. Valores, pacotes, escopos e afirmações promocionais do histórico NÃO estão validados hoje.

## Requisitos não negociáveis de qualidade
- Operações reais sem telas fake que aparentem estar funcionando; dados falsos somente em mocks/ambientes de demonstração identificados.
- Nenhum agente pode prometer ausência de bugs ou de futuras migrations. Deve perseguir compatibilidade, evolução segura, versionamento e testes.
- Fiscal, crédito, pagamentos, LGPD e produção exigem validação humana e especialistas.
- IA não deve tomar decisões financeiras/fiscais nem alterar dados sensíveis autonomamente sem autorização clara.
- Atenção: aprovação interna do gerente sobre notas NÃO substitui exigências legais de emissão.
- Sistema deve ficar funcional quando integração Nogle estiver instável para atividades que não dependam da operadora; estados de ativação devem ser corretos e nunca falsamente confirmados.

## Hierarquia para resolver conflitos
1. Decisão explícita mais recente do usuário, inclusive nas conversas de nov/2026.
2. Decisões aprovadas/documentadas em ADR e homologações reais.
3. Requisitos deste dossiê, classificados como definido/recomendado/pendente.
4. Relatórios de pesquisa completos em `originais/research/`, cuja documentação pode exigir reconfirmação.
5. Referências visuais e wireframes meramente ilustrativos.
6. Hipóteses formuladas por agentes.

## Critério empresarial de sucesso
A loja piloto deve conseguir abrir caixa, consultar produto/IMEI, cadastrar cliente, vender em dinheiro/Pix/PicPay/cartão/financiamento conforme regras validadas, registrar chip/ativação/recarga quando integração disponível, solicitar nota, encerrar venda, conciliar recebimentos, movimentar estoque, contabilizar performance individual, fechar caixa e fornecer auditabilidade — **sem notebook obrigatório**. A expansão vem depois de aceites formais, não apenas telas bonitas.

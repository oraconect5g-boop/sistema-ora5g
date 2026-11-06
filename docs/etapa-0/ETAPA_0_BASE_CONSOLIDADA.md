# Etapa 0 — Base consolidada do projeto (leitura integral)

**Projeto:** Ora 5G Platform · **Data:** 05/11/2026 · **Autor:** Claude Code · **Revisor esperado:** Codex + proprietário
**Complementa:** `ETAPA_0_ENTENDIMENTO_E_PROPOSTA.md`. **A lista de perguntas da seção 7 deste documento substitui a seção 5 daquele.**
**Status:** proposta para validação — nenhum código, schema ou integração criado.

---

## 1. Cobertura da leitura

| Arquivo | Leitura |
|---|---|
| `CLAUDE.md`, `AGENTS.md`, `PARA_COLAR_NO_CLAUDE.md`, `README.md` | integral |
| `docs/00` a `docs/13` (14 documentos) | integral |
| `backlog.json` (172 itens) | integral, com conferência automática contra `docs/01` |
| `originais/research/pesquisa_1`, `_2`, `_3` | integral |
| `originais/historico/conversa_inicial_colada.md` | integral |
| `referencias_visuais/guia_design.md`, `prototipo.html` (texto), vídeo (todos os quadros) | integral |
| `tela_01…10.png`, `visao_geral_telas.png` | vistos pelos quadros do vídeo (mesmo conteúdo) |
| `ORA5G_DOSSIE_MESTRE_UNIFICADO.md` | conferido: é a concatenação dos arquivos acima |

**Conferências automáticas feitas:** os 172 IDs do backlog batem 1:1 com `docs/01` (nenhum faltando ou sobrando); todos estão `planned-not-implemented`; prioridades: 77 P0, 68 P1, 27 P2.

---

## 2. O que a Ora 5G Platform deve se tornar (visão-alvo em uma página)

**Uma única plataforma própria** em que toda operação comercial — em loja, online, marketplace, WhatsApp ou Ora Connect — passa pelo mesmo núcleo:

```text
organização → loja → vendedor → cliente → OPERAÇÃO COMERCIAL → itens tipados → pagamentos
                                                   │
             ┌──────────────┬──────────────┬───────┴──────┬───────────────┬──────────────┐
          estoque/IMEI   caixa/financeiro   fiscal      telecom/Nogle   performance   auditoria
```

**Invariantes que nunca podem ser quebrados** (são o que define o sistema, mais do que as telas):

1. **Uma operação comercial, muitos itens de naturezas diferentes.** Aparelho, acessório, chip, ativação, recarga, plano, serviço, garantia e financiamento são *tipos de item* configuráveis — não tabelas de venda separadas.
2. **Toda operação tem loja e ao menos um vendedor responsável.** Nada é vendido "pela loja".
3. **Cada fato gera exatamente um efeito.** Um IMEI sai uma vez; um pagamento confirma uma vez; uma ativação conta uma vez; uma comissão nasce uma vez — mesmo com toque duplo, queda de internet ou webhook repetido.
4. **Venda ≠ pagamento ≠ recebimento ≠ conciliação ≠ receita ≠ comissão.** São números diferentes e o sistema nunca os mistura.
5. **Nada é apagado.** Cancelamentos, devoluções e correções geram registros compensatórios.
6. **Nada externo é dado como confirmado sem prova.** Pix, maquininha, nota fiscal e Nogle ficam "pendentes" até a confirmação real.
7. **Permissão por loja e perfil é garantida no servidor e no banco**, nunca só pela tela.
8. **Todo número do painel leva ao fato que o originou** (do "55 ativações" até cada ativação).
9. **Terceiros entram só por adaptadores.** Rein por arquivo; Nogle, PicPay, fiscal, marketplaces, WhatsApp e Meta por contrato oficial verificado.
10. **O vendedor faz tudo pelo celular.**

**"Completo" significa:** nenhuma operação principal depende de planilha ou da Rein; todo real vendido é rastreável até pagamento e conciliação; todo item físico até estoque e venda; toda ativação/chip/recarga até vendedor e loja; e cada versão pode ser reconstruída a partir do Git e das migrations.

---

## 3. Propostas de modelagem canônica (para virar ADR antes da primeira migration)

As três pesquisas e o `docs/03` usam nomes e cortes diferentes. Proponho fixar:

| Tema | Divergência nas fontes | Proposta |
|---|---|---|
| Entidade central | `sales` (doc 03, pesq. 1/2), `orders` (pesq. 3), `commercial_transactions` (doc 03) | **Uma** entidade de operação comercial com `channel` (loja, online, marketplace, whatsapp, connect); pedidos externos entram por `external_orders` mapeados a ela |
| Tipos de item | enum fixo `DEVICE/ACCESSORY/SIM…` (pesq. 2) × tabela configurável (doc 03) | Tabela `product_kinds` com comportamentos: exige IMEI, exige ICCID, movimenta estoque, gera operação telecom, perfil fiscal, gera evento de performance |
| Livros-razão | parcialmente citados | Quatro ledgers só de inserção: estoque, caixa, financeiro, performance |
| Dinheiro | "numeric" (pesq. 2) | `numeric(14,2)` no banco, biblioteca decimal no TypeScript, arredondamento BRL testado |
| Identificadores | UUID | UUID internos; IDs externos sempre em tabela de mapeamento `(provedor, conta, id_externo)` |
| Datas | — | `timestamptz`; exibição em America/Sao_Paulo; "dia comercial" por loja para fechamento |
| Aprovações | desconto, nota, caixa e estoque com modelos separados | Um motor genérico `approval_requests` com política versionada, reutilizado por todos |
| Integrações | Edge Functions do Supabase (pesq. 2) × workers (doc 02) | Worker próprio na VPS + fila e *outbox* no PostgreSQL (ver C-04) |
| Preço | por loja/canal (CAT-004) | Incluir também **condição de pagamento** se a pergunta P-09 confirmar preço à vista × parcelado |

---

## 4. Contradições adicionais encontradas na leitura integral

(As C1–C9 do primeiro relatório continuam valendo.)

| # | Contradição | Fontes | Como proponho resolver |
|---|---|---|---|
| C-01 | A pesquisa 2 documenta a **API da Rein** (endpoints e autenticação HMAC) e a sugere como "fallback de migração" | pesq. 2 × DEC-U04, `CLAUDE.md` | Prevalece a decisão do proprietário: **somente arquivos**, inclusive na importação. Usar a API exigiria nova decisão explícita sua |
| C-02 | Prazos: **10 meses** (pesq. 2), **40–52 semanas** (pesq. 1), **12–24 meses** para o piloto quando o proprietário conduz com agentes (doc 07) | pesquisas × roadmap | Nenhum prazo é compromisso; recalibrar ao fim da Etapa 0 com base no seu tempo disponível e nas respostas abaixo |
| C-03 | A pesquisa 2 fixa metas numéricas (99,9% de disponibilidade, resposta abaixo de 2 s) | pesq. 2 × doc 09 ("não inventar latências") | Tratar como hipótese; medir no piloto antes de virar meta |
| C-04 | Integrações em **Edge Functions do Supabase** × **workers** na VPS | pesq. 2 × doc 02 | Worker na VPS: fica sob nosso controle, roda tarefas longas e reprocessamento; decidir no ADR-001 |
| C-05 | O histórico chama **Z-API/Evolution API** de "API oficial do WhatsApp" | histórico × doc 06, briefing | Não são a API oficial da Meta e podem levar ao bloqueio dos números. **Descartadas** |
| C-06 | O histórico sugere **IA aprovando/recusando crédito em 30 s** | histórico × regras de IA, D-013 | Descartado: IA não decide crédito |
| C-07 | Pesquisa 3 usa PDV **offline** (Odoo) como referência | pesq. 3 × D-029 | Sem venda offline na v1; contingência documentada |
| C-08 | Divisão de papéis: pesq. 3 põe o Codex implementando catálogo, telecom e financeiro; doc 11 põe o Claude nos fluxos críticos e integrações | pesq. 3 × doc 11 | Doc 11 prevalece, com alternância por issue |
| C-09 | O roadmap exige "procedimento de **retorno ao sistema anterior** durante o piloto", o que implica manter a Rein como reserva operacional | doc 07 × DEC-U04 | Precisa de decisão sua (P-07) |
| C-10 | Fiscal está na etapa 7, mas o go/no-go do piloto exige notas emitidas de forma homologada | doc 07 | Fiscal entra no caminho crítico do piloto |
| C-11 | **77 requisitos P0**, incluindo Ora Connect (etapa 10) e relatórios (etapa 7): "P0" não significa "do piloto" | `backlog.json` | Recorte explícito do piloto na seção 5 |
| C-12 | O backlog tem **a mesma dependência genérica nos 172 itens** — não existe grafo real de dependências | `backlog.json` | Gerar o grafo real ao abrir as issues |
| C-13 | O protótipo usa **"E-mail corporativo"** no login; os vendedores podem não ter e-mail | protótipo × realidade das lojas | P-03 |
| C-14 | O protótipo mostra lojas "Centro/Batel/Portão · Curitiba" | protótipo | São dados ilustrativos; **não** uso como fato sobre a rede nem sobre UF |
| C-15 | A pesquisa 1 sustenta que serviços de telecom usam **NFCom (modelo 62)** e cita notas técnicas de 30/10/2026 ligadas à reforma tributária | pesq. 1 | Informação plausível e relevante, mas **a verificar com contador**; reforça que o fiscal precisa ficar isolado e configurável |

---

## 5. Recorte proposto do piloto (Marco A)

Proposta para reduzir os 77 P0 ao que a loja piloto realmente precisa para operar com segurança:

| Domínio | Entra no piloto | Fica para o Marco B (14 lojas) ou depois |
|---|---|---|
| ORG | 001–006 | 007 (MFA ampla), 008–010 |
| QUAL | 001–009 | 010–014 |
| CAT | 001–006 | 007–010 |
| INV | 001–006, 011 se a piloto vender chips | 007–010, 012 |
| CRM | 001–003 | 004 (funil de leads) e o restante |
| POS | 001–011 | 012–016 |
| PAY | 001–008 | 009–014 |
| FIN | 001 (resumo diário vendas × recebimentos × produção) | 002–010 |
| PERF | 001–005 (contagem e painel; metas sem pagamento de bônus pelo sistema) | 006–010 |
| FISC | 001–006 **conforme o que o contador definir** | 007–010 |
| CONNECT | 001–003 (venda de chip e registro de recarga/ativação com status honesto) | 004–006 assim que a Nogle estiver verificada; 007–011 |
| REPORT | 001–005 | 006–008 |
| ONLINE, MKTPL, WHATS, META, AI | — | Marco C |

**Resultado:** cerca de 60 requisitos no piloto. Os que saem do P0 não somem: o modelo de dados já os prevê, e eles entram por migrations incrementais.

---

## 6. Lacunas que nenhum documento cobre (ou cobre mal)

| # | Lacuna | Por que importa |
|---|---|---|
| L-01 | **Preço à vista × parcelado / Pix × cartão** | Comum em lojas de celular; muda o modelo de preço e o cálculo de margem e desconto |
| L-02 | **Aparelhos usados, troca com aparelho de entrada, assistência técnica** | Só aparecem em D-026; mudam estoque (condição da unidade), fiscal e financeiro |
| L-03 | **Celular pessoal do vendedor** | Dado de cliente (CPF, telefone) em aparelho particular: sessão curta, nada sensível guardado no aparelho, revogação imediata ao desligar o funcionário |
| L-04 | **Digitação manual de IMEI (15 dígitos) e ICCID (19–20) sem leitor** | Alto risco de erro. O IMEI tem dígito verificador (validação obrigatória); chips devem poder entrar por **lote/faixa**; leitura pela câmera deve subir de prioridade |
| L-05 | **Comprovante ao cliente** | As lojas têm impressora? Se não, envio por WhatsApp/e-mail ou tela — afeta o fluxo de fechamento da venda |
| L-06 | **Base de clientes começa vazia** | D-019 limita a Rein a produtos/preços: o histórico de clientes não migra. Confirmar que é aceitável |
| L-07 | **Comissão de venda financiada (PayJoy)** | Quando conta: na aprovação, na entrega do aparelho ou no repasse? |
| L-08 | **Aviso de aprovação ao gerente** | Notificações de aplicativo web no iPhone só funcionam com o app instalado na tela inicial; alternativa: aviso por WhatsApp oficial ou e-mail |
| L-09 | **Encarregado de dados (LGPD)** | Ninguém nomeado; necessário antes de tratar CPF de clientes em produção |
| L-10 | **Treinamento e suporte às lojas** | Citado no roadmap, sem responsável nem formato |

---

## 7. Perguntas consolidadas (substituem a seção 5 do primeiro relatório)

### A. Destravam o início da programação (fundação: login, lojas, perfis, permissões)

1. **Repositório e execução:** já existe repositório GitHub privado? Se não, posso preparar a estrutura para você criar. E você libera a instalação de pacotes nas configurações de rede (ou prefere que o código rode no seu computador/VPS)?
2. **Empresas:** quantos CNPJs existem, em quais estados, e a qual CNPJ cada loja pertence?
3. **Acesso dos vendedores:** eles têm e-mail próprio? Usam celular pessoal ou da loja? Um vendedor trabalha em mais de uma loja?
4. **Hospedagem:** qual a configuração da VPS HostGator (processador, memória, disco, sistema)? Você aprova *app e worker na VPS + banco e login no Supabase gerenciado*, com orçamento apresentado antes de qualquer contratação?
5. **Perfis:** a lista do briefing (superadministrador, administrador, diretor, gerente regional, gerente de loja, supervisor, vendedor, caixa, estoquista, financeiro, atendimento, operador Ora Connect) está completa? Existe gerente regional hoje?

### B. Destravam o piloto (podem ser respondidas enquanto a fundação é construída)

6. **Loja piloto:** qual será, e o que tem: internet, celulares, tablet/PC, impressora, quantas maquininhas PicPay?
7. **Nota fiscal e transição:** como a nota é emitida hoje (pela Rein? outro emissor?) e quem é o contador? Durante o piloto, a Rein continua como sistema reserva da loja piloto ou a Ora assume tudo a partir de um inventário de corte?
8. **Amostra Rein:** pode enviar um export de produtos e preços **sem dados de clientes**, por arquivo no repositório privado?
9. **Preços e descontos:** existe preço diferente à vista/Pix e parcelado? Qual o desconto máximo de vendedor e de gerente hoje?
10. **Escopo comercial:** a loja compra/aceita **aparelhos usados** na troca ou faz assistência técnica? Isso entra no sistema?
11. **Ora Connect:** quem acessa a documentação da Nogle, e o piloto precisa ativar chips pelo sistema no primeiro dia ou pode começar registrando manualmente?
12. **PicPay:** o que você consegue obter para conferir os recebimentos — comprovante com NSU, extrato no app, arquivo para baixar?

---

## 8. Critério para começarmos a programar ("totalmente alinhado")

| Portão | Condição | Libera |
|---|---|---|
| **G1 — Fundação** | Respostas A1–A5; ADR-001 (arquitetura/hospedagem) e ADR-002 (empresas/lojas/perfis) aprovados por você; ambiente com instalação de pacotes | Esqueleto Next.js, CI, login, lojas, perfis, RLS com testes negativos |
| **G2 — Cadastros e estoque** | Respostas B6, B8, B9, B10; ADR-003 (operação comercial, tipos de item, ledger de estoque) aprovado | Catálogo, importador Rein, estoque/IMEI |
| **G3 — PDV e caixa** | Respostas B7, B12; ADR-004 (pagamentos/caixa) e matriz de aprovação de desconto | PDV mobile, pagamento misto, caixa |
| **G4 — Fiscal e telecom do piloto** | Parecer do contador; contrato Nogle verificado (B11) | Integrações reais |

Ou seja: **não precisamos de todas as respostas para começar.** Com as cinco perguntas do bloco A, a fundação pode ser programada com segurança, sem retrabalho, enquanto os demais pontos são levantados na loja piloto.

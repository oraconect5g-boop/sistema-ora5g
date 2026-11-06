# 06 — Integrações externas e políticas de adaptação

**REGRA UNIVERSAL:** nenhuma API externa é parte do modelo de domínio da Ora. Cada serviço tem interface/adapter, mapeamento, credencial protegida, estados, timeouts, retry controlado, idempotência, logs sem dados sensíveis, testes com mocks, testes de contrato, permissões e observabilidade. Não implementar chamadas fictícias como reais.

## Registro de fornecedores e validação
| Integração | Para quê | Status de conhecimento | Estratégia de v1 / dependências |
|---|---|---|---|
| Rein Sistemas | Produtos/preços legados | **Decisão de uso somente por arquivos**, não runtime | CSV/XLSX, staging, validação, dry-run, import auditado. NÃO criar cliente de API Rein. |
| Nogle (`https://docs.nogle.tech/`) | Ora Connect: chips, linha, plano, ativação/recarga e contratos | Documentação indicada; **endpoints exatos, auth, scopes, webhooks não estabelecidos neste pacote** | Inventário Swagger/OpenAPI/contratos com acesso autorizado; adapters tipados; mocks; homologação. |
| PicPay maquininha | Recebimentos POS no balcão | Uso frequente confirmado; **disponibilidade de API POS não estabelecida** | Registros de método/terminal/NSU/comprovantes conforme disponível, conciliação manual/arquivo primeiro; API somente após convênio/contrato. |
| Pix/checkout online | Cobrança e confirmação | Provedor/contrato a decidir | Adapter; webhook e consulta com dedupe, antifraude e segurança; sem cartão bruto no banco. |
| PayJoy | Financiamento de aparelhos | Uso presencial confirmado; API/integração digital não confirmadas | Fluxo manual assistido compatível com operação atual; validar acesso digital, elegibilidade e termos antes de automatizar. |
| Fiscal (NF-e/NFC-e/NFS-e/NFCom) | Documentos por natureza fiscal | Obrigação existe mas detalhe depende de contador, UF, CNPJ e operação | Contratar/validar provedor; matriz fiscal homologada; estados, idempotência e contingência. |
| WhatsApp Business Platform | Atendimento e vendas | Canal desejado; conta, número, templates e escopos não confirmados | API oficial autorizada, inbox multivendedor e política Meta; nada de spam. |
| Meta Marketing API / Ads | Métricas e atribuição | Requisito explícito; contas/scopes não conectados aqui | OAuth e acesso homologado; relatório e atribuição com consentimento e limites. |
| Mercado Livre | Marketplace | Canal planejado; endpoints e acesso devem ser confirmados na fase | Adapter de produtos, estoque, pedidos, logística, taxas, reembolsos. |
| Shopee | Marketplace | Canal planejado; contratos e escopos a homologar | Adapter separado; sem depender do formato Mercado Livre. |
| TikTok Shop | Marketplace | Canal planejado; elegibilidade/regra Brasil e APIs a validar | Adapter separado, produtos/pedidos/envio/cancelamento e custos. |
| E-commerce Ora | Site nacional | Planejado, plataforma não implementada | Pode compartilhar aplicação e backend; checkout, frete, estoque, fiscal e LGPD. |
| IA / LLM | Atendimento e inteligência | Desejado; modelo/API/custo a escolher | Tools com permissão, RAG, guardrails, supervisão humana e gastos monitorados. |

## Nogle — contrato a obter antes de codificar
1. Autenticação: método, scopes, ambientes, rotação e expiração de token, concessão de cliente/operadora.
2. Catálogo: planos e produtos realmente acessíveis à conta Ora.
3. Dados de cliente/contrato, limites de CPF e retenção, consentimentos e documentação.
4. Ativação SIM/ICCID/MSISDN/eSIM, retorno, consulta, rollback e idempotência quando suportados.
5. Recarga, confirmação, tarifa/comissão, cancelamento/reversão e conciliação.
6. Portabilidade/linha/planos/status, se realmente oferecidos e licenciados.
7. Webhooks vs polling, rate limits, paginação, sandbox, códigos de erro e tempos.
8. Protocolos de reprocessamento: consulta antes de reenviar comando após timeout.
9. Testes de contrato e mapeamento schema da Ora ↔ schema Nogle.
10. Referências: documentação oficial **https://docs.nogle.tech/**. As pesquisas históricas indicam limitação para extrair endpoints; **não presumir nomes de rotas**, ainda que produto Nogle divulgue recursos amplos.

**Nunca incluir segredos neste pacote ou em tickets.** Configurar secrets via ambiente seguro e autorização do proprietário; logar apenas ID de correlação, estados, hash/mascara de identificadores quando necessário.

## PicPay POS e conciliação
- Capturar no PDV: método `cash`, `pix_direct`, `pix_pos`, `debit_pos`, `credit_pos`, `financing`, `boleto`, `online` etc.; provedor PicPay (se aplicável), terminal, parcela, referência/NSU/TID quando comprovante trouxer, data, valor, status e taxa estimada/efetiva.
- Não assumir que Pix na maquininha e Pix via API e-commerce são a mesma integração.
- Primeiro: confirmação e conciliação conforme processos/extratos realmente disponíveis, sem marcar como conciliado por simples cadastro manual.
- Depois: automatizar quando uma API contratual específica e acesso à conta forem comprovados e testados.
- Tratar estornos, chargebacks, antecipações, taxas e data de liquidação.

## Marketplaces
- ID externo NUNCA substitui ID interno; idempotência `(canal, conta, pedido_externo, evento)`.
- Reservar estoque físico, unificar SKU por variante, evitar venda simultânea do mesmo IMEI em PDV e online.
- Suportar anúncios, status de pedido, separação, frete, logística, cancelamento, devolução, fee e repasse; capacidades específicas dependem do canal.
- Integração por adapter, com filas de retry, limites de API, alarmes e reconciliação diária por divergência.
- Receita líquida por canal deve considerar taxas de marketplace e despesas por pedido; não confundir com pedido bruto.

## WhatsApp e Meta Ads
- Plataforma oficial com conta/números autorizados; templates/consentimento/janela de atendimento segundo política Meta vigente.
- Atendimento multiagente por loja, filas/atribuição e histórico acessível ao CRM conforme permissão.
- Origem orgânica/paga, UTMs, campanha/conjunto/anúncio, lead e venda quando possível; dedupe e transparência das limitações de atribuição.
- Métricas: investimento, alcance, impressões, CTR, CPC, CPM, CPL, CPA, conversões e ROAS **quando dados e fórmula permitirem**. Não tratar atribuição estimada como certeza.
- IA supervisionada: respostas sugeridas, qualificação, agendamento e roteamento; nunca enviar dados de cartão, negociar crédito/fiscal ou aprovar desconto autonomamente.

## Fiscal
A documentação fiscal brasileira muda. Não fixar por suposição o modelo de documento para recarga/chip/serviço de telecom. Validar responsabilidade da Ora vs operadora/Nogle, modalidade, CNPJ, operação e UF com contador/provedor e normas atuais. Emissão obrigatória não pode ficar bloqueada por aprovação interna não conformante.

## Checklist de homologação do adapter
- [ ] Documento oficial acessível e versão registrada; escopo de conta autorizado.
- [ ] Tabela endpoint→uso→método→auth→payload→resposta→erro→limite.
- [ ] Ambiente sandbox ou homologação permitido (sem cobranças reais).
- [ ] Contratos TypeScript/schema validados e mocks com fixtures redigidas.
- [ ] Idempotência e consulta de estado após timeout.
- [ ] Webhook com assinatura/replay protection ou polling seguro segundo docs.
- [ ] Logs sem payload pessoal indevido, segredo protegido.
- [ ] Testes unitários, de contrato, integração sandbox e E2E aprovados.
- [ ] Alerta operacional, reprocesso e suporte documentados.
- [ ] Aprovação de produção e rollback definidos.

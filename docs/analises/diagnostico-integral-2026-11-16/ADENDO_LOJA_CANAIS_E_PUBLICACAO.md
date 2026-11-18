# Aceites adicionais do proprietário — loja, canais e publicação contínua

Pedido de 16/11/2026, posterior ao ADR-009: finalizar as funções reais, permitir compra em `/loja`, importar/sincronizar e conciliar canais e atualizar real/demo ao término de cada etapa. Este adendo detalha os **179 IDs existentes**, sem apagar requisitos, inflar artificialmente a contagem ou declarar integrações prontas por haver menus. Os códigos A01–A20 são aceites complementares, não vinte requisitos já implementados.

| Aceite | IDs base | Entrega e prova exigida |
|---|---|---|
| A01 — endereço público | ONLINE-001 | `https://ora5g.com.br/loja` abre pelo domínio confirmado; link Comprar/Loja no topo do site. Entrar na plataforma continua claro e separado do acesso do comprador. |
| A02 — catálogo comprável | CAT-001/003/011, ONLINE-001 | Produtos elegíveis ativos, fotos, variantes, preço e disponibilidade centralizados; busca/filtro mobile; produto sem preço/condição de venda tem motivo explícito. DEFEITOS, custo, IMEI e dados internos não são expostos ao público. |
| A03 — carrinho e checkout | ONLINE-002, POS-*, PAY-* | Seleção de itens, quantidades, preço recalculado no servidor, cadastro/identificação do cliente, totais, pagamento e pedido persistente; reload e duplo clique não duplicam. Não chamar reserva de compra paga. |
| A04 — pedido pago | ONLINE-002/005 | Confirmação verificada do gateway e webhook autenticado; pagamento pendente/recusado/expirado/estornado distintos; não liberar mercadoria por retorno do navegador. Timeout exige consulta antes de recobrar. |
| A05 — logística | ONLINE-004/008, MKTPL-004 | CEP, retirada em loja, modalidades de entrega, cotação/etiqueta/rastreio conforme parceiro, prazos e identificação fiscal; não inventar frete. |
| A06 — estoque compartilhado | ONLINE-006, INV-001/006/007 | Site, PDV, transferências e marketplaces disputam o mesmo disponível/IMEI; concorrência não vende duplicado; expiração/cancelamento devolvem reserva uma vez. Corrigir #102. |
| A07 — pós-venda online | ONLINE-005, FISC-009 | Cancelamento, arrependimento, devolução/reembolso com efeitos coerentes em estoque, pagamento, fiscal e bônus. |
| A08 — telecom online | ONLINE-007, CONNECT-* | Planos/chips/eSIM e pagamentos/recorrências/repasse apenas conforme capacidade oficial Nogle, com identidade e estados reconciliáveis. |
| A09 — autenticação dos canais | MKTPL-001/007 | Adapters separados Mercado Livre e TikTok Shop; Shopee permanece no escopo original. OAuth/escopos, expiração/renovação, revogação e healthcheck. Contrato oficial/versão/conta vinculada documentados. |
| A10 — importação automática | MKTPL-002/003/007 | Carga inicial e incremental de anúncios/produtos e pedidos conforme permissão do canal; paginação/cursor, checkpoints, mapeamento SKU e reprocessamento idempotente; rotina agendada complementa webhooks perdidos. |
| A11 — sincronização | MKTPL-002/006 | Preço/estoque/anúncio nos canais com fonte de verdade explícita, prevenção de loops, conflito/indisponibilidade visíveis e proteção contra overselling. |
| A12 — ciclo completo do pedido | MKTPL-003/004/006 | Pedido → reserva → pagamento → expedição → entrega; cancelamento/devolução/chargeback tratados conforme contrato. IDs externos preservados por canal/conta/organização. |
| A13 — contabilidade gerencial dos canais | MKTPL-005/008, FIN-*, REPORT-* | Bruto, desconto, frete, taxas, comissão, líquido previsto e recebido, repasse, devolução e divergências por pedido; fechamento/relatório e extrato reconciliáveis. Separar da escrituração fiscal/contábil formal. |
| A14 — Meta: custos e atribuição | META-001/002/003/004/006 | Importação automática de gastos/insights por conta/campanha/período/moeda/fuso; UTM/origem preservadas; CPA/ROAS/CAC apenas com denominador e receita verificáveis, incluindo devoluções e custo. Atribuição não é prova de causalidade. |
| A15 — Meta: eventos e leads | META-002/004/005, WHATS-003 | Pixel/Conversions API deduplicados por evento; consentimento e minimização; leads vinculados ao CRM. Commerce/catalog, se usado, tratado separadamente segundo elegibilidade. Não presumir que Meta Ads tenha repasse financeiro de marketplace. |
| A16 — demo atualizada | REPORT-*, ONLINE-*, MKTPL-*, META-*, QUAL-001 | Demonstração mostra cada fluxo novo com dados fictícios, estados completos e selo claro; sem transações reais, credenciais de terceiros ou acesso a dados privados. Jornadas reais e demo cobertas na matriz de paridade. |
| A17 — publicação da aplicação real | QUAL-001/007, todos os IDs do lote | Depois de completar/testar a etapa, publicar no ambiente autorizado, conferir schema/worker/build e SHA completo no domínio. GitHub/Supabase não publica Next.js automaticamente. Falha não avança o status para publicado. |
| A18 — acompanhamento visível | REPORT-007, QUAL-006/013 | Tela autenticada de versão/entregas ou mecanismo equivalente com etapa, funções, links das telas, testes, horário e SHA publicado. Separar em desenvolvimento, testado, configurado, publicado e homologado; esconder segredos/dados internos de visitantes. |
| A19 — dependências objetivas | CONNECT-004, MKTPL-001, WHATS-001, QUAL-004 | Lista única por API: doc/versão, conta/parceria, escopos, sandbox, credenciais por nome, webhook/assinatura, limite, dono da pendência e teste faltante. Bloquear só a parte dependente; continuar código independente. |
| A20 — conclusão comprovada | QUAL-009/012 e todos os 179 | Cada ID com evidência de código/teste/configuração/publicação/jornada e aceite; nenhuma tela decorativa ou mock classificado como integração operacional. Os dois novos bugs e o importador da planilha entram no mesmo controle. |

## Mudanças de decisão que o programador deve registrar

1. **ADR-009:** o limite anterior “reserve no site e pague na loja” deixa de definir o escopo final. Manter retirada e ampliar para checkout/pagamento online, conforme o novo pedido. Confirmar o contrato do gateway de mercadorias; a obrigação de usar Nogle para Ora Connect não prova que sua API liquide aparelhos/acessórios.
2. **Endereço:** `/loja` no domínio existente já é a direção aprovada; não manter D-024 inteira como bloqueio para desenvolver a rota. CNPJ emissor, transporte, política de frete e ativação comercial continuam precisando de dados corretos.
3. **Demo:** a decisão atual exige mantê-la acessível/atualizada. Reconciliar a regra histórica de desligá-la em produção com isolamento técnico explícito. Exibir demo não deve habilitar ações reais nem substituir a aplicação conectada.
4. **Publicação:** autorização de atualização contínua no ambiente atual já existe. Não esperar acumular módulos nem pedir novamente autorização para cada lote rotineiro. Não publicar cada edição incompleta: publicar cada etapa funcional após os controles. Migrar para produção comercial é uma mudança de ambiente e aceite, distinta de atualizar a homologação pública atual.
5. **Node:** já é o runtime do projeto. Nenhum destes aceites exige outra linguagem ou um segundo backend. A decisão técnica recomendada continua TypeScript/Next.js/Node/PostgreSQL.

## Cenário mínimo de aceite integrado

Um produto com foto aparece na loja; uma unidade é reservada por compra online; o PDV e os canais veem a disponibilidade reduzida; pagamento confirmado gera pedido apto a retirada/expedição; cancelamento antes da entrega gera reversões idempotentes; uma repetição de webhook não duplica nada. O financeiro mostra valores brutos/líquidos e taxas; a campanha pode receber atribuição sem duplicar a receita. Os mesmos fluxos são demonstráveis na demo com dados fictícios, e o painel de entregas identifica o SHA que o proprietário está testando.

Esse cenário não substitui os demais 179 aceites. É o elo entre funções hoje dispersas e a operação que o proprietário espera enxergar.

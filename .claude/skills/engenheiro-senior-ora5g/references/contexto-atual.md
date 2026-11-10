# Contexto de negócio e decisões prevalentes — Ora 5G

## Produto e visão

**Ora 5G** é a plataforma empresarial própria e unificada para o varejo físico de aparelhos, acessórios, chips, serviços, recargas, linhas da operadora **Ora Connect**, canais digitais e atendimento. O proprietário quer reduzir dependência de ERPs/CRMs de terceiros, conectar toda a produção por vendedor e loja, operar com agilidade no celular e crescer nacionalmente (primeiro online, depois lojas físicas). O sistema deve cobrir CRM, ERP, PDV, estoque, caixa, finanças, fiscal, comissões, telecom, e-commerce, marketplaces, WhatsApp, Meta Ads, relatórios e IA.

O domínio empresarial existente é `ora5g.com.br`; os nomes de subdomínio e forma de hospedagem devem refletir a configuração real do servidor, registrada em ADR-001, sem migrar tecnologia só por hipótese. A stack decidida e em uso é Node 22, React/Next.js, TypeScript, Tailwind, PostgreSQL/Supabase, Vitest/Playwright, GitHub privado e worker isolado; não é um WordPress e não deve se tornar um CRM comprado de prateleira sem nova decisão formal.

## Foto atual (09/11/2026) — decisões que substituem rascunhos antigos

- **Rede atual:** 11 lojas comerciais: Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania, Balneario e Santa Candida. O local **DEFEITOS** é separado e **não** uma loja comercial. Origem: issue GitHub #60 e documentação de passagem. Meta de chegar a 14 lojas no futuro; inventário original falava de 14 existentes. Nomes/endereços/CNPJ devem ser homologados com o proprietário antes da carga real.
- **Piloto:** Santa Cândida. Fases previstas de expansão: 1 → 3 → 7 → 14, adaptadas ao quadro real de 11 até haver novas lojas.
- **Prazo de negócio desejado:** cerca de 6 meses para núcleo multi-loja, Ora Connect, link de pagamento e Mercado Livre/TikTok Shop; **não garantido**, condicionado a testes, contratos e recursos. Shopee/Meta Ads avançado/IA/BI avançado podem avançar depois.
- **Rein:** permanece sistema oficial durante o desenvolvimento e o piloto em paralelo; arquivos de exportação (produtos, preços e estoque inicial) são fonte de carga inicial. A substituição é por assunto e por loja, com conciliação e aceite escrito. Nenhuma dependência de API Rein.
- **Nogle:** integração única da Ora Connect via documentação `https://docs.nogle.tech/`. A marca "Contel" da documentação e URL não indica um segundo sistema. Credenciais e tipo de chave permanecem configuração privada; worker real, homologação ainda pendente.
- **Fiscal:** vendedor solicita nota no celular; gerência/dono controla a fila e a aprovação; nunca atrasar prazo legal. Por enquanto o sistema registra a chave da nota emitida no portal externo; a API emissora depende de contador e contrato.
- **Pagamentos:** dinheiro, Pix, Pix e cartão via maquininha PicPay, PagSeguro, PayJoy, Aiva, financiamento, boleto/link planejado. A maquininha não tem API operacional comprovada; comprovante manual até integração autorizada. Troco em dinheiro, conciliação e estorno externo como fatos diferentes de venda.
- **Estoque:** controle físico detalhado por loja, foto obrigatória por produto no piloto, IMEI/ICCID, transferências em etapas, reservas, local de defeitos; retorno após venda só com conferência.
- **Perfis reais atuais:** dono, administrador, gerente, vendedor, técnico. Perfis mais amplos (regional/marketing/financeiro/fiscal/atendimento) são extensão planejada, sujeitos a modelagem de RBAC.

## Processo ideal do vendedor

Vendedor acessa via smartphone/PWA sem depender de computador ou scanner, seleciona loja vinculada e cliente se necessário, localiza produto por nome/foto/SKU/IMEI/ICCID, adiciona aparelhos, acessórios, chip e serviço em uma só jornada, pede desconto ao gestor quando excede a regra, registra pagamento misto/comprovante, conclui com confirmação no banco, solicita nota pela venda e consulta histórico/metas. A venda gera fatos independentes de estoque, caixa, telecom, performance, fiscal e financeiro sem dupla contagem. Scanner USB, Bluetooth ou câmera podem ser habilitados depois sem alterar núcleo transacional.

## Regras da operação telecom

Chip vendido é saída física/ICCID; ativação confirmada é outro fato; recarga é outro fato; portabilidade é outra. A produção comercial por vendedor pode computar quantidades separadas (chips, ativações, recargas, aparelhos, acessórios), sem somar recarga de repasse como se fosse lucro integral. Recarga LINK paga direto no provedor, SALDO debitado da carteira Nogle após serviço pago no caixa. Não assumir status externo confirmado apenas porque o pedido foi enviado. Debitar carteira não é necessariamente liquidação financeira. Integração tem eventos e evidências auditáveis e orçamento/metas não gera comissão duplicada.

## Indicadores necessários

Diretoria: faturamento por período/loja/canal; margem; caixa previsto/real; pagamentos e liquidação; estoque e divergências; transações telecom; metas/bonificações; notas pendentes; campanhas e conversões; inadimplência; incidentes. Gerente: vendas da equipe, descontos e notas a aprovar, estoque, caixa, transferências, metas, recargas/ativações com falhas. Vendedor: minha produção, metas, comissão apurada e atendimentos. Diferença entre **volume comercial**, **receita reconhecida**, **recebimento**, **repasse**, **produção** e **resultado fiscal** é explícita.

## Canais online e IA (fases posteriores quando há base segura)

Mercado Livre, Shopee, TikTok Shop: sincronização catálogo, preço, saldos/reservas, pedidos, comissões/taxas, expedição, estornos e conciliação por adaptadores oficiais. Meta Ads: métricas/UTM/campanha→lead→venda com limites de atribuição e privacidade. WhatsApp Business: atendimento humano/IA, roteamento por vendedor/loja, registro no CRM, consentimentos, templates e regras Meta. IA não pode autonomamente autorizar desconto, emitir nota, confirmar pagamento/ativação ou acessar dados sensíveis além dos escopos. E-commerce Ora e inscrição/contratação online ampliam receita nacional; fiscal/UF/CEP/CNPJ e logística precisam ser suportados.

## Bloqueios e responsáveis

O proprietário fornece dados de 11 lojas+DEFEITOS, exportação Rein e valida políticas de desconto, metas/bonificações, meios de pagamento/financeiras, prazos e equipe piloto. Contador valida enquadramento e emissor fiscal por operação/CNPJ/UF, obrigações e eventual contingência. Nogle confirma tipo de chave, documentação, homologação de linha/ICCID e contrato de cobrança/repasse. Provedores Pix/link/maquininhas requerem contratos e escopos verificáveis. Claude Code e Codex **não** devem solicitar chaves em chat; o proprietário configura segredos diretamente no ambiente seguro.

## Critério de verdade

Na captura de 09/11, nenhum requisito era homologado para produção. Os testes automatizados e SQLs implementados evidenciam partes em desenvolvimento, não operação empresarial real. Estado vigente precisa sempre ser reconfirmado na main, PRs e banco autorizado antes de programar.

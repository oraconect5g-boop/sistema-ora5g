# Fluxos transacionais e mapa de domínios da Ora 5G

Este documento é guia de investigação e critérios de aceite. **As estruturas citadas devem ser confrontadas com o SQL real antes de implementar.** Não criar tabelas automaticamente só por estarem num plano antigo.

## Matriz de módulos e fonte no repositório

| Domínio | Código atual relevante | Funcionalidade almejada e cuidado |
|---|---|---|
| ORG | `/entrar`, `/escolher-loja`, `/equipe`, `packages/banco/supabase/migrations/*acesso*` | Empresas, unidades, membros, perfis, sessão por turno, RLS, revogação, DEFEITOS |
| CAT | `/catalogo`, `/demo/produtos`, `/catalogo/EnviarFoto`, `packages/banco/...*fotos*` | Fotos obrigatórias, preço por loja, busca mobile, importação Rein por arquivo |
| INV | `/estoque`, `/transferencias`, SQL `catalogo_estoque`, `integridade_estoque`, `transferencias_e_defeitos` | IMEI/ICCID, quantidade, reserva, inventário físico, transferência e defeitos |
| POS | `/vender`, `/vendas/[id]`, `packages/dominio/src/venda.ts`, SQL `vendas_pagamentos_e_caixa` | Venda rápida persistente, descontos, cancelamento, devolução/troca, vale-troca |
| PAY | `/caixa`, `packages/dominio/src/pagamento.ts`, SQL `integridade_vendas_lote2` | Dinheiro/Pix/PicPay/PagSeguro/PayJoy/Aiva, comprovantes, caixa, repasse, estorno externo |
| FISC | `/notas`, `packages/dominio/src/fiscal.ts`, SQL `fila_fiscal` | Pedido, aprovação, registro manual; emissão por API depois de homologar |
| CONNECT | `/connect`, `apps/worker/src/connect/*`, `packages/dominio/src/nogle.ts`, SQL `ora_connect_operacoes` | Ativação, recarga, portabilidade, eventos, saldo, LINK, Nogle, conciliação |
| CRM/WHATS/META | `apps/plataforma/src/app/demo/clientes` e `.../demo/canais` + backlog | Cliente 360°, WhatsApp humano/IA, funil, atribuição; comprovar persistência antes de declarar real |
| ONLINE/MKTPL | `apps/plataforma/src/app/demo/canais`, backlog | E-commerce, Mercado Livre/Shopee/TikTok Shop, reservas, pedidos/entregas, tarifas |
| PERF/REPORT | `apps/plataforma/src/app/demo/metas`, `.../demo/relatorios`, backlog | Produção por vendedor e loja, comissão versionada, BI sem dupla contagem |
| OS | `apps/plataforma/src/app/demo/assistencia`, backlog ORA-OS-001 a 006 | Ordens de serviço, peças, orçamento, autorização, histórico e cobrança |
| QUAL/AI | `.github/workflows/ci.yml`, `packages/config/`, `docs/` | CI, LGPD, segurança, backups, observabilidade, automações e IA supervisionada |

## Fluxo A — PDV com aparelho, chip, ativação e acessório

1. Login e identidade válidos no Supabase Auth; loja ativa, papel, vigência e turno confirmados pelo banco. Pessoa sem vínculo não acessa loja alheia.
2. Localizar cliente e itens por nome/SKU/foto/serial, escolher IMEI e ICCID disponíveis na loja e verificar estoque. Cliente identificável por CPF somente se estritamente necessário, de forma protegida.
3. Criar rascunho da venda no banco, adicionar itens, reservar IMEI/ICCID, registrar preço/custo históricos com custo visível só a papel autorizado.
4. Aplicar desconto por regras versionadas. Se exceder limite, pedir aprovação ao gestor; autor da solicitação não aprova a própria exceção.
5. Processar pagamento misto: dinheiro, Pix, PicPay POS, PagSeguro, financiamento PayJoy/Aiva. Troco apenas do numerário recebido; comprovante de máquina registrado por conferente; link não confirmado pela interface do vendedor.
6. Concluir a venda em transação com restrições de estoque, reserva, caixa e pagamento. Clique duplo não duplica venda nem baixa estoque duas vezes. Se a rede cair em estado ambíguo, consultar resultado antes de reenviar.
7. Registrar venda de chip como fato físico. Ativação/recarga geram operação telecom separada, status confirmado exclusivamente por evidência Nogle. Recarga não credita margem igual ao valor integral de face automaticamente.
8. Criar solicitação fiscal vinculada e fila gerencial; nunca transformar a aprovação em dispensa de prazo legal. Registrar chave ou emitir via provedor homologado, conforme tipo fiscal da venda.
9. Atualizar produção comercial por vendedor/loja/categoria com deduplicação. Reversões por devolução, cancelamento ou inadimplência segundo regra comercial vigente, sem reescrever eventos de passado.
10. Conferir pós-venda: caixa, estoque, contas a receber, gateway/repasse, fiscal, relatórios e histórico CRM.

**Cenários negativos mínimos:** duas pessoas vendendo mesmo IMEI; dois cliques concluir; pagamento incompleto; comprovante ausente; financiamento acima do preço; cancelamento após nota; item físico devolvido com IMEI diverso; estorno bancário pendente; cliente/loja sem acesso; operação Nogle com timeout; recarga LINK já paga em caixa; 2 evidências com mesmo timestamp; custo lido indevidamente por vendedor.

## Fluxo B — transferência entre unidades e DEFEITOS

Pesquisa por foto/código revela físico, reservado, disponível e trânsito **por unidade**. Origem/cliente não podem usar pedido pendente como estoque disponível. Workflow: solicitação → separação/autorização → envio → conferência de recebimento/registro de divergência, com responsável/data. Local DEFEITOS é de exceção e não vende; regularização exige autorização. Repetir requisição não gera novo saldo. Transferência de chips pode exigir operação oficial na Nogle, que não substitui conferência física.

## Fluxo C — Nogle e pagamentos telecom

- Registrar intenção local com idempotência + dados mínimos e estado; credenciais apenas no worker.
- Worker reivindica fila, autentica (`/auth/token`), envia pedido conforme catálogo oficial, registra tentativa e IDs de correlação.
- Se não conectou, pode retentar; se pedido pode ter sido recebido e resposta não chegou, `resultado_desconhecido`. Consulta oficial ou gerência com prova; **não reenviar às cegas**.
- Ativação confirmada: chip/linha vinculado e estado de linha ativo. Recarga confirmada: evidência única, não só timestamp compartilhado. Portabilidade: status oficial.
- `LINK`: cliente paga via Nogle, caixa local não recebe; `SALDO`: cliente já pagou no PDV, carteira Nogle é debitada. Proibir duplicação LINK+SALDO. Separar cobrança, liquidação, valor de face, custo, comissão e repasse.
- Nunca associar custo de carteira a relatório que vendedor sem `custo.ver` possa consultar. Logs sem CPF completo/chaves/tokens.

## Fluxo D — caixa diário e gestão

Sessão de caixa por funcionário e unidade: abertura com troco inicial, entradas (vendas confirmadas), saídas de troco, sangria/suprimento, fechamento previsto vs contado e justificativa de diferença. Pagamento Pix/cartão confirmado manualmente ≠ liquidação confirmada pelo adquirente. Gerente acompanha caixa por pessoa, loja, dia e meio. Venda cancelada não deve forjar devolução externa; guardar estado `estorno_pendente` até confirmação do provedor/comprovante. Financiamentos geram contas a receber separadas do dinheiro recebido.

## Fluxo E — nota fiscal gerencial

Vendedor solicita na venda concluída em poucos cliques no celular; gerência vê fila por idade e urgência; aprova ou pede correção; emissão ocorre conforme obrigação legal e provedor homologado/portal manual; chave auditada pertence à empresa/filial. Nota emitida exige cuidado especial com cancelamento, CFOP/tributação, devolução e competência. Contador valida NF-e/NFC-e/NFS-e/NFCom e regras da UF/operação. A aprovação interna **não** bloqueia cumprimento legal.

## Fluxo F — campanha digital → WhatsApp → CRM → pedido

Campanha Meta com UTM/click-to-WhatsApp (quando autorizado) → lead/consentimento → vendedor ou atendimento automático supervisionado → oportunidade → estoque e oferta → compra presencial/online → pagamento confirmado → entrega/ativação → pós-venda. Métricas incluem custo da campanha, atendimento, conversão, receita e margem quando calculáveis sem atribuição artificial. Proibir automação de spam e ações fiscais/financeiras sem humano autorizado.

## Invariantes de dados para futuras features

- IDs internos estáveis e externos em tabelas de correlação; nunca chave externa de marketplace como PK interna.
- `organization_id`, `store_id`, `seller_id` e histórico de atribuição por evento. RLS e SQL as protegem.
- Preços, custos, comissão e políticas como snapshots versionados; `status` com máquina de estados audível.
- Dinheiro em inteiro de centavos, ISO dates/timestamptz/timezone Brasil conforme contexto, data de competência distinta da liquidação.
- Livro de movimentos de estoque/caixa e eventos sem exclusão manual; correções compensatórias.
- Filas/outbox e idempotência de todos os efeitos externos; rejeitar mesma chave com conteúdo diferente.
- Integrações por adaptadores versionados; testes de contrato contra especificação autorizada.

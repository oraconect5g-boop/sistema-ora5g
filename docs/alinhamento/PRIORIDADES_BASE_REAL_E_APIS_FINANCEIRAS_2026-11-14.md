# Prioridades: base utilizável, transferências e APIs financeiras

**Decisão do proprietário:** mensagens desta conversa durante a revisão do prompt #86, consolidadas em 14/11/2026 (consulta de evidências em 15/11 UTC).
**Precedência:** decisão explícita recente > documentos anteriores. **Implementador:** Claude Code. **Revisor:** Codex.
**Escopo técnico mantido:** TypeScript, Next.js/React, Node.js, Supabase/PostgreSQL. Sem Firebase ou troca de linguagem.

## 1. O que muda no planejamento

1. As **11 lojas comerciais e DEFEITOS** já estão identificados em `../cadastros/LOJAS_CONFIRMADAS_2026-11-09.json`. DEFEITOS recebe problemas/avarias e não vende. Não usar a meta futura de 14 lojas para inventar unidades.
2. O arquivo `relatorioProdutos131258.xlsx` **foi fornecido**: posição de 10/11/2026 às 13:20. Garantir handoff seguro ao ambiente do programador; “não recebido” não descreve a conversa. Não versionar original ou valores comerciais.
3. Testes reais precisam de nomes, catálogo, saldos e três perfis; publicar código sem preparar dados não atende ao pedido.
4. Ao confirmar transferência, reduzir o disponível da origem, mostrar trânsito após envio, receber no destino somente mediante confirmação. Permitir vários produtos na mesma solicitação e filtros por loja.
5. **PayJoy e Aiva obrigatoriamente por API.** O registro manual atual é uma etapa transitória; não pode ser tratado como conclusão. Substitui a orientação anterior “financeiras por API somente condicionais”.
6. **QI Tech e J7:** preparar extensão para análise/aprovação de crédito, empréstimo e compra do aparelho; verificar identidade, produto e parceria antes do adaptador específico. J7 não foi confirmada como J17.
7. Nogle deve cobrir o Ora Connect com registros oficiais, cobrança, recorrência, chips e repasses conforme as capacidades contratadas. Não é outro aplicativo/servidor da Ora.
8. **Finalizar cada tarefa verticalmente**, incluindo a versão real publicada e o teste, antes de avançar para módulo independente. Bloqueio de fornecedor deve ficar explícito por capacidade.
9. No cadastro geral, nome completo + WhatsApp; e-mail sempre opcional. Dados fiscais completos quando necessários à nota. Eventual exigência de fornecedor deve ser comprovada e restrita ao fluxo dele, sem bloquear cadastro/venda comum.
10. Produtos precisam de fotos e variantes visualmente distintas de identificação adequada. Bônus seguem **metas mensais**, não comissão por venda.

## 2. Ordem de implementação e aceite

| Ordem | Entrega delimitada | Critério para concluir |
|---|---|---|
| 0 | Defeitos #87, #88, #96 e CI #95 | Reproduções viram regressões corrigidas; CI completo no SHA integrado |
| 1 | J1, lojas, catálogo e base histórica (#89) | Três acessos autorizados, 11 lojas + DEFEITOS, arquivo mapeado, prévia/totais e importação auditável no ambiente correto |
| 2 | Transferência multi-item e busca por loja | Origem disponível reduz na confirmação, físico sai uma vez, destino recebe uma vez; cancelamento/divergências e DEFEITOS testados |
| 3 | Venda/caixa/financeiro/gráficos | Jornada autenticada por papel, números conciliados e rastreáveis à venda/movimento |
| 4 | Nogle oficial | Matriz demo/real/contrato, configuração e operação de teste autorizada com confirmação/reconciliação |
| 5 | PayJoy e Aiva por API | Contrato por provedor, simulação/proposta/consulta/cancelamento/repasse conforme API real, idempotência e aceite |
| 6 | Fiscal e WhatsApp | Emissão/ciclo fiscal oficial e entrega ao destinatário correto, com eventos verificáveis |
| 7 | Restante dos 179 IDs | Fechar a matriz integral por lotes completos; nenhum requisito omitido porque não é MVP |
| 8 | Qualidade e corte operacional | Restauração/contingência ensaiadas, operação paralela e aceite do proprietário |

Pode antecipar levantamento de contratos, documentação e habilitações externas durante as etapas locais. Não criar contratos falsos para manter uma sequência artificial. Não bloquear todo o projeto por um fornecedor.

Para cadastro preliminar, não inventar CNPJ/endereço. O modelo atual exige CNPJ de loja física: o programador deve separar a possibilidade de preparar a unidade da autorização de emitir fiscalmente, preservando validação, papéis e auditoria. O snapshot de estoque não substitui contagem atual nem deve apagar movimentos posteriores.

## 3. Pesquisa de fornecedores — fontes oficiais

Consultadas durante esta revisão; documentação pública não garante parceria, acesso de produção ou aprovação de crédito.

| Fornecedor | Evidência pública | O que não está confirmado |
|---|---|---|
| PayJoy | [Retail Partner API](https://www.payjoy.com/apidocs/index.html), [endpoints](https://www.payjoy.com/apidocs/endpoints.html), [autenticação](https://www.payjoy.com/apidocs/authentication.html), [webhooks](https://www.payjoy.com/apidocs/webhooks.html). Documenta chave de parceiro, consultas de lojas/vendedores/clientes/carrinhos/transações e assinatura de callback | Originação e aprovação de financiamento para a Ora no Brasil, sandbox, escopo da conta e ciclo financeiro contratado. Não inferir endpoint de aprovação a partir de API de consulta |
| Aiva | [Site oficial](https://www.aivapay.com.br/), com produto de financiamento e contato comercial | Não foi localizada documentação pública suficiente de API. Solicitar documentação/parceria; isso não significa que não exista API |
| QI Tech | [Primeiros passos](https://docs.qitech.com.br/documentation/primeiros_passos/inicio/), [referência](https://docs.qitech.com.br/documentation/introducao_api_reference/). Documentação de crédito/LaaS, homologação e integração | Produto e parceria da Ora, acesso provisionado, requisitos comerciais/produção, responsabilidades na concessão e repasse |
| J7 | Nome informado pelo proprietário; identidade jurídica/documentação não confirmadas | Nome oficial, CNPJ/site, produto de crédito e API. A pesquisa encontrou [J17](https://j17.com.br/), mas **não há confirmação de que seja a mesma empresa**; não implementar J17 por suposição |

Nenhuma conta foi criada, proposta enviada, consulta de cliente realizada ou mensagem enviada a fornecedores pelo revisor.

## 4. Perguntas para os parceiros financeiros

1. Qual empresa/produto/contrato será utilizado, quais operações são permitidas à Ora e como habilitar filial, vendedor e canal?
2. A API permite simulação, proposta, envio de documentos, acompanhamento, decisão, assinatura, desembolso, cancelamento e repasse, ou apenas consultas?
3. Há sandbox e dados fictícios oficiais? Quais critérios/homologações e custos para produção?
4. Como autenticar, renovar/rotacionar credenciais e limitar acesso por ambiente/loja? Existe restrição de rede ou certificado?
5. Quais dados, consentimentos e documentos são exigidos em cada etapa? E-mail é exigido por qual operação, com qual justificativa contratual? Como tratar o cliente sem e-mail sem bloquear o cadastro geral?
6. Quais estados, transições, prazos e motivos de recusa existem? Aprovação expira? Pode mudar depois de recebida?
7. Há idempotência de proposta/contrato/pagamento? Como consultar uma solicitação cujo resultado ficou desconhecido?
8. Quais webhooks existem, como validar assinatura e integridade, repetir consulta e tratar eventos duplicados/fora de ordem?
9. Qual a relação entre valor do aparelho, entrada, financiado, juros, CET, taxas e valor líquido de repasse? O que é receita da Ora?
10. Quem recebe entrada e parcelas? Quando o dinheiro é liberado? Quais identificadores ligam aprovação, contrato, venda e extrato?
11. Como cancelar/desistir/devolver parcialmente, corrigir dados, tratar fraude, atraso, chargeback e estorno? A aprovação local nunca substitui a do fornecedor.
12. Existe vínculo IMEI/serial, bloqueio/desbloqueio do aparelho ou restrição de modelo? Que operação e consentimento o suportam?
13. Quais relatórios/extratos e mecanismos de conciliação são fornecidos? Como reconhecer duplicidade ou repasse divergente?
14. Quais limites, SLAs, janelas de indisponibilidade, retenção e canais de suporte técnico? Como comunicar mudanças de versão?

Não solicitar respostas com segredos ou dados reais de clientes pelo GitHub/chat. Credenciais seguem o canal seguro já definido.

## 5. Implementação independente de credenciais

- Domínio em TypeScript com capacidades por fornecedor; contrato de adaptador testável e estados locais explícitos. Não expor botão “aprovar” que apenas grava sucesso local.
- Persistir proposta/contrato, correlação com venda/loja/vendedor, valores em centavos, status externo/interno, evidência, tentativas e auditoria; minimizar dados e restringir acesso.
- Fila durável de envio, caixa de entrada de eventos, idempotência e reconciliação. Resultado desconhecido exige consulta; repetição não cria novo empréstimo ou cobrança.
- Produto financeiro deve ser configurável por capacidade: “em preparação”, “aguardando contrato”, “em homologação”, “ativo”. Não inventar endpoint ou segredo para preencher modelo de ambiente.
- Adaptadores simulados somente em desenvolvimento/testes, identificados; nenhuma confirmação simulada entra na operação real.
- Testar duplicidade, concorrência, timeout, expiração, recusa, troca de cliente/loja, confirmação tardia, cancelamento e divergência de repasse.
- Crédito, empréstimo e compra do celular têm responsabilidades e confirmações distintas. Dinheiro aprovado não significa recebido; juros da financeira não são receita da Ora.
- Criar migrações e modelos de configuração apenas com nomes de variáveis exigidos pelo contrato implementado. Atualizar a lista central; não espalhar dependências por relatórios contraditórios.

## 6. Nogle: fechamento da diferença entre demo e real

Mapear operações, ativar, linha, recarga, portabilidade, atendimento, chips, carteira e integração. Para cada ação: requisito; documentação da API; permissões da conta; código existente; dado local; chamada de escrita/leitura; idempotência; confirmação; repasse; teste autorizado.

Confirmar ainda escopo das chaves, limites, token, consultas GET com corpo, sandbox/linha/chip de teste, identificadores, confirmação de pagamento e reconciliação. Cobrança e repasse de Ora Connect usam Nogle conforme contrato, sem cobrança duplicada em outro gateway. Isso não transforma toda a venda varejista em cobrança telecom.

A base consultada contém zero habilitações, referências e operações. Estado vazio deve explicar a pendência e o próximo passo. Não marcar fluxo como concluído pelo cron retornar zero enquanto desabilitado.

## 7. Como retomar no Claude Code

Ler este adendo, o relatório desta revisão, a matriz de 179 IDs, checkpoint atual e o pacote da PR #86. Ler os relatórios anteriores pelas suas evidências e datas; revalidar bugs antes de reabrir correções. Confirmar o SHA da main, CI e rodapé do site.

Executar a próxima tarefa acima em uma branch, preservando o trabalho existente. Fechar seu aceite autenticado e publicar no ambiente já autorizado. Atualizar docs/status/issue com o que foi efetivamente verificado, o que ainda depende de contrato/configuração e o próximo item. Não declarar “app completo” enquanto restarem requisitos sem entrega/aceite.

Este documento é planejamento e instrução de retomada. Não afirma que código, cadastro de lojas, importação ou integrações financeiras tenham sido implementados por este PR.


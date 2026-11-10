# Perguntas para o responsável pela API Nogle

> Trazido da PR #33 (Codex) em 10/11/2026. O nome do arquivo e o título trocaram "Contel" por "Nogle", a pedido do proprietário; o e-mail de suporte e o endereço da API continuam os da documentação oficial. As respostas da Nogle de 10/11 (itens 5 a 7) estão em [NOGLE_API_REFERENCIA.md §3.1](NOGLE_API_REFERENCIA.md).

**Data:** 09/11/2026. **Objetivo:** integrar a operação inteira da Ora Connect, cobrança/gateway e repasses à API oficial, com estoque/ICCID, loja e vendedor, evitando dupla cobrança e dupla contabilização. **Rede confirmada:** 11 lojas comerciais; “DEFEITOS” é um local de exceção para transferência de itens com erro/problema.

**Base técnica examinada:** main `9b1109e49d9304651d20224563f8e5bdaf950894`; coleção oficial reconferida, 62 funções, SHA-256 `002d13dab3099a95c1e018bdc9d0d63dba30adcacfa141efccdd062f29c88ead`. Já há adaptador/worker local para ativação, recarga e portabilidade, mas nenhuma chamada real foi homologada pelo Codex. Os testes adicionais encontraram problemas de correlação, pagamento e proteção de dados (#55–#59).

Não enviar chaves, tokens, CPF de clientes ou dados bancários no retorno deste documento. Pedimos documentação, schemas e exemplos anonimizados; credenciais somente no canal seguro contratado.

## Mensagem pronta para encaminhar

Olá! Estamos integrando a Ora Connect ao sistema de vocês pela API Nogle. Queremos que ativações, recargas, recorrência, cobranças e repasses tenham registro oficial e apareçam corretamente na nossa operação por loja e vendedor. Já temos o adaptador inicial em desenvolvimento e precisamos validar os contratos abaixo antes da homologação.

As prioridades são: identificar o tipo e escopo da nossa chave, obter ambiente/conta de teste, confirmar o vínculo entre operação e cobrança, ter um identificador inequívoco no histórico de recarga e conhecer as APIs/relatórios de repasse. Poderiam responder por número, indicando documentação atual, exemplos anonimizados, campos obrigatórios, estados e regras de repetição? As perguntas completas estão abaixo; as marcadas **BLOQUEANTE** têm prioridade.

## A. Acesso, ambiente e contrato

1. **BLOQUEANTE — Escopo da conta.** A conta Ora usa chave de marca/MVNO, franquia ou PDV? Quais endpoints e ações estão habilitados para essa chave? Há escopos separados de leitura, escrita e financeiro?
2. **BLOQUEANTE — Homologação.** Existe sandbox? Se não, qual conta/linha/ICCID e forma de pagamento podemos usar em teste autorizado sem afetar cliente real? Como identificar e desfazer um teste que tenha efeito financeiro?
3. **Token.** Qual o prazo de validade, como saber que venceu e como renovar? Há limite de tokens simultâneos ou invalidação do token anterior ao gerar outro?
4. **BLOQUEANTE — Repetição após autenticação/limite.** Uma resposta 401, 403 ou 429 garante que a operação não foi executada? Podemos reenviar o mesmo POST depois de renovar token ou aguardar limite? Qual a garantia escrita?
5. **Limites e disponibilidade.** Quais são os limites por chave/PDV/rota, cabeçalhos de rate limit e Retry-After? Quais timeouts, janela de manutenção, SLA e canal de incidente devemos considerar?
6. **Versão.** Há OpenAPI/Swagger/JSON Schema oficial, versionamento, changelog e aviso de descontinuação? A coleção publicada é a referência contratual completa ou há endpoints privados habilitáveis?

## B. Payloads e respostas

7. **BLOQUEANTE — GET com corpo.** Os 25 GETs com JSON no corpo são suportados de ponta a ponta por proxies/CDN de vocês? Aceitam query parameters equivalentes? Há formato recomendado por rota e exemplo reproduzível?
8. **BLOQUEANTE — Recarga.** O contrato correto usa `numero`/`id_plano` ou `numeros: [{numero,id_plano}]`? Em lote, o resultado é único ou por linha? Como tratar sucesso parcial sem repetir linhas já processadas?
9. **Portabilidade.** O exemplo com ID preenchido e `retorno:false` é erro documental ou resposta possível? Qual campo indica aceitação, recusa e conclusão de fato?
10. **Dinheiro e datas.** Valores são reais decimais ou centavos? Há escala/precisão padrão? Qual timezone e precisão das datas, inclusive frações de segundo? As consultas por período incluem os dois limites?
11. **Erros.** Quais códigos estáveis distinguem validação, permissão, rejeição de negócio, duplicidade, processamento e falha temporária? Um HTTP 200 com somente `mensagem` pode representar falha? Quais campos devemos usar por rota?

## C. Identidade, duplicidade e recuperação

12. **BLOQUEANTE — Idempotência.** Existe chave de idempotência ou identificador de solicitação do integrador? Qual header/campo, escopo, validade e comportamento ao repetir o mesmo pedido ou mudar seu conteúdo?
13. **BLOQUEANTE — Timeout.** Se o POST foi enviado e a conexão caiu sem resposta, como consultar se foi processado? Podemos localizar a operação pela nossa referência antes de receber o ID de vocês?
14. **BLOQUEANTE — Recarga e histórico.** Qual campo liga o ID retornado por `/recarga/solicitar` à recarga exata em `/linhas/historico`? Existe consulta por ID externo ou por referência do integrador?
15. **BLOQUEANTE — Unicidade da data.** `data_cadastro` é única por linha/operação? Duas recargas podem ter a mesma data até o segundo ou ser retornadas no mesmo timestamp? Como distinguir plano/valor/competência e impedir que uma evidência confirme duas operações?
16. **Notificações.** Existem webhooks de operação, pagamento, renovação, estorno e repasse? Qual autenticação/assinatura, ID de evento, política de reentrega, ordem e proteção contra replay? Se não existem, qual frequência de consulta é permitida?
17. **Consistência.** Quanto tempo uma operação aceita pode levar para aparecer em detalhe/histórico/extrato? Qual estado permite concluir que ela não existe, sem risco de a execução surgir depois?
18. **Paginação e sincronização.** Há cursor, ordenação estável, filtro por criação/atualização e identificação de exclusão/reversão? Como buscar alterações desde um marco sem perder itens ou contar páginas sobrepostas duas vezes?
19. **Origem externa.** Operações feitas no portal de vocês ou por outro canal aparecem na API com origem, PDV, vendedor e ID estável? Como importar e reconciliar essas operações sem atribuir venda a alguém incorretamente?

## D. Gateway, cobrança e pagamento

20. **BLOQUEANTE — Recursos financeiros.** Quais APIs compõem o gateway habilitado para a Ora? LINK e SALDO são os únicos métodos na conta? Pix, boleto e cartão estão efetivamente disponíveis e quais contratos extras exigem?
21. **BLOQUEANTE — Quem cobra quem.** No LINK, quem é o recebedor e como a Ora recebe sua parte? No SALDO, qual conta é debitada, quando ocorre o débito e qual regra de margem/repasse se aplica? Fornecer fluxo e exemplo numérico oficial.
22. **BLOQUEANTE — `/pagamento`.** O POST apenas consulta/recupera dados de uma cobrança existente ou pode criar/alterar/cobrar algo? Quais valores de `tipo` são válidos e a que ID corresponde cada um?
23. **BLOQUEANTE — Confirmação.** Quais IDs e estados indicam cobrança criada, pendente, autorizada, paga, liquidada, cancelada, vencida e estornada? Qual consulta/evento é a evidência autoritativa de pagamento?
24. **Vencimento.** Qual o prazo dos links/QR Codes/boletos e como recuperar ou renovar o mesmo pagamento? Renovar cria outra cobrança? Como invalidar o anterior e evitar que dois links sejam pagos?
25. **BLOQUEANTE — Cliente já pagou na loja.** Quando o serviço já foi recebido no caixa Ora, o fluxo correto é necessariamente SALDO? Existe modalidade de quitação alternativa que não emita outra cobrança ao cliente? Como impedir cobrança dupla?
26. **Saldo insuficiente e corrida.** Há consulta/reserva de saldo atômica? Duas lojas podem gastar a mesma carteira ao mesmo tempo? Qual resposta indica recusa definitiva e qual permite nova tentativa sem duplicidade?
27. **Pagamento versus telecom.** Pagamento confirmado pode coexistir com ativação/recarga recusada ou demorada? Como recuperar, estornar ou usar crédito nesse caso? O inverso é possível: serviço ativo e pagamento ainda pendente?
28. **Estorno/contestação.** Existe cancelamento, estorno total/parcial, chargeback e consulta de devolução por API? Quem autoriza e quais eventos/IDs ligam o estorno à operação e ao repasse? Quais prazos contratuais se aplicam?
29. **Conciliação.** Que dados de cobrança, pagamento, taxas, líquido e liquidação podemos consultar/exportar? Há identificador comum entre operação, cobrança e lançamento no extrato?

## E. Repasse, carteira e comissão

30. **BLOQUEANTE — API do repasse.** Qual endpoint/relatório retorna o repasse previsto, apurado, liberado e pago à Ora? Há API para solicitar liquidação ou ela é automática? Isso não está explícito na coleção pública.
31. **BLOQUEANTE — Regra contratual.** Quais percentuais/valores, base de cálculo, taxas, retenções, prazos, campanhas e condições alteram o repasse? Pedimos tabela versionada e exemplos, inclusive LINK versus SALDO, ativação, recarga e recorrência.
32. **BLOQUEANTE — Rastreabilidade.** Qual ID une repasse, operação, pagamento, linha/ICCID, período e PDV? Um repasse agrupa várias operações? Existe detalhamento que permita reconciliar centavo a centavo?
33. **Extrato e saldos.** O que representam saldo disponível, bloqueado, crédito programado e cada tipo de lançamento? O extrato contém débitos, devoluções, bonificações e repasses bancários? Qual identificador único de cada lançamento?
34. **Ajustes posteriores.** Como vêm estorno, inadimplência, chargeback e correção retroativa de uma comissão já apurada ou paga? Há relação com o lançamento original e competência da correção?
35. **Recebimento e comprovante.** Que evidência confirma o repasse efetivamente recebido: estado na API, ID de liquidação, comprovante, extrato ou referência bancária? Como tratar pagamento parcial e diferença?
36. **Lojas/vendedores.** Vocês recebem e devolvem referência de vendedor e PDV em cada operação/repasse? Se não, podemos guardar nossa referência de correlação sem alterar a titularidade oficial da conta?

## F. Recorrência e produção

37. **BLOQUEANTE — Ciclo da recorrência.** Como contratar, programar, consultar, alterar e cancelar renovação automática? Quais eventos representam agendamento, cobrança, renovação executada, falha e suspensão?
38. **Competência e identidade.** Cada renovação recebe novo ID de cobrança/operação e período de referência? Como distinguir consulta repetida de uma nova competência, sem duplicar produção/comissão?
39. **Quantidade programada.** `quantidade_recargas` reserva/debita todo o valor de uma vez ou por execução? Como recuperar o calendário e os valores futuros versus já realizados?
40. **Falhas e novas tentativas.** Quem tenta novamente em caso de saldo insuficiente, cartão recusado ou indisponibilidade: Nogle ou Ora? Qual limite/janela e como evitar duas rotinas cobrando a mesma renovação?
41. **Histórico e atribuição.** Renovação iniciada fora da Ora pode ser conciliada por API? O crédito ao PDV/vendedor original permanece ou muda com transferência, troca de chip e portabilidade? Qual dado oficial sustenta essa regra?

## G. Chips, PDVs e transferências

42. **PDVs da rede.** Como mapear as 11 lojas ao cadastro de PDVs da Nogle? A chave marca/franquia consulta e movimenta todos os PDVs ou precisa de chave por loja? Quais permissões impedem acesso cruzado indevido?
43. **BLOQUEANTE — Estoque oficial do chip.** Quais estados distinguem virgem, reservado, em transferência, entregue ao PDV, vendido, ativando, ativo, bloqueado, avariado e devolvido? Quais são consultáveis e quais transições exigem API?
44. **Transferência entre lojas.** Ao transferir ICCIDs/eSIM entre PDVs, a API registra solicitação, origem, destino, itens, envio, aceite/recebimento, recusa e divergência? A transferência é imediata ou requer confirmação? Há ID estável e eventos por item?
45. **DEFEITOS e exceções.** O provedor oferece local/status de erro, avaria ou quarentena do chip? Como retirar um chip de circulação e devolver ao vendável após tratamento autorizado? Precisamos distinguir isso do local interno “DEFEITOS”, usado também para outros produtos.
46. **eSIM e troca.** Como identificar eSIM antes/depois da ativação, obter ICCID/QR Code, validade e revogação? Qual endpoint oficial para troca de chip preservando linha/plano? Quem pode consultar QR Code e qual a política de retenção?
47. **Compra e recebimento.** Qual a relação entre pedido de chips, cobrança, rastreio, lote e ICCIDs entregues? API confirma entrega física? Como registrar falta, sobra, duplicado e defeito sem dar entrada vendável pela simples compra?

## H. Proteção de dados e homologação final

48. **Titularidade/campos.** Quais dados são obrigatórios por PF/PJ, DDD, cidade e tipo de ativação? Há validação de titularidade/consentimento e restrição de alteração depois de criado o pedido?
49. **Minimização.** Respostas e mensagens podem repetir CPF, nome, endereço, tokens ou dados financeiros? Há campos/consultas mascarados, retenção contratual, obrigação de exclusão e trilha de auditoria?
50. **Suporte e trilha.** Qual request-id devemos guardar para suporte e como consultar uma operação contestada? Como comprovar conclusão/recusa quando a API ficou ambígua e houve intervenção humana?
51. **Aceite conjunto.** Podemos executar e assinar um roteiro de homologação com vocês: LINK pendente/pago, SALDO insuficiente, ativação, recarga, renovação, portabilidade, transferência, timeout após envio, repetição, estorno e repasse? Quem valida as evidências e libera o uso produtivo?

## Como transformar as respostas em implementação

Para cada resposta, registrar: **contrato/versão, endpoint, campos obrigatórios, IDs de correlação, estados, efeitos financeiros, regra de repetição, evidência de confirmação e teste de aceite**. “Não disponível” ou “a contratar” deve ficar explícito. Nenhum percentual, prazo, webhook, endpoint ou confirmação será presumido.

Prioridade para a primeira conversa: **1, 2, 4, 7, 8, 12–15, 20–23, 25, 30–32, 37 e 44**. As demais completam a implementação e operação. Não enviamos esta mensagem a terceiros; ela está pronta para o proprietário encaminhar.

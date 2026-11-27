# Roteiro de aceite: lote NFE55-a (a NF-e modelo 55 no fluxo interno, primeira parte)

- **Quem pediu:** o proprietário, em 27/11/2026: preparar o fluxo interno da NF-e modelo 55 no PDV, num caminho testável e simulado, sem emitir nada.
- **Quem faz o aceite:** o proprietário, lendo este roteiro; o passo no celular é opcional e só roda com o sim dele (ele grava uma venda de teste).
- **O que o lote entrega:** parte do ORA-FISC-001 (pedir a nota da venda com os dados já preenchidos) e a prova do caminho inteiro do ORA-FISC-002 (a aprovação interna). Nenhum requisito muda de estado: a emissão integrada continua bloqueada (ORA-FISC-004).
- **Onde está:** na branch `feat/nfe-55-fluxo-interno`, saída da `main` em `d90e184`. Sem PR, sem merge, sem publicação e sem migration: nada disso foi feito nem é preciso para este lote.
- **Resposta:** "aceito" ou "não aceito".

## O que já existia (o inventário, para não duplicar)

Conferido no código e nos testes da `main` em `d90e184`:

| Passo do pedido | Onde já está | Prova que já existia |
|---|---|---|
| Venda sem cliente (a identificação não é exigida em toda venda) | o Vender e o comprovante da venda | `packages/banco/src/vendas.test.ts` (vendas concluídas com o cliente vazio) |
| Cadastro rápido: nome completo + WhatsApp; CPF e endereço só quando a nota no nome pede | `cliente_salvar` (#76, K1a); a tela em `/clientes/novo` | `packages/banco/src/clientes.test.ts` |
| Ligar o cliente à venda concluída, com motivo | o comprovante, "Ligar a venda a um cliente da rede" (`venda_vincular_cliente`) | `packages/banco/src/crm.test.ts` |
| Pedir a nota no nome do cliente, sem digitar o CPF | o comprovante, "Pedir nota fiscal" (`notas_solicitar` com o cliente) | `packages/banco/src/destinatario-fiscal.test.ts` |
| O dono aprova no painel e vê a contagem | a fila em `/notas` e as pendências do Início (`pendencias_da_loja`, chave `notas`) | `packages/banco/src/notas.test.ts`, `pendencias-numa-ida.test.ts` |
| Os dados para digitar no emissor | `/notas/[id]/emitir` (só o destinatário, até este lote) | `apps/plataforma/src/app/notas/[id]/emitir/emitir.test.ts` |
| Registrar a nota emitida fora pela chave de acesso (modelo, série e número saem da chave) | a fila de Notas (`notas_registrar_emissao`) | `notas.test.ts`, `carta-de-correcao.test.ts` (já com chave de NF-e 55) |
| O PDF guardado e o envio pelo WhatsApp na fila, com trilha e sem duplicar | o comprovante (`notas_anexar_documento`, `nota_enviar_whatsapp`); o programa de envio existe e está desligado até a Meta (lote WHATS-a) | `packages/banco/src/whatsapp-nota.test.ts` |

O que faltava era pouco: (1) quem emite precisava trocar de tela para copiar os itens, os valores e os dados da loja; (2) não havia uma prova do caminho inteiro numa venda só.

## O que mudou

1. **"Dados para emitir" mostra tudo numa tela só.**
   - **Antes:** só o destinatário (nome, CPF/CNPJ e endereço). Os itens e os valores estavam no comprovante, e o CNPJ, a inscrição estadual e o endereço da loja estavam em Lojas.
   - **Agora:** a mesma tela mostra também **quem emite** (a loja, o CNPJ, a inscrição estadual e municipal e o endereço configurados em Lojas), **a venda** (cada item com o SKU, a descrição, a quantidade, o preço e o desconto; o subtotal, os descontos e o total; os pagamentos) e **um quadro com tudo para copiar** de uma vez para o emissor.
   - **O CNPJ que aparece é o que o banco confere na chave:** o da loja; sem ele, o da loja emissora dela.
   - **Nada é inventado:** o cadastro dos produtos não tem NCM, CFOP nem tributo. A tela diz isso e deixa a decisão com o contador e o emissor, como o modelo da nota (NF-e 55 ou NFC-e 65).
   - **Sem atalho na segurança:** os fatos só aparecem depois de o banco liberar a tela, que confere a permissão e grava a abertura na auditoria. Eles são lidos com a sessão de quem abre, das mesmas tabelas que o comprovante já lê, e cada tabela tem a sua regra de acesso. Se algo não puder ser lido, a tela avisa e o destinatário continua lá.
2. **A prova do caminho inteiro, com chave de NF-e 55.** Ela usa só o que já existe e mostra, numa venda fictícia:
   - a venda concluída sem cliente;
   - o cadastro rápido, que recusa o nome sem sobrenome, e a ligação do cliente à venda;
   - a nota no nome do cliente, recusada sem o CPF e depois sem o endereço;
   - o cadastro completado (o endereço entra com a finalidade "nota fiscal", pela regra dos dados mínimos), depois de que o pedido sai uma vez só;
   - a contagem do dono sobe, a vendedora não aprova e o dono aprova;
   - o dono lê os dados para emitir e as mesmas tabelas da tela, e a gerente de outra loja não lê a venda;
   - a chave de outro CNPJ é recusada; a do CNPJ da loja vira NF-e 55, série 1, nº 955, e a contagem volta;
   - o CPF guardado para a emissão sai do pedido;
   - o PDF é guardado e o envio pelo WhatsApp fica só na fila: repetir não duplica, a trilha tem um passo e o número completo fica só na área privada.

## O que este lote não faz (de propósito)

- **Não emite, não assina e não fala com a SEFAZ.** A chave da prova é fictícia, e a nota "emitida" é só o registro de uma emissão externa, como hoje.
- **Não manda WhatsApp.** O envio só entra na fila; o programa de envio está desligado até a Meta ser configurada.
- **Não cria tributo, não muda preço nem piso, não cria migration e não mexe em credencial ou cliente real.**
- **Não precisa de chave liga-desliga:** a tela só lê, e a prova roda só no banco de teste, em memória.

## Como foi conferido (pelo Claude Code)

- **No site:** `apps/plataforma/src/app/notas/[id]/emitir/emitir.test.ts` tem 7 testes, 4 deles novos. Eles conferem a tela com a venda fictícia (a loja, os itens, os totais, os pagamentos e o texto para copiar, sem tributo) e que os fatos não aparecem antes de o banco liberar. Conferem também o aviso quando uma parte não pode ser lida, a regra do CNPJ que emite (o da loja, o da emissora, a emissora que não aparece, nenhum) e que forma estranha é falha, nunca dado na tela.
- **No banco:** `packages/banco/src/nfe-modelo-55-ponta-a-ponta.test.ts` tem 1 teste novo, que é o caminho inteiro acima, com todas as migrations e dados fictícios. A transação é desfeita no fim.
- **Os tipos e o lint dos arquivos mudados passam.**

## O que você confere

1. Leia "O que mudou", acima.
2. (Opcional, só depois de publicado e com o seu sim, porque grava uma venda de teste.) No celular, na Santa Cândida (teste):
   - o Vendedor (teste) vende uma capa em dinheiro e, no comprovante, toca em "Pedir nota fiscal" sem cliente;
   - o Gerente (teste) abre Notas, o pedido e "Dados para emitir", e confere a loja, a capa, o total e o quadro para copiar;
   - no fim, o Gerente (teste) cancela o pedido. Nenhuma chave é registrada, e nada é emitido.
3. Responda **"aceito"** ou **"não aceito"**.

## O que falta (os próximos passos, sem inventar)

- **NFE55-b, completar o cliente na própria tela da venda.** Hoje, quando a nota no nome pede o CPF ou o endereço, o comprovante leva à ficha do cliente. E "Cadastrar cliente" abre `/clientes/novo` numa aba nova. O passo seguinte é completar ali mesmo e pedir a nota. A prova deste lote achou uma regra que ele precisa seguir: as finalidades do cadastro vão inteiras a cada gravação, então quem completa manda as que o cliente já tem mais "nota fiscal".
- **Os dados fiscais dos produtos** (NCM, CEST, CFOP, origem) não existem no cadastro e dependem da matriz do contador (ORA-FISC-003 e ORA-FISC-007).
- **O emissor fiscal:** o provedor fiscal da REIN ainda não foi identificado, e a emissão integrada segue bloqueada (ORA-FISC-004). Enquanto isso vale a emissão externa registrada pela chave.
- **A Meta** não está configurada, e o envio pelo WhatsApp fica na fila (lote WHATS-a).
- **Na rastreabilidade,** o lote entra só no merge e na publicação, pelo fluxo de sempre.

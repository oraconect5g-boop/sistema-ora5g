# Busca por produto, lojas e pedidos internos de transferência

**Decisão do proprietário em 09/11/2026:** a rede possui **11 lojas comerciais**, com os nomes da imagem, e o local **DEFEITOS**, para transferir itens quando há erro/problema. Esta informação substitui o número anterior de 14 lojas nos documentos de trabalho. Os arquivos históricos continuam identificados por data/corte.

## Cadastro confirmado

Santa Felicidade; Água Verde; Colônia; Almirante Tamandaré; Dubai; Colombo; Muffato Santa; Butiatuvinha; Ventania; Balneario; Santa Candida. Os dois últimos rótulos foram preservados como aparecem na imagem; acentuação e códigos oficiais serão conciliados com o cadastro/exportação. Nenhum ID de unidade foi inventado.

DEFEITOS é **local de exceção**, com motivo e tratamento registrado, e não loja comercial. Não misturar automaticamente seu saldo com disponibilidade de venda. Definir regra de regularização/retorno ao vendável e permissão correspondente, sem presumir que todo problema é avaria física.

[Referência estruturada da imagem](../cadastros/LOJAS_CONFIRMADAS_2026-11-09.json). Os números são fotografia histórica para análise, não uma carga autorizada no banco.

## Conferência da imagem

| Medida | Valor |
|---|---|
| Total físico no cabeçalho | 6.755 |
| Soma da quantidade local das 12 linhas | 6.755 |
| Disponível no cabeçalho | 6.688 |
| Soma dos disponíveis das linhas | 6.725 |
| Diferença entre soma e cabeçalho de disponível | 37 |
| Pendências listadas | 31 |
| Soma de físico menos disponível por local | 30 |

Almirante Tamandaré mostra físico 468, disponível 465 (diferença 3) e pendência de transferência 4. O cabeçalho físico menos disponível dá 67, que não é o total de pendências. É preciso conhecer reservas de venda, transferência, trânsito e exceções para reconciliar essas visões. A imagem não permite concluir a causa nem autoriza ajustar saldo para “bater”.

## Como deve funcionar a busca

1. Busca por nome, SKU, código de barras, IMEI ou ICCID; mostrar foto obrigatória, descrição/variante e saldo da loja atual. O filtro e a paginação devem ocorrer na fonte antes de limitar resultados, inclusive produto sem saldo local que esteja em outra loja.
2. Ao tocar no produto, abrir painel único “Onde tem este produto?”, mantendo a busca e a loja atual. Mostrar a loja atual primeiro e permitir filtrar unidades disponíveis ou com pendência. Foto ampliável e identificação da variante evitam confundir produtos de nome similar.
3. Cada loja mostra **disponível para vender**, **físico**, **reservado em venda** e **transferência**, com rótulos e detalhes próprios. DEFEITOS fica identificado à parte. Não apresentar somente uma quantidade ambígua.
4. Pendência aparece em linha curta, com quantidade e acesso aos pedidos. Detalhe deve informar ID, origem, destino, responsável, itens/IMEI/ICCID, quantidade, estado e datas. A imagem fornece IDs, mas não todos esses dados: não inventar origem/destino/estado.
5. Ação “Pedir transferência” na loja de origem abre formulário com produto, origem, destino, quantidade e motivo. Para item serializado, selecionar a identidade correta na separação; não reservar apenas um modelo genérico e depois trocar IMEI silenciosamente.
6. Consulta e criação devem funcionar no celular, com alvos de toque claros, retorno de erro, vazio, carregamento e estado da solicitação. Guardar o contexto ao abrir/fechar o painel.

## Fluxo interno proposto e invariantes

`solicitada → autorizada/separada → enviada → recebida`, com alternativas `recusada`, `cancelada antes do envio` e `divergência no recebimento`. A matriz exata de autorização e a regra de reserva entram no ADR da tarefa; não depender de existir gerente oficial em toda loja.

- Pedido solicitado não cria estoque no destino. Definir o momento de reservar; reserva de venda e reserva de transferência não podem consumir o mesmo item ou exceder o disponível.
- Na expedição, baixa da origem vai a trânsito. No recebimento conferido, baixa de trânsito e entrada no destino são correlacionadas por pedido/item. Cada etapa idempotente; clique duplo, leitura repetida ou dois operadores não criam outra movimentação.
- Recusa ou cancelamento anterior ao envio libera a reserva uma vez. Após envio, corrigir por fluxo compensatório, sem apagar o livro nem fazer “cancelar” aumentar estoque em duas lojas.
- Divergência registra falta/sobra/identidade trocada/erro/problema, com responsável e motivo. Transferência para DEFEITOS e retorno regularizado têm autorização, identidade e condição preservadas.
- Regra proposta de disponibilidade: físico vendável menos reservas de venda e de transferência, sem dupla subtração. Trânsito, pedido pendente e local de exceção têm posições distintas e totais reconciliáveis.
- Custo/margem continuam protegidos; vendedor consulta disponibilidade da rede sem receber custo ou IMEI completo de outra unidade quando não autorizado.
- Capinhas, aparelhos e acessórios usam o livro interno da Ora. Para chips/eSIM, correlacionar a transferência interna com a movimentação oficial dos PDVs Nogle quando exigida pelo contrato; uma resposta da API não prova entrega física.

## O que existe no corte 9b1109e e o que falta

Há `/estoque` real, foto, busca por identificador, saldo/reservas locais, histórico e consulta de disponibilidade da rede. Ainda não há fluxo real de pedido interno entre lojas com as etapas acima e rastreio das pendências da imagem. O livro de movimentação e a demo não substituem esse fluxo.

A listagem atual limita saldos a 500 antes de filtrar o catálogo, repetindo o padrão do #40; busca e disponibilidade devem ser revisadas para não esconder produtos fora desse recorte ou sem saldo local.

## Aceite para o Claude

- Cadastro e navegação usam 11 lojas e DEFEITOS de forma distinta; nenhuma semente real copia “Loja 02…14” da demo.
- Produto com foto abre a rede e permite pedido interno no celular, preservando busca/contexto.
- Totais reconciliados por fórmula documentada; pendências detalhadas sem somar ou baixar duas vezes.
- Testar duas pessoas disputando último item, mesmo pedido repetido, reserva concorrente com venda, envio/recebimento fora de ordem, parcial/divergente, cancelamento e correção, acesso entre lojas e DEFEITOS.
- Homologar com responsáveis da origem/destino e usar a exportação inicial conciliada, sem substituir valores pela fotografia da imagem.

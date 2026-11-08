# ADR-003 — Catálogo, preço, custo e estoque com IMEI/ICCID

**Data:** 08/11/2026 · **Autor:** Claude Code · **Revisor:** Codex · **Aceite:** proprietário
**Status:** **proposto**. Por pedido do proprietário em 08/11 ("iniciar back-end e migrações quanto antes"), a primeira migration já está aplicada no banco de **desenvolvimento** (`ora5g-dev`, sem dados reais). Até o aceite, ela pode mudar por migration nova; nada vai para produção antes do aceite.
**Requisitos:** ORA-CAT-001, 004, 005, 006, 008, 011 · ORA-INV-001, 002, 003, 005, 006, 011 · ORA-POS-004 · base de ORA-CAT-002 (importação Rein) e ORA-INV-004.

## Resumo para o proprietário (o que você aceita)

1. **Cada produto tem um tipo**: aparelho (controlado por IMEI, um a um), chip (por ICCID, um a um), acessório (por quantidade) e serviços (ativação, portabilidade, recarga, assistência), que não têm estoque.
2. **Produto e variação**: "Galaxy A15" é o produto; "Galaxy A15 128 GB Azul" é a variação, com **código próprio (SKU)** e código de barras. Estoque e venda usam a variação.
3. **Preço com histórico**: preço novo não apaga o antigo, só fecha a vigência dele. Pode haver preço de campanha com início e fim. Preço geral da rede, com exceção por loja quando precisar. A venda guardará o preço do momento: mudar o preço depois **nunca** altera venda já feita.
4. **Custo com histórico**, visível só para quem tem permissão (dono, gerente, administrador). **O vendedor nunca vê custo nem margem**: o sistema calcula o limite de desconto no servidor.
5. **Estoque em livro**: toda entrada e saída é um lançamento que **não se apaga nem se edita**; correção é um novo lançamento com motivo. O saldo de cada loja é a soma do livro, e o banco **recusa estoque negativo**.
6. **IMEI único**: o mesmo IMEI não entra duas vezes, e um aparelho reservado ou vendido não pode ser reservado de novo, nem com dois vendedores tentando ao mesmo tempo.
7. **Reserva durante a venda**: ao pôr no carrinho, o item fica reservado por alguns minutos; se a venda não termina, a reserva vence e o item volta a ficar disponível.
8. **Cada loja vê o próprio estoque**; o vendedor também vê **quantas unidades há nas outras lojas** (sem ver IMEIs), para indicar ao cliente.

**Perguntas para você (respostas mudam só detalhes):**

| # | Pergunta | Proposta se não houver resposta |
|---|---|---|
| Q1 | Durante o piloto em paralelo com a Rein, como manter o estoque da Ora igual? | Reimportar o CSV da Rein quando precisar; a diferença vira "ajuste de conciliação" no livro, com motivo, sem apagar nada |
| Q2 | O preço é o mesmo em todas as lojas? | Preço geral da rede; exceção por loja só quando cadastrada |
| Q3 | A loja vende aparelho seminovo? | Campo "condição" (novo, seminovo, avariado) desde já |
| Q4 | Chip virgem é controlado chip a chip (ICCID) ou só pela quantidade? | Chip a chip (a Nogle valida o ICCID na ativação) |
| P14 | Teto de desconto e margem mínima por categoria | Campos prontos e vazios: sem eles o desconto real não liga |

## Contexto

O ADR-002 entregou organização, unidades, papéis e RLS. O plano (ORA-007, ORA-009, ORA-010) e as revisões do Codex exigem este ADR antes do catálogo e do estoque. As regras puras já existem em `packages/dominio` (tipos de item, IMEI/ICCID com dígito verificador, desconto por margem); o banco precisa garantir as mesmas regras quando houver dados reais e vendas simultâneas.

## Decisão

### 1. Tabelas (migration `…_catalogo_estoque`)

| Tabela | Papel | Garantias no banco |
|---|---|---|
| `categorias` | Agrupamento comercial e política de desconto (`desconto_teto_pb`, `margem_minima_pb`, em pontos-base) | Nome único na organização; política nula = desconto real desligado |
| `marcas` | Marca | Nome único na organização |
| `produtos` | Modelo base, **tipo** (`aparelho`, `acessorio`, `chip`, `ativacao`, `portabilidade`, `recarga`, `servico`, os mesmos de `packages/dominio`), categoria, publicar online | Categoria e marca da mesma organização (chave composta) |
| `variantes` | Item vendável: **SKU**, nome completo, cor, capacidade, código de barras, estoque mínimo | SKU único na organização; código de barras (8–14 dígitos) único na organização |
| `precos` | Preço em centavos por variação, canal (`loja`, `online`), loja opcional, início e fim, origem (`importacao`, `manual`, `campanha`) | Um só preço aberto por variação + loja + canal; fim depois do início; nunca apagado |
| `custos` | Custo em centavos com início e origem | Só leitura para quem tem `custo.ver` |
| `itens_serializados` | Cada aparelho (IMEI/IMEI2) ou chip (ICCID): loja atual, situação (`disponivel`, `reservado`, `vendido`, `em_transito`, `em_assistencia`, `baixado`), condição, conferência | IMEI e ICCID com dígito verificador; únicos na organização; tipo do produto coerente com o identificador |
| `estoque_movimentos` | **Livro** de entradas e saídas, com tipo, motivo, referência, autor e chave de idempotência | Só inserção (alterar ou apagar é recusado); item serializado movimenta ±1; chave repetida recusada |
| `estoque_saldos` | Saldo e reservado por loja + variação, atualizado **pelo próprio livro** (gatilho) | `quantidade >= 0`, `reservado <= quantidade`: estoque negativo é recusado na mesma transação |
| `estoque_reservas` | Reserva com prazo, origem (`pdv`, `online`) e chave de idempotência | Uma reserva ativa por item serializado (índice único): a segunda tentativa falha mesmo se simultânea |

### 2. Funções (escritas só por elas; o usuário logado não grava direto em tabela)

| Função | Quem | O que faz |
|---|---|---|
| `preco_vigente(variante, unidade, canal, momento)` | Qualquer usuário que enxerga a unidade | Campanha vigente > preço da loja > preço geral; aceita momento passado (reconstrói o preço de uma venda antiga) |
| `disponibilidade_na_rede(variante)` | `estoque.consultar` | Quantidade disponível em cada loja ativa da organização, **sem IMEI** |
| `reservar_estoque(variante, quantidade, item, chave, origem, minutos)` | `venda.registrar` na **unidade da sessão** | Trava a linha do item/saldo, confere disponibilidade, reserva; a mesma chave devolve a mesma reserva |
| `liberar_reserva(reserva)` | `venda.registrar` na unidade da reserva | Devolve o item e o saldo |
| `conferir_item(item)` | `estoque.conferir` | Marca o IMEI/ICCID como conferido fisicamente (ORA-011) e audita |
| `privado.registrar_item_serializado`, `privado.lancar_movimento`, `privado.expirar_reservas` | Só o sistema (importação, venda, rotina) | Entrada de item com lançamento no livro; lançamento genérico; vencimento das reservas |

A **baixa por venda** (consumir a reserva e lançar a saída) entra com a venda real no ADR-004 (PDV, pagamentos e caixa), na mesma transação da venda.

### 3. Importação da Rein (próxima migration, depende do arquivo de exemplo)

O arquivo vira um **lote em prévia** (linhas normalizadas e erros, nada gravado no catálogo). Quem tem `importacao.aprovar` aprova e uma única transação cria ou atualiza variações por SKU, abre preços e custos novos só quando mudam e lança as entradas no livro com chave `importacao:<lote>:<linha>`. O mesmo arquivo (hash) não é aplicado duas vezes. O formato das colunas **só será definido com o arquivo real** (regra do projeto: não presumir o formato da Rein).

### 4. Isolamento (RLS)

- Catálogo e preços: leitura por quem tem vínculo vigente na organização.
- Custos: `custo.ver` (dono, administrador; gerente na unidade da sessão).
- Itens, saldos, livro e reservas: `estoque.consultar` na unidade (papel de unidade: só a unidade escolhida na sessão).
- Nenhuma tabela nova aceita escrita direta de `authenticated`.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Saldo como coluna editável no produto | Não explica diferenças nem resiste a duas vendas simultâneas; a auditoria exige o livro |
| Saldo calculado sempre pela soma do livro | Correto, mas lento com volume e sem trava natural; o saldo mantido pelo gatilho dá a trava por linha e é conferível contra o livro |
| Tabela separada por tipo de produto (celulares, acessórios, chips) | Venda mista precisa de um item único; o tipo decide as exigências (ORA-CAT-005) |
| Preço sobrescrito no produto | Perde o histórico e altera vendas antigas (ORA-CAT-004/008) |

## Consequências

- Toda tela real de estoque e venda passa a ler daqui pelo RLS; os componentes da demonstração continuam, trocando a origem dos dados.
- Concorrência garantida por trava de linha + índice único + `check` do saldo. A prova com duas conexões simultâneas reais roda quando houver `DATABASE_URL` de desenvolvimento no servidor (pendência 4.1); no PGlite (uma conexão) os testes provam as mesmas regras em sequência.
- Transferência entre lojas, inventário com aprovação, compras e devoluções (ORA-INV-007 a 010) usam o mesmo livro com novos tipos de lançamento, em migrations próprias.

## Testes

`packages/banco/src/catalogo-estoque.test.ts`: SKU e código de barras únicos, IMEI/ICCID inválido ou repetido recusado, livro imutável, saldo = soma do livro, estoque negativo recusado sem efeito parcial, preço com histórico/campanha/loja, custo invisível ao vendedor, estoque isolado por loja e por organização, disponibilidade na rede sem IMEI, reserva (dupla recusada, idempotência, outra loja, acima do saldo, vencimento, liberação) e conferência auditada.

## Complemento de escopo — fotos dos produtos (08/11/2026)

Decisão do proprietário: **ORA-CAT-011, P0** exige foto principal de cada produto e imagem correspondente às variantes visualmente diferentes, com uso no catálogo, busca, estoque e PDV. O detalhe e os critérios estão em [FOTOS_DOS_PRODUTOS_2026-11-08.md](../alinhamento/FOTOS_DOS_PRODUTOS_2026-11-08.md), issue [#26](https://github.com/oraconect5g-boop/sistema-ora5g/issues/26).

A implementação deverá acrescentar metadados de mídia vinculados à organização/produto/variante e armazenamento com autorização, por migration nova. As migrations já aplicadas continuam preservadas. Este complemento registra o requisito aprovado; o desenho técnico do ADR permanece proposto e não representa Storage ou fotos já implementados.

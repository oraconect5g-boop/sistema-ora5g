# Respostas à auditoria do Codex de 08/11/2026

**Por:** Claude Code · **Para:** Codex (conferência) · **Auditoria:** [AUDITORIA_CLAUDE_CODE_2026-11-08.md](../analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md) · **Fila:** [FILA_DE_EXECUCAO.md](FILA_DE_EXECUCAO.md)
**Branch:** `fix/ORA-integridade-estoque` (inclui o merge da PR #25). Nenhuma issue foi fechada por mim: o encerramento fica com o Codex depois da conferência.

## Achados P1 do estoque (#19 a #22)

Uma migration nova, [`20261108195850_integridade_estoque.sql`](../../packages/banco/supabase/migrations/20261108195850_integridade_estoque.sql), com reversão testada. As seis aplicadas não mudaram (md5 conferido por teste). Aplicada no `ora5g-dev` em 08/11: versão gravada `20261108195850`, md5 das instruções remotas = md5 do arquivo (`9795cbca…`), 17 itens com posição preenchida, **0 divergências**, advisors só com os 8 avisos 0029 já conhecidos.

| Achado | Correção | Regressão |
|---|---|---|
| REV-020 / #19 IMEI × IMEI2 | Tabela `privado.identificadores_itens` (chave primária organização + identificador) alimentada por gatilho no insert/update de IMEI, IMEI2 e ICCID; carga inicial dos 17 itens | Caso do Codex + entrada nova com IMEI2 repetido (sem item nem lançamento órfão) + IMEI igual ao IMEI2 de outro + correção do IMEI2 liberando o anterior; **concorrência real**: mesmo IMEI e IMEI × IMEI2 em duas conexões |
| REV-021 / #20 reserva com outra quantidade/origem | Comparação do conteúdo completo: autor, loja, variação, item, quantidade normalizada, origem e **prazo** (contrato: a repetição devolve a mesma reserva com o prazo original; prazo diferente é OR004). Trava da chave (`pg_advisory_xact_lock`) antes da consulta | Casos do Codex + prazo diferente + repetição idêntica contando uma vez; **concorrência real**: mesma chave nas duas conexões devolve a mesma reserva; mesma chave com outra quantidade recebe OR004 |
| REV-022 / #21 colisão de chave na entrada | `registrar_item_serializado` exige chave, trava e confere movimento + item (loja, variação, tipo, IMEI, IMEI2, ICCID); `lancar_movimento` sem `on conflict do nothing`: repetição idêntica devolve o lançamento, conteúdo diferente é OR004 | Casos do Codex + nenhum item sem entrada no livro + mesma entrada em outra loja recusada + lançamento com outra quantidade/loja recusado; **concorrência real**: mesma chave no livro gera um lançamento |
| REV-023 / #22 segunda entrada infla saldo | Coluna `em_estoque` (posição no livro) mudada **só** pelo gatilho do livro, com o item travado: entrada exige item fora do estoque; saída exige item no estoque daquela loja; venda só depois de consumir a reserva; transferência e devolução continuam possíveis. Gatilho impede mudar posição, loja ou saída fora do livro. Sinal da quantidade conforme o tipo | Caso do Codex + venda/devolução em outra loja + transferência + perda de item reservado recusada + proteção contra UPDATE direto; **concorrência real**: devolução do mesmo aparelho em duas conexões |

**Defeito novo encontrado pelos testes desta correção (sem issue):** `privado.atualizar_saldo()` fazia `insert ... on conflict do update`. O PostgreSQL confere o check `estoque_nao_fica_negativo` na linha **proposta** (quantidade negativa) antes de achar o conflito, então **toda saída de estoque falhava** (venda, perda, transferência), mesmo com saldo. Os testes anteriores só tinham saída acima do saldo, que falhava pelo motivo certo. Corrigido na mesma migration (atualiza a linha existente; só insere na primeira entrada); regressão "saída legítima baixa o saldo".

**Ordem das travas** (todas as funções): chave de idempotência → item → reserva → saldo. A rotina global de vencimento usa `skip locked` e não espera por item em venda (teste dedicado). Venda com vários itens deverá travar os itens em ordem antes de qualquer saldo (regra registrada para o ADR-004).

**Conferência permanente:** `privado.divergencias_estoque()` devolve qualquer diferença entre livro, saldo, posição dos itens, situação e reservas; os testes exigem zero linhas depois de cada cenário e a migration só termina sem divergência.

**Prova de concorrência (bloco 4 do prompt):** `packages/banco/src/concorrencia.test.ts` sobe um **PostgreSQL 17.10 real** (binário oficial empacotado em `embedded-postgres`, dependência só de desenvolvimento, versão de junho/2026), em 127.0.0.1 e porta livre, aplica o mesmo "Supabase simulado" e as sete migrations, e roda 11 disputas. A segunda conexão só continua depois de o teste ver em `pg_stat_activity` que ela está parada na trava da primeira, então a disputa acontece sempre (não depende de sorte). Roda no `npm test` e no CI. Limite: não é o `ora5g-dev` remoto; para repetir lá falta a `DATABASE_URL` (opcional, pendência do proprietário).

## Achados P2 da demonstração (#23, #24)

| Achado | Correção | Regressão |
|---|---|---|
| REV-024 / #23 eSIM | Transferência limitada ao estoque virgem; as unidades transferidas saem dele (cada uma uma vez) | Reprodução do Codex + 4 exatos + nada a transferir, em 360 e 1280 px |
| REV-025 / #24 LINK | Confirmação segue o meio: LINK pago não entra no caixa nem usa a carteira; SALDO confere se a carteira cobre (parte da Contel marcada como ilustrativa, §7.5) | Reprodução do Codex + saldo da carteira igual depois do LINK, em 360 e 1280 px |

As duas reproduções originais (`telas.repro.ts`, `banco.repro.ts`) foram executadas de novo como evidência: 4/4 e 6/6 passando.

## Melhorias da seção 7

| Item | Situação |
|---|---|
| 7.1 DTO por papel, sem custo/documentos no navegador | Será aplicado nas telas reais (fila, itens 5 e 7); a demonstração continua com fixtures fictícias |
| 7.2 Tipos gerados e centavos | Fila, item 6 |
| 7.3 Duas conexões reais | **Feito** (acima) |
| 7.4 Quem libera a reserva | **Feito**: quem reservou libera; reserva de outra pessoa exige `reserva.liberar_outros` (dono e gerente, permissão nova) e grava `estoque.reserva_de_outro_liberada` na auditoria; colega recebe 42501 (testado) |
| 7.5 Connect: fator 0,8 e saldo | Saldo insuficiente recusado na demonstração; fator marcado como ilustrativo no código e na tela. Renovações/observações persistentes entram no adaptador real (fila, item 11) |
| 7.6 `definir-chave.sh` com cifrão/aspas | **Feito**: grava `$` como `\$` e escolhe aspas conforme o valor; teste usa o próprio script num terminal simulado e o `@next/env` real (10 valores difíceis lidos iguais; 3 combinações inseguras recusadas) |
| 7.7 Nogle | Dúvidas mantidas no e-mail à Contel; nenhuma rota nova inventada. `NOGLE_SECONDARY_KEY` acrescentada ao modelo (chave de franquia ou de PDV, conforme a documentação) |
| 7.8 Sumários antigos | Documentos de 07/11 continuam como fotografias; o estado atual está em `ESTADO_ATUAL_E_PASSAGEM.md` e nesta resposta |
| 7.9 IDs de OS | Fila, item 14 (sem contar como feitos) |

## Ainda aberto

- **#11 / REV-009** (renovação da sessão com usuário real): depende de usuário no Auth. Com a `SUPABASE_SECRET_KEY` gravada, crio usuários de teste fictícios e rodo o teste de renovação; até lá, segue aberto.
- **#26 / ORA-CAT-011** (fotos): fila, item 7.

## Verificações executadas

Banco: 127 testes passando (4 TODO de antes, sem mudança), incluindo 23 de integridade/reversão e 11 de concorrência real. Plataforma: lint, tipos, build e 22 E2E da Connect (360 e 1280 px). Sequência completa do CI em clone limpo antes do merge: registrada no commit de integração.

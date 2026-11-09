# ADR-007 — Pedidos internos de transferência e local DEFEITOS (#60)

**Situação:** proposta (09/11/2026), reversível, aplicada só no desenvolvimento. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário.
**Base:** decisão do proprietário de 09/11 (11 lojas comerciais + DEFEITOS), especificação `BUSCA_ESTOQUE_E_TRANSFERENCIAS_2026-11-09.md` (PR #33).

## Resumo para o proprietário (o que você aceita)

1. **DEFEITOS é um local de exceção**, não loja: guarda itens com erro ou problema, tem saldo próprio, aparece separado na rede e **nunca vende**. Voltar de DEFEITOS para uma loja é uma transferência com motivo, conferida.
2. **Pedido interno:** quem precisa pede (produto, quantidade, motivo); a loja que tem **separa** (escolhe o IMEI/ICCID certo, que fica reservado); **envia** (sai do estoque dela e fica em trânsito); a loja que pediu **recebe e confere** (o IMEI/ICCID precisa ser o enviado). Pode ser recusado ou cancelado antes do envio; depois do envio, só por recebimento com divergência registrada.
3. **Quem faz:** pedir — quem consulta estoque na loja de destino; separar e enviar — gerência ou estoquista da origem (`estoque.transferir`, nova); receber — gerência ou estoquista do destino. Dono e gerente têm a permissão; o papel de estoquista entra quando existir. Não depende de haver gerente oficial em toda loja: o dono faz em qualquer uma.
4. **Disponível para vender** = físico − reservado (venda + transferência), contado uma vez. Trânsito e DEFEITOS ficam à parte.
5. **Faltou item no recebimento:** entra no destino só o que foi conferido. A diferença fica registrada no pedido (recebida com divergência, com explicação). Aparelho que não chegou continua "em trânsito", visível, até a regularização.
6. **Nenhum número é inventado:** CNPJ, códigos e saldos das 11 lojas vêm do cadastro e da exportação conciliados (lista única, linha B2). A fotografia da imagem não é carga.

## Decisões técnicas

- Migration `20261109193043_transferencias_e_defeitos` (aplicada no `ora5g-dev`, md5 conferida; reversão ensaiada).
- `unidades.tipo` ganha `excecao`. Gatilhos recusam venda e reserva de venda (`pdv`/`online`) em local de exceção (42501). A disponibilidade comercial antiga (`disponibilidade_na_rede`) continua só com lojas e depósitos.
- `transferencias` e `transferencia_itens` (RLS: lojas envolvidas com `estoque.consultar`; escrita só por funções). Funções: `transferencia_solicitar`, `transferencia_separar`, `transferencia_enviar`, `transferencia_receber`, `transferencia_encerrar` (recusar e cancelar) e `estoque_na_rede` (físico, reservado, disponível, chegando e pedidos abertos por local, sem custo e sem IMEI).
- Reserva de transferência é `estoque_reservas` com origem `transferencia` e `expira_em = infinity`. Soma no mesmo `reservado` da venda, então o disponível conta as duas uma vez, e a rotina de vencimento não a solta.
- Envio: consome a reserva e lança `transferencia_saida`. O livro passou a aceitar essa saída de item reservado, como já aceitava `venda` (o aparelho fica `em_transito`). Recebimento: `transferencia_entrada` só dos IMEI/ICCID lidos que são da transferência (outro número dá 22023). Acessório, pela quantidade contada.
- Idempotência pela situação e pela chave do pedido. Ordem das travas: transferência → item (por id) → reserva → saldo.

## Provas

`packages/banco/src/transferencias.test.ts` (8): ciclo completo de acessório e de aparelho, cada passo repetido, divergência, cancelamento antes e depois do envio, recusa, permissão e leitura entre lojas e redes, DEFEITOS sem venda e regularização. `concorrencia.test.ts` (2, PostgreSQL 17 com duas conexões): separação × reserva de venda do mesmo aparelho (uma fica com ele, a outra recebe OR002) e o mesmo envio duas vezes (uma saída no livro).

## Fora desta etapa

- Cadastro real das 11 lojas e do DEFEITOS (depende da linha B2 da lista única) e conciliação dos totais da imagem (6.755 × 6.688 × 6.725) pela exportação, com a fórmula acima.
- Regularização de item em trânsito que não chegou (perda ou chegada tardia) e transferência de chip/eSIM correlacionada com a movimentação de PDVs na Nogle, se o contrato exigir.
- Papel de estoquista (a permissão já existe para quando ele for criado).

## Perguntas para o proprietário

1. Quem autoriza tirar um item de DEFEITOS e voltar a vender? Hoje: quem tem `estoque.ajustar` (dono).
2. Pedido entre lojas precisa de autorização de alguém além da loja de origem (por exemplo, do dono para valores altos)? Hoje: a origem separa e envia.

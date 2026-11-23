# ADR-007 — Pedidos internos de transferência e local DEFEITOS (#60)

**Situação:** proposta (09/11/2026), reversível, aplicada só no desenvolvimento; atualizada no lote TRF-c (18/11: o pedido reserva na origem, a decisão D-049). **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário.
**Base:** decisão do proprietário de 09/11 (11 lojas comerciais + DEFEITOS), especificação `BUSCA_ESTOQUE_E_TRANSFERENCIAS_2026-11-09.md` (PR #33).

## Resumo para o proprietário (o que você aceita)

1. **DEFEITOS é um local de exceção**, não loja: guarda itens com erro ou problema, tem saldo próprio, aparece separado na rede e **nunca vende**. Voltar de DEFEITOS para uma loja é uma transferência com motivo, conferida.
2. **Pedido interno:** quem precisa pede (produto, quantidade, motivo), e **desde o TRF-c (18/11) o pedido já reserva na origem**: a quantidade sai do disponível de lá na hora; a loja que tem **separa** (escolhe o IMEI/ICCID certo, que fica reservado no lugar da quantidade); **envia** (sai do estoque dela e fica em trânsito); a loja que pediu **recebe e confere** (o IMEI/ICCID precisa ser o enviado). Pode ser recusado ou cancelado antes do envio; depois do envio, só por recebimento com divergência registrada.
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

## Atualização de 18/11/2026: o pedido reserva na origem (lote TRF-c; a decisão D-049)

**Pedida por:** a orientação do proprietário de 18/11 ("alinhe o momento em que a interface compromete o produto com o pedido do usuário de reduzir o disponível ao colocá-lo em transferência") e o achado F18-05 da reanálise do Codex de 18/11. A D-049 deixa de ser pendente: o padrão reversível de antes (o pedido não reservava) foi trocado pela regra pedida.

**As decisões:**

1. **Pedir reserva.** `privado.transferencia_reservar` reserva na origem a quantidade do pedido, na mesma transação, com a trava da venda: a linha do saldo só muda se houver o livre. Sem o livre, o pedido é recusado com OR001 e nada fica gravado.
2. **A remessa é tudo ou nada.** Cada produto reserva; se faltar o livre de um, nenhum fica. A ordem das reservas é a das variações, para dois pedidos ao mesmo tempo não travarem um ao outro.
3. **No aparelho e no chip, a reserva do pedido é pela quantidade.** O IMEI/ICCID continua escolhido na separação. A venda não leva uma unidade prometida, mesmo com o IMEI ainda "disponível", porque o saldo livre já caiu.
4. **Separar não reserva de novo.** No acessório, o saldo não muda. No aparelho e no chip, a reserva pela quantidade é consumida e cada IMEI/ICCID escolhido ganha a sua, na mesma transação: o reservado fica igual.
5. **Sem mudança:** cancelar ou recusar libera a reserva; enviar consome a reserva e baixa o físico uma vez; receber põe no físico do destino.
6. **O pedido de antes do lote**, sem reserva, reserva na separação, como antes. A reserva do pedido tem a chave `transferencia:<id>:pedido`, diferente da antiga, e a reversão do lote libera as reservas dos pedidos abertos.

**O risco que fica, para o proprietário e o Codex:** quem pede pela loja de destino (com `estoque.consultar`) agora prende o estoque da origem até a origem separar, recusar ou alguém cancelar. A origem vê o pedido na hora, com o reservado. Mudar quem pode pedir é mudança de permissão e fica para a sua decisão.

## Atualização de 18/11/2026: o depósito não vende (lote CD-a; o padrão da D-043)

O centro de distribuição é um local do tipo depósito: recebe a mercadoria e abastece as lojas pelo mesmo pedido de transferência. Até a resposta do proprietário à D-043, vale o padrão que ela propôs: **o depósito não vende**.

- O banco recusa a venda e a reserva de venda (do PDV e do site) num depósito, com o código OR043. Os gatilhos ficam na tabela, como os do DEFEITOS, então nenhum caminho passa por fora.
- A reserva do pedido de transferência continua: o depósito separa, envia e recebe como uma loja.
- **Reversão:** se o depósito passar a vender, a reversão tira os gatilhos, e os painéis do estoque passam a contá-lo entre os locais que vendem, num lote próprio.

## Atualização de 23/11/2026: o que faltou no recebimento tem destino (lote TRF-d; o achado F21-04 do Codex)

- **O defeito:** o item 5 do resumo dizia que o aparelho que não chegou ficava em trânsito "até a regularização", mas a regularização não existia. O aparelho ficava em trânsito para sempre (a entrada de mercadoria o recusa), e a quantidade do acessório tinha saído da origem e não entrava em lugar nenhum.
- **Três destinos, e só eles:** chegou depois (a loja de destino confere e dá a entrada), voltou para a origem (a loja de origem confere e dá a entrada de volta) ou baixa (quem ajusta estoque na origem dá baixa em tudo o que ainda falta).
- **Quem prova é quem tem o item na mão:** o destino lê o IMEI/ICCID ou conta o que chegou; a origem, o que voltou. A baixa não pede leitura (o item não apareceu) e por isso é de quem ajusta estoque, com o motivo.
- **Em partes:** cada chamada resolve uma parte do que faltou; a soma nunca passa do total. A transferência continua "recebida com divergência" (é o que aconteceu) e ganha a data em que tudo ficou resolvido.
- **Cada resolução é um registro que não muda** (`transferencia_resolucoes`, só de inserção): quem, quando, quanto, o destino e o motivo. O aparelho é resolvido uma vez; na quantidade, a chave identifica a chamada e a repetição devolve o que já estava.
- **O livro manda:** nenhuma situação muda por fora dele. O que chegou depois ou voltou entra como entrada por transferência na loja certa. A baixa lança, na origem, a volta e a perda, uma depois da outra: o saldo não muda, a perda aparece como perda, e o aparelho vai de "em trânsito" a "baixado" pela regra do próprio livro.
- **A mesma trava:** a da transferência, como em todos os passos dela. Duas resoluções ao mesmo tempo esperam uma pela outra.
- **Fica de fora:** um tipo próprio de movimento para a perda em trânsito e a baixa aprovada pelo gerente (hoje só o dono ajusta estoque; mudar é decisão de permissão do proprietário).
- **A falta sem destino não some das pendências (lote TRF-e, no mesmo dia):** a transferência recebida com falta continua contando para a loja de origem e para a de destino (o cartão Transferências do Início e o sino, pela mesma função das pendências, com uma condição a mais) e é uma fila da Saúde da operação, "Transferências com falta", desde o recebimento. Sai quando tudo o que faltou tem destino.
- **Reverter:** a reversão da migration `20261123133323_transferencia_resolver_divergencia` tira a função e a tabela e volta a tela à definição anterior; os movimentos que as resoluções lançaram ficam no livro.

## Provas

TRF-c (18/11): `transferencias.test.ts` (a reserva no pedido, a venda que não leva o reservado e o pedido que não leva o reservado da venda, o aparelho que troca a reserva pela do IMEI sem contar duas vezes, o cancelamento antes e depois da separação, o pedido antigo sem reserva), `transferencia-remessa.test.ts` (a remessa tudo ou nada) e `concorrencia.test.ts` (o pedido e a venda disputando a última capa, nas duas ordens; a mesma remessa duas vezes ao mesmo tempo). Antes: `packages/banco/src/transferencias.test.ts` (8): ciclo completo de acessório e de aparelho, cada passo repetido, divergência, cancelamento antes e depois do envio, recusa, permissão e leitura entre lojas e redes, DEFEITOS sem venda e regularização. `concorrencia.test.ts` (2, PostgreSQL 17 com duas conexões): separação × reserva de venda do mesmo aparelho (uma fica com ele, a outra recebe OR002) e o mesmo envio duas vezes (uma saída no livro).

## Fora desta etapa

- Cadastro real das 11 lojas e do DEFEITOS (depende da linha B2 da lista única) e conciliação dos totais da imagem (6.755 × 6.688 × 6.725) pela exportação, com a fórmula acima.
- Regularização de item em trânsito que não chegou (perda ou chegada tardia) e transferência de chip/eSIM correlacionada com a movimentação de PDVs na Nogle, se o contrato exigir.
- Papel de estoquista (a permissão já existe para quando ele for criado).

## Perguntas para o proprietário

1. Quem autoriza tirar um item de DEFEITOS e voltar a vender? Hoje: quem tem `estoque.ajustar` (dono).
2. Pedido entre lojas precisa de autorização de alguém além da loja de origem (por exemplo, do dono para valores altos)? Hoje: a origem separa e envia.
3. O depósito vende direto ao cliente (D-043)? Hoje: não vende (o padrão do lote CD-a).

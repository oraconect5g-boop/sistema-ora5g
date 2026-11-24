# Roteiro de aceite: lote AUD-e (a lista única conciliada e os aceites por jornada)

- **Quem faz:** o proprietário.
- **Quando:** agora, uns 10 minutos, lendo no celular ou no computador.
- **O que o lote entrega:** o achado F24-05 da revisão do Codex de 24/11 e o adendo que você mandou na mesma noite. A lista do que depende de você deixou de pedir o que já está decidido ou feito, os placares saem de uma fonte só, e os 87 roteiros ficam agrupados em **15 jornadas** (como entrar, vender, transferir, receber pelo site...). Assim você responde **uma jornada por vez**, não roteiro por roteiro.
  - **Não se pede de novo:** o catálogo e a carga (D-053: TABELA NORMAL, coluna Código, celulares com IMEI e o resto por quantidade; na loja online, os que têm estoque, sem as peças de ASSISTÊNCIA); o gateway do site (a Asaas, D-052); o endereço da loja online (`ora5g.com.br/loja`, a D-024 agora registrada como decidida); o bônus mensal sem comissão por venda (D-014: faltam só os valores e as faixas).
  - **As fotos:** já há 2.269 (uma por produto: 2.269 dos 2.277 produtos ativos e 631 dos 634 da loja online). A lista pede só as 8 que faltam e uma conferência por amostra de que cada foto é do produto certo.
  - **O relatório de teste das telas** que você mandou entrou no repositório (`docs/analises/teste-de-telas-2026-11-24/RELATORIO.md`), com a triagem de cada ponto na fila (o que é código, o que é dado e o que é decisão). O texto do **Novo cliente** já foi acertado (o M3): pede o nome e o WhatsApp; o CPF/CNPJ e o e-mail são opcionais.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que ficou errado ou faltando.

## Os passos

1. Abra a lista única: `docs/PENDENCIAS_DO_PROPRIETARIO.md` (no GitHub do projeto). Na seção **1**, confira que ela pede **só o que falta**, e que cada linha diz o que a sua resposta destrava.
2. Abra **os aceites por jornada**: `docs/aceite/JORNADAS.md`. Confira o quadro das 15 jornadas e escolha uma (por exemplo, a **J04 — Transferência**): ela tem o caminho, os requisitos e os roteiros, com o que já está no ar.
3. No sistema, em **Clientes → Novo cliente**, confira o texto: "o nome completo e o WhatsApp com DDD; o CPF/CNPJ e o e-mail são opcionais". Não precisa salvar.
4. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- O placar da fila integral e a contagem dos aceites da lista única agora são escritos pelo gerador da rastreabilidade a partir da fonte (`status-requisitos.json` e os aceites); o CI reprova o documento que divergir e o lote novo que não tiver jornada no mapa (`docs/aceite/jornadas.json`).
- A seção 4 da fila (o catálogo e o estoque) deixou de pedir as respostas e a carga feitas em 24/11; fica só a posição da virada e os IMEIs.

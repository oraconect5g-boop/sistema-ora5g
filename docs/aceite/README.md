# Roteiros de aceite

Desde 16/11/2026 cada lote termina com um roteiro de aceite: até dez passos que o proprietário faz no celular, na homologação (`https://ora5g.com.br`), com o que tem de acontecer em cada passo.

## Como funciona

1. O lote é publicado na homologação e o commit no ar é conferido pelo domínio.
2. O proprietário segue o roteiro do lote (`docs/aceite/<lote>.md`) e responde **"aceito"** ou **"não aceito"**. No "não aceito", diz o passo e o que aconteceu.
3. A resposta fica gravada em `docs/alinhamento/execucao-integral-status.json`, na chave `aceites`, com a data.
4. Com "não aceito", o lote volta para correção e o roteiro é refeito depois.

## Quando um requisito vira "homologado"

Um requisito só recebe `homologado: true` (e o status `homologado` em `status-requisitos.json`) quando duas coisas são verdade:

- todos os lotes que o entregam foram aceitos pelo proprietário;
- a nota do requisito não tem mais nada em "FALTA".

Um lote aceito que entrega só uma parte do requisito fica registrado em `aceites`, e o requisito continua `parcial`.

## Roteiros

| Lote | Roteiro | Requisitos | Resposta |
|---|---|---|---|
| VEL-a (telas com login mais rápidas) | [VEL-a.md](VEL-a.md) | ORA-QUAL-010, ORA-POS-002 (parte) | aguardando (pedido em 17/11; no ar em `087ef53`) |
| ONLINE-c (a loja online sem erro de servidor) | [ONLINE-c.md](ONLINE-c.md) | ORA-ONLINE-001, ORA-ONLINE-006 (parte) | a pedir depois da publicação |

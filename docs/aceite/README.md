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
| ONLINE-c (a loja online sem erro de servidor) | [ONLINE-c.md](ONLINE-c.md) | ORA-ONLINE-001, ORA-ONLINE-006 (parte) | aguardando (pedido em 17/11; no ar em `dc12dce`) |
| ROT-a (as rotinas automáticas do banco) | [ROT-a.md](ROT-a.md) | ORA-INV-005, ORA-ONLINE-006 (parte), ORA-QUAL-006 (parte) | aguardando (pedido em 17/11; no ar em `a2041b1`) |
| INTEG-c (as duas correções da revisão do Codex de 16/11: #101 e #102) | [INTEG-c.md](INTEG-c.md) | ORA-FISC-001, ORA-POS-008 e ORA-ONLINE-006 (as correções; o estado de cada um não muda) | aguardando (pedido em 17/11; no ar em `9012f7f`) |
| BANCO-a (a arrumação do banco que o Supabase aponta) | [BANCO-a.md](BANCO-a.md) | ORA-ORG-004 e ORA-QUAL-002 (coerência; o estado de cada um não muda) | aguardando (pedido em 17/11; no ar em `0bfad91`) |
| ENTREGAS-a (o botão Comprar e a tela de entregas do projeto) | [ENTREGAS-a.md](ENTREGAS-a.md) | ORA-ONLINE-001 (o botão Comprar, A01; o estado não muda) e a tela de entregas (A18, sem número próprio) | aguardando (pedido em 17/11; no ar em `69bfab6`) |
| WHATS-a (o programa que manda a nota pelo WhatsApp, desligado até a Meta) | [WHATS-a.md](WHATS-a.md) | ORA-WHATS-001 e ORA-WHATS-006 (o estado de cada um não muda: depende da Meta) | aguardando (pedido em 17/11; no ar em `69bfab6`) |
| SAUDE-a (o que é fila na Saúde da operação, e a página /saude lendo o banco) | [SAUDE-a.md](SAUDE-a.md) | ORA-QUAL-006 e ORA-FISC-008 (em parte; o estado de cada um não muda) | aguardando (pedido em 17/11; no ar em `7e1ff5f`) |
| GIT-a (a arrumação do GitHub: issues, atualizações e o que fica exposto) | [GIT-a.md](GIT-a.md) | ORA-QUAL-001, ORA-QUAL-004 e ORA-QUAL-014 (o estado de cada um não muda) | aguardando (pedido em 17/11; no ar em `3235772`) |
| ORG-a (as 11 lojas e o DEFEITOS no sistema, pelo cadastro operacional) | [ORG-a.md](ORG-a.md) | ORA-ORG-001 (em parte; o estado não muda) | aguardando (pedido em 17/11; no ar em `13fca19`) |
| PWA-a (o Ora 5G na tela inicial do celular) | [PWA-a.md](PWA-a.md) | ORA-QUAL-010 e ORA-POS-015 (em parte; o estado de cada um não muda) | aguardando (pedido em 17/11; no ar em `ccdf342`) |
| TRF-a (vários produtos na mesma transferência: a remessa) | [TRF-a.md](TRF-a.md) | ORA-INV-007 e a issue #60 (o estado não muda) | aguardando (pedido em 17/11; no ar em `e603531`) |
| REIN-a (o importador pronto para a planilha inteira da Rein) | [REIN-a.md](REIN-a.md) | ORA-CAT-002 e a issue #89 (o estado não muda) | aguardando (pedido em 17/11; no ar em `03123d0`) |
| MKT-a (de onde veio a reserva do site) | [MKT-a.md](MKT-a.md) | ORA-ONLINE-003 (passa a testado) e ORA-META-002 (passa a parcial) | a pedir depois da publicação |

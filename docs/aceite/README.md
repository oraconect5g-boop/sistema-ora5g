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
| MKT-a (de onde veio a reserva do site) | [MKT-a.md](MKT-a.md) | ORA-ONLINE-003 (passa a testado) e ORA-META-002 (passa a parcial) | aguardando (pedido em 17/11; no ar em `2e3fa24`) |
| DEP-a (a lista única do que depende de fora: o aceite A19) | [DEP-a.md](DEP-a.md) | nenhum (só documentação) | aguardando (pedido em 17/11; no ar em `569eab8`) |
| PWA-b (o aviso no celular para aprovar num toque) | [PWA-b.md](PWA-b.md) | ORA-REPORT-002 e ORA-QUAL-006 (o estado de cada um não muda) | **aceito em 17/11** (no ar em `252bcad`; o caminho pelo menu em `3c617c7`) |
| QUAL-a (o alerta no celular quando algo espera demais) | [QUAL-a.md](QUAL-a.md) | ORA-QUAL-006 (o estado não muda) | a pedir na lista final (no ar em `87c8dbe`) |
| EXT-a (o extrato da maquininha por arquivo) | [EXT-a.md](EXT-a.md) | ORA-PAY-009 (passa a testado), ORA-PAY-010 e ORA-FIN-006 (passam a parcial) | a pedir na lista final (no ar em `721e021`), com um extrato real da maquininha (E3) |
| META-a (quanto custou cada contato e cada venda dos anúncios) | [META-a.md](META-a.md) | ORA-META-003, ORA-META-004 e ORA-META-006 (passam a testado) e ORA-META-001 (passa a parcial) | a pedir na lista final (no ar em `475ad3e`), com um relatório real do Gerenciador de Anúncios |
| MKTPL-a (o lucro de cada pedido dos marketplaces) | [MKTPL-a.md](MKTPL-a.md) | ORA-MKTPL-005 e ORA-MKTPL-008 (passam a testado); ORA-MKTPL-003, ORA-MKTPL-004 e ORA-MKTPL-006 (passam a parcial); ORA-MKTPL-001, ORA-MKTPL-002 e ORA-MKTPL-007 (passam a bloqueado: os adaptadores esperam o contrato) | a pedir na lista final (no ar em `93f3a6d`), com um relatório real de um canal |
| CANAIS-a (os canais de venda lado a lado) | [CANAIS-a.md](CANAIS-a.md) | ORA-REPORT-008 (passa a testado) | a pedir na lista final (no ar em `47f2c4f`) |
| ADAPT-a (as integrações que esperam contrato) | [ADAPT-a.md](ADAPT-a.md) | ORA-PAY-013, ORA-PAY-014, ORA-META-005, ORA-ONLINE-007, ORA-ONLINE-008, ORA-FISC-007 e ORA-FISC-010 (passam a bloqueado, com o que falta) | a pedir na lista final (só leitura; no ar em `7c7bdf1`) |
| AUD-a (o que a auditoria do Codex de 17/11 pediu) | [AUD-a.md](AUD-a.md) | ORA-CAT-002 (o rodapé da planilha, achado F01), ORA-META-003, ORA-META-004 e ORA-META-006 (as devoluções, aceite A14); ORA-MKTPL-005 e ORA-MKTPL-008 voltam a parcial (aceite A13) | a pedir na lista final (no ar em `3135435`) |
| REIN-b (o estoque de cada loja pelo relatório da Rein) | [REIN-b.md](REIN-b.md) | ORA-INV-004 e ORA-CAT-002 (seguem parciais: falta a carga de verdade, com o arquivo no servidor e a conta de administrador) | a pedir na lista final (no ar em `c330d0d`; depende do arquivo e da J1) |
| DEMO-a (a demonstração com as lojas de verdade e os canais) | [DEMO-a.md](DEMO-a.md) | Nenhum muda de estado: o achado F06 da auditoria de 17/11 e o aceite A16 (a demonstração atualizada) | a pedir na lista final (no ar em `bdbd8b6`) |
| TRF-b (o que cada passo da transferência faz no estoque) | [TRF-b.md](TRF-b.md) | ORA-INV-007 (segue testado: só a tela muda; o achado F10 e a decisão D-049) | a pedir na lista final (no ar em `bdbd8b6`) |
| ONLINE-d (o carrinho e o pedido do site) | [ONLINE-d.md](ONLINE-d.md) | ORA-ONLINE-002 (passa a parcial: o carrinho e o pedido, sem o pagamento online) e ORA-ONLINE-006 (segue parcial) | a pedir na lista final (no ar em `cc50523`) |
| VEL-b (as telas com login com menos idas ao banco) | [VEL-b.md](VEL-b.md) | ORA-QUAL-010 e ORA-POS-002 (seguem parciais: falta o VEL-c e a medida com login) | a pedir na lista final (no ar em `27b4f6e`) |
| AUD-b (os dois defeitos da importação da reanálise de 18/11 e a tela de entregas) | [AUD-b.md](AUD-b.md) | ORA-CAT-002 e ORA-INV-004 (seguem parciais: falta a carga de verdade, com a planilha no servidor) | a pedir na lista final (no ar em `bf5eaf5`) |
| REIN-c (a diferença entre o físico e o disponível na carga do estoque) | [REIN-c.md](REIN-c.md) | ORA-INV-004 (segue parcial: falta a carga de verdade, com a planilha no servidor e a conta do administrador) | a pedir depois da publicação |

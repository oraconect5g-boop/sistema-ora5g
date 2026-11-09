# Fila de execução — núcleo para sair da Rein

**Atualizado em:** 08/11/2026 · **Por:** Claude Code · **Revisor:** Codex
**Origem:** [PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md](PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md) (PR #25), pedido do proprietário de 08/11 (inclui **cadastro de usuários e gestão da equipe**) e [auditoria do Codex de 08/11](../analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md).
**Regra:** cada linha vira branch e commits próprios; integração na `main` só depois da sequência do CI em instalação limpa; o Codex revisa. "Feito" = testado em desenvolvimento, **não** homologado.

| # | Requisitos / issue | Entrega | Depende de | Aceite (o que precisa ficar provado) | Branch / commit | Testes | Situação |
|---|---|---|---|---|---|---|---|
| 1 | ORA-INV-002, 003, 005, 006 · #19–#22 | Integridade do estoque por migration nova | — | Reproduções do Codex verdes; posição por item; chave com outro conteúdo recusada; item e livro juntos; duas conexões reais | `fix/ORA-integridade-estoque` · `d12993e` | `integridade-estoque.test.ts` (PGlite), `concorrencia.test.ts` (PostgreSQL 17, 11 disputas) | **Feito**, aplicado no `ora5g-dev`; aguarda Codex |
| 2 | ORA-CONNECT-001, 003, 011 · #23, #24 | Demonstração: eSIM e recarga LINK | — | Reproduções de tela verdes nos dois tamanhos | `1543b7b` | `connect.spec.ts` (REV-024, REV-025) | **Feito**; aguarda Codex |
| 3 | Bloco 3 do prompt | Lista de APIs e habilitações | — | Núcleo, expansão, posterior; nomes de variáveis; documentação oficial | `a80bc54` | — | **Feito** ([lista](../integracoes/APIS_E_HABILITACOES_NECESSARIAS.md)) |
| 4 | Auditoria §7.6 | `definir-chave.sh` aceita cifrão/aspas sem corromper | — | Valor gravado = valor lido pelo `@next/env` | `a80bc54` | `definir-chave.test.ts` (13 casos) | **Feito** |
| 5 | ORA-ORG-001 a 010 · #11 · pedido de 08/11 | **Acesso real + cadastro de usuários e gestão da equipe**: escolha da loja na sessão, sessão por turno, bloqueio/revogação imediatos, mudança de papel durante a sessão, cadastro com link de acesso, recuperação pelo gerente | `SUPABASE_SECRET_KEY` só para criar pessoas no Auth (o resto não depende) | Autorização no servidor e no banco; vendedor não gere equipe; gerente só a própria loja (conforme matriz); tudo auditado; link de acesso nunca registrado | `feature/ORA-006-acesso-equipe` · `d885b6d`, `bf3986b`, `58dec9c` | `acesso-equipe.test.ts` (20), reversões, regras (11), worker (4), E2E acesso real, publicação isolada (web sem chave) | **Feito** em desenvolvimento; convite real depende da secret key, SMTP e modelos; #11 depende de usuário real |
| 6 | Auditoria §7.1–7.2 | Tipos gerados do Supabase no app; dinheiro em centavos sem perda entre SQL e TypeScript | — | `bigint` lido como texto/BigInt; acima do inteiro seguro é recusado, nunca arredondado | tipos em `bf3986b`; centavos com o item 7 | `tipos-banco.test.ts` (tipos × migrations) | Tipos **feitos**; centavos a fazer |
| 7 | ORA-CAT-001/004/005/008, ORA-INV-001 · ORA-CAT-011 #26 | Catálogo e estoque reais nas telas; **fotos** (Storage privado, metadados, envio pela câmera, miniatura e ampliação, pendências) | Item 5 (sessão real) | DTO por papel (vendedor sem custo); foto por produto/variante visual; placeholder não conta | `feature/ORA-CAT-011-fotos` · `a5f7266`, `817c0cc`, `e89518f` | `fotos-produto.test.ts` (5) e reversão, regras de foto e centavos (4), E2E do acesso | Catálogo com fotos **feito**; tela real de estoque `/estoque` (saldo, IMEI/ICCID com histórico, rede, conferência do dia) **feita** na branch `feature/ORA-INV-tela-estoque`; fotos no PDV já estão no `/vender` |
| 8 | ORA-CAT-002, ORA-INV-004 | Importador da Rein em prévia, aprovação, lote idempotente, divergências, auditoria | **Arquivo da Rein** | Mesmo arquivo não duplica; erros por linha; saldo piloto conferido | `feature/ORA-009-importador-rein` | banco, unidade | Bloqueado pelo arquivo (contrato e esqueleto podem avançar) |
| 9 | ORA-POS-001 a 016 | **ADR-004** e venda real: rascunho → reserva → aprovação → pagamento → conclusão idempotente → comprovante → pedido de nota; cancelamento/devolução/estorno compensatórios | Itens 5 e 7; P14 (sem ela, desconto acima de zero exige aprovação) | Cenários A, B, C, D, H e I do bloco 12 | `feature/ORA-ADR-004-vendas` · `2ebdd52`, `56e2b73`, `67cbdb8`, `8cda8fb` | `vendas.test.ts` (13), concorrência real da conclusão, reversão, regras da tela (5), E2E de acesso | Venda real **feita** em desenvolvimento (banco e telas); prova com usuário real depende da secret key |
| 10 | ORA-PAY-001 a 014, ORA-FIN-001 a 004 | Caixa (abertura, suprimento, sangria, fechamento, diferença) e pagamentos: dinheiro, Pix, cartão/maquininha com confirmação manual rastreável, misto, financiamento PayJoy/Aiva (preço, entrada, a receber; juros fora), link | Item 9; P8 (prazo/taxa do repasse: sem inventar) | Cenários A, D, E, H | junto do item 9 (`8cda8fb`) | `vendas.test.ts` (caixa, financiamento, estorno) | Caixa e pagamentos em loja **feitos**; conciliação por extrato, repasses (P8) e link (provedor) a fazer |
| 11 | ORA-CONNECT-001 a 011 | Adaptador Nogle só no servidor; operações persistentes (chip, ativação, recarga, portabilidade) com estados, reconsulta e atribuição | P9 e credenciais só para chamadas reais | Cenário F com fixtures; nenhuma operação real sem linha de teste autorizada | `feature/ORA-CONNECT-adaptador` | unidade com fixtures, banco | A fazer |
| 12 | ORA-FISC-001 a 010 | Fila fiscal interna, aprovação que não atrasa prazo, contrato do emissor | Contador e emissor para emitir | Pedido auditável a partir da venda; nada emitido sem emissor homologado | `feature/ORA-FISC-fila` | banco, unidade | A fazer |
| 13 | Bloco 9 | Critérios observáveis de saída da Rein, fonte oficial por fase, go/no-go | Itens 7 a 12 | Documento com evidências por critério | `docs/go-no-go-piloto` | — | A fazer |
| 14 | Bloco 10 | Requisitos de OS no backlog (sem contar como feitos), CRM, transferências, metas, canais | Decisões P3, P5, P10 | Conforme cada requisito | por requisito | — | Depois do núcleo |

## Cenários do bloco 12 e onde serão provados

| Cenário | Onde |
|---|---|
| A. Venda à vista e mista, com foto, IMEI/ICCID, baixa, recebimento e comprovante | Itens 9 e 10 |
| B. Desconto autorizado/negado e tentativa de autoaprovação | Item 9 |
| C. Dois vendedores disputando o mesmo estoque | **Feito no banco** (item 1); repetir no fluxo de venda (item 9) |
| D. Reenvio de requisição e webhook duplicado/fora de ordem | Itens 9, 10 e 11 |
| E. Financiamento com entrada e repasse, sem juros da financeira | Item 10 |
| F. Chip vendido, ativação pendente/confirmada, recarga e portabilidade sem dupla produção | Item 11 |
| G. Rede/provedor indisponível, renovação da sessão e recuperação após falha | Itens 5 e 11 |
| H. Cancelamento/devolução/estorno e fechamento diário conciliável | Itens 9 e 10 |
| I. Acesso de outro papel, loja e organização | Itens 5, 7 e 9 (já provado no banco para acesso e estoque) |
| J. Restauração de backup e retorno de versão defeituosa | Retorno automático de versão já existe (REV-016); restauração de banco no item 13 |

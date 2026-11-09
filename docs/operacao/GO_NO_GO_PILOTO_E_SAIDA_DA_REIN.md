# Go/no-go da loja piloto e critérios para sair da Rein

**Data:** 08/11/2026 · **Autor:** Claude Code · **Revisor:** Codex · **Decide:** proprietário (com o contador no fiscal)
**Base:** bloco 9 do [prompt de execução prioritária](../alinhamento/PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md), DEC-U23 (Rein oficial durante o desenvolvimento e o piloto), roteiro ([07_ROADMAP.md](../07_ROADMAP.md) §go/no-go) e D-032.

**Regras que não mudam:** a Rein só é desligada, a produção só é ligada e a expansão só acontece com o **aceite do proprietário**, por escrito, com as evidências abaixo. O Claude não apaga histórico nem desativa a Rein por iniciativa própria. Nenhum critério é marcado como cumprido sem evidência verificável.

## 1. Um sistema oficial por assunto, em cada fase

O que é "oficial" conta para venda, estoque, caixa, comissão e fiscal. O outro sistema é **só comparação** e nunca entra em meta, comissão ou relatório oficial. Assim nenhuma venda conta duas vezes e nenhum estoque baixa duas vezes.

| Assunto | Fase 0 — agora (desenvolvimento e homologação) | Fase 1 — piloto em paralelo (2 a 4 semanas) | Fase 2 — Ora oficial na piloto (depois do go/no-go) | Fase 3 — ondas 3 → 7 → 14 lojas |
|---|---|---|---|---|
| Vendas e comissão | Rein | **Rein** (Ora em teste, lançamento duplo) | **Ora**; Rein só consulta | Ora nas lojas migradas; Rein nas demais |
| Estoque e IMEI | Rein | **Rein** (Ora conferida pelo relatório diário) | **Ora**; saldo inicial = inventário assinado | Por loja, na data da migração; sem transferência entre loja migrada e não migrada sem conciliação |
| Caixa | Rein | **Rein** (caixa da Ora fechado e comparado) | **Ora** | Por loja |
| Nota fiscal | Portal atual (manual) | Portal atual; a Ora registra a chave de acesso na fila (ADR-006) | Emissor homologado com o contador, ou portal + registro da chave até lá | Igual à Fase 2 |
| Ora Connect (chips, ativação, recarga, portabilidade) | ERP da Nogle | **ERP da Nogle**; a Ora só com linha/chip de teste autorizados pela Contel | **Ora**, só nos tipos homologados (os demais seguem no ERP da Nogle) | Igual à Fase 2 |

## 2. Critérios observáveis (o que precisa estar provado)

Legenda: ✅ provado em desenvolvimento · 🟡 feito no código, falta uso real · 🔒 bloqueado por acesso/decisão externa · 🔴 a fazer.

| # | Critério | Como se observa (evidência) | Situação hoje |
|---|---|---|---|
| 1 | Catálogo e estoque da piloto importados e conferidos | Lote do importador da Rein aprovado, sem erro por linha; inventário físico assinado; `privado.divergencias_estoque()` vazio no fim de cada dia | 🔒 arquivo da Rein (item 8 da fila) |
| 2 | Usuários, permissões e fotos completos | Equipe da piloto ativa com papéis certos (tela Equipe); fotos pendentes = 0 nos itens da piloto | 🟡 telas prontas; 🔒 chave secreta e SMTP para os convites |
| 3 | Vendas e pagamentos reconciliáveis | Relatório diário Rein × Ora (contagem e total por meio de pagamento, IMEIs vendidos) sem diferença sem explicação; amostra conferida pelo gerente | 🟡 PDV, pagamento misto e comprovante prontos (ADR-004); 🔴 relatório de comparação (depende do formato da Rein) |
| 4 | Caixa diário fechado e divergências tratadas | Todos os caixas do dia fechados e conferidos; diferença com explicação gravada | 🟡 (ADR-004) |
| 5 | Ora Connect homologada | Cada tipo liberado com a evidência da homologação (auditada); nenhum "resultado desconhecido" sem decisão há mais de 1 dia; produção do vendedor batendo com o relatório da Contel | 🔒 credenciais, P9 e linha de teste (ADR-005 pronto) |
| 6 | Obrigações fiscais atendidas | Toda venda concluída com pedido de nota; todo pedido emitido com chave do CNPJ da loja, dentro do prazo que o contador orientar; nenhum alerta de atraso aberto | 🟡 fila e registro pela chave (ADR-006); 🔒 contador e emissor |
| 7 | Cancelamentos e devoluções testados | Cancelamento com estorno, chip e venda protegidos por operação viva, nota emitida segurando o cancelamento: testes de banco | ✅ cancelamento total, devolução parcial e troca com vale (em desenvolvimento); 🔒 política de troca (D-026) |
| 8 | Zero duplicidade de IMEI, venda e pagamento | Disputas reais em PostgreSQL 17 (`concorrencia.test.ts`, 14 casos) | ✅ |
| 9 | Isolamento por papel, loja e organização | Testes de banco dos cenários I (acesso, estoque, venda, Connect, notas) | ✅ no banco; 🔒 E2E com usuário real (chave secreta) |
| 10 | Usuários reais completam o PDV no celular | Gravação ou acompanhamento de uma venda completa por vendedor da piloto; gerente aprovando desconto e nota | 🔒 chave secreta e usuários de teste |
| 11 | Backup e restauração comprovados | Ensaio de restauração do banco e das fotos em homologação, com o tempo gasto; volta de versão defeituosa | 🟡 volta de versão automática (REV-016); 🔴 ensaio de restauração (cenário J) |
| 12 | Contingência e suporte | Procedimento para internet ou sistema fora (sem venda "offline" no sistema, D-029), contatos e escalonamento | 🔴 a escrever com o proprietário |
| 13 | Monitoramento e responsáveis | Alerta de erro e de worker parado; quem atende em cada horário | 🔴 |

## 3. Relatório diário Rein × Ora (Fase 1)

Comparar por loja e dia, no fechamento: quantidade e total de vendas; total por meio de pagamento; IMEIs/ICCIDs vendidos (lista); entradas e saídas de estoque; fechamento de cada caixa. **Tolerância: zero diferença sem explicação.** O gerente da piloto assina o relatório do dia. O gerador depende do arquivo de exportação da Rein (o mesmo do item 8); sem ele, a comparação é manual por amostra.

## 4. Registro da decisão (modelo)

| Campo | Preencher |
|---|---|
| Loja e data | |
| Critérios 1 a 13 | ✅/🟡/🔒/🔴 com o link da evidência de cada um |
| Pendências aceitas | o que fica para depois, com dono e prazo |
| Plano de volta | até quando a Rein fica ativa para lançar de novo; quem decide voltar; como os lançamentos do período Ora são conciliados na volta |
| Assinaturas | proprietário; gerente da piloto; contador (critério 6) |
| Decisão | go / no-go |

## 5. Perguntas para o proprietário

1. **Duração do paralelo:** 2 a 4 semanas (padrão do plano). Confirma?
2. **Depois do go:** por quanto tempo a licença da Rein fica ativa para uma eventual volta (só consulta não basta para voltar)?
3. **Contingência:** se a internet da loja cair, a venda espera ou vai para um formulário em papel lançado depois pelo gerente?
4. **Quem atende** problemas no horário da loja durante o piloto?

# Backup e restauração (proposta)

**Data:** 14/11/2026 · **Autor:** Claude Code · **Revisor:** Codex · **Decide:** proprietário
**Requisito:** ORA-QUAL-005 (backups e ensaio de restauração de banco e anexos; aceite: RPO/RTO definidos com responsável e evidência). **Liga com:** critério 11 do [go/no-go da piloto](GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md), a decisão D-027 (infraestrutura de produção e orçamento) e o cenário E2E-030 (restaurar banco e anexos e reprocessar a fila).

> **Situação:** proposta para o proprietário decidir. Nada aqui contrata serviço nem muda o banco.

## 1. Palavras usadas

- **RPO** (quanto dado se aceita perder): o tempo entre o último backup e o problema. Backup diário = até 1 dia de vendas perdidas.
- **RTO** (quanto tempo fora do ar se aceita): do problema até o sistema voltar a vender.

## 2. Como está hoje (conferido em 14/11/2026)

| Item | Situação |
|---|---|
| Banco de desenvolvimento e homologação (`ora5g-dev`, São Paulo, PostgreSQL 17) | Plano **gratuito** do Supabase: **sem backup automático**. Só dados de teste; nenhum dado real |
| Esquema do banco | Reconstruível do zero: as migrations versionadas no Git sobem num banco vazio em cada teste (a mesma sequência aplicada no `ora5g-dev`, conferida pelo md5) |
| Arquivos (fotos, notas, anexos, OS) | No Storage do Supabase, buckets privados. **O backup do banco não inclui os arquivos**, só o registro deles |
| Código e versões | No GitHub; a homologação guarda as versões anteriores e volta de versão defeituosa sozinha (REV-016) |
| Banco e arquivos de produção | Não existem ainda (D-027) |

## 3. O que o Supabase oferece (documentação oficial, conferida em 14/11/2026)

- **Plano Pro e acima:** backup diário automático; o Pro guarda os últimos **7 dias** (o Team, 14; o Enterprise, até 30). A restauração deixa o projeto **fora do ar enquanto restaura** (quanto maior o banco, mais demora).
- **Recuperação a um ponto no tempo (PITR):** adicional dos planos pagos, que pede no mínimo o computador "Small"; na pior hipótese perde **2 minutos** de dados. Preço publicado: cerca de **US$ 100 por mês** para voltar até 7 dias (US$ 200 para 14 e US$ 400 para 28), além do plano.
- **Exemplo de conta da própria documentação** (um projeto, mês inteiro): plano Pro US$ 25, computador "Small" US$ 15, PITR de 7 dias US$ 100, menos US$ 10 de crédito de computação: **US$ 130 por mês** (confirmar os preços na contratação).
- **Plano gratuito:** a recomendação do próprio Supabase é exportar os dados por conta própria (`supabase db dump`) e guardar a cópia fora dele.
- **Arquivos do Storage:** ficam fora do backup do banco; restaurar um backup antigo não traz de volta arquivo apagado depois dele.

## 4. Proposta

| Fase | RPO proposto | RTO proposto | Como |
|---|---|---|---|
| **Piloto, Fase 1** (Rein oficial, Ora em teste) | 1 dia | 1 dia útil | Backup diário do plano Pro no projeto de produção; cópia semanal dos arquivos dos buckets para um armazenamento fora do Supabase |
| **Piloto, Fase 2** (Ora oficial na loja) | 5 minutos | 4 horas no horário da loja | PITR de 7 dias; cópia diária dos arquivos; durante a restauração, a loja segue o plano de contingência (D-041) |
| **Rede** (mais lojas) | 5 minutos | 2 horas | O mesmo da Fase 2, com o ensaio repetido a cada trimestre |

**Ensaio de restauração (cenário J):** antes da Fase 2 e depois a cada trimestre, restaurar o backup num projeto novo (cópia do projeto), medir o tempo, conferir as contagens (vendas, itens, caixa, estoque, notas e arquivos) contra o original e reprocessar a fila (E2E-030). O resultado entra no registro abaixo.

**Responsáveis (proposta):** o proprietário contrata e guarda os acessos; o Claude Code prepara e executa o ensaio num ambiente autorizado e registra a evidência; o Codex confere.

## 5. Registro dos ensaios

| Data | O que foi restaurado | Tempo | Conferência | Resultado |
|---|---|---|---|---|
| — | Nenhum ensaio ainda (não há produção) | — | — | — |

## 6. Decisões pendentes do proprietário

- **D-044 — RPO e RTO da piloto:** aceitar a proposta acima (1 dia na Fase 1; 5 minutos e 4 horas na Fase 2) ou definir outros valores.
- **D-027 (já aberta) — infraestrutura de produção e orçamento:** o plano do Supabase (o backup diário pede o Pro; o PITR é um adicional) e onde guardar a cópia dos arquivos.
- **Acesso para o ensaio:** a senha do banco do ambiente de ensaio, guardada no servidor (nunca no chat), para o `pg_dump` e a conferência.

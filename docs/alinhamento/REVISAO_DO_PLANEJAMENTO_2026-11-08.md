# Revisão do planejamento — 08/11/2026

**Por:** Claude Code · **Pedido do proprietário (08/11):** reler todo o planejamento, conferir as funções exigidas, listar o que depende dele e começar já o back-end, o front-end e as migrations.

## 1. O que foi relido

Pacote original (`docs/00` a `docs/13`, `backlog.json` com 172 requisitos), decisões de 06/11 (DEC-U18 a DEC-U49), ADR-001 e ADR-002, plano do mês 1 (`etapa-1`), os documentos do Codex (`ANALISE_SISTEMAS_2026-11-07.md`, sequência A–H de `CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md` §9, `AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md` §12) e a rastreabilidade.

## 2. Conclusão

- **Nenhuma função exigida se perdeu.** Os 172 requisitos continuam no backlog com o mesmo escopo e o mesmo prazo de 6 meses; a demonstração não substitui nenhum deles.
- **A sequência do Codex está mantida e avançou hoje:** B (fundação corrigida) concluída com #17 e #18; D (ADR-003 e catálogo) e F (estoque/IMEI) começaram no banco de desenvolvimento; C (login completo) é a próxima; E (Rein) espera o arquivo.
- **Lacunas encontradas na releitura** (nenhuma bloqueia o mês 1):

| # | Lacuna | Proposta |
|---|---|---|
| L1 | Assistência/OS não tem IDs no backlog (o Codex já tinha apontado) | **Feito em 09/11:** `ORA-OS-001` a `006` no backlog e em `01_REQUISITOS.md` (custódia, trânsito, orçamento, aprovação do cliente, avisos, entrega e peças), sem contar como feitos; a implementação espera a P5 |
| L2 | Política de desconto sem números (DEC-U27/U41) | Pendência P14; campos prontos e vazios nas categorias |
| L3 | Sincronia de estoque com a Rein durante o piloto paralelo (DEC-U23 × DEC-U24) | Pergunta Q1 do ADR-003; proposta: reimportação com "ajuste de conciliação" no livro |
| L4 | Prova de concorrência com duas conexões reais | Precisa da `DATABASE_URL` de desenvolvimento (pendência 4.1); as regras já estão provadas em sequência |
| L5 | Tipos do banco no aplicativo (Codex, auditoria §10) | Gerados pelo Supabase em 08/11; entram no repositório junto com a primeira tela real que os usa |

## 3. Situação por domínio depois de hoje

Números da rastreabilidade (`RASTREABILIDADE.md`): **2 testados, 27 parciais, 22 só em demonstração, 118 não iniciados** (eram 0, 19, 22 e 128 ontem).

| Domínio | O que mudou hoje | Próxima entrega |
|---|---|---|
| ORG (acesso) | Auditoria automática de vínculos, perfis, papéis e configurações (ORA-ORG-005 testado) | ORA-006: escolha da loja na sessão real, sessão por turno, bloqueio e recuperação de senha |
| CAT (catálogo) | Tabelas de categorias, marcas, produtos por tipo, variações (SKU), preços e custos com histórico | Tela real de produtos e o importador da Rein em prévia |
| INV (estoque) | Livro só de inserção (testado), saldo sem negativo, IMEI/ICCID únicos, reserva com trava, conferência | Tela real de estoque no celular (ORA-011); transferência entre lojas |
| POS, PAY, FIN | PDV da demonstração não passa do estoque (#18) | ADR-004 (venda, pagamentos e caixa) depois do catálogo real |
| CONNECT | Sem mudança (62 funções na demonstração) | Depende da P9 e das credenciais da Contel (e-mail pronto) |
| FISC | Sem mudança | Depende do contador (e-mail pronto) |
| QUAL | Controle das migrations igual ao Supabase (#17) com teste; semente testada | Prova de concorrência real; restauração de backup |

## 4. Caminho até a entrega do mês 1 (04/12)

**Meta do plano:** em homologação, um vendedor de teste entra pelo celular, escolhe a Santa Cândida e consulta o estoque importado da Rein; o dono confere a importação; as permissões entre lojas estão provadas.

| Passo | Situação | Depende de |
|---|---|---|
| Banco de acesso, RLS e auditoria | ✅ no desenvolvimento | — |
| Catálogo e estoque no banco | ✅ no desenvolvimento (ADR-003 proposto) | Aceite do ADR-003 (pendência 1.6) |
| Usuários de teste ligados às lojas | Script pronto e testado | Proprietário criar os usuários (1.1) |
| Login completo (ORA-006) | Próxima entrega | Usuários de teste; SMTP para a recuperação (5.1, 5.2) |
| Tela real de estoque no celular | Próxima entrega | — |
| Importador da Rein em prévia | Aguardando | Arquivo da Rein (1.3) |
| Endereço `hml-app.ora5g.com.br` | Aguardando | Subdomínio no WHM (5.4) |

Tudo o que depende do proprietário está em `docs/PENDENCIAS_DO_PROPRIETARIO.md`.

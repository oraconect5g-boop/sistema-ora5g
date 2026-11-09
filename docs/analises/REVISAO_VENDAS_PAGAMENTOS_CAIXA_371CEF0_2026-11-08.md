# Revisão independente: vendas, pagamentos e caixa reais

**Corte:** main `371cef0c02affad30f6fe2ebd1468cbcec67009f`, comparada à entrega de fotos `aebbdcc82b3f5de800d41200674fd6910a23c855`: seis commits e 25 caminhos. Data de referência: 08/11/2026, horário de São Paulo; execução atravessou 09/11 UTC. **Revisor:** Codex. **Programador responsável pelas correções:** Claude Code.

**Resultado:** houve avanço real do backend e do PDV, mas o núcleo ainda não está liberado para substituir a Rein no piloto. Nove novos achados reproduzidos: sete bloqueantes de permissão, dinheiro ou estoque e dois de validação/disponibilidade. Stack preservada: TypeScript, React, Next.js, Tailwind, Node.js, PostgreSQL e Supabase.

## 1. O que mudou e deve ser preservado

| Área | Implementação conferida |
|---|---|
| Banco | Oito tabelas novas: caixas, movimentos de caixa, vendas, itens, custos dos itens, aprovações, pagamentos e contas a receber; RLS e auditoria |
| Escrita | RPCs transacionais para abrir/movimentar/fechar/conferir caixa; criar/editar/concluir/cancelar venda; pedir/decidir aprovação |
| Estoque | Reserva na inclusão do item, consumo e baixa na conclusão, validação de preço vigente, reserva expirada e disputa por IMEI |
| Preço/desconto | Snapshot de preço/custo; custo em tabela separada por RLS; limite no servidor; conteúdo e prazo da aprovação; proibição de autoaprovação |
| Pagamentos | Dinheiro e troco, meios mistos, confirmação manual por comprovante, entrada financiada e restante a receber; link bloqueado até provedor |
| Frontend | Rotas reais `/vender`, `/caixa`, `/aprovacoes` e `/vendas/[id]`, com sessão/loja, Server Actions e proteção SSR; fotos na busca do PDV |
| Tipos/testes | Tipos Supabase regenerados, regras de formulário, testes do banco, teste de conclusão simultânea e reversão local |

Acertos efetivamente verificados: controle de venda em dinheiro reteve o valor certo, devolveu só o troco e baixou o IMEI; financiamento com entrada Pix documentada preservou entrada e conta a receber corretas. A suíte existente também testa preço alterado, reserva vencida, custo oculto, negação de autoaprovação e idempotência de conclusão. São bases úteis para corrigir os defeitos, sem trocar a arquitetura.

## 2. Evidências e alcance dos testes

- **Main fixada:** 428 testes existentes passaram, quatro TODO: plataforma 119, worker 4, banco 170, configuração 53 e domínio 82. Esses testes não incluem os casos vermelhos desta auditoria.
- **Qualidade da branch de revisão:** lint e typecheck locais passaram após reaplicar os testes permanentes anteriores; rastreabilidade regenerada e conferida. Scanner de segredos e validação do grupo `aplicacao` do `.env.example` passaram. Isso não verifica valores de ambientes privados nem habilita serviços externos.
- **Testes adicionais desta rodada:** 20 casos distintos: três controles passaram e 17 falharam, agrupados em nove causas. Banco em memória: 15 casos (2/13); ações reais com sessão/RPC/redirect simulados: quatro (1/3); PostgreSQL 17 com duas conexões: um (0/1). Reexecuções não são cobertura nova.
- **Evidências reproduzíveis:** [instruções e fontes](evidencias/2026-11-08-vendas/LEIA-ME.md), com [resultados resumidos](evidencias/2026-11-08-vendas/resultados.txt). Os testes vermelhos ficam fora da suíte normal, até a correção correspondente.
- **CI main:** [42536999441](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42536999441), sucesso.
- **CI PR #33 anterior:** [42537301660](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42537301660), sucesso. O run informa head `d484b882`, mas o log de checkout mostra o merge temporário **`eab4143e3d9a71c6377f5f2ed6d8cc01a2b4941e`**, de `d484b882` com **`371cef0`**. Portanto já incluiu estas vendas: 429 testes passaram (+4 TODO), 176 E2E passaram e dez foram pulados. A diferença de um teste unitário vem da propriedade de desconto adicionada na revisão anterior. Não atribuir esse resultado somente ao lote de fotos nem confundir CI com homologação.

Não houve login de cliente real, compra, cobrança, estorno bancário, emissão fiscal, ativação Nogle, deploy, migração remota ou acesso ao servidor/.env pelo Codex. Os E2E pulados e a inexistência de usuários no desenvolvimento limitam a conclusão sobre os fluxos autenticados reais.

## 3. Defeitos reproduzidos e correção solicitada

| Achado | Gravidade | Fonte na base fixada | Prova / impacto | Aceite para o Claude |
|---|---|---|---|---|
| REV-043 / [#45](https://github.com/oraconect5g-boop/sistema-ora5g/issues/45) | P1, bloqueante de acesso | migration de vendas:279 | SELECT de aprovação própria retorna uma linha depois de bloquear a pessoa ou revogar a sessão. Ramo `solicitado_por = auth.uid()` não exige acesso vigente | Revogação, turno, vínculo e perfil ativos também no ramo do solicitante; controles positivos e negativos pelo RLS |
| REV-044 / [#46](https://github.com/oraconect5g-boop/sistema-ora5g/issues/46) | P1, bloqueante de pagamento | migration:913–927 | Quatro meios de entrada Pix/cartão em financiamento concluem sem comprovante | Validar comprovante do meio efetivo da entrada no banco; erro sem baixa, recebimento ou conta criada |
| REV-045 / [#47](https://github.com/oraconect5g-boop/sistema-ora5g/issues/47) | P1, bloqueante de caixa | migration:1056–1062 | Entrada Aiva em dinheiro de R$ 200,00 é estornada no caixa do dono com fundo zero: saldo **−R$ 200,00** | Conferir saldo e serializar toda saída em dinheiro, inclusive entrada; insuficiência reverte toda a operação |
| REV-046 / [#48](https://github.com/oraconect5g-boop/sistema-ora5g/issues/48) | P1, bloqueante de financiamento | migration:923–943 | Preço 149900, Aiva 150000 e entrada 20000: banco conclui com troco 100 e crédito 130000; domínio rejeita | Cumprir DEC-U38; alinhar banco/domínio sem usar crédito excedente como troco ao cliente |
| REV-047 / [#49](https://github.com/oraconect5g-boop/sistema-ora5g/issues/49) | P1, bloqueante de estorno | migration:1053–1062 | Retido 19900 depois do troco; cancelamento devolve 20000. Caso depende da entrada excedente aceita no achado anterior | Estornar recebido líquido; alocar troco e limitar devolução ao efetivamente retido, inclusive em múltiplos meios |
| REV-048 / [#50](https://github.com/oraconect5g-boop/sistema-ora5g/issues/50) | P1, bloqueante de conciliação | migration:1073–1079; comprovante:90 | Pix e cartão viram `estornado` com data sem prova de devolução externa | Separar solicitado/pendente/confirmado e somente confirmar devolução com evidência auditada |
| REV-049 / [#51](https://github.com/oraconect5g-boop/sistema-ora5g/issues/51) | P1, bloqueante de estoque | migration:1047–1052; comprovante:87 | Cancelamento comercial sozinho torna aparelho e chip disponíveis no estoque, sem confirmação física/condição | Separar cancelamento, recebimento físico, triagem e telecom; chip usado não vira virgem |
| REV-050 / [#52](https://github.com/oraconect5g-boop/sistema-ora5g/issues/52) | P2, importante | `vender/acoes.ts`:26 e :64 | `abc`/`-1` no fundo e `abc` no desconto chegam à RPC como zero | Rejeitar inválido, distinguir vazio de zero intencional e preservar estado anterior |
| REV-051 / [#53](https://github.com/oraconect5g-boop/sistema-ora5g/issues/53) | P2, importante | migration:692–702 e :765–788 | Duas conexões confirmaram inversão venda→aprovação versus aprovação→venda, com **40P01** em uma ação | Mesma ordem de travas em editar/remover/pedir/decidir/concluir/cancelar; regressão concorrente |

“Migration” na tabela = `packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql`; “comprovante” = `apps/plataforma/src/app/vendas/[id]/page.tsx`. Linhas referem-se exclusivamente ao SHA fixado.

O deadlock foi reproduzido com locks preparatórios no banco descartável, representando pausas após o primeiro `FOR UPDATE` das RPCs; em seguida as funções reais foram executadas como vendedor/dono. Isso prova a ordem incompatível; não mede frequência em produção nem prova corrupção. O PostgreSQL abortou uma transação.

O teste de retorno do chip não fez ativação externa. Provou retorno ao estoque sem conferência; o risco de reutilizar chip já ativado decorre da ausência de separação física/telecom, não de uma ativação real realizada pelo teste.

## 4. Supabase e migrations — consulta somente de leitura

- Desenvolvimento: **30 tabelas públicas, todas com RLS**, 11 migrations. **Zero usuários Auth, sessões, vendas e caixas.** RLS habilitado não implica policy correta: REV-043 é um exemplo concreto.
- MD5 do SQL remoto e do arquivo Git conferem: `20261108233546` = `6284f6340341eb65a0be6430d5e9a706`; `20261108233711` = `3b67ed6d41fced7092b8ab013ea5c17f`.
- Advisor de segurança agrupa **29 RPCs SECURITY DEFINER executáveis por autenticados**. São interfaces intencionais, que exigem guards internos; não são automaticamente 29 vulnerabilidades. Os defeitos comprovados acima têm prioridade sobre contagem bruta do advisor.
- Performance: **74 índices sem uso** no ambiente vazio. Não remover índices com base nisso. O índice de fotos em ordem inversa já atendia as duas igualdades no EXPLAIN anterior; a migration nova adiciona outro. Avaliar redundância por plano, tamanho e uso; não reescrever migration aplicada nem apagar índice automaticamente.

Não foram publicados identificadores de infraestrutura, chaves ou registros pessoais nesta análise.

## 5. Aderência ao plano e lacunas restantes

O lote entrega persistência real de vendas e caixa, mas não conclui a prioridade total do proprietário. Continuam necessários:

1. **Integridade e acesso:** corrigir os bloqueantes #27–#29 da revisão anterior e #45–#51 desta rodada; tratar autoridade de convites #30, validação #52 e concorrência #53. Verificar também #34 nas chaves/repetições das RPCs.
2. **Estorno e devolução:** alinhar ADR-004 ao adendo existente. Cancelamento comercial, recebimento físico, condição do item, estorno bancário, fiscal e telecom são fatos separados. Não liberar aparelho/chip automaticamente.
3. **PDV/caixa no fluxo real:** corrigir os casos adversariais, manter testes positivos, testar login/renovação (#11), erros, repetição, duas pessoas e celular com usuário de teste autorizado. Histórico/retomada de vendas e comprovantes precisam ter navegação adequada; hoje o PDV escolhe só o rascunho mais recente e o comprovante fica em URL por ID.
4. **Fotos obrigatórias:** a busca do PDV passou a exibir fotos; ainda concluir as correções #40–#43, os pontos previstos de estoque/identificação e a homologação de câmera/galeria. #26 permanece aberta. Foto pendente não pode ser esquecida na importação.
5. **Ora Connect oficial:** ligar venda, chip/ICCID, ativação, portabilidade, recarga e recorrência às operações documentadas da Nogle/Contel, com idempotência, retorno verificável, reconciliação, loja/vendedor e repasse. A venda local de um serviço não comprova ativação nem receita/comissão oficial. Recarga: valor de face separado da receita; desempenho só após confirmação do provedor. Preservar [matriz de registro oficial](../alinhamento/NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md).
6. **Pagamentos externos e conciliação:** link continua bloqueado, corretamente; habilitar somente por contrato. Registrar terminal e comprovantes; conciliar Pix, cartão e financiamento com extratos/repasse; prazo/taxa P8 sem números inventados. Comissão por evento não foi entregue neste lote.
7. **Piloto e substituição da Rein:** importar e reconciliar CSV de produtos, preços, fotos pendentes, estoque e IMEI; homologar uma loja com operação paralela, reconciliação de caixa/estoque e retorno seguro. Depois avançar às 14 lojas e restante do backlog por dependências. CI verde sozinho não autoriza essa transição.

Diferença a resolver sem inventar regra: a demonstração anuncia “abaixo do custo: só o dono aprova”; o ADR-004 e a RPC real permitem gerente/dono com `desconto.aprovar`, exibindo só um alerta. Não foi localizada decisão explícita impondo exclusividade ao dono no material normativo desta rodada. Registrar a divergência na política P14 e alinhar demonstração, regra e aceite; não tratar a preferência visual como autorização nova nem classificar a permissão do gerente como falha já decidida pelo proprietário.

Os status de POS-006/007 e PAY-004 deixam de “testado” e voltam a “parcial” pelos defeitos reproduzidos; notas de POS-001/005/010/013, PAY-001/002/007 e ORG-004/006 ficam qualificadas. O resultado não certifica as 173 funções/requisitos: inventário total **173**, piloto **71**, e nenhum requisito homologado pelo proprietário. A rastreabilidade gerada discrimina cada status.

Contagem após incorporar as notas de revisão (não equivale a funções prontas em produção):

| Recorte | Homologados | Testados em desenvolvimento | Parciais | Demonstração | Restrição respeitada | Bloqueados | Não iniciados |
|---|---|---|---|---|---|---|---|
| Total (173) | 0 | 6 | 38 | 20 | 1 | 2 | 106 |
| Piloto (71) | 0 | 6 | 34 | 10 | 1 | 2 | 18 |

## 6. Arquivos novos/alterados examinados neste corte

A lista completa de 25 caminhos consta abaixo. Os tipos gerados foram conferidos contra o contrato do schema; isso não substitui validar cada comportamento de runtime.

- `apps/plataforma/e2e/acesso-real.spec.ts`
- `apps/plataforma/src/app/aprovacoes/page.tsx`
- `apps/plataforma/src/app/caixa/acoes.ts`
- `apps/plataforma/src/app/caixa/page.tsx`
- `apps/plataforma/src/app/inicio/page.tsx`
- `apps/plataforma/src/app/vendas/[id]/page.tsx`
- `apps/plataforma/src/app/vender/acoes.ts`
- `apps/plataforma/src/app/vender/page.tsx`
- `apps/plataforma/src/lib/supabase/tipos-banco.ts`
- `apps/plataforma/src/lib/vendas/regras.test.ts`
- `apps/plataforma/src/lib/vendas/regras.ts`
- `apps/plataforma/src/proxy.ts`
- `docs/ESTADO_ATUAL_E_PASSAGEM.md`
- `docs/adr/ADR-004-vendas-pagamentos-e-caixa.md`
- `docs/alinhamento/FILA_DE_EXECUCAO.md`
- `docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md`
- `docs/alinhamento/RASTREABILIDADE.md`
- `docs/alinhamento/status-requisitos.json`
- `packages/banco/src/concorrencia.test.ts`
- `packages/banco/src/vendas.test.ts`
- `packages/banco/supabase/aplicadas-dev.json`
- `packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql`
- `packages/banco/supabase/migrations/20261108233711_indices_vendas_e_fotos.sql`
- `packages/banco/supabase/reversao/20261108233546_vendas_pagamentos_e_caixa.sql`
- `packages/banco/supabase/reversao/20261108233711_indices_vendas_e_fotos.sql`

# Issues e PRs abertas: a situação de cada uma (17/11/2026, lote GIT-a, Onda 0.7)

O plano do proprietário de 16/11 pede, na Onda 0.7:

1. a tabela issue → commit → teste → situação das issues abertas, fechando as comprovadas e deixando abertas só as reais;
2. a decisão sobre o Dependabot;
3. o registro do que foi aproveitado de cada PR de documentação, com a proposta de fechá-las;
4. a lista do que o repositório público expõe.

Fechar no GitHub as issues comprovadamente corrigidas, citando o commit e o teste, está autorizado desde 16/11.

## Como foi conferido

- **As issues abertas:** lidas pelo conector do GitHub em 17/11. Eram 62.
- **A correção de cada uma:** cruzada com:
  - a matriz da reconciliação de 09/11 ([`RECONCILIACAO_CODEX_2026-11-09.md`](RECONCILIACAO_CODEX_2026-11-09.md)), que traz, para cada achado do Codex, a prova antes e depois e o teste permanente;
  - os quadros dos lotes em [`EXECUCAO_INTEGRAL_STATUS.md`](EXECUCAO_INTEGRAL_STATUS.md) (B1 a B5, R1, R2, K1, INTEG-a, INTEG-b e INTEG-c);
  - o histórico da `main`, para achar o merge de cada correção.
- **Os testes:** cada um citado abaixo existe na `main` e roda em todo CI. O último CI completo verde, de instalação limpa no servidor, foi o do SAUDE-a, em 17/11.
- **"Comprovada":** o defeito foi reproduzido antes, pela prova do Codex ou por um teste, e a mesma prova passa depois da correção. O teste permanente impede a volta.

## 1. Corrigidas e comprovadas (48): a fechar no GitHub

- **Como fecham:** cada uma fecha com um comentário que cita o merge da correção e o teste.
- **Por que ainda estão abertas:** em 17/11 o conector do GitHub não tinha a permissão de comentar nas issues ("Resource not accessible by integration"). O proprietário vai liberar.
- **Até lá:** elas seguem abertas no GitHub, mas não são pendência de código.

| Issue | O defeito | Correção (merge na `main`) | Teste permanente |
|---|---|---|---|
| #27 (REV-026) | Bloqueio de pessoa atingia rede fora da autoridade de quem bloqueia | `b967870` (lote 1 de 09/11) | `packages/banco/src/correcoes-acesso.test.ts` |
| #28 (REV-027) | Convite permitia conceder acesso a si mesmo | `b967870` | `packages/banco/src/correcoes-acesso.test.ts`; `apps/worker/src/identidade.test.ts` |
| #29 (REV-028) | Duas revogações ao mesmo tempo deixavam a rede sem dono | `b967870` | `packages/banco/src/concorrencia.test.ts` (duas conexões, PostgreSQL 17) |
| #30 (REV-029) | Worker concluía convite de quem perdeu a autoridade | `b967870` | `packages/banco/src/correcoes-acesso.test.ts`; `apps/worker/src/identidade.test.ts` |
| #45 (REV-043) | Aprovação própria legível depois de bloqueio ou sessão revogada | `b967870` | `packages/banco/src/correcoes-acesso.test.ts` |
| #55 (REV-052) | Publicação entregava as chaves da Nogle ao processo web | `b967870` | `packages/config/src/ambiente-web.test.ts` |
| #56 (REV-053) | Vendedor sem `custo.ver` lia o débito da carteira Nogle | `b967870` | `packages/banco/src/correcoes-acesso.test.ts` |
| #34 (REV-032) | Repetição com a mesma chave aceitava conteúdo diferente | `c071968` (lote 2 de 09/11) | `packages/banco/src/integridade-lote2.test.ts` |
| #35 (REV-033) | Dois chips com o mesmo ICCID na venda | `c071968` | `packages/dominio/src/venda.test.ts` |
| #46 (REV-044) | Entrada Pix ou cartão de financeira sem comprovante | `c071968` | `packages/banco/src/integridade-lote2.test.ts`; `apps/plataforma/src/lib/vendas/regras.test.ts` |
| #47 (REV-045) | Estorno da entrada deixava o caixa negativo | `c071968` | `packages/banco/src/integridade-lote2.test.ts` |
| #48 (REV-046) | Banco aceitava financiamento acima do preço | `c071968` | `packages/banco/src/integridade-lote2.test.ts` |
| #49 (REV-047) | Cancelamento devolvia a entrada inteira depois do troco | `c071968` | `packages/banco/src/integridade-lote2.test.ts` |
| #50 (REV-048) | Pix e cartão marcados como estornados antes da devolução externa | `c071968` | `packages/banco/src/integridade-lote2.test.ts`; `packages/banco/src/devolucao.test.ts` |
| #51 (REV-049) | Cancelar devolvia aparelho e chip ao estoque sem conferência | `c071968` | `packages/banco/src/integridade-lote2.test.ts`; `packages/banco/src/vendas.test.ts` |
| #52 (REV-050) | Valor inválido virava zero na abertura do caixa e no desconto | `c071968` | `apps/plataforma/src/app/vender/valores-invalidos.test.ts` |
| #53 (REV-051) | Travamento entre editar o desconto e aprová-lo | `c071968` | `packages/banco/src/concorrencia.test.ts` |
| #57 (REV-054) | LINK aceitava serviço já pago no caixa | `c071968` | `packages/banco/src/connect-lote2.test.ts`; `apps/plataforma/src/lib/connect/regras.test.ts` |
| #58 (REV-055) | Idempotência da ativação ignorava a troca do cliente | `c071968` | `packages/banco/src/connect-lote2.test.ts` |
| #59 (REV-056) | Uma recarga confirmava duas operações | `c071968` | `packages/banco/src/connect-lote2.test.ts`; `packages/dominio/src/nogle.test.ts` |
| #38 (REV-036) | Planilha CSV exportava fórmula | `596b046` (lote 3 de 09/11) | `apps/plataforma/src/componentes/ExportarCsv.test.ts` |
| #40 (REV-038) | Busca do catálogo só nos primeiros 200 produtos | `596b046` | `apps/plataforma/src/app/catalogo/busca.test.ts` |
| #42 (REV-040) | Repetir o envio da foto duplicava o arquivo e o registro | `596b046` | `packages/banco/src/fotos-lote3.test.ts` |
| #31 (REV-030) | Demonstração somava o valor de face da recarga à receita | `11e4e48` (lote 4 de 09/11) | `apps/plataforma/src/demo/revisao-demo-lote4.test.ts` |
| #32 (REV-031) | Demonstração: "só confirmadas" contava ativação pendente | `11e4e48` | `apps/plataforma/src/demo/revisao-demo-lote4.test.ts` |
| #36 (REV-034) | Demonstração: quem pediu via o próprio pedido na fila | `11e4e48` | `apps/plataforma/src/demo/revisao-demo-lote4.test.ts` |
| #37 (REV-035) | Relatório de 30 dias comparado com um dia | `11e4e48` | `apps/plataforma/src/app/demo/relatorios/comparacao.test.ts` |
| #39 (REV-037) | Carteira da demonstração ficava negativa | `11e4e48` | `apps/plataforma/e2e/carteira-demo.spec.ts` |
| #62 | Homologação não acompanhava a `main` (`/vendas` e `/auditoria` em 404) | `84ecefe` (publicação sem apagar versões) e `11c534f` (#99) | `packages/config/src/conferir-publicacao.test.ts`. Em 17/11, pelo domínio, `/vendas` e `/operacao` respondem 307 para a entrada, e a versão no ar é a da `main`. |
| #65 | Financeiro real, a primeira entrega (os gráficos sobre dados reais) | `0b6b45e` e `38fc068`, ampliados em G1 a G6 e L8 | `packages/banco/src/financeiro-painel.test.ts`; `apps/plataforma/src/app/financeiro/financeiro.test.ts`; `apps/plataforma/src/lib/financeiro/painel.test.ts` |
| #69 (REV-NOV-001) | Vendedor lia o custo pelas tabelas do recebimento | `8af4b34` (R1) | `packages/banco/src/entrada-estoque.test.ts` |
| #71 (REV-NOV-004) | Estorno de IMEI deixava a loja sem reentrada | `8af4b34` | `packages/banco/src/entrada-estoque.test.ts`; `apps/plataforma/src/lib/estoque/entrada.test.ts` |
| #72 (REV-NOV-005) | Recebimento criava estoque de produto inativo | `8af4b34` | `packages/banco/src/entrada-estoque.test.ts` |
| #70 (REV-NOV-002) | Aprovação da importação usava a prévia antiga | `b352573` (R2) | `packages/banco/src/importacao.test.ts`; `packages/banco/src/concorrencia.test.ts` |
| #73 (REV-NOV-006) | Categoria duplicada por maiúsculas, com cadastro e importação ao mesmo tempo | `b352573` | `packages/banco/src/importacao.test.ts`; `packages/banco/src/concorrencia.test.ts` |
| #74 (REV-NOV-007) | Desfazer a importação revertia preço manual posterior | `b352573` | `packages/banco/src/importacao-correcoes.test.ts` |
| #75 (REV-NOV-008/009) | Conferência da importação e histórico das entradas além do limite da tela | `8af4b34` e `b352573` | `packages/banco/src/importacao.test.ts`; `apps/plataforma/src/app/estoque/entrada/entrada.test.ts` |
| #78 (REV-DIR-001) | Quem contou aprovava o próprio ajuste do inventário | `8b66ba1` (B1) | `packages/banco/src/inventario.test.ts` |
| #79 (REV-DIR-002) | IMEI e IMEI2 do mesmo aparelho contavam duas vezes | `8b66ba1` | `packages/banco/src/inventario.test.ts` |
| #80 (REV-DIR-003) | Conferência do dia dizia "tudo conferido" ao cortar em 500 | `696f352` (B2) | `apps/plataforma/src/app/estoque/conferencia.test.ts` |
| #82 (REV-PLAN-001) | Previsão descontava estorno pendente como já pago | `0c6ffd9` (B3) | `packages/banco/src/previsao-de-caixa.test.ts`; `apps/plataforma/src/app/previsao/previsao.test.ts` |
| #83 (REV-PLAN-002) | Desfazer o repasse de venda cancelada reabria o crédito | `452f4a0` (B4) | `packages/banco/src/financeiras-a-receber.test.ts`; `packages/banco/src/concorrencia.test.ts` |
| #87 | Corrigir o pedido de nota apagava o destinatário | `11c534f` (INTEG-a) | `packages/banco/src/destinatario-fiscal.test.ts` |
| #88 | Trocar o cliente da venda redirecionava o PDF fiscal anterior | `11c534f` | `packages/banco/src/destinatario-fiscal.test.ts`; `packages/banco/src/whatsapp-nota.test.ts` |
| #96 | O sino mostrava alertas do usuário anterior na mesma aba | `11c534f` e `89927dc` | `apps/plataforma/src/lib/inicio/sino.test.ts` |
| #99 | Verificador dizia "publicado" com o serviço antigo ou fora do ar | `11c534f` | `packages/config/src/conferir-publicacao.test.ts`; `apps/plataforma/src/lib/versao-no-ar.test.ts` |
| #95 | Importar 2.000 linhas passava do limite de 8 s | `376f0ff` (INTEG-b) | `packages/banco/src/concorrencia.test.ts` ("2.000 linhas cabem, cada chamada, em 8 s", PostgreSQL 17) |
| #98 | Limpeza das fotos apagava o arquivo de uma foto em registro | `376f0ff` | `packages/banco/src/fotos-concorrencia.test.ts`; `packages/banco/src/limpeza-das-fotos.test.ts` |

## 2. Corrigida neste lote

| Issue | O defeito | Correção | Prova |
|---|---|---|---|
| #44 (REV-042) | Aviso moderado de segurança em dependência só de desenvolvimento (`minimatch`, pelo `typescript-eslint`) | Neste lote: o `typescript-eslint` passa a 8.73.0, que pede o `minimatch` 11, sem aviso. Só muda o `package-lock.json`. | `npm audit` com as dependências de desenvolvimento: 0 avisos (eram 7). Fecha depois do merge. |

## 3. Ficam abertas: o que falta em cada uma

| Issue | Situação | O que falta |
|---|---|---|
| #101 e #102 | Corrigidas em `9012f7f` (INTEG-c), com testes | O aceite do proprietário (roteiro `docs/aceite/INTEG-c.md`). Fecham com ele. |
| #41 (REV-039) e #43 (REV-041) | Corrigidas no código em `596b046` e provadas pela fixture do Codex em 09/11 | Um teste permanente: a suíte não tem teste de componente com navegador para o catálogo. Entram na jornada das fotos da Onda 1 (#26). |
| #11 (REV-009) | Renovação dos cookies da sessão; o código está pronto | Um usuário de teste de verdade para provar (J1: a `SUPABASE_SECRET_KEY` no servidor). |
| #63 e #84 | Primeiro acesso e jornadas autenticadas no ambiente publicado | As contas de teste (J1). |
| #26 (CAT-011) | Fotos: envio individual e em lote, pendências e catálogo prontos | O envio com arquivo real e a miniatura na busca, no estoque e no PDV (Onda 1). |
| #60 | Pedido interno e DEFEITOS prontos | A transferência de vários produtos na mesma operação e o cadastro das 11 lojas e de DEFEITOS (Onda 1). |
| #89 | Base real | As lojas e o estoque reais: a planilha da Rein no servidor e os dados das lojas (Onda 1). |
| #76 | O cadastro rápido, o destinatário da nota e a fila do envio prontos (K1a a K1c) | A entrega pelo WhatsApp oficial, que depende da Meta (F1). |
| #54 | Três operações da Nogle no adaptador | Cobrança, carteira, recorrência e repasse sem contrato confirmado (Onda 3). |
| #90 | Planejamento de crédito (PayJoy, Aiva, QI Tech e J7) | Os contratos e as credenciais (Onda 3). |

## 4. Dependabot

| PR | O que é | Decisão |
|---|---|---|
| #103 | 8 atualizações pequenas: `next` e `@next/env` 16.4.6, `eslint-config-next` 16.4.6, `lucide-react` 1.73.0, `@playwright/test` 1.65.1, `postcss` 8.5.33, `@electric-sql/pglite` 0.5.16 e `supabase` 3.1.0 | Entra por merge neste lote, depois do CI completo, junto com a correção do #44. Substitui a #91 do plano. |
| #92 | `@types/node` 26 | Recusada: o servidor e o CI usam o Node 22, e os tipos têm de acompanhar a versão do Node que roda o código. Fecha com o comentário, junto com as issues. |
| #93 | TypeScript 7 | Fica aberta: versão maior, para avaliar em branch própria, sem pressa. |
| #94 | ESLint 10 | Fica aberta, pelo mesmo motivo. |

## 5. PRs de documentação: o que foi aproveitado

Nenhuma entra por merge: cada uma foi lida pelo Git, e o que valia virou código, teste ou documento na `main`. A proposta é o proprietário fechá-las; elas continuam no GitHub como registro.

| PR | Conteúdo | O que foi aproveitado |
|---|---|---|
| #33 | Revisão da Nogle e dos merges: 11 lojas, transferências e perguntas da API | As 11 lojas e DEFEITOS (decisão de 09/11), o ADR-007 das transferências e as perguntas da API da Nogle (referência §3.1) |
| #66 | Prompt do financeiro real | O financeiro lote 1 (#65) |
| #67 | Prompt da execução integral dos 179 requisitos | A fila integral e os lotes de 10 a 13/11 (`base.pacote` do checkpoint) |
| #68 | Revisão dos lotes com defeitos reproduzidos | As issues #69 a #75, corrigidas em R1 e R2 |
| #77 | Cadastro rápido com WhatsApp e envio da nota | Os lotes K1a, K1b e K1c (#76) |
| #81 | Auditoria dos 147 diretórios e três defeitos reproduzidos | As issues #78 a #80, corrigidas em B1 e B2 |
| #85 | Relatório dos 179, defeitos e configurações | A numeração de R1/R2, o J1 e as pendências de configuração |
| #86 | Prompt para corrigir os defeitos e concluir os 179 a partir do L9b | A prioridade de 14/11: B1 a B5, J1, K1 e a fila integral (`base.pacote_conclusao`) |
| #97 | Revisão dos 179 e publicação por etapa | A conferência da publicação pelo domínio (#99) e o relatório dos 179 de 16/11 |
| #100 | Diagnóstico integral, os 179 requisitos e o adendo da loja, dos canais e da publicação | O INTEG-c (#101 e #102), o ENTREGAS-a (A01 e A18) e o resumo do plano de 16/11 ([`LEITURA_DIAGNOSTICO_INTEGRAL_2026-11-16.md`](LEITURA_DIAGNOSTICO_INTEGRAL_2026-11-16.md)) |

## 6. O que o repositório público expõe

- **Segredos:** a procura no histórico inteiro (`npm run segredos -- --historico HEAD`, 470 commits, em 17/11) não achou nenhum. Senhas, chaves e tokens ficam só no servidor.
- **A lista do que aparece:** o endereço do servidor, a porta do SSH, a conta do cPanel, a referência do projeto Supabase e os defeitos de segurança em aberto. Ela foi entregue ao proprietário fora do repositório, de propósito, para não juntar tudo num lugar público.
- **A visibilidade** (público ou privado) é decisão do proprietário. O efeito de tornar privado nos minutos do GitHub Actions e na integração com o Supabase está na mesma lista.

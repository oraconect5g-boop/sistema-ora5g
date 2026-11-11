# Pedido de revisão ao Codex

## Pedido de 08/11/2026 — branch `feature/ORA-implantacao-piloto`

Pedido do proprietário: listar tudo o que depende dele, fazer o que o programador puder e começar já o back-end e as migrations. Registre os achados em `REVISOES_CODEX.md` como sempre (segurança, permissão e dinheiro são bloqueantes).

| # | O que revisar | Onde | Pontos de atenção |
|---|---|---|---|
| 1 | **#17 / REV-018** conciliado por renomeação | `packages/banco/supabase/migrations`, `aplicadas-dev.json`, `src/migrations.test.ts`, README do banco | md5 do texto gravado no Supabase = md5 do arquivo (conferido nas 6); a regra nova (renomear para a versão gravada e registrar o md5) basta? |
| 2 | **#18 / REV-019** | `apps/plataforma/src/app/demo/vender/estoque.ts` e `PDV.tsx`; E2E "REV-019" | Zero, uma unidade, limite exato e acima |
| 3 | **ORA-ORG-005** auditoria automática | migration `20261108150432_auditoria_automatica_acesso.sql`; `src/auditoria-acesso.test.ts` | Gatilho genérico por `organizacao_id`/`unidade_id`; um evento por organização na mudança de perfil; `origem` (`aplicacao`, `api:<papel>`, `banco:<usuário>`); motivo por `set_config('ora.motivo')` |
| 4 | **ADR-003** e catálogo/estoque | `docs/adr/ADR-003-...`; migration `20261108150620_catalogo_estoque.sql`; `src/catalogo-estoque.test.ts` | Funções `SECURITY DEFINER` expostas (`reservar_estoque`, `liberar_reserva`, `conferir_item`, `preco_vigente`, `disponibilidade_na_rede`) e suas guardas; `unidades_com_permissao` com a mesma regra de `tem_permissao`; custo visível ao gerente pela unidade da sessão; livro imutável; saldo sem negativo; índice único de reserva ativa; códigos OR001–OR004 |
| 5 | Semente do desenvolvimento | `packages/banco/supabase/semente/`; `src/semente.test.ts` | Só dados fictícios; idempotente; nunca em produção |
| 6 | Gravação de chaves sem exibir | `deploy/homologacao/definir-chave.sh` | Leitura oculta, valor fora da linha de comando, arquivo 600, troca atômica, recusa de nomes fora do `.env.example` |
| 7 | Lista do proprietário | `docs/PENDENCIAS_DO_PROPRIETARIO.md` | As 60 variáveis do `.env.example` aparecem (os `PORT_*` agrupados); nada pede valor no chat |
| 8 | Status dos requisitos | `status-requisitos.json` e `RASTREABILIDADE.md` | ORA-ORG-005 e ORA-INV-003 como "testado"; demais como "parcial" com o que falta |

Aplicado no `ora5g-dev`: migrations `20261108150432`, `20261108150620` e `20261108151325` (índices pedidos pelo verificador) e a semente. Verificador de segurança do Supabase: só os avisos `0029` das funções que o usuário logado precisa chamar (8, todas com guarda interna). Revisão do planejamento: `REVISAO_DO_PLANEJAMENTO_2026-11-08.md`.

---

## Pedido de 07/11/2026

**De:** Claude Code (programador) · **Para:** Codex (revisor) · **Aprovação final:** proprietário

Antes de revisar, leia `docs/ESTADO_ATUAL_E_PASSAGEM.md`, `docs/alinhamento/ANALISE_DO_PLANO.md` e `docs/alinhamento/RASTREABILIDADE.md`.

**Onde registrar:** crie ou atualize `docs/alinhamento/REVISOES_CODEX.md` com uma linha por achado: ID do achado, requisito (`ORA-...`), arquivo e linha, gravidade (bloqueante / importante / sugestão), o que está errado e a correção sugerida. Achado de segurança, permissão ou dinheiro é **bloqueante**.

## O que revisar

### 1. Alinhamento com o plano
- A análise (`ANALISE_DO_PLANO.md`) reflete o plano? Falta algum requisito, decisão ou divergência? As resoluções da seção 6 seguem a hierarquia (decisão recente > ADR > requisito > pesquisa)?
- Os status de `status-requisitos.json` são honestos? Algum "parcial" deveria ser "não iniciado"? Alguma "demonstração" está sendo vendida como entrega?

### 2. Regras de negócio puras (`packages/dominio`)
- `desconto.ts`: a fórmula do limite por margem corresponde à ETAPA_0_DECISOES §2B (menor entre teto da categoria e o desconto que mantém a margem mínima após a taxa do meio)? Arredondamentos a favor da empresa?
- `pagamento.ts`: DEC-U38 (financiada = preço do aparelho; entrada na loja; resto a receber; juros nunca entram), DEC-U30 (e-mail só na PayJoy), troco só em dinheiro.
- `venda.ts`: recarga com valor de face fora da receita; ativação/portabilidade só contam confirmadas (DEC-U46, invariante 6).
- `identificadores.ts`: Luhn de IMEI e ICCID; casos de borda.
- Proponha testes que estejam faltando (valores extremos, arredondamento, combinações de meios).

### 3. Demonstração (`apps/plataforma/src/app/demo`, `src/demo`)
- Fica claro em todas as telas que é demonstração com dados fictícios? Algum texto promete algo que não existe?
- Ela some em produção (`APP_ENV=producao` → 404, coberto por E2E)? O cookie de perfil é inofensivo?
- A navegação por perfil segue a matriz do ADR-002 (vendedor sem aprovações, administrador sem vender)?
- Acessibilidade e celular: alvos de toque ≥ 44 px, rótulos, contraste (a cor de ação foi escurecida para `#0A7D72`), nada passando da largura de 360 px.

### 4. Conexão real com o Supabase (`apps/plataforma/src/lib/supabase`, `src/app/entrar`, `src/app/conta`)
- O login usa só a chave pública, mensagem neutra, sem vazar se o e-mail existe? Cookies de sessão corretos com `@supabase/ssr`?
- `/conta` lê perfil e unidades pelo RLS como o próprio usuário?
- Falta proteção contra força bruta (o Supabase limita, mas a tela não). Avalie se é bloqueante para homologação.

### 5. Homologação (`deploy/homologacao`)
- O processo escuta só em `127.0.0.1:3100`? O `.htaccess` encaminha corretamente e força HTTPS? Há risco no `X-Forwarded-*`?
- `publicar.sh` e `garantir-no-ar.sh`: travas, reinício, permissões do arquivo de variáveis.

### 6. Pendências que o Claude já sabe (confirme a prioridade)
- ORA-ORG-005: mudanças em vínculos, perfis e papéis ainda não geram auditoria automática.
- ADR-003 (operação comercial, tipos de item, ledger de estoque) ainda não escrito; bloqueia catálogo e estoque.
- Login: recuperação de senha, sessão por turno e escolha da loja na sessão ainda não implementadas.

## Resultado esperado

Lista de achados em `REVISOES_CODEX.md` e, se concordar com a ordem, um "de acordo" para a sequência da seção 4 da análise. Correções pequenas (texto, teste faltando) podem ser feitas direto; o resto volta para o Claude Code.

## 08/11/2026 (noite) — integridade do estoque, demonstração e lista de APIs

**Branch:** `fix/ORA-integridade-estoque` (com o merge da PR #25). **Respostas detalhadas:** [RESPOSTAS_A_REVISAO_2026-11-08.md](RESPOSTAS_A_REVISAO_2026-11-08.md). **Fila:** [FILA_DE_EXECUCAO.md](FILA_DE_EXECUCAO.md).

Pedidos de conferência:
1. #19 a #22: migration `20261108195850_integridade_estoque.sql`, regressões em `packages/banco/src/integridade-estoque.test.ts` e concorrência real em `packages/banco/src/concorrencia.test.ts`. Conferir também o defeito novo do upsert do saldo (saída sempre recusada) e a ordem das travas.
2. #23 e #24: `ChipsConnect.tsx`, `RecargaConnect.tsx` e os testes REV-024/REV-025 em `apps/plataforma/e2e/connect.spec.ts`.
3. §7.4 (liberar reserva de outra pessoa) e §7.6 (`definir-chave.sh` + `apps/plataforma/src/lib/definir-chave.test.ts`).
4. Lista [APIS_E_HABILITACOES_NECESSARIAS.md](../integracoes/APIS_E_HABILITACOES_NECESSARIAS.md): conferir se algum contrato foi apresentado como confirmado sem fonte oficial.
5. Dependência nova só de desenvolvimento: `embedded-postgres@17.10.0-beta.17` e `pg@8.23.1` em `packages/banco` (`npm audit --omit=dev` sem achados).

Status de requisitos: ORA-INV-002 e ORA-INV-003 voltam a **testado** (aguardando esta conferência); notas de INV-004/005/006, POS-004, QUAL-007 e CONNECT-001/003/011 atualizadas.

## 08/11/2026 (noite, 2) — acesso real, cadastro de usuários e gestão da equipe (ORA-006)

**Branch:** `feature/ORA-006-acesso-equipe`. Pedido do proprietário: cadastro de usuários e gestão da equipe.

Pedidos de conferência:
1. Migration `20261108202654_acesso_sessao_e_equipe.sql`: sessão por turno lida de `auth.sessions` dentro de `privado.vinculos_vigentes()` (revogação imediata), hierarquia da equipe (só o dono mexe em dono/administrador; ninguém no próprio acesso; nunca sem dono), convites e funções `identidade_*` só para `service_role`. Testes: `packages/banco/src/acesso-equipe.test.ts` e a reversão provada em `migrations.test.ts`.
2. Aplicativo: `apps/plataforma/src/lib/acesso` (decisão de sessão; falha do serviço não vira "sem acesso"), `/escolher-loja`, `/inicio`, `/equipe` (ações só por funções do banco, motivo obrigatório, mensagens por código de catálogo), `/auth/confirmar`, `/conta/senha`, `/entrar/recuperar`, `/sair`; redirecionamentos relativos por causa do Apache.
3. `apps/worker` e `deploy/homologacao/{publicar.sh,worker-identidade.sh}`: chave secreta só no worker; teste de publicação isolado (porta 3190, valores fictícios) mostrou o `.env.local` do web sem `SUPABASE_SECRET_KEY`/`DATABASE_URL` e o do worker completo, ambos 600.
4. Pendências declaradas: confirmação de senha recente (ADR-002 §2.6) e prova com usuário real (#11). Convite real depende de chave, SMTP e modelos de e-mail (proprietário).

## 08/11/2026 (noite, 3) — fotos dos produtos (ORA-CAT-011, #26)

**Branch:** `feature/ORA-CAT-011-fotos`. Contrato seguido: `docs/alinhamento/FOTOS_DOS_PRODUTOS_2026-11-08.md`.

1. Migration `20261108204536_fotos_dos_produtos.sql` (aplicada no `ora5g-dev`): bucket privado `produtos` (5 MB; JPEG, PNG, WebP), políticas de Storage por organização (ler: qualquer vínculo vigente; enviar: `catalogo.fotos`, nova, para dono e gerente), `fotos_produto` com histórico (uma em uso por produto/variante), `registrar_foto` (tamanho e tipo lidos de `storage.objects`, caminho conferido contra organização/produto/variante, ilustração só em item não físico) e `pendencias_de_foto`. Testes: `packages/banco/src/fotos-produto.test.ts`; Storage simulado em `supabase-simulado.sql`.
2. Tela `/catalogo` e componentes `EnviarFoto`/`FotoAmpliavel`: envio direto do celular ao Storage com a sessão da pessoa; registro por ação do servidor; sem custo no navegador.
3. Decisão a confirmar com o proprietário: vendedor também poder enviar foto (hoje não; a permissão é de dono e gerente).
4. Fora desta entrega: limpeza de arquivo enviado sem registro (worker), fotos no estoque e no PDV reais, homologação com fotos reais.

## 08/11/2026 (noite, 4) — vendas, pagamentos e caixa reais (ADR-004)

**Branch:** `feature/ORA-ADR-004-vendas`. **ADR:** [ADR-004](../adr/ADR-004-vendas-pagamentos-e-caixa.md) (proposto).

1. Migration `20261108233546_vendas_pagamentos_e_caixa.sql` (aplicada no `ora5g-dev`; md5 igual) e `20261108233711_indices_vendas_e_fotos.sql` (advisor 0001). Conferir: idempotência das chaves (criar venda, item, caixa, movimento, conclusão), ordem das travas (chave → venda → caixa → item → reserva → saldo), regra do pagamento espelhando `packages/dominio/src/pagamento.ts`, limite de desconto espelhando `desconto.ts` (taxa do meio = 0 até haver configuração), custo em tabela própria só com `custo.ver`, estorno no cancelamento.
2. Testes: `packages/banco/src/vendas.test.ts` (cenários A, B, C, D, E, H, I) e o caso de conclusão repetida simultânea em `concorrencia.test.ts` (PostgreSQL 17 real).
3. Telas `/vender`, `/caixa`, `/aprovacoes`, `/vendas/[id]`: só chamam funções do banco; nada de custo no navegador; chave de idempotência gerada na tela.
4. Limites declarados: link de pagamento bloqueado (provedor A3), devolução parcial e troca (POS-012) não feitas, fiscal e comissão ainda não existem, prova com usuário real depende da `SUPABASE_SECRET_KEY`.

## 08/11/2026 (noite, 5) — Ora Connect real (ADR-005), fila fiscal (ADR-006) e go/no-go

**Branches empilhadas:** `feature/ORA-CONNECT-adaptador` → `feature/ORA-FISC-fila`. Migrations aplicadas no `ora5g-dev` em 09/11, nesta ordem e com md5 conferido: `20261109123402_ora_connect_operacoes`, `20261109123533_indices_ora_connect` (advisor 0001) e `20261109123757_fila_fiscal`; tipos do Supabase gerados depois de cada uma. Advisors: só os avisos já esperados (0029 das RPCs por desenho; tabelas privadas `connect_dados_envio` e `notas_destinatarios` com RLS sem política, de propósito: só as funções do banco leem).

1. **ADR-005** ([documento](../adr/ADR-005-ora-connect-operacoes.md)): conferir estados e transições (só `aguardando_operadora` muda sozinha; desconhecido nunca é reenviado nem confirmado sozinho; gerência decide e não a própria), índices únicos (chip, recarga em curso, portabilidade em curso, serviço pago), ordem das travas, gatilhos que protegem chip ativado e venda com operação viva (OR013), dados pessoais só até o envio, `connect_worker_*` só para `service_role`.
2. Regras puras `packages/dominio/src/nogle.ts`: o teste prova que o pedido só usa campos documentados (tabelas e exemplos da cópia oficial) e lê resposta e evidência com os exemplos oficiais. Conferir as leituras conservadoras: só `{mensagem}` = desconhecido; portabilidade com `retorno=false` e id = desconhecido; recarga casada pela `data_cadastro` (pergunta 10).
3. Worker `apps/worker/src/connect/`: transporte com "não enviada" × "enviada sem resposta", 401 renova uma vez, 429/login recusado voltam à fila, GET com corpo desligado até a Contel confirmar; teste ponta a ponta com banco real em memória e servidor local respondendo com os exemplos oficiais.
4. **ADR-006** ([documento](../adr/ADR-006-fila-fiscal-interna.md)): pedido da venda concluída, um vivo por venda, aprovação que nunca segura a emissão, chave de acesso com dígito e CNPJ conferidos e única, venda cancelada × nota emitida (OR015), prazo de alerta só com fonte. Nada é emitido.
5. Go/no-go: [GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md](../operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md).
6. Também: T4 e T5 deixaram de ser TODO (viraram testes em `vendas.test.ts`); restam 2 TODO de módulos futuros (CRM e OS).

## 09/11/2026 — Devolução parcial e troca com vale (adendo do ADR-004)

**Branch:** `feature/ORA-POS-012-devolucao-troca`. Migration `20261109134507_devolucao_e_troca` (aplicada no `ora5g-dev`, md5 conferido).

1. `devolver_itens`: permissão (`venda.cancelar` na loja da venda), idempotência (OR004), ordem das travas (chave → venda → caixa → item serializado → saldo), valor com a parte acumulada do desconto, limites de reembolso por meio (dinheiro descontando o troco), caixa obrigatório quando sai dinheiro ou estorno, financiada recusada (OR016), serviço com operação Connect viva (OR013).
2. Vale-troca por gatilho em `venda_pagamentos` (não reescreve `concluir_venda` nem `cancelar_venda`): baixa o saldo com trava no vale, recusa inexistente ou sem saldo (OR018), devolve o saldo uma vez só no estorno; `entrada_sem_vale` impede pagar entrada de financiamento com vale.
3. Fila fiscal: `notas_pedidos.tipo` (`venda` | `devolucao`) e `devolucao_id`, índice único por venda só para o tipo `venda`, novo evento `ajustada_por_devolucao`.
4. Venda com devolução não é cancelada inteira (OR017).
5. Telas: devolução e lista de devoluções no comprovante; "Comprovante ou nº do vale" no PDV.

## 09/11/2026 — Lote 1 do prompt consolidado: acesso e configuração (#55, #27–#30, #45, #56)

**Branch:** `fix/ORA-acesso-configuracao-lote1` (a partir da main `d730e9a`). **Matriz de reconciliação de todos os achados:** [RECONCILIACAO_CODEX_2026-11-09.md](RECONCILIACAO_CODEX_2026-11-09.md). Migration `20261109150526_correcoes_acesso_lote1` aplicada no `ora5g-dev`, com md5 conferida, reversão ensaiada e tipos gerados de novo.

| # | Achado | O que mudou | Prova |
|---|---|---|---|
| 1 | #55 / REV-052 | `deploy/homologacao/ambiente-web.sh`: lista de **nomes permitidos** para o web (`APP_ENV`, `APP_TIMEZONE`, `APP_DEFAULT_CURRENCY`, `NEXT_PUBLIC_*`), arquivo 600. O worker continua com o ambiente completo | `packages/config/src/ambiente-web.test.ts` (3). Ensaio de publicação e republicação na porta 3190 com valores fictícios: web sem NOGLE e sem chave secreta, worker com as duas |
| 2 | #27 / REV-026 | `alterar_situacao_pessoa` exige gerir **todas** as organizações em que a pessoa tem vínculo vigente (42501). Fora disso, encerra-se o vínculo na própria equipe | `correcoes-acesso.test.ts` (#27, com controle positivo) |
| 3 | #28 / REV-027 | Autoconcessão pela identidade: `convidar_pessoa` confere também o e-mail do Auth do ator. `identidade_concluir_convite` recusa e cancela quando a pessoa do Auth é quem convidou. Agora retorna `enviado`, `vinculado` ou `recusado`, e o worker conta os recusados | `correcoes-acesso.test.ts` (#28, 2 casos); `apps/worker/src/identidade.test.ts` |
| 4 | #29 / REV-028 | Trava consultiva por organização (`equipe_donos`) em `encerrar_vinculo` e no bloqueio de dono, com a conferência do outro dono ativo depois da espera | `concorrencia.test.ts`: duas conexões reais (PostgreSQL 17); uma encerra, a outra recebe 23514 |
| 5 | #30 / REV-029 | `privado.pessoa_gere_equipe` (sem depender de sessão). Convite de autor sem autoridade é cancelado antes do e-mail e recusado na conclusão | `correcoes-acesso.test.ts` (#30, com controle: autor válido conclui) |
| 6 | #45 / REV-043 | Policy `aprovacoes_ler`: o próprio pedido só com `unidade_id in unidades_visiveis()` (perfil, vínculo, sessão e turno vigentes) | `correcoes-acesso.test.ts` (#45); a prova da PR #33 passou |
| 7 | #56 / REV-053 | Débito da carteira em `connect_operacoes_custos` (RLS `custo.ver`), fora de `connect_operacoes`, da evidência e dos eventos. A tela só consulta com `custo.ver` | `correcoes-acesso.test.ts` (#56); `ponta-a-ponta.test.ts` do worker |

**Provas da PR #33 nesta versão.** As de #45 e #56 passam. As de #27–#30 agora terminam em erro por causa da proteção nova: a prova esperava retorno booleano, ou que a segunda transação não esperasse. As regressões permanentes listadas acima refazem os mesmos cenários pelo contrato novo, sem afrouxar a regra.

**Riscos e retorno.** `identidade_concluir_convite` mudou o retorno (de `void` para `text`). Worker e banco mudam juntos; o worker antigo ignora o retorno. A reversão do lote devolve a coluna de custo, a policy e os textos originais das funções (só em banco sem dados reais).

**Fica de fora.** #11 depende do usuário de teste (linha A1 da lista única em `docs/PENDENCIAS_DO_PROPRIETARIO.md`).

## 09/11/2026 — Lote 2 do prompt consolidado: dinheiro, estoque e Ora Connect (#46–#53, #34, #35, #57–#59)

**Branch:** `fix/ORA-integridade-lote2` (a partir da main `b967870`, que já tem o Lote 1). Migrations `20261109190240_integridade_vendas_lote2` e `20261109190400_connect_evidencia_lote2`, aplicadas no `ora5g-dev` com md5 conferida, reversões ensaiadas e tipos gerados de novo. Os textos da devolução parcial, da troca e do vale-troca (main `0fa1546`) foram preservados. Só mudou o que estes achados exigem: estorno de cartão e Pix a confirmar e IMEI/ICCID conferido.

| # | Achado | O que mudou | Prova permanente |
|---|---|---|---|
| 1 | #46 / REV-044 | `concluir_venda`: entrada por Pix ou cartão exige comprovante; vale não paga entrada. Tela (`lerPagamentos`) igual | `integridade-lote2.test.ts` (4 meios + vale), `regras.test.ts` |
| 2 | #48 / REV-046 | Troco só de linha em dinheiro: banco = `conferirPagamentos` | 7 vetores comuns SQL × TypeScript |
| 3 | #47, #49 / REV-045, 047 | Cancelamento: dinheiro líquido do troco, saldo conferido sob a trava do caixa, inclusive entrada | caixa com R$ 0,01 a menos recusa e nada muda; com o centavo, devolve exatamente o retido |
| 4 | #50 / REV-048 | `estornos_externos` + `confirmar_estorno_externo`: pagamento `estorno_pendente` até o comprovante; também na devolução parcial; financeira (contrato e entrada) idem | Pix, cartão e financiada; UPDATE direto e DELETE recusados (42501); outro comprovante dá OR004 |
| 5 | #51 / REV-049 | `venda_retornos` + `conferir_retorno`: nada volta sozinho; IMEI/ICCID e condição conferidos; "não voltou" com explicação; chip com ativação viva barra o cancelamento | aparelho, chip, não recebido, OR013 |
| 6 | #52 / REV-050 | Fundo e desconto vazios ou ilegíveis voltam com erro, sem RPC; meio inválido da entrada é recusado, não trocado por dinheiro | `valores-invalidos.test.ts` (ações reais, sessão e RPC simuladas) |
| 7 | #53 / REV-051 | `decidir_aprovacao` trava venda → aprovação | `concorrencia.test.ts`: duas conexões, nas duas ordens, sem 40P01 |
| 8 | #34 / REV-032 | `reservar_estoque` recusa produto nulo; `registrar_item_serializado` confere condição e série na repetição | `integridade-lote2.test.ts` |
| 9 | #35 / REV-033 | `validarItem`: chip é um por ICCID (o banco já exigia) | `venda.test.ts` |
| 10 | #57 / REV-054 | LINK com serviço pago no caixa é recusado (banco e tela) | `connect-lote2.test.ts`, `regras.test.ts` da Connect |
| 11 | #58 / REV-055 | Resumo do titular com segredo por organização na chave | outro titular dá OR004, também depois do descarte do pedido; normalização (espaços, maiúsculas, máscara do CPF) devolve a mesma operação; segredo ilegível para `authenticated` e `service_role` |
| 12 | #59 / REV-056 | Evidência ambígua (domínio) ou reutilizada (`evidencia_chave` única) vai para a conferência da gerência; sem datas não confirma | duas operações da mesma linha e data; recarga já usada; histórico duplicado |

**Telas reais.** No comprovante da venda: os cartões "Estornos de cartão, Pix e financeira" (confirmar com o comprovante) e "Itens a receber de volta" (conferir com IMEI/ICCID e condição, ou registrar que não voltou). A devolução pede o IMEI/ICCID dos aparelhos e chips. Fundo e desconto passaram a ser obrigatórios, com 0,00 por padrão.

**Riscos e retorno.** A mudança é de comportamento: cancelamento não repõe estoque e cartão/Pix não ficam mais "estornado" na hora. Item avariado devolvido continua na loja com a condição registrada até o #60 (DEFEITOS). A reversão só vale em banco sem dados reais e apaga estornos e retornos registrados.

## 09/11/2026 — Lote 3 do prompt consolidado: CSV, busca e fotos (#38, #40–#43)

**Branch:** `fix/ORA-busca-csv-fotos-lote3` (a partir da main `c071968`). Migration `20261109191416_fotos_idempotentes_lote3`, aplicada no `ora5g-dev` com md5 conferida e reversão ensaiada.

| # | Achado | O que mudou | Prova |
|---|---|---|---|
| 1 | #38 / REV-036 | `celulaCsv`: texto que começa com `=`, `+`, `-`, `@`, tabulação ou retorno ganha apóstrofo; número fica igual | `ExportarCsv.test.ts`; prova da PR verde |
| 2 | #40 / REV-038 | Catálogo: nome, SKU e nome da variante filtram no banco antes do limite; variações, fotos e saldos só dos produtos achados. Estoque: variações filtradas antes do limite dos saldos. `%`, `_`, vírgula e parênteses saem do termo | `catalogo/busca.test.ts` (7) |
| 3 | #41 / REV-039 | `FotoAmpliavel`: a falha vale só para a URL que falhou | fixture do Codex, 360 e 1280 px |
| 4 | #42 / REV-040 | `registrar_foto` idempotente pelo caminho (trava pelo caminho; outro uso do mesmo arquivo dá OR004). `EnviarFoto` guarda o caminho enviado e, numa nova tentativa, só registra | `fotos-lote3.test.ts`; prova de banco da PR verde; fixture |
| 5 | #43 / REV-041 | Descartar ou concluir limpa a escolha do arquivo | fixture |
| 6 | índice redundante | `fotos_produto_produto_organizacao` removido; `fotos_organizacao` cobre a chave estrangeira; o aviso 0001 fica aceito | controle de EXPLAIN da PR verde |

## 09/11/2026 — Lote 4 do prompt consolidado: demonstração (#31, #32, #36, #37, #39)

**Branch:** `fix/ORA-demo-lote4` (a partir da main `596b046`). Só a demonstração; nenhuma migration.

1. `resumoDeVendas`: valor de face da recarga fora do faturamento (#31); telecom conta chip vendido e operação **confirmada** (#32).
2. `aprovacoesVisiveis`: quem pediu não vê o próprio pedido (#36).
3. Relatórios: a variação só aparece com período anterior completo; 30 dias não compara com 1 dia (#37).
4. Ativação simulada pelo SALDO: botão trava e aviso de saldo insuficiente; a carteira nunca fica negativa (#39). Os 80% do plano continuam sendo número de exemplo da demonstração, não contrato.

Provas: `src/demo/revisao-demo-lote4.test.ts`, `src/app/demo/relatorios/comparacao.test.ts` (prova da PR como veio) e `e2e/carteira-demo.spec.ts` (prova do Codex; o laço vai até o botão travar).

## 09/11/2026 — Lote 5: pedidos internos de transferência e DEFEITOS (#60, ADR-007)

**Branch:** `feature/ORA-transferencias-defeitos-lote5` (a partir da main `11e4e48`). Migration `20261109193043_transferencias_e_defeitos`, aplicada no `ora5g-dev` com md5 conferida e reversão ensaiada. Pontos para revisar:

1. Modelo do DEFEITOS como `unidades.tipo = 'excecao'`, com os gatilhos que recusam venda e reserva de venda ali.
2. Reserva de transferência no mesmo `reservado` do saldo (`expira_em = infinity`) e a mudança no livro: `transferencia_saida` de item reservado, como a `venda`.
3. Máquina de estados e permissões: separar e enviar na origem (`estoque.transferir`; de DEFEITOS, `estoque.ajustar`); receber no destino; recusar antes de separar; cancelar antes de enviar.
4. Recebimento de aparelho/chip só pelos IMEI/ICCID lidos que são da transferência; o que falta vira divergência, com explicação.
5. Telas: "Onde tem" no estoque (loja atual primeiro e DEFEITOS à parte; abre também pelo catálogo, para produto sem saldo aqui) e `/transferencias` (separar com a escolha do IMEI, enviar, receber e conferir, recusar e cancelar).

Provas: `transferencias.test.ts` (8) e duas disputas reais em `concorrencia.test.ts`.

## 09/11/2026 — Nome da integração: Nogle (pedido do proprietário)

**Branch:** `fix/ORA-nome-nogle`. A Ora Connect usa a **API oficial da Nogle**; não há outro fornecedor. "Contel" aparecia porque a documentação oficial da Nogle é publicada em nome da Contel Telecom, e o endereço da API (`api.conteltelecom.com.br`) e o e-mail de suporte têm esse nome. Agora telas, mensagens, worker, domínio, mensagens do banco (migration `20261109201940_mensagens_nogle`, só texto, md5 conferida) e documentos vivos dizem "Nogle". Ficaram iguais: o endereço da API, o e-mail de suporte, a coleção oficial e o catálogo gerado a partir dela, os relatórios históricos e os textos do Codex. A função `iccidNoFormatoContel` passou a se chamar `iccidNoFormatoNogle`.

## 10/11/2026 — Respostas da Nogle (itens 5 a 7) e confirmação pelo uuid

**Branch:** `feature/ORA-nogle-respostas`. Respostas registradas em `docs/integracoes/NOGLE_API_REFERENCIA.md` §3.1, com a conferência contra a coleção oficial:
- Estoque de PDV e da MVNO, as três transferências de chip, o extrato do saldo e os relatórios de ativações e recargas existem na coleção. As respostas só explicam o uso, por exemplo: o ICCID do lote vai sem o dígito verificador, e o GET com corpo é confirmado.
- `/consultaPagamento` e o campo `uuid` **não** estão na coleção.

**Implementado, desligado por padrão:**
- `uuidDaResposta` só lê `uuid`, no topo ou no objeto da operação, e só no formato de uuid; o lugar exato ainda precisa ser confirmado.
- `montarConsulta(..., { consultaPagamento })` monta a consulta e `interpretarConsultaPagamento` lê a resposta: `data_pagamento` confirma; QR, código e PDF do eSIM ficam fora da evidência.
- Worker com `NOGLE_CONSULTA_PAGAMENTO=habilitada`.
- Migration `20261110124824_connect_consulta_por_uuid`, aplicada com md5 conferida: `uuid_externo`, um por organização; o envio grava e a fila devolve. A confirmação pela evidência do mesmo uuid com data do pagamento usa `evidencia_chave = 'uuid|…'`. Evidência de outro uuid ou sem data não confirma.

Provas: `nogle.test.ts` (3) e `connect-lote2.test.ts` (2): duas recargas com a mesma data confirmam cada uma pelo próprio uuid.

## 10/11/2026 — Passo 0 e prioridade 1: skill, PR #33 e inventário de autorização

Autorizado pelo proprietário depois do diagnóstico somente leitura de 10/11.

- **Passo 0:** skill da PR #61 integrada sem alteração (`34f631f`); conteúdo da PR #33 trazido pela branch `docs/passo0-reconciliacao-pr33` (`a678760`), com o que entrou e o que não entrou em [RECONCILIACAO_CODEX_2026-11-09.md, seção 5](RECONCILIACAO_CODEX_2026-11-09.md). Pedido: conferir as notas do `status-requisitos.json` (estados mantidos, achados e lotes citados) e fechar a PR #33 com o comentário sugerido lá.
- **Prioridade 1 (inventário de autorização):** `packages/banco/src/autorizacao-funcoes.test.ts`. Monta um mundo fictício com objetos reais em duas lojas (vendas, aprovações, devoluções, estornos, caixas, notas, operações Connect, transferências, convites, reservas e foto) e tenta cada uma das 48 funções `SECURITY DEFINER` expostas como 13 tipos de atacante: 528 tentativas. Recusa = erro 42501/P0002 (ou leitura vazia) e impressão digital do banco igual antes e depois; a auditoria só pode crescer com registros de recusa. Falha se surgir função nova exposta sem casos e se o anônimo puder executar qualquer função.
  - Exceções documentadas no próprio teste: pedir transferência é de quem consulta estoque na origem ou no destino (ADR-007 §3); o catálogo (pendências de foto) é visível a quem é da rede; `situacao_da_sessao` e `unidade_atual` descrevem a própria sessão; "na rede" pode listar as lojas zeradas da rede de quem pergunta; reservar item de outra loja é recusado com OR003.
  - Prova de que o teste pega furos (cópia temporária, apagada depois): aprovação sem conferir permissão (1 caso falhou), permissão sempre verdadeira (27 funções falharam), função liberada para anônimo e função nova sem casos (inventário falhou).
  - Pedido ao Codex: tentar um caminho de ataque que o catálogo não cubra (outra combinação de papel, loja e objeto) e conferir se as exceções acima são aceitáveis.
- **Não feito ainda:** o teste de navegador com vendedor e gerente fictícios depende da linha A1 (usuários de teste no `ora5g-dev`).

## 10/11/2026 — Revisão das telas: molde único, busca única, vendas e auditoria reais

Pedido do proprietário: rever todas as telas e funções, ligar cada uma ao banco e ao worker e corrigir o que funcionava diferente entre páginas.

- **Molde e menu únicos** (`componentes/MoldeReal.tsx`, `lib/acesso/menu.ts`): as 11 telas reais com login usam o mesmo cabeçalho, menu lateral e barra inferior; os itens vêm de `tem_permissao` na loja do turno (equipe: na rede). Antes cada tela tinha links próprios (algumas só "Início") e o início não levava às aprovações. Pedido: conferir se algum papel vê item que não deveria (o banco recusa de qualquer jeito) e se falta algum.
- **Busca única** (`lib/catalogo/termos.ts`, `lib/catalogo/busca.ts`): catálogo, estoque e PDV acham pelo nome do produto, nome da variação, SKU, IMEI, segundo IMEI e ICCID. Antes o estoque e o PDV não achavam pelo nome do produto, o PDV não via o segundo IMEI e aceitava 14 dígitos como identificador.
- **Telas reais novas:** `/vendas` (o vendedor vê as próprias; a gerência, a loja, com nota e devolução; resumo só das concluídas, devolução abatida; sem custo) e `/auditoria` (`auditoria.ver`, sem antes/depois). O início virou painel de pendências com contagens só para quem tem a permissão.
- **Demonstração:** 11 lojas e o local DEFEITOS; textos sem "14 lojas" fixo.
- **Testes:** `menu.test.ts`, `busca.test.ts`, `lista.test.ts`, `auditoria/regras.test.ts` e `vendas/vendas.test.ts` (telas montadas com sessão e banco simulados); `/vendas` e `/auditoria` entram na prova de que sem login volta ao `/entrar`.
- **Workers:** identidade testado na versão publicada ("desligado" sem a chave); agendamento depende do proprietário. Ora Connect desligado (ADR-005).

## 10/11/2026 — Visual azul, versão na tela e publicação sem apagar versões

Pedido do proprietário: descobrir por que a demonstração no ar não era a versão atual, aplicar o visual dos prints de referência (cor azul escolhida por ele) e publicar mostrando a versão.

- **Causa:** a `main` (`eb0a947`) estava 5 commits à frente do site (`8f7a458`). A publicação é manual (`publicar.sh`) e depende de autorização a cada vez; não havia cache (DNS no próprio servidor, Apache sem cache, `no-store`, sem service worker) nem publicação automática (o GitHub Actions só roda o CI).
- **Base visual** (`app/global.css`, `app/layout.tsx`, `componentes/ui.tsx`, `componentes/graficos.tsx`): tokens azuis, raio 24 nos cartões e pílula nos botões (campos de várias linhas usam `rounded-campo`), Plus Jakarta Sans, paleta categórica revalidada com `validate_palette.js` (azul na série 1; amarelo e rosa com aviso de contraste, sempre com rótulo ou tabela), cinza de comparação para o período anterior.
- **Navegação** (`componentes/Trilho.tsx`, `NavegacaoCelular.tsx`, `AppShell.tsx`, `MoldeReal.tsx`): trilho de ícones que abre ao passar o mouse ou ao navegar pelo teclado (`:has(:focus-visible)`, variante `trilho-aberto`) e pode ficar fixo (`localStorage` lido com `useSyncExternalStore`; o conteúdo abre espaço por `html[data-menu="aberto"]`); no celular, pílula escura e "Mais" em grade. Nomes acessíveis dos links e o diálogo "Todas as telas" seguem iguais (testes de navegador).
- **Início da gestão** (`app/demo/_paineis/PainelGestao.tsx`): `serieDoPainel` monta hoje × ontem (ontem repartido por hora com um perfil fixo, dado fictício) e 7 ou 14 dias contra o período anterior; 30 dias não cabem no histórico fictício de 30 dias. Provas: `painel.test.ts`.
- **Versão na tela** (`lib/versao.ts`, `next.config.ts`, `RodapeVersao.tsx`, `/saude`, `/entrar`): commit (`git rev-parse` na pasta da versão) e hora da build gravados na build. Provas: `versao.test.ts`.
- **Publicação** (`deploy/homologacao/publicar.sh`, `conferir-publicacao.sh`, `LEIA-ME.md`): versões antigas não são mais apagadas sozinhas (pedido do proprietário: nada é apagado do servidor sem perguntar); o script novo só lê e mostra o que falta publicar.
- **Pedido ao Codex:** conferir contraste e foco do trilho aberto e da pílula do celular; se a variante `trilho-aberto` cobre teclado sem prender o menu aberto depois do clique; se `next.config.ts` pode gravar o commit em todos os ambientes (worktree, CI, clone sem `.git`, que mostra `sem-git`); e se o perfil fixo de "ontem por hora" na demonstração está claro o bastante como dado fictício.

## 10/11/2026 — Financeiro real, lote 1 (#65)

Pedido do proprietário pelo prompt do Codex (`docs/prompt-financeiro-real-20261110`). Matriz e contrato dos números: `docs/alinhamento/MATRIZ_DEMO_REAL.md`.

- **Banco** (`20261110224537_financeiro_painel.sql`, aplicada no `ora5g-dev`, md5 conferido): `financeiro_painel(início, fim, loja?, por hora?)`, security invoker, devolve o período inteiro em jsonb (vendas/cancelamentos/devoluções por dia ou hora de São Paulo; pagamentos por meio, situação e meio da entrada, com o troco no primeiro dinheiro da venda; reembolsos; estornos; a receber; movimentos do caixa por tipo e meio; fechamentos). Anônimo não executa; não lê custo. Provas: `financeiro-painel.test.ts` (10), inclusive pagamentos × livro do caixa batendo, 1.200 linhas, dia de São Paulo e escopo de vendedor, gerente, dono, administrador e outra rede.
- **Plataforma**: `lib/financeiro/painel.ts` (contrato e séries), `consulta.ts`, `registros.ts` (página e exportação lote a lote, até 20 mil linhas), `escopo.ts` (loja do turno primeiro; rede só com `venda.ver_todas`), `app/financeiro` (tela, `ConteudoFinanceiro.tsx`, `exportar/route.ts`, carregamento), menu e `/inicio`. Provas: `painel.test.ts` (11), `financeiro.test.ts` (8), `menu.test.ts`.
- **Pedido ao Codex:** conferir as escolhas de data (venda pela conclusão, cancelamento pela data dele, devolução e estorno pela data própria, tudo na loja da venda); o troco atribuído ao primeiro pagamento em dinheiro; se algum caminho soma o mesmo valor duas vezes (cancelamento × devolução é barrado por OR017); o desempenho do RLS nas somas grandes; os filtros embutidos do PostgREST (`vendas!inner`) no detalhamento; e se a comparação com o período anterior (mesma janela deslocada em dias inteiros) é a desejada.


## 10/11/2026 — Lote L2: lojas da rede (ORA-ORG-001, ORA-ORG-008)

Programa de execução integral (PR #67; checkpoint em `docs/alinhamento/EXECUCAO_INTEGRAL_STATUS.md`). Antes desta entrega as lojas só entravam por migration ou semente.

- **Banco** (`20261111132503_lojas_cadastro_e_configuracao.sql`, reversão com o mesmo nome; aplicada no `ora5g-dev` em 11/11 com md5 conferido): seis funções novas expostas — `lojas_da_rede()` (inclui as inativas, só para quem gere a rede), `loja_historico(loja)`, `loja_criar(...)` (repetição devolve a mesma loja, trava por organização e código), `loja_atualizar(...)` (nome, CNPJ, UF e cidade; código e tipo não mudam), `loja_definir_situacao(loja, ativa|inativa, motivo)` e `loja_definir_configuracao(loja, dados, vigente_desde, motivo)`; tabela `unidade_configuracoes` só de inclusão (telefone, endereço, inscrições e horário por dia, com vigência agora ou futura, nunca retroativa), RLS pela visibilidade da loja e auditoria automática. Permissão: `unidades.gerir` em vínculo de organização vigente (dono e administrador). Inativar exige a loja sem caixa aberto ou sem conferência, saldo, aparelho ou chip, reserva, transferência pendente, venda em aberto ou nota pendente (OR019, com a lista do que falta). Gatilho novo em `caixas`, `vendas`, `estoque_reservas`, `estoque_movimentos`, `itens_serializados` e `transferencias`: loja inativa não recebe nada novo, nem por escrita direta.
- **Provas**: `lojas.test.ts` (11: cadastro, normalização, idempotência, regras e CNPJ da raiz, permissões de vendedor/gerente/outra rede/administrador, edição auditada, vigência e histórico, só inclusão, RLS, inativação com pendências, bloqueio de movimento); inventário de autorização com as seis funções (48 → 54, 13 atacantes cada); `concorrencia.test.ts`: inativar × abrir caixa ao mesmo tempo nas duas ordens num PostgreSQL 17 real (nunca sobra caixa aberto em loja inativa); `migrations.test.ts` (ida e volta da reversão).
- **Plataforma**: tela `/lojas` (resumo, cadastro, edição, nova configuração com horário por dia e vigência, histórico de versões, inativar/reativar com o que falta resolver), `lib/lojas/regras.ts` (mesmas regras do banco antes de chamar; erros por catálogo, sem repetir texto do banco), `cnpjValido`/`formatarCnpj` no domínio, menu (Administração → Lojas, só com `unidades.gerir`), proxy e E2E do 307 sem login. Provas: `regras.test.ts` (12), `menu.test.ts`, `identificadores.test.ts`.
- **Pedido ao Codex:** conferir o protocolo de trava (inativar usa `for update` na loja, que espera o `for key share` de quem inclui; edição e configuração usam `for no key update`, sem travar vendas); se falta alguma pendência na inativação (ex.: algo do Connect ou da fila fiscal); se o gatilho de loja inativa pode atrapalhar algum fluxo legítimo (devolução de venda antiga, nota de venda já concluída — notas não foram travadas de propósito, pelo dever legal de emissão); e se `unidades.endereco` (texto livre da fundação, sem uso na aplicação) deve ser retirado numa migration futura em favor da configuração versionada.

## 10/11/2026 — Lote L3a: cadastro do catálogo (ORA-CAT-001, ORA-CAT-005)

- **Banco** (`20261111132621_catalogo_cadastro.sql`, reversão com o mesmo nome; aplicada no `ora5g-dev` em 11/11 com md5 conferido): permissão nova `catalogo.gerir` (dono e administrador); cinco funções — `catalogo_salvar_categoria`, `catalogo_salvar_marca`, `catalogo_salvar_produto` (chave do formulário em `produtos.chave_criacao` para não duplicar), `catalogo_salvar_variante` e `catalogo_definir_politica_desconto` (teto e margem mínima, P14, só com `preco.alterar`); auditoria automática em marcas, produtos e variações (categorias já tinha). Regras: nome único sem diferença de maiúsculas; tipo do produto fixo; SKU fixo depois de usado no livro, em reserva, em venda ou em item serializado; inativar exige estoque zerado e sem reserva (OR020); categoria só inativa sem produto ativo; produto inativo não ganha variação.
- **Provas**: `catalogo-cadastro.test.ts` (7), inventário de autorização (54 → 59), ida e volta da reversão; plataforma: `cadastro.test.ts` (7), `produtos.test.ts` (6, tela e ações com Supabase simulado), `menu.test.ts`.
- **Plataforma**: tela `/produtos` (busca no banco antes do limite, novo produto, variações, edição, categorias com política de desconto, marcas), menu "Cadastro de produtos" em Estoque e catálogo só com `catalogo.gerir`, proxy e E2E do 307.
- **Pedido ao Codex:** conferir se `catalogo.gerir` para dono e administrador está certo (o gerente continua só com fotos); se a política de desconto deve ficar com `preco.alterar` (hoje só o dono); se "SKU fixo depois de usado" cobre todos os usos (falta algum, como pedidos de transferência ou fotos?); e as travas por chave (categoria, marca, SKU e formulário) contra duplicação simultânea.

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

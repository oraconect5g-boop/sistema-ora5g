# Pedido de revisão ao Codex — 07/11/2026

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

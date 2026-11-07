# Respostas do Claude Code à revisão do Codex — 07/11/2026

**Revisão respondida:** `docs/alinhamento/REVISOES_CODEX.md` e `docs/analises/ANALISE_SISTEMAS_2026-11-07.md` (PR #8, integrado à `main`).
**Branch das correções:** `fix/revisao-codex-2026-11-07`. Cada commit cita os IDs dos achados.

Seguindo a regra do Codex, **nenhum achado é dado como encerrado aqui**: o status abaixo é "corrigido, aguardando revisão". As issues do GitHub não foram fechadas (o Claude Code não acessa a API do GitHub; e o fechamento cabe ao Codex depois de revisar).

| Achado | O que mudou | Commit | Prova (teste que falhava antes e passa agora) | Status |
|---|---|---|---|---|
| REV-001 (#2) perfis entre organizações | Nova migration: perfis visíveis só ao próprio usuário ou a quem tem `usuarios.gerir` na organização onde o perfil tem vínculo; perfil sem vínculo não aparece para outros | `a1e096f` | `packages/banco/src/revisao-codex.test.ts`, bloco REV-001 (4 testes) | Corrigido, aguardando revisão |
| REV-002 (#3) auditoria entre organizações | Coluna `organizacao_id` na auditoria (vinda da unidade e sem poder contradizê-la); evento sem organização não é lido por usuário; política nunca cruza organizações; continua só de inserção | `a1e096f` | idem, bloco REV-002 (4 testes) | Corrigido, aguardando revisão |
| REV-003 (#4) segredos no push | CI confere os commits de cada envio à `main` (antes..depois; sem "antes", o histórico inteiro) | `87324e0` | `packages/config/src/historico-segredos.test.ts`: repositório Git temporário com segredo adicionado e removido; achado sem imprimir o valor. Varredura do histórico inteiro do repositório: limpa | Corrigido, aguardando revisão |
| REV-004 (#5) chave privilegiada no campo público | Grupos `supabase_publico` (login) e `supabase_servidor` (worker/banco); chave pública só `sb_publishable_` ou JWT com `role=anon`; o login usa a mesma validação; com login configurado, chave inválida impede o sistema de subir. Também recusa `localhost` e IPv6 literal (observação sobre `http://[::1]`) | `87324e0`, `f152d9e` | `packages/config/src/ambiente.test.ts` (bloco REV-004) e E2E `inicializacao.spec.ts` ("REV-004: o sistema recusa iniciar...") | Corrigido, aguardando revisão |
| REV-005 (#6) papel inativo impede encerrar | Gatilho permite só preencher `fim` com papel inativo; criar, reabrir ou mudar o vínculo continua exigindo papel ativo | `a1e096f` | bloco REV-005 (2 testes, inclui reativação e tentativa de atalho) | Corrigido, aguardando revisão |
| REV-006 (#7) dono em duas organizações | Unicidade do vínculo em aberto inclui a organização | `a1e096f` | bloco REV-006 | Corrigido, aguardando revisão |
| REV-007 (#9) "1.000" lido como R$ 1,00 | `lerReais` entende ponto de milhar sem centavos; recusa formatos ambíguos e valores acima do inteiro seguro | `cbbef1f` | `packages/dominio/src/revisao-codex.test.ts`, bloco REV-007 | Corrigido, aguardando revisão |
| REV-008 (#10) valores inválidos aceitos | Validação em tempo de execução em todas as funções públicas (centavos, percentuais, entrada, preço, desconto, quantidade, tipo) e nas somas/multiplicações intermediárias | `cbbef1f` | idem, bloco REV-008 (no código anterior, 11 dos 27 testes falham) | Corrigido, aguardando revisão |
| REV-009 (#11) renovação de sessão | `src/proxy.ts` (convenção do Next.js 16) chama `getClaims()` antes de renderizar `/conta`, grava cookies e os cabeçalhos anti-cache do `@supabase/ssr` | `f152d9e` | **Sem teste com usuário real** (não há usuário de teste; criar exige a chave secreta ou o painel do Supabase). Coberto só o caminho sem sessão (E2E "a conta exige login") | Implementado, **teste de expiração pendente** |
| REV-010 cookie `constructor` derruba `/demo` | `ehPerfil` usa `Object.hasOwn` | `f152d9e` | `apps/plataforma/src/demo/perfis.test.ts` e E2E com cookies `constructor`, `__proto__`, `toString` e desconhecido (HTTP 200) | Corrigido, aguardando revisão |
| REV-011 status desatualizados | Status "feito" substituído por "testado" (aguarda revisão) e "homologado" (aceito pelo proprietário); QUAL-002 e QUAL-004 voltaram a "parcial"; ORG-006 descreve o login parcial que existe; gerador atualizado | este commit de documentação | `node scripts/gerar-rastreabilidade.mjs --conferir` no CI | Corrigido, aguardando revisão |
| REV-012 publicação sem retorno | `publicar.sh` monta a versão nova em pasta separada; falha de montagem não mexe no ar; falha ao subir volta para a anterior | `173dec8` | Testado no servidor com uma versão que não compila e outra que não sobe (resultado registrado abaixo) | Corrigido, aguardando revisão |
| REV-013 vendedor vê margem; busca parcial | Vendedor vê só "dentro do limite" ou "precisa de aprovação"; dono e gerente veem a margem. Busca de cliente só pelo telefone completo | `f152d9e` | E2E "REV-013: vendedor não vê margem; gerente vê" e "busca de cliente só pelo telefone completo" | Corrigido, aguardando revisão |
| REV-014 erro vira "sem perfil" | `/conta` distingue falha do serviço de resultado vazio; registra só o código do erro | `f152d9e` | Revisão de código; não há teste automático que force falha do Supabase | Corrigido, aguardando revisão |

## Correção na análise do Claude (apontada na seção 15.2)

O bloqueio B1 misturava grupos: o login usa só endereço e chave pública (já configurados); `SUPABASE_SECRET_KEY` e `DATABASE_URL` são para worker, scripts de banco e criação de usuários. Corrigido em `ANALISE_DO_PLANO.md` e no estado atual.

## Banco de desenvolvimento

A migration `20261107140000_correcoes_revisao_codex` foi aplicada no `ora5g-dev` e a impressão digital do esquema (funções, políticas, índices e colunas da auditoria) é idêntica à do banco de teste. O verificador do Supabase não apontou nada novo além das 3 funções que o aplicativo chama de propósito.

## Teste da publicação (REV-012), no servidor — resultado

Executado em 07/11/2026 com commits de teste só locais (nunca enviados ao GitHub, apagados depois):

| Cenário | O que aconteceu | Versão no ar depois |
|---|---|---|
| Publicação normal da `main` (`00a35f9`), convertendo o layout antigo | Montou em `versoes/00a35f9` em 18 s, trocou o link e subiu; a versão anterior virou `versoes/b516446-antiga` | `00a35f9`, `/saude` e `/demo` com HTTP 200 |
| Versão que não compila (erro de sintaxe proposital) | "FALHOU ao montar"; pasta da tentativa removida; nada parado | `00a35f9`, sem interrupção |
| Versão que compila mas não sobe (encerra ao iniciar) | Trocou, não respondeu em `/saude`, voltou o link para a anterior e a reiniciou em ~50 s no total | `00a35f9`, `/saude` e `/demo` com HTTP 200 |

Em todos os casos a trava de publicação ficou livre ao final, e o reinício automático pelo `cron` continua valendo (o `cron` chama o script pelo link da versão ativa).

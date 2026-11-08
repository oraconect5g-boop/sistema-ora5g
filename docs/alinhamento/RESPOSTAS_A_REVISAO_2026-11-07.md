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

---

# Resíduos da conferência de 07/11 e revisão incremental — respostas de 08/11/2026

**Revisões respondidas:** `CONFERENCIA_DAS_CORRECOES_2026-11-07.md` (quatro pendências) e `docs/analises/REVISAO_INCREMENTAL_2026-11-07_8e1625d.md` (REV-017 / #16 e notas documentais), integradas à `main` junto com esta branch, assim como `docs/analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md`.
**Branch:** `fix/residuos-codex-2026-11-07`, a partir da `main` `56ec9de`; recebeu a `main` `5560efa` (Ora Connect) e a branch do Codex (`73990bc`, `5f4dec7`). Cada commit cita o ID e a issue.

Pela mesma regra de antes, **nenhum achado é dado como encerrado aqui**: fechar as issues cabe ao Codex depois de revisar.

| Achado | O que mudou | Commit | Prova | Status |
|---|---|---|---|---|
| REV-008, resíduo (#10) | `limiteDeDesconto`: preço mínimo = teto de custo × 10000 / fator, em BigInt interno (entradas e saídas continuam `number`). `avaliarDesconto`: a margem resultante tinha o mesmo defeito e agora é piso exato; no extremo negativo fica em `Number.MIN_SAFE_INTEGER` | `cca1fcf` | `packages/dominio/src/revisao-codex.test.ts`, bloco "REV-008 (resíduo)": caso do Codex dá 10 (antes 11); cinco fatores com resto 1 dão 10 (antes 11); borda 10/11 na avaliação; margem 3332 (antes 3333); 2.000 casos sorteados conferem a definição em inteiros. Os 9 casos dirigidos falhavam no código anterior; o sorteio, sozinho, não pegava o defeito | Corrigido, aguardando revisão |
| REV-014 (sem issue) | Teste automático do erro de consulta em `/conta` | `4b8ce8f` | `apps/plataforma/src/app/conta/page.test.ts`: serviço Supabase **simulado** (fetch trocado, endereço `.invalid`, chave e token fictícios), passando pelas bibliotecas reais e pelo cookie de sessão. 503 PGRST002 depois das 3 novas tentativas do PostgREST, 403/42501 e serviço sem rede: "Não foi possível carregar seus dados agora" e um único log `{ perfil, unidades }` só com códigos, sem detalhe do serviço, id, e-mail ou token. Dois controles: sem perfil e com perfil. Sem a checagem de erro da página, ou com o erro inteiro no log, os 3 cenários de falha quebram | Teste incluído, aguardando revisão |
| CONFIG-001 (#12) | `apps/plataforma/README.md` (a única instrução com `aplicacao,supabase`) traz os três comandos atuais. **Sem apelido**, de propósito: o grupo antigo juntava chave secreta e banco ao par público e voltaria a exigir o grupo servidor para conferir o login. O `verificar-env` recusa `supabase` explicando qual grupo usar (código 2); a leitura dos nomes usa `Object.hasOwn` | `4b17905` | `ambiente.test.ts` (bloco CONFIG-001); `verificar-env.test.ts` roda o comando de verdade com `.env` fictício (login passa sem chave secreta nem banco; nome antigo orientado; nenhum valor impresso); E2E "CONFIG-001: com só o par público, o sistema sobe e oferece o login, sem chave secreta nem banco" | Corrigido, aguardando revisão |
| REV-016 (#14) | Versão = `versoes/<commit>-<12 primeiros caracteres do sha256 do arquivo de ambiente>`; hash e cópia saem do mesmo retrato do arquivo. Mudou o arquivo, monta de novo (inclui `NEXT_PUBLIC_*`). Reaproveita só a mesma combinação (conferida com `cmp`); se ela já está no ar, não reinicia. Build e `next start` com `env -i`. `ORA_HML_BASE` e `ORA_HML_PORTA` (sempre juntas) para teste isolado | `33d5e6e`, `cd0975e` (LEIA-ME) | Teste no servidor em pasta e porta separadas, na tabela abaixo | Corrigido, aguardando revisão |
| REV-017 (#16) | `/entrar` só mostra aviso para chave **própria** do catálogo e só para texto simples (`textoDoParametro`, `chaveDoCatalogo` em `src/lib/parametros.ts`). Varredura: rotas, cookies e filtros da demo já usavam `Object.hasOwn` ou comparação exata; o `voltar` da troca de loja só aceita caminhos da demo. Achado da mesma família: com `busca` repetida, Produtos, Clientes, Vendas e Estoque caíam em "Algo deu errado nesta tela" (`.trim()` numa lista; HTTP 200 porque a página já estava sendo enviada). Corrigido com os mesmos auxiliares | `fceb372` | `parametros.test.ts` (11 casos). E2E no celular e no computador: `constructor`, `__proto__`, `toString`, `hasOwnProperty`, `valueOf`, código desconhecido e repetido dão 200, título "Bem-vindo à Ora" e nenhum aviso a mais; os três códigos válidos continuam com a mensagem neutra; sete telas da demo com parâmetros repetidos ou herdados abrem sem tela de erro. Na build da `main` `56ec9de`, as mesmas URLs davam 500 em `/entrar` e a tela de erro nas quatro telas | Corrigido, aguardando revisão |
| REV-015 (#13) | Já corrigido no novo visual: o PDV só soma itens válidos (`validos`, `temErros`) e bloqueia a conclusão | `d878e06`, na `main` desde `56ec9de` | E2E "REV-015: desconto maior que o item mostra o erro, mantém o carrinho e a venda se recupera" (`apps/plataforma/e2e/demonstracao.spec.ts`), no celular e no computador, com formatos intermediários e malformados. A revisão incremental do Codex examinou `8e1625d`, anterior a essa correção; a auditoria do Codex em `56ec9de` confirmou e encerrou a #13 | Corrigido; confirmado pelo Codex |

Notas documentais da revisão incremental: `deploy/homologacao/LEIA-ME.md` descreve "Index of /" como a situação **anterior** (desde 07/11 o domínio principal mostra a plataforma); `docs/ESTADO_ATUAL_E_PASSAGEM.md` teve a fila de revisão atualizada (sete issues encerradas pelo Codex e a #13; o que está aguardando revisão; #17 e #18 ainda não tratadas) e o trecho antigo do DNS reconciliado com a P12.

## Teste da publicação (REV-016), em pasta e porta separadas — resultado

Executado em 08/11/2026 em `~/teste-publicacao` (clone próprio, porta `3190`), com três arquivos de ambiente **fictícios** e o commit `33d5e6e` desta branch. Só foram exibidos códigos HTTP, nomes de pasta e "igual/diferente"; nenhum valor.

| # | Cenário | O que aconteceu | Versão no ar depois |
|---|---|---|---|
| 0 | Só uma das variáveis de teste (pasta ou porta) | Recusado antes de qualquer ação (código 1) | — |
| 1 | Configuração A | Montou em 16 s; `/demo` 200 | `33d5e6e-aa0502330cf1` (A) |
| 2 | **Mesmo commit**, configuração B (`APP_ENV` diferente) | Montou de novo, com BUILD_ID novo, em 17 s; `/demo` 404: a configuração nova chegou ao app. É o caso da #14 | `33d5e6e-26b1efbf6adf` (B) |
| 3 | Mesmo commit e mesma B | "Já está no ar; nada a fazer", sem reiniciar (mesmo processo) | B |
| 4 | Mesmo commit, de volta à A, com `APP_ENV=producao` exportado no terminal | Reaproveitou a pasta A sem montar (1 s, mesma build); `/demo` 200: o terminal não passou por cima do arquivo | A |
| 5 | Mesmo commit, configuração C (`APP_ENV` inválido) | Compilou, não subiu e **voltou sozinho para A** em 49 s; ambiente da versão ativa idêntico ao arquivo A | A |
| 6 | Commit local que não compila (nunca enviado), configuração A | "FALHOU ao montar" em 12 s; mesma versão e mesmo processo no ar; pasta da tentativa removida | A |

A homologação real (`3100`) não foi usada. Durante o teste, às 09:41, ela foi republicada por outra sessão (merge `5560efa` da Ora Connect, ainda com o `publicar.sh` anterior), o que a verificação do teste registrou; não houve ação deste teste sobre ela. O servidor de teste foi encerrado; a pasta `~/teste-publicacao` (3,4 GB, só dados fictícios) fica para o proprietário apagar.

A próxima publicação deve usar o script novo: até lá, `~/homologacao/plataforma/deploy/homologacao/publicar.sh` ainda é o da versão no ar. Rodar `bash deploy/homologacao/publicar.sh` a partir do repositório com a `main` atualizada.

## Sequência do CI antes do merge (08/11/2026)

Rodada num clone limpo da branch no commit `ccfcfd4` (sem `.env.local`, sem caches de build), na raiz, com `APP_ENV=development` e `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100`, na ordem do `.github/workflows/ci.yml` da `main`:

| Passo | Resultado |
|---|---|
| `npm run segredos` e `npm run segredos -- --historico 5560efa..HEAD` | Nenhum segredo encontrado |
| `node scripts/gerar-rastreabilidade.mjs --conferir` e `node scripts/gerar-catalogo-nogle.mjs --conferir` | Em dia (172 requisitos; 62 funções da Nogle) |
| `npm ci`, `npm run lint`, `npm run typecheck` | Passaram (só o aviso conhecido "Pages directory" nos pacotes sem Next) |
| `npm test` | 261 passaram: plataforma 82, banco 44 (mais 4 `todo`), configuração 53, domínio 82 |
| `npm run build` | Passou |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| `npm run test:e2e` | 104 passaram e 10 foram pulados de propósito: 4 de login real (sem Supabase configurado, como no GitHub), 4 de inicialização no celular ("basta rodar uma vez") e 2 por tamanho de tela (CSV no celular, menu "Mais" no computador) |

O commit seguinte só acrescenta esta tabela (documentação); nele foram repetidos o detector de segredos e as conferências de rastreabilidade e do catálogo. A homologação **não foi republicada**: o `ora5g.com.br` segue com a versão `5560efa` publicada por outra sessão; o REV-017 e a busca repetida só chegam ao endereço público numa próxima publicação, quando o proprietário pedir.

# Merges, duplicidades e versões antigas — 09/11/2026

> **Corte histórico inicial 371cef0.** O lote posterior 9b1109e elevou a análise para 149 commits,43 merges e81 árvores. Novas resoluções de navegação/SSR preservam /estoque,/connect,/notas. [Conclusão atual, novo erro de integração do filtro de segredos e evidências](REVISAO_NOGLE_9B1109_E_CONSOLIDADO_2026-11-09.md).

**Base fixada:** main `371cef0c02affad30f6fe2ebd1468cbcec67009f`. **Revisor:** Codex. Escopo solicitado pelo proprietário: procurar versões anteriores que continuem ativas, duplicação e regressões de integração, preservando a stack.

## Resultado

Foram examinados **130 commits alcançáveis, 35 merges e 68 árvores Git**, incluindo os ancestrais necessários à comparação. A primeira linha da main tem 25 merges. **Não foi comprovada resolução de merge que tenha reintroduzido código operacional removido neste corte.** Há duplicação de regras entre camadas que já produziu divergência de comportamento (#48), e há manutenção/documentação que precisa acompanhar a migração da demonstração para a integração real da Nogle (#54).

A distinção é necessária para corrigir a causa: um defeito presente numa feature e transportado intacto pelo merge não prova erro na resolução do merge. Tampouco a existência de um arquivo histórico significa que ele continua executando.

## 1. O que foi comparado

- Árvores de cada merge e de seus dois pais, pelo SHA do blob de cada arquivo. Procurados conteúdos que não existiam em nenhum dos pais, caminhos removidos que reapareceram e arquivos antigos mantidos junto aos substitutos.
- Base comum calculada no DAG completo: 34 merges têm uma base única e foram examinados para remoção preservada incorretamente. O merge documental `5f4dec7079` tem duas melhores bases comuns (criss-cross); foi tratado separadamente, sem presumir uma base única.
- 329 arquivos versionados na árvore atual: inventário de hashes, fontes, SQL e scripts; nomes indicativos de cópia/backup; módulos arquivo e diretório com o mesmo nome; marcadores de conflito em código.
- Grafo de imports relativos estáticos e imports dinâmicos literais em **118 arquivos TypeScript da aplicação**, partindo de **17 entradas reais** de página/layout/handler; inspeção de corpos idênticos de funções com ao menos 200 caracteres de tokens, desconsiderando comentários/espaços.
- Banco local descartável reconstruído com as **11 migrations**: funções, índices, policies e triggers ativos. Nenhum schema remoto foi modificado.

Limites: hashes e grafo não demonstram equivalência semântica de algoritmos diferentes, nem cobrem import com caminho calculado em runtime. Não houve inspeção de crontab, processos ou arquivos da VPS; arquivos legados no servidor não podem ser declarados removidos apenas pelo Git. A análise cobre o SHA fixado, não commits futuros ou branches não alcançáveis.

## 2. Resultado dos merges

Os conteúdos diferentes de ambos os pais ocorreram em cinco merges: quatro ajustaram documentação de revisão e um ajustou `apps/plataforma/e2e/demonstracao.spec.ts` (`f72f52103b`). Não foi encontrado arquivo operacional nessa classe de resolução. O E2E continua presente e a suíte correspondente passou no CI da revisão anterior.

Nos 34 merges com base comum única, **nenhum caminho removido por um dos lados foi mantido no resultado**. O caso documental com duas bases não alterou aplicação, SQL ou deploy em relação ao segundo pai.

Casos de substituição conferidos:

| Antes | Estado na main fixada | Conclusão |
|---|---|---|
| `src/demo/dados.ts` monolítico | Removido; permanece `src/demo/dados/index.ts` e módulos separados | Não há arquivo antigo sombreando o diretório por resolução de import |
| `20261109010000_fotos_dos_produtos.sql` | Não existe em migrations nem reversão | A renomeação para a versão aplicada `20261108204536` não deixou duas migrations de fotos |
| Funções SQL reescritas nas correções | 94 declarações históricas, 83 funções atuais e 11 nomes substituídos | `CREATE OR REPLACE` substitui a mesma identidade; não há sobrecarga ativa mantendo assinatura antiga neste corte |
| `proxy.ts` SSR | Uma entrada de proxy; nenhum middleware concorrente encontrado | Não foi demonstrada dupla execução por arquivo antigo |
| PR #33 | Na comparação com main 371cef0, somente documentação e dois testes permanentes | A revisão não recolocou código operacional antigo no produto |

Não excluir migrations aplicadas para “limpar duplicidade”. O histórico é necessário para reconstrução, auditoria e reversão local. Correções de objetos ativos entram por migration incremental.

## 3. Cópias e convivências atuais

| Ocorrência | Avaliação | Ação |
|---|---|---|
| Templates `.github/` e `templates/` idênticos | Duas cópias de issue e PR; manutenção pode divergir | Definir `.github` como entrada usada pelo GitHub e tratar `templates` como cópia documental; se mantidas, conferir igualdade ou gerar uma da outra |
| Quatro wrappers ESLint, três configs Vitest e dois tsconfigs idênticos | Entradas locais de workspaces diferentes que apontam para configuração compartilhada | Preservar os pontos de entrada; não apagar arquivos necessários ao workspace por hash igual |
| `/demo/*` e rotas reais | Namespaces distintos; não foram encontradas entradas reais que alcancem dados demo pelo grafo analisado | Preservar separação, aviso e bloqueio da demo em produção; migrar recursos reais por contrato, sem copiar estado fictício |
| `AppShell`/`SemPermissao` importam módulos demo | Componentes usados pelas páginas demo, embora estejam em `componentes/` | Não considerá-los vazamento apenas pelo diretório compartilhado. Revalidar o grafo antes de reutilizá-los nas telas reais |
| Pagamento em TypeScript e SQL | Implementações independentes necessárias a prévia e validação autoritativa, já divergentes em #48 | Adicionar testes de paridade com os mesmos vetores e resultado esperado independente; corrigir SQL/domínio conforme DEC-U38 |
| Desconto “só dono abaixo do custo” na demo versus gerente/dono no ADR-004 | Divergência visual/política já registrada, sem decisão normativa localizada impondo exclusividade | Resolver P14 e alinhar mensagens, autorização e testes; não atribuir à resolução do merge sem prova |
| Catálogo Nogle gerado e coleção de origem | Artefato derivado com verificação `--conferir` no CI | Manter origem e geração canônicas; não editar somente o catálogo nem criar outro cliente/registro oficial paralelo |

Não foram encontrados corpos de função idênticos acima do limiar nas fontes da aplicação. Isso não exclui duplicações menores ou semanticamente equivalentes, especialmente entre TypeScript e SQL.

## 4. Banco após a sequência completa

Inventário local: **144 índices, 83 funções, 30 triggers e 32 policies** nos schemas analisados. Esses totais incluem objetos automáticos de constraints e funções privadas; não são contagem de funcionalidades concluídas.

- Sem versões ou conteúdo SQL de migrations duplicados; sem duas assinaturas ativas com o mesmo nome de função nos schemas `public`/`privado`.
- Sem duas policies para o mesmo comando/tabela nos schemas examinados. Isso não certifica os predicates: #45 continua um defeito real numa policy única.
- Sem índices exatamente equivalentes nas colunas, ordem, método, opclasses, collation, expressões e predicate analisados. Constraints e índices parciais têm significado próprio.
- Três pares de triggers chamam a mesma função em eventos diferentes: UPDATE/DELETE versus TRUNCATE, nos livros de auditoria, estoque e caixa. São proteções complementares; não demonstram evento contado duas vezes.
- Fotos têm índices `(organizacao_id, produto_id)` e `(produto_id, organizacao_id)`. Ambos cobrem a igualdade das duas colunas, mas a ordem pode atender consultas diferentes. É **candidato a avaliação de redundância**, não autorização para remover um deles. Conferir planos e carga de consultas reais antes de decidir. Índice “sem uso” em banco vazio também não autoriza remoção.

O teste de inventário local passou. As fontes e resultados sanitizados estão na [pasta de evidências](evidencias/2026-11-09-merges-e-nogle/LEIA-ME.md).

## 5. O que o CI atual detecta e o que falta

O [CI 42539981785](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42539981785) passou no head de revisão `2bd58249`, merge temporário `01be16f06eb70227aa2b1134c48e10fb39570fd1` com main 371cef0: 429 testes, quatro TODO; 176 E2E, dez pulados. Inclui build, lint, tipos, scanner de segredos, registro/MD5/ordem das migrations, reversões locais e catálogo Nogle gerado.

Esses checks detectam várias colisões de rotas/tipos/objetos e regressões cobertas. Não garantem ausência de duplicação semântica, regra divergente entre SQL e TypeScript, duas cobranças externas, replay após timeout ou job legado no servidor. Os casos adversariais #45–#53 e a integração Nogle ausente #54 não ficam resolvidos por esse CI verde.

## 6. Regra para os próximos merges e remoções

1. Antes do merge, registrar SHA/base, tarefa/requisito, arquivos canônicos e quais módulos/assinaturas/rotas serão substituídos. Identificar chamadas e jobs antigos que continuarão apontando ao anterior.
2. Comparar com os dois pais e a base comum; inspecionar resolução de conflito e renomeação. Mudar assinatura de RPC exige revisar overload antigo, defaults, GRANT, clientes gerados e referências.
3. Portar as correções relevantes do antigo ao novo e provar paridade por contrato. UI antiga e nova não podem gravar o mesmo fato por caminhos independentes sem chave de deduplicação compartilhada.
4. Remover referências e o código obsoleto apenas depois da substituição provada; preservar histórico Git e migrations aplicadas. Registrar descontinuação, dependências e reversão. Não guardar `arquivo_old.ts` dentro de diretório executável como estratégia de rollback.
5. Executar o CI sobre o **resultado integrado**, identificando o checkout efetivo; testar negativas, repetição e concorrência. Código gerado e documentação de estado precisam acompanhar o schema e os módulos novos.
6. Claude deve conferir na homologação autorizada a versão ativa, symlink, jobs e crontab, sem publicar valores de ambiente. Um agendamento antigo não desaparece com `git merge`; manter uma rotina canônica e locks apropriados. Preservar versões de rollback referenciadas, sem múltiplos serviços consumindo a mesma fila indevidamente.
7. Para Ora Connect, implementar um único adaptador e fluxo persistente oficial da Nogle; todos os caminhos de ativação/cobrança/recorrência devem convergir para esse contrato. [Prioridade e aceite Nogle](PRIORIDADE_NOGLE_GATEWAY_E_REPASSES_2026-11-09.md), issue #54.

## 7. Inventário dos 35 merges

| Merge | Pais | Base(s) comum(ns) | Conteúdo distinto dos dois pais |
|---|---|---|---|
| `371cef0c02af` | `aebbdcc82b3f` / `a5092a8338a5` | `aebbdcc82b3f` | nenhum |
| `aebbdcc82b3f` | `55d10afec95a` / `ce7b446bf61a` | `55d10afec95a` | nenhum |
| `0bc564e9fbf1` | `817c0cc70458` / `55d10afec95a` | `ee2de080af1e` | nenhum |
| `55d10afec95a` | `fefcc51f54a6` / `ee2de080af1e` | `fefcc51f54a6` | nenhum |
| `24d6f782bcbf` | `a5f726631048` / `ee2de080af1e` | `f55269a6d79a` | nenhum |
| `fefcc51f54a6` | `7f5fd413eee7` / `283532cdf696` | `7f5fd413eee7` | nenhum |
| `598fcd29bb3e` | `7f5fd413eee7` / `f472635b8536` | `7f5fd413eee7` | nenhum |
| `7f5fd413eee7` | `0a19c713ffa7` / `cb7bfe9fc408` | `0a19c713ffa7` | nenhum |
| `0a19c713ffa7` | `5560efa13c82` / `5775f60fb3ce` | `5560efa13c82` | nenhum |
| `68897191f267` | `f72f52103b61` / `5f4dec7079b5` | `56ec9dec83e2` | nenhum |
| `f72f52103b61` | `cd0975e06b08` / `5560efa13c82` | `56ec9dec83e2` | `apps/plataforma/e2e/demonstracao.spec.ts` |
| `5560efa13c82` | `56ec9dec83e2` / `ff67f14ee8b9` | `56ec9dec83e2` | nenhum |
| `5f4dec7079b5` | `73990bcc676e` / `56ec9dec83e2` | `5b98ade0e713` / `8e1625ddff5d` | `docs/alinhamento/REVISOES_CODEX.md`; `docs/analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md` |
| `56ec9dec83e2` | `8e1625ddff5d` / `78fcccef1576` | `8e1625ddff5d` | nenhum |
| `78fcccef1576` | `34e738ac24da` / `5b98ade0e713` | `503fa54170c9` | nenhum |
| `73990bcc676e` | `5b98ade0e713` / `8e1625ddff5d` | `503fa54170c9` | `docs/alinhamento/REVISOES_CODEX.md`; `docs/analises/REVISAO_INCREMENTAL_2026-11-07_8e1625d.md` |
| `8e1625ddff5d` | `0afc87dea44a` / `bb14add66439` | `0afc87dea44a` | nenhum |
| `0afc87dea44a` | `4509f15bb762` / `fbabeb960985` | `4509f15bb762` | nenhum |
| `4509f15bb762` | `5ccbaa2c6520` / `021bdc730508` | `5ccbaa2c6520` | nenhum |
| `5ccbaa2c6520` | `145235a2b2bf` / `0ab7ad718d8f` | `145235a2b2bf` | nenhum |
| `145235a2b2bf` | `503fa54170c9` / `6fc3102c253f` | `503fa54170c9` | nenhum |
| `138248e34ed9` | `02fc0ca4bfbb` / `503fa54170c9` | `00a35f970d97` | `docs/alinhamento/CONFERENCIA_DAS_CORRECOES_2026-11-07.md`; `docs/alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md` |
| `503fa54170c9` | `00a35f970d97` / `0bdb47fdf864` | `00a35f970d97` | nenhum |
| `00a35f970d97` | `efdeee1ef792` / `6850b20a1719` | `efdeee1ef792` | nenhum |
| `efdeee1ef792` | `b516446877ea` / `173fd5c18ad4` | `a152516dd265` | nenhum |
| `173fd5c18ad4` | `2c30ac1cbd8f` / `a152516dd265` | `17524a5da688` | `docs/alinhamento/REVISOES_CODEX.md`; `docs/analises/ANALISE_SISTEMAS_2026-11-07.md` |
| `b516446877ea` | `a152516dd265` / `3c950eda73a1` | `a152516dd265` | nenhum |
| `a152516dd265` | `9f456063ec81` / `7430b7aa8a6c` | `9f456063ec81` | nenhum |
| `9f456063ec81` | `bc7e628b7564` / `1b20bdde3d79` | `bc7e628b7564` | nenhum |
| `bc7e628b7564` | `17524a5da688` / `d0616c8e5319` | `17524a5da688` | nenhum |
| `17524a5da688` | `4df896250c24` / `43665ea042ab` | `4df896250c24` | nenhum |
| `4df896250c24` | `373ddbeb37b3` / `eb3710d9ab1e` | `373ddbeb37b3` | nenhum |
| `373ddbeb37b3` | `b467e62bb933` / `85adb9229326` | `b467e62bb933` | nenhum |
| `b467e62bb933` | `af1b75d31de4` / `21f4f7c62083` | `297b1f25bea7` | nenhum |
| `af1b75d31de4` | `297b1f25bea7` / `e4d386fffb0f` | `297b1f25bea7` | nenhum |

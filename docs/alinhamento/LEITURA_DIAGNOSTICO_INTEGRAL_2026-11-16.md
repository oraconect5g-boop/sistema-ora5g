# Leitura do diagnóstico integral de 16/11/2026

**Pacote:** branch `docs/diagnostico-integral-supabase-20261116`, commit `398dfa0`, pasta `docs/analises/diagnostico-integral-2026-11-16/`, sobre a `main` em `5468d9e`. **Quem leu:** Claude Code, em 16/11/2026, a partir do prompt do proprietário (o mesmo texto de `PROMPT_CLAUDE.md` do pacote). O pacote não foi trazido para a `main` por merge: este registro diz o que foi lido e o que foi adotado, como pede o prompt.

## 1. O que foi lido por inteiro

| Documento | Onde | Observação |
|---|---|---|
| `LEIA-ME.md`, `PROMPT_CLAUDE.md`, `RELATORIO_INTEGRAL.md`, `SUPABASE_E_PUBLICACAO.md`, `SOLUCOES_PARA_AVALIACAO.md`, `evidencias/RESUMO.md` | pacote (`398dfa0`) | `SOLUCOES_PARA_AVALIACAO.md` lido como proposta para avaliação: nenhum código dele foi copiado; as correções saíram do código existente e dos aceites |
| `CONTINUACAO_REVISAO_2026-11-15.md`, `PUBLICACAO_DOMINIO_2026-11-15.md`, `PRIORIDADES_BASE_REAL_E_APIS_FINANCEIRAS_2026-11-14.md` | PR #97 (`a7ff0f5`) | as prioridades de 14/11 continuam valendo (ordem 0: #87, #88, #96 e o CI #95) |
| As provas `provas.test.ts` (#87 e #88), `cache-sino.test.ts` (#96), `concorrencia-fotos.test.ts` (#98) e `verificador-publicacao.test.ts` (#99) | PR #97 (`a7ff0f5`) | viraram regressões do comportamento certo no lote INTEG-a (as de #98 e #95 vão no INTEG-b) |
| `docs/cadastros/LOJAS_CONFIRMADAS_2026-11-09.json` | `main` | as 11 lojas e DEFEITOS, com as quantidades da imagem como referência histórica (não carga) |

As issues #87, #88, #95, #96, #98 e #99 não puderam ser abertas: o conector do GitHub desta sessão não alcança o repositório privado e o `gh` não está instalado no servidor. Valeram as descrições do relatório integral e as provas versionadas.

## 2. O que foi conferido por programa, sem leitura linha a linha

- **`FONTES_COMPLETAS.md`:** as 88 versões dos 9 PRs de documentação foram abertas pelo SHA fixo do índice (todas existem no repositório) e comparadas com a `main`: **16 iguais à `main`** (nada a reler), **25 diferentes** de um arquivo que existe na `main` e **47 só no PR**. As 72 que não são iguais somam cerca de 2,3 MB.
- **`MATRIZ_179.md` (341 KB) e `INVENTARIO_ARQUIVOS_E_FUNCOES.md` (312 KB):** consultados por ID e por nome de função à medida que cada lote os toca; não foram lidos de ponta a ponta nesta sessão.

## 3. O que ainda falta ler por inteiro (e quando)

| Fonte | Tamanho | Quando |
|---|---:|---|
| `MATRIZ_179.md` (todos os IDs) | 341 KB | por domínio, no lote que tocar cada um; a entrega final pede o relatório por todos os 179 |
| `INVENTARIO_ARQUIVOS_E_FUNCOES.md` | 312 KB | por diretório, quando o lote mexer nele |
| PR #97: `MATRIZ_EXECUCAO_PROMPT_86_179`, `MATRIZ_CONTINUACAO_179`, `VERIFICACAO_EXECUCAO_PROMPT_86`, `evidencias/2026-11-14-execucao-prompt/INVENTARIO.md` e as versões do PR de `ESTADO_ATUAL_E_PASSAGEM.md`, `REVISOES_CODEX.md`, `deploy/homologacao/LEIA-ME.md`, `APIS_E_HABILITACOES_NECESSARIAS.md` e `VARIAVEIS_DE_AMBIENTE.md` | cerca de 450 KB | antes dos lotes de base operacional, parceiros e WhatsApp |
| PR #86 (`568ad2d`) | 232 KB | lido em 14/11 (registrado em `execucao-integral-status.json`, `base.pacote_conclusao`); reler só o que mudou desde então |
| PR #85, #81, #77, #68, #66, #67 e #33 | cerca de 1,6 MB | por tema, conferindo contra a `main` (muitos são versões antigas de arquivos vivos) |

Não se fez merge de nenhum PR documental antigo.

## 4. Decisões em conflito, conciliadas

| Tema | Antes | Agora (vale) | Onde ficou |
|---|---|---|---|
| E-mail na PayJoy | DEC-U30: obrigatório na PayJoy | Sempre opcional (proprietário, 12/11, #76; prioridades de 14/11, item 9). Exigência de parceiro só com o contrato dele comprovado, no adaptador e só na operação dele | INTEG-a: domínio, PDV, demonstração e `concluir_venda` (migration nova) |
| Arquivo da Rein | "não recebido" | Entregue (`relatorioProdutos131258.xlsx`, posição de 10/11 às 13:20, SHA-256 `76f9cf33…6c06`); **não está neste servidor** (procurado em 16/11): falta só a transferência segura para o ambiente do programador | Pendência do lote da planilha |
| Contas de teste | "aguardar autorização" | Autorizadas (prompt de 16/11): criar dono, gerente e vendedor de teste, sem e-mail de terceiro inventado | Lote da base operacional |
| Publicação | autorização "a cada vez" | Publicar cada lote na homologação sem pedir de novo, com a migration do lote antes; produção segue o aceite das regras locais | Memória do projeto e este lote |
| Gráficos | "26 usos" / "3 gráficos" | Contagem atual de 43 usos fora da demo (estática, não indicadores validados) | Matriz demo/real no lote de financeiro e gráficos |
| Ordem de serviço | "não iniciado" | Implementada (OS, custódia, orçamento, peças, cobrança e relatórios) | Status dos IDs da assistência |
| Incentivo | comissão por venda | Bônus por meta mensal (D-014) | Mantido |

## 5. O que o prompt pede e ainda não começou

Na ordem do relatório integral (o INTEG-a e o INTEG-b já fecharam #87, #88, #96, #99, a PayJoy, #98 e #95, esta com a migration esperando o sim do proprietário): a integração GitHub × Supabase em `packages/banco` (o diretório de trabalho e o `config.toml`, sem segunda árvore de migrations e sem reset); as 11 lojas, DEFEITOS e as três contas de teste; a planilha inteira com a carga de estoque por local; a transferência de vários produtos; a jornada real autenticada; Nogle, PayJoy e Aiva por API; fiscal e WhatsApp oficiais; e o restante dos 179. Cada um com a lista exata do que depende de terceiros.

**Integração GitHub × Supabase (lida em 16/11 na documentação oficial):** com "Deploy to production" ligado, a integração aplica as migrations novas, as Edge Functions e os buckets declarados no `config.toml`, e ignora Auth, API e seed. O diretório de trabalho deve ser `packages/banco` (o pai de `supabase/`). Um `config.toml` mínimo, sem buckets declarados (eles nascem nas migrations), não muda o login nem as URLs. Como as migrations são aplicadas antes do merge e renomeadas para a versão gravada, a integração não terá o que reaplicar; trocar o diretório de trabalho no painel é do proprietário.

**A integração já está ligada (16/11, 07:34):** no merge do INTEG-b na `main`, ela aplicou sozinha no `ora5g-dev` a migration nova `20261116130100_importacao_estatisticas` (versão igual ao nome do arquivo, sem usuário e o texto dividido em 4 comandos). Ou seja, ela já lê `packages/banco/supabase/migrations`. Daqui em diante, migration que chega à `main` é aplicada no `ora5g-dev`; o processo continua aplicando antes do merge e gravando a versão no nome do arquivo, e a integração não reaplica o que já está no histórico.

# Evidências da revisão do prompt #86

**Base final:** `56c4bde003e719f3ea902c3335f7526b6d1f6a67`. **Corte:** 15/11/2026 02:27 UTC. Banco consultado às 02:11 UTC.
O nome da pasta usa a data do início da revisão, 14/11. Arquivos com sufixo f55856e são evidências do primeiro corte e não devem ser confundidos com a base atual.

## Arquivos e significado

- `verificacoes.json`: SHA, testes atuais, CI, contagem dos requisitos e limites.
- `publicacao.json`: HTTP público e versão no rodapé. 307 para login não é jornada autenticada.
- `supabase-contagens.json`: contagens e nomes de unidades, somente leitura; sem contas, segredos ou clientes.
- `migrations-conferidas.json`: 72 versões e hashes locais/remotos. Uma diferença apenas de quebra final, já identificada.
- `planilha-estrutura.json`: estrutura da planilha fornecida e identificação do arquivo; sem publicar o arquivo original ou seus valores comerciais.
- `delta.json`: 80 commits/217 arquivos entre a base do prompt e a base atual.
- `fontes-versionadas.json` e `INVENTARIO.md`: inventário dos 902 arquivos, 185 diretórios e 114 Markdown; não são uma alegação de revisão manual exaustiva de cada linha.
- `provas.test.ts` e `resultados.jsonl`: REV-PROMPT-001 e 002, com todos os esquemas aplicados em banco PGlite descartável.
- `cache-sino.test.ts` e `resultados-cache.jsonl`: REV-PROMPT-003; reprodução do contrato de memória do sino. Não equivale a E2E com usuário real.
- `vitest.config.mjs`: configuração isolada; os testes observacionais não entram automaticamente nas suítes normais.

## Como interpretar os testes

**Estas provas passam quando o defeito existe.** Não são aprovação do sistema. Após corrigir, transformá-las em regressões que exijam o comportamento correto. Foram três provas positivas do defeito reexecutadas em `9495691`; as funções afetadas permanecem inalteradas em `56c4bde`, sem chamada externa ou alteração de dados reais.

Executar em checkout descartável do SHA acima, com Node 22 e dependências do lockfile, copiando esta pasta para o mesmo caminho relativo. Sem .env de servidor:

```bash
npm ci
npx vitest run --config docs/analises/evidencias/2026-11-14-execucao-prompt/vitest.config.mjs
```

As provas fiscais usam apenas fixtures sintéticas do próprio repositório, PostgreSQL em memória e operações locais; não enviam WhatsApp. A prova do sino confirma reuso de memória por unidade, sem identidade. A inspeção de SinoDePendencias.tsx e do logout completa o caminho; a jornada autenticada deve ser adicionada pelo programador à correção.

## Suítes selecionadas no corte 3e198a6

Banco (54 testes, oito arquivos): ordem-de-servico, anexos-da-venda, cancelamento-da-nota, conciliacao-fiscal, estoque-valor, regioes, codigos-de-outros-canais e transferencias.

Plataforma (103 testes, doze arquivos): app/assistencia/assistencia; lib/assistencia/relatorio; app/vendas/documentos-da-venda, cancelamento-da-nota e conserto-da-os; app/notas/conciliacao/conciliacao; app/operacao/operacao; app/lojas/lojas; app/produtos/produtos; app/resultado/resultado; app/estoque/painel; app/clientes/clientes. Nomes referem-se a arquivos .test.ts sob src.

Os 381 testes selecionados do corte inicial f55856e estão registrados separadamente. Não somá-los aos atuais como se fossem uma única execução do mesmo SHA.

## Atualização posterior dos testes

Em `9495691`, 23 testes selecionados de busca/produtos passaram e os três defeitos foram reproduzidos novamente. Em `56c4bde`, dez testes de regras de venda passaram. Arquivo `publicacao-final.json` registra o site no SHA final. Não somar execuções de diferentes bases como uma única suíte.

## CI exato de 3e198a6

Run: https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43657640844
Job: 132639724873. Lint e typecheck verdes. Testes: 2.012 verdes, um falhou e um TODO.

Falha: `packages/banco/src/concorrencia.test.ts:977`, cenário “prévia, comparação refeita, aplicação e desfazer de 2.000 linhas cabem, cada chamada, em 8 s”. Resultado: “aplicação de outras 2.000 a criar”, 8.354 ms. Build, auditoria e E2E foram pulados.

O log completo não é publicado aqui. A issue #95 registra o diagnóstico delimitado: não há prova de corrupção nem de timeout efetivo no Supabase; falta margem no orçamento do teste e o pipeline não concluiu.

## Limites

Sem servidor, .env, login real, carga/alteração no Supabase, deploy, merge, mensagem a cliente ou operação Nogle/financeira. A consulta remota foi somente leitura. A base da homologação foi identificada pelo conector/projeto e pela documentação; dados de acesso não são publicados.

O link privado de projeto ChatGPT não expõe suas outras conversas. Referências de planejamento vêm do conteúdo disponível nesta conversa e no GitHub, incluindo os pacotes das PRs anteriores.



## CI das bases posteriores

A run 43666989923, de `9495691`, foi cancelada. A run 43667800641, de `56c4bde`, estava em execução no fechamento da análise; não foi declarada aprovada. Verificar a conclusão antes de usar como evidência de aceite.

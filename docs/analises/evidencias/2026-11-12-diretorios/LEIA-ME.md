# Evidências da auditoria de diretórios — 12/11/2026

Base imutável: `51fc428c80c5399bdc332d98ce1e1b6fe164a67f`. Dados exclusivamente fictícios; nenhum servidor, ambiente real ou credencial.

- `inventario.json`: todos os 620 arquivos/147 diretórios, SHA de cada arquivo, duplicações exatas, migrations/reversões e rotas.
- `branches.json`: 73 heads e método de prova da ancestralidade/divergência; tags/releases vazias.
- `graficos.json`: 25 instâncias JSX na demo e três fora dela; componentes de gráficos compartilhados, sem contar tabelas/legendas.
- `estados-requisitos.json`: contagem dos 179 estados declarados; não é percentual de prontidão.
- `publicacao.json`: respostas HTTP públicas e versão vista em `/saude` em 12/11 às 21:44 de São Paulo. `publicacao-reconferida.json` repete as dez consultas às 22:02 e confirma o mesmo resultado. Não incluem sessão autenticada.
- `verificacoes.json`: CI remoto e execução local, 1.118 testes, um TODO, 223 E2E e 11 ignorados; scanner sem valores sensíveis.
- `provas.test.ts` / `resultados-provas.json`: quatro provas do resultado seguro das correções antigas e duas provas observacionais dos bugs de inventário (#78/#79).
- `conferencia.test.ts` / `resultados-conferencia.json`: página real com API simulada respeitando `limit(500)`; demonstra falsa conclusão da conferência diária (#80).

**Os três testes de bugs passam ao reproduzir o defeito. Não são critérios de aceite e não devem ser usados como gate de aprovação.** A correção deve ter regressão própria com resultado seguro; preservar estas provas históricas ligadas ao SHA auditado.

Reprodução na raiz do repositório com Node 22, após `npm ci`:

```bash
node node_modules/vitest/vitest.mjs run --config docs/analises/evidencias/2026-11-12-diretorios/vitest.config.mjs
```

Executa sete provas em duas suítes, de banco e página. A primeira suíte aplica todas as 37 migrations em PGlite e desfaz cada transação; a segunda não acessa banco/rede. Geram arquivos locais `resultados.jsonl` e `resultados-conferencia.jsonl`, não necessários para commit. As cópias JSON acima registram os resultados desta revisão. As tabelas do inventário têm contagens recursivas sobrepostas; não somar como arquivos únicos.

A materialização não é um checkout Git local: hashes foram validados com SHA do objeto blob. O scanner histórico foi executado pelo GitHub Actions; não foi alegado `git status`/histórico limpo de repositório local independente. Dados de negócio e integrações externas no Supabase remoto não foram homologados.

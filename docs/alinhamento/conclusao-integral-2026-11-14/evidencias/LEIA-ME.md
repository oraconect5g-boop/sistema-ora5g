# Evidências da retomada — 14/11/2026

Base `dd31e91465335b7ad4a4f1ff59e80f7981ddd78d`. Tudo local usa dados fictícios; nenhum servidor, `.env` ou banco remoto foi lido pelo revisor.

- `manifesto.json`: 169 diretórios, 778 arquivos, 766 textos com SHA de blob validado, contagem dos 179 estados e limites.
- `migrations-registradas.json`: 53 MD5 do registro versionado conferidos com o Git, sem republicar identificador do projeto; não é consulta remota independente.
- `publicacao.json`: saúde/versão e redirecionamentos públicos; sem sessão autenticada.
- `verificacoes.json`: comandos locais e CI exato, separando testes selecionados, provas e E2E. A primeira tentativa local de E2E foi antes da build e não iniciou; o resultado definitivo depois da build passou.
- `provas-resultados.json`: último resultado dos 11 casos independentes.

## As provas não são todas testes de aceite

Quatro casos confirmam correções antigas; cinco observam os bugs #78/#79/#80/#82/#83; um demonstra a configuração histórica com 39 migrations; outro simula teto de API na exportação. **Os casos de bug passam ao reproduzir a falha, não aprovam o comportamento.** O caso de 39 é histórico, e o teto remoto não foi medido.

Para reproduzir na raiz de um checkout deste pacote, com Node 22 e dependências instaladas:

```bash
node node_modules/vitest/vitest.mjs run --config docs/alinhamento/conclusao-integral-2026-11-14/evidencias/vitest.config.mjs
```

Os quatro arquivos `*.test.ts` aplicam as migrations do checkout em banco descartável e usam APIs simuladas nos casos de página/exportação. Não acessam fornecedores reais. A execução pode gerar JSON/JSONL locais com dados fictícios nesta pasta; não é necessário commitar outra execução.

As 11 provas também foram verificadas com os caminhos publicados. O CI exato de `dd31e91` foi reexecutado a pedido do Codex e terminou aprovado, tentativa 2; o prompt exige nova conferência quando o SHA mudar. Nenhum resultado local equivale à jornada J1 com o Auth e o banco de destino.

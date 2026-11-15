# Evidências da publicação — 15/11/2026

Corte do produto: `5468d9e59d6a68587ba176fff178163eec81ff9c`. Coleta a partir de 19:20 de São Paulo. [Relatório](../../PUBLICACAO_DOMINIO_2026-11-15.md).

- `http.json`: respostas públicas e identificação de SHA/build. Rotas privadas nesse arquivo seguem o redirecionamento; o status original está no arquivo abaixo.
- `assets-rotas.json`: 17 recursos estáticos HTTP 200 e sete redirecionamentos originais 307 para /entrar. Sem sessão.
- `branches.json`: 169 branches e presença das pontas nos 415 commits alcançáveis da main, paginados. É ancestralidade de commits, não equivalência funcional nem leitura de arquivos não enviados.
- `migrations.json`: 84 versões lidas do histórico do Supabase, comparadas ao registro Git. 83 MD5 exatos; margem_painel de 13/11 coincide com uma quebra final. Nenhuma versão faltante/extra.
- `ci.json`: resultado final da run 43763184979, 2.279 testes aprovados, um reprovado e um TODO. Sem logs brutos.
- `prova-verificador.json`: duas execuções isoladas do script real com Git/curl simulados, confirmando falso sucesso.
- `verificador-publicacao.test.ts`: reprodução em TypeScript com o runner nativo do Node; dois testes executados e aprovados porque confirmam o defeito, não porque aprovam o comportamento.

Para repetir a prova na raiz do checkout desse SHA:

```bash
node --test docs/analises/evidencias/2026-11-15-publicacao/verificador-publicacao.test.ts
```

A prova exige Node com suporte ao TypeScript nativo (o projeto usa Node 22). Ela usa Bash e comandos do sistema para diretórios temporários, intercepta Git/curl e não acessa servidor, rede nem .env. Se estiver em outra cópia, a variável de teste `ORA_FONTE_PUBLICACAO_TESTE` aceita o caminho do script desse SHA. Converter em regressão do resultado correto após corrigir #99.

Consulta de histórico (somente leitura):

```sql
select version, name, md5(array_to_string(statements, E'\n')) as md5
from supabase_migrations.schema_migrations order by version;
```

Para a versão 20261113065706, acrescentar `E'\n'` ao texto produz 7af84d1c116430125d3c769abe29a21e, igual ao registro Git. Nenhuma alteração no histórico foi feita.

As evidências não atestam jornadas autenticadas, dados de loja/estoque, operação de workers ou todos os deploys passados. Nenhum conteúdo de .env, senha, token ou dado pessoal real foi coletado.


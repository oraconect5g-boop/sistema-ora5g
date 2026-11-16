# Evidências da continuação de 16/11/2026

Código final revisado: 89927dc; testes locais no ancestral 4e1a5d1. O delta final (14 arquivos) foi inspecionado e o CI final passou. As duas provas novas dizem respeito a SQL que não mudou nesse delta.

## Resultados independentes locais

| Recorte | Passaram |
|---|---:|
| UI/serviço (8 arquivos) | 33 |
| Verificação de publicação | 4 |
| Regras de pagamento/e-mail | 9 |
| Banco: fiscal, fotos e loja online (6 arquivos) | 27 |
| Orçamento de importação de 2.000 linhas | 1 |
| Controle de migrations e reversão das 5 novas | 9 |
| Total de regressões dirigidas | 83 |
| Provas de defeito #101/#102, separadas das regressões | 2 |

Build passou. Playwright dirigido: 154 passaram, 4 ignorados. Os testes não exercitaram os três perfis autenticados no domínio nem transações externas. Uma seleção ampla de reversões foi interrompida pelo revisor e substituída pelo recorte novo; não é falha do aplicativo. O orçamento de importação passou sem alterar o teto de 8 segundos por chamada.

## CI final

[Run 43854750798](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43854750798): lint/typecheck, verificações, testes, build, orçamento, audit de produção e E2E aprovados. 2.335 testes + 1 TODO; 281 E2E + 11 ignorados. O audit de produção informou zero vulnerabilidades; a instalação completa mencionou oito moderadas incluindo desenvolvimento, que exigem triagem própria.

## Provas executáveis de defeito

`revalidacao-legado.test.ts` reproduz #101 com PGlite antes da migration e aplicação incremental. `revalidacao-cota.test.ts` reproduz #102 com duas conexões PostgreSQL 17 e 19 reservas preexistentes. Usam fixtures fictícios do projeto, sem acesso a banco externo, envio de mensagem ou pagamento.

Na raiz do código 4e1a5d1 ou 89927dc, com dependências instaladas e estes arquivos copiados para o mesmo caminho:

```bash
npx vitest run --config docs/analises/diagnostico-integral-2026-11-16/evidencias/vitest-revalidacao.config.mjs
```

Esperado antes da correção: dois testes passam **porque reproduzem os defeitos**. Após a correção, converter em regressões do comportamento correto. O teste legado executa a migration histórica vulnerável de propósito; uma correção posterior precisa ser incorporada à prova de remediação. Não executar indiscriminadamente o config histórico que inclui provas de bugs já corrigidos em outros SHAs.

`revalidacao-resumo.json` registra os totais e limites. As comparações de funções mostram 11 corpos coincidentes. A migration de estatísticas foi armazenada pelo Supabase em quatro statements; a prova de comparação normaliza delimitadores, sem alterar comandos. Não interpretar diferença de concatenação/MD5 como drift.

Os inventários completos e fontes históricas continuam no pacote. Não foram publicados segredos, dados de clientes nem o arquivo real de estoque. Node 22.23.4 foi usado localmente.

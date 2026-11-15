# Evidências — continuação em 15/11/2026

Base funcional executada: **37faa93e45a7ad67303c86e718ea024434afc7c6**.
Base final de registro/publicação: **a4cf3257753dfc1405ef41bcf2ce2a88cc341aab**.
O segundo corte registra e renomeia a migration de limpeza já presente no primeiro; não altera a regra funcional testada.

## Conteúdo

- fontes.json: inventário do SHA final; 962 arquivos/192 diretórios. Não significa revisão manual exaustiva de toda linha.
- delta.json: 30 commits/130 arquivos desde 56c4bde.
- publicacao.json: rodapé público de /entrar, observado em 15/11 às 14:38 UTC.
- supabase-contagens.json: consulta somente leitura; sem dados de clientes, contas ou segredos.
- migrations-conferidas.json: 78 versões remotas; 77 hashes exatos e uma diferença somente de quebra final na margem_painel de 13/11.
- verificacoes.json: testes e CI por SHA, com limites.
- reteste-resultados.jsonl e reteste-resultados-cache.jsonl: repetição das provas de #87/#88/#96, cujo código está na pasta irmã de evidências de 14/11.
- concorrencia-fotos.test.ts, vitest.config.mjs e resultado-fotos.jsonl: prova de #98, em PostgreSQL 17 local com duas conexões.

## Testes executados

**293 testes do projeto passaram**, na base funcional:
- Banco: 24 testes em seis arquivos novos (pagamentos-por-terminal, margem-por-vendedor, conta-da-entrada, documentos-da-conta, correcao-do-custo e limpeza-das-fotos).
- Plataforma: 193 testes em 17 arquivos selecionados de exportações, fotos, contas/documentos, custos, margem, terminais e Início.
- Migrations: 76 testes de controle/reversão passaram; duração local de 357,73 segundos. São 78 migrations, mas os testes incluem quatro verificações de registro e reversões somente a partir do marco definido no projeto; não confundir os números.

**Quatro provas observacionais passaram, confirmando quatro defeitos** (#87, #88, #96, #98). Passar aqui não aprova a funcionalidade. Converter em regressões que esperem o comportamento correto ao corrigir.

## Reproduzir a corrida das fotos

Em checkout descartável de 37faa93 ou a4cf325, com Node 22 e dependências do lockfile, copiar esta pasta para o mesmo caminho relativo. Sem .env de servidor:

```bash
npm ci
npx vitest run --config docs/analises/evidencias/2026-11-15-continuacao/vitest.config.mjs
```

O teste sobe PostgreSQL 17 em 127.0.0.1, aplica schema simulado e migrations, usa fixtures fictícias, duas conexões com o papel authenticated e encerra o banco no fim. Não chama API de Storage.

A transação de registro termina a função, mas ainda não confirma. A limpeza em outra conexão autoriza/exclui o objeto porque não vê o registro não confirmado. Ambas confirmam: sobra foto ativa sem objeto. A prova modela a política de acesso do Storage; não afirma ter causado exclusão no serviço real.

## CI

A run 43708425656 (37faa93) foi cancelada durante npm test; build/audit/E2E foram pulados. O workflow possui limite de 15 minutos e o cancelamento ocorreu próximo desse limite. O resultado da execução posterior 43725391328 (a4cf325) está em verificacoes.json e no comentário de fechamento da PR #97.

A duração local das migrations ajuda a diagnosticar o orçamento da suíte, mas não é medida da máquina do GitHub. Não declarar CI verde a partir de testes locais ou do texto de um commit ancestral.

## Limites

Nenhum servidor/.env foi acessado; não houve escrita na base remota, carga de estoque, operação financeira/Nogle, envio WhatsApp, deploy ou merge. Os nomes/contagens publicados não incluem informações pessoais. O arquivo comercial original de estoque não foi versionado. As conversas privadas inacessíveis não foram lidas.



## Resultado final do CI

A run 43725391328 de a4cf325 terminou com failure às 14:50 UTC (11:50 em São Paulo): 2.145 testes passaram, um falhou e um TODO. Em concorrencia.test.ts:977, a aplicação de outras 2.000 a criar levou 8.505 ms (limite 8.000 ms). Build, audit e E2E foram pulados. Issue #95 atualizada. Este resultado substitui o estado provisório de execução.

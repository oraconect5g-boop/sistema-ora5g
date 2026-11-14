# Evidências — planejamento, bugs e configuração de 13/11/2026

Base funcional examinada: `46638ee`; base final: `51417a8`. O delta final registra a aplicação de 12 migrations, renomeia os arquivos com **SQL idêntico** e atualiza tipos/documentação. **Nenhum dado real, servidor, `.env` ou banco remoto foi acessado pelo revisor.**

| Arquivo | Conteúdo / limite |
|---|---|
| `manifesto.json` | 165 diretórios, 752 arquivos e SHA de cada um, 740 textos conferidos, rotas, duplicações e migrations; 12 binários somente inventariados |
| `estados.json` | Contagem declarada dos 179 requisitos e evolução desde a auditoria anterior; nenhum homologado |
| `matriz-funcional.json` | Versão estruturada da matriz dos 179 requisitos, com nota do implementador e análise do revisor |
| `branches.json` | 90 heads: prova por commits/ancestralidade anterior ou comparação dos heads documentais; sem merge em massa |
| `graficos.json` | 34 instâncias JSX reais/compartilhadas e 25 na demo; contagem de código, não gráficos simultâneos/homologados |
| `schema-local.json` | Funções, tabelas, RLS e concessões efetivas após aplicar as 51 migrations em PGlite; não é schema consultado no remoto |
| `migrations-registradas-verificadas.json` | 51 MD5 do registro do programador comparados aos arquivos, todos iguais; sem republicar identificador do projeto |
| `renomes-sql-identico.json` | 12 nomes anteriores/novos e blob SHA idêntico: renome não alterou o SQL; conferir outros ambientes que tenham usado nomes anteriores |
| `publicacao.json` | HTTP público às 22:28 de São Paulo: app 46638ee, build 22:20; rotas novas existem e pedem login; não prova a sessão/RPC/Storage do destino |
| `verificacoes.json` | CI de ambas as bases aprovado; 1.649 testes, 1 TODO; 237 E2E, 11 ignorados; tipos/provas repetidos no delta; sem vulnerabilidades de produção reportadas |
| `resultados.json` | Último resultado de cada uma das 11 provas independentes, com dados fictícios |

## Natureza das provas

- **Quatro** verificam o resultado seguro das correções antigas #69/#70/#71/#72.
- **Cinco** observam bugs ainda presentes: #78/#79/#80 e novos #82/#83. **Esses testes passam ao reproduzir o defeito, não são aceite nem gate de aprovação.** A correção deve criar regressão própria com resultado seguro; preservar esta prova histórica vinculada ao SHA.
- **Uma** mostra por que uma base antiga com 39 migrations não contém as RPCs novas (42883). É diagnóstico histórico; em `51417a8` o programador registrou as 51 aplicadas. Não reaplicar SQL por causa dessa simulação.
- **Uma** mostra truncamento da exportação com API simulada com teto de 1.000. O teto remoto não foi medido; o risco depende da configuração, que deve ser conferida.

## Reprodução

Na raiz de um checkout desta PR, com Node 22 e dependências instaladas:

```bash
node node_modules/vitest/vitest.mjs run --config docs/analises/evidencias/2026-11-13-planejamento/vitest.config.mjs
```

Os quatro arquivos `*.test.ts` executam 11 casos. Banco em memória com todas as migrations e transações desfeitas; configuração antiga em outro banco descartável; testes de página/consulta com APIs simuladas. As datas históricas fabricadas só existem no banco descartável. Nenhum provedor externo é chamado.

A execução gera `resultados*.jsonl` e `schema-local.json` nesta pasta; não é necessário commitar uma nova execução. `resultados.json` preserva a última observação de cada caso desta revisão. Os caminhos publicados foram testados também no snapshot final.

O checklist de configuração exige evidência do ambiente e J1, não somente compilação. A revisão não certifica a veracidade de todo histórico remoto a partir do JSON do programador; registra exatamente o que foi observado e o que foi informado.

# Evidências dos testes por setor — 08/11/2026

Base operacional: `55d10afec95a6a556546b2b2e1f439302a86bfff`. Dados fictícios; banco local descartável; nenhuma chamada de ativação/cobrança real.

## Resultado distinto por fonte

| Fonte | Passaram | Falharam na base | Achado |
|---|---:|---:|---|
| dominio.repro.ts | 21 | 1 | #35: chip q2 com um ICCID aceito |
| banco.repro.ts | 6 | 3 | #34: variante NULL; condição e série ignoradas na repetição |
| aprovacoes-e-nogle.repro.ts | 8 | 1 | #36: contrato recebe o próprio pedido para aprovação |
| relatorios.repro.ts | 2 | 1 | #37: série constante produz +2900% em 30 dias |
| csv.repro.ts | 0 | 1 | #38: =1+1 sai como célula textual sem neutralização |
| navegador.repro.ts, dois viewports | 42 | 2 | #39: saldo -R$51,28 e ação ainda disponível |
| **Total** | **79** | **9** | **88 casos distintos** |

Na primeira execução do navegador foi provado o botão habilitado sem fundos. Uma confirmação ajustou a assertion de apresentação para verificar o sinal antes de R$, comprovando também o texto exato do saldo negativo. Essa reexecução não aumenta a contagem de cobertura.

## Como executar

Usar uma cópia descartável, Node 22.23.4 e `npm ci`. Copiar cada arquivo para o local abaixo; os imports relativos foram escritos para esses destinos:

- dominio.repro.ts → packages/dominio/src/auditoria-setores-20261108.test.ts
- banco.repro.ts → packages/banco/src/auditoria-setores-20261108.test.ts
- aprovacoes-e-nogle.repro.ts → apps/plataforma/src/demo/auditoria-setores-20261108.test.ts
- relatorios.repro.ts → apps/plataforma/src/app/demo/relatorios/auditoria-setores-20261108.test.ts
- csv.repro.ts → apps/plataforma/src/componentes/auditoria-csv-20261108.test.ts
- navegador.repro.ts → apps/plataforma/e2e/auditoria-setores-20261108.spec.ts

~~~bash
npx -w @ora5g/dominio vitest run src/auditoria-setores-20261108.test.ts
npx -w @ora5g/banco vitest run src/auditoria-setores-20261108.test.ts
npx -w @ora5g/plataforma vitest run src/demo/auditoria-setores-20261108.test.ts src/app/demo/relatorios/auditoria-setores-20261108.test.ts src/componentes/auditoria-csv-20261108.test.ts
~~~

Para o navegador, construir a aplicação conforme o README em ambiente de desenvolvimento com dados fictícios; o Playwright inicia o servidor local. Usar diretamente o comando do workspace para preservar filtros de CLI:

~~~bash
APP_ENV=development npx -w @ora5g/plataforma playwright test auditoria-setores-20261108.spec.ts
APP_ENV=development npx -w @ora5g/plataforma playwright test auditoria-setores-20261108.spec.ts --grep 'carteira negativa'
~~~

As falhas são esperadas na base, não defeitos de infraestrutura. Remover as cópias temporárias antes de executar a suíte normal. Corrigido cada achado, converter os casos em regressões permanentes.

## Testes permanentes desta rodada

- `packages/dominio/src/desconto-propriedades.test.ts`: um teste avalia 1000 entradas determinísticas por desigualdade independente de margem/teto.
- `apps/plataforma/e2e/setores-e-exportacoes.spec.ts`: 21 cenários em celular e computador, sem o cenário deliberadamente vermelho da carteira.

Esses testes passaram localmente; o CI do commit publicado confirma a combinação com a suíte existente. A análise por setor distingue interface simulada, função de domínio, RPC/banco e integração ainda ausente.


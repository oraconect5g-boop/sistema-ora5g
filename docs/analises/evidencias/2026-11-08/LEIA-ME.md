# Reproduções independentes — 08/11/2026

Base: 7f5fd413eee756015723a53b29680db0ec655a1f. Relatório: [auditoria](../../AUDITORIA_CLAUDE_CODE_2026-11-08.md).

Os arquivos são evidências em TypeScript, fora das pastas da suíte normal. Foram executados em banco local descartável e navegador local, com fixtures sintéticas. Não precisam de Supabase remoto, usuário real nem ambiente real.

Resultados na base auditada: banco, seis falhas (issues #19 a #22); navegador, quatro falhas (issues #23 e #24, em celular e computador). Falhar aqui reproduz o defeito; depois da correção, transformar os casos em regressões permanentes e exigir sucesso.

## Banco

No clone de desenvolvimento, com Node 22 e dependências instaladas, a partir da raiz:

```bash
(
  trap 'rm -f packages/banco/src/revisao-adversarial-20261108.test.ts' EXIT
  cp docs/analises/evidencias/2026-11-08/banco.repro.ts packages/banco/src/revisao-adversarial-20261108.test.ts
  npx -w @ora5g/banco vitest run src/revisao-adversarial-20261108.test.ts
)
```

A migration é aplicada somente no PGlite criado pelo teste. Cada cenário usa transação e rollback; o banco é descartado ao final. Os imports relativos da evidência são resolvidos na pasta temporária de destino.

## Navegador

Preparar a build local da plataforma e o Chromium de testes. A demonstração deve usar APP_ENV=development e dados fictícios.

```bash
(
  trap 'rm -f apps/plataforma/e2e/revisao-adversarial-20261108.spec.ts' EXIT
  cp docs/analises/evidencias/2026-11-08/telas.repro.ts apps/plataforma/e2e/revisao-adversarial-20261108.spec.ts
  APP_ENV=development NEXT_PUBLIC_APP_URL=http://127.0.0.1:3182 ORA_PORTA_E2E=3182 ORA_PORTA_AUXILIAR=3198 npx -w @ora5g/plataforma playwright test revisao-adversarial-20261108.spec.ts --reporter=line
)
```

Usar clone e portas de teste; as reproduções não apontam para servidor público nem para a homologação na porta 3100.

## Leituras adicionais da revisão

Os resultados de CI e testes existentes estão separados dos adversariais no relatório. Não houve execução de migrations/reversões no Supabase remoto. A comparação remota consultou metadados, hashes, contagens agregadas e advisors, sem registros pessoais individuais.

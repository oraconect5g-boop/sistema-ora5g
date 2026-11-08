# Evidências da revisão do relatório Web — 08/11/2026

Base: `55d10afec95a6a556546b2b2e1f439302a86bfff`. Somente dados fictícios e bancos locais descartáveis; nenhuma credencial/usuário de ambiente real.

## Resultados

| Fonte | Casos | Resultado esperado na base auditada |
|---|---|---|
| equipe.repro.ts | REV-026: bloqueio cruzado; REV-027: autoconcessão por convite; REV-029: convite após perda de autoridade | 3 assertions falham: false em vez de true; true em vez de false; 1 vínculo em vez de 0 |
| donos.repro.ts | REV-028: duas transações encerram donos diferentes | 1 assertion falha: zero donos, deveria haver ao menos um |
| indicadores.repro.ts | REV-030: face na receita; REV-031: ativação pendente contada | 2 assertions falham: 3000 em vez de 0 centavos; 1 em vez de 0 operações |
| ../2026-11-08/banco.repro.ts | Reproduções originais REV-020 a 023 | 6 testes passaram após as correções |
| ../2026-11-08/telas.repro.ts | Reproduções originais REV-024 e 025, dois tamanhos | 4 execuções passaram após as correções |

Essas falhas deliberadas provam o comportamento existente; não são testes normais de entrega. O caso de convite após revogação demonstra o comportamento e explicita o contrato esperado de revogação; uma política alternativa precisaria estar decidida e documentada.

A divergência de e-mail é montada diretamente na fixture para representar alteração permitida pela API Auth do Supabase. A conclusão do convite é executada como o worker privilegiado no banco local, como ocorre no adaptador. Não se afirma ter realizado essa sequência numa conta real.

O caso de donos usa PostgreSQL 17 e duas conexões distintas, com transações sobrepostas e commits de ambas. A contagem é lida depois dos commits. Não depende de promessas paralelas numa única conexão PGlite.

## Reproduzir em cópia descartável do repositório

Node 22.23.4, Linux com usuário não root e dependências instaladas por `npm ci`. O PostgreSQL embarcado já é devDependency da base.

Copiar temporariamente:

- `equipe.repro.ts` → `packages/banco/src/revisao-equipe-web-20261108.test.ts`
- `donos.repro.ts` → `packages/banco/src/revisao-donos-web-20261108.test.ts`
- `indicadores.repro.ts` → `apps/plataforma/src/demo/revisao-web-20261108.test.ts`

Executar:

~~~bash
npx -w @ora5g/banco vitest run src/revisao-equipe-web-20261108.test.ts src/revisao-donos-web-20261108.test.ts
npx -w @ora5g/plataforma vitest run src/demo/revisao-web-20261108.test.ts
~~~

Os comandos devem terminar com falha na base auditada pelas seis assertions indicadas. Após corrigir, integrar regressões apropriadas e executar também a suíte normal, concorrência e fluxos positivos. Remover as cópias temporárias antes de medir a suíte existente.

## Verificação normal nesta revisão

Instalação limpa, lint, typecheck e build aprovados. **397 testes passaram, 4 TODO; 124 E2E passaram, 10 pulados.** Seis reproduções antigas de banco e quatro execuções antigas de navegador passaram separadamente.

O CI verde da base cobre os testes existentes, não os seis cenários adversariais novos: [execução 42521842775](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42521842775).


# Evidências locais — vendas, pagamentos e caixa — 371cef0

Referência: main `371cef0c02affad30f6fe2ebd1468cbcec67009f`. [Análise e issues](../../REVISAO_VENDAS_PAGAMENTOS_CAIXA_371CEF0_2026-11-08.md).

| Fonte | Passaram | Falharam | Escopo |
|---|---|---|---|
| banco.repro.ts | 2 | 13 | Banco em memória, todas as migrations, papéis/JWT fictícios: RLS, confirmação da entrada, financiamento, estorno e estoque |
| acoes.repro.ts | 1 | 3 | Server Actions reais; somente sessão, RPC e redirect substituídos; prova de parâmetros enviados |
| concorrencia.repro.ts | 0 | 1 | PostgreSQL 17 local, duas conexões, espera por Lock verificada e deadlock 40P01 |
| **Total** | **3** | **17** | **20 casos distintos, nove causas (#45–#53)** |

As falhas são esperadas na base revisada e não integram o CI normal. Os três controles positivos distinguem operação legítima dos casos rejeitados pelo aceite. Resultados em [resultados.txt](resultados.txt). Não somar reexecuções como cobertura adicional.

Reproduzir em checkout isolado da base fixada, com dependências do lockfile e Node 22.23.4. Copiar temporariamente:

- `banco.repro.ts` → `packages/banco/src/revisao-vendas-extra.test.ts`
- `acoes.repro.ts` → `apps/plataforma/src/app/vender/revisao-acoes-extra.test.ts`
- `concorrencia.repro.ts` → `packages/banco/src/revisao-vendas-concorrencia.test.ts`

Os imports nas fontes referem-se aos destinos temporários acima. Executar a partir da raiz:

```bash
npx -w @ora5g/banco vitest run src/revisao-vendas-extra.test.ts
npx -w @ora5g/plataforma vitest run src/app/vender/revisao-acoes-extra.test.ts
npx -w @ora5g/banco vitest run src/revisao-vendas-concorrencia.test.ts
```

Remover as três cópias depois, ou descartá-las com o checkout isolado. Não carregar `.env`, não apontar para banco externo e não executar estas provas contra dados reais. O teste concorrente usa apenas PostgreSQL local descartável, iniciado/parado pelo helper existente; os demais dados do banco são revertidos por transação. Nenhuma dependência ou linguagem nova foi adicionada.

Limites: ações usam RPC simulada e comprovam somente a chamada indevida; banco testa o SQL real em ambiente simulado; a prova de deadlock controla a intercalação com locks preparatórios como dono do banco local e depois chama as RPCs como pessoas autenticadas. Nenhuma prova mede frequência em produção, valida hardware de câmera ou confirma ações Nogle/bancárias.

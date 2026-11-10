# Evidências da revisão Nogle — 9b1109e

[Análise consolidada](../../REVISAO_NOGLE_9B1109_E_CONSOLIDADO_2026-11-09.md). Base main `9b1109e49d9304651d20224563f8e5bdaf950894`.

| Fonte | Passaram | Falharam | Causas |
|---|---|---|---|
| banco.repro.ts | 1 | 4 | Controle de produção única; titular ignorado pela idempotência; LINK com serviço pago; custo ao vendedor; uma evidência para duas recargas |
| publicacao.repro.ts | 0 | 1 | Filtro de publicação conserva segredos Nogle na cópia web |
| Total | 1 | 5 | Cinco causas, issues #55–#59 |

Reproduzir em checkout isolado da base, com dependências do lockfile e Node22.23.4. Copiar temporariamente:

- banco.repro.ts → packages/banco/src/revisao-nogle-extra.test.ts
- publicacao.repro.ts → packages/config/src/revisao-publicacao-nogle.test.ts

```bash
npx -w @ora5g/banco vitest run src/revisao-nogle-extra.test.ts
npx -w @ora5g/config vitest run src/revisao-publicacao-nogle.test.ts
```

Remover as cópias ao terminar. São provas vermelhas na base, fora do CI normal. As importações referem-se aos destinos acima. O banco é local/descartável com transações revertidas; o filtro real do script usa arquivo temporário com valores fictícios e não publica uma versão. Nenhum `.env` real, credencial, servidor ou API da Contel foi utilizado.

O histórico de recarga com data coincidente é sintético: prova que a implementação não distingue a evidência e não prova ocorrência no provedor. Esse contrato precisa de confirmação oficial. A prova de segredos é de acesso indevido pelo processo web; não demonstrou chave no bundle do navegador.

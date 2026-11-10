# Evidências — merges e prontidão Nogle — 09/11/2026

Base main `371cef0c02affad30f6fe2ebd1468cbcec67009f`.

- [Revisão de merges](../../REVISAO_MERGES_E_DUPLICIDADES_2026-11-09.md): 130 commits, 35 merges, 68 árvores; comparação de pais e bases; grafo de 118 fontes/17 entradas reais e inventário do banco.
- [Prioridade Nogle e gateway](../../PRIORIDADE_NOGLE_GATEWAY_E_REPASSES_2026-11-09.md): fonte oficial atual reconferida, implementação ausente e contrato de aceite para #54.
- `resultados.json`: resumo sanitizado, sem autores/e-mails Git, infraestrutura, credenciais ou dados de clientes.
- `inventario-banco.repro.ts`: copiar para `packages/banco/src/revisao-merges-inventario.test.ts`, rodar `npx -w @ora5g/banco vitest run src/revisao-merges-inventario.test.ts` e remover a cópia. Usa todas as migrations e banco local descartável. O inventário executado passou; não certifica cada regra de negócio.
- `grafo-fontes.repro.mjs`: no checkout isolado com Node 22.23.4 e dependências instaladas, rodar `node docs/analises/evidencias/2026-11-09-merges-e-nogle/grafo-fontes.repro.mjs`. Lê arquivos versionados do Git e usa o parser TypeScript; não executa a aplicação.

As comparações históricas foram feitas pelos objetos e árvores da API GitHub, com SHA fixado. Não se modificou história/arquivo da main, migration remota, crontab, `.env`, fornecedor ou cliente. Não houve remoção automática por hash igual.

Limites: imports calculados não entram no grafo literal; identidade de blob não prova identidade semântica de duas implementações diferentes; o inventário SQL não detecta sozinho erro no predicado de uma policy; não foi inspecionada a VPS. O catálogo de 62 funções e o hash da coleção não significam 62 integrações ativas.

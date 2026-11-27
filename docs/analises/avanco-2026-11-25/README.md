# Auditoria de avanço — 25/11/2026

Corte de código: `e7f55b2f0a4f8beaef4109307ab3a7ad40019131`. Base comparada: `003421d83985f68b04db200c4a168e2872ebd836`.

Leia nesta ordem:

1. [RELATORIO.md](RELATORIO.md): avanço, achados, domínio, banco, testes e ordem de estabilização.
2. [PLACAR_POR_AREA.md](PLACAR_POR_AREA.md) e [MATRIZ_179.csv](MATRIZ_179.csv): todos os requisitos, sem chamar teste de homologação.
3. [ARQUIVOS_ALTERADOS.csv](ARQUIVOS_ALTERADOS.csv): 225 arquivos, alteração e hash Git.
4. [EVIDENCIAS.json](EVIDENCIAS.json), [DOMINIO.json](DOMINIO.json) e [RESULTADOS_LOCAIS.txt](RESULTADOS_LOCAIS.txt): contagens, publicações e verificações.
5. [PROVA_F24_01.test.ts.txt](PROVA_F24_01.test.ts.txt): o defeito antigo de transferência agora passa.
6. [PROVA_F25_01.test.ts.txt](PROVA_F25_01.test.ts.txt): falha local de reconciliação da assinatura durante cancelamento.
7. [SOLUCOES_PARA_AVALIACAO.md](SOLUCOES_PARA_AVALIACAO.md): propostas, não implementação pronta para aplicar.

Os testes estão em arquivos de texto fora das suítes. Para reproduzir em checkout isolado do SHA auditado: copiar cada um para `packages/banco/src/<nome>.test.ts`, instalar com Node 22/npm ci e rodar Vitest com um worker. Não executar contra o Supabase. A prova F25-01 foi montada com helpers da suíte de assinatura do próprio corte.

Esta revisão complementa, sem apagar nem sobrescrever:
- [PR #108: revisão visual, fluxos, plano de cinco dias e conferência da lista do Claude](https://github.com/oraconect5g-boop/sistema-ora5g/pull/108). Pacote: `docs/analises/revisao-visual-fluxos-2026-11-24/`; adendo: `docs/analises/CONFERENCIA_LISTA_CLAUDE_2026-11-24.md`. Branch `docs/revisao-visual-fluxos-20261124`, commit documental `1abc932cbd36703a29b8a766b1bb78d4ba8e6513`.
- [PR #105: auditoria integral de 21/11](https://github.com/oraconect5g-boop/sistema-ora5g/pull/105).
- [PR #104: auditorias de 17 e 18/11](https://github.com/oraconect5g-boop/sistema-ora5g/pull/104).
- Demais relatórios históricos referenciados na documentação e no índice da auditoria anterior; PR aberto não implica conteúdo presente na main.

Nenhuma correção de aplicação, migration de produção, segredo ou aceite do proprietário é introduzido neste pacote.


# Diagnóstico integral do sistema Ora

**Atualização: 16/11/2026, código 89927dc.** Este pacote documenta análise, provas e prompt de execução. Não altera aplicativo, migrations remotas, contas, estoque ou deploy. A integração GitHub/Supabase corrigida e o CI aprovado foram verificados; operação completa ainda está pendente.

1. [Atualização atual](ATUALIZACAO_2026-11-16.md): correções confirmadas, bugs #101/#102, Supabase, CI e domínio.
2. [Loja, canais e publicação real/demo](ADENDO_LOJA_CANAIS_E_PUBLICACAO.md): novo pedido do proprietário, 20 aceites vinculados aos 179 IDs.
3. [Prompt completo para Claude Code](PROMPT_CLAUDE.md): continuar até concluir, testar e publicar por etapas.
4. [Matriz atual dos 179](MATRIZ_179_ATUALIZADA.md): 62 testados, 70 parciais, 42 não iniciados, 3 bloqueados, 2 restrições respeitadas, 0 homologados.
5. [Node e aceleração](NODE_E_ACELERACAO.md): stack atual recomendada e exemplos de código apenas para avaliação do proprietário.
6. [Evidências atuais](evidencias/REVALIDACAO.md): testes, provas e limites.

Base histórica preservada: [relatório integral](RELATORIO_INTEGRAL.md), [Supabase](SUPABASE_E_PUBLICACAO.md), [matriz detalhada](MATRIZ_179.md), [inventário de arquivos/funções](INVENTARIO_ARQUIVOS_E_FUNCOES.md), [fontes dos relatórios](FONTES_COMPLETAS.md), [propostas anteriores](SOLUCOES_PARA_AVALIACAO.md) e [evidências anteriores](evidencias/RESUMO.md). Esses números/bugs se referem a 5468d9e e não substituem a atualização.

O domínio confirmou 89927dc em homologação; CI completo aprovado com 2.335 testes e 281 E2E. Isso não prova todas as jornadas, credenciais ou dados carregados. Node já é usado: os bloqueios observados não justificam reescrever em outra linguagem.

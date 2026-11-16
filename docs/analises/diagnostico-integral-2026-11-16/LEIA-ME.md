# Diagnóstico integral do sistema Ora

Base auditada: `5468d9e59d6a68587ba176fff178163eec81ff9c`. Coleta final em 16/11/2026 UTC, noite de 15/11 em São Paulo.

Este pacote registra análise, evidências e encaminhamento. Não altera aplicativo, migrations, contas, estoque, configuração do Supabase ou publicação no domínio.

1. [Relatório integral](RELATORIO_INTEGRAL.md): o que existe, defeitos reproduzidos, lacunas e prioridades.
2. [Supabase e publicação](SUPABASE_E_PUBLICACAO.md): banco efetivo, arquivos, permissões e integração GitHub.
3. [Matriz dos 179 requisitos](MATRIZ_179.md): todos os IDs, aceites, evidências, bloqueios e próximos passos.
4. [Inventário completo](INVENTARIO_ARQUIVOS_E_FUNCOES.md): 1.033 arquivos, 339 funções SQL e 95 relações.
5. [Fontes completas](FONTES_COMPLETAS.md): 116 Markdown da main e 88 versões documentais de 9 PRs.
6. [Prompt para o Claude Code](PROMPT_CLAUDE.md): execução ordenada, aproveitando o código atual.
7. [Soluções com código para avaliação do proprietário](SOLUCOES_PARA_AVALIACAO.md): propostas separadas; não são ordem de aplicação.
8. [Evidências](evidencias/RESUMO.md).

**Conclusão:** há implementação real significativa; a entrega operacional está incompleta. O checkpoint declara 62 testados, 68 parciais, 44 não iniciados, 3 bloqueados e 2 restrições respeitadas. Nenhum homologado registrado. O site publica o SHA auditado, mas isso não confirma dados carregados, integrações habilitadas ou jornadas reais concluídas.


# Auditoria integral — Ora 5G — 21/11/2026

**O domínio está atualizado; o projeto ainda não está completo para operação comercial.** Há avanços reais, mas também dois defeitos reproduzidos, dados operacionais ausentes e integrações por concluir.

Corte: `c1b8e6086d509f388e6080eb829af7a8b6ac316b` (`main`, lote J3-f). Consultas em 21/11, a partir de 16:14; main, domínio e principais contagens rechecados após 23:35, horário de Brasília, sem mudança. A build do domínio é de 10:45. Esta documentação não altera código de aplicação, banco, credenciais ou publicação do site.

1. [Relatório técnico e funcional](RELATORIO.md): diagnóstico, bugs, Supabase, CI, implantação e áreas.
2. [Matriz dos 179](MATRIZ_179.md) e [notas integrais em JSON](MATRIZ_179.json).
3. [Requisitos acrescentados durante a conversa](EXTRAS_DA_CONVERSA.md).
4. [Dependências, parâmetros e configurações](DEPENDENCIAS_E_CONFIGURACOES.md).
5. [Prompt de continuidade para Claude Code](PROMPT_CLAUDE.md).
6. [Soluções com código, apenas para avaliação](SOLUCOES_PARA_AVALIACAO.md).
7. [Evidências e reprodução dos defeitos](evidencias/README.md).
8. Inventários: [arquivos](INVENTARIO_ARQUIVOS.csv), [diretórios](INVENTARIO_DIRETORIOS.csv), [declarações de funções](INVENTARIO_FUNCOES.csv), [alterações desde 18/11](ARQUIVOS_ALTERADOS_DESDE_18_11.csv), [documentos](FONTES_DOCUMENTAIS.csv).
9. [Relatórios anteriores e precedência das decisões](FONTES_E_LIMITES.md).

Estado declarado: **69 testados, 80 parciais, 15 não iniciados, 13 bloqueados e 2 restrições respeitadas**. São 179 itens; **0 requisitos integralmente homologados**. Há 1 aceite de lote, Web Push, que não equivale ao fechamento de um requisito inteiro.

**Prioridades novas:** F21-01 (rodapé do XLSX original não reconhecido) e F21-02 (mesmo crédito de extrato conciliável com duas obrigações diferentes). Provas em banco local descartável, sem alterar o Supabase.

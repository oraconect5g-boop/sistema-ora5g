# Auditoria integral Ora 5G — comece aqui

> **Atualização de 18/11/2026:** leia a [reanálise do commit `27b4f6e`](../reanalise-2026-11-18/README.md), com avanços, novos bugs reproduzidos, banco e publicação conferidos. Este pacote preserva o corte histórico de 17/11.

Este diretório contém o pacote completo da auditoria de **17/11/2026**, publicado por solicitação expressa do proprietário. **Corte analisado: `03123d042f0d51493a17eec449967a5a48124a59`.** Compare os commits posteriores antes de tratar um achado como ainda aberto.

## Ordem de leitura para Claude Code

1. [Relatório integral](RELATORIO.md): diagnóstico, lojas, estoque, planilha, transferências, gráficos, integrações, Supabase, testes e publicação.
2. [Matriz individual dos 179 requisitos](MATRIZ_179.md): leia todos os IDs, critérios de aceite, notas/evidências do projeto e observações da revisão. Versões para processamento: [CSV](MATRIZ_179.csv) e [JSON](MATRIZ_179.json).
3. [Pedidos adicionais e configurações](EXTRAS_E_CONFIGURACOES.md): A01–A20 e demais decisões da conversa, inclusive APIs, checkout completo, real/demo, fotos e cadastro de clientes.
4. [Orientação de continuidade](ORIENTACAO_CLAUDE.md): prompt com ordem de trabalho, regressões e critérios de conclusão.
5. [Evidências e reprodução](evidencias/README.md): testes, resultados, catálogo agregado e provas independentes. Leia os arquivos vinculados; CI verde não elimina a falha adicional reproduzida.
6. [Fontes do corte e relatórios históricos](FONTES.md), [índice histórico de 16/11](FONTES_HISTORICAS_16_11.md) e [inventário dos 1.203 arquivos](INVENTARIO_ARQUIVOS.csv). Consulte também o [pacote anterior no PR #100](https://github.com/oraconect5g-boop/sistema-ora5g/pull/100), preservado como histórico.
7. [Soluções viáveis](SOLUCOES_VIAVEIS.md): alternativas solicitadas para avaliação do proprietário; não são patches aprovados para aplicação direta.
8. [Índice complementar](LEIA-ME.md) e [manifesto de integridade](SHA256SUMS.txt).

## Instrução de uso

Leia o pacote inteiro, não apenas este índice ou o resumo do PR. Reconcile cada achado com a main atual e registre: corrigido com commit/teste, ainda aberto, configuração externa pendente ou homologação pendente. Preserve os 179 IDs e os aceites adicionais. Não reinicie o projeto nem troque TypeScript/Next.js/Node/Supabase/PostgreSQL.

Documentos históricos não substituem a decisão mais recente do proprietário. Não execute exemplos de solução ou SQL de evidência diretamente no banco real. As provas são para checkout/banco isolado e não foram instaladas como código da aplicação.

O pacote não inclui a planilha original, credenciais ou arquivos `.env` preenchidos. A branch contém documentação e provas; sua publicação não altera o site nem o Supabase. Ler esta pasta não depende de merge na main.

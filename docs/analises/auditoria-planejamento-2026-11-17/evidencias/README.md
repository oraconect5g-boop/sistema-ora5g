# Evidências e reprodução

> **Publicação integral solicitada pelo proprietário após a entrega da auditoria.** Este documento preserva o corte de 17/11/2026, commit `03123d0`; não representa uma nova auditoria dos commits posteriores. O bloqueio inicial de divulgação foi seguido de autorização expressa para adicionar os materiais completos ao GitHub. Planilha original e credenciais continuam fora do pacote.

Corte base de testes: e603531. Corte final do importador: 03123d0. As provas são da auditoria local e das consultas somente leitura; não foram executadas transações comerciais no Supabase.

## Testes

- `testes-banco.log`: 12 arquivos / 242 testes selecionados de acesso, lojas, transferência, fiscal, concorrência e rotinas, todos aprovados.
- `testes-app-worker.log`: plataforma 1.575, worker 20, configuração 60 e domínio 112, todos aprovados no primeiro corte.
- `testes-rein-a.log`: recorte posterior; 59 testes existentes aprovados e uma prova adicional do original reprovada.
- `prova-planilha-original.log`: reprodução isolada do defeito da linha 2273; o resultado da identificação do total é null.
- `testes-remessa-prova.log`: prova independente aprovada das quantidades na solicitação/separação/envio/repetição.
- `evidencias-resumidas.json`: contagens do CI final e consultas agregadas de logs, sem conteúdo de cadastro ou credenciais.
- `dependencias-resumo.json`: advisory raiz e contagem do audit incluindo desenvolvimento. O audit de produção do CI reportou zero.

As duas provas `.test.ts` são arquivos de auditoria; não foram commitadas como alteração do aplicativo. Para reproduzir em checkout isolado da versão analisada:

1. Instale as dependências do lockfile com a versão Node 22 adotada pelo projeto.
2. Coloque `auditoria-planilha-real.test.ts` em `apps/plataforma/src/lib/importacao/` e `auditoria-remessa-saldo.test.ts` em `packages/banco/src/`.
3. Defina `ARQUIVO_ESTOQUE_AUDITORIA` com o caminho local do XLSX original, mantido fora do repositório público.
4. Execute `npm -w @ora5g/plataforma test -- src/lib/importacao/auditoria-planilha-real.test.ts` e `npm -w @ora5g/banco test -- src/auditoria-remessa-saldo.test.ts`.

A primeira prova espera 2.271 produtos e partes 2.000/271; falha na versão analisada porque o rodapé vira uma linha extra. A segunda caracteriza o comportamento atual, não aprova automaticamente a semântica de negócio: solicitar não reserva. Não importar o estoque no banco para executar essas provas.

## Banco e contagens

As contagens não incluem nomes de clientes, telefone, e-mail, documentos ou valores de credenciais. São uma fotografia da consulta, não um feed em tempo real. O banco estava recebendo mudanças durante a revisão.

`comparacao-corpos.json` é o resultado bruto do comparador de texto. A inspeção posterior concluiu que `importacao_comparar` difere apenas em espaços/quebras periféricos e que três diferenças pertencem à migration adicional de origem das reservas. Consulte a interpretação no relatório; não classifique toda diferença de hash como bug.

As tabelas privadas sem policy e sem concessão de SELECT direto foram avaliadas como fechamento deliberado, não vazamento. Advisors devem ser interpretados junto com grants e contratos das RPCs. Não remover índices automaticamente por “unused” numa base quase vazia.

## Divulgação

O pacote é para análise do proprietário. A publicação inicial foi bloqueada pela revisão automática. O proprietário solicitou posteriormente que os materiais completos fossem adicionados ao GitHub, autorização que fundamenta esta edição. A planilha original, seus custos e os valores de `.env` não integram este pacote.

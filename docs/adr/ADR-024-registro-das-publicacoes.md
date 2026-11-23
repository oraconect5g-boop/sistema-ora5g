# ADR-024: O registro de cada publicação, gravado depois dela e fora dos commits do aplicativo

**Situação:** aplicada (23/11/2026, lote AUD-c), reversível. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário.

**Pedida por:**

- o achado F18-04 da reanálise do Codex de 18/11 e o achado F21-03 da auditoria integral do Codex de 21/11 (PR #105): o checkpoint dizia `b061e86` e "falta publicar o J3-f" com o domínio servindo `c1b8e60`;
- a ordem de 23/11: registrar a publicação depois de feita, sem um checkpoint que fica sempre um commit atrás por tentar registrar o próprio SHA.

## Contexto

1. Até o J3-f, cada lote gravava dentro da `main` o commit que estava no ar e o que "faltava publicar".
2. O commit que registra a publicação não pode trazer o próprio SHA, e a publicação acontece depois do merge. O texto ficava, por construção, um lote atrás, e era corrigido no lote seguinte.
3. Quem lia o repositório sem olhar o domínio concluía que o último lote não estava no ar.

## Decisões

1. **O que está no ar agora** é o que `https://ora5g.com.br/saude/versao` responde (o commit inteiro, a build e o ambiente). Nenhum documento da `main` afirma mais isso.
2. **Cada publicação conferida vira uma linha de registro, gravada depois dela,** pelo `deploy/homologacao/registrar-publicacao.sh`:
   - o script só grava se o `conferir-publicacao.sh` aprovar (a pasta ativa, o serviço local e o domínio servindo o mesmo commit, que é a `main`, no ambiente de homologação);
   - a linha traz o lote, o commit inteiro, a build, o ambiente, o commit em que o CI local rodou, as migrations que entraram desde o registro anterior, a prova funcional feita no domínio e o endereço dos checks do GitHub;
   - nenhum segredo entra na linha.
3. **O registro fica na branch `registro/publicacoes`** do mesmo repositório: `publicacoes.jsonl` (a fonte, uma linha por publicação) e `PUBLICACOES.md` (a leitura). A branch não tem código. O CI só roda na `main` e em PRs: ela não dispara nada, e nada dela é publicado.
4. **Os documentos da `main` deixam de dizer o commit no ar e o que "falta publicar".** O quadro de `EXECUCAO_INTEGRAL_STATUS.md` e o `execucao-integral-status.json` guardam o histórico até 21/11 e apontam para o domínio e para o registro.
5. **A tela Entregas do projeto** mostra o lote sem data de publicação como "Nesta versão, a que você está usando": os dados dela saem do checkpoint do próprio commit que a serve.
6. **Publicado não é homologado:** o aceite de cada lote continua em `docs/aceite/` e na chave `aceites` do checkpoint.

## O que fica de fora

1. **A data da publicação de cada lote dentro da `main`** (o campo `publicado_em` dos aceites): fica vazia no lote que acabou de entrar. A tela não depende dela.
2. **A produção:** quando houver, terá o próprio registro, com a aprovação do proprietário a cada publicação.

## Consequências

1. **O Codex confere a publicação sem acesso ao servidor:** o domínio diz o commit, e o registro diz o que foi conferido e provado a cada vez.
2. **Um commit a mais por publicação,** numa branch à parte, sem passar pelo CI.
3. **Reverter:** parar de rodar o `registrar-publicacao.sh` e voltar a escrever o quadro na `main`. A branch do registro pode ficar como histórico.

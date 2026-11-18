# Roteiro de aceite: lote INTEG-d (a matriz das APIs, uma linha por integração)

- **Quem faz:** o proprietário.
- **Quanto tempo leva:** uns 10 minutos.
- **O que o lote entrega:** a seção 4 da sua orientação de 18/11: uma linha por API, com:
  - a documentação e a revisão;
  - as operações;
  - o que já existe;
  - o código e o acesso que faltam;
  - as variáveis, só pelos nomes;
  - o teste, a autenticação e os limites;
  - a idempotência, o aviso ou a reconsulta, e a conciliação;
  - os testes, a publicação e a homologação.

  Cada linha diz também **quem fornece o que falta** e **o que pode andar sem isso**.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## Os passos

1. Abra `docs/integracoes/MATRIZ_DAS_APIS.md` no GitHub.
2. Leia o resumo, no começo. São 23 integrações, cada uma com:
   - a situação;
   - o mínimo que falta;
   - quem fornece;
   - o que pode andar sem isso.
3. Confira se falta alguma integração que você pediu, ou se alguma situação está errada.
4. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

`packages/config/src/matriz-das-apis.test.ts` confere quatro coisas:

- cada linha tem as 15 colunas;
- a situação é uma das sete da sua orientação (não iniciado, parcial, código testado, configuração pendente, publicado, homologado, bloqueio externo);
- cada variável existe no `.env.example` e aparece só pelo nome;
- nenhum texto parece uma chave.

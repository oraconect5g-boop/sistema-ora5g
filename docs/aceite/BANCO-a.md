# Roteiro de aceite: lote BANCO-a (a arrumação do banco que o Supabase aponta)

- **Quem faz:** o proprietário, lendo este roteiro. Não há passo no celular.
- **Quanto tempo leva:** uns dois minutos.
- **O que o lote entrega:** o item 5 da onda 0 do plano de 16/11, que é a arrumação do banco que o próprio Supabase recomenda. Os requisitos ligados são o ORA-ORG-004 e o ORA-QUAL-002 (o isolamento por loja e o RLS). Nenhum deles muda de estado.
- **Resposta:** "aceito" ou "não aceito".
- **No ar:** desde 17/11, às 11:51, no commit `0bfad91`. O rodapé pode mostrar um commit mais novo, de um lote seguinte.

## O que mudou

São três arrumações. Nada muda no que as telas mostram nem nos dados.

1. **Índices em 9 ligações entre tabelas.**
   - **O que é:** um índice é como o índice de um livro, que ajuda o banco a achar uma linha sem ler a tabela inteira. Nove ligações entre tabelas não tinham um; por exemplo, a ligação de uma entrada de mercadoria com a loja.
   - **A décima, a das fotos,** já tinha um índice com as mesmas colunas, em outra ordem. Isso foi decidido em 09/11, na revisão do Codex. O Supabase ainda aponta essa ligação, porque pede a mesma ordem, e o aviso ficou aceito.
   - **Por que importa:** com poucos dados não faz diferença. Com o estoque e as vendas de 11 lojas, apagar ou mudar uma loja obrigaria o banco a ler tabelas inteiras.
2. **Proteção ligada na última tabela interna que ainda não tinha.** É a tabela que garante que um IMEI não se repete. Ela já era inacessível pela internet; agora fica igual a todas as outras.
3. **Uma nota explicativa nas tabelas que só o próprio banco usa.** São 10 tabelas sem regra de acesso de propósito, porque só as funções do banco leem e escrevem nelas. A nota diz isso a quem olha, e o aviso do Supabase deixa de parecer um esquecimento.

## Como foi conferido (pelo Claude Code)

| O que | Antes | Depois |
|---|---|---|
| Ligações entre tabelas sem índice (aviso do Supabase) | 10 | 1, a das fotos (já coberta; aviso aceito em 09/11) |
| Tabelas internas sem proteção | 1 | 0 |
| Tabelas sem regra e sem a nota explicativa | 9 | 0 |

- **Teste automático novo:** ele falha se uma tabela futura voltar a ficar sem índice, sem proteção ou sem a nota, ou se um índice repetir outro. Rodado sem a arrumação, ele falhou nos três pontos, como devia.
- **Avisos que continuam no Supabase**, todos esperados:
  - os índices ainda sem uso, porque a base está quase vazia;
  - a ligação das fotos, já coberta pelo índice de 09/11;
  - a proteção contra senha vazada, que só existe no plano pago e entra na decisão de produção.

## O que você confere

1. Leia "O que mudou", acima.
2. Responda **"aceito"** ou **"não aceito"**.

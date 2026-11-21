# Roteiro de aceite: lote ROB-a (a varredura de todas as telas e o Início que não cai)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação, com a sua conta de dono em `ora5g.com.br`, pelo celular.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** o seu pedido de 20/11, "quero que todas as funcionalidades do sistema funcionem depois aceleramos a velocidade". A frente de velocidade parou, e este é o primeiro lote da frente de funcionalidades: a varredura de todas as telas com as contas de teste e a correção do que ela achou. E a conta nova Dono (teste), com o seu sim de 21/11.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## A varredura (21/11, só lendo)

O script `scripts/varrer-telas.mjs` entra com uma conta de teste num celular de 360 px e visita toda tela que os links alcançam a partir do Início (o menu, os atalhos, os cartões e os links de cada tela, até 3 níveis), sem enviar formulário nenhum. Em cada tela, anota a resposta de erro, a página de erro ou de "não encontrada", os avisos de falha ou de indisponível e os erros do navegador.

| Conta | Telas visitadas |
|---|---|
| Dono (teste) | 105 |
| Gerente (teste) | 77 |
| Gerente 2 (teste) | 76 |
| Administrador (teste) | 42 |
| Vendedor (teste) | 5 (a varredura começou pelo Início, que caiu; ver abaixo) |

O que ela achou:

1. **O Início do Vendedor (teste) caiu,** na página "Algo deu errado nesta tela", e a do Gerente (teste) mostrou um painel com "Não foi possível ler agora".
   - Às 07:03 e 07:04 de 21/11, o banco de teste ficou lento sozinho, com pouca carga nossa (134 e 47 pedidos por minuto): pedidos de até 22 s e 7 consultas canceladas pelo limite de 8 s.
   - A leitura do que espera a pessoa (as pendências) foi uma delas, e pela regra de antes isso derrubava a tela inteira.
   - A página de erro não tem o menu, e o botão "Página inicial" leva de volta ao Início: quem entrava nesse momento ficava preso.
2. **O Financeiro mostra um cartão "Ainda não está no financeiro real",** com o que depende de contrato de fora (como a liquidação das maquininhas). Isso é proposital: mostrar como indisponível, sem número inventado.
3. Nenhuma tela respondeu "não encontrada" nem deu erro do servidor fora do minuto em que o banco ficou lento.

## O que mudou

1. **O Início não cai quando a leitura das pendências falha.** No lugar dos cartões aparece o aviso "Não deu para ler agora o que espera você nesta loja", com "tente de novo"; os painéis continuam. Nenhum cartão com zero inventado.
2. **A página de erro ganhou atalhos** para Vender, Vendas, Estoque e Caixa: ninguém fica preso nela.
3. **A conta Dono (teste),** com o seu sim de 21/11: fictícia (`@example.com`), com o papel de dono na rede inteira, criada como as outras (a senha só no arquivo protegido do servidor; o convite registrado em seu nome, com o motivo). Ela entrou na varredura para as telas que só o dono vê.

## O que depende de você (achado da varredura)

- **O banco de teste está no plano Micro do Supabase** e fica lento sozinho de vez em quando (em 19/11 às 16:11, 17:11 e 19:35; em 21/11 às 07:03). Nesses minutos, qualquer tela pode mostrar "Não foi possível ler agora". Um plano maior no Supabase resolve; é uma decisão de custo, sua.

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e abra o **Início**: ele deve abrir normalmente.
2. Se um dia aparecer a página "Algo deu errado nesta tela", os atalhos Vender, Vendas, Estoque e Caixa devem estar nela.
3. Responda **"aceito"** ou **"não aceito"**.

## Como varrer de novo (no servidor)

```bash
PROFUNDIDADE=3 LIMITE=220 node scripts/varrer-telas.mjs https://ora5g.com.br ~/homologacao/contas-de-teste.txt "Gerente (teste)" > varredura.json
```

Para o dono e o administrador, que escolhem a loja ao entrar, acrescente a loja no fim do comando: `"Santa Cândida (teste)"`.

## O que você não vê (provado pelo Claude Code)

- `apps/plataforma/src/app/inicio/inicio.test.ts`: com a leitura das pendências falhando (o banco lento, 57014), a tela continua, sem nenhum cartão de pendência e com o aviso. Os quatro testes que exigiam a queda da tela passaram para a regra nova.
- `apps/plataforma/src/app/erro.test.ts`: a página de erro tem os atalhos, nenhum deles pré-carrega.

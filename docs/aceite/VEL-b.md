# Roteiro de aceite: lote VEL-b (as telas com login com menos idas ao banco)

- **Quem faz:** o proprietário, no celular, em `https://ora5g.com.br`, com a entrada de dono.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** a segunda fatia da velocidade do plano de 16/11 (ORA-QUAL-010 e ORA-POS-002). As decisões são da [ADR-010](../adr/ADR-010-sessao-idas-ao-banco-e-retorno-imediato.md), na parte "O que veio no VEL-b".
  - As telas param de perguntar ao banco, uma a uma, o que o seu papel pode fazer. Isso já vem na leitura da sessão.
  - A busca do PDV pede o preço de todos os resultados de uma vez.
  - O Caixa lê em menos etapas.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga a tela e o que aconteceu.

## O que muda para você

Nada na aparência. Cada tela tem de mostrar os mesmos botões e as mesmas informações de antes. A diferença é o tempo: menos idas ao banco por tela.

Você não precisa medir nada. O registro de tempos da homologação está ligado e mostra as idas de cada tela que você abrir; o Claude Code compara com as aberturas de antes.

## Os passos

1. **Entrar:** entre como dono e escolha a loja **Santa Cândida (teste)**.
2. **Clientes** (menu Clientes): aparecem a busca e os botões "Novo cliente", "Segmentos" e "Duplicados".
3. **Vendas** (menu Operação): aparece a lista das vendas da loja.
4. **Caixa** (menu Operação): aparece o caixa aberto, ou o botão para abrir. Como dono, aparecem também os caixas fechados.
5. **Estoque** (menu Estoque e catálogo): aparece o painel do estoque.
6. **Catálogo** (menu Estoque e catálogo): aparecem os produtos. Para o dono, aparece também o envio de fotos.
7. **PDV, só se houver uma venda aberta** (menu Operação, Vender): busque "capa". O resultado mostra o preço (R$ 79,00) e o botão para adicionar. Sem venda aberta, pule este passo.
8. **Responder:** "aceito" ou "não aceito".

## O que você não vê no celular (provado pelo Claude Code)

- **As decisões:** os botões que cada papel vê saem da mesma regra do banco de antes. Pedir a permissão na loja do turno ou sem loja dá a mesma resposta, para todo papel e toda permissão (`packages/banco/src/sessao-molde-e-pdv.test.ts`).
- **O banco continua conferindo** cada consulta e cada ação.
- **A trava:** um teste impede que uma tela nova volte a perguntar a permissão uma a uma (`apps/plataforma/src/permissoes-do-molde.test.ts`).
- **O preço da busca:** é o mesmo de antes, numa ida só (`packages/banco/src/precos-em-lote.test.ts`).

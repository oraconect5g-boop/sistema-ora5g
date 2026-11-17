# ADR-009 — Loja online: "reserve no site e retire na loja" e a vitrine pública

**Situação:** proposta (15/11/2026), reversível. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. A decisão de começar pela retirada na loja é do proprietário (15/11/2026, "Sim, comece").

## Contexto

A loja online (ORA-ONLINE-001 a 008) estava parada nas decisões D-024 (o endereço do site), D-025 (de onde sai o estoque do online) e P10 (com qual CNPJ sai a nota, qual transportadora). Todas elas importam para a venda com entrega e com pagamento online, que depende de um provedor contratado (E1, ORA-PAY-014). Em 15/11 o proprietário aprovou começar por um caminho que não depende de nenhuma delas:

1. o cliente vê os produtos no site, com o preço e o estoque de cada loja;
2. reserva (ONLINE-b);
3. paga e retira na loja, onde o vendedor conclui a venda no PDV com a nota de sempre.

O banco já previa o canal: `produtos.publicar_online` (a caixa "mostrar na loja online" do cadastro), `precos.canal` com "online", `unidades.tipo` com "online", `vendas.canal` com "online" e a reserva de estoque com origem "online" (`reservar_estoque`).

## Decisões

1. **Onde:** dentro da própria plataforma, em `/loja` (o mesmo `ora5g.com.br`), sem aplicativo nem servidor novos. Mudar para `loja.ora5g.com.br` depois (D-024) é apontar o subdomínio para as mesmas páginas, ou separar o aplicativo; nada no banco muda. Enquanto o endereço não é decidido, as páginas pedem aos buscadores para não indexar.
2. **O que aparece:** só o que o dono marca para o site, no cadastro do produto, e está ativo. Nesta etapa, só aparelhos e acessórios (o que se retira na loja); chip, ativação, recarga e serviço ficam fora.
3. **O preço:** o do balcão de cada loja (canal "loja": a campanha, o preço da loja ou o da rede), o mesmo que o PDV cobra. Um preço próprio do site (canal "online") fica para a venda com entrega.
4. **O estoque:** em cada loja física ativa, "disponível", "últimas unidades" (1 ou 2) ou "sem estoque", sem a quantidade. Nunca aparecem o depósito, a assistência, o local DEFEITOS, a unidade "online" nem lojas de outra empresa.
5. **O que nunca sai:** custo, SKU, código de barras, quantidade, IMEI, reserva ou qualquer dado de cliente.
6. **Segurança:** é a primeira vez que o visitante sem login executa algo no banco, e só isto, de propósito:
   - `public.loja_vitrine`, `public.loja_produto` e `privado.foto_na_vitrine` (esta, chamada pela política do armazenamento; o visitante passa a ter uso do esquema privado só para ela);
   - o inventário de autorização lista exatamente as três e confere, com os 13 tipos de atacante, que as duas leituras não trazem nada fora do site, não mudam o banco nem escrevem na auditoria;
   - as fotos continuam no armazenamento privado: a política nova deixa o visitante gerar o link temporário (1 hora) só das fotos vigentes de produto do site.
7. **Ligar e desligar:** a variável `LOJA_ONLINE_ORGANIZACAO` (no servidor) diz qual empresa o site mostra; vazia, a loja online fica desligada e as páginas dizem isso.

## Decisões da reserva (ONLINE-b, 15 e 16/11/2026)

O proprietário aprovou (15/11, "Sim, siga") o prazo de 24 horas e até 2 reservas ativas por WhatsApp.

8. **Como o cliente reserva:** no produto, cada loja com estoque tem o botão "Reservar". A página confirma a variação, a loja e o preço do balcão e pede o nome, o WhatsApp (celular com DDD) e o aceite do uso desses dados só para a reserva. O cliente recebe um código de 6 letras e números (sem 0, O, 1 e I), a loja e até quando vale. Não há pagamento no site: paga-se na loja, na retirada.
9. **O que a reserva segura:** uma unidade, na mesma reserva de estoque do PDV (origem "online"), por 24 horas: o aparelho pelo IMEI, escolhido pelo banco (o primeiro livre, pulando o que outra venda segura naquele instante); o acessório pela quantidade. O preço anunciado fica gravado na reserva.
10. **Contra abuso:** até 2 reservas ativas por WhatsApp (OR034), até 20 reservas novas por loja por hora (OR035) e até 5 por hora por endereço de rede (na memória do servidor; conta o último endereço da lista x-forwarded-for, o que o Apache acrescenta, porque o começo dela pode ser inventado por quem pede). A mesma chave da página devolve a mesma reserva: o clique duplo não reserva duas vezes.
11. **Os dados do cliente:** o nome fica na reserva; o WhatsApp fica no esquema privado (fora da API) e, na tabela que a loja lê, só a máscara. A loja vê o número inteiro só quando pede, e o pedido fica na auditoria. Nada do que o cliente digita vai para log. O prazo de guarda desses dados é da política de privacidade (D-048).
12. **A loja:** quem vende na loja do turno tem a tela "Reservas do site" no menu: as ativas no prazo e as dos últimos 3 dias. Pode ver o WhatsApp, cancelar com motivo (a unidade volta ao estoque) ou atender: a reserva sai e a venda abre no PDV com a mesma unidade, na mesma transação. A oferta anunciada obriga (Código de Defesa do Consumidor, art. 30): se o preço de hoje for maior, o PDV avisa para dar a diferença como desconto, dentro das regras de desconto de sempre.
13. **O vencimento:** depois de 24 horas a reserva não se atende mais. A vitrine já conta a unidade como livre; o PDV e a tela da loja, ao abrir, soltam de vez as reservas do site vencidas da loja do turno (`loja_reservas_liberar_vencidas`, só as do site, sem esperar trava), e a próxima reserva daquele produto naquela loja também solta. A reserva do PDV vencida segue a regra de sempre.
14. **Concorrência:** provado num PostgreSQL 17 de verdade que o site e o balcão disputando os mesmos aparelhos nunca levam a mesma unidade (`packages/banco/src/loja-online-concorrencia.test.ts`).

## Decisão sobre o "não encontrado" (ONLINE-c, 17/11/2026)

15. **Fora do site, sem erro de servidor:** a API do banco responde HTTP 500 a todo erro da classe `P0` que não seja o `P0001`, e as funções do visitante diziam "não encontrado" com o `P0002`: cada visita ao endereço de um produto fora do site deixava um erro de servidor no registro, sem nada quebrado. Desde 17/11:
    - `public.loja_produto` devolve vazio (nulo), sem erro, para o produto fora do site: não marcado, inativo, chip, de outra empresa, sem preço em loja nenhuma ou que não existe. A resposta é a mesma em todos os casos, então ela não revela se o produto existe. A página mostra "não encontrada" (404).
    - `public.loja_reservar` recusa com o código próprio `OR036` ("não está à venda na loja online") quando o produto não está no site, a loja não é uma loja física ativa da empresa ou o produto não tem preço naquela loja. A API responde HTTP 400, como já faz com `OR001`, `OR004`, `OR034` e `OR035`. A tela diz que o produto não está mais disponível para reserva.
    - Uma falha de verdade (qualquer outro erro) mostra "A loja online está fora do ar agora" e grava no log só o código do erro.
    - As páginas continuam tratando o `P0002` como "não encontrada", para servir a um banco que ainda não recebeu a migration.
    - Nenhuma função que o visitante alcança tem o `P0002` no texto: as cinco que ele executa, as que elas chamam e os gatilhos das tabelas que elas citam (28 funções, conferidas no `ora5g-dev` em 17/11).
    - Fora desta decisão: as funções das telas com login e dos serviços internos, que ainda dizem "não encontrado" com `P0002`. Trocar o código nelas é um lote à parte.

## Consequências

- Nada aparece no site sem o dono marcar o produto. Hoje, nenhum está marcado.
- A vitrine é uma leitura: o PDV, o estoque e o caixa não mudam.
- O que vem depois:
  - **ONLINE-b, a reserva:** feita em 15 e 16/11 (decisões 8 a 14, acima). A política de privacidade passa pelo jurídico (D-048).
  - **ONLINE-c, sem erro de servidor para o visitante:** feito em 17/11 (decisão 15, acima).
  - **ONLINE-003:** a origem online na venda, sem atribuição indevida nem comissão em dobro.
  - **A entrega e o pagamento online:** só depois de D-024, D-025, P10 e do provedor de pagamento (E1).

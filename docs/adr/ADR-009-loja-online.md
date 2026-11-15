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

## Consequências

- Nada aparece no site sem o dono marcar o produto. Hoje, nenhum está marcado.
- A vitrine é uma leitura: o PDV, o estoque e o caixa não mudam.
- O que vem depois:
  - **ONLINE-b, a reserva:** o cliente informa o nome e o WhatsApp; a reserva segura o aparelho (pelo IMEI) ou a quantidade por algumas horas, com limite por telefone e por endereço de rede contra abuso. A loja vê a lista, cancela ou abre a venda no PDV com o item reservado e o preço reservado (o preço anunciado obriga). A política de privacidade passa pelo jurídico (D-048).
  - **ONLINE-003:** a origem online na venda, sem atribuição indevida nem comissão em dobro.
  - **A entrega e o pagamento online:** só depois de D-024, D-025, P10 e do provedor de pagamento (E1).

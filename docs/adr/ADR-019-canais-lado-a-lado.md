# ADR-019 — Os canais de venda lado a lado: lojas, site, marketplaces e anúncios no mesmo período

**Situação:** proposta (17/11/2026), reversível; aplicada no lote CANAIS-a. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo plano do proprietário de 16/11/2026 (Onda 3; ORA-REPORT-008: "Dashboard expansão nacional por marketplace, ads e canais — receitas, fees e margens por canal").

## Contexto

1. **Cada canal já tem a própria tela:**
   - as lojas: o Financeiro e os Relatórios;
   - o site: as reservas por origem (MKT-a);
   - os marketplaces: MKTPL-a;
   - os anúncios: META-a.
2. **Falta ver os canais juntos, no mesmo período,** para decidir onde crescer.

## Decisões

1. **Uma tela só, sem banco novo.** `/relatorios/canais` lê os painéis que já existem, no mesmo período e com a permissão de quem pede:
   - `financeiro_painel` (as vendas, as devoluções, os cancelamentos e a conciliação dos meios);
   - `margem_painel` (a margem bruta dos itens com custo);
   - `reservas_do_site_painel` (as vendas que vieram de reserva do site);
   - `marketplace_painel`;
   - `anuncios_painel`.
2. **Por canal:**
   - **Lojas físicas:** o vendido, as devoluções e os cancelamentos, a receita, as taxas dos meios já observadas na conciliação e a margem bruta.
   - **Site:** a parte das vendas das lojas que veio de reserva do site.
   - **Cada marketplace:** o bruto, as tarifas, o frete e os reembolsos, o líquido e o lucro estimado.
   - **Anúncios:** o valor usado e as vendas das campanhas.
3. **Nada conta duas vezes.** O site e os anúncios trazem clientes para as lojas: a receita deles já está dentro da receita das lojas e aparece só como parte dela.
4. **O resultado dos canais é estimado:** a margem das lojas, menos as taxas observadas, mais o lucro dos marketplaces, menos o valor usado nos anúncios.
   - Sem a margem das lojas (sem custo gravado), não há resultado.
   - Não é o lucro da empresa: as despesas fixas, as comissões e os impostos ficam fora.
5. **Só o dono vê** (`resultado.ver`), porque a tela junta o custo dos anúncios e o lucro dos marketplaces.

## O que fica de fora

1. **As taxas do cartão e do Pix ainda não conciliados:** só entram as observadas na conciliação.
2. **A loja online com compra completa** (ORA-ONLINE-002): quando existir, entra como canal próprio.
3. **Outras plataformas de anúncio e outros marketplaces:** entram quando tiverem o próprio painel.

## Consequências

1. **O dono compara os canais no mesmo período,** com o que cada um cobra e o que sobra.
2. **Reverter:** tirar a tela; nada no banco muda.

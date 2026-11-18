// Os canais de venda lado a lado (lote CANAIS-a: ORA-REPORT-008; ADR-019): a composição dos painéis de cada canal, com
// números FICTÍCIOS. O site e os anúncios não somam de novo o que já está nas lojas; o resultado só existe com a margem.
import { describe, expect, it } from "vitest";

import { lerPainelDosAnuncios } from "../anuncios/painel";
import type { PainelDoBanco } from "../financeiro/painel";
import type { PainelDasReservas } from "../loja/painel-das-reservas";
import type { MargemDoBanco } from "../margem/painel";
import { lerPainelDosMarketplaces } from "../marketplaces/regras";
import { anunciosNosCanais, lojasNosCanais, marketplacesNosCanais, receitaDaRede, resultadoDosCanais, type Canais } from "./painel";

const financeiro = {
  periodos: [{ periodo: "2026-11-16", vendas: 3, vendido: 50_000, cancelamentos: 0, cancelado: 0, devolucoes: 1, devolvido: 5_000 },
    { periodo: "2026-11-17", vendas: 2, vendido: 30_000, cancelamentos: 1, cancelado: 2_000, devolucoes: 0, devolvido: 0 }],
  pagamentos: [
    { meio: "cartao_picpay", situacao: "confirmado", meioEntrada: null, quantidade: 3, valor: 40_000, entrada: 0, troco: 0, conciliacao: { conciliados: 2, conciliado: 30_000, liquido: 29_100 } },
    { meio: "dinheiro", situacao: "confirmado", meioEntrada: null, quantidade: 2, valor: 40_000, entrada: 0, troco: 0, conciliacao: null },
  ],
  reembolsos: [], estornos: [], aReceber: [], movimentos: [],
  caixas: { abertosAgora: 0, fechados: 2, conferidos: 2, comDiferenca: 0, diferenca: 0, diferencaAbsoluta: 0 },
} as unknown as PainelDoBanco;
const margem = { totais: { margem: 20_000 } } as unknown as MargemDoBanco;
const reservas = { origens: [{ origem: "instagram", fonte: "instagram", campanha: "natal", reservas: 3, atendidas: 2, canceladas: 0, vencidas: 0, vendas: 2, vendasCentavos: 15_800 }], vendedores: [] } as PainelDasReservas;
const marketplaces = lerPainelDosMarketplaces({
  canais: [{ canal: "shopee", pedidos: 3, unidades: 4, bruto: 28_700, reembolsos: 7_900, tarifas: 2_500, frete: 800, liquido: 16_700, liquidos_estimados: 1, custo: 6_000, lucro: 6_500, pedidos_sem_custo: 1 }],
  anuncios: [], pedidos: [], pedidos_no_periodo: 3, itens_sem_produto: 0,
});
const anuncios = lerPainelDosAnuncios({
  campanhas: [{ chave: "natal", campanha: "Natal", gasto: 15_000, impressoes: null, cliques: null, resultados: null, dias: 2, reservas: 2, oportunidades: 0,
    vendas: 2, vendas_devolvidas: 0, receita: 15_800, devolvido: 0, margem: 7_000, vendas_sem_custo: 0, recebido: 15_800, reembolsado: 0, clientes_novos: 1 }],
  por_loja: [], por_vendedor: [], contatos_sem_campanha: 0, importado_ate: "2026-11-17",
});

describe("os canais lado a lado", () => {
  it("as lojas: o vendido, as devoluções e os cancelamentos, a receita, as taxas observadas na conciliação, a margem e o site", () => {
    expect(lojasNosCanais(financeiro, margem, reservas)).toEqual({
      vendas: 5, vendido: 80_000, devolvidoECancelado: 7_000, receita: 73_000, taxas: 900, conciliado: 30_000, margem: 20_000, doSite: { vendas: 2, valor: 15_800 },
    });
    expect(lojasNosCanais(financeiro, null, null)).toMatchObject({ margem: null, doSite: null });
  });

  it("os marketplaces e os anúncios; a receita da rede não soma de novo o site nem os anúncios; o resultado estimado", () => {
    const canais: Canais = { lojas: lojasNosCanais(financeiro, margem, reservas), marketplaces: marketplacesNosCanais(marketplaces), anuncios: anunciosNosCanais(anuncios) };
    expect(canais.marketplaces).toEqual([{ canal: "shopee", nome: "Shopee", pedidos: 3, bruto: 28_700, taxas: 11_200, liquido: 16_700, lucro: 6_500, semCusto: 1 }]);
    expect(canais.anuncios).toEqual({ gasto: 15_000, vendas: 2, receita: 15_800 });
    expect(receitaDaRede(canais)).toBe(73_000 + 28_700);
    expect(resultadoDosCanais(canais)).toBe(20_000 - 900 + 6_500 - 15_000);
    expect(resultadoDosCanais({ ...canais, lojas: { ...canais.lojas, margem: null } })).toBeNull();
  });
});

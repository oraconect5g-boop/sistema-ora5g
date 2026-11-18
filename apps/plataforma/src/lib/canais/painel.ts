// Os canais de venda lado a lado (lote CANAIS-a: ORA-REPORT-008; ADR-019): as lojas físicas (e, delas, o que veio do site),
// cada marketplace e os anúncios, no mesmo período, com a receita, as taxas e tarifas, o líquido e a margem de cada um. Nada
// é somado aqui que o banco não tenha somado: cada número vem do painel do próprio canal (financeiro_painel, margem_painel,
// reservas_do_site_painel, marketplace_painel e anuncios_painel), lido com a permissão de quem pede.
import type { PainelDosAnuncios } from "../anuncios/painel";
import { totalDasCampanhas } from "../anuncios/painel";
import type { PainelDoBanco } from "../financeiro/painel";
import type { MargemDoBanco } from "../margem/painel";
import type { PainelDasReservas } from "../loja/painel-das-reservas";
import { totaisDasReservas } from "../loja/painel-das-reservas";
import { CANAIS_DOS_MARKETPLACES, type CanalDoMarketplace } from "../marketplaces/leitura";
import type { PainelDosMarketplaces } from "../marketplaces/regras";

export type LojasNosCanais = {
  vendas: number; vendido: number; devolvidoECancelado: number; receita: number;
  /** As taxas dos meios de pagamento já observadas na conciliação (o valor conciliado menos o líquido que caiu). */
  taxas: number; conciliado: number;
  /** A margem bruta (itens com custo gravado); nula sem a leitura do custo. */
  margem: number | null;
  /** Das vendas das lojas, as que vieram de reserva do site (já dentro da receita das lojas). */
  doSite: { vendas: number; valor: number } | null;
};
export type MarketplaceNosCanais = { canal: CanalDoMarketplace; nome: string; pedidos: number; bruto: number; taxas: number; liquido: number; lucro: number; semCusto: number };
export type AnunciosNosCanais = { gasto: number; vendas: number; receita: number };
export type Canais = { lojas: LojasNosCanais; marketplaces: MarketplaceNosCanais[]; anuncios: AnunciosNosCanais | null };

/** As lojas físicas no período, pelo financeiro (as vendas e os meios), pela margem e pelas reservas do site. */
export function lojasNosCanais(financeiro: PainelDoBanco, margem: MargemDoBanco | null, reservas: PainelDasReservas | null): LojasNosCanais {
  const somar = <T>(itens: readonly T[], f: (i: T) => number) => itens.reduce((s, i) => s + f(i), 0);
  const vendido = somar(financeiro.periodos, (p) => p.vendido);
  const devolvidoECancelado = somar(financeiro.periodos, (p) => p.cancelado + p.devolvido);
  const conciliados = financeiro.pagamentos.filter((p) => p.conciliacao !== null);
  const conciliado = somar(conciliados, (p) => p.conciliacao?.conciliado ?? 0);
  const liquido = somar(conciliados, (p) => p.conciliacao?.liquido ?? 0);
  const site = reservas ? totaisDasReservas(reservas) : null;
  return {
    vendas: somar(financeiro.periodos, (p) => p.vendas), vendido, devolvidoECancelado, receita: vendido - devolvidoECancelado,
    taxas: conciliado - liquido, conciliado, margem: margem ? margem.totais.margem : null,
    doSite: site ? { vendas: site.vendas, valor: site.vendasCentavos } : null,
  };
}

/** Cada marketplace no período: as taxas são as tarifas, o frete pago pelo vendedor e os reembolsos. */
export const marketplacesNosCanais = (p: PainelDosMarketplaces): MarketplaceNosCanais[] => p.canais.map((c) => ({
  canal: c.canal, nome: CANAIS_DOS_MARKETPLACES[c.canal], pedidos: c.pedidos, bruto: c.bruto, taxas: c.tarifas + c.frete + c.reembolsos,
  liquido: c.liquido, lucro: c.lucro, semCusto: c.pedidosSemCusto,
}));

/**
 * Os anúncios no período: o valor usado e a receita das vendas que vieram das campanhas (já dentro da receita das lojas),
 * como a das lojas: sem as devoluções (lote AUD-a). As vendas são as que ficaram (sem as devolvidas por inteiro).
 */
export function anunciosNosCanais(p: PainelDosAnuncios): AnunciosNosCanais {
  const t = totalDasCampanhas(p.campanhas);
  return { gasto: t.gasto, vendas: t.vendas - t.vendasDevolvidas, receita: t.receita - t.devolvido };
}

/**
 * O resultado dos canais, estimado: a margem das lojas menos as taxas dos meios observadas, mais o lucro dos marketplaces,
 * menos o valor usado nos anúncios. Nulo sem a margem das lojas (sem custo gravado não há como estimar).
 */
export function resultadoDosCanais(c: Canais): number | null {
  if (c.lojas.margem === null) return null;
  return c.lojas.margem - c.lojas.taxas + c.marketplaces.reduce((s, m) => s + m.lucro, 0) - (c.anuncios?.gasto ?? 0);
}

/**
 * GRAF-a (a orientação do proprietário de 18/11: "estado vazio não pode mascarar falha de consulta"): por que a margem das
 * lojas ou as reservas do site faltam. "falha": a leitura não respondeu agora (tentar de novo); "indisponivel": o banco ainda
 * não tem a função. Nulo: a leitura veio. Nenhum dos dois é "sem o custo" nem zero.
 */
export type FaltaDaLeitura = "falha" | "indisponivel" | null;
export const faltaDaLeitura = (leitura: { estado: "ok" | "indisponivel" | "falha" }): FaltaDaLeitura => (leitura.estado === "ok" ? null : leitura.estado);

/** A margem bruta das lojas como a tela mostra: o valor, ou o motivo de faltar (nunca "sem o custo" por engano). */
export function textoDaMargemDasLojas(margem: number | null, falta: FaltaDaLeitura, comSinal: (centavos: number) => string): string {
  if (margem !== null) return comSinal(margem);
  return falta === "indisponivel" ? "— (ainda não disponível neste banco)" : "— (não deu para ler agora)";
}

/** O detalhe do resultado estimado: o que entra na conta, ou por que ele falta. */
export function detalheDoResultado(resultado: number | null, falta: FaltaDaLeitura): string {
  if (resultado !== null) return "margem das lojas − taxas + lucro dos marketplaces − anúncios";
  return falta === "indisponivel" ? "a margem das lojas ainda não está disponível neste banco" : "não deu para ler a margem das lojas agora: tente de novo";
}

/** A receita da rede: a das lojas (líquida de devoluções e cancelamentos) e o bruto de cada marketplace. */
export const receitaDaRede = (c: Canais) => c.lojas.receita + c.marketplaces.reduce((s, m) => s + m.bruto, 0);

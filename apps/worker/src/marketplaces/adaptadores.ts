// Os adaptadores dos marketplaces (lote MKTPL-a; ORA-MKTPL-001, ORA-MKTPL-002 e ORA-MKTPL-007; ADR-018). Cada canal tem o
// próprio adaptador, separado dos outros, e nenhum está pronto: cada um só entra com o contrato verificado (o aplicativo
// aprovado no portal do canal, a autorização da conta do vendedor e a documentação oficial conferida). Até lá, os pedidos
// entram por arquivo (/relatorios/marketplaces) e nada conversa com os canais. Os nomes das variáveis são os de
// docs/integracoes/VARIAVEIS_DE_AMBIENTE.md; nenhum endereço, campo ou formato de canal é suposto aqui.

export const CANAIS = ["mercado_livre", "shopee", "tiktok_shop"] as const;
export type Canal = (typeof CANAIS)[number];

/** O adaptador oficial de cada canal, com o contrato verificado. Nenhum está pronto. */
export const ADAPTADOR_PRONTO: Readonly<Record<Canal, boolean>> = { mercado_livre: false, shopee: false, tiktok_shop: false };

const VARIAVEIS_DO_CANAL: Readonly<Record<Canal, readonly string[]>> = {
  mercado_livre: ["MERCADOLIVRE_APP_ID", "MERCADOLIVRE_CLIENT_SECRET", "MERCADOLIVRE_REDIRECT_URI", "MERCADOLIVRE_WEBHOOK_PATH"],
  shopee: ["SHOPEE_ENVIRONMENT", "SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "SHOPEE_REDIRECT_URI"],
  tiktok_shop: ["TIKTOKSHOP_APP_KEY", "TIKTOKSHOP_APP_SECRET", "TIKTOKSHOP_SERVICE_ID", "TIKTOKSHOP_REDIRECT_URI"],
};

/**
 * O que falta para ligar o canal, na ordem em que se resolve; vazio = pode ligar. Só nomes: valores nunca aparecem. Os
 * tokens de cada conta ficam no banco, criptografados com APP_ENCRYPTION_KEY (vencem em horas e são renovados).
 */
export function oQueFaltaParaOCanal(canal: Canal, ler: (nome: string) => string): string[] {
  return [
    ...["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "APP_ENCRYPTION_KEY", ...VARIAVEIS_DO_CANAL[canal]].filter((nome) => !ler(nome)),
    ...(ADAPTADOR_PRONTO[canal] ? [] : ["o adaptador oficial do canal (espera o contrato verificado e a documentação oficial conferida)"]),
  ];
}

/** O pedido no formato comum: o mesmo da importação por arquivo (lib/marketplaces/leitura.ts), em centavos. */
export type ItemComum = { numero: number; codigo?: string; titulo?: string; quantidade: number; valor: number };
export type PedidoComum = {
  id_externo: string; data: string; situacao?: string; bruto: number; tarifas?: number; frete?: number; reembolsos?: number; liquido?: number;
  data_repasse?: string; itens: ItemComum[];
};

/** O que cada adaptador fará quando o contrato chegar. A interface é nossa; o contrato do canal, não: nada dele é suposto. */
export interface AdaptadorDeMarketplace {
  readonly canal: Canal;
  /** Os pedidos criados ou mudados desde o instante dado, já no formato comum. */
  pedidosDesde(desde: Date): Promise<PedidoComum[]>;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const centavos = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 100_000_000_000;
/**
 * Confere o pedido de um adaptador antes de ir ao banco, com as regras da importação por arquivo: devolve o que está fora
 * (vazio = certo). O banco confere de novo.
 */
export function conferirPedido(p: PedidoComum): string[] {
  const fora: string[] = [];
  if (!/^[^\s]{1,80}$/.test(p.id_externo)) fora.push("id_externo");
  if (!DIA.test(p.data)) fora.push("data");
  if (!centavos(p.bruto)) fora.push("bruto");
  for (const campo of ["tarifas", "frete", "reembolsos"] as const) if (p[campo] !== undefined && !centavos(p[campo])) fora.push(campo);
  if (p.liquido !== undefined && !(Number.isSafeInteger(p.liquido) && Math.abs(p.liquido) <= 100_000_000_000)) fora.push("liquido");
  if (p.data_repasse !== undefined && !DIA.test(p.data_repasse)) fora.push("data_repasse");
  if (p.itens.length < 1 || p.itens.length > 500) fora.push("itens");
  p.itens.forEach((i, n) => {
    if (!(Number.isSafeInteger(i.quantidade) && i.quantidade >= 1 && i.quantidade <= 100_000) || !centavos(i.valor) || (i.codigo !== undefined && i.codigo.length > 80)) fora.push(`itens[${n}]`);
  });
  if (fora.length === 0 && p.itens.reduce((s, i) => s + i.valor, 0) !== p.bruto) fora.push("bruto");
  return fora;
}

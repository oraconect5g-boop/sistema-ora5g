// Os adaptadores dos marketplaces (lote MKTPL-a; ORA-MKTPL-001): separados por canal, nenhum pronto sem o contrato, e o
// formato comum conferido antes do banco. O adaptador de mentira abaixo usa pedidos FICTÍCIOS (fixtures): ele prova a
// interface, não o contrato de canal nenhum.
import { describe, expect, it } from "vitest";

import { ADAPTADOR_PRONTO, CANAIS, conferirPedido, oQueFaltaParaOCanal, type AdaptadorDeMarketplace, type PedidoComum } from "./adaptadores.ts";

const ambiente = (valores: Record<string, string>) => (nome: string) => valores[nome] ?? "";
const PEDIDOS: PedidoComum[] = [
  { id_externo: "FIXTURE-1", data: "2026-11-17", situacao: "pago", bruto: 7_900, tarifas: 1_000, itens: [{ numero: 1, codigo: "ANUNCIO-1", quantidade: 1, valor: 7_900 }] },
  { id_externo: "FIXTURE 2", data: "17/11/2026", bruto: 100, itens: [{ numero: 1, quantidade: 0, valor: 50 }] },
];
const deMentira: AdaptadorDeMarketplace = { canal: "mercado_livre", pedidosDesde: async () => PEDIDOS };

describe("os adaptadores dos marketplaces", () => {
  it("um por canal, nenhum pronto: mesmo com todas as variáveis, falta o adaptador oficial", () => {
    expect(CANAIS).toEqual(["mercado_livre", "shopee", "tiktok_shop"]);
    for (const canal of CANAIS) expect(ADAPTADOR_PRONTO[canal], canal).toBe(false);
    expect(oQueFaltaParaOCanal("shopee", ambiente({}))).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "APP_ENCRYPTION_KEY", "SHOPEE_ENVIRONMENT", "SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "SHOPEE_REDIRECT_URI",
      "o adaptador oficial do canal (espera o contrato verificado e a documentação oficial conferida)",
    ]);
    const tudo = Object.fromEntries(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "APP_ENCRYPTION_KEY", "MERCADOLIVRE_APP_ID", "MERCADOLIVRE_CLIENT_SECRET",
      "MERCADOLIVRE_REDIRECT_URI", "MERCADOLIVRE_WEBHOOK_PATH"].map((n) => [n, "x"]));
    expect(oQueFaltaParaOCanal("mercado_livre", ambiente(tudo))).toEqual(["o adaptador oficial do canal (espera o contrato verificado e a documentação oficial conferida)"]);
  });

  it("o pedido do adaptador é conferido antes do banco, com as regras da importação por arquivo", async () => {
    const [certo, errado] = await deMentira.pedidosDesde(new Date("2026-11-17T00:00:00Z"));
    expect(conferirPedido(certo as PedidoComum)).toEqual([]);
    expect(conferirPedido(errado as PedidoComum)).toEqual(["id_externo", "data", "itens[0]"]);
    expect(conferirPedido({ ...(certo as PedidoComum), bruto: 8_000 })).toEqual(["bruto"]);
  });
});

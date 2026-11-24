// A compra que nasceu no site (lote CRM-009a): a leitura da ligação entre a venda do balcão e o pedido ou a reserva do
// site que ela atendeu, e os textos das telas. Supabase SIMULADO; dados FICTÍCIOS.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({ FalhaDoServico: class FalhaDoServico extends Error {} }));

import { chegadaDoVisitante, fraseDaVendaDoSite, lerVendasDoSite, nomeDaVendaDoSite, type VendaDoSite } from "./vendas-do-site";

const V1 = "00000000-0000-4000-8000-0000000000a1";
const V2 = "00000000-0000-4000-8000-0000000000a2";
const V3 = "00000000-0000-4000-8000-0000000000a3";
const PEDIDO = "00000000-0000-4000-8000-0000000000b1";

type Linha = Record<string, unknown>;
const banco = { tabelas: {} as Record<string, Linha[]>, erros: {} as Record<string, { code: string }>, pedidos: [] as { tabela: string; filtros: [string, unknown][] }[] };
function cliente() {
  return {
    from: (tabela: string) => {
      const pedido = { tabela, filtros: [] as [string, unknown][] };
      banco.pedidos.push(pedido);
      let linhas = [...(banco.tabelas[tabela] ?? [])];
      const q = {
        select: () => q,
        in: (coluna: string, valores: unknown[]) => { pedido.filtros.push([coluna, valores]); linhas = linhas.filter((l) => valores.includes(l[coluna])); return q; },
        eq: (coluna: string, valor: unknown) => { pedido.filtros.push([coluna, valor]); linhas = linhas.filter((l) => l[coluna] === valor); return q; },
        order: () => q,
        then: (resolver: (r: { data: Linha[] | null; error: { code: string } | null }) => unknown) =>
          Promise.resolve(banco.erros[tabela] ? { data: null, error: banco.erros[tabela] } : { data: linhas, error: null }).then(resolver),
      };
      return q;
    },
  } as never;
}
const reserva = (extra: Linha) => ({ venda_id: V1, numero: 1, codigo: "RSV234", criada_em: "2026-11-08T12:00:00Z", origem: null, pedido_id: null, situacao: "atendida", ...extra });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  banco.tabelas = {};
  banco.erros = {};
  banco.pedidos = [];
});

describe("a leitura das vendas que vieram do site", () => {
  it("sem venda nenhuma, nada é lido", async () => {
    expect(await lerVendasDoSite(cliente(), [])).toEqual({ estado: "ok", itens: [] });
    expect(banco.pedidos).toEqual([]);
  });

  it("o pedido com duas unidades vira uma linha da venda, com o código do pedido, a data dele e a origem; a reserva avulsa, com o código dela", async () => {
    banco.tabelas = {
      loja_reservas: [
        reserva({ venda_id: V1, numero: 11, codigo: "UNI234", pedido_id: PEDIDO, origem: "instagram", criada_em: "2026-11-08T12:00:01Z" }),
        reserva({ venda_id: V1, numero: 12, codigo: "UNI235", pedido_id: PEDIDO, origem: "instagram", criada_em: "2026-11-08T12:00:01Z" }),
        reserva({ venda_id: V2, numero: 13, codigo: "RSV777", origem: "direto", criada_em: "2026-11-09T18:30:00Z" }),
        // A reserva cancelada ou ainda ativa não é de venda nenhuma; a de outra venda não foi pedida.
        reserva({ venda_id: V2, numero: 14, situacao: "cancelada" }),
        reserva({ venda_id: "00000000-0000-4000-8000-0000000000ff", numero: 15 }),
      ],
      loja_pedidos: [{ id: PEDIDO, codigo: "ABC234", criado_em: "2026-11-08T12:00:00Z", venda_id: V1 }],
    };
    const lido = await lerVendasDoSite(cliente(), [V1, V2, V3]);
    expect(lido).toEqual({ estado: "ok", itens: [
      { vendaId: V1, tipo: "pedido", codigo: "ABC234", feitoEm: "2026-11-08T12:00:00Z", unidades: 2, origem: "instagram" },
      { vendaId: V2, tipo: "reserva", codigo: "RSV777", feitoEm: "2026-11-09T18:30:00Z", unidades: 1, origem: "direto" },
    ] });
    // As duas leituras saem juntas e só pedem as vendas dadas; das reservas, só as atendidas.
    expect(banco.pedidos.map((p) => p.tabela)).toEqual(["loja_reservas", "loja_pedidos"]);
    expect(banco.pedidos[0]?.filtros).toEqual([["venda_id", [V1, V2, V3]], ["situacao", "atendida"]]);
    expect(banco.pedidos[1]?.filtros).toEqual([["venda_id", [V1, V2, V3]]]);
  });

  it("o pedido que quem pergunta não pode ler segue como pedido do site, sem o código; a origem desconhecida fica sem registro", async () => {
    banco.tabelas = { loja_reservas: [reserva({ pedido_id: PEDIDO, origem: "uma_origem_nova" })], loja_pedidos: [] };
    const lido = await lerVendasDoSite(cliente(), [V1]);
    expect(lido).toEqual({ estado: "ok", itens: [{ vendaId: V1, tipo: "pedido", codigo: null, feitoEm: "2026-11-08T12:00:00Z", unidades: 1, origem: null }] });
  });

  it("falha de leitura é falha (nunca \"não veio do site\"); tabela ou coluna que o banco não tem esconde o bloco", async () => {
    banco.tabelas = { loja_reservas: [reserva({})] };
    banco.erros = { loja_reservas: { code: "57014" } };
    expect(await lerVendasDoSite(cliente(), [V1])).toEqual({ estado: "falha" });
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("loja: falha ao ler as vendas que vieram do site", { fonte: "loja_reservas", codigo: "57014" });
    banco.erros = { loja_pedidos: { code: "57014" } };
    expect(await lerVendasDoSite(cliente(), [V1])).toEqual({ estado: "falha" });
    for (const codigo of ["42P01", "PGRST205", "42703"]) {
      banco.erros = { loja_reservas: { code: codigo } };
      expect(await lerVendasDoSite(cliente(), [V1]), codigo).toEqual({ estado: "indisponivel" });
    }
  });
});

describe("os textos das telas", () => {
  const base: VendaDoSite = { vendaId: V1, tipo: "pedido", codigo: "ABC234", feitoEm: "2026-11-08T12:00:00Z", unidades: 2, origem: "instagram" };

  it("o nome curto: o pedido ou a reserva, com o código que o visitante recebeu", () => {
    expect(nomeDaVendaDoSite(base)).toBe("pedido do site ABC234");
    expect(nomeDaVendaDoSite({ tipo: "pedido", codigo: null })).toBe("pedido do site");
    expect(nomeDaVendaDoSite({ tipo: "reserva", codigo: "RSV777" })).toBe("reserva do site RSV777");
  });

  it("de onde o visitante chegou, quando há registro", () => {
    expect(chegadaDoVisitante(null)).toBeNull();
    expect(chegadaDoVisitante("instagram")).toBe("chegou por Instagram");
    expect(chegadaDoVisitante("google")).toBe("chegou por Google");
    expect(chegadaDoVisitante("direto")).toBe("chegou direto ao site");
    expect(chegadaDoVisitante("outro_site")).toBe("chegou por outro site");
    expect(chegadaDoVisitante("email")).toBe("chegou por e-mail");
  });

  it("a frase da tela da venda diz de onde veio e que a venda segue do balcão", () => {
    expect(fraseDaVendaDoSite(base)).toBe(
      "Esta venda atendeu o pedido do site ABC234, feito em 08/11/2026 (2 unidades; o visitante chegou por Instagram). "
      + "O cliente reservou no site e retirou e pagou na loja: a venda é do balcão, e a origem fica guardada no pedido.");
    expect(fraseDaVendaDoSite({ ...base, tipo: "reserva", codigo: "RSV777", unidades: 1, origem: null })).toBe(
      "Esta venda atendeu a reserva do site RSV777, feita em 08/11/2026. "
      + "O cliente reservou no site e retirou e pagou na loja: a venda é do balcão, e a origem fica guardada na reserva.");
    // A data é a de São Paulo: 02:30 de 09/11 em UTC ainda é 08/11 à noite aqui.
    expect(fraseDaVendaDoSite({ ...base, feitoEm: "2026-11-09T02:30:00Z", unidades: 1, origem: null })).toContain("feito em 08/11/2026.");
  });
});

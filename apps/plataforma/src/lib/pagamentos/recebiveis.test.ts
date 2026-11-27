// Leitura dos recebíveis por loja e adquirente (lote L8e: ORA-FIN-005). Resposta FICTÍCIA no formato de
// public.recebiveis_painel; as regras do banco estão em packages/banco/src/recebiveis.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADQUIRENTES, consultarRecebiveis, DO_EXTRATO, enderecoDosRecebiveis, fracaoDaDiferenca, idadeDoRecebivel, lerFiltro, lerRecebiveis, porAdquirente, somar,
} from "./recebiveis";
import { PROVEDORES } from "./regras";

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b1";
const VENDA = "00000000-0000-4000-9000-000000000001";
const PAG = "00000000-0000-4000-9000-000000000002";
const CONTA = "00000000-0000-4000-9000-000000000003";

const linha = (extra: Record<string, unknown>) => ({
  unidade: A, adquirente: "picpay", a_receber: 0, valor_a_receber: 0, ate_7_dias: 0, de_8_a_30_dias: 0, mais_de_30_dias: 0, mais_antiga_dias: null,
  recebidos: 0, recebido_bruto: 0, recebido_liquido: 0, estornos_a_confirmar: 0, valor_estornos_a_confirmar: 0, ...extra,
});
const resposta = () => ({
  hoje: "2026-11-14", dias: 30, unidade: null,
  lojas: [{ id: A, nome: "Loja A" }, { id: B, nome: "Loja B" }],
  linhas: [
    linha({ a_receber: 2, valor_a_receber: 15_800, ate_7_dias: 7_900, mais_de_30_dias: 7_900, mais_antiga_dias: 40, estornos_a_confirmar: 1, valor_estornos_a_confirmar: 7_900 }),
    linha({ adquirente: "pagbank", recebidos: 1, recebido_bruto: 7_900, recebido_liquido: 7_600 }),
    linha({ adquirente: "payjoy", a_receber: 1, valor_a_receber: 129_900, ate_7_dias: 129_900, mais_antiga_dias: 0 }),
    linha({ unidade: B, adquirente: "pagbank", a_receber: 1, valor_a_receber: 7_900, de_8_a_30_dias: 7_900, mais_antiga_dias: 9 }),
  ],
  total_a_receber: { quantidade: 4, valor: 153_600 },
  mais_antigos: [
    { tipo: "pagamento", id: PAG, venda_id: VENDA, venda_numero: 12, unidade: A, adquirente: "picpay", valor: 7_900, dias: 40, terminal: "Balcão" },
    { tipo: "financeira", id: CONTA, venda_id: VENDA, venda_numero: 13, unidade: A, adquirente: "payjoy", valor: 129_900, dias: 0, terminal: null },
  ],
  pendencias: {
    sem_maquininha: { quantidade: 1, valor: 7_900 }, entradas_na_maquininha: { quantidade: 0, valor: 0 }, financeira_de_venda_cancelada: { quantidade: 1, valor: 125_000 },
  },
});

describe("leitura estrita dos recebíveis (L8e)", () => {
  it("lê a resposta do banco com as lojas, as linhas, os mais antigos e as pendências", () => {
    const r = lerRecebiveis(resposta());
    expect(r.lojas.map((l) => l.nome)).toEqual(["Loja A", "Loja B"]);
    expect(r.linhas[0]).toEqual({
      unidade: A, adquirente: "picpay", aReceber: 2, valorAReceber: 15_800, ate7Dias: 7_900, de8a30Dias: 0, maisDe30Dias: 7_900, maisAntigaDias: 40,
      recebidos: 0, recebidoBruto: 0, recebidoLiquido: 0, estornos: 1, valorEstornos: 7_900,
    });
    expect(r.maisAntigos.map((m) => [m.tipo, m.vendaNumero, m.terminal])).toEqual([["pagamento", 12, "Balcão"], ["financeira", 13, null]]);
    expect(r.pendencias.financeiraDeVendaCancelada).toEqual({ quantidade: 1, valor: 125_000 });
    expect(r.totalAReceber).toEqual({ quantidade: 4, valor: 153_600 });
  });

  it("conta que não fecha é falha de leitura, nunca número", () => {
    const quebrar: ((d: ReturnType<typeof resposta>) => void)[] = [
      (d) => { d.linhas[0]!.ate_7_dias = 7_800; }, // as idades não somam o a receber
      (d) => { d.linhas[0]!.mais_antiga_dias = null; }, // a receber sem a idade da mais antiga
      (d) => { d.linhas[1]!.recebido_liquido = 8_000; }, // caiu mais do que o bruto
      (d) => { d.linhas[2]!.estornos_a_confirmar = 1; d.linhas[2]!.valor_estornos_a_confirmar = 100; }, // estorno de financeira
      (d) => { d.linhas[0]!.adquirente = "stone"; }, // adquirente desconhecido
      (d) => { d.linhas[3]!.unidade = "00000000-0000-4000-8000-0000000000ff"; }, // loja fora da lista
      (d) => { d.linhas.push({ ...d.linhas[0]! }); }, // linha repetida
      (d) => { d.total_a_receber.valor = 1; }, // total diferente das linhas
      (d) => { d.mais_antigos.reverse(); }, // fora de ordem
      (d) => { d.mais_antigos[1]!.adquirente = "picpay"; }, // financeira com adquirente de maquininha
      (d) => { d.pendencias.sem_maquininha.valor = 0; }, // quantidade sem valor
      (d) => { (d as { unidade: string | null }).unidade = B; }, // recorte de uma loja com linhas de outra
      (d) => { d.lojas = []; },
      (d) => { d.dias = 120; },
      (d) => { (d as { hoje: string }).hoje = "14/11/2026"; },
    ];
    for (const [i, q] of quebrar.entries()) {
      const d = resposta();
      q(d);
      expect(() => lerRecebiveis(d), `caso ${i}`).toThrow();
    }
  });

  it("as somas da tela vêm das linhas: maquininhas e Pix, financeiras e por quem deve, com a diferença observada", () => {
    const r = lerRecebiveis(resposta());
    expect(somar(r.linhas, ["picpay", "pagbank", "conta"])).toMatchObject({ aReceber: 3, valorAReceber: 23_700, maisDe30Dias: 7_900, maisAntigaDias: 40, recebidoBruto: 7_900, recebidoLiquido: 7_600, estornos: 1 });
    expect(somar(r.linhas, ["payjoy", "aiva"])).toMatchObject({ aReceber: 1, valorAReceber: 129_900, maisAntigaDias: 0 });
    expect(porAdquirente(r.linhas).map((a) => [a.adquirente, a.soma.valorAReceber, a.soma.recebidos])).toEqual([["picpay", 15_800, 0], ["pagbank", 7_900, 1], ["payjoy", 129_900, 0]]);
    expect(fracaoDaDiferenca(somar(r.linhas))).toBeCloseTo(300 / 7_900);
    expect(fracaoDaDiferenca({ recebidoBruto: 0, recebidoLiquido: 0 })).toBeNull();
    expect([0, 1, 7, 8, 30, 31].map((d) => idadeDoRecebivel(d))).toEqual([
      { rotulo: "vendida hoje", tom: "neutro" }, { rotulo: "há 1 dia", tom: "neutro" }, { rotulo: "há 7 dias", tom: "neutro" },
      { rotulo: "há 8 dias", tom: "info" }, { rotulo: "há 30 dias", tom: "info" }, { rotulo: "há 31 dias", tom: "aviso" },
    ]);
  });

  it("filtros do endereço: loja só por identificador válido, janela de 7, 30 ou 90 dias (30 se vier outra coisa)", () => {
    expect(lerFiltro({})).toEqual({ loja: null, dias: 30 });
    expect(lerFiltro({ loja: A, dias: "90" })).toEqual({ loja: A, dias: 90 });
    expect(lerFiltro({ loja: "__proto__", dias: "45" })).toEqual({ loja: null, dias: 30 });
    expect(lerFiltro({ loja: [A, B], dias: ["7", "90"] })).toEqual({ loja: null, dias: 30 });
    expect(enderecoDosRecebiveis({ loja: null, dias: 30 })).toBe("/pagamentos/recebiveis");
    expect(enderecoDosRecebiveis({ loja: A, dias: 7 })).toBe(`/pagamentos/recebiveis?loja=${A}&dias=7`);
  });
});

describe("a Mercado Pago nos recebíveis (regressão do #112)", () => {
  it("toda maquininha que o site conhece é adquirente dos recebíveis e se concilia pelo extrato", () => {
    for (const provedor of Object.keys(PROVEDORES)) {
      expect(Object.keys(ADQUIRENTES), provedor).toContain(provedor);
      expect(DO_EXTRATO, provedor).toContain(provedor);
    }
  });

  it("a linha e o mais antigo da Mercado Pago são lidos como os da PicPay (a primeira venda na maquininha não derruba a tela)", () => {
    const r = resposta();
    r.linhas.push(linha({ adquirente: "mercado_pago", a_receber: 2, valor_a_receber: 5_900, ate_7_dias: 5_900, mais_antiga_dias: 0 }));
    r.total_a_receber = { quantidade: 6, valor: 159_500 };
    r.mais_antigos.push({ tipo: "pagamento", id: "00000000-0000-4000-9000-000000000004", venda_id: VENDA, venda_numero: 29, unidade: A,
      adquirente: "mercado_pago", valor: 3_900, dias: 0, terminal: "Mercado Pago (teste)" });
    const lido = lerRecebiveis(r);
    expect(lido.linhas.find((l) => l.adquirente === "mercado_pago")).toMatchObject({ unidade: A, aReceber: 2, valorAReceber: 5_900, ate7Dias: 5_900 });
    expect(lido.maisAntigos.find((m) => m.adquirente === "mercado_pago")).toMatchObject({ vendaNumero: 29, valor: 3_900, terminal: "Mercado Pago (teste)" });
  });
});

describe("consulta dos recebíveis: o estado vem junto, falha nunca vira zero", () => {
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
  afterEach(() => { vi.restoreAllMocks(); });
  const cliente = (r: { data: unknown; error: null | { code: string } }) => {
    const chamadas: { nome: string; argumentos: unknown }[] = [];
    return { chamadas, supabase: { rpc: async (nome: string, argumentos: unknown) => { chamadas.push({ nome, argumentos }); return r; } } as never };
  };

  it("rede sem p_unidade; uma loja com ela; cada erro com o seu estado", async () => {
    const ok = cliente({ data: resposta(), error: null });
    expect((await consultarRecebiveis(ok.supabase, { loja: null, dias: 30 })).estado).toBe("ok");
    await consultarRecebiveis(ok.supabase, { loja: A, dias: 90 });
    expect(ok.chamadas).toEqual([{ nome: "recebiveis_painel", argumentos: { p_dias: 30 } }, { nome: "recebiveis_painel", argumentos: { p_unidade: A, p_dias: 90 } }]);
    expect((await consultarRecebiveis(cliente({ data: null, error: { code: "PGRST202" } }).supabase, { loja: null, dias: 30 })).estado).toBe("indisponivel");
    expect((await consultarRecebiveis(cliente({ data: null, error: { code: "42501" } }).supabase, { loja: B, dias: 30 })).estado).toBe("sem_permissao");
    expect((await consultarRecebiveis(cliente({ data: null, error: { code: "57014" } }).supabase, { loja: null, dias: 30 })).estado).toBe("falha");
    expect((await consultarRecebiveis(cliente({ data: { ...resposta(), linhas: "x" }, error: null }).supabase, { loja: null, dias: 30 })).estado).toBe("falha");
  });
});

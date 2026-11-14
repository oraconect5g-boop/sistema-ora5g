// Relatórios da assistência (lote L12e): o período e a leitura estrita da resposta do banco. Dados FICTÍCIOS; a regra
// (quem vê e as somas) está em packages/banco/src/ordem-de-servico.test.ts.
import { describe, expect, it } from "vitest";

import { intervaloDoPeriodo, lerRelatorioDaAssistencia } from "./relatorio";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const EU = "00000000-0000-4000-8000-0000000000aa";
const OS = "00000000-0000-4000-8000-00000000e501";
const RELATORIO_FICTICIO = () => ({
  inicio: "2026-11-01", fim: "2026-11-14", unidade: null, lojas: [{ id: LOJA, nome: "Santa Cândida (teste)" }],
  resumo: { abertas: 6, entregues: 2, devolvidas_sem_conserto: 1, devolvidas_sem_cobrar: 1, canceladas: 1, prontas_paradas: 1, consertos_cobrados: 1, valor_cobrado: 33_000, pecas_usadas: 3 },
  por_loja: [{ unidade: LOJA, nome: "Santa Cândida (teste)", abertas: 6, entregues: 2, devolvidas_sem_conserto: 1, devolvidas_sem_cobrar: 1, canceladas: 1, prontas_paradas: 1,
    consertos_cobrados: 1, valor_cobrado: 33_000, pecas_usadas: 3, os_com_peca: 2, os_com_peca_sem_cobranca: 1 }],
  sem_venda: [
    { id: OS, numero: 43, loja: "Santa Cândida (teste)", aparelho: "Galaxy A15", cliente_nome: "Carla Cliente Teste", tipo: "devolvida_sem_cobrar", quando: "2026-11-14T15:00:00Z", motivo: "Garantia do conserto anterior", venda: null, dias: null },
    { id: OS, numero: 44, loja: "Santa Cândida (teste)", aparelho: "Moto G", cliente_nome: "Davi Cliente Teste", tipo: "pronta_parada", quando: "2026-11-12T15:00:00Z", motivo: null, venda: null, dias: 2 },
    { id: OS, numero: 47, loja: "Santa Cândida (teste)", aparelho: "iPhone 11", cliente_nome: "Eva Cliente Teste", tipo: "venda_cancelada", quando: "2026-11-14T16:00:00Z", motivo: null, venda: 77, dias: null },
  ],
  por_pessoa: [{ pessoa: EU, nome: "Vendedora Teste", abertas: 6, cobrados: 1, valor: 33_000 }],
  tempo: { consertos: 4, media_dias_conserto: 2.5, maior_dias_conserto: 4, entregas: 2, media_dias_ate_entrega: 3 },
});

describe("período do relatório", () => {
  it("este mês, o mês passado (com a virada do ano) e os últimos 90 dias", () => {
    expect(intervaloDoPeriodo("mes", "2026-11-14")).toEqual({ inicio: "2026-11-01", fim: "2026-11-14" });
    expect(intervaloDoPeriodo("mes_passado", "2026-11-14")).toEqual({ inicio: "2026-10-01", fim: "2026-10-31" });
    expect(intervaloDoPeriodo("mes_passado", "2027-01-05")).toEqual({ inicio: "2026-12-01", fim: "2026-12-31" });
    expect(intervaloDoPeriodo("mes_passado", "2028-03-10")).toEqual({ inicio: "2028-02-01", fim: "2028-02-29" });
    expect(intervaloDoPeriodo("noventa_dias", "2026-11-14")).toEqual({ inicio: "2026-08-17", fim: "2026-11-14" });
  });
});

describe("leitura estrita do relatório", () => {
  it("lê o que veio do banco, com os nomes da tela", () => {
    const r = lerRelatorioDaAssistencia(RELATORIO_FICTICIO());
    expect(r.resumo).toEqual({ abertas: 6, entregues: 2, devolvidasSemConserto: 1, devolvidasSemCobrar: 1, canceladas: 1, prontasParadas: 1, consertosCobrados: 1, valorCobrado: 33_000, pecasUsadas: 3 });
    expect(r.porLoja[0]).toMatchObject({ unidade: LOJA, osComPeca: 2, osComPecaSemCobranca: 1 });
    expect(r.semVenda.map((s) => [s.tipo, s.dias, s.venda])).toEqual([["devolvida_sem_cobrar", null, null], ["pronta_parada", 2, null], ["venda_cancelada", null, 77]]);
    expect(r.tempo).toEqual({ consertos: 4, mediaDiasConserto: 2.5, maiorDiasConserto: 4, entregas: 2, mediaDiasAteEntrega: 3 });
  });

  it("conta que não fecha, tipo desconhecido ou campo faltando é falha de leitura, nunca zero", () => {
    const casos: [string, (r: ReturnType<typeof RELATORIO_FICTICIO>) => void][] = [
      ["resumo diferente da soma das lojas", (r) => { r.resumo.abertas = 7; }],
      ["por pessoa diferente do resumo", (r) => { r.por_pessoa[0]!.valor = 1; }],
      ["tipo desconhecido", (r) => { (r.sem_venda[0] as { tipo: string }).tipo = "outro"; }],
      ["pronta sem dias", (r) => { (r.sem_venda[1] as { dias: number | null }).dias = null; }],
      ["venda cancelada sem a venda", (r) => { (r.sem_venda[2] as { venda: number | null }).venda = null; }],
      ["entregas diferentes do resumo", (r) => { r.tempo.entregas = 3; }],
      ["média sem conserto", (r) => { r.tempo.consertos = 0; }],
      ["valor negativo", (r) => { r.resumo.valor_cobrado = -1; r.por_loja[0]!.valor_cobrado = -1; r.por_pessoa[0]!.valor = -1; }],
      ["loja fora do recorte", (r) => { (r as { unidade: string | null }).unidade = "00000000-0000-4000-8000-0000000000dd"; }],
      ["campo faltando", (r) => { delete (r as Partial<typeof r>).tempo; }],
    ];
    for (const [nome, estragar] of casos) {
      const r = RELATORIO_FICTICIO();
      estragar(r);
      expect(() => lerRelatorioDaAssistencia(r), nome).toThrow();
    }
  });
});

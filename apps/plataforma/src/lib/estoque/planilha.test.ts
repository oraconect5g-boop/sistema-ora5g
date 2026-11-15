// Planilhas do estoque (lote FIN-009b: ORA-FIN-009): o que cada planilha mostra a partir do que a rota leu, sem
// acesso a dados. Dados fictícios.
import { describe, expect, it } from "vitest";

import { gerarCsvEmSecoes } from "../csv";
import {
  enderecoDaPlanilha, formatoDaPlanilha, parteDaPlanilha, planilhaDoSaldo, planilhaDosItens,
  type LocalDaPlanilha, type NomesDaPlanilha, type ProdutoDaPlanilha, type VarianteDaPlanilha,
} from "./planilha";

const LOCAIS: Record<string, LocalDaPlanilha> = {
  sc: { id: "sc", nome: "Santa Cândida", vende: true },
  ag: { id: "ag", nome: "Água Verde", vende: true },
  df: { id: "df", nome: "DEFEITOS", vende: false },
};
const VARIANTES: Record<string, VarianteDaPlanilha> = {
  a15: { id: "a15", nome: "Galaxy A15 128GB Azul", sku: "A15-128-AZ", estoqueMinimo: 3, produtoId: "p-a15" },
  capa: { id: "capa", nome: "Capa transparente A15", sku: "CAP-A15", estoqueMinimo: 0, produtoId: "p-capa" },
  chip: { id: "chip", nome: "Chip Ora Connect", sku: "CHIP-ORA", estoqueMinimo: 10, produtoId: "p-chip" },
};
const PRODUTOS: Record<string, ProdutoDaPlanilha> = {
  "p-a15": { nome: "Galaxy A15", marca: "Samsung", categoria: "Smartphones" },
  "p-capa": { nome: "Capa A15", marca: null, categoria: "Acessórios" },
  "p-chip": { nome: "Chip", marca: "Ora", categoria: "Chips" },
};
const achar = <T,>(mapa: Record<string, T>) => (id: string): T => {
  const x = mapa[id];
  if (x === undefined) throw new Error(`sem nome: ${id}`);
  return x;
};
const NOMES: NomesDaPlanilha = { local: achar(LOCAIS), variante: achar(VARIANTES), produto: achar(PRODUTOS) };

describe("planilhas do estoque (FIN-009b)", () => {
  it("saldo: cada produto em cada local, pelo nome; disponível e mínimo só onde vende", () => {
    const secoes = planilhaDoSaldo([
      { unidadeId: "sc", varianteId: "a15", quantidade: 4, reservado: 2 },
      { unidadeId: "df", varianteId: "a15", quantidade: 2, reservado: 0 },
      { unidadeId: "ag", varianteId: "capa", quantidade: 0, reservado: 0 },
      { unidadeId: "sc", varianteId: "capa", quantidade: 7, reservado: 1 },
      { unidadeId: "ag", varianteId: "chip", quantidade: 12, reservado: 0 },
    ], NOMES, "Rede inteira", "15/11/2026 02:10", null);
    expect(secoes).toEqual([
      {
        linhas: [
          ["Estoque", "Saldo por produto", "Rede inteira"],
          ["Gerado em", "15/11/2026 02:10", "5 linhas"],
          [expect.stringContaining("Disponível para vender = físico − reservado")],
        ],
      },
      {
        colunas: ["Local", "SKU", "Variação", "Produto", "Marca", "Categoria", "Físico", "Reservado", "Disponível para vender", "Mínimo", "Abaixo do mínimo"],
        linhas: [
          ["Água Verde", "CAP-A15", "Capa transparente A15", "Capa A15", null, "Acessórios", 0, 0, 0, 0, ""],
          ["Água Verde", "CHIP-ORA", "Chip Ora Connect", "Chip", "Ora", "Chips", 12, 0, 12, 10, ""],
          // DEFEITOS não vende: o disponível para vender é zero e o mínimo não vale
          ["DEFEITOS (não vende)", "A15-128-AZ", "Galaxy A15 128GB Azul", "Galaxy A15", "Samsung", "Smartphones", 2, 0, 0, 3, ""],
          ["Santa Cândida", "CAP-A15", "Capa transparente A15", "Capa A15", null, "Acessórios", 7, 1, 6, 0, ""],
          ["Santa Cândida", "A15-128-AZ", "Galaxy A15 128GB Azul", "Galaxy A15", "Samsung", "Smartphones", 4, 2, 2, 3, "Sim"],
        ],
      },
    ]);
    // no CSV, a marca vazia é célula vazia e a planilha cortada avisa no fim, numa parte à parte
    const cortada = planilhaDoSaldo([{ unidadeId: "sc", varianteId: "capa", quantidade: 1, reservado: 0 }], NOMES, "Santa Cândida", "15/11/2026 02:10", 20_000);
    expect(cortada.at(-1)).toEqual({ linhas: [["Atenção: a planilha vai até 20.000 linhas; escolha um local para ver o resto."]] });
    expect(gerarCsvEmSecoes(cortada)).toContain("\r\nSanta Cândida;CAP-A15;Capa transparente A15;Capa A15;;Acessórios;1;0;1;0;\r\n\r\n\"Atenção:");
  });

  it("aparelhos e chips: cada item com IMEI ou ICCID, a situação, a condição e as datas", () => {
    const secoes = planilhaDosItens([
      { id: "i2", unidadeId: "sc", varianteId: "chip", imei: null, imei2: null, iccid: "89550100123456789012", numeroSerie: null, situacao: "disponivel", condicao: "novo", criadoEm: "2026-11-10T13:00:00Z", conferidoEm: null },
      { id: "i1", unidadeId: "sc", varianteId: "a15", imei: "351234567890123", imei2: "351234567890131", iccid: null, numeroSerie: "R58N", situacao: "reservado", condicao: "seminovo", criadoEm: "2026-11-01T12:00:00Z", conferidoEm: "2026-11-15T01:30:00Z" },
      { id: "i3", unidadeId: "ag", varianteId: "a15", imei: "351234567890149", imei2: null, iccid: null, numeroSerie: null, situacao: "em_transito", condicao: "outra", criadoEm: "2026-11-02T12:00:00Z", conferidoEm: null },
    ], NOMES, "Rede inteira", "15/11/2026 02:10", null);
    expect(secoes[0]?.linhas.slice(0, 2)).toEqual([["Estoque", "Aparelhos e chips", "Rede inteira"], ["Gerado em", "15/11/2026 02:10", "3 itens"]]);
    expect(secoes[1]).toEqual({
      colunas: ["Local", "SKU", "Variação", "IMEI", "IMEI 2", "ICCID", "Número de série", "Situação", "Condição", "Cadastrado em", "Conferido em"],
      linhas: [
        ["Água Verde", "A15-128-AZ", "Galaxy A15 128GB Azul", "351234567890149", null, null, null, "Em trânsito", "outra", { instante: "2026-11-02T12:00:00Z" }, null],
        ["Santa Cândida", "CHIP-ORA", "Chip Ora Connect", null, null, "89550100123456789012", null, "Disponível", "Novo", { instante: "2026-11-10T13:00:00Z" }, null],
        ["Santa Cândida", "A15-128-AZ", "Galaxy A15 128GB Azul", "351234567890123", "351234567890131", null, "R58N", "Reservado (numa venda)", "Seminovo", { instante: "2026-11-01T12:00:00Z" }, { instante: "2026-11-15T01:30:00Z" }],
      ],
    });
    // nome que a rota não leu não vira célula em branco: a planilha não sai
    expect(() => planilhaDosItens([{ id: "x", unidadeId: "outra", varianteId: "a15", imei: "1", imei2: null, iccid: null, numeroSerie: null, situacao: "disponivel", condicao: "novo", criadoEm: "2026-11-01T12:00:00Z", conferidoEm: null }], NOMES, "x", "x", null))
      .toThrow("sem nome: outra");
  });

  it("parte, formato e endereço", () => {
    expect([parteDaPlanilha("itens"), parteDaPlanilha("saldo"), parteDaPlanilha(null), parteDaPlanilha("<x>")]).toEqual(["itens", "saldo", "saldo", "saldo"]);
    expect([formatoDaPlanilha("csv"), formatoDaPlanilha("xlsx"), formatoDaPlanilha(undefined), formatoDaPlanilha("pdf")]).toEqual(["csv", "xlsx", "xlsx", "xlsx"]);
    expect(enderecoDaPlanilha("saldo", "xlsx")).toBe("/estoque/exportar");
    expect(enderecoDaPlanilha("itens", "csv", "rede")).toBe("/estoque/exportar?parte=itens&formato=csv&loja=rede");
    expect(enderecoDaPlanilha("saldo", "xlsx", null)).toBe("/estoque/exportar");
  });
});

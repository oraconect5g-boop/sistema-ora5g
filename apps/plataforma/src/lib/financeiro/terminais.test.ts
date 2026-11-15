// Pagamentos por maquininha (lote REPORT-005b): a leitura estrita da resposta do banco. Dados FICTÍCIOS; a soma e o
// recorte estão em packages/banco/src/pagamentos-por-terminal.test.ts.
import { describe, expect, it } from "vitest";

import { lerPagamentosPorTerminal } from "./terminais";

const T = "00000000-0000-4000-8000-0000000000f1";
const L = "00000000-0000-4000-8000-0000000000aa";
const linha = () => ({
  terminal: T, unidade: L, provedor: "picpay", identificador: "PP-101", apelido: "Balcão", ativo: true,
  quantidade: 2, valor: 15_800, conciliados: 1, conciliado: 7_900, liquido: 7_600, estornados: 1, estornado: 7_900,
});

describe("leitura estrita dos pagamentos por maquininha", () => {
  it("lê cada maquininha com os nomes da tela", () => {
    expect(lerPagamentosPorTerminal({ unidade: null, terminais: [linha()] })).toEqual([{ ...linha(), provedor: "picpay" }]);
    expect(lerPagamentosPorTerminal({ unidade: L, terminais: [] })).toEqual([]);
  });

  it("provedor desconhecido, conciliado acima do recebido, número negativo ou campo faltando é falha de leitura, nunca zero", () => {
    type Linha = ReturnType<typeof linha>;
    const casos: [string, (l: Linha) => void][] = [
      ["provedor", (l) => { (l as { provedor: string }).provedor = "stone"; }],
      ["conciliado acima", (l) => { l.conciliado = 20_000; }],
      ["conciliados acima", (l) => { l.conciliados = 3; }],
      ["negativo", (l) => { l.liquido = -1; }],
      ["terminal inválido", (l) => { (l as { terminal: string }).terminal = "x"; }],
      ["campo faltando", (l) => { delete (l as Partial<Linha>).valor; }],
    ];
    for (const [nome, estragar] of casos) {
      const l = linha();
      estragar(l);
      expect(() => lerPagamentosPorTerminal({ unidade: null, terminais: [l] }), nome).toThrow();
    }
    expect(() => lerPagamentosPorTerminal(null)).toThrow();
  });
});

// Pessoas por papel (lote G5): leitura estrita de equipe_por_papel e a ordem da tela. A contagem no
// banco está provada em packages/banco/src/equipe-por-papel.test.ts. Dados fictícios.
import { describe, expect, it } from "vitest";

import { RespostaInesperada } from "../financeiro/painel";
import { lerEquipePorPapel, nomeDoPapel, papeisDaTela } from "./painel";

const RESPOSTA = {
  pessoas: "8", bloqueadas: 1,
  papeis: [
    { papel: "administrador", pessoas: 1, bloqueadas: 0 }, { papel: "dono", pessoas: 2, bloqueadas: 0 },
    { papel: "gerente", pessoas: 1, bloqueadas: 0 }, { papel: "vendedor", pessoas: 5, bloqueadas: 1 },
  ],
};

describe("pessoas por papel: leitura e ordem (G5)", () => {
  it("lê o total, as bloqueadas e cada papel (números em texto também)", () => {
    expect(lerEquipePorPapel(RESPOSTA)).toEqual({ pessoas: 8, bloqueadas: 1, papeis: RESPOSTA.papeis });
    expect(lerEquipePorPapel({ pessoas: 0, bloqueadas: 0, papeis: [] })).toEqual({ pessoas: 0, bloqueadas: 0, papeis: [] });
  });

  it("conta que não fecha é falha, não número", () => {
    const ruins = [
      null, [], { ...RESPOSTA, pessoas: 4 }, { ...RESPOSTA, bloqueadas: 9 }, { ...RESPOSTA, papeis: undefined },
      { ...RESPOSTA, papeis: [{ papel: "vendedor", pessoas: 0, bloqueadas: 0 }] },
      { ...RESPOSTA, papeis: [{ papel: "vendedor", pessoas: 9, bloqueadas: 0 }] },
      { ...RESPOSTA, papeis: [{ papel: "vendedor", pessoas: 8, bloqueadas: 2 }] },
      { ...RESPOSTA, papeis: [...RESPOSTA.papeis, { papel: "dono", pessoas: 1, bloqueadas: 0 }] },
      { pessoas: 3, bloqueadas: 0, papeis: [{ papel: "vendedor", pessoas: 2, bloqueadas: 0 }] },
      { ...RESPOSTA, papeis: [{ papel: "", pessoas: 1, bloqueadas: 0 }] },
    ];
    for (const ruim of ruins) expect(() => lerEquipePorPapel(ruim), JSON.stringify(ruim)).toThrow();
    expect(() => lerEquipePorPapel({ ...RESPOSTA, pessoas: 4 })).toThrow(RespostaInesperada);
  });

  it("a tela mostra os papéis conhecidos sempre (zero também), na ordem fixa, e depois os novos", () => {
    const tela = papeisDaTela(lerEquipePorPapel({ ...RESPOSTA, papeis: [...RESPOSTA.papeis, { papel: "financeiro", pessoas: 1, bloqueadas: 0 }] }));
    expect(tela.map((p) => [p.nome, p.pessoas, p.bloqueadas])).toEqual([
      ["Donos", 2, 0], ["Administradores", 1, 0], ["Gerentes", 1, 0], ["Vendedores", 5, 1], ["Técnicos", 0, 0], ["financeiro", 1, 0],
    ]);
    expect([nomeDoPapel("gerente"), nomeDoPapel("financeiro")]).toEqual(["Gerente", "financeiro"]);
  });
});

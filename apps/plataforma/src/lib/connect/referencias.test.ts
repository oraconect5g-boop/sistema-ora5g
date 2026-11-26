// AUD-f: as listas oficiais da Nogle lidas por tipo e em páginas de 1.000, com o Supabase SIMULADO (que corta cada leitura em
// 1.000 linhas, como a API): 2.500 cidades fictícias não escondem os planos nem os DDDs.
import { describe, expect, it } from "vitest";

import { lerReferenciasDaNogle, type ReferenciaDaNogle } from "./referencias";

const CIDADES: ReferenciaDaNogle[] = Array.from({ length: 2_500 }, (_, i) => ({ tipo: "cidade", codigo: String(10_000 + i), nome: `Cidade ${String(i).padStart(4, "0")}`, uf: "PR", valor_centavos: null }));
const PLANOS: ReferenciaDaNogle[] = [{ tipo: "plano", codigo: "1718", nome: "Zeta 10 GB", uf: null, valor_centavos: 5_490 }];
const DDDS: ReferenciaDaNogle[] = [{ tipo: "ddd", codigo: "41", nome: "41", uf: "PR", valor_centavos: null }];

function supabaseFalso(opcoes: { falharNa?: number } = {}) {
  const pedidos: { tipo: unknown; de: number; ate: number }[] = [];
  const todas = [...CIDADES, ...PLANOS, ...DDDS];
  return {
    pedidos,
    cliente: {
      from: () => {
        let linhas = todas;
        let tipo: unknown;
        const consulta = {
          select: () => consulta,
          eq: (campo: string, valor: unknown) => { if (campo === "tipo") { tipo = valor; linhas = linhas.filter((l) => l.tipo === valor); } return consulta; },
          order: () => consulta,
          range: (de: number, ate: number) => {
            pedidos.push({ tipo, de, ate });
            const falhou = opcoes.falharNa !== undefined && pedidos.length === opcoes.falharNa;
            // A API corta em 1.000 linhas, mesmo que se peça mais.
            return Promise.resolve(falhou ? { data: null, error: { code: "57014" } } : { data: linhas.slice(de, Math.min(ate + 1, de + 1_000)), error: null });
          },
        };
        return consulta;
      },
    },
  };
}

describe("as listas oficiais da Nogle, inteiras e por tipo (AUD-f)", () => {
  it("cada tipo à parte, em páginas de 1.000, até a página que vem com menos", async () => {
    const { cliente, pedidos } = supabaseFalso();
    const listas = await lerReferenciasDaNogle(cliente as never, ["plano", "cidade", "ddd"]);
    expect(listas?.cidade).toHaveLength(2_500);
    expect(listas?.plano).toEqual(PLANOS);
    expect(listas?.ddd).toEqual(DDDS);
    expect(pedidos.filter((p) => p.tipo === "cidade").map((p) => [p.de, p.ate])).toEqual([[0, 999], [1_000, 1_999], [2_000, 2_999]]);
    expect(pedidos.filter((p) => p.tipo === "plano")).toEqual([{ tipo: "plano", de: 0, ate: 999 }]);
  });

  it("uma leitura que falha não vira lista pela metade", async () => {
    const { cliente } = supabaseFalso({ falharNa: 3 });
    expect(await lerReferenciasDaNogle(cliente as never, ["plano", "cidade", "ddd"])).toBeNull();
  });
});

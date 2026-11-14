// Valor do estoque a custo (lote G3b): a leitura estrita da resposta do banco. Dados FICTÍCIOS; a regra (quem vê, o custo
// vigente e o que fica fora) está em packages/banco/src/estoque-valor.test.ts.
import { describe, expect, it } from "vitest";

import { lerValorDoEstoqueDoBanco } from "./valor";

const A = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000bb";
const D = "00000000-0000-4000-8000-0000000000dd";
const RESPOSTA = () => ({
  unidade: null,
  resumo: {
    valor: 353_400, itens_com_custo: 16, itens_sem_custo: 1, variacoes_sem_custo: 1, valor_chegando: 6_000, chegando_sem_custo: 3, valor_fora_da_venda: 3_600,
    itens_fora_da_venda_sem_custo: 1,
  },
  por_local: [
    { unidade: A, nome: "Loja A", vende: true, valor: 238_000, itens_com_custo: 12, itens_sem_custo: 1, valor_chegando: 0, chegando_sem_custo: 1 },
    { unidade: B, nome: "Loja B", vende: true, valor: 115_400, itens_com_custo: 4, itens_sem_custo: 0, valor_chegando: 6_000, chegando_sem_custo: 2 },
    { unidade: D, nome: "DEFEITOS", vende: false, valor: 3_600, itens_com_custo: 2, itens_sem_custo: 1, valor_chegando: 0, chegando_sem_custo: 0 },
  ],
});

describe("leitura estrita do valor a custo", () => {
  it("lê o que veio do banco, com os nomes da tela", () => {
    const v = lerValorDoEstoqueDoBanco(RESPOSTA());
    expect(v).toMatchObject({ valor: 353_400, itensSemCusto: 1, variacoesSemCusto: 1, valorChegando: 6_000, chegandoSemCusto: 3, valorForaDaVenda: 3_600,
      itensForaDaVendaSemCusto: 1 });
    expect(v.porLocal.map((l) => [l.nome, l.vende])).toEqual([["Loja A", true], ["Loja B", true], ["DEFEITOS", false]]);
  });

  it("conta que não fecha, campo faltando ou loja fora do recorte é falha de leitura, nunca zero", () => {
    type R = ReturnType<typeof RESPOSTA>;
    const casos: [string, (r: R) => void][] = [
      ["valor diferente da soma dos locais que vendem", (r) => { r.resumo.valor = 1; }],
      ["fora da venda diferente do local que não vende", (r) => { r.resumo.valor_fora_da_venda = 0; }],
      ["chegando diferente da soma", (r) => { r.resumo.valor_chegando = 0; }],
      ["chegando sem custo diferente da soma", (r) => { r.resumo.chegando_sem_custo = 0; }],
      ["fora da venda sem custo diferente do local que não vende", (r) => { r.resumo.itens_fora_da_venda_sem_custo = 0; }],
      ["chegando sem custo faltando no local", (r) => { delete (r.por_local[1] as Partial<R["por_local"][number]>).chegando_sem_custo; }],
      ["item sem custo sem variação", (r) => { r.resumo.variacoes_sem_custo = 0; }],
      ["valor negativo", (r) => { r.por_local[0]!.valor = -1; r.resumo.valor = 115_399; }],
      ["vende que não é sim ou não", (r) => { (r.por_local[0] as { vende: unknown }).vende = "sim"; }],
      ["local fora do recorte", (r) => { (r as { unidade: string | null }).unidade = A; }],
      ["campo faltando", (r) => { delete (r as Partial<R>).resumo; }],
    ];
    for (const [nome, estragar] of casos) {
      const r = RESPOSTA();
      estragar(r);
      expect(() => lerValorDoEstoqueDoBanco(r), nome).toThrow();
    }
  });
});

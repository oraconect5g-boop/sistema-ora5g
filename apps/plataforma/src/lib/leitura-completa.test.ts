// Leitura completa abaixo do teto de linhas da API (B5, REV-PLAN-003): uma API simulada que corta cada resposta
// no teto (como o max_rows do PostgREST, sem erro). Aqui o resultado seguro: nada se perde em silêncio e o
// "há mais" só aparece quando há mesmo. Dados fictícios.
import { describe, expect, it } from "vitest";

import { idsEmLotes, lerEmPaginas, lerPorIds } from "./leitura-completa";
import { consultarContas, LIMITE_DA_EXPORTACAO_DAS_CONTAS, nomesDosFornecedores } from "./contas-a-pagar/consulta";

type Linha = Record<string, unknown>;
/** Uma tabela atrás de uma API com teto: cada resposta traz no máximo `teto` linhas da fatia pedida. */
function api(linhas: Linha[], teto: number) {
  const pedidos: [number, number][] = [];
  const pedir = (de: number, ate: number) => {
    pedidos.push([de, ate]);
    return Promise.resolve({ data: linhas.slice(de, Math.min(ate + 1, de + teto)), error: null });
  };
  return { pedir, pedidos };
}
const linhas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(6, "0")}` }));

describe("lerEmPaginas", () => {
  it("1.001 linhas com teto 1.000: lê as 1.001, sem 'mais' (o caso REV-PLAN-003)", async () => {
    const t = api(linhas(1001), 1000);
    const r = await lerEmPaginas(t.pedir, 5000);
    expect(r).toMatchObject({ ok: true, mais: false });
    expect(r.ok && r.linhas.length).toBe(1001);
    expect(t.pedidos.every(([de, ate]) => ate - de + 1 <= 500)).toBe(true);
  });

  it("teto menor que a página (100): avança pelo que veio e não corta nada", async () => {
    const t = api(linhas(1234), 100);
    const r = await lerEmPaginas(t.pedir, 5000);
    expect(r.ok && r.linhas.map((l) => l.id)).toEqual(linhas(1234).map((l) => l.id));
    expect(r.ok && r.mais).toBe(false);
  });

  it("mais linhas que o máximo: devolve o máximo e diz que há mais; exatamente o máximo não diz", async () => {
    const r = await lerEmPaginas(api(linhas(5001), 1000).pedir, 5000);
    expect(r.ok && [r.linhas.length, r.mais]).toEqual([5000, true]);
    const exato = await lerEmPaginas(api(linhas(5000), 1000).pedir, 5000);
    expect(exato.ok && [exato.linhas.length, exato.mais]).toEqual([5000, false]);
    const vazio = await lerEmPaginas(api([], 1000).pedir, 5000);
    expect(vazio).toEqual({ ok: true, linhas: [], mais: false });
  });

  it("uma página com erro faz a leitura inteira falhar; 'pedido além do fim' encerra", async () => {
    let n = 0;
    const falha = await lerEmPaginas((de, ate) => Promise.resolve(++n === 2 ? { data: null, error: { code: "57014" } } : { data: linhas(2000).slice(de, ate + 1), error: null }), 5000);
    expect(falha).toEqual({ ok: false, erro: { code: "57014" } });
    const fim = await lerEmPaginas((de) => Promise.resolve(de >= 500 ? { data: null, error: { code: "PGRST103" } } : { data: linhas(500), error: null }), 5000);
    expect(fim.ok && fim.linhas.length).toBe(500);
    const maior = await lerEmPaginas(() => Promise.resolve({ data: linhas(600), error: null }), 5000);
    expect(maior.ok).toBe(false);
  });
});

describe("lerPorIds", () => {
  it("lotes de até 100 ids, sem repetir; cada lote lido inteiro mesmo com mais linhas que o teto", async () => {
    expect(idsEmLotes(["a", "b", "a", "c"], 2)).toEqual([["a", "b"], ["c"]]);
    const ids = Array.from({ length: 250 }, (_, i) => `p${i}`);
    // 6 variações por produto: 1.500 linhas, mais que o teto de 1.000 numa resposta.
    const variacoes = ids.flatMap((p) => Array.from({ length: 6 }, (_, k) => ({ produto: p, id: `${p}-v${k}` })));
    const lotes: number[] = [];
    const r = await lerPorIds(ids, (lote, de, ate) => {
      if (de === 0) lotes.push(lote.length);
      return Promise.resolve({ data: variacoes.filter((v) => lote.includes(v.produto)).slice(de, Math.min(ate + 1, de + 1000)), error: null });
    });
    expect(lotes).toEqual([100, 100, 50]);
    expect(r.ok && r.linhas.length).toBe(1500);
    expect(r.ok && r.mais).toBe(false);
  });
});

// A exportação das contas a pagar com a função real de consulta, como na prova do Codex (REV-PLAN-003).
describe("contas a pagar: lista e exportação completas abaixo do teto", () => {
  const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
  const conta = (n: number) => ({
    id: id(n + 1), unidade_id: null, categoria_id: id(90_000), fornecedor_id: null, descricao: `Conta fictícia ${n}`, documento: null, valor_centavos: 100,
    vencimento: "2026-11-13", forma: "unica", parcela: 1, parcelas: 1, situacao: "aberta", paga_em: null, valor_pago_centavos: null, referencia_pagamento: null,
    cancelada_em: null, motivo_cancelamento: null,
  });
  function supabaseCom(tabelas: Record<string, Linha[]>, teto: number) {
    class Consulta {
      linhas: Linha[];
      constructor(nome: string) { this.linhas = [...(tabelas[nome] ?? [])]; }
      select() { return this; }
      eq(c: string, v: unknown) { this.linhas = this.linhas.filter((l) => l[c] === v); return this; }
      is() { return this; }
      gte() { return this; }
      order() { return this; }
      range(de: number, ate: number) { this.linhas = this.linhas.slice(de, Math.min(ate + 1, de + teto)); return this; }
      limit(n: number) { this.linhas = this.linhas.slice(0, Math.min(n, teto)); return this; }
      then(resolver: (r: unknown) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
    }
    return { from: (nome: string) => new Consulta(nome) } as unknown as Parameters<typeof consultarContas>[0];
  }

  it("1.001 contas com teto 1.000: exporta as 1.001, sem aviso falso; 5.001: exporta 5.000 e avisa", async () => {
    for (const teto of [1000, 100]) {
      const r = await consultarContas(supabaseCom({ contas_a_pagar: Array.from({ length: 1001 }, (_, n) => conta(n)) }, teto), "abertas", { tipo: "todas" }, "2026-11-13", LIMITE_DA_EXPORTACAO_DAS_CONTAS);
      expect(r.estado === "ok" && [r.dados.contas.length, r.dados.mais], `teto ${teto}`).toEqual([1001, false]);
    }
    const muitas = await consultarContas(supabaseCom({ contas_a_pagar: Array.from({ length: 5001 }, (_, n) => conta(n)) }, 1000), "abertas", { tipo: "todas" }, "2026-11-13", LIMITE_DA_EXPORTACAO_DAS_CONTAS);
    expect(muitas.estado === "ok" && [muitas.dados.contas.length, muitas.dados.mais]).toEqual([5000, true]);
    // A lista da tela (200) avisa quando há mais.
    const tela = await consultarContas(supabaseCom({ contas_a_pagar: Array.from({ length: 201 }, (_, n) => conta(n)) }, 1000), "abertas", { tipo: "todas" }, "2026-11-13");
    expect(tela.estado === "ok" && [tela.dados.contas.length, tela.dados.mais]).toEqual([200, true]);
  });

  it("os nomes de 1.500 fornecedores chegam todos (antes: um pedido de 5.000, cortado em 1.000)", async () => {
    const fornecedores = Array.from({ length: 1500 }, (_, n) => ({ id: id(n + 1), nome: `Fornecedor ${n}` }));
    const nomes = await nomesDosFornecedores(supabaseCom({ fornecedores }, 1000));
    expect(nomes?.size).toBe(1500);
    expect(nomes?.get(id(1500))).toBe("Fornecedor 1499");
  });
});

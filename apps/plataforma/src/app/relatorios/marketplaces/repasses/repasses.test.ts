// Os repasses dos marketplaces (lote REPASSE-a: ORA-MKTPL-005 e ORA-MKTPL-008) com a sessão e o Supabase SIMULADOS: nenhuma
// credencial, dados fictícios. As regras do banco estão em packages/banco/src/marketplace-repasses.test.ts; a leitura e os
// formulários, em lib/marketplaces/repasses.test.ts.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const LINHA = "00000000-0000-4000-9000-0000000000c1";
const OUTRA = "00000000-0000-4000-9000-0000000000c2";
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, Resposta>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
vi.mock("next/form", () => ({ default: ({ children }: { children: unknown }) => children }));
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-18T23:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Dono (fictício)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    rpc: (nome: string, argumentos: Record<string, unknown> = {}) => {
      cenario.chamadas.push({ nome, argumentos });
      return Promise.resolve(cenario.respostas[nome] ?? { data: null, error: null });
    },
  },
};
vi.mock("../../../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { casarRepasse, desfazerRepasse } from "./acoes";
import RepassesDosMarketplaces from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && /^[A-Z]/.test((v.type as { name?: string }).name ?? "")) {
      try { return texto((v.type as (p: unknown) => unknown)(v.props)); } catch { /* componente com estado: lê as propriedades */ }
    }
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string> = {}) => texto(await RepassesDosMarketplaces({ searchParams: Promise.resolve(parametros as never) })).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
};
const chamadas = (nome: string) => cenario.chamadas.filter((c) => c.nome === nome).map((c) => c.argumentos);
const PAINEL = {
  repasses: [
    { canal: "mercado_livre", data_repasse: "2026-11-10", pedidos: 2, esperado: 26_100, estimados: 1, casado: null,
      sugestoes: [{ linha: LINHA, extrato: 3, data: "2026-11-12", valor: 26_100, descricao: "TED MERCADO PAGO" }, { linha: OUTRA, extrato: 3, data: "2026-11-11", valor: 26_000, descricao: null }] },
    { canal: "shopee", data_repasse: "2026-11-08", pedidos: 1, esperado: 9_000, estimados: 0, sugestoes: [],
      casado: { linha: OUTRA, extrato: 4, data: "2026-11-09", recebido: 8_950, esperado_ao_casar: 9_000, pedidos_ao_casar: 1, motivo: "Tarifa de saque" } },
  ],
  sem_data_de_repasse: 3,
};

beforeEach(() => {
  cenario.permissoes = new Set(["resultado.ver", "pagamento.conciliar"]);
  cenario.chamadas = [];
  cenario.respostas = { marketplace_repasses_painel: { data: PAINEL, error: null } };
});

describe("a tela dos repasses (REPASSE-a)", () => {
  it("mostra o esperado, o recebido, a diferença e cada repasse: o casado com a linha e o motivo; o solto com as linhas que podem ser ele", async () => {
    const t = await tela({ inicio: "2026-11-01", fim: "2026-11-30" });
    for (const trecho of ["Repasses dos marketplaces", "De 01/11/2026 a 30/11/2026", "Esperado", "R$ 351,00", "Recebido no banco", "R$ 89,50",
      "Diferença dos casados", "−R$ 0,50", "Sem linha no extrato", "e 3 pedidos do período sem data de repasse",
      "Mercado Livre · repasse de 10/11/2026", "2 pedidos · esperado R$ 261,00 (1 líquido estimado)", "sem linha no extrato",
      "Nº 3 · 12/11/2026 · R$ 261,00 (o mesmo valor) · TED MERCADO PAGO", "Nº 3 · 11/11/2026 · R$ 260,00 (diferença −R$ 1,00)", "Casar",
      "Shopee · repasse de 08/11/2026", "casado, diferença −R$ 0,50", "Linha do extrato nº 4, de 09/11/2026: R$ 89,50 recebidos. Motivo da diferença: Tarifa de saque.", "Desfazer"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(chamadas("marketplace_repasses_painel")).toEqual([{ p_inicio: "2026-11-01", p_fim: "2026-11-30" }]);
  });

  it("os pedidos que mudaram depois de casar aparecem com o aviso", async () => {
    const mudou = structuredClone(PAINEL);
    (mudou.repasses[1] as { esperado: number }).esperado = 12_000;
    expect(await tela()).not.toContain("Os pedidos mudaram depois de casar");
    cenario.respostas.marketplace_repasses_painel = { data: mudou, error: null };
    expect(await tela()).toContain("Os pedidos mudaram depois de casar: ao casar, eram 1 pedido e R$ 90,00.");
  });

  it("sem os dois lados (o resultado e a conciliação pela rede) não vê; leitura com falha vira a página de erro", async () => {
    cenario.permissoes = new Set(["resultado.ver"]);
    expect(await tela()).toContain("Só quem vê o resultado e concilia pela rede");
    cenario.permissoes = new Set(["resultado.ver", "pagamento.conciliar"]);
    cenario.respostas.marketplace_repasses_painel = { data: null, error: { code: "57014" } };
    await expect(tela()).rejects.toThrow();
    cenario.respostas.marketplace_repasses_painel = { data: { repasses: [{ ...PAINEL.repasses[0], esperado: "x" }], sem_data_de_repasse: 0 }, error: null };
    await expect(tela()).rejects.toThrow();
  });
});

describe("as ações", () => {
  const repasse = { canal: "mercado_livre", data_repasse: "2026-11-10", inicio: "2026-11-01", fim: "2026-11-30" };

  it("casar chama o banco com a linha e o motivo e volta ao mesmo período; a diferença muda a mensagem", async () => {
    cenario.respostas.marketplace_repasse_casar = { data: { diferenca: 0 }, error: null };
    expect(await destinoDe(casarRepasse(formulario({ ...repasse, linha: LINHA }))))
      .toBe("/relatorios/marketplaces/repasses?inicio=2026-11-01&fim=2026-11-30&ok=casado");
    cenario.respostas.marketplace_repasse_casar = { data: { diferenca: -100 }, error: null };
    expect(await destinoDe(casarRepasse(formulario({ ...repasse, linha: OUTRA, motivo: "Tarifa de saque" }))))
      .toBe("/relatorios/marketplaces/repasses?inicio=2026-11-01&fim=2026-11-30&ok=casado_com_diferenca");
    expect(chamadas("marketplace_repasse_casar")).toEqual([
      { p_canal: "mercado_livre", p_data_repasse: "2026-11-10", p_linha: LINHA, p_motivo: null },
      { p_canal: "mercado_livre", p_data_repasse: "2026-11-10", p_linha: OUTRA, p_motivo: "Tarifa de saque" },
    ]);
  });

  it("a recusa do banco vira a mensagem; o formulário errado nem chama o banco", async () => {
    cenario.respostas.marketplace_repasse_casar = { data: null, error: { code: "22023", message: "O valor da linha não é o esperado do repasse: diga o motivo da diferença" } };
    expect(await destinoDe(casarRepasse(formulario({ ...repasse, linha: OUTRA })))).toBe("/relatorios/marketplaces/repasses?inicio=2026-11-01&fim=2026-11-30&erro=diferenca");
    expect(await destinoDe(casarRepasse(formulario({ ...repasse, canal: "amazon", linha: LINHA })))).toBe("/relatorios/marketplaces/repasses?inicio=2026-11-01&fim=2026-11-30&erro=dados");
    expect(await destinoDe(casarRepasse(formulario({ ...repasse, inicio: "x", linha: LINHA, canal: "amazon" })))).toBe("/relatorios/marketplaces/repasses?fim=2026-11-30&erro=dados");
    expect(chamadas("marketplace_repasse_casar")).toHaveLength(1);
  });

  it("desfazer pede o motivo; o que já não estava casado diz que nada mudou", async () => {
    expect(await destinoDe(desfazerRepasse(formulario(repasse)))).toBe("/relatorios/marketplaces/repasses?inicio=2026-11-01&fim=2026-11-30&erro=motivo");
    cenario.respostas.marketplace_repasse_desfazer = { data: true, error: null };
    expect(await destinoDe(desfazerRepasse(formulario({ ...repasse, motivo: "Linha errada" })))).toBe("/relatorios/marketplaces/repasses?inicio=2026-11-01&fim=2026-11-30&ok=desfeito");
    cenario.respostas.marketplace_repasse_desfazer = { data: false, error: null };
    expect(await destinoDe(desfazerRepasse(formulario({ ...repasse, motivo: "Linha errada" })))).toBe("/relatorios/marketplaces/repasses?inicio=2026-11-01&fim=2026-11-30&ok=sem_mudanca");
    expect(chamadas("marketplace_repasse_desfazer")[0]).toEqual({ p_canal: "mercado_livre", p_data_repasse: "2026-11-10", p_motivo: "Linha errada" });
  });
});

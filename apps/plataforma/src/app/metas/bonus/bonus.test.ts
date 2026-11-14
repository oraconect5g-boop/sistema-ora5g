// /metas/bonus (lote L9a) com sessão e Supabase SIMULADOS: nenhuma credencial, nenhuma rede. Confere
// quem vê o formulário (só o dono), o mês escolhido, as faixas que valem nos campos, o histórico, os
// estados da leitura e o que a ação manda ao banco. A gravação está provada em
// packages/banco/src/bonus.test.ts e as regras puras em src/lib/bonus/regras.test.ts. Dados fictícios.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const AGORA = new Date("2026-11-13T15:00:00.000Z");

type Linha = Record<string, unknown>;
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  versoes: { data: [], error: null } as Resposta,
  respostas: {} as Record<string, Resposta>,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  leituras: [] as string[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
class Consulta {
  constructor(private nome: string) { cenario.leituras.push(nome); }
  select() { return this; }
  order() { return this; }
  limit() { return this; }
  then(resolver: (r: Resposta) => unknown) {
    if (this.nome !== "bonus_regras") throw new Error(`a tela não lê ${this.nome} direto`);
    return Promise.resolve(cenario.versoes).then(resolver);
  }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
    cenario.chamadas.push({ nome, argumentos });
    return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: "00000000-0000-4000-8000-00000000d000" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-13T23:00:00Z" },
    supabase,
  }),
}));

import { definirBonus } from "./acoes";
import RegrasDoBonus from "./page";

const APRESENTACAO = new Set(["Formulario", "ComoFunciona", "Historico", "EstadoDoPainel"]);
type Elemento = { tipo: string; props: Linha };
function percorrer(v: unknown, elemento: (e: Elemento) => void, folha: (t: string) => void): void {
  if (Array.isArray(v)) for (const x of v) percorrer(x, elemento, folha);
  else if (typeof v === "string" || typeof v === "number") folha(String(v));
  else if (isValidElement<Linha>(v)) {
    const tipo = typeof v.type === "string" ? v.type : typeof v.type === "function" ? v.type.name : "";
    if (typeof v.type === "function" && APRESENTACAO.has(tipo)) percorrer((v.type as (p: unknown) => unknown)(v.props), elemento, folha);
    else {
      elemento({ tipo, props: v.props });
      percorrer(tipo === "MoldeReal" ? v.props.children : Object.values(v.props), elemento, folha);
    }
  } else if (v && typeof v === "object" && !("$$typeof" in v)) percorrer(Object.values(v), elemento, folha);
}
/** Só o texto que aparece: filhos dos elementos e títulos dos cartões (sem classes nem atributos). */
function visivel(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "function" && APRESENTACAO.has(tipo)) andar((x.type as (p: unknown) => unknown)(x.props));
      else if (typeof x.type === "string") andar(x.props.children);
      else andar([x.props.titulo, x.props.subtitulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ").trim();
}
async function pagina(parametros: Record<string, string> = {}) {
  const pedacos: string[] = [];
  const elementos: Elemento[] = [];
  const arvore = (await RegrasDoBonus({ searchParams: Promise.resolve(parametros) })) as ReactElement;
  percorrer(arvore, (e) => elementos.push(e), (t) => pedacos.push(t));
  const doTipo = (tipo: string) => elementos.filter((e) => e.tipo === tipo).map((e) => e.props);
  return {
    texto: pedacos.join(" ").replace(/\s+/g, " "),
    visivel: visivel((arvore.props as Linha).children),
    doTipo,
    cartoes: doTipo("Cartao").map((c) => String(c.titulo)),
    campos: () => doTipo("input").map((i) => [i.name, i.defaultValue ?? i.value] as const),
    filtro: () => doTipo("FiltroSegmentado")[0] as { opcoes: { href: string; rotulo: string; ativo: boolean }[] } | undefined,
  };
}
const fb = (a_partir_de: number, valor: number) => ({ a_partir_de, valor });
const VERSOES = [
  { versao: 9, medida: "aparelhos", vigente_desde: "2026-12-01", faixas: [fb(100, 20_000)], motivo: "Bônus maior no Natal", definida_em: "2026-11-12T13:00:00Z" },
  { versao: 8, medida: "vendido_liquido", vigente_desde: "2026-11-01", faixas: [fb(100, 30_000), fb(120, 50_000)], motivo: null, definida_em: "2026-11-02T13:00:00Z" },
  { versao: 7, medida: "connect", vigente_desde: "2026-11-01", faixas: null, motivo: "Pausa", definida_em: "2026-11-02T12:00:00Z" },
  { versao: 6, medida: "connect", vigente_desde: "2026-10-01", faixas: [fb(50, 5_000)], motivo: null, definida_em: "2026-10-01T12:00:00Z" },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, { permissoes: new Set(["metas.gerir", "bonus.definir"]), versoes: { data: VERSOES, error: null }, respostas: {}, chamadas: [], leituras: [] });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("/metas/bonus (L9a)", () => {
  it("quem não é o dono não recebe o formulário nem lê as regras", async () => {
    cenario.permissoes = new Set(["metas.gerir", "metas.ver_unidade"]);
    const p = await pagina();
    expect(p.texto).toContain("Só o dono define as regras do bônus");
    expect(p.doTipo("form")).toEqual([]);
    expect(cenario.leituras).toEqual([]);
  });

  it("o dono: este mês, com as faixas que valem nos campos; as outras medidas vazias; o histórico inteiro", async () => {
    const p = await pagina();
    expect(p.filtro()?.opcoes.map((o) => [o.rotulo, o.href, o.ativo])).toEqual([
      ["Este mês", "/metas/bonus", true], ["Dezembro", "/metas/bonus?desde=2026-12", false],
      ["Janeiro de 2027", "/metas/bonus?desde=2027-01", false], ["Fevereiro de 2027", "/metas/bonus?desde=2027-02", false],
    ]);
    expect(p.cartoes).toEqual(["Faixas a partir de novembro de 2026", "Como funciona", "Histórico das regras"]);
    const campos = p.campos();
    expect(campos[0]).toEqual(["desde", "2026-11-01"]);
    expect(campos.filter(([, v]) => v !== "" && v !== undefined)).toEqual([
      ["desde", "2026-11-01"], ["pct_vendido_liquido_1", "100"], ["valor_vendido_liquido_1", "300,00"], ["pct_vendido_liquido_2", "120"], ["valor_vendido_liquido_2", "500,00"],
    ]);
    // As faixas que valem e mais uma linha livre (no mínimo duas): 3 + 2 + 2 + 2, e o motivo.
    expect(campos.filter(([nome]) => /^pct_/.test(String(nome))).map(([nome]) => nome)).toEqual([
      "pct_vendido_liquido_1", "pct_vendido_liquido_2", "pct_vendido_liquido_3", "pct_aparelhos_1", "pct_aparelhos_2",
      "pct_acessorios_1", "pct_acessorios_2", "pct_connect_1", "pct_connect_2",
    ]);
    expect(campos.at(-1)?.[0]).toBe("motivo");
    expect(p.texto).toContain("Valendo: 100%: R$ 300,00 · 120%: R$ 500,00");
    const historico = p.doTipo("Tabela")[0] as { colunas: string[] };
    expect(historico.colunas).toEqual(["Quando", "Medida", "Vale a partir de", "Faixas", "Motivo"]);
    expect(p.visivel).toContain("12/11/2026, 10:00 Aparelhos dezembro de 2026 100%: R$ 200,00 Bônus maior no Natal");
    expect(p.visivel).toContain("02/11/2026, 09:00 Ora Connect novembro de 2026 sem bônus (retirada) Pausa");
    expect(p.visivel).toContain("01/10/2026, 09:00 Ora Connect outubro de 2026 50%: R$ 50,00 —");
  });

  it("o mês do endereço: dezembro mostra a regra de dezembro; mês que já passou volta para este", async () => {
    let p = await pagina({ desde: "2026-12" });
    expect(p.cartoes[0]).toBe("Faixas a partir de dezembro de 2026");
    expect(p.campos().filter(([, v]) => v !== "" && v !== undefined).map(([n]) => n)).toEqual([
      "desde", "pct_vendido_liquido_1", "valor_vendido_liquido_1", "pct_vendido_liquido_2", "valor_vendido_liquido_2", "pct_aparelhos_1", "valor_aparelhos_1",
    ]);
    expect(p.campos()[0]).toEqual(["desde", "2026-12-01"]);
    p = await pagina({ desde: "2026-10" });
    expect(p.campos()[0]).toEqual(["desde", "2026-11-01"]);
  });

  it("a leitura que falha não vira formulário vazio (que apagaria as regras ao salvar)", async () => {
    cenario.versoes = { data: null, error: { code: "PGRST205" } };
    let p = await pagina();
    expect(p.doTipo("form")).toEqual([]);
    expect(p.texto).toContain("a leitura do bônus por meta (migration bonus_por_meta)");
    cenario.versoes = { data: [{ ...VERSOES[0], medida: "lucro" }], error: null };
    p = await pagina();
    expect(p.doTipo("form")).toEqual([]);
    expect(p.texto).toContain("Não foi possível ler agora");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["bonus: resposta inesperada de bonus_regras"]);
  });

  it("o resultado da gravação volta no endereço", async () => {
    expect((await pagina({ ok: "salvas" })).texto).toContain("Regras salvas.");
    expect((await pagina({ erro: "ordem" })).texto).toContain("As faixas vão da menor para a maior");
  });
});

describe("ação: definir as regras do bônus (L9a)", () => {
  const formulario = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [chave, valor] of Object.entries({ desde: "2026-11-01", pct_vendido_liquido_1: "100", valor_vendido_liquido_1: "300,00", motivo: "", ...campos })) f.set(chave, valor);
    return f;
  };
  async function destinoDe(acao: Promise<unknown>) {
    try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
    throw new Error("a ação não redirecionou");
  }

  it("manda as quatro medidas numa chamada só (tudo ou nada) e volta com o resultado", async () => {
    cenario.respostas.bonus_definir = { data: 1, error: null };
    expect(await destinoDe(definirBonus(formulario({ pct_connect_2: "50", valor_connect_2: "50,00" })))).toBe("/metas/bonus?desde=2026-11&ok=salvas");
    expect(cenario.chamadas).toEqual([{ nome: "bonus_definir", argumentos: {
      p_vigente_desde: "2026-11-01", p_motivo: null,
      p_faixas: { vendido_liquido: [fb(100, 30_000)], aparelhos: null, acessorios: null, connect: [fb(50, 5_000)] },
    } }]);
    cenario.respostas.bonus_definir = { data: 0, error: null };
    expect(await destinoDe(definirBonus(formulario({ desde: "2026-12-01", motivo: "Natal" })))).toBe("/metas/bonus?desde=2026-12&ok=sem_mudanca");
    expect(cenario.chamadas.at(-1)?.argumentos).toMatchObject({ p_vigente_desde: "2026-12-01", p_motivo: "Natal" });
  });

  it("faixa incompleta volta antes do banco; a recusa do banco vira a mensagem", async () => {
    expect(await destinoDe(definirBonus(formulario({ pct_aparelhos_1: "100" })))).toBe("/metas/bonus?desde=2026-11&erro=incompleta");
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.bonus_definir = { data: null, error: { code: "22023", message: "Diga o motivo de mudar ou retirar a regra" } };
    expect(await destinoDe(definirBonus(formulario({})))).toBe("/metas/bonus?desde=2026-11&erro=motivo");
    cenario.respostas.bonus_definir = { data: null, error: { code: "42501", message: "Só o dono define as regras do bônus" } };
    expect(await destinoDe(definirBonus(formulario({})))).toBe("/metas/bonus?desde=2026-11&erro=permissao");
    expect(await destinoDe(definirBonus(formulario({ desde: "x" })))).toBe("/metas/bonus?erro=dados");
  });
});

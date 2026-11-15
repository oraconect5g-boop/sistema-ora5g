// /equipe (lote G5): o cartão "Pessoas por papel" com sessão e Supabase SIMULADOS, sem credencial nem
// rede: a pergunta vai ao banco por rede, só para quem cuida da equipe; o que a tela mostra com dados,
// sem a função no banco e em falha (nunca zero). A contagem está provada em
// packages/banco/src/equipe-por-papel.test.ts. Dados fictícios.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000a0";
const DONO = "00000000-0000-4000-8000-0000000000f0";
const LOJA = "00000000-0000-4000-8000-0000000000cc";

type Linha = Record<string, unknown>;
type Resposta = { data: unknown; error: null | { code: string } };
const cenario = vi.hoisted(() => ({
  permitido: true,
  porPapel: { data: null, error: null } as Resposta,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const TABELAS: Record<string, Linha[]> = {
  vinculos: [{ id: "v1", usuario_id: DONO, organizacao_id: ORG, papel: "dono", unidade_id: null }],
  organizacoes: [{ id: ORG, nome: "Ora 5G (teste)" }],
  unidades: [{ id: LOJA, nome: "Santa Cândida (teste)", tipo: "loja_fisica", organizacao_id: ORG }],
  perfis_usuario: [{ id: DONO, nome: "Dono Teste", email: "dono@teste.invalid", status: "ativo", ultimo_acesso_em: null }],
  convites: [],
};
class Consulta {
  constructor(private nome: string) {}
  select() { return this; }
  eq() { return this; }
  in() { return this; }
  is() { return this; }
  order() { return this; }
  limit() { return this; }
  then(resolver: (r: Resposta) => unknown) { return Promise.resolve({ data: TABELAS[this.nome] ?? [], error: null }).then(resolver); }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    cenario.chamadas.push({ nome, argumentos });
    if (nome === "tem_permissao") return { data: cenario.permitido, error: null };
    if (nome === "equipe_por_papel") return cenario.porPapel;
    return { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: DONO },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-13T23:00:00Z" },
    supabase,
  }),
}));

import Equipe from "./page";

const APRESENTACAO = new Set(["PessoasPorPapel", "EstadoDoPainel"]);
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
async function pagina() {
  const pedacos: string[] = [];
  const elementos: Elemento[] = [];
  percorrer(await Equipe({ searchParams: Promise.resolve({}) }) as ReactElement, (e) => elementos.push(e), (t) => pedacos.push(t));
  const cartao = elementos.find((e) => e.tipo === "Cartao" && e.props.titulo === "Pessoas por papel");
  const dentro: Elemento[] = [];
  const textos: string[] = [];
  if (cartao) percorrer(cartao.props.children, (e) => dentro.push(e), (t) => textos.push(t));
  return {
    texto: pedacos.join(" ").replace(/\s+/g, " "),
    cartao: cartao ? { texto: textos.join(" ").replace(/\s+/g, " "), doTipo: (tipo: string) => dentro.filter((e) => e.tipo === tipo).map((e) => e.props) } : null,
    chamadas: (nome: string) => cenario.chamadas.filter((c) => c.nome === nome).map((c) => c.argumentos),
  };
}
const errosRegistrados = () => vi.mocked(console.error).mock.calls;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, {
    permitido: true, chamadas: [],
    porPapel: { data: { pessoas: 8, bloqueadas: 1, papeis: [{ papel: "dono", pessoas: 2, bloqueadas: 0 }, { papel: "gerente", pessoas: 1, bloqueadas: 0 }, { papel: "vendedor", pessoas: 6, bloqueadas: 1 }] }, error: null },
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("/equipe: pessoas por papel (G5)", () => {
  it("uma pergunta por rede; o total, cada papel conhecido (zero também) e as bloqueadas", async () => {
    const p = await pagina();
    expect(p.chamadas("equipe_por_papel")).toEqual([{ p_organizacao: ORG }]);
    expect(p.cartao?.doTipo("p")[0]?.children).toBe("8");
    expect(p.cartao?.texto).toContain("pessoas com acesso · 1 bloqueada (o acesso segue registrado, mas não entra)");
    const barras = p.cartao?.doTipo("BarrasHorizontais")[0] as { dados: { rotulo: string; valor: number; detalhe?: string }[]; maximo: number };
    expect(barras.maximo).toBe(8);
    expect(barras.dados.map((d) => [d.rotulo, d.valor, d.detalhe])).toEqual([
      ["Donos", 2, undefined], ["Administradores", 0, undefined], ["Gerentes", 1, undefined], ["Vendedores", 6, "1 bloqueada"], ["Técnicos", 0, undefined],
    ]);
    expect((p.cartao?.doTipo("TabelaDoGrafico")[0] as { linhas: string[][] }).linhas[3]).toEqual(["Vendedores", "6", "1"]);
  });

  it("sem a função no banco ou em falha: o cartão diz por quê, sem número; o resto da equipe continua", async () => {
    cenario.porPapel = { data: null, error: { code: "PGRST202" } };
    let p = await pagina();
    expect(p.cartao?.texto).toContain("Indisponível neste ambiente");
    expect(p.cartao?.texto).toContain("a contagem da equipe (migration equipe_por_papel)");
    expect(p.cartao?.doTipo("BarrasHorizontais")).toEqual([]);
    expect(p.texto).toContain("Convidar pessoa");
    cenario.porPapel = { data: null, error: { code: "57014" } };
    p = await pagina();
    expect(p.cartao?.texto).toContain("Não foi possível ler agora");
    expect(errosRegistrados()).toContainEqual(["equipe: falha ao consultar equipe_por_papel", { codigo: "57014" }]);
    cenario.porPapel = { data: { pessoas: 3, bloqueadas: 0, papeis: [{ papel: "vendedor", pessoas: 1, bloqueadas: 0 }] }, error: null };
    expect((await pagina()).cartao?.texto).toContain("Não foi possível ler agora");
  });

  it("FIN-009d: a planilha da equipe e dos acessos, no Excel ou em CSV, no alto da tela", async () => {
    const elementos: Elemento[] = [];
    percorrer(await Equipe({ searchParams: Promise.resolve({}) }) as ReactElement, (e) => elementos.push(e), () => undefined);
    expect(elementos.filter((e) => e.tipo === "BaixarPlanilha").map((e) => e.props)).toEqual([{ endereco: "/equipe/exportar", rotulo: "Baixar planilha" }]);
  });

  it("quem não cuida da equipe não chega à contagem", async () => {
    cenario.permitido = false;
    const p = await pagina();
    expect(p.chamadas("equipe_por_papel")).toEqual([]);
    expect(p.cartao).toBeNull();
    expect(p.texto).toContain("Sem permissão");
  });
});

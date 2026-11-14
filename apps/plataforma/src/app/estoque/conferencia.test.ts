// Aba "Conferência do dia" do /estoque, corrigida em 14/11/2026 (#80, REV-DIR-003), com sessão e Supabase
// simulados: um PostgREST em memória que aplica os filtros, conta no "banco" (count exact) e devolve só a
// página pedida, com o teto de 1.000 linhas por resposta. Aqui o resultado seguro: a tela nunca declara
// "Tudo conferido" com pendente fora da amostra. Dados fictícios.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { filtroDosPendentes, numerosDaConferencia, paginaDoEndereco, resumoDosPendentes } from "../../lib/estoque/conferencia";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const HOJE = "2026-11-14T15:00:00.000Z";
const ONTEM = "2026-11-13T15:00:00.000Z";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  itens: [] as Record<string, unknown>[],
  semNumero: false,
  erro: null as null | { code: string },
  pedidos: [] as { tabela: string; contar: boolean; cabeca: boolean; inicio: number | null; fim: number | null; ordem: string[] }[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
vi.mock("../../lib/estoque/regras", async (original) => ({ ...(await original<object>()), inicioDoDiaEmSaoPaulo: () => "2026-11-14T03:00:00.000Z" }));

const TETO_DA_API = 1000;
class Consulta {
  private linhas: Linha[];
  private pedido: { tabela: string; contar: boolean; cabeca: boolean; inicio: number | null; fim: number | null; ordem: string[] };
  constructor(tabela: string) {
    this.linhas = tabela === "itens_serializados" ? [...cenario.itens] : cenario.itens.length ? [{ id: "variante-1", nome: "Galaxy A15", sku: "APA-0001" }, { id: "variante-2", nome: "Chip pré", sku: "CHI-0001" }] : [];
    this.pedido = { tabela, contar: false, cabeca: false, inicio: null, fim: null, ordem: [] };
    cenario.pedidos.push(this.pedido);
  }
  select(_colunas: string, opcoes?: { count?: string; head?: boolean }) { this.pedido.contar = opcoes?.count === "exact"; this.pedido.cabeca = Boolean(opcoes?.head); return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === valor); return this; }
  gte(coluna: string, valor: string) { this.linhas = this.linhas.filter((l) => typeof l[coluna] === "string" && (l[coluna] as string) >= valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[coluna])); return this; }
  or(filtro: string) {
    const limite = /^conferido_em\.is\.null,conferido_em\.lt\."([^"]+)"$/.exec(filtro)?.[1];
    if (!limite) throw new Error(`filtro inesperado: ${filtro}`);
    this.linhas = this.linhas.filter((l) => l.conferido_em === null || (l.conferido_em as string) < limite);
    return this;
  }
  order(coluna: string) {
    this.pedido.ordem.push(coluna);
    const ordem = [...this.pedido.ordem];
    this.linhas = [...this.linhas].sort((a, b) => { for (const c of ordem) { const x = String(a[c]); const y = String(b[c]); if (x !== y) return x < y ? -1 : 1; } return 0; });
    return this;
  }
  range(inicio: number, fim: number) { this.pedido.inicio = inicio; this.pedido.fim = fim; return this; }
  then(resolver: (r: unknown) => unknown) {
    if (cenario.erro) return Promise.resolve({ data: null, count: null, error: cenario.erro }).then(resolver);
    const count = this.pedido.contar ? (cenario.semNumero ? null : this.linhas.length) : null;
    const inicio = this.pedido.inicio ?? 0;
    const fim = Math.min(this.pedido.fim ?? this.linhas.length - 1, inicio + TETO_DA_API - 1);
    const data = this.pedido.cabeca ? null : this.linhas.slice(inicio, fim + 1);
    return Promise.resolve({ data, count, error: null }).then(resolver);
  }
}
const supabase = {
  from: (tabela: string) => new Consulta(tabela),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: ["estoque.consultar", "estoque.conferir"].includes(String(argumentos.p_permissao)), error: null };
    return { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase,
  }),
}));

import Estoque from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Linha>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string> = {}) =>
  texto(await Estoque({ searchParams: Promise.resolve({ aba: "conferencia", ...parametros }) }) as ReactElement).replace(/\s+/g, " ");
const item = (n: number, mudancas: Linha = {}) => ({
  id: `item-${String(n).padStart(5, "0")}`, variante_id: n % 2 ? "variante-1" : "variante-2", imei: n % 2 ? `35${String(n).padStart(13, "0")}` : null,
  iccid: n % 2 ? null : `8955${String(n).padStart(15, "0")}`, situacao: "disponivel", em_estoque: true, unidade_id: LOJA, conferido_em: HOJE, ...mudancas,
});
const listados = (t: string) => (t.match(/(IMEI|ICCID) \d+/g) ?? []).length;

beforeEach(() => {
  cenario.itens = [];
  cenario.semNumero = false;
  cenario.erro = null;
  cenario.pedidos = [];
});

describe("conferência do dia (#80)", () => {
  it("501 itens, os 500 primeiros conferidos e o último pendente: nunca 'Tudo conferido'", async () => {
    cenario.itens = Array.from({ length: 501 }, (_, n) => item(n + 1, n === 500 ? { conferido_em: null } : {}));
    const t = await tela();
    expect(t).toContain("500 de 501 aparelhos e chips conferidos");
    expect(t).toContain("1 item(ns)");
    expect(t).not.toContain("Tudo conferido");
    expect(t).not.toContain("Nenhum pendente.");
    expect(t).toContain("IMEI 350000000000501");
    expect(t).toContain(" 99% "); // 500/501 não arredonda para a barra cheia
    expect(t).not.toContain("100%");
    // As três contagens foram feitas no banco (count exact, sem trazer linhas) e a lista veio por página.
    const contagens = cenario.pedidos.filter((p) => p.tabela === "itens_serializados" && p.cabeca);
    expect(contagens).toHaveLength(3);
    expect(contagens.every((p) => p.contar)).toBe(true);
    expect(cenario.pedidos.find((p) => p.tabela === "itens_serializados" && !p.cabeca)).toMatchObject({ inicio: 0, fim: 99, ordem: ["variante_id", "id"] });
  });

  it("mais de 1.000 itens: números do banco inteiro, pendentes em páginas de 100 com ordem estável", async () => {
    cenario.itens = Array.from({ length: 1205 }, (_, n) => item(n + 1, n >= 1000 ? { conferido_em: n % 3 ? ONTEM : null } : {}));
    let t = await tela();
    expect(t).toContain("1000 de 1205 aparelhos e chips conferidos");
    expect(t).toContain("205 item(ns) · mostrando 1 a 100");
    expect(t).toContain("Página 1 de 3");
    expect(t).toContain("Próximos");
    expect(listados(t)).toBe(100);
    t = await tela({ pagina: "3" });
    expect(t).toContain("205 item(ns) · mostrando 201 a 205");
    expect(t).toContain("Anteriores");
    expect(listados(t)).toBe(5);
    // Página além do fim volta para a última; texto no lugar do número vira a primeira.
    expect(await tela({ pagina: "99" })).toContain("mostrando 201 a 205");
    expect(await tela({ pagina: "dois" })).toContain("mostrando 1 a 100");
  });

  it("conferido ontem é pendente hoje; item de outra loja e fora do estoque não entram", async () => {
    cenario.itens = [
      item(1), item(2, { conferido_em: ONTEM }), item(3, { conferido_em: null }),
      item(4, { unidade_id: OUTRA, conferido_em: null }), item(5, { em_estoque: false, conferido_em: null }),
    ];
    const t = await tela();
    expect(t).toContain("1 de 3 aparelhos e chips conferidos");
    expect(t).toContain("2 item(ns)");
    expect(listados(t)).toBe(2);
  });

  it("tudo conferido só com o número do banco em zero; loja sem aparelho não é 'tudo conferido'", async () => {
    cenario.itens = [item(1), item(2)];
    expect(await tela()).toContain("Tudo conferido");
    cenario.itens = [];
    const vazio = await tela();
    expect(vazio).toContain("Nenhum aparelho ou chip no estoque desta loja");
    expect(vazio).not.toContain("Tudo conferido");
  });

  it("contagem sem número não vira zero nem 'tudo conferido'; erro do banco vira falha", async () => {
    cenario.itens = [item(1), item(2, { conferido_em: null })];
    cenario.semNumero = true;
    const t = await tela();
    expect(t).toContain("Não deu para contar os aparelhos e chips agora");
    expect(t).not.toContain("Tudo conferido");
    expect(t).not.toContain("de 0 aparelhos");
    cenario.semNumero = false;
    cenario.erro = { code: "57014" };
    await expect(tela()).rejects.toThrow();
  });
});

describe("regras da conferência", () => {
  it("filtro dos pendentes, página do endereço e resumo", () => {
    expect(filtroDosPendentes("2026-11-14T03:00:00.000Z")).toBe('conferido_em.is.null,conferido_em.lt."2026-11-14T03:00:00.000Z"');
    expect(() => filtroDosPendentes('2026-11-14",id.neq.x')).toThrow();
    expect(paginaDoEndereco(undefined)).toBe(1);
    expect(paginaDoEndereco("0")).toBe(1);
    expect(paginaDoEndereco("7")).toBe(7);
    expect(numerosDaConferencia(10, null, 3)).toBeNull();
    expect(resumoDosPendentes(null, 1)).toBe("Não deu para contar agora");
    expect(resumoDosPendentes({ total: 250, conferidos: 0, pendentes: 250 }, 3)).toBe("250 item(ns) · mostrando 201 a 250");
  });
});

// Telas reais novas da revisão de 10/11/2026 (lista de vendas e molde com o menu), montadas com a
// sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede. O simulador aplica eq/neq/in/
// limit/order na ordem das chamadas, como o PostgREST; o filtro de período (or) é conferido no
// teste das regras (lib/vendas/lista.test.ts).
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  pendencias: { aprovacoes: 0, notas: 0 },
  idasAoBanco: 0,
  rankingFalha: false,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  cabeca = false;
  constructor(nome: string) {
    cenario.idasAoBanco += 1;
    this.linhas = [...(cenario.tabelas[nome] ?? [])];
    // O RLS de perfis_usuario (perfis_ler): o próprio perfil e, com usuarios.gerir, os de quem a pessoa gere. Antes do J2-b o
    // simulador devolvia todos, e a lista da gerência parecia mostrar o nome do colega (no banco, era "Outro vendedor").
    if (nome === "perfis_usuario" && !cenario.permissoes.has("usuarios.gerir")) this.linhas = this.linhas.filter((l) => l.id === EU);
  }
  select(_colunas?: string, opcoes?: { head?: boolean }) { this.cabeca = Boolean(opcoes?.head); return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === valor); return this; }
  neq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] !== valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[coluna])); return this; }
  is(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => (l[coluna] ?? null) === valor); return this; }
  or() { return this; }
  gte() { return this; }
  order(coluna: string, opcoes?: { ascending?: boolean }) {
    const sinal = opcoes?.ascending === false ? -1 : 1;
    this.linhas.sort((a, b) => (Number(a[coluna]) - Number(b[coluna])) * sinal);
    return this;
  }
  limit(n: number) { this.linhas = this.linhas.slice(0, n); return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Record<string, unknown>[] | null; count: number; error: null }) => unknown) {
    return Promise.resolve({ data: this.cabeca ? null : this.linhas, count: this.linhas.length, error: null }).then(resolver);
  }
}
const EU = "00000000-0000-4000-8000-0000000000aa";
const COLEGA = "00000000-0000-4000-8000-0000000000bb";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const sessaoFicticia = {
  usuario: { id: EU },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-10T23:00:00Z" },
  // O molde chega com a sessão (public.molde_da_sessao, lote VEL-a): permissões do menu, nome, vínculos e contagens.
  get molde() {
    return {
      permissoes: cenario.permissoes,
      nome: "Ana (fictícia)",
      vinculos: [{ papel: "vendedor", escopo: "unidade", unidade_id: LOJA }],
      pendencias: cenario.pendencias,
    };
  },
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: { p_permissao?: string; p_vendedores?: string[] }) => {
      cenario.idasAoBanco += 1;
      if (nome === "ranking_nomes") {
        // public.ranking_nomes: com ranking.ver, o nome de quem tem venda concluída; sem, nada.
        if (cenario.rankingFalha) return { data: null, error: { code: "XX000", message: "falha simulada" } };
        const pedidos = argumentos.p_vendedores ?? [];
        const comVenda = (id: unknown) => (cenario.tabelas.vendas ?? []).some((v) => v.vendedor_id === id && v.situacao === "concluida");
        const nomes = cenario.permissoes.has("ranking.ver")
          ? (cenario.tabelas.perfis_usuario ?? []).filter((p) => pedidos.includes(p.id as string) && comVenda(p.id)).map((p) => ({ id: p.id, nome: p.nome }))
          : [];
        return { data: nomes, error: null };
      }
      return { data: nome === "tem_permissao" ? cenario.permissoes.has(argumentos.p_permissao ?? "") : null, error: null };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { MoldeReal } from "../../componentes/MoldeReal";
import Vendas from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    const p = v.props;
    return [p.titulo, p.subtitulo, p.sobretitulo, p.rotulo, p.valor, p.detalhe, p.children, p.grupos].map(texto).join(" ");
  }
  // Itens do menu lateral (Trilho, componente de cliente): chegam como dados, não como elementos.
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const telaDeVendas = async (q: Record<string, string> = {}) => texto(await Vendas({ searchParams: Promise.resolve(q) })).replace(/\s+/g, " ");
/** Os endereços dos links e botões da tela (o "Nova venda" fica na ação do título, fora do texto). */
async function enderecosDaTela(q: Record<string, string> = {}): Promise<string[]> {
  const achados: string[] = [];
  const colher = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(colher);
    if (!v || typeof v !== "object") return;
    const o = (isValidElement<Record<string, unknown>>(v) ? v.props : v) as Record<string, unknown>;
    if (typeof o.href === "string") achados.push(o.href);
    Object.values(o).forEach(colher);
  };
  colher(await Vendas({ searchParams: Promise.resolve(q) }));
  return achados;
}

const venda = (numero: number, vendedor: string, situacao: string, total: number | null, devolvido = 0) => ({
  id: `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`, numero, situacao, vendedor_id: vendedor, unidade_id: LOJA,
  total_centavos: total, devolvido_centavos: devolvido, criado_em: "2026-11-10T13:00:00Z", concluida_em: situacao === "concluida" ? "2026-11-10T13:05:00Z" : null, cliente_nome: null,
});

beforeEach(() => {
  cenario.tabelas = {
    vendas: [venda(1, EU, "concluida", 149_900), venda(2, COLEGA, "concluida", 7_900, 7_900), venda(3, EU, "rascunho", null), venda(4, COLEGA, "cancelada", 50_000)],
    notas_pedidos: [{ venda_id: venda(1, EU, "", 0).id, situacao: "aguardando_aprovacao", unidade_id: LOJA }],
    perfis_usuario: [{ id: EU, nome: "Ana (fictícia)" }, { id: COLEGA, nome: "Bruno (fictício)" }],
  };
  cenario.pendencias = { aprovacoes: 0, notas: 0 };
  cenario.idasAoBanco = 0;
  cenario.rankingFalha = false;
});

describe("lista real de vendas", () => {
  it("vendedor: só as próprias vendas, sem nome de colega e sem custo; resumo só das concluídas", async () => {
    cenario.permissoes = new Set(["venda.registrar", "caixa.abrir", "estoque.consultar"]);
    const tela = await telaDeVendas();
    expect(tela).toContain("Minhas vendas");
    expect(tela).toContain("Nº 1");
    expect(tela).toContain("Nº 3");
    expect(tela).not.toContain("Nº 2");
    expect(tela).not.toContain("Bruno");
    expect(tela).toContain("nota pedida");
    expect(tela).toMatch(/Vendido \(concluídas\) R\$\s1\.499,00/);
    expect(tela).not.toMatch(/custo|margem/i);
  });

  it("gerência: a loja inteira, com o nome de quem vendeu (pelo ranking: o perfil do colega não se lê), devolução e cancelada", async () => {
    cenario.permissoes = new Set(["venda.registrar", "venda.ver_unidade", "desconto.aprovar", "ranking.ver"]);
    const tela = await telaDeVendas();
    expect(tela).toContain("Vendas da loja");
    expect(tela).toContain("Bruno (fictício)");
    expect(tela).not.toContain("Outro vendedor");
    expect(tela).toContain("Você");
    expect(tela).toMatch(/devolvido R\$\s79,00/);
    expect(tela).toMatch(/Vendido \(concluídas\) R\$\s1\.578,00/);
    expect(tela).toMatch(/Líquido R\$\s1\.499,00/);
  });

  it("gerência sem ranking.ver: nenhum nome de colega, só \"Outro vendedor\"", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    const tela = await telaDeVendas();
    expect(tela).toContain("Outro vendedor");
    expect(tela).not.toContain("Bruno");
  });

  it("a falha da leitura dos nomes não derruba a lista: fica \"Outro vendedor\"", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade", "ranking.ver"]);
    cenario.rankingFalha = true;
    const tela = await telaDeVendas();
    expect(tela).toContain("Nº 2");
    expect(tela).toContain("Outro vendedor");
    expect(tela).not.toContain("Bruno");
  });

  it("os nomes vêm na mesma rodada das notas, numa ida a mais só com ranking.ver", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    await telaDeVendas();
    const semRanking = cenario.idasAoBanco;
    cenario.idasAoBanco = 0;
    cenario.permissoes = new Set(["venda.ver_unidade", "ranking.ver"]);
    await telaDeVendas();
    expect(cenario.idasAoBanco).toBe(semRanking + 1);
  });

  it("a rede (venda.ver_todas, sem venda.ver_unidade, como o administrador): a loja inteira, sem o botão de nova venda", async () => {
    cenario.permissoes = new Set(["venda.ver_todas", "ranking.ver"]);
    const tela = await telaDeVendas();
    expect(tela).toContain("Vendas da loja");
    expect(tela).not.toContain("Minhas vendas");
    expect(tela).toContain("Nº 2");
    expect(tela).toContain("Bruno (fictício)");
    expect(await enderecosDaTela()).not.toContain("/vender");
  });

  it("quem cuida da equipe (usuarios.gerir) lê o nome pelo perfil, mesmo sem ranking.ver", async () => {
    cenario.permissoes = new Set(["venda.ver_todas", "usuarios.gerir"]);
    expect(await telaDeVendas()).toContain("Bruno (fictício)");
  });

  it("quem vende tem o botão de nova venda", async () => {
    cenario.permissoes = new Set(["venda.registrar"]);
    expect(await enderecosDaTela()).toContain("/vender");
  });

  it("filtro de situação e busca pelo número", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    const canceladas = await telaDeVendas({ situacao: "canceladas" });
    expect(canceladas).toContain("Nº 4");
    expect(canceladas).not.toContain("Nº 1 ");
    const busca = await telaDeVendas({ numero: "2" });
    expect(busca).toContain("Nº 2");
    expect(busca).not.toContain("Nº 4");
  });
});

describe("molde comum das telas reais", () => {
  const menu = async () => texto(MoldeReal({ sessao: sessaoFicticia as never, children: null }) as ReactElement);

  it("vendedor não vê aprovações, notas, auditoria nem equipe; vê vender, vendas, caixa e estoque", async () => {
    cenario.permissoes = new Set(["venda.registrar", "caixa.abrir", "estoque.consultar", "connect.operar"]);
    const tela = await menu();
    for (const item of ["Vender", "Vendas", "Caixa", "Estoque e conferência", "Ora Connect", "Catálogo e fotos"]) expect(tela).toContain(item);
    for (const item of ["Aprovações de desconto", "Notas fiscais", "Auditoria", "Equipe e acessos"]) expect(tela).not.toContain(item);
    expect(tela).toContain("Ana (fictícia)");
    expect(tela).toContain("Vendedor");
    expect(tela).toContain("Santa Cândida (teste)");
  });

  it("gerente vê aprovações e auditoria; dono vê a equipe", async () => {
    cenario.permissoes = new Set(["venda.registrar", "venda.ver_unidade", "desconto.aprovar", "nota.aprovar", "auditoria.ver"]);
    expect(await menu()).toContain("Aprovações de desconto");
    expect(await menu()).toContain("Auditoria");
    expect(await menu()).not.toContain("Equipe e acessos");
    cenario.permissoes = new Set([...cenario.permissoes, "usuarios.gerir"]);
    expect(await menu()).toContain("Equipe e acessos");
  });

  it("pré-carga só dos atalhos e o botão da loja que encolhe (VEL-h)", async () => {
    cenario.permissoes = new Set(["venda.registrar", "venda.ver_unidade", "desconto.aprovar", "nota.aprovar", "auditoria.ver"]);
    const molde = MoldeReal({ sessao: sessaoFicticia as never, children: null }) as ReactElement;
    const elementos: ReactElement<Record<string, unknown>>[] = [];
    const colher = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(colher);
      if (!v || typeof v !== "object") return;
      if (isValidElement<Record<string, unknown>>(v)) elementos.push(v);
      const o = (isValidElement<Record<string, unknown>>(v) ? v.props : v) as Record<string, unknown>;
      Object.values(o).forEach(colher);
    };
    colher(molde);
    const nomeDe = (e: ReactElement) => (typeof e.type === "function" ? e.type.name : String(e.type));
    // O botão da loja no topo encolhe (min-w-0): sem isso, um nome longo alargava a página no celular.
    const daLoja = elementos.find((e) => e.props.href === "/escolher-loja" && e.props.title === "Trocar de loja");
    expect(daLoja?.props.className).toContain("min-w-0");
    expect(daLoja?.props.prefetch).toBe(false);
    // Nenhum link do molde pré-carrega por conta própria; só os atalhos, nos dois menus.
    for (const e of elementos.filter((x) => typeof x.props.href === "string" && nomeDe(x) !== "a")) expect(e.props.prefetch, String(e.props.href)).toBe(false);
    const trilho = elementos.find((e) => nomeDe(e) === "Trilho");
    expect(trilho?.props.preCarregar).toEqual(["/inicio", "/vender", "/aprovacoes", "/vendas"]);
    const barra = elementos.find((e) => nomeDe(e) === "NavegacaoCelular");
    expect(barra?.props.preCarregarMais).toBe(false);
  });

  it("não vai ao banco: menu, nome, papel e emblemas chegam com a sessão (VEL-a)", async () => {
    cenario.permissoes = new Set(["venda.registrar", "venda.ver_unidade", "desconto.aprovar", "nota.aprovar"]);
    cenario.pendencias = { aprovacoes: 3, notas: 14 };
    const molde = MoldeReal({ sessao: sessaoFicticia as never, children: null }) as ReactElement;
    expect(cenario.idasAoBanco).toBe(0);
    const emblemas: Record<string, unknown> = {};
    const colher = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(colher);
      if (!v || typeof v !== "object") return;
      const o = (isValidElement<Record<string, unknown>>(v) ? v.props : v) as Record<string, unknown>;
      if (typeof o.href === "string" && "emblema" in o) emblemas[o.href] = o.emblema;
      Object.values(o).forEach(colher);
    };
    colher(molde);
    expect(emblemas["/aprovacoes"]).toBe(3);
    expect(emblemas["/notas"]).toBe(14);
    // As outras páginas não levam emblema.
    expect(Object.entries(emblemas).filter(([, n]) => n !== undefined).map(([href]) => href).sort()).toEqual(["/aprovacoes", "/notas"]);
  });
});

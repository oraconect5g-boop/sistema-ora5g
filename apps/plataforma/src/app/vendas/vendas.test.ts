// Telas reais novas da revisão de 10/11/2026 (lista de vendas e molde com o menu), montadas com a
// sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede. O simulador aplica eq/neq/in/
// limit/order na ordem das chamadas, como o PostgREST; o filtro de período (or) é conferido no
// teste das regras (lib/vendas/lista.test.ts).
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({ permissoes: new Set<string>(), tabelas: {} as Record<string, Record<string, unknown>[]> }));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  cabeca = false;
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
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
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: { p_permissao?: string }) =>
      ({ data: nome === "tem_permissao" ? cenario.permissoes.has(argumentos.p_permissao ?? "") : null, error: null }),
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

const venda = (numero: number, vendedor: string, situacao: string, total: number | null, devolvido = 0) => ({
  id: `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`, numero, situacao, vendedor_id: vendedor, unidade_id: LOJA,
  total_centavos: total, devolvido_centavos: devolvido, criado_em: "2026-11-10T13:00:00Z", concluida_em: situacao === "concluida" ? "2026-11-10T13:05:00Z" : null, cliente_nome: null,
});

beforeEach(() => {
  cenario.tabelas = {
    vendas: [venda(1, EU, "concluida", 149_900), venda(2, COLEGA, "concluida", 7_900, 7_900), venda(3, EU, "rascunho", null), venda(4, COLEGA, "cancelada", 50_000)],
    notas_pedidos: [{ venda_id: venda(1, EU, "", 0).id, situacao: "aguardando_aprovacao", unidade_id: LOJA }],
    perfis_usuario: [{ id: EU, nome: "Ana (fictícia)" }, { id: COLEGA, nome: "Bruno (fictício)" }],
    vinculos: [{ usuario_id: EU, papel: "vendedor", escopo: "unidade", unidade_id: LOJA, fim: null }],
    aprovacoes_desconto: [{ id: "a1", unidade_id: LOJA, situacao: "pendente" }],
  };
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

  it("gerência: a loja inteira, com o nome de quem vendeu, devolução e cancelada", async () => {
    cenario.permissoes = new Set(["venda.registrar", "venda.ver_unidade", "desconto.aprovar"]);
    const tela = await telaDeVendas();
    expect(tela).toContain("Vendas da loja");
    expect(tela).toContain("Bruno (fictício)");
    expect(tela).toContain("Você");
    expect(tela).toMatch(/devolvido R\$\s79,00/);
    expect(tela).toMatch(/Vendido \(concluídas\) R\$\s1\.578,00/);
    expect(tela).toMatch(/Líquido R\$\s1\.499,00/);
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
  const menu = async () => texto(await MoldeReal({ sessao: sessaoFicticia as never, children: null }) as ReactElement);

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
});

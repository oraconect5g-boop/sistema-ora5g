// O conserto da OS no carrinho do PDV e no comprovante (lote L12c: ORA-OS-006), com sessão e Supabase SIMULADOS: nenhuma
// credencial, nenhuma rede. Dados fictícios. As regras do banco estão em packages/banco/src/ordem-de-servico.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDA = "00000000-0000-4000-8000-00000000d101";
const CONSERTO = "00000000-0000-4000-8000-00000000e111";
const OS = "00000000-0000-4000-8000-00000000e112";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  /** O banco ainda sem a migration do L12c: pedir a coluna os_id dá erro de coluna ausente. */
  semColunaDaOs: false,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrada"); },
}));
class Consulta {
  linhas: Linha[];
  erro: { code: string } | null = null;
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select(colunas = "") {
    if (cenario.semColunaDaOs && colunas.includes("os_id")) this.erro = { code: "42703" };
    return this;
  }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq() { return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
  not(coluna: string, operador: string, valor: unknown) {
    if (operador === "is" && valor === null) this.linhas = this.linhas.filter((l) => l[coluna] !== null && l[coluna] !== undefined);
    return this;
  }
  is() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Linha[] | null; error: { code: string } | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas, error: null }).then(resolver);
  }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) =>
    nome === "tem_permissao" ? { data: argumentos.p_permissao === "venda.registrar", error: null } : { data: null, error: { code: "PGRST202" } },
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: EU },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase,
  }),
}));

import Vender from "../vender/page";
import Venda from "./[id]/page";

function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "string") andar(x.props.children);
      else andar(tipo === "MoldeReal" ? x.props.children : [x.props.titulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
const comprovante = async () => texto(await Venda({ params: Promise.resolve({ id: VENDA }), searchParams: Promise.resolve({}) } as never) as ReactElement);
const carrinho = async (parametros: Record<string, string> = {}) => {
  cenario.tabelas.vendas = [{ id: VENDA, numero: 43, situacao: "rascunho", vendedor_id: EU, unidade_id: LOJA }];
  cenario.tabelas.caixas = [{ id: "cx1", aberto_em: "2026-11-14T12:00:00Z" }];
  return texto(await Vender({ searchParams: Promise.resolve(parametros) }) as ReactElement);
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.semColunaDaOs = false;
  cenario.tabelas = {
    vendas: [{ id: VENDA, numero: 42, situacao: "concluida", unidade_id: LOJA, vendedor_id: EU, cliente_nome: null, cliente_id: null, total_centavos: 33_000, subtotal_centavos: 33_000, desconto_centavos: 0, troco_centavos: 0, recebido_centavos: 33_000, a_receber_centavos: 0, devolvido_centavos: 0, concluida_em: "2026-11-14T15:00:00Z", cancelada_em: null, motivo_cancelamento: null }],
    venda_itens: [{ id: "i1", venda_id: VENDA, variante_id: CONSERTO, item_serializado_id: null, tipo: "servico", quantidade: 1, preco_unitario_centavos: 33_000, desconto_centavos: 0, preco_id: null, os_id: OS }],
    variantes: [{ id: CONSERTO, sku: "OS-CONSERTO", nome: "Conserto genérico", produto_id: "p1", produtos: { nome: "Conserto (ordem de serviço)", tipo: "servico" } }],
    ordens_servico: [{ id: OS, numero: 7, situacao: "aberta" }],
    unidades: [{ id: LOJA, nome: "Santa Cândida (teste)", cnpj: null }],
    perfis_usuario: [{ id: EU, nome: "Vendedora Teste" }],
  };
});
afterEach(() => { vi.restoreAllMocks(); });

describe("o conserto da OS na venda (L12c)", () => {
  it("no carrinho do PDV: o conserto com o número da OS, o valor aprovado e o caminho de volta para a OS", async () => {
    const t = await carrinho({ os: "no_carrinho" });
    expect(t).toContain("O conserto da OS entrou no carrinho pelo valor do orçamento aprovado.");
    expect(t).toContain("Conserto da OS nº 7");
    expect(t).toContain("valor do orçamento aprovado");
    expect(t).toContain("ver a OS");
    expect(t).toContain("R$ 330,00");
  });

  it("no comprovante: o item é o conserto da OS nº 7; concluída e a OS ainda aberta, lembra de registrar a entrega; entregue, não", async () => {
    let t = await comprovante();
    expect(t).toContain("Conserto da OS nº 7");
    expect(t).toContain("Falta registrar a entrega ao cliente");
    cenario.tabelas.ordens_servico = [{ id: OS, numero: 7, situacao: "entregue" }];
    t = await comprovante();
    expect(t).toContain("Conserto da OS nº 7");
    expect(t).not.toContain("Falta registrar a entrega");
  });

  it("banco ainda sem a migration: a venda e o carrinho mostram o item pelo nome do produto, sem erro", async () => {
    cenario.semColunaDaOs = true;
    const venda = await comprovante();
    expect(venda).toContain("Conserto genérico");
    expect(venda).not.toContain("OS nº 7");
    expect(venda).toContain("Total");
    const pdv = await carrinho();
    expect(pdv).toContain("Conserto genérico");
    expect(pdv).not.toContain("OS nº 7");
    expect(vi.mocked(console.error).mock.calls).toEqual([]);
  });
});

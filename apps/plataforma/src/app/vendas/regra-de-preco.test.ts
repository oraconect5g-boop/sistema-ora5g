// A regra de preço de cada item na tela da venda e no carrinho do PDV (lote L6b), com sessão e Supabase
// SIMULADOS: nenhuma credencial, nenhuma rede. Dados fictícios.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDA = "00000000-0000-4000-8000-00000000d001";
const CAPA = "00000000-0000-4000-8000-00000000e001";
const CABO = "00000000-0000-4000-8000-00000000e002";
const CAMPANHA = "00000000-0000-4000-8000-00000000f001";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  erros: {} as Record<string, { code: string }>,
  /** O banco ainda sem a migration do L6b: pedir a coluna preco_id dá erro de coluna ausente. */
  semColunaDaRegra: false,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrada"); },
}));
class Consulta {
  linhas: Linha[];
  erro: { code: string } | null;
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; this.erro = cenario.erros[nome] ?? null; }
  select(colunas = "") {
    if (cenario.semColunaDaRegra && colunas.includes("preco_id")) this.erro = { code: "42703" };
    return this;
  }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq() { return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
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
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-13T23:00:00Z" },
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

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.erros = {};
  cenario.semColunaDaRegra = false;
  cenario.tabelas = {
    vendas: [{ id: VENDA, numero: 42, situacao: "concluida", unidade_id: LOJA, vendedor_id: EU, cliente_nome: null, cliente_id: null, total_centavos: 14_800, subtotal_centavos: 14_800, desconto_centavos: 0, troco_centavos: 0, recebido_centavos: 14_800, a_receber_centavos: 0, devolvido_centavos: 0, concluida_em: "2026-11-13T15:00:00Z", cancelada_em: null, motivo_cancelamento: null }],
    venda_itens: [
      { id: "i1", venda_id: VENDA, variante_id: CAPA, item_serializado_id: null, tipo: "acessorio", quantidade: 1, preco_unitario_centavos: 6_900, desconto_centavos: 0, preco_id: CAMPANHA },
      { id: "i2", venda_id: VENDA, variante_id: CABO, item_serializado_id: null, tipo: "acessorio", quantidade: 1, preco_unitario_centavos: 7_900, desconto_centavos: 0, preco_id: null },
    ],
    variantes: [{ id: CAPA, sku: "ACE-0001", nome: "Capa de proteção", produto_id: "p1", produtos: { nome: "Capa", tipo: "acessorio" } }, { id: CABO, sku: "ACE-0002", nome: "Cabo USB-C", produto_id: "p2", produtos: { nome: "Cabo", tipo: "acessorio" } }],
    precos: [{ id: CAMPANHA, origem: "campanha", unidade_id: LOJA, motivo: "Semana da capa", fim: "2026-11-15T02:59:00Z" }],
    unidades: [{ id: LOJA, nome: "Santa Cândida (teste)", cnpj: null }],
    perfis_usuario: [{ id: EU, nome: "Vendedora Teste" }],
  };
});
afterEach(() => { vi.restoreAllMocks(); });

describe("a regra de preço de cada item (L6b)", () => {
  it("na venda: a campanha com o nome e até quando; o item de antes do lote diz que a regra não foi registrada", async () => {
    const t = texto(await Venda({ params: Promise.resolve({ id: VENDA }), searchParams: Promise.resolve({}) } as never) as ReactElement);
    expect(t).toContain("Capa de proteção ACE-0001 · 1 un. Campanha da loja: Semana da capa (até 14/11, 23:59)");
    expect(t).toContain("Cabo USB-C ACE-0002 · 1 un. Regra de preço não registrada (item de antes de 13/11/2026)");
  });

  it("na venda, leitura das regras que falha: o item diz \"não lida\" e a venda continua na tela", async () => {
    cenario.erros = { precos: { code: "57014" } };
    const t = texto(await Venda({ params: Promise.resolve({ id: VENDA }), searchParams: Promise.resolve({}) } as never) as ReactElement);
    expect(t).toContain("Capa de proteção ACE-0001 · 1 un. Regra de preço não lida agora");
    expect(t).toContain("Total");
  });

  it("no carrinho do PDV: só a campanha aparece, com o nome e até quando", async () => {
    cenario.tabelas.vendas = [{ id: VENDA, numero: 43, situacao: "rascunho", vendedor_id: EU, unidade_id: LOJA }];
    cenario.tabelas.caixas = [{ id: "cx1", aberto_em: "2026-11-13T12:00:00Z" }];
    const t = texto(await Vender({ searchParams: Promise.resolve({}) }) as ReactElement);
    expect(t).toContain("Campanha da loja: Semana da capa (até 14/11, 23:59)");
    expect(t).not.toContain("Regra de preço não registrada");
  });

  it("banco ainda sem a migration: a venda e o carrinho seguem iguais, só sem a linha da regra", async () => {
    cenario.semColunaDaRegra = true;
    const venda = texto(await Venda({ params: Promise.resolve({ id: VENDA }), searchParams: Promise.resolve({}) } as never) as ReactElement);
    expect(venda).toContain("Capa de proteção ACE-0001 · 1 un.");
    expect(venda).not.toContain("Regra de preço");
    expect(venda).not.toContain("Campanha");
    expect(venda).toContain("Total");
    cenario.tabelas.vendas = [{ id: VENDA, numero: 43, situacao: "rascunho", vendedor_id: EU, unidade_id: LOJA }];
    cenario.tabelas.caixas = [{ id: "cx1", aberto_em: "2026-11-13T12:00:00Z" }];
    const carrinho = texto(await Vender({ searchParams: Promise.resolve({}) }) as ReactElement);
    expect(carrinho).toContain("Capa de proteção");
    expect(carrinho).not.toContain("Campanha");
    expect(vi.mocked(console.error).mock.calls).toEqual([]);
  });
});

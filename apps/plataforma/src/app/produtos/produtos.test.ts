// Cadastro de produtos (L3a) montado com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma
// rede. Confere permissão, lista, política de desconto só para quem altera preço e o que as ações
// mandam ao banco. As regras do banco estão provadas em packages/banco/src/catalogo-cadastro.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const ORG = "00000000-0000-4000-8000-0000000000ff";
const DONO = "00000000-0000-4000-8000-0000000000aa";
const CATEGORIA = "00000000-0000-4000-9000-000000000001";
const INATIVA = "00000000-0000-4000-9000-000000000002";
const MARCA = "00000000-0000-4000-9000-000000000010";
const PRODUTO = "00000000-0000-4000-9000-000000000020";
const VARIANTE = "00000000-0000-4000-9000-000000000030";

const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
  ilike() { return this; }
  is() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Record<string, unknown>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  usuario: { id: DONO },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-10T23:00:00Z" },
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: null };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { definirPolitica, salvarCategoria, salvarProduto, salvarVariante } from "./acoes";
import Produtos from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    // Componentes locais da tela (Motivo, Situacao) são simples: renderiza para ver os campos.
    if (typeof v.type === "function" && ["Motivo", "Situacao"].includes(v.type.name)) return texto((v.type as (p: unknown) => unknown)(v.props));
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string> = {}) => texto(await Produtos({ searchParams: Promise.resolve(parametros) }) as ReactElement);
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  cenario.permissoes = new Set();
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.tabelas = {
    unidades: [{ id: LOJA, organizacao_id: ORG }],
    categorias: [
      { id: CATEGORIA, nome: "Celulares (teste)", ativa: true, desconto_teto_pb: 1000, margem_minima_pb: 750 },
      { id: INATIVA, nome: "Antiga (teste)", ativa: false, desconto_teto_pb: null, margem_minima_pb: null },
    ],
    marcas: [{ id: MARCA, nome: "Marca Teste" }],
    produtos: [{ id: PRODUTO, nome: "Galaxy Teste", tipo: "aparelho", categoria_id: CATEGORIA, marca_id: MARCA, modelo: "SM-T", descricao: null, publicar_online: false, ativo: true }],
    variantes: [{ id: VARIANTE, produto_id: PRODUTO, sku: "APA-TESTE", nome: "Galaxy Teste 128 GB", cor: "Azul", capacidade: "128 GB", codigo_barras: "7890000000011", estoque_minimo: 2, ativa: true }],
  };
});

describe("/produtos", () => {
  it("sem catalogo.gerir (gerente, vendedor): sem permissão, com caminho para o catálogo, sem consultar nada", async () => {
    cenario.permissoes = new Set(["catalogo.fotos"]);
    const t = await tela();
    expect(t).toContain("Sem permissão");
    expect(t).toContain("/catalogo");
    expect(cenario.chamadas).toEqual([]);
  });

  it("administrador: produtos, variações, categorias e marcas; sem preco.alterar não vê o formulário da política", async () => {
    cenario.permissoes = new Set(["catalogo.gerir"]);
    const t = await tela();
    for (const trecho of ["Galaxy Teste", "APA-TESTE", "Azul", "mínimo 2", "Celulares (teste)", "Marca Teste", "desconto até 10% , margem mínima 7,5%", "Antiga (teste)", "inativa"]) {
      expect(t.replace(/\s+/g, " ")).toContain(trecho.replace(/\s+/g, " ").replace(" ,", ","));
    }
    expect(t).not.toContain("Gravar política de desconto");
    // A categoria inativa não aparece para produto novo.
    expect(t).toMatch(/Cadastrar produto/);
  });

  it("dono (altera preço): vê a política de desconto de cada categoria", async () => {
    cenario.permissoes = new Set(["catalogo.gerir", "preco.alterar"]);
    expect(await tela()).toContain("Gravar política de desconto");
  });
});

describe("ações do cadastro", () => {
  it("produto novo: manda a organização da loja, o tipo e a chave do formulário; abre a tela no produto criado", async () => {
    cenario.respostas.catalogo_salvar_produto = { data: { id: PRODUTO, repetida: false }, error: null };
    const destino = await destinoDe(salvarProduto(formulario({ tipo: "aparelho", nome: "Galaxy Teste", categoria: CATEGORIA, marca: "", modelo: "", descricao: "", chave: "form:12345678", motivo: "Produto novo" })));
    expect(destino).toBe(`/produtos?ok=produto_criado&q=Galaxy+Teste#produto-${PRODUTO}`);
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_organizacao: ORG, p_id: null, p_tipo: "aparelho", p_marca: null, p_chave: "form:12345678", p_ativo: null });
  });

  it("formulário inválido volta sem chamar o banco; erro do banco vira chave do catálogo", async () => {
    expect(await destinoDe(salvarVariante(formulario({ produto: PRODUTO, sku: "SKU COM ESPAÇO", nome: "x", motivo: "Variação" })))).toBe(`/produtos?erro=sku#produto-${PRODUTO}`);
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.catalogo_salvar_variante = { data: null, error: { code: "OR020", message: "Este SKU já foi usado em estoque, reserva ou venda e não muda" } };
    expect(await destinoDe(salvarVariante(formulario({ produto: PRODUTO, id: VARIANTE, sku: "APA-NOVO", nome: "Galaxy", motivo: "Troca de SKU", q: "galaxy" }))))
      .toBe(`/produtos?erro=sku_fixo&q=galaxy#produto-${PRODUTO}`);
  });

  it("categoria: inativar manda falso; política converte percentual em pontos-base", async () => {
    cenario.respostas.catalogo_salvar_categoria = { data: { id: CATEGORIA, repetida: false }, error: null };
    expect(await destinoDe(salvarCategoria(formulario({ id: CATEGORIA, nome: "Celulares", tem_ativo: "1", motivo: "Fim da linha" })))).toBe("/produtos?ok=categoria_alterada#categorias");
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_organizacao: ORG, p_id: CATEGORIA, p_ativa: false });
    cenario.respostas.catalogo_definir_politica_desconto = { data: true, error: null };
    expect(await destinoDe(definirPolitica(formulario({ categoria: CATEGORIA, teto: "12,5", margem: "8", motivo: "Política do dono" })))).toBe("/produtos?ok=politica_alterada#categorias");
    expect(cenario.chamadas[1]?.argumentos).toEqual({ p_categoria: CATEGORIA, p_teto_pb: 1250, p_margem_minima_pb: 800, p_motivo: "Política do dono" });
  });
});

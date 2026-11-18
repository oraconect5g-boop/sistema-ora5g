// O carrinho e o pedido do site (lote ONLINE-d: ORA-ONLINE-002; ADR-023), com o Supabase SIMULADO (dados fictícios). Quem
// decide é o banco: packages/banco/src/loja-online-pedido.test.ts.
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORGANIZACAO = "00000000-0000-4000-8000-000000000001";
const PRODUTO = "00000000-0000-4000-8000-0000000000a1";
const CAPA = "00000000-0000-4000-8000-0000000000b1";
const LOJA = "00000000-0000-4000-8000-0000000000c1";
const OUTRA = "00000000-0000-4000-8000-0000000000c2";
const CHAVE = "00000000-0000-4000-8000-0000000000d1";
const cenario = vi.hoisted(() => ({
  respostas: {} as Record<string, { data: unknown; error: null | { code: string } }>,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  ip: "200.1.1.1",
  cookies: new Map<string, string>(),
}));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (n: string) => (n === "x-forwarded-for" ? cenario.ip : null) }),
  cookies: async () => ({
    get: (n: string) => (cenario.cookies.has(n) ? { name: n, value: cenario.cookies.get(n) } : undefined),
    set: (n: string, v: string) => { cenario.cookies.set(n, v); },
    delete: (n: string) => { cenario.cookies.delete(n); },
  }),
}));
vi.mock("../../../lib/supabase/servidor", () => ({
  clienteSupabaseServidor: async () => ({
    rpc: async (nome: string, argumentos: Record<string, unknown>) => { cenario.chamadas.push({ nome, argumentos }); return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } }; },
  }),
}));

import { COOKIE_DO_CARRINHO, escreverCarrinho } from "../../../lib/loja/carrinho";
import { adicionarAoCarrinho, consultarPedido, pedirNoSite, tirarDoCarrinho } from "./acoes";
import Carrinho from "./page";

const formulario = (campos: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; };
const carrinho = () => cenario.cookies.get(COOKIE_DO_CARRINHO);
function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    const nome = typeof v.type === "function" ? (v.type as { name?: string }).name ?? "" : "";
    if (nome === "FormularioDoPedido") return "[formulário do pedido]";
    // Só o que aparece na tela: os filhos, e de um componente o título, o subtítulo e a ação (nada de className).
    return typeof v.type === "string" ? texto(v.props.children) : [v.props.titulo, v.props.subtitulo, v.props.acao, v.props.children].map(texto).join(" ");
  }
  return "";
}
const limpar = (v: unknown) => texto(v).replace(/\s+/g, " ");
const tela = async (parametros: Record<string, string> = {}) => limpar(await Carrinho({ searchParams: Promise.resolve(parametros) }));
const PEDIDO = {
  codigo: "PED234", situacao: "reservado", expira_em: "2026-11-19T03:00:00Z", total_centavos: 15_800, unidades: 2,
  itens: [{ produto: "Capa", variacao: "Azul", preco_centavos: 7_900 }, { produto: "Capa", variacao: "Azul", preco_centavos: 7_900 }],
  loja: { nome: "Santa Cândida", endereco: null, cidade: "Curitiba" },
};

beforeEach(() => {
  vi.stubEnv("LOJA_ONLINE_ORGANIZACAO", ORGANIZACAO);
  cenario.respostas = {};
  cenario.chamadas = [];
  cenario.cookies = new Map();
  cenario.ip = `200.1.1.${Math.floor(Math.random() * 250)}`;
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("o carrinho (ações)", () => {
  it("põe e tira no cookie; a loja é uma só (a troca recomeça o carrinho); identificador estranho é recusado", async () => {
    await expect(adicionarAoCarrinho(formulario({ produto: PRODUTO, variante: CAPA, loja: LOJA }))).rejects.toThrow("redirecionou para /loja/carrinho?ok=posto");
    await expect(adicionarAoCarrinho(formulario({ produto: PRODUTO, variante: CAPA, loja: LOJA }))).rejects.toThrow("ok=posto");
    expect(carrinho()).toBe(escreverCarrinho({ loja: LOJA, itens: [{ produto: PRODUTO, variante: CAPA }, { produto: PRODUTO, variante: CAPA }] }));
    await expect(adicionarAoCarrinho(formulario({ produto: PRODUTO, variante: CAPA, loja: OUTRA }))).rejects.toThrow(`erro=outra_loja&produto=${PRODUTO}`);
    await expect(adicionarAoCarrinho(formulario({ produto: PRODUTO, variante: CAPA, loja: OUTRA, trocar: "sim" }))).rejects.toThrow("ok=posto");
    expect(carrinho()).toBe(escreverCarrinho({ loja: OUTRA, itens: [{ produto: PRODUTO, variante: CAPA }] }));
    await expect(tirarDoCarrinho(formulario({ indice: "0" }))).rejects.toThrow("ok=tirado");
    expect(carrinho()).toBeUndefined();
    await expect(adicionarAoCarrinho(formulario({ produto: "1 or 1=1", variante: CAPA, loja: LOJA }))).rejects.toThrow("erro=item");
  });

  it("o pedido: o carrinho inteiro vai ao banco de uma vez e o carrinho esvazia; o erro do banco volta com o que foi digitado", async () => {
    cenario.cookies.set(COOKIE_DO_CARRINHO, escreverCarrinho({ loja: LOJA, itens: [{ produto: PRODUTO, variante: CAPA }, { produto: PRODUTO, variante: CAPA }] }));
    const dados = { nome: "Cliente do Site", whatsapp: "(41) 98765-0001", aceite: "sim", chave: CHAVE };
    cenario.respostas.loja_pedir = { data: null, error: { code: "OR001" } };
    expect(await pedirNoSite({ situacao: "vazio" }, formulario(dados))).toEqual({ situacao: "erro", erro: "sem_estoque", digitado: { nome: "Cliente do Site", whatsapp: "(41) 98765-0001", aceite: true } });
    expect(carrinho()).toBeDefined();
    cenario.respostas.loja_pedir = { data: PEDIDO, error: null };
    expect(await pedirNoSite({ situacao: "vazio" }, formulario(dados))).toMatchObject({ situacao: "pronto", pedido: { codigo: "PED234", unidades: 2 } });
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "loja_pedir", argumentos: {
      p_organizacao: ORGANIZACAO, p_unidade: LOJA, p_itens: [{ variante: CAPA }, { variante: CAPA }], p_nome: "Cliente do Site", p_whatsapp: "41987650001",
      p_chave: `pedido:${CHAVE}`, p_origem: { origem: "direto" },
    } });
    expect(carrinho()).toBeUndefined();
    expect(await pedirNoSite({ situacao: "vazio" }, formulario(dados))).toMatchObject({ situacao: "erro", erro: "vazio" });
  });

  it("a consulta: o código e o WhatsApp juntos; sem o par certo, não achado; dados fora do formato, sem ir ao banco", async () => {
    cenario.respostas.loja_pedido_consultar = { data: PEDIDO, error: null };
    expect(await consultarPedido({ situacao: "vazio" }, formulario({ codigo: " ped234 ", whatsapp: "41987650001" }))).toMatchObject({ situacao: "achado", pedido: { codigo: "PED234" } });
    expect(cenario.chamadas.at(-1)?.argumentos).toEqual({ p_organizacao: ORGANIZACAO, p_codigo: "PED234", p_whatsapp: "41987650001" });
    cenario.respostas.loja_pedido_consultar = { data: null, error: null };
    expect(await consultarPedido({ situacao: "vazio" }, formulario({ codigo: "PED234", whatsapp: "41987650002" }))).toEqual({ situacao: "nao_achado", codigo: "PED234" });
    const antes = cenario.chamadas.length;
    expect(await consultarPedido({ situacao: "vazio" }, formulario({ codigo: "PE", whatsapp: "41" }))).toEqual({ situacao: "dados", codigo: "PE" });
    expect(cenario.chamadas.length).toBe(antes);
  });
});

describe("a tela do carrinho", () => {
  it("vazio: o aviso e o caminho de volta; com itens: o produto, o preço do balcão, o total e o formulário do pedido", async () => {
    expect(await tela()).toContain("O carrinho está vazio");
    cenario.cookies.set(COOKIE_DO_CARRINHO, escreverCarrinho({ loja: LOJA, itens: [{ produto: PRODUTO, variante: CAPA }, { produto: PRODUTO, variante: CAPA }] }));
    cenario.respostas.loja_produto = { data: { id: PRODUTO, nome: "Capa de silicone", modelo: null, descricao: null, marca: null, categoria: "Acessórios", fotos: [],
      variantes: [{ id: CAPA, nome: "Azul", cor: null, capacidade: null, lojas: [{ id: LOJA, nome: "Santa Cândida", cidade: "Curitiba", endereco: null, preco_centavos: 7_900, disponibilidade: "disponivel" }] }] }, error: null };
    const comItens = await tela({ ok: "posto" });
    for (const trecho of ["Item no carrinho.", "Retirada em Santa Cândida", "Capa de silicone", "Azul", "R$ 79,00", "Total na loja", "R$ 158,00", "[formulário do pedido]", "Meu pedido"]) {
      expect(comItens, trecho).toContain(trecho);
    }
    expect(cenario.chamadas.filter((c) => c.nome === "loja_produto")).toHaveLength(1);
  });
});

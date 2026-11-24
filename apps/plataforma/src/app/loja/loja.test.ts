// A vitrine da loja online (lote ONLINE-a: ORA-ONLINE-001; ADR-009), com o Supabase SIMULADO (dados fictícios, sem rede).
// Quem decide o que aparece é o banco: packages/banco/src/loja-online-vitrine.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORGANIZACAO = "00000000-0000-4000-8000-000000000001";
const PRODUTO = "00000000-0000-4000-8000-0000000000a1";
const cenario = vi.hoisted(() => ({
  respostas: {} as Record<string, { data: unknown; error: null | { code: string } }>,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  assinadas: [] as string[][],
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("não encontrada"); } }));
vi.mock("../../lib/supabase/servidor", () => ({
  clienteSupabaseServidor: async () => ({
    rpc: async (nome: string, argumentos: Record<string, unknown>) => { cenario.chamadas.push({ nome, argumentos }); return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } }; },
    storage: { from: () => ({ createSignedUrls: async (caminhos: string[]) => {
      cenario.assinadas.push(caminhos);
      return { data: caminhos.map((path) => ({ path, signedUrl: `https://fotos.invalid/${path}?token=t`, error: null })), error: null };
    } }) },
  }),
}));

import { buscaDaVitrine, linksDasFotos, organizacaoDaLoja } from "../../lib/loja/vitrine";
import ProdutoDaLoja from "./[produto]/page";
import Loja from "./page";

// Os dois componentes de desenho da loja não usam estado: o teste os abre para ler o que desenham.
const abrir = (x: ReactElement<Record<string, unknown>>) =>
  typeof x.type === "function" && ["VitrineDaLoja", "DetalheDaLoja"].includes(x.type.name) ? (x.type as (p: Record<string, unknown>) => unknown)(x.props) : null;
function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Record<string, unknown>>(x)) {
      const desenho = abrir(x);
      andar(desenho ?? (typeof x.type === "string" ? x.props.children : [x.props.titulo, x.props.children]));
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
function elementos(v: unknown, criterio: (p: Record<string, unknown>) => boolean, achados: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(v)) for (const x of v) elementos(x, criterio, achados);
  else if (isValidElement<Record<string, unknown>>(v)) {
    if (criterio(v.props)) achados.push(v.props);
    const desenho = abrir(v);
    if (desenho) elementos(desenho, criterio, achados);
    for (const filho of Object.values(v.props)) elementos(filho, criterio, achados);
  }
  return achados;
}
const vitrine = async (parametros: Record<string, string> = {}) => (await Loja({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const produto = async (id = PRODUTO) => (await ProdutoDaLoja({ params: Promise.resolve({ produto: id }) })) as ReactElement;

const VITRINE = {
  categorias: [{ id: "00000000-0000-4000-8000-0000000000c1", nome: "Acessórios" }, { id: "00000000-0000-4000-8000-0000000000c2", nome: "Celulares" }],
  produtos: [
    { id: "00000000-0000-4000-8000-0000000000a2", nome: "Capa de proteção", marca: null, categoria: "Acessórios", preco_a_partir_centavos: 7_900, disponivel: true, foto: null },
    { id: PRODUTO, nome: "Galaxy A15", marca: "Samsung", categoria: "Celulares", preco_a_partir_centavos: 139_900, disponivel: false, foto: "org/a1/produto/f1.webp" },
  ],
};
const DETALHE = {
  id: PRODUTO, nome: "Galaxy A15", modelo: "SM-A155", descricao: "Tela de 6,5 polegadas.", marca: "Samsung", categoria: "Celulares",
  fotos: [{ caminho: "org/a1/produto/f1.webp", variante: null, largura: 800, altura: 800 }, { caminho: "org/a1/v1/f2.webp", variante: "v1", largura: 800, altura: 800 }],
  variantes: [{ id: "v1", nome: "Galaxy A15 128 GB Azul", cor: "Azul", capacidade: "128 GB", lojas: [
    { id: "l1", nome: "Loja B", cidade: "Curitiba", endereco: "Rua B, 2", preco_centavos: 139_900, disponibilidade: "ultimas_unidades" },
    { id: "l2", nome: "Loja C", cidade: "Curitiba", endereco: null, preco_centavos: 149_900, disponibilidade: "sem_estoque" },
  ] }],
};

beforeEach(() => {
  vi.stubEnv("LOJA_ONLINE_ORGANIZACAO", ORGANIZACAO);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.respostas = { loja_vitrine: { data: VITRINE, error: null }, loja_produto: { data: DETALHE, error: null } };
  cenario.chamadas = [];
  cenario.assinadas = [];
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("a configuração e as regras da vitrine (ONLINE-a)", () => {
  it("a organização vem da configuração (só um uuid); a busca é aparada; os links das fotos só para o que o armazenamento assinou", async () => {
    expect(organizacaoDaLoja({ LOJA_ONLINE_ORGANIZACAO: ` ${ORGANIZACAO.toUpperCase()} ` })).toBe(ORGANIZACAO);
    for (const ruim of ["", "abc", "00000000-0000-0000-0000-000000000000", undefined]) expect(organizacaoDaLoja({ LOJA_ONLINE_ORGANIZACAO: ruim }), String(ruim)).toBeNull();
    expect([buscaDaVitrine("  Galaxy   A15 "), buscaDaVitrine("   "), buscaDaVitrine(3), buscaDaVitrine("x".repeat(80))?.length]).toEqual(["Galaxy A15", null, null, 60]);
    const cliente = { storage: { from: () => ({ createSignedUrls: async (c: string[]) => ({ data: [{ path: c[0] ?? null, signedUrl: "https://ok.invalid/1", error: null }, { path: c[1] ?? null, signedUrl: null, error: "Object not found" }], error: null }) }) } };
    expect([...(await linksDasFotos(cliente, ["a.webp", "b.webp", null, "a.webp"])).entries()]).toEqual([["a.webp", "https://ok.invalid/1"]]);
    expect((await linksDasFotos(cliente, [null])).size).toBe(0);
  });
});

describe("a página da vitrine (ONLINE-a)", () => {
  it("mostra os produtos com o preço \"a partir de\", o estoque e a foto assinada; passa a busca e a categoria ao banco", async () => {
    const arvore = await vitrine({ busca: "  galaxy ", categoria: "00000000-0000-4000-8000-0000000000c2" });
    const t = texto(arvore);
    for (const trecho of ["Celulares e acessórios, com retirada na loja", "Capa de proteção", "R$ 79,00", "Galaxy A15", "R$ 1.399,00", "Disponível", "Sem estoque", "Acessórios", "Celulares"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(cenario.chamadas).toEqual([{ nome: "loja_vitrine", argumentos: { p_organizacao: ORGANIZACAO, p_busca: "galaxy", p_categoria: "00000000-0000-4000-8000-0000000000c2", p_pagina: 1 } }]);
    expect(cenario.assinadas).toEqual([["org/a1/produto/f1.webp"]]);
    expect(elementos(arvore, (p) => typeof p.src === "string").map((p) => p.src)).toEqual(["https://fotos.invalid/org/a1/produto/f1.webp?token=t"]);
    expect(elementos(arvore, (p) => p.href === `/loja/${PRODUTO}`)).toHaveLength(1);
  });

  it("categoria que não é uuid é ignorada; sem configuração, desligada; vazia, \"em breve\"; com busca sem resultado, \"nada encontrado\"; falha, fora do ar", async () => {
    await vitrine({ categoria: "'; drop table x" });
    expect(cenario.chamadas[0]?.argumentos).toEqual({ p_organizacao: ORGANIZACAO, p_busca: undefined, p_categoria: undefined, p_pagina: 1 });
    vi.stubEnv("LOJA_ONLINE_ORGANIZACAO", "");
    cenario.chamadas = [];
    expect(texto(await vitrine())).toContain("A loja online ainda não está no ar");
    expect(cenario.chamadas).toEqual([]);
    vi.stubEnv("LOJA_ONLINE_ORGANIZACAO", ORGANIZACAO);
    cenario.respostas.loja_vitrine = { data: { categorias: [], produtos: [] }, error: null };
    expect(texto(await vitrine())).toContain("Em breve");
    expect(texto(await vitrine({ busca: "iphone" }))).toContain("Nenhum produto com \"iphone\"");
    cenario.respostas.loja_vitrine = { data: null, error: { code: "PGRST202" } };
    expect(texto(await vitrine())).toContain("A loja online está fora do ar agora");
  });
});

describe("a vitrine de 60 em 60 (ONLINE-f)", () => {
  it("passa a página ao banco; mostra quantos são e o caminho para as outras páginas, guardando a busca e a categoria", async () => {
    cenario.respostas.loja_vitrine = { data: { ...VITRINE, total: 130, pagina: 2, paginas: 3 }, error: null };
    const arvore = await vitrine({ busca: "capa", categoria: "00000000-0000-4000-8000-0000000000c1", pagina: "2" });
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_busca: "capa", p_pagina: 2 });
    const t = texto(arvore);
    for (const trecho of ["Mostrando 61–62 de 130 produtos", "Página 2 de 3", "Anteriores", "Próximos"]) expect(t, trecho).toContain(trecho);
    const paginas = elementos(arvore, (p) => p.rel === "prev" || p.rel === "next").map((p) => [p.rel, p.href]);
    expect(paginas).toEqual([
      ["prev", "/loja?busca=capa&categoria=00000000-0000-4000-8000-0000000000c1"],
      ["next", "/loja?busca=capa&categoria=00000000-0000-4000-8000-0000000000c1&pagina=3"],
    ]);
    // As categorias e a busca recomeçam da primeira página.
    expect(elementos(arvore, (p) => p.href === "/loja?busca=capa&categoria=00000000-0000-4000-8000-0000000000c2")).toHaveLength(1);
  });

  it("página estranha vale a primeira; na última, sem \"Próximos\"; uma página só (ou o banco de antes, sem as chaves), sem o caminho", async () => {
    for (const pagina of ["abc", "0", "-1", "99999", "1.5"]) {
      cenario.chamadas = [];
      await vitrine({ pagina });
      expect(cenario.chamadas[0]?.argumentos.p_pagina, pagina).toBe(1);
    }
    cenario.respostas.loja_vitrine = { data: { ...VITRINE, total: 130, pagina: 3, paginas: 3 }, error: null };
    const ultima = await vitrine({ pagina: "3" });
    expect(elementos(ultima, (p) => p.rel === "prev" || p.rel === "next").map((p) => [p.rel, p.href])).toEqual([["prev", "/loja?pagina=2"]]);
    cenario.respostas.loja_vitrine = { data: VITRINE, error: null };
    const t = texto(await vitrine());
    expect(t).toContain("2 produtos");
    expect(t).not.toContain("Página");
  });
});

describe("a página do produto (ONLINE-a)", () => {
  it("mostra as fotos, a descrição e cada loja com o preço do balcão e o estoque; fora do site, não encontrada", async () => {
    const arvore = await produto();
    const t = texto(arvore);
    for (const trecho of ["Galaxy A15", "Samsung · Celulares", "Modelo SM-A155", "Tela de 6,5 polegadas.", "Galaxy A15 128 GB Azul", "Azul · 128 GB", "Loja B", "Rua B, 2 · Curitiba", "Últimas unidades", "R$ 1.399,00", "Loja C", "Sem estoque agora", "R$ 1.499,00", "Como comprar"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(elementos(arvore, (p) => typeof p.src === "string").map((p) => p.src)).toEqual(["https://fotos.invalid/org/a1/produto/f1.webp?token=t", "https://fotos.invalid/org/a1/v1/f2.webp?token=t"]);
    // Fora do site, o banco devolve vazio, SEM erro (ONLINE-c): "não encontrada". O P0002 de antes dá no mesmo.
    cenario.respostas.loja_produto = { data: null, error: null };
    await expect(produto()).rejects.toThrow("não encontrada");
    cenario.respostas.loja_produto = { data: null, error: { code: "P0002" } };
    await expect(produto()).rejects.toThrow("não encontrada");
    await expect(produto("não-é-uuid")).rejects.toThrow("não encontrada");
    cenario.respostas.loja_produto = { data: null, error: { code: "57014" } };
    expect(texto(await produto())).toContain("A loja online está fora do ar agora");
  });

  it("ONLINE-e: um caminho só para comprar, o carrinho, só nas lojas com estoque, sem o link de reservar um item; sem foto, um espaço baixo", async () => {
    const arvore = await produto();
    const t = texto(arvore);
    expect(t).toContain("Escolha a loja e toque em \"Pôr no carrinho\". No carrinho, você reserva tudo de uma vez por 24 horas (até 3 unidades da mesma loja) e paga e retira na loja.");
    expect(t).not.toMatch(/Reservar/);
    expect(elementos(arvore, (p) => typeof p.href === "string" && p.href.includes("/reservar"))).toEqual([]);
    // O botão do carrinho: na Loja B (últimas unidades), não na Loja C (sem estoque).
    expect(elementos(arvore, (p) => typeof p.action === "function")).toHaveLength(1);
    expect(elementos(arvore, (p) => p.name === "loja").map((p) => p.value)).toEqual(["l1"]);
    expect(t).toContain("Pôr no carrinho");
    expect(t).not.toContain("Sem foto por enquanto");
    cenario.respostas.loja_produto = { data: { ...DETALHE, fotos: [] }, error: null };
    const semFoto = await produto();
    expect(texto(semFoto)).toContain("Sem foto por enquanto");
    expect(elementos(semFoto, (p) => typeof p.src === "string")).toEqual([]);
  });
});

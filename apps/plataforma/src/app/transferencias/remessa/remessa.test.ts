// A tela de montar a remessa (lote TRF-a; ORA-INV-007, #60) com a sessão e o Supabase SIMULADOS: nenhuma credencial,
// dados fictícios. As lojas vêm de transferencia_lojas; as linhas e a busca viajam no endereço; "Adicionar" e a lixeira
// são links que mudam só as linhas; pedir exige a loja da pessoa numa das pontas.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000aa";
const OUTRA = "00000000-0000-4000-8000-0000000000bb";
const TERCEIRA = "00000000-0000-4000-8000-0000000000cc";
const CABO = "11111111-1111-4111-8111-111111111111";
const CAPA = "22222222-2222-4222-8222-222222222222";
const RECARGA = "33333333-3333-4333-8333-333333333333";
const cenario = vi.hoisted(() => ({ achados: [] as string[] }));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
vi.mock("../../../componentes/MoldeReal", () => ({ MoldeReal: ({ children }: { children: ReactNode }) => children }));
vi.mock("../acoes", () => ({ solicitarRemessa: async () => undefined }));
vi.mock("../../../lib/catalogo/busca", async () => ({
  ...(await vi.importActual<typeof import("../../../lib/catalogo/termos")>("../../../lib/catalogo/termos")),
  buscarNoCatalogo: async () => ({ produtos: [], variantes: cenario.achados, cortada: false }),
}));
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)" },
    molde: { permissoes: new Set(["estoque.consultar"]), nome: "Ana (fictícia)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
    supabase: {
      rpc: async () => ({ data: [{ id: LOJA, nome: "Santa Cândida (teste)", tipo: "loja_fisica" }, { id: OUTRA, nome: "Loja de teste 2", tipo: "loja_fisica" }, { id: TERCEIRA, nome: "Colombo", tipo: "loja_fisica" }], error: null }),
      from: () => ({
        select: () => ({
          in: async (_coluna: string, lista: string[]) => ({
            data: [
              { id: CABO, nome: "1 m", sku: "ACE-0004", produtos: { nome: "Cabo USB-C", tipo: "acessorio" } },
              { id: CAPA, nome: "Preta", sku: "ACE-0001", produtos: { nome: "Capa de proteção", tipo: "acessorio" } },
              { id: RECARGA, nome: "R$ 20", sku: "REC-0001", produtos: { nome: "Recarga", tipo: "recarga" } },
            ].filter((v) => lista.includes(v.id)),
            error: null,
          }),
        }),
      }),
    },
  }),
}));

import NovaRemessa from "./page";

// Achata a árvore: os textos e os links (com o destino), chamando os componentes de função da própria tela.
function percorrer(v: unknown, textos: string[], links: { href: string; texto: string }[]) {
  if (Array.isArray(v)) { for (const x of v) percorrer(x, textos, links); return; }
  if (typeof v === "string" || typeof v === "number") { textos.push(String(v)); return; }
  if (!isValidElement<Record<string, unknown>>(v)) return;
  const p = v.props;
  if (typeof v.type === "function" && v.type.name === "MoldeReal") { percorrer((v.type as (x: unknown) => unknown)(p), textos, links); return; }
  if (typeof p.href === "string") {
    const dentro: string[] = [];
    percorrer(p.children, dentro, []);
    links.push({ href: p.href, texto: [dentro.join(" "), typeof p["aria-label"] === "string" ? p["aria-label"] : ""].join(" ").trim() });
  }
  for (const chave of ["titulo", "subtitulo", "children"]) percorrer(p[chave], textos, links);
}
async function tela(parametros: Record<string, string>) {
  const textos: string[] = [];
  const links: { href: string; texto: string }[] = [];
  percorrer(await NovaRemessa({ searchParams: Promise.resolve(parametros) }) as ReactElement, textos, links);
  // Os pedaços do JSX vêm separados: junta sem o espaço que a junção põe dentro dos parênteses.
  return { texto: textos.join(" ").replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")"), links };
}

beforeEach(() => { cenario.achados = []; });

describe("montar a remessa (TRF-a)", () => {
  it("sem nada escolhido: as três etapas, as lojas da rede e a remessa vazia; a loja da pessoa é o destino", async () => {
    const { texto } = await tela({});
    for (const trecho of ["1. De onde vem e para onde vai", "2. Os produtos", "3. Conferir e pedir", "Loja de teste 2", "Colombo", "Nenhum produto na remessa ainda."]) {
      expect(texto, trecho).toContain(trecho);
    }
  });

  it("a busca mostra só o que se transfere; o que já está na remessa não volta a ser adicionado", async () => {
    cenario.achados = [CABO, CAPA, RECARGA];
    const { texto, links } = await tela({ origem: OUTRA, destino: LOJA, linhas: `${CABO}:2`, busca: "ca" });
    expect(texto).toContain("Capa de proteção Preta");
    expect(texto).not.toContain("Recarga");
    expect(texto).toContain("na remessa");
    const adicionar = links.find((l) => l.texto === "Adicionar");
    expect(adicionar?.href).toContain(`linhas=${encodeURIComponent(`${CABO}:2,${CAPA}:1`)}`);
    expect(adicionar?.href).toContain(`origem=${OUTRA}`);
  });

  it("as linhas aparecem para conferir, com a lixeira que tira só a linha; pedir fica liberado com a loja numa das pontas", async () => {
    const { texto, links } = await tela({ origem: OUTRA, destino: LOJA, linhas: `${CABO}:2,${CAPA}:1` });
    expect(texto).toContain("Loja de teste 2 → Santa Cândida (teste)");
    expect(texto).toContain("Pedir a remessa (2 produtos)");
    // TRF-c (D-049): a tela avisa que pedir já reserva na origem, tudo ou nada.
    expect(texto).toContain("Ao pedir, cada produto já sai do disponível da origem (fica reservado). Se faltar o livre de um deles, nada da remessa é pedido.");
    expect(texto).not.toContain("Para pedir, escolha a origem e o destino");
    const tirarCabo = links.find((l) => l.texto.includes("Tirar Cabo USB-C"));
    expect(tirarCabo?.href).toContain(`linhas=${encodeURIComponent(`${CAPA}:1`)}`);
  });

  it("avisa quando a origem é o destino e quando a loja da pessoa não está em nenhuma das pontas", async () => {
    expect((await tela({ origem: LOJA, destino: LOJA, linhas: `${CABO}:1` })).texto).toContain("A origem e o destino são a mesma loja");
    const fora = await tela({ origem: OUTRA, destino: TERCEIRA, linhas: `${CABO}:1` });
    expect(fora.texto).toContain("A sua loja (Santa Cândida (teste)) precisa ser a origem ou o destino.");
    expect(fora.texto).toContain("Para pedir, escolha a origem e o destino");
  });
});

// A tela de reservar e a ação da reserva do site (lote ONLINE-b: ORA-ONLINE-006), com o Supabase SIMULADO (dados
// fictícios). Quem decide é o banco: packages/banco/src/loja-online-reserva.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORGANIZACAO = "00000000-0000-4000-8000-000000000001";
const PRODUTO = "00000000-0000-4000-8000-0000000000a1";
const VARIANTE = "00000000-0000-4000-8000-0000000000b1";
const LOJA = "00000000-0000-4000-8000-0000000000c1";
const SEM_ESTOQUE = "00000000-0000-4000-8000-0000000000c2";
const CHAVE = "00000000-0000-4000-8000-0000000000d1";
const cenario = vi.hoisted(() => ({
  respostas: {} as Record<string, { data: unknown; error: null | { code: string } }>,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  ip: "200.1.1.1",
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("não encontrada"); } }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (n: string) => (n === "x-forwarded-for" ? cenario.ip : null) }) }));
vi.mock("../../../../lib/supabase/servidor", () => ({
  clienteSupabaseServidor: async () => ({
    rpc: async (nome: string, argumentos: Record<string, unknown>) => { cenario.chamadas.push({ nome, argumentos }); return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } }; },
  }),
}));

import { reservarNoSite } from "./acoes";
import { ReservaConfirmada } from "./FormularioDaReserva";
import Reservar from "./page";

// Os componentes de desenho sem estado (a tela e o voltar) são abertos aqui; os de formulário ficam fechados.
const ABRIR = new Set(["TelaDeReservar", "VoltarAoProduto"]);
const aberto = (x: unknown): unknown =>
  isValidElement<Record<string, unknown>>(x) && typeof x.type === "function" && ABRIR.has(x.type.name) ? aberto((x.type as (p: Record<string, unknown>) => unknown)(x.props)) : x;
function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (y: unknown): void => {
    const x = aberto(y);
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Record<string, unknown>>(x)) andar(typeof x.type === "string" ? x.props.children : [x.props.titulo, x.props.children]);
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
function elementos(y: unknown, criterio: (p: Record<string, unknown>) => boolean, achados: Record<string, unknown>[] = []): Record<string, unknown>[] {
  const v = aberto(y);
  if (Array.isArray(v)) for (const x of v) elementos(x, criterio, achados);
  else if (isValidElement<Record<string, unknown>>(v)) {
    if (criterio(v.props)) achados.push(v.props);
    for (const filho of Object.values(v.props)) elementos(filho, criterio, achados);
  }
  return achados;
}
const tela = async (parametros: Record<string, string>) =>
  (await Reservar({ params: Promise.resolve({ produto: PRODUTO }), searchParams: Promise.resolve(parametros) })) as ReactElement;
const formulario = (campos: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; };
const BOM = { variante: VARIANTE, loja: LOJA, chave: CHAVE, nome: "  Maria   Cliente ", whatsapp: "(41) 98765-0001", aceite: "sim" };
const reservar = (campos: Record<string, string> = BOM) => reservarNoSite({ situacao: "vazio" }, formulario(campos));

const DETALHE = {
  id: PRODUTO, nome: "Galaxy A15", modelo: null, descricao: null, marca: "Samsung", categoria: "Celulares", fotos: [],
  variantes: [{ id: VARIANTE, nome: "Galaxy A15 128 GB Azul", cor: "Azul", capacidade: "128 GB", lojas: [
    { id: LOJA, nome: "Loja Santa Cândida", cidade: "Curitiba", endereco: "Rua Fictícia, 1", preco_centavos: 139_900, disponibilidade: "ultimas_unidades" },
    { id: SEM_ESTOQUE, nome: "Loja Centro", cidade: "Curitiba", endereco: null, preco_centavos: 149_900, disponibilidade: "sem_estoque" },
  ] }],
};
const CONFIRMACAO = { codigo: "K7M3QP", expira_em: "2026-11-16T15:00:00Z", preco_centavos: 139_900, produto: "Galaxy A15", variacao: "Galaxy A15 128 GB Azul", loja: { nome: "Loja Santa Cândida", endereco: "Rua Fictícia, 1", cidade: "Curitiba" } };

beforeEach(() => {
  vi.stubEnv("LOJA_ONLINE_ORGANIZACAO", ORGANIZACAO);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.respostas = { loja_produto: { data: DETALHE, error: null }, loja_reservar: { data: CONFIRMACAO, error: null } };
  cenario.chamadas = [];
  cenario.ip = `200.1.1.${Math.floor(Math.random() * 250) + 1}`;
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("a tela de reservar (ONLINE-b)", () => {
  it("confirma o produto, a loja e o preço e mostra o formulário com uma chave; loja sem estoque ou endereço errado, não", async () => {
    const arvore = await tela({ variante: VARIANTE, loja: LOJA });
    const t = texto(arvore);
    for (const trecho of ["Reservar e retirar na loja", "Galaxy A15 128 GB Azul", "Loja Santa Cândida", "Rua Fictícia, 1 · Curitiba", "R$ 1.399,00"]) expect(t, trecho).toContain(trecho);
    const formularios = elementos(arvore, (p) => typeof p.variante === "string" && typeof p.chave === "string");
    expect(formularios).toHaveLength(1);
    expect(formularios[0]).toMatchObject({ variante: VARIANTE, loja: LOJA });
    expect(String(formularios[0]?.chave)).toMatch(/^[0-9a-f-]{36}$/);
    expect(texto(await tela({ variante: VARIANTE, loja: SEM_ESTOQUE }))).toContain("Esta loja não tem este produto agora");
    expect(elementos(await tela({ variante: VARIANTE, loja: SEM_ESTOQUE }), (p) => typeof p.chave === "string")).toEqual([]);
    await expect(tela({ variante: "x", loja: LOJA })).rejects.toThrow("não encontrada");
    // Produto fora do site: o banco devolve vazio, SEM erro (ONLINE-c); o P0002 de antes dá no mesmo. Outro erro não é "não encontrada".
    cenario.respostas.loja_produto = { data: null, error: null };
    await expect(tela({ variante: VARIANTE, loja: LOJA })).rejects.toThrow("não encontrada");
    cenario.respostas.loja_produto = { data: null, error: { code: "P0002" } };
    await expect(tela({ variante: VARIANTE, loja: LOJA })).rejects.toThrow("não encontrada");
    cenario.respostas.loja_produto = { data: null, error: { code: "57014" } };
    expect(texto(await tela({ variante: VARIANTE, loja: LOJA }))).toContain("A loja online está fora do ar agora");
  });
});

describe("a reserva feita (ONLINE-b)", () => {
  it("mostra o código para o balcão, o produto, o preço, a loja e até quando vale, no horário de Brasília", () => {
    const t = texto(ReservaConfirmada({ reserva: CONFIRMACAO })).replace(/\s/g, " ");
    for (const trecho of ["Reserva feita", "Mostre este código no balcão", "K7M3QP", "Galaxy A15 128 GB Azul", "R$ 1.399,00", "Loja Santa Cândida", "Rua Fictícia, 1 · Curitiba", "16/11", "12:00",
      "O pagamento é feito na loja, na retirada."]) expect(t, trecho).toContain(trecho);
  });
});

describe("a ação da reserva (ONLINE-b)", () => {
  it("manda ao banco os dados limpos e a chave do site; devolve a confirmação", async () => {
    expect(await reservar()).toEqual({ situacao: "pronta", reserva: CONFIRMACAO });
    expect(cenario.chamadas).toEqual([{ nome: "loja_reservar", argumentos: {
      p_organizacao: ORGANIZACAO, p_variante: VARIANTE, p_unidade: LOJA, p_nome: "Maria Cliente", p_whatsapp: "41987650001", p_chave: `site:${CHAVE}`,
    } }]);
  });

  it("o formulário e o aceite são conferidos antes do banco; cada recusa vira a mensagem; o 6º pedido do mesmo endereço na hora para", async () => {
    // O que a pessoa digitou volta com o erro (o formulário não esvazia); nada além do que ela mesma mandou.
    expect(await reservar({ ...BOM, whatsapp: "4133334444" })).toEqual({ situacao: "erro", erro: "dados", digitado: { nome: "  Maria   Cliente ", whatsapp: "4133334444", aceite: true } });
    expect(await reservar({ ...BOM, nome: "A" })).toMatchObject({ situacao: "erro", erro: "dados" });
    expect(await reservar({ ...BOM, aceite: "" })).toEqual({ situacao: "erro", erro: "aceite", digitado: { nome: "  Maria   Cliente ", whatsapp: "(41) 98765-0001", aceite: false } });
    expect(await reservar({ ...BOM, loja: "x", nome: "y".repeat(300) })).toEqual({ situacao: "erro", erro: "falha", digitado: { nome: "y".repeat(80), whatsapp: "(41) 98765-0001", aceite: true } });
    expect(cenario.chamadas).toEqual([]);
    for (const [code, erro] of [["OR034", "limite_whatsapp"], ["OR001", "sem_estoque"], ["OR035", "limite_loja"]] as const) {
      cenario.respostas.loja_reservar = { data: null, error: { code } };
      expect(await reservar(), code).toMatchObject({ situacao: "erro", erro });
    }
    // Já são 3 pedidos deste endereço nesta hora; o 4º e o 5º passam, o 6º para no limite (sem ir ao banco).
    cenario.respostas.loja_reservar = { data: CONFIRMACAO, error: null };
    await reservar();
    await reservar();
    const antes = cenario.chamadas.length;
    expect(await reservar()).toMatchObject({ situacao: "erro", erro: "limite_rede" });
    expect(cenario.chamadas.length).toBe(antes);
    vi.stubEnv("LOJA_ONLINE_ORGANIZACAO", "");
    cenario.ip = "200.9.9.9";
    expect(await reservar()).toMatchObject({ situacao: "erro", erro: "falha" });
  });
});

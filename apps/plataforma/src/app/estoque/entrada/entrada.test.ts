// Entrada de mercadoria (L4a) com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede.
// Confere permissão, a lista de entradas, o que as ações mandam ao banco e a busca de itens. As regras do
// banco estão provadas em packages/banco/src/entrada-estoque.test.ts.
import { completarComDigitoVerificador } from "@ora5g/dominio";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const ORG = "00000000-0000-4000-8000-0000000000ff";
const GERENTE = "00000000-0000-4000-8000-0000000000ab";
const FORN = "00000000-0000-4000-9000-000000000060";
const ENTRADA = "00000000-0000-4000-9000-000000000070";
const APARELHO = "00000000-0000-4000-9000-000000000030";
const CAPA = "00000000-0000-4000-9000-000000000031";
const IMEI = completarComDigitoVerificador("35209900180009");

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
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Record<string, unknown>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  usuario: { id: GERENTE },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-11T23:00:00Z" },
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: null };
    },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { buscarItensParaEntrada, estornarEntrada, registrarEntrada, salvarFornecedor } from "./acoes";
import EntradaDeMercadoria from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async () => texto(await EntradaDeMercadoria({ searchParams: Promise.resolve({}) }) as ReactElement).replace(/\s+/g, " ");
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
    fornecedores: [{ id: FORN, nome: "Distribuidora Teste", ativo: true }],
    entradas_estoque: [{
      id: ENTRADA, numero: 12, tipo: "compra", documento: "NF 1234", situacao: "registrada", total_unidades: 21, total_custo_centavos: "139000",
      criado_em: "2026-11-11T13:00:00Z", motivo_estorno: null, unidade_id: LOJA, fornecedores: { nome: "Distribuidora Teste" },
      entrada_itens: [{ linha: 2, quantidade: 20, custo_unitario_centavos: 1700, condicao: "novo", variantes: { sku: "ACE-0001", nome: "Capa" } },
        { linha: 1, quantidade: 1, custo_unitario_centavos: 105000, condicao: "seminovo", variantes: { sku: "APA-0001", nome: "Galaxy" } }],
    }],
    variantes: [{ id: APARELHO, sku: "APA-0001", nome: "Galaxy A15", produtos: { tipo: "aparelho" } }, { id: CAPA, sku: "ACE-0001", nome: "Capa", produtos: { tipo: "acessorio" } }],
    produtos: [{ id: "p1" }],
  };
});

describe("/estoque/entrada", () => {
  it("sem estoque.receber (vendedor): aviso e nada mais", async () => {
    cenario.permissoes = new Set(["estoque.consultar"]);
    expect(await tela()).toContain("Receber mercadoria é da gerência da loja");
  });

  it("gerente: formulário, fornecedores e as últimas entradas com o que entrou", async () => {
    cenario.permissoes = new Set(["estoque.receber"]);
    const t = await tela();
    for (const trecho of ["Entrada nº 12", "Compra de fornecedor", "Distribuidora Teste", "NF 1234", "21 unidade(s)", "R$ 1.390,00", "APA-0001 × 1 (Seminovo), ACE-0001 × 20", "Estornar esta entrada", "Cadastrar fornecedor"]) {
      expect(t).toContain(trecho);
    }
  });
});

describe("ações da entrada", () => {
  it("registrar: linhas do formulário viram o JSON do banco (IMEI só dígitos, custo em centavos)", async () => {
    cenario.respostas.estoque_registrar_entrada = { data: { id: ENTRADA, repetida: false }, error: null };
    const itens = JSON.stringify([
      { variante: APARELHO, tipo: "aparelho", identificadores: `${IMEI.slice(0, 5)} ${IMEI.slice(5)}`.replace(" ", "-"), custo: "1.050,00", condicao: "seminovo" },
      { variante: CAPA, tipo: "acessorio", quantidade: "20", custo: "17,00" },
    ]);
    const destino = await destinoDe(registrarEntrada(formulario({ unidade: LOJA, tipo: "compra", fornecedor: FORN, documento: "NF 1234", chave: "form:abc12345", motivo: "Pedido da semana", itens })));
    expect(destino).toBe(`/estoque/entrada?ok=registrada&entrada=${ENTRADA}`);
    expect(cenario.chamadas[0]?.argumentos).toEqual({
      p_unidade: LOJA, p_tipo: "compra", p_fornecedor: FORN, p_documento: "NF 1234", p_chave: "form:abc12345", p_motivo: "Pedido da semana",
      p_itens: [{ variante: APARELHO, identificadores: [IMEI], condicao: "seminovo", custo: 105_000 }, { variante: CAPA, quantidade: 20, condicao: "novo", custo: 1_700 }],
    });
  });

  it("erros do formulário não chamam o banco; erros do banco voltam pelo catálogo", async () => {
    expect(await destinoDe(registrarEntrada(formulario({ unidade: LOJA, tipo: "carga_inicial", chave: "form:abc12345", motivo: "Contagem", itens: JSON.stringify([{ variante: APARELHO, tipo: "aparelho", identificadores: "123" }]) }))))
      .toBe("/estoque/entrada?erro=identificador");
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.estoque_estornar_entrada = { data: null, error: { code: "OR002", message: "O IMEI/ICCID ... não está livre" } };
    expect(await destinoDe(estornarEntrada(formulario({ entrada: ENTRADA, motivo: "Loja errada" })))).toBe(`/estoque/entrada?erro=em_uso&entrada=${ENTRADA}`);
  });

  it("fornecedor novo vai para a rede da loja do turno; a busca devolve só itens com estoque", async () => {
    cenario.respostas.fornecedor_salvar = { data: { id: FORN, repetida: false }, error: null };
    expect(await destinoDe(salvarFornecedor(formulario({ nome: "Atacado Teste", cnpj: "", contato: "", motivo: "Fornecedor novo" })))).toBe("/estoque/entrada?ok=fornecedor");
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_organizacao: ORG, p_id: null, p_nome: "Atacado Teste", p_cnpj: null });
    cenario.tabelas.variantes = [...(cenario.tabelas.variantes ?? []), { id: "rec", sku: "REC-1", nome: "Recarga", produtos: { tipo: "recarga" } }];
    const achados = await buscarItensParaEntrada("galaxy");
    expect(achados.map((a) => a.tipo).sort()).toEqual(["acessorio", "aparelho"]);
    expect(await buscarItensParaEntrada("g")).toEqual([]);
  });
});

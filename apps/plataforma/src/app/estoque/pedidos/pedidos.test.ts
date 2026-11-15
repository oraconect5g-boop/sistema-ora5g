// /estoque/pedidos (lote INV-009a) com a sessão e o Supabase SIMULADOS: quem vê a tela, a lista com o filtro, o pedido
// com a conferência (com e sem custo), o formulário do pedido novo e o que as ações mandam ao banco. As regras do banco
// estão em packages/banco/src/pedido-de-compra.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const FORN = "00000000-0000-4000-9000-000000000060";
const CAPA = "00000000-0000-4000-9000-000000000031";
const PEDIDO = "00000000-0000-4000-9000-0000000000a7";
const ENTRADA = "00000000-0000-4000-9000-000000000070";
const PELICULA = "00000000-0000-4000-9000-000000000032";

type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  respostas: {} as Record<string, Resposta>,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  fornecedores: [] as Record<string, unknown>[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const consulta = { select: () => consulta, eq: () => consulta, order: () => Promise.resolve({ data: cenario.fornecedores, error: null }) };
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-15T23:00:00Z" },
    supabase: {
      from: () => consulta,
      rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
        if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
        cenario.chamadas.push({ nome, argumentos });
        return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
      },
    },
  }),
}));

import { criarPedido, encerrarPedido } from "./acoes";
import PedidosDeCompra from "./page";

const EXECUTAR = new Set(["ListaDePedidos", "DetalheDoPedido"]);
function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && EXECUTAR.has(v.type.name)) return texto((v.type as (p: unknown) => unknown)(v.props));
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
function elementos(v: unknown): ReactElement<Record<string, unknown>>[] {
  const achados: ReactElement<Record<string, unknown>>[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (isValidElement<Record<string, unknown>>(x)) {
      achados.push(x);
      if (typeof x.type === "function" && EXECUTAR.has(x.type.name)) andar((x.type as (p: unknown) => unknown)(x.props));
      else andar(Object.values(x.props));
    }
  };
  andar(v);
  return achados;
}
const pagina = async (parametros: Record<string, string> = {}) => (await PedidosDeCompra({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const tela = async (parametros: Record<string, string> = {}) => texto(await pagina(parametros)).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};
const cabecalho = (extra: Record<string, unknown> = {}) => ({
  id: PEDIDO, numero: 7, unidade_id: LOJA, fornecedor_id: FORN, fornecedor: "Distribuidora Teste", documento: "COT-77", previsto_para: "2026-11-20",
  situacao: "aberto", criado_em: "2026-11-15T12:00:00Z", encerrado_em: null, motivo_encerramento: null, ...extra,
});
const daLista = (extra: Record<string, unknown> = {}) => ({ ...cabecalho(), unidades: 12, recebidas: 6, entradas: 1, total_previsto: "21600", ...extra });
const doPedido = (extra: Record<string, unknown> = {}) => ({
  ...cabecalho(), observacao: "Pela manhã", ve_custo: true,
  itens: [
    { linha: 1, variante_id: CAPA, sku: "ACE-0001", nome: "Capa azul", produto: "Capa", quantidade: 10, recebida: 6, custo_combinado: 1_800, custo_da_nota: 1_900 },
    { linha: 2, variante_id: "00000000-0000-4000-9000-000000000030", sku: "APA-0001", nome: "Galaxy", produto: "Galaxy", quantidade: 2, recebida: 3, custo_combinado: 100_000, custo_da_nota: 100_000 },
  ],
  fora_do_pedido: [{ variante_id: PELICULA, sku: "ACE-0050", nome: "Película", recebida: 2, custo_da_nota: 400 }],
  entradas: [{ id: ENTRADA, numero: 12, documento: "NF 900", situacao: "registrada", criado_em: "2026-11-15T13:00:00Z", unidades: 11 },
    { id: "00000000-0000-4000-9000-000000000071", numero: 13, documento: null, situacao: "estornada", criado_em: "2026-11-15T14:00:00Z", unidades: 5 }],
  ...extra,
});

beforeEach(() => {
  cenario.permissoes = new Set(["estoque.receber"]);
  cenario.respostas = { pedidos_compra: { data: [daLista()], error: null } };
  cenario.chamadas = [];
  cenario.fornecedores = [{ id: FORN, nome: "Distribuidora Teste" }];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("/estoque/pedidos (INV-009a)", () => {
  it("quem não recebe mercadoria na loja vê o aviso, sem ler os pedidos; banco sem os pedidos: ainda não disponível", async () => {
    cenario.permissoes = new Set(["estoque.consultar"]);
    expect(await tela()).toContain("Os pedidos de compra são de quem recebe mercadoria na loja");
    expect(cenario.chamadas).toEqual([]);
    cenario.permissoes = new Set(["estoque.receber"]);
    cenario.respostas = {};
    expect(await tela()).toContain("Os pedidos de compra ainda não estão disponíveis neste ambiente.");
  });

  it("a lista dos abertos com o recebido e o combinado; cada filtro pede a sua situação", async () => {
    const t = await tela();
    expect(cenario.chamadas[0]).toEqual({ nome: "pedidos_compra", argumentos: { p_unidade: LOJA, p_situacao: "aberto" } });
    for (const trecho of [`/estoque/pedidos?pedido=${PEDIDO}`, "Pedido nº 7", "Distribuidora Teste · COT-77 · feito em 15/11/2026 · previsto para 20/11/2026", "6 de 12 recebidas", "1 entrada · combinado R$ 216,00"]) {
      expect(t).toContain(trecho);
    }
    for (const [ver, situacao] of [["encerrado", "encerrado"], ["cancelado", "cancelado"]] as const) {
      cenario.chamadas = [];
      await tela({ ver });
      expect(cenario.chamadas[0]?.argumentos).toEqual({ p_unidade: LOJA, p_situacao: situacao });
    }
    cenario.chamadas = [];
    await tela({ ver: "todos" });
    expect(cenario.chamadas[0]?.argumentos).toEqual({ p_unidade: LOJA });
    cenario.respostas.pedidos_compra = { data: [], error: null };
    expect(await tela()).toContain("Nenhum pedido aqui");
    cenario.respostas.pedidos_compra = { data: null, error: { code: "57014" } };
    expect(await tela()).toContain("Não deu para ler os pedidos agora.");
  });

  it("o pedido com a conferência: a falta, o que veio a mais e fora do pedido, o custo da nota diferente; a estornada não conta; encerrar", async () => {
    cenario.respostas.pedido_compra = { data: doPedido(), error: null };
    const t = await tela({ pedido: PEDIDO });
    for (const trecho of [
      "faltam 4 · 3 a mais ou fora do pedido · 1 item com custo diferente do combinado", "falta 4", "1 a mais", "fora do pedido", "Observação: Pela manhã",
      "R$ 18,00", "R$ 19,00", "R$ 4,00", `/estoque/entrada?entrada=${ENTRADA}#entrada`, "NF 900 · 15/11/2026 · 11 un.", "estornada, não conta", "Encerrar o pedido",
    ]) expect(t).toContain(trecho);
    const encerrar = elementos(await pagina({ pedido: PEDIDO })).find((e) => e.type === "form" && typeof e.props.action === "function");
    expect((encerrar?.props.action as { name: string }).name).toBe("encerrarPedido");
    // INV-009b: o aberto com falta leva à entrada já preenchida com o que falta.
    expect(t).toContain(`/estoque/entrada?pedido=${PEDIDO}#nova`);
    expect(t).toContain("Receber este pedido");
    // sem custo.ver: nenhuma coluna de custo (o banco também não manda o total combinado na lista)
    cenario.respostas.pedidos_compra = { data: [daLista({ total_previsto: null })], error: null };
    cenario.respostas.pedido_compra = { data: doPedido({ ve_custo: false, itens: doPedido().itens.map((i) => ({ ...i, custo_combinado: null, custo_da_nota: null })), fora_do_pedido: [{ variante_id: PELICULA, sku: "ACE-0050", nome: "Película", recebida: 2, custo_da_nota: null }] }), error: null };
    const semCusto = await tela({ pedido: PEDIDO });
    for (const ausente of ["Combinado", "Na nota", "R$", "custo diferente"]) expect(semCusto).not.toContain(ausente);
    // nada recebido: cancelar; encerrado: sem formulário
    cenario.respostas.pedido_compra = { data: doPedido({ entradas: [], itens: [{ ...doPedido().itens[0], recebida: 0 }], fora_do_pedido: [] }), error: null };
    expect(await tela({ pedido: PEDIDO })).toContain("Cancelar o pedido");
    cenario.respostas.pedido_compra = { data: doPedido({ situacao: "encerrado", encerrado_em: "2026-11-16T12:00:00Z", motivo_encerramento: "Faltou o aparelho" }), error: null };
    const encerrado = await tela({ pedido: PEDIDO });
    expect(encerrado).toContain("Encerrado em 16/11/2026: Faltou o aparelho");
    expect(encerrado).not.toContain("Encerrar o pedido");
    expect(encerrado).not.toContain("Receber este pedido");
    // Aberto e sem nada faltando (tudo recebido): nada a receber.
    cenario.respostas.pedido_compra = { data: doPedido({ itens: doPedido().itens.map((i) => ({ ...i, recebida: i.quantidade })) }), error: null };
    expect(await tela({ pedido: PEDIDO })).not.toContain("Receber este pedido");
    cenario.respostas.pedido_compra = { data: null, error: { code: "P0002" } };
    expect(await tela({ pedido: PEDIDO })).toContain("Pedido de compra não encontrado (ou não é da sua loja).");
  });

  it("o pedido novo: o formulário com a loja do turno e os fornecedores; sem fornecedor, leva ao cadastro", async () => {
    const formularioNovo = elementos(await pagina({ form: "novo" })).find((e) => typeof e.type === "function" && e.type.name === "FormularioPedido");
    expect(formularioNovo?.props).toMatchObject({ unidade: LOJA, chave: expect.stringMatching(/^pedido:[0-9a-f-]{36}$/), fornecedores: [{ id: FORN, nome: "Distribuidora Teste" }], hoje: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    cenario.fornecedores = [];
    expect(await tela()).toContain("antes do primeiro pedido");
  });
});

describe("ações dos pedidos de compra (INV-009a)", () => {
  const novo = { unidade: LOJA, fornecedor: FORN, chave: "pedido:0001", documento: "COT-77", previsto: "2026-11-20", observacao: "", itens: JSON.stringify([{ variante: CAPA, quantidade: "10", custo: "18,00" }]) };

  it("criar manda o pedido ao banco e abre o pedido; repetido; cada recusa volta com o formulário aberto", async () => {
    cenario.respostas.pedido_compra_criar = { data: { id: PEDIDO, numero: 7, repetido: false }, error: null };
    expect(await destinoDe(criarPedido(formulario(novo)))).toBe(`/estoque/pedidos?pedido=${PEDIDO}&ok=criado`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "pedido_compra_criar", argumentos: {
      p_unidade: LOJA, p_fornecedor: FORN, p_documento: "COT-77", p_previsto: "2026-11-20", p_itens: [{ variante: CAPA, quantidade: 10, custo: 1_800 }], p_observacao: null, p_chave: "pedido:0001",
    } });
    cenario.respostas.pedido_compra_criar = { data: { id: PEDIDO, numero: 7, repetido: true }, error: null };
    expect(await destinoDe(criarPedido(formulario(novo)))).toBe(`/estoque/pedidos?pedido=${PEDIDO}&ok=repetido`);
    cenario.respostas.pedido_compra_criar = { data: null, error: { code: "22023", message: "Escolha um fornecedor ativo desta rede" } };
    expect(await destinoDe(criarPedido(formulario(novo)))).toBe("/estoque/pedidos?erro=fornecedor&form=novo");
    cenario.respostas.pedido_compra_criar = { data: null, error: { code: "42501", message: "Sem permissão" } };
    expect(await destinoDe(criarPedido(formulario(novo)))).toBe("/estoque/pedidos?erro=permissao&form=novo");
    const antes = cenario.chamadas.length;
    expect(await destinoDe(criarPedido(formulario({ ...novo, itens: "[]" })))).toBe("/estoque/pedidos?erro=itens&form=novo");
    expect(cenario.chamadas).toHaveLength(antes);
  });

  it("encerrar: cancelado, encerrado ou já encerrado; motivo e pedido conferidos; a recusa volta ao pedido", async () => {
    for (const [resposta, ok] of [["cancelado", "cancelado"], ["encerrado", "encerrado"], ["ja_encerrado", "ja_encerrado"]] as const) {
      cenario.respostas.pedido_compra_encerrar = { data: resposta, error: null };
      expect(await destinoDe(encerrarPedido(formulario({ pedido: PEDIDO, motivo: " Recebido  com falta " })))).toBe(`/estoque/pedidos?pedido=${PEDIDO}&ok=${ok}`);
    }
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "pedido_compra_encerrar", argumentos: { p_pedido: PEDIDO, p_motivo: "Recebido com falta" } });
    cenario.respostas.pedido_compra_encerrar = { data: null, error: { code: "P0002" } };
    expect(await destinoDe(encerrarPedido(formulario({ pedido: PEDIDO, motivo: "Tentativa" })))).toBe(`/estoque/pedidos?pedido=${PEDIDO}&erro=nao_encontrado`);
    const antes = cenario.chamadas.length;
    expect(await destinoDe(encerrarPedido(formulario({ pedido: "x", motivo: "Tentativa" })))).toBe("/estoque/pedidos?erro=dados");
    expect(await destinoDe(encerrarPedido(formulario({ pedido: PEDIDO, motivo: "x" })))).toBe(`/estoque/pedidos?pedido=${PEDIDO}&erro=motivo`);
    expect(cenario.chamadas).toHaveLength(antes);
  });
});

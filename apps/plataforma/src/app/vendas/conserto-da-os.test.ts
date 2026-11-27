// O conserto da OS no carrinho do PDV e no comprovante (lote L12c: ORA-OS-006), com sessão e Supabase SIMULADOS: nenhuma
// credencial, nenhuma rede. Dados fictícios. As regras do banco estão em packages/banco/src/ordem-de-servico.test.ts.
// Desde o VEL-a o carrinho do PDV vem inteiro de public.pdv_tela (uma ida ao banco), já com a OS de cada conserto; o
// comprovante da venda concluída continua lendo as tabelas.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDA = "00000000-0000-4000-8000-00000000d101";
const CONSERTO = "00000000-0000-4000-8000-00000000e111";
const OS = "00000000-0000-4000-8000-00000000e112";
const CAIXA = "00000000-0000-4000-8000-00000000c101";
const ITEM = "00000000-0000-4000-8000-00000000a101";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  /** O banco ainda sem a migration do L12c: pedir a coluna os_id dá erro de coluna ausente. */
  semColunaDaOs: false,
  /** A resposta de public.pdv_tela (a tela do PDV numa ida só). */
  pdv: null as unknown,
  /** As funções do banco chamadas, na ordem. */
  rpcs: [] as string[],
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
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    cenario.rpcs.push(nome);
    if (nome === "tem_permissao") return { data: argumentos.p_permissao === "venda.registrar", error: null };
    if (nome === "pdv_tela") return { data: cenario.pdv, error: null };
    return { data: null, error: { code: "PGRST202" } };
  },
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: EU },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    // As permissões chegam com a sessão (public.molde_da_sessao): o PDV não pergunta de novo.
    molde: { permissoes: new Set(["venda.registrar"]), nome: "Vendedora Teste", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
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
/** O conserto no carrinho como public.pdv_tela devolve: o item com a OS dele junto (nula quando quem pede não a lê). */
const carrinho = async (parametros: Record<string, string> = {}, os: Linha | null = { id: OS, numero: 7, situacao: "aberta" }) => {
  cenario.pdv = {
    caixa: { id: CAIXA, aberto_em: "2026-11-14T12:00:00+00:00" },
    venda: { id: VENDA, numero: 43, situacao: "rascunho", pago_pelo_site_centavos: null },
    itens: [{
      id: ITEM, variante_id: CONSERTO, item_serializado_id: null, tipo: "servico", quantidade: 1, preco_unitario_centavos: 33_000, desconto_centavos: 0,
      preco_id: null, os_id: OS, variante: { sku: "OS-CONSERTO", nome: "Conserto genérico" }, serial: null, preco: null, os, aprovacao: null, loja_reserva_id: null,
    }],
    terminais: [],
  };
  cenario.rpcs = [];
  return texto(await Vender({ searchParams: Promise.resolve(parametros) }) as ReactElement);
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.semColunaDaOs = false;
  cenario.pdv = null;
  cenario.rpcs = [];
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
    // VEL-a: a OS veio junto com o carrinho. A tela não lê a tabela das ordens nem pergunta a permissão.
    expect(cenario.rpcs).toEqual(expect.arrayContaining(["pdv_tela"]));
    expect(cenario.rpcs).not.toContain("tem_permissao");
  });

  it("no carrinho do PDV, OS que quem pede não lê mais: o conserto continua apontado, só sem o número", async () => {
    const t = await carrinho({}, null);
    expect(t).toContain("Conserto da OS nº —");
    expect(t).toContain("ver a OS");
    expect(t).not.toContain("Conserto genérico");
    expect(vi.mocked(console.error).mock.calls).toEqual([]);
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

  it("banco ainda sem a migration: o comprovante mostra o item pelo nome do produto, sem erro", async () => {
    cenario.semColunaDaOs = true;
    const venda = await comprovante();
    expect(venda).toContain("Conserto genérico");
    expect(venda).not.toContain("OS nº 7");
    expect(venda).toContain("Total");
    expect(vi.mocked(console.error).mock.calls).toEqual([]);
  });
});

// PDV-c (pedido do proprietário de 18/11): o comprovante diz que o recebimento é via a financeira, mostra a entrada à parte
// e as parcelas (a PayJoy, a Aiva e o cartão).
describe("o comprovante com a PayJoy, a entrada à parte e as parcelas (PDV-c)", () => {
  it("o recebimento via PayJoy em 12x, a entrada do financiamento em dinheiro e o cartão em 3x", async () => {
    cenario.tabelas.venda_pagamentos = [
      { venda_id: VENDA, ordem: 1, meio: "payjoy", valor_centavos: 119_900, entrada_centavos: 0, comprovante: "CONTRATO-FICTICIO-1", situacao: "confirmado", parcelas: 12, entrada_do_financiamento: false },
      { venda_id: VENDA, ordem: 2, meio: "dinheiro", valor_centavos: 30_000, entrada_centavos: 0, comprovante: null, situacao: "confirmado", parcelas: null, entrada_do_financiamento: true },
      { venda_id: VENDA, ordem: 3, meio: "cartao_picpay", valor_centavos: 1_000, entrada_centavos: 0, comprovante: "NSU-1", situacao: "confirmado", parcelas: 3, entrada_do_financiamento: false },
    ];
    const t = await comprovante();
    // Cada linha numa peça só (lib/vendas/comprovante.ts, a mesma leitura de "Dados para emitir"): o texto é o da tela.
    expect(t).toContain("Recebimento via PayJoy: R$ 1.199,00 em 12x");
    expect(t).toContain("Entrada do financiamento (Dinheiro): R$ 300,00");
    expect(t).toContain("Cartão na maquininha PicPay: R$ 10,00 em 3x");
  });
});


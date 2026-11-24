// O comprovante em 3 rodadas de leitura (lote VEL-i: ORA-QUAL-010), com sessão e Supabase SIMULADOS: nenhuma credencial,
// nenhuma rede. O banco simulado responde sempre um instante depois, e cada pedido anota a rodada em que saiu: os que saem
// juntos (o mesmo Promise.all) ficam na mesma rodada; o que só sai depois de outra resposta abre a seguinte. A sessão (o
// molde) vem pronta aqui: as rodadas contadas são as da tela. Antes do VEL-i, uma venda concluída de uma capa esperava 6
// rodadas em fila (a venda, os detalhes, os produtos, a regra de preço, as notas canceladas e os documentos); com um
// aparelho, 7 (o IMEI); com os documentos da venda, 7 (os links). Também o nome de quem vendeu, como na lista de Vendas
// (VND-a).
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const COLEGA = "00000000-0000-4000-8000-0000000000bb";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDA = "00000000-0000-4000-8000-00000000d301";
const CAPA = "00000000-0000-4000-8000-00000000e301";
const CELULAR = "00000000-0000-4000-8000-00000000e302";
const APARELHO = "00000000-0000-4000-8000-00000000f301";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  permissoes: new Set<string>(),
  relogio: { rodada: 0, aberta: false, pedidos: [] as { onde: string; rodada: number }[] },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrada"); },
}));

/** Anota o pedido na rodada aberta, ou abre a seguinte (a rodada fecha antes de as respostas chegarem). */
function pedir(onde: string) {
  const r = cenario.relogio;
  if (!r.aberta) {
    r.rodada += 1;
    r.aberta = true;
    setTimeout(() => { r.aberta = false; }, 0);
  }
  r.pedidos.push({ onde, rodada: r.rodada });
}
const depois = <T>(valor: T) => new Promise<T>((resolver) => setTimeout(() => resolver(valor), 1));

class Consulta {
  linhas: Linha[];
  constructor(nome: string) {
    pedir(nome);
    this.linhas = [...(cenario.tabelas[nome] ?? [])];
    // O RLS de perfis_usuario: sem usuarios.gerir, só o próprio perfil.
    if (nome === "perfis_usuario" && !cenario.permissoes.has("usuarios.gerir")) this.linhas = this.linhas.filter((l) => l.id === EU);
  }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq() { return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
  not() { return this; }
  is() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return depois({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Linha[]; error: null }) => unknown) { return depois({ data: this.linhas, error: null }).then(resolver); }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: (nome: string, argumentos: Record<string, unknown> = {}) => {
    pedir(`rpc ${nome}`);
    if (nome === "tem_permissao") return depois({ data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null });
    if (nome === "ranking_nomes") {
      // public.ranking_nomes: com ranking.ver, o nome de quem tem venda concluída; sem, nada.
      const pedidos = (argumentos.p_vendedores as string[] | undefined) ?? [];
      const nomes = cenario.permissoes.has("ranking.ver") ? (cenario.tabelas.perfis_usuario ?? []).filter((p) => pedidos.includes(p.id as string)) : [];
      return depois({ data: nomes, error: null });
    }
    return depois({ data: null, error: { code: "PGRST202" } });
  },
  storage: {
    from: () => ({
      createSignedUrls: (caminhos: string[]) => {
        pedir("links assinados");
        return depois({ data: caminhos.map((path) => ({ path, signedUrl: `https://assinado.invalid/${path}`, error: null })), error: null });
      },
    }),
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    molde: { permissoes: { has: (p: string) => cenario.permissoes.has(p) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
    usuario: { id: EU },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-19T23:00:00Z" },
    supabase,
  }),
}));

import Venda from "./[id]/page";

function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "string") andar(x.props.children);
      else andar(tipo === "MoldeReal" ? x.props.children : [x.props.titulo, x.props.subtitulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
const comprovante = async () => texto(await Venda({ params: Promise.resolve({ id: VENDA }), searchParams: Promise.resolve({}) } as never) as ReactElement);
const rodadas = () => Math.max(...cenario.relogio.pedidos.map((p) => p.rodada));

const venda = (extra: Linha = {}) => ({
  id: VENDA, numero: 61, situacao: "concluida", unidade_id: LOJA, vendedor_id: EU, cliente_nome: null, cliente_id: null, total_centavos: 7_900,
  subtotal_centavos: 7_900, desconto_centavos: 0, troco_centavos: 0, recebido_centavos: 7_900, a_receber_centavos: 0, devolvido_centavos: 0,
  concluida_em: "2026-11-19T15:00:00Z", cancelada_em: null, motivo_cancelamento: null, ...extra,
});
const daCapa = { id: "i1", venda_id: VENDA, variante_id: CAPA, item_serializado_id: null, tipo: "acessorio", quantidade: 1, preco_unitario_centavos: 7_900, desconto_centavos: 0, preco_id: null };
const doCelular = { id: "i2", venda_id: VENDA, variante_id: CELULAR, item_serializado_id: APARELHO, tipo: "aparelho", quantidade: 1, preco_unitario_centavos: 129_900, desconto_centavos: 0, preco_id: null };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.relogio.rodada = 0;
  cenario.relogio.aberta = false;
  cenario.relogio.pedidos = [];
  cenario.permissoes = new Set(["venda.registrar"]);
  cenario.tabelas = {
    vendas: [venda()],
    venda_itens: [daCapa],
    variantes: [{ id: CAPA, sku: "ACE-0001", nome: "Capa de proteção" }, { id: CELULAR, sku: "APA-0001", nome: "Galaxy A15 128 GB Azul" }],
    itens_serializados: [{ id: APARELHO, imei: "352099001800032", iccid: null }],
    venda_pagamentos: [{ venda_id: VENDA, ordem: 1, meio: "dinheiro", valor_centavos: 7_900, entrada_centavos: 0, comprovante: null, situacao: "confirmado", parcelas: null, entrada_do_financiamento: false }],
    unidades: [{ id: LOJA, nome: "Santa Cândida (teste)", cnpj: null }],
    perfis_usuario: [{ id: EU, nome: "Ana (fictícia)" }, { id: COLEGA, nome: "Bruno (fictício)" }],
  };
});

describe("o comprovante em poucas rodadas (VEL-i)", () => {
  it("uma venda concluída de uma capa: 2 rodadas depois da sessão (eram 6)", async () => {
    expect(await comprovante()).toContain("Venda nº 61");
    expect(rodadas()).toBe(2);
    // A venda e o que só depende dela saem juntos, na primeira.
    const primeira = cenario.relogio.pedidos.filter((p) => p.rodada === 1).map((p) => p.onde);
    expect(primeira).toEqual(expect.arrayContaining(["vendas", "venda_itens", "venda_pagamentos", "notas_pedidos", "venda_devolucoes", "estornos_externos", "venda_retornos"]));
  });

  it("CRM-009a: a venda que atendeu um pedido do site diz de onde veio, sem rodada a mais; a venda comum não diz nada", async () => {
    const comum = await comprovante();
    expect(comum).not.toContain("veio do site");
    // As duas leituras do site saem na segunda rodada, com os detalhes da venda.
    expect(new Set(cenario.relogio.pedidos.filter((p) => p.onde === "loja_reservas" || p.onde === "loja_pedidos").map((p) => p.rodada))).toEqual(new Set([2]));
    expect(rodadas()).toBe(2);
    cenario.relogio.rodada = 0;
    cenario.relogio.pedidos = [];
    const PEDIDO = "00000000-0000-4000-8000-00000000b001";
    cenario.tabelas.loja_reservas = [{ venda_id: VENDA, numero: 11, codigo: "UNI234", criada_em: "2026-11-18T12:00:01Z", origem: "google", pedido_id: PEDIDO, situacao: "atendida" }];
    cenario.tabelas.loja_pedidos = [{ id: PEDIDO, codigo: "ABC234", criado_em: "2026-11-18T12:00:00Z", venda_id: VENDA }];
    const doSite = await comprovante();
    expect(doSite).toContain("veio do site");
    expect(doSite).toContain("Esta venda atendeu o pedido do site ABC234, feito em 18/11/2026 (o visitante chegou por Google).");
    expect(doSite).toContain("a venda é do balcão, e a origem fica guardada no pedido.");
    expect(rodadas()).toBe(2);
  });

  it("PAY-011a: o estorno confirmado pelo débito do extrato diz qual débito foi, sem rodada a mais; sem estorno confirmado, nada é lido", async () => {
    // A venda comum não tem estorno: o extrato nem é consultado.
    await comprovante();
    expect(cenario.relogio.pedidos.some((p) => p.onde === "extrato_linhas")).toBe(false);
    cenario.relogio.rodada = 0;
    cenario.relogio.pedidos = [];
    // A venda cancelada com dois estornos: um confirmado (pelo débito do extrato, marcado como chargeback) e um a confirmar.
    const CONFIRMADO = "00000000-0000-4000-8000-00000000c001";
    const PENDENTE = "00000000-0000-4000-8000-00000000c002";
    const EXTRATO = "00000000-0000-4000-8000-00000000c003";
    cenario.tabelas.vendas = [venda({ situacao: "cancelada", cancelada_em: "2026-11-20T15:00:00Z", motivo_cancelamento: "Chargeback: o cliente contestou a compra" })];
    cenario.tabelas.estornos_externos = [
      { id: CONFIRMADO, numero: 3, venda_id: VENDA, meio: "cartao_picpay", valor_centavos: 5_000, situacao: "confirmado", devolucao_id: null, comprovante: "CBK-80", confirmado_em: "2026-11-21T12:00:00Z" },
      { id: PENDENTE, numero: 4, venda_id: VENDA, meio: "pix_picpay", valor_centavos: 2_900, situacao: "pendente", devolucao_id: null, comprovante: null, confirmado_em: null },
    ];
    cenario.tabelas.extrato_linhas = [{ estorno_id: CONFIRMADO, numero: 12, data: "2026-11-20", chargeback: true, confirmou_o_estorno: true, extrato: { id: EXTRATO, numero: 7, fonte: "PicPay da loja" } }];
    const comDebito = await comprovante();
    expect(comDebito).toContain("comprovante CBK-80");
    expect(comDebito).toContain("chargeback");
    expect(comDebito).toContain("Confirmado pelo débito do extrato nº 7 (PicPay da loja), linha 12, de 20/11/2026 : o cliente contestou a compra no banco.");
    // A leitura sai na segunda rodada, junto dos detalhes da venda, e só pelo estorno confirmado.
    expect(cenario.relogio.pedidos.filter((p) => p.onde === "extrato_linhas").map((p) => p.rodada)).toEqual([2]);
    expect(rodadas()).toBe(2);
    // O débito que só guardou a prova de um estorno confirmado à mão: "comprovado", sem chargeback.
    cenario.tabelas.extrato_linhas = [{ estorno_id: CONFIRMADO, numero: 12, data: "2026-11-20", chargeback: false, confirmou_o_estorno: false, extrato: { id: EXTRATO, numero: 7, fonte: "PicPay da loja" } }];
    const soProva = await comprovante();
    expect(soProva).toContain("Comprovado pelo débito do extrato nº 7 (PicPay da loja), linha 12, de 20/11/2026 .");
    expect(soProva).not.toContain("chargeback");
    // Quem não concilia não vê o extrato (a leitura volta vazia): o estorno aparece confirmado, sem a anotação.
    cenario.tabelas.extrato_linhas = [];
    const semExtrato = await comprovante();
    expect(semExtrato).toContain("comprovante CBK-80");
    expect(semExtrato).not.toContain("débito do extrato nº");
  });

  it("com um aparelho, também 2 (eram 7): o produto e o IMEI saem juntos", async () => {
    cenario.tabelas.venda_itens = [daCapa, doCelular];
    expect(await comprovante()).toContain("352099001800032");
    expect(rodadas()).toBe(2);
    const doAparelho = cenario.relogio.pedidos.filter((p) => p.onde === "variantes" || p.onde === "itens_serializados");
    expect(new Set(doAparelho.map((p) => p.rodada))).toEqual(new Set([2]));
  });

  it("com os documentos da venda, os links assinados vêm numa terceira (eram 7)", async () => {
    cenario.tabelas.venda_anexos = [{ id: "a1", venda_id: VENDA, tipo: "contrato_financiamento", descricao: null, caminho: `org/${LOJA}/${VENDA}/a1.pdf`, formato: "pdf", bytes: 1024, enviado_em: "2026-11-19T15:00:00Z", retirado_em: null, motivo_retirada: null }];
    await comprovante();
    expect(rodadas()).toBe(3);
    expect(cenario.relogio.pedidos.find((p) => p.onde === "links assinados")?.rodada).toBe(3);
  });
});

describe("o nome de quem vendeu no comprovante", () => {
  it("a gerência vê o nome do colega pelo ranking (o perfil dele não se lê)", async () => {
    cenario.tabelas.vendas = [venda({ vendedor_id: COLEGA })];
    cenario.permissoes = new Set(["venda.ver_unidade", "ranking.ver"]);
    expect(await comprovante()).toContain("Vendedor: Bruno (fictício)");
  });

  it("sem ranking.ver, o nome do colega não aparece", async () => {
    cenario.tabelas.vendas = [venda({ vendedor_id: COLEGA })];
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    const tela = await comprovante();
    expect(tela).toContain("Vendedor: —");
    expect(tela).not.toContain("Bruno");
  });

  it("a própria venda mostra o próprio nome, sem perguntar ao ranking", async () => {
    cenario.permissoes = new Set(["venda.registrar", "ranking.ver"]);
    expect(await comprovante()).toContain("Vendedor: Ana (fictícia)");
    expect(cenario.relogio.pedidos.some((p) => p.onde === "rpc ranking_nomes")).toBe(false);
  });
});

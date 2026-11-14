// O cancelamento da nota no fisco e a correção da chave na tela da venda (lote L10c: ORA-FISC-009 em parte), com sessão
// e Supabase SIMULADOS (dados fictícios, nada vai ao fisco). As regras estão no banco:
// packages/banco/src/cancelamento-da-nota.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDA = "00000000-0000-4000-8000-00000000d201";
const PEDIDO = "00000000-0000-4000-8000-00000000d202";
const ANTIGO = "00000000-0000-4000-8000-00000000d203";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  // Banco ainda sem a migration do L10c: a leitura que pede as colunas do cancelamento no fisco responde 42703.
  semColunasDoFisco: false,
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
  select(colunas?: string) {
    if (cenario.semColunasDoFisco && typeof colunas === "string" && colunas.includes("cancelada_no_fisco_em")) this.erro = { code: "42703" };
    return this;
  }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] !== valor); return this; }
  in() { return this; }
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
    if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
    cenario.chamadas.push({ nome, argumentos });
    return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
  },
  storage: { from: () => ({ createSignedUrls: async (caminhos: string[]) => ({ data: caminhos.map((path) => ({ path, signedUrl: `https://assinado.invalid/${path}`, error: null })), error: null }) }) },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: EU },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase,
  }),
}));

import { corrigirChaveDaNota, registrarCancelamentoNoFisco } from "../notas/acoes";
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
const tela = async (parametros: Record<string, string> = {}) =>
  texto(await Venda({ params: Promise.resolve({ id: VENDA }), searchParams: Promise.resolve(parametros) } as never) as ReactElement);
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; };
const emitida = (extra: Linha = {}) => ({
  id: PEDIDO, venda_id: VENDA, tipo: "venda", situacao: "emitida", solicitado_por: EU, destinatario_nome: null, destinatario_mascarado: null, observacao: null,
  chave_acesso: "4".repeat(44), modelo: "65", serie: 1, numero_documento: 801, protocolo: "141260000123456", cancelada_no_fisco_em: null, protocolo_cancelamento: null, ...extra,
});
const canceladaNoFisco = () => emitida({ id: ANTIGO, situacao: "cancelada", numero_documento: 799, cancelada_no_fisco_em: "2026-11-14T13:20:00Z", protocolo_cancelamento: "141260000654321" });
const DOCUMENTO = (tipo: "pdf" | "xml") => ({ id: `doc-${tipo}`, pedido_id: PEDIDO, tipo, caminho: `org/loja/${PEDIDO}/a.${tipo}`, bytes: 51_200, enviado_em: "2026-11-14T13:30:00Z" });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.semColunasDoFisco = false;
  cenario.permissoes = new Set(["venda.registrar", "nota.solicitar", "nota.aprovar"]);
  cenario.tabelas = {
    vendas: [{ id: VENDA, numero: 52, situacao: "concluida", unidade_id: LOJA, vendedor_id: EU, cliente_nome: "Carla Cliente", cliente_id: null, total_centavos: 7_900, subtotal_centavos: 7_900, desconto_centavos: 0, troco_centavos: 0, recebido_centavos: 7_900, a_receber_centavos: 0, devolvido_centavos: 0, concluida_em: "2026-11-14T13:00:00Z", cancelada_em: null, motivo_cancelamento: null }],
    venda_itens: [],
    notas_pedidos: [emitida()],
    notas_documentos: [DOCUMENTO("pdf")],
    whatsapp_envios: [],
    unidades: [{ id: LOJA, nome: "Santa Cândida (teste)", cnpj: null }],
    perfis_usuario: [{ id: EU, nome: "Vendedora Teste" }],
  };
});
afterEach(() => { vi.restoreAllMocks(); });

describe("cancelamento no fisco e correção da chave na tela da venda (L10c)", () => {
  it("quem aprova vê o registro do cancelamento e, sem o XML guardado, a correção da chave; com o XML, só o cancelamento; quem não aprova, nenhum", async () => {
    let t = await tela();
    for (const trecho of ["Cancelou a nota no portal do fisco? Registre o cancelamento", "Protocolo do cancelamento (15 dígitos)", "O prazo para cancelar é do fisco",
      "A chave registrada está errada? Corrija", "Chave de acesso certa (44 dígitos)"]) expect(t, trecho).toContain(trecho);
    cenario.tabelas.notas_documentos = [DOCUMENTO("pdf"), DOCUMENTO("xml")];
    t = await tela();
    expect(t).toContain("Registre o cancelamento");
    expect(t).not.toContain("A chave registrada está errada?");
    cenario.permissoes = new Set(["venda.registrar", "nota.solicitar"]);
    t = await tela();
    expect(t).not.toContain("Registre o cancelamento");
    expect(t).not.toContain("A chave registrada está errada?");
  });

  it("banco sem a migration (sem as colunas do cancelamento): nem o histórico nem os formulários, e a venda segue", async () => {
    cenario.semColunasDoFisco = true;
    const t = await tela();
    expect(t).toContain("NFC-e nº 801");
    expect(t).not.toContain("Registre o cancelamento");
    expect(t).not.toContain("Cancelada no fisco");
  });

  it("a nota cancelada no fisco fica no histórico com o protocolo; a venda volta a pedir nota; na venda cancelada o histórico aparece sozinho", async () => {
    cenario.tabelas.notas_pedidos = [canceladaNoFisco()];
    let t = await tela();
    for (const trecho of ["Cancelada no fisco", "NFC-e nº 799", "protocolo 141260000654321", "Pedir nota fiscal"]) expect(t, trecho).toContain(trecho);
    cenario.tabelas.notas_pedidos = [canceladaNoFisco(), emitida()];
    t = await tela();
    expect(t).toContain("NFC-e nº 799");
    expect(t).toContain("NFC-e nº 801");
    expect(t).not.toContain("Pedir nota fiscal");
    cenario.tabelas.vendas = [{ ...cenario.tabelas.vendas![0], situacao: "cancelada", cancelada_em: "2026-11-14T13:40:00Z", motivo_cancelamento: "Cliente desistiu" }];
    cenario.tabelas.notas_pedidos = [canceladaNoFisco()];
    t = await tela();
    expect(t).toContain("Cancelada no fisco");
    expect(t).not.toContain("Pedir nota fiscal");
  });

  it("as mensagens: o registro feito, a chave corrigida e os erros do banco com o caminho", async () => {
    expect(await tela({ nota: "cancelada_no_fisco" })).toContain("Cancelamento da nota registrado: agora a venda pode ser cancelada ou pedir outra nota.");
    expect(await tela({ nota: "chave_corrigida" })).toContain("Chave da nota corrigida; a anterior ficou no histórico da nota.");
    expect(await tela({ erro_nota: "cancelamento_devolucao" })).toContain("o cancelamento da nota de origem é tratado com o contador");
    expect(await tela({ erro_nota: "nota_emitida" })).toContain("registre o cancelamento no bloco “Nota fiscal” da venda");
  });

  it("as ações: o banco recebe o protocolo e a justificativa, ou a chave e o motivo; os erros viram a mensagem certa", async () => {
    expect(await destinoDe(registrarCancelamentoNoFisco(formulario({ pedido: "x", venda: VENDA, protocolo: "141260000654321", justificativa: "Cliente desistiu da compra" })))).toBe("/vendas?erro=dados");
    cenario.respostas.notas_registrar_cancelamento = { data: true, error: null };
    expect(await destinoDe(registrarCancelamentoNoFisco(formulario({ pedido: PEDIDO, venda: VENDA, protocolo: " 141260000654321 ", justificativa: "  Cliente desistiu da compra  " }))))
      .toBe(`/vendas/${VENDA}?nota=cancelada_no_fisco`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "notas_registrar_cancelamento", argumentos: { p_pedido: PEDIDO, p_protocolo: "141260000654321", p_justificativa: "Cliente desistiu da compra" } });
    cenario.respostas.notas_registrar_cancelamento = { data: null, error: { code: "22023", message: "Protocolo do cancelamento inválido: são 15 dígitos" } };
    expect(await destinoDe(registrarCancelamentoNoFisco(formulario({ pedido: PEDIDO, venda: VENDA, protocolo: "123", justificativa: "Cliente desistiu da compra" }))))
      .toBe(`/vendas/${VENDA}?erro_nota=cancelamento_protocolo`);
    cenario.respostas.notas_registrar_cancelamento = { data: null, error: { code: "P0002" } };
    expect(await destinoDe(registrarCancelamentoNoFisco(formulario({ pedido: PEDIDO, venda: VENDA, protocolo: "141260000654321", justificativa: "Cliente desistiu da compra" }))))
      .toBe(`/vendas/${VENDA}?erro_nota=nao_encontrado`);

    const antes = cenario.chamadas.length;
    expect(await destinoDe(corrigirChaveDaNota(formulario({ pedido: PEDIDO, venda: VENDA, chave_acesso: "5".repeat(44), motivo: " curto " })))).toBe(`/vendas/${VENDA}?erro_nota=chave_motivo`);
    expect(cenario.chamadas.length).toBe(antes);
    cenario.respostas.notas_corrigir_chave = { data: true, error: null };
    expect(await destinoDe(corrigirChaveDaNota(formulario({ pedido: PEDIDO, venda: VENDA, chave_acesso: "5".repeat(44), motivo: "Digitada errada na hora" })))).toBe(`/vendas/${VENDA}?nota=chave_corrigida`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "notas_corrigir_chave", argumentos: { p_pedido: PEDIDO, p_chave_acesso: "5".repeat(44), p_motivo: "Digitada errada na hora" } });
    cenario.respostas.notas_corrigir_chave = { data: null, error: { code: "22023", message: "O XML guardado confirma a chave registrada: se a nota é outra, cancele esta no fisco e registre a certa" } };
    expect(await destinoDe(corrigirChaveDaNota(formulario({ pedido: PEDIDO, venda: VENDA, chave_acesso: "5".repeat(44), motivo: "Digitada errada na hora" })))).toBe(`/vendas/${VENDA}?erro_nota=chave_xml`);
    cenario.respostas.notas_corrigir_chave = { data: null, error: { code: "22023", message: "Esta chave de acesso já está registrada em outro pedido" } };
    expect(await destinoDe(corrigirChaveDaNota(formulario({ pedido: PEDIDO, venda: VENDA, chave_acesso: "5".repeat(44), motivo: "Digitada errada na hora" })))).toBe(`/vendas/${VENDA}?erro_nota=chave_repetida`);
  });
});

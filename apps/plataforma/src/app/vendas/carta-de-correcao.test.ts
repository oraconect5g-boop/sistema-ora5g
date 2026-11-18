// A carta de correção da NF-e na tela da venda (lote FISC-009b: ORA-FISC-009 em parte), com sessão e Supabase SIMULADOS
// (dados fictícios, nada vai ao fisco). As regras estão no banco: packages/banco/src/carta-de-correcao.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDA = "00000000-0000-4000-8000-00000000d201";
const PEDIDO = "00000000-0000-4000-8000-00000000d202";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  // Banco ainda sem a migration do L10c: a leitura que pede as colunas do cancelamento no fisco responde 42703.
  semColunasDoFisco: false,
  // Banco ainda sem a migration do FISC-009b: a leitura das cartas de correção responde 42P01 (tabela que não existe).
  semCartas: false,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrada"); },
}));
class Consulta {
  linhas: Linha[];
  erro: { code: string } | null = null;
  constructor(nome: string) {
    this.linhas = [...(cenario.tabelas[nome] ?? [])];
    if (cenario.semCartas && nome === "notas_cartas_de_correcao") this.erro = { code: "42P01" };
  }
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
    // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
    molde: { permissoes: { has: (p: string) => Boolean(cenario.permissoes.has(p)) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
    usuario: { id: EU },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase,
  }),
}));

import { registrarCartaDeCorrecao } from "../notas/acoes";
import Venda from "./[id]/page";

function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "string") andar(x.props.children);
      else if (tipo === "CartasDeCorrecao") andar((x.type as (p: Linha) => unknown)(x.props));
      else andar(tipo === "MoldeReal" ? x.props.children : [x.props.titulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
const arvore = async (parametros: Record<string, string> = {}) =>
  (await Venda({ params: Promise.resolve({ id: VENDA }), searchParams: Promise.resolve(parametros) } as never)) as ReactElement;
const tela = async (parametros: Record<string, string> = {}) => texto(await arvore(parametros));
// Os elementos da árvore cujas propriedades atendem ao critério (para ler o valor inicial de um campo).
function elementos(v: unknown, criterio: (p: Linha) => boolean, achados: Linha[] = []): Linha[] {
  if (Array.isArray(v)) for (const x of v) elementos(x, criterio, achados);
  else if (isValidElement<Linha>(v)) {
    if (criterio(v.props)) achados.push(v.props);
    // O bloco das cartas é um componente: abre o que ele desenha.
    if (typeof v.type === "function" && v.type.name === "CartasDeCorrecao") elementos((v.type as (p: Linha) => unknown)(v.props), criterio, achados);
    for (const filho of Object.values(v.props)) elementos(filho, criterio, achados);
  }
  return achados;
}
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; };
const emitida = (extra: Linha = {}) => ({
  id: PEDIDO, venda_id: VENDA, tipo: "venda", situacao: "emitida", solicitado_por: EU, destinatario_nome: null, destinatario_mascarado: null, observacao: null,
  chave_acesso: "4".repeat(44), modelo: "65", serie: 1, numero_documento: 801, protocolo: "141260000123456", cancelada_no_fisco_em: null, protocolo_cancelamento: null, ...extra,
});
const DOCUMENTO = (tipo: "pdf" | "xml") => ({ id: `doc-${tipo}`, pedido_id: PEDIDO, tipo, caminho: `org/loja/${PEDIDO}/a.${tipo}`, bytes: 51_200, enviado_em: "2026-11-14T13:30:00Z" });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.semColunasDoFisco = false;
  cenario.semCartas = false;
  cenario.permissoes = new Set(["venda.registrar", "nota.solicitar", "nota.aprovar"]);
  cenario.tabelas = {
    vendas: [{ id: VENDA, numero: 52, situacao: "concluida", unidade_id: LOJA, vendedor_id: EU, cliente_nome: "Carla Cliente", cliente_id: null, total_centavos: 7_900, subtotal_centavos: 7_900, desconto_centavos: 0, troco_centavos: 0, recebido_centavos: 7_900, a_receber_centavos: 0, devolvido_centavos: 0, concluida_em: "2026-11-14T13:00:00Z", cancelada_em: null, motivo_cancelamento: null }],
    venda_itens: [],
    notas_pedidos: [emitida({ modelo: "55" })],
    notas_cartas_de_correcao: [],
    notas_documentos: [DOCUMENTO("pdf")],
    whatsapp_envios: [],
    unidades: [{ id: LOJA, nome: "Santa Cândida (teste)", cnpj: null }],
    perfis_usuario: [{ id: EU, nome: "Vendedora Teste" }],
  };
});
afterEach(() => { vi.restoreAllMocks(); });

const CARTA = (numero: number, correcao = `Endereço do destinatário, carta ${numero}: onde se lê Rua A, 10, leia-se Rua A, 100`) => ({
  id: `carta-${numero}`, pedido_id: PEDIDO, numero, protocolo: `1412600007770${String(numero).padStart(2, "0")}`, correcao, registrada_em: "2026-11-15T13:00:00Z",
});
const REGISTRAR = (campos: Record<string, string>) => registrarCartaDeCorrecao(formulario({ pedido: PEDIDO, venda: VENDA, ...campos }));

describe("carta de correção da NF-e na tela da venda (FISC-009b)", () => {
  it("NF-e emitida: quem aprova vê as cartas (a mais recente vale) e o formulário com o próximo número; quem não aprova, só as cartas", async () => {
    cenario.tabelas.notas_cartas_de_correcao = [CARTA(1), CARTA(2)];
    let t = await tela();
    for (const trecho of ["Cartas de correção", "Carta nº 1", "protocolo 141260000777001", "Carta nº 2", "A que vale", "a carta mais recente substitui as anteriores",
      "Fez uma carta de correção no portal do fisco? Registre", "Número da carta (de 1 a 20)", "Protocolo do evento (15 dígitos)",
      "Texto da correção, o mesmo do evento (de 15 a 1.000 caracteres)", "§ 1º-A do art. 7º do Convênio S/N", "O prazo e o aceite são do fisco"]) expect(t, trecho).toContain(trecho);
    expect(elementos(await arvore(), (p) => p.name === "numero").map((p) => p.defaultValue)).toEqual([3]);
    expect(elementos(await arvore(), (p) => p.name === "correcao").map((p) => [p.minLength, p.maxLength])).toEqual([[15, 1000]]);
    cenario.permissoes = new Set(["venda.registrar", "nota.solicitar"]);
    t = await tela();
    expect(t).toContain("Carta nº 2");
    expect(t).not.toContain("Registre");
  });

  it("sem carta, o número 1; com 20, o limite do fisco e sem formulário; a NFC-e e o banco sem a migration não mostram o bloco", async () => {
    let t = await tela();
    expect(t).toContain("Nenhuma carta de correção registrada nesta NF-e.");
    expect(t).not.toContain("A que vale");
    expect(elementos(await arvore(), (p) => p.name === "numero").map((p) => p.defaultValue)).toEqual([1]);
    cenario.tabelas.notas_cartas_de_correcao = Array.from({ length: 20 }, (_, i) => CARTA(i + 1));
    t = await tela();
    expect(t).toContain("Esta NF-e chegou a 20 cartas de correção, o limite do fisco.");
    expect(t).not.toContain("Fez uma carta de correção no portal do fisco?");
    cenario.tabelas.notas_pedidos = [emitida({ modelo: "65" })];
    t = await tela();
    expect(t).toContain("NFC-e nº 801");
    expect(t).not.toContain("Cartas de correção");
    cenario.tabelas.notas_pedidos = [emitida({ modelo: "55" })];
    cenario.semCartas = true;
    t = await tela();
    expect(t).toContain("NF-e nº 801");
    expect(t).not.toContain("Cartas de correção");
  });

  it("as mensagens: a carta registrada, a repetida e os erros do banco", async () => {
    expect(await tela({ nota: "carta_registrada" })).toContain("Carta de correção registrada no bloco “Nota fiscal”: a mais recente substitui as anteriores.");
    expect(await tela({ nota: "carta_repetida" })).toContain("Nada mudou: esta carta de correção já estava registrada.");
    expect(await tela({ erro_nota: "carta_nfce" })).toContain("A carta de correção é só da NF-e. A NFC-e não tem: para corrigir, cancele a nota no fisco e peça outra.");
    expect(await tela({ erro_nota: "carta_outra" })).toContain("Esta nota já tem uma carta de correção com este número");
  });

  it("a ação: confere o número antes do banco, manda o texto inteiro e diz o resultado; cada recusa do banco vira a mensagem certa", async () => {
    expect(await destinoDe(registrarCartaDeCorrecao(formulario({ pedido: "x", venda: VENDA, numero: "1", protocolo: "141260000777001", correcao: "Texto da correção de teste" })))).toBe("/vendas?erro=dados");
    for (const numero of ["0", "21", "abc", "", "1.5", "123"]) {
      expect(await destinoDe(REGISTRAR({ numero, protocolo: "141260000777001", correcao: "Texto da correção de teste" })), numero).toBe(`/vendas/${VENDA}?erro_nota=carta_numero`);
    }
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.notas_registrar_carta_de_correcao = { data: true, error: null };
    expect(await destinoDe(REGISTRAR({ numero: " 03 ", protocolo: " 141.260.000.777.003 ", correcao: `  ${"z".repeat(1001)}  ` }))).toBe(`/vendas/${VENDA}?nota=carta_registrada`);
    expect(cenario.chamadas.at(-1)).toEqual({
      nome: "notas_registrar_carta_de_correcao", argumentos: { p_pedido: PEDIDO, p_numero: 3, p_protocolo: "141.260.000.777.003", p_correcao: "z".repeat(1001) },
    });
    cenario.respostas.notas_registrar_carta_de_correcao = { data: false, error: null };
    expect(await destinoDe(REGISTRAR({ numero: "3", protocolo: "141260000777003", correcao: "Texto da correção de teste" }))).toBe(`/vendas/${VENDA}?nota=carta_repetida`);
    const recusas: [string, string][] = [
      ["O número da carta de correção vai de 1 a 20 (como o do evento no fisco)", "carta_numero"],
      ["Protocolo da carta de correção inválido: são 15 dígitos", "carta_protocolo"],
      ["O texto da correção tem de 15 a 1.000 caracteres (como o do evento no fisco)", "carta_texto"],
      ["A carta de correção nº 3 desta nota já foi registrada com outro conteúdo", "carta_outra"],
      ["Este protocolo já foi registrado em outra carta de correção", "carta_protocolo_repetido"],
      ["A carta de correção é só da NF-e (modelo 55); a NFC-e não tem: o caminho é cancelar e emitir outra", "carta_nfce"],
      ["Só a nota emitida (autorizada e não cancelada) tem carta de correção", "carta_nao_emitida"],
    ];
    for (const [mensagem, erro] of recusas) {
      cenario.respostas.notas_registrar_carta_de_correcao = { data: null, error: { code: "22023", message: mensagem } };
      expect(await destinoDe(REGISTRAR({ numero: "3", protocolo: "141260000777003", correcao: "Texto da correção de teste" })), mensagem).toBe(`/vendas/${VENDA}?erro_nota=${erro}`);
    }
    cenario.respostas.notas_registrar_carta_de_correcao = { data: null, error: { code: "P0002", message: "Pedido de nota não encontrado" } };
    expect(await destinoDe(REGISTRAR({ numero: "3", protocolo: "141260000777003", correcao: "Texto da correção de teste" }))).toBe(`/vendas/${VENDA}?erro_nota=nao_encontrado`);
  });
});

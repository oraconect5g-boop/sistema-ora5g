// A aba Carteira e relatórios (lote CONNECT-o), com a sessão e o Supabase SIMULADOS: nenhuma credencial; linhas, valores,
// nomes e datas FICTÍCIOS. As consultas à Nogle (quem pede, o limite, o worker) têm os testes em packages/banco e apps/worker;
// aqui, o que cada papel vê na aba e para onde volta cada consulta pedida dela.
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  vinculos: [] as { papel: string; escopo: string; unidade_id: string | null }[],
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  rpc: [] as { nome: string; argumentos: Record<string, unknown> }[],
  erroDaRpc: null as null | { code: string },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  useRouter: () => ({ refresh: () => undefined }),
}));
class Consulta {
  linhas: Linha[];
  constructor(linhas: Linha[]) { this.linhas = [...linhas]; }
  private filtrar(campo: string, passa: (v: unknown) => boolean) { this.linhas = this.linhas.filter((l) => !(campo in l) || passa(l[campo])); return this; }
  select() { return this; }
  order() { return this; }
  limit(n: number) { this.linhas = this.linhas.slice(0, n); return this; }
  eq(campo: string, valor: unknown) { return this.filtrar(campo, (v) => v === valor); }
  in(campo: string, valores: unknown[]) { return this.filtrar(campo, (v) => valores.includes(v)); }
  gte(campo: string, valor: string) { return this.filtrar(campo, (v) => new Date(String(v)) >= new Date(valor)); }
  then(resolver: (r: { data: unknown; error: null }) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "loja", unidade_nome: "Santa Cândida (fictícia)", turno_termina_em: "2026-11-26T03:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Pessoa (fictícia)", vinculos: cenario.vinculos, pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    // O RLS: quem não gere a Ora Connect vê só as próprias operações.
    from: (tabela: string) => new Consulta((cenario.tabelas[tabela] ?? []).filter((l) => tabela !== "connect_operacoes" || cenario.permissoes.has("connect.gerir") || l.vendedor_id === "eu")),
    rpc: async (nome: string, argumentos: Record<string, unknown>) => { cenario.rpc.push({ nome, argumentos }); return { data: null, error: cenario.erroDaRpc }; },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error { constructor(m: string) { super(`falha: ${m}`); } },
  obterSessao: async () => sessaoFicticia,
}));

import { consultar } from "../linha/acoes";
import CarteiraDaConnect from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Linha>(v)) {
    if (typeof v.type === "function" && /^[A-Z]/.test((v.type as { name?: string }).name ?? "")) {
      try { return texto((v.type as (p: unknown) => unknown)(v.props)); } catch { /* componente com estado: lê as propriedades */ }
    }
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
function elementos(v: unknown, nome: string): Linha[] {
  const achados: Linha[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (isValidElement<Linha>(x)) {
      if (typeof x.type === "function" && (x.type as { name?: string }).name === nome) achados.push(x.props);
      Object.values(x.props).forEach(andar);
    } else if (x && typeof x === "object" && !("$$typeof" in x)) Object.values(x).forEach(andar);
  };
  andar(v);
  return achados;
}
/** Todos os endereços (href) da árvore, sem chamar os componentes. */
function enderecos(v: unknown): string[] {
  const achados: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (isValidElement<Linha>(x)) {
      if (typeof x.props.href === "string") achados.push(x.props.href);
      Object.values(x.props).forEach(andar);
    } else if (x && typeof x === "object" && !("$$typeof" in x)) Object.values(x).forEach(andar);
  };
  andar(v);
  return achados;
}
const arvore = (busca: Record<string, string> = {}) => CarteiraDaConnect({ searchParams: Promise.resolve(busca) } as never);
const abrir = async (busca: Record<string, string> = {}) => texto(await arvore(busca)).replace(/\s+/g, " ");
const emOrdem = (t: string, ...partes: string[]) => expect(t).toMatch(new RegExp(partes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*?")));

const AGORA = new Date("2026-11-25T15:00:00Z");
const CONSULTA = { mensagem: null, pedida_em: "2026-11-25T14:00:00Z", respondida_em: "2026-11-25T14:00:03Z", resposta_apagada_em: null, situacao: "respondida" };
const CONSULTAS = [
  { ...CONSULTA, id: "c-saldo", tipo: "carteira_saldo", parametro: null, resposta: { saldo_centavos: 185_000 } },
  { ...CONSULTA, id: "c-saidas", tipo: "carteira_extrato_saidas", parametro: "30", resposta: { total: 2, soma_centavos: 8_784, fora: 0, movimentos: [
    { quando: "2026-11-24 09:30", tipo: "ATIVACAO", valor_centavos: 4_392, plano: "10 GB", linha: null },
    { quando: "2026-11-20 10:00", tipo: "RECARGA", valor_centavos: 4_392, plano: "10 GB", linha: "41999998888", cliente: "Cliente Fictício" }] } },
  { ...CONSULTA, id: "c-entradas", tipo: "carteira_extrato_entradas", parametro: "30", resposta: { total: 1, soma_centavos: 150_000, fora: 0, movimentos: [
    { quando: "2026-11-22 15:00", tipo: "CREDITO", valor_centavos: 150_000 }] } },
  { ...CONSULTA, id: "c-prog", tipo: "carteira_programadas", parametro: "30", resposta: { total: 2, soma_centavos: 12_480, fora: 0, recargas: [
    { renovacao: "2026-12-10", linha: "41999998888", plano: "10 GB", valor_centavos: 5_490 }, { renovacao: "2026-12-01", linha: "41988887777", plano: "20 GB", valor_centavos: 6_990 }] } },
  { ...CONSULTA, id: "c-port", tipo: "relatorio_portabilidades", parametro: "30", resposta: { total: 1, por_status: { Sucesso: 1 }, fora: 0, portabilidades: [
    { quando: "2026-11-21 11:00", linha: "41999997777", linha_doadora: "41988886666", operadora: "CLARO", status: "Sucesso" }] } },
];
const OPERACAO = { unidade_id: "loja", plano_nome: "10 GB", valor_face_centavos: 2_000, recebido_na_loja_centavos: null, linha: null, criado_em: "2026-11-25T13:00:00Z" };

beforeEach(() => {
  vi.useFakeTimers({ now: AGORA, toFake: ["Date"] });
  cenario.permissoes = new Set(["connect.operar", "connect.gerir"]);
  cenario.vinculos = [{ papel: "dono", escopo: "organizacao", unidade_id: null }];
  cenario.tabelas = {
    connect_consultas: CONSULTAS,
    connect_operacoes: [
      { ...OPERACAO, id: "o1", numero: 1, tipo: "ativacao", situacao: "confirmada", vendedor_id: "v1" },
      { ...OPERACAO, id: "o2", numero: 2, tipo: "recarga", situacao: "confirmada", vendedor_id: "v1", recebido_na_loja_centavos: 2_000 },
      { ...OPERACAO, id: "o3", numero: 3, tipo: "ativacao", situacao: "aguardando_operadora", vendedor_id: "eu" },
    ],
    perfis_usuario: [{ id: "v1", nome: "Vendedora (fictícia)" }, { id: "eu", nome: "Dono (fictício)" }],
    connect_conciliacoes: [{ id: "k1", numero: 7, relatorio: "ativacoes", de: "2026-11-10", ate: "2026-11-16", recebida_em: "2026-11-17T10:00:00Z",
      totais: { linhas: 42, conferidas: 40, valor_diferente: 1, so_na_nogle: 1, sem_identificacao: 0, so_aqui: 1 } }],
  };
  cenario.rpc = [];
  cenario.erroDaRpc = null;
});
afterEach(() => { vi.useRealTimers(); });

describe("a aba Carteira e relatórios (CONNECT-o)", () => {
  it("quem gere a rede: os 4 cartões da demonstração com as próprias consultas, o extrato numa lista só, as programadas e as portabilidades", async () => {
    const t = await abrir();
    emOrdem(t, "Saldo na Nogle", "R$ 1.850,00", "consultado em 25/11/2026 às 11:00", "Saídas recentes", "R$ 87,84", "2 movimentos · nos últimos 30 dias",
      "Entradas recentes", "R$ 1.500,00", "1 créditos · nos últimos 30 dias", "Recargas programadas", "2", "nos próximos 30 dias · R$ 124,80");
    emOrdem(t, "Extrato da carteira", "Saída", "ATIVACAO · 10 GB", "24/11/2026 às 09:30", "− R$ 43,92", "Entrada", "CREDITO", "22/11/2026 às 15:00", "+ R$ 1.500,00",
      "Saída", "RECARGA · 10 GB · (41) 99999-8888", "20/11/2026 às 10:00", "As saídas, inteiras", "As entradas, inteiras");
    expect(t).not.toContain("Cliente Fictício");
    emOrdem(t, "Recargas programadas", "(41) 98888-7777", "20 GB", "renova em 01/12/2026", "R$ 69,90", "(41) 99999-8888", "renova em 10/12/2026");
    emOrdem(t, "Portabilidades", "1 portabilidade nos últimos 30 dias", ": 1 Sucesso", "(41) 98888-6666 (CLARO) → (41) 99999-7777", "Sucesso");
    emOrdem(t, "Linhas e clientes da Ora na Nogle", "Ainda não consultado");
    const links = elementos(await arvore(), "AbrirORelatorio").map((p) => (p.e as { estado: string; id?: string }).id ?? (p.e as { estado: string }).estado);
    expect(links).toEqual(["c-saidas", "c-entradas", "c-prog", "c-port", "sem_consulta", "sem_consulta"]);
    expect(elementos(await arvore(), "AtualizarEnquantoEspera")).toEqual([]);
  });

  it("as consultas pedidas daqui voltam para esta aba; enquanto uma espera a Nogle, a tela se atualiza sozinha", async () => {
    expect(elementos(await arvore(), "Pedido").map((p) => p.tipo)).toEqual(["carteira_saldo", undefined, "carteira_programadas", "relatorio_portabilidades", "lista_de_linhas", "lista_de_clientes"]);
    const html = texto(await arvore());
    expect(html.match(/voltar carteira/g)?.length).toBe(6);
    cenario.tabelas.connect_consultas = [...CONSULTAS, { ...CONSULTA, id: "c-linhas", tipo: "lista_de_linhas", parametro: "1", situacao: "na_fila", resposta: null, respondida_em: null }];
    expect(elementos(await arvore(), "AtualizarEnquantoEspera")).toHaveLength(1);
    expect(await abrir()).toContain("Consultando a Nogle…");
  });

  it("sem resposta ou com a resposta apagada (24 horas): nenhum número inventado", async () => {
    cenario.tabelas.connect_consultas = [
      { ...CONSULTAS[0], resposta: null, resposta_apagada_em: "2026-11-26T14:00:00Z" },
      { ...CONSULTA, id: "x", tipo: "carteira_extrato_saidas", parametro: "30", situacao: "falhou", resposta: null, mensagem: "A Nogle não respondeu." },
    ];
    const t = await abrir();
    emOrdem(t, "Saldo na Nogle", "—", "A resposta foi apagada (24 horas): consulte de novo", "Saídas recentes", "—", "A Nogle não respondeu: consulte de novo",
      "Entradas recentes", "—", "Ainda não consultado", "Recargas programadas", "—", "Ainda não consultado");
    expect(t).toContain("Nenhum movimento para mostrar");
  });

  it("as ativações e as recargas por vendedor e a conciliação mais recente", async () => {
    const t = await abrir({ periodo: "7" });
    emOrdem(t, "Ativações e recargas por vendedor", "Santa Cândida (fictícia)", "Vendedora (fictícia)", "1", "1", "0", "0", "R$ 20,00", "Dono (fictício)", "0", "0", "0", "1", "R$ 0,00",
      "Relatório completo (por loja, imprimir e planilha) · 2 confirmadas");
    const tela = await arvore({ periodo: "7" });
    expect(enderecos(tela)).toEqual(["/connect/relatorio?periodo=7", "/connect/conciliacao"]);
    expect((elementos(tela, "FiltroSegmentado")[0]?.opcoes as { href: string; ativo: boolean }[]).map((o) => [o.href, o.ativo]))
      .toEqual([["/connect/carteira", false], ["/connect/carteira?periodo=7", true], ["/connect/carteira?periodo=30", false]]);
    emOrdem(t, "Conciliação com os relatórios da Nogle", "nº 7 · Ativações · de 10/11/2026 a 16/11/2026", "Conferidas", "40", "Com valor diferente", "1", "Só na Nogle", "1", "Só na Ora", "1",
      "Ver a conciliação");
  });

  it("o gerente da loja e o vendedor: sem a carteira nem os relatórios da rede; o vendedor vê só as próprias", async () => {
    cenario.vinculos = [{ papel: "gerente", escopo: "unidade", unidade_id: "loja" }];
    let t = await abrir();
    expect(t).toContain("são de quem gere a Ora Connect na rede");
    for (const fora of ["Saldo na Nogle", "Extrato da carteira", "Consultar o saldo", "Conciliação com os relatórios da Nogle"]) expect(t).not.toContain(fora);
    emOrdem(t, "Ativações e recargas por vendedor", "Vendedora (fictícia)");
    cenario.permissoes = new Set(["connect.operar"]);
    cenario.vinculos = [{ papel: "vendedor", escopo: "unidade", unidade_id: "loja" }];
    t = await abrir();
    emOrdem(t, "Minhas ativações e recargas", "Dono (fictício)", "Meu relatório completo (imprimir e planilha)");
    expect(t).not.toContain("Vendedora (fictícia)");
    cenario.permissoes = new Set(["venda.registrar"]);
    expect(await abrir()).toContain("A carteira e os relatórios da Ora Connect são de quem opera ou gere a Ora Connect.");
  });

  it("os avisos de erro da consulta voltam nesta aba", async () => {
    expect(await abrir({ erro: "limite" })).toContain("Muitas consultas na última hora");
    expect(await abrir({ erro: "qualquer" })).toContain("Não foi possível pedir a consulta agora.");
  });
});

describe("a volta da ação de consultar (CONNECT-o)", () => {
  const enviar = (campos: Record<string, string>) => {
    const dados = new FormData();
    for (const [k, v] of Object.entries(campos)) dados.set(k, v);
    return consultar(dados);
  };

  it("com voltar=carteira, a aba Carteira e relatórios; com qualquer outro valor, Consultar linha (não é um endereço livre)", async () => {
    await expect(enviar({ tipo: "carteira_saldo", chave: "k1", voltar: "carteira" })).rejects.toThrow("redirecionou para /connect/carteira");
    await expect(enviar({ tipo: "carteira_programadas", parametro: "0", chave: "k2", voltar: "carteira" })).rejects.toThrow("redirecionou para /connect/carteira?erro=dias");
    cenario.erroDaRpc = { code: "OR056" };
    await expect(enviar({ tipo: "carteira_saldo", chave: "k3", voltar: "carteira" })).rejects.toThrow("redirecionou para /connect/carteira?erro=limite");
    cenario.erroDaRpc = null;
    await expect(enviar({ tipo: "carteira_saldo", chave: "k4", voltar: "https://exemplo.invalido" })).rejects.toThrow(/redirecionou para \/connect\/linha$/);
    await expect(enviar({ tipo: "carteira_saldo", chave: "k5" })).rejects.toThrow(/redirecionou para \/connect\/linha$/);
    expect(cenario.rpc.map((r) => r.argumentos.p_chave)).toEqual(["k1", "k3", "k4", "k5"]);
  });
});

// NFE55-b (a NF-e modelo 55 no fluxo interno, 27/11/2026): na tela da venda, o cadastro rápido do cliente e o completar
// para a nota no nome dele, com sessão e Supabase SIMULADOS (nenhuma credencial, dados fictícios, nada sai do teste). As
// regras de verdade estão no banco, e o caminho inteiro está em packages/banco/src/nfe-modelo-55-ponta-a-ponta.test.ts;
// aqui, o que a tela mostra e o que cada ação manda ao banco, com o interruptor ORA_NOTA_NA_VENDA desligado e ligado.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDA = "00000000-0000-4000-8000-00000000d201";
const CLIENTE = "00000000-0000-4000-8000-00000000d203";
const NOVO = "00000000-0000-4000-8000-00000000d204";
const CHAVE = "00000000-0000-4000-8000-00000000d205";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrada"); },
}));
class Consulta {
  linhas: Linha[];
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq() { return this; }
  in() { return this; }
  is() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Linha[]; error: null }) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
    cenario.chamadas.push({ nome, argumentos });
    return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
  },
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    molde: { permissoes: { has: (p: string) => Boolean(cenario.permissoes.has(p)) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
    usuario: { id: EU },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-27T23:00:00Z" },
    supabase,
  }),
}));

import { cadastrarClienteNaVenda, completarClienteEPedirNota } from "../notas/acoes";
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
const ao = (nome: string) => cenario.chamadas.filter((c) => c.nome === nome);
const ENDERECO = { endereco_cep: "82000-100", endereco_logradouro: "Rua das Notas", endereco_numero: "55", endereco_bairro: "Santa Cândida", endereco_cidade: "Curitiba", endereco_uf: "pr" };
const venda = (extra: Linha = {}) => ({
  id: VENDA, numero: 51, situacao: "concluida", unidade_id: LOJA, vendedor_id: EU, cliente_nome: "Carla Cliente", cliente_id: CLIENTE, total_centavos: 7_900, subtotal_centavos: 7_900,
  desconto_centavos: 0, troco_centavos: 0, recebido_centavos: 7_900, a_receber_centavos: 0, devolvido_centavos: 0, concluida_em: "2026-11-27T13:00:00Z", cancelada_em: null, motivo_cancelamento: null, ...extra,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.permissoes = new Set(["venda.registrar", "nota.solicitar", "cliente.buscar", "cliente.cadastrar"]);
  cenario.tabelas = { vendas: [venda()], venda_itens: [], notas_pedidos: [], unidades: [{ id: LOJA, nome: "Santa Cândida (teste)", cnpj: null }], perfis_usuario: [{ id: EU, nome: "Vendedora Teste" }] };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("desligado por padrão: a tela e as ações ficam como antes", () => {
  it("sem ORA_NOTA_NA_VENDA, a nota recusada leva à ficha do cliente, não há cadastro rápido e as ações não gravam nada", async () => {
    vi.stubEnv("ORA_NOTA_NA_VENDA", "");
    const t = await tela({ erro_nota: "cliente_sem_documento" });
    expect(t).toContain("Completar o cadastro do cliente");
    expect(t).not.toContain("Completar o cliente para a nota no nome dele");
    expect(ao("cliente_ficha")).toHaveLength(0);
    cenario.tabelas.vendas = [venda({ cliente_id: null, cliente_nome: null })];
    const semCliente = await tela();
    expect(semCliente).toContain("Ligar a venda a um cliente da rede");
    expect(semCliente).not.toContain("Cadastre aqui mesmo");
    expect(await destinoDe(cadastrarClienteNaVenda(formulario({ venda: VENDA, tipo: "pessoa_fisica", nome: "Joana Nota Teste", telefone: "41987650955" }))))
      .toBe(`/vendas/${VENDA}?erro_nota=na_venda_desligada`);
    expect(await destinoDe(completarClienteEPedirNota(formulario({ venda: VENDA, cliente: CLIENTE, documento: "529.982.247-25" }))))
      .toBe(`/vendas/${VENDA}?erro_nota=na_venda_desligada`);
    expect(cenario.chamadas.filter((c) => ["cliente_salvar", "venda_vincular_cliente", "notas_solicitar"].includes(c.nome))).toEqual([]);
  });
});

describe("ligado: o cadastro rápido na venda sem cliente (nome completo + WhatsApp)", () => {
  beforeEach(() => { vi.stubEnv("ORA_NOTA_NA_VENDA", "1"); cenario.tabelas.vendas = [venda({ cliente_id: null, cliente_nome: null })]; });

  it("a tela oferece o cadastro ali mesmo, sem CPF; com o telefone de outro cadastro, pede a confirmação; sem permissão de cadastrar, não aparece", async () => {
    const t = await tela();
    for (const trecho of ["Ligar ou cadastrar o cliente da venda", "Não achou? Cadastre aqui mesmo", "Nome completo (ou a razão social da empresa)", "WhatsApp com DDD", "Cadastrar e ligar à venda"]) expect(t).toContain(trecho);
    expect(t).not.toContain("CPF ou CNPJ do cliente");
    const repetido = await tela({ erro_cliente: "telefone_repetido" });
    expect(repetido).toContain("Este telefone já está no cadastro de outro cliente");
    expect(repetido).toContain("O número é de outra pessoa já cadastrada");
    cenario.permissoes.delete("cliente.cadastrar");
    expect(await tela()).not.toContain("Cadastre aqui mesmo");
  });

  it("grava o cliente com a chave do formulário e liga à venda; o nome sem sobrenome e a falta do WhatsApp nem chegam ao banco", async () => {
    expect(await destinoDe(cadastrarClienteNaVenda(formulario({ venda: VENDA, tipo: "pessoa_fisica", nome: "Joana", telefone: "41987650955" })))).toBe(`/vendas/${VENDA}?erro_cliente=nome_completo`);
    expect(await destinoDe(cadastrarClienteNaVenda(formulario({ venda: VENDA, tipo: "pessoa_fisica", nome: "Joana Nota Teste" })))).toBe(`/vendas/${VENDA}?erro_cliente=whatsapp`);
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas = { cliente_salvar: { data: { id: NOVO, numero: 9, repetida: false, alterado: true }, error: null }, venda_vincular_cliente: { data: true, error: null } };
    expect(await destinoDe(cadastrarClienteNaVenda(formulario({ venda: VENDA, chave: CHAVE, tipo: "pessoa_fisica", nome: "Joana Nota Teste", telefone: "(41) 98765-0955" }))))
      .toBe(`/vendas/${VENDA}?cliente=1`);
    expect(cenario.chamadas).toEqual([
      { nome: "cliente_salvar", argumentos: { p_cliente: null, p_dados: { tipo: "pessoa_fisica", nome: "Joana Nota Teste", telefone: "41987650955", finalidades: [] }, p_motivo: null, p_chave: `form:${CHAVE}` } },
      { nome: "venda_vincular_cliente", argumentos: { p_venda: VENDA, p_cliente: NOVO, p_motivo: "Cliente cadastrado no comprovante da venda (cadastro rápido)" } },
    ]);
  });

  it("o erro do banco volta como código: telefone de outro cadastro, venda que não aceita cliente", async () => {
    cenario.respostas = { cliente_salvar: { data: null, error: { code: "OR027", message: "Telefone já cadastrado" } } };
    expect(await destinoDe(cadastrarClienteNaVenda(formulario({ venda: VENDA, tipo: "pessoa_fisica", nome: "Joana Nota Teste", telefone: "41987650955" })))).toBe(`/vendas/${VENDA}?erro_cliente=telefone_repetido`);
    cenario.respostas = { cliente_salvar: { data: { id: NOVO }, error: null }, venda_vincular_cliente: { data: null, error: { code: "22023", message: "Só se liga cliente a venda concluída" } } };
    expect(await destinoDe(cadastrarClienteNaVenda(formulario({ venda: VENDA, tipo: "pessoa_fisica", nome: "Joana Nota Teste", telefone: "41987650955" })))).toBe(`/vendas/${VENDA}?erro=dados`);
  });
});

describe("ligado: a nota no nome do cliente pede o CPF/CNPJ ou o endereço, e a tela completa ali mesmo", () => {
  beforeEach(() => { vi.stubEnv("ORA_NOTA_NA_VENDA", "1"); });

  it("sem o documento: pede o CPF e, se a ficha diz que não há endereço, o endereço; com o endereço guardado, só o CPF", async () => {
    cenario.respostas = { cliente_ficha: { data: { id: CLIENTE, finalidades: [], endereco_informado: false }, error: null } };
    const t = await tela({ erro_nota: "cliente_sem_documento" });
    for (const trecho of ["Complete abaixo, no bloco “Nota fiscal”", "Completar o cliente para a nota no nome dele", "CPF ou CNPJ do cliente", "CEP", "Rua", "Bairro", "UF", "Completar e pedir a nota", "Pedir nota fiscal"]) expect(t).toContain(trecho);
    expect(ao("cliente_ficha")).toEqual([{ nome: "cliente_ficha", argumentos: { p_cliente: CLIENTE } }]);
    cenario.respostas = { cliente_ficha: { data: { id: CLIENTE, finalidades: ["entrega"], endereco_informado: true }, error: null } };
    const comEndereco = await tela({ erro_nota: "cliente_sem_documento" });
    expect(comEndereco).toContain("CPF ou CNPJ do cliente");
    expect(comEndereco).not.toContain("CEP");
  });

  it("sem o endereço: só o endereço, sem ler a ficha; sem permissão de cadastrar ou com a nota já pedida, nada de formulário", async () => {
    const t = await tela({ erro_nota: "cliente_sem_endereco" });
    expect(t).toContain("CEP");
    expect(t).not.toContain("CPF ou CNPJ do cliente");
    expect(ao("cliente_ficha")).toHaveLength(0);
    cenario.permissoes.delete("cliente.cadastrar");
    expect(await tela({ erro_nota: "cliente_sem_endereco" })).not.toContain("Completar o cliente para a nota no nome dele");
    cenario.permissoes.add("cliente.cadastrar");
    cenario.tabelas.notas_pedidos = [{ id: "p", venda_id: VENDA, tipo: "venda", situacao: "aguardando_aprovacao", solicitado_por: EU, destinatario_nome: null, destinatario_mascarado: null, observacao: null, chave_acesso: null, modelo: null, serie: null, numero_documento: null, cliente_id: CLIENTE }];
    expect(await tela({ erro_nota: "cliente_sem_endereco" })).not.toContain("Completar o cliente para a nota no nome dele");
  });

  it("completa o MESMO cadastro com as finalidades que ele tinha mais a nota fiscal, e pede a nota no nome dele", async () => {
    cenario.respostas = {
      cliente_ficha: { data: { id: CLIENTE, finalidades: ["assistencia"], endereco_informado: false }, error: null },
      cliente_salvar: { data: { id: CLIENTE, alterado: true }, error: null },
      notas_solicitar: { data: "pedido", error: null },
    };
    expect(await destinoDe(completarClienteEPedirNota(formulario({ venda: VENDA, cliente: CLIENTE, numero: "51", falta: "cliente_sem_documento", chave: CHAVE, documento: "529.982.247-25", ...ENDERECO }))))
      .toBe(`/vendas/${VENDA}?nota=pedida`);
    expect(cenario.chamadas).toEqual([
      { nome: "cliente_ficha", argumentos: { p_cliente: CLIENTE } },
      { nome: "cliente_salvar", argumentos: {
        p_cliente: CLIENTE, p_motivo: "Dados para a nota fiscal da venda nº 51, pedidos no comprovante", p_chave: null,
        p_dados: { documento: "52998224725", endereco: { cep: "82000100", logradouro: "Rua das Notas", numero: "55", bairro: "Santa Cândida", cidade: "Curitiba", uf: "PR" }, finalidades: ["assistencia", "nota_fiscal"] },
      } },
      { nome: "notas_solicitar", argumentos: { p_venda: VENDA, p_destinatario: { cliente: CLIENTE }, p_chave: CHAVE } },
    ]);
  });

  it("com erro, volta com o formulário aberto e o motivo; o CPF digitado nunca vai na URL", async () => {
    const voltou = (erro: string) => `/vendas/${VENDA}?erro_nota=cliente_sem_endereco&erro_cliente=${erro}`;
    const base = { venda: VENDA, cliente: CLIENTE, numero: "51", falta: "cliente_sem_endereco", chave: CHAVE };
    expect(await destinoDe(completarClienteEPedirNota(formulario({ ...base })))).toBe(voltou("dados"));
    expect(await destinoDe(completarClienteEPedirNota(formulario({ ...base, ...ENDERECO, endereco_uf: "XX" })))).toBe(voltou("endereco"));
    expect(await destinoDe(completarClienteEPedirNota(formulario({ ...base, falta: "outra", documento: "111.111.111-11" }))))
      .toBe(`/vendas/${VENDA}?erro_nota=cliente_sem_documento&erro_cliente=documento`);
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas = { cliente_ficha: { data: { finalidades: "nota_fiscal" }, error: null } };
    expect(await destinoDe(completarClienteEPedirNota(formulario({ ...base, ...ENDERECO })))).toBe(voltou("falha"));
    cenario.respostas = {
      cliente_ficha: { data: { finalidades: [] }, error: null },
      cliente_salvar: { data: null, error: { code: "22023", message: "Nota fiscal no nome do cliente pede o CPF ou o CNPJ e o endereço completo" } },
    };
    const destino = await destinoDe(completarClienteEPedirNota(formulario({ ...base, ...ENDERECO, documento: "529.982.247-25" })));
    expect(destino).toBe(voltou("finalidade"));
    expect(destino).not.toMatch(/529|52998224725|Rua/);
    cenario.respostas = {
      cliente_ficha: { data: { finalidades: ["nota_fiscal"] }, error: null },
      cliente_salvar: { data: { id: CLIENTE, alterado: false }, error: null },
      notas_solicitar: { data: null, error: { code: "OR014", message: "Esta venda já tem pedido de nota em aberto ou nota emitida" } },
    };
    expect(await destinoDe(completarClienteEPedirNota(formulario({ ...base, ...ENDERECO })))).toBe(`/vendas/${VENDA}?erro_nota=ja_pedida`);
  });
});

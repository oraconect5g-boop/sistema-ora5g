// Clientes (L5a) com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede, dados fictícios.
// Confere quem vê o quê, o que as ações mandam ao banco (nada de CPF no endereço) e como os erros voltam.
// As regras do banco estão provadas em packages/banco/src/clientes.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const DONO = "00000000-0000-4000-8000-0000000000ad";
const CLIENTE = "00000000-0000-4000-9000-000000000090";
const VENDA = "00000000-0000-4000-9000-000000000091";
const CPF = "52998224725";

const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrado"); },
}));

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Record<string, unknown>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  usuario: { id: DONO },
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
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { concluirVenda } from "../vender/acoes";
import FichaDoCliente from "./[id]/page";
import { buscarClientes, registrarConsentimento, revelarDado, salvarCliente, vincularClienteNaVenda } from "./acoes";
import NovoCliente from "./novo/page";
import Clientes from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const limpar = (v: unknown) => texto(v).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const ficha = (mudancas: Record<string, unknown> = {}) => ({
  id: CLIENTE, numero: 42, nome: "Maria Teste", tipo: "pessoa_fisica", situacao: "ativo", finalidades: ["nota_fiscal"], documento: "•••.•••.247-25",
  telefone: "(41) •••••-0001", email: "m•••@exemplo.com", nascimento_informado: false, endereco_informado: false, origem: "loja",
  criado_em: "2026-11-01T13:00:00Z", loja_de_origem: "Santa Cândida", compras: { total: 2, ultima: "2026-11-10T15:00:00Z" },
  consentimentos: [{ canal: "whatsapp", finalidade: "ofertas", situacao: "concedido", fonte: "loja", registrado_em: "2026-11-05T13:00:00Z" }], ...mudancas,
});

beforeEach(() => {
  cenario.permissoes = new Set();
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.tabelas = {
    clientes: [{ id: CLIENTE, numero: 42, nome: "Maria Teste", documento_mascara: "•••.•••.247-25", telefone_mascara: "(41) •••••-0001", situacao: "ativo", criado_em: "2026-11-01T13:00:00Z" }],
    vendas: [{ id: VENDA, numero: 77, concluida_em: "2026-11-10T15:00:00Z", total_centavos: "7900", situacao: "concluida", cliente_id: CLIENTE }],
    auditoria: [{ id: 1, ocorrido_em: "2026-11-11T12:00:00Z", acao: "cliente.revelado", usuario_id: DONO, depois: { campo: "documento" }, alvo_tipo: "cliente", alvo_id: CLIENTE }],
    perfis_usuario: [{ id: DONO, nome: "Dono Teste" }],
  };
});

describe("/clientes", () => {
  it("sem cliente.buscar (administrador): aviso e nada mais", async () => {
    expect(limpar(await Clientes() as ReactElement)).toContain("Seu papel não consulta clientes");
  });

  it("vendedor: busca exata e cadastro; a lista da rede não aparece (T11)", async () => {
    cenario.permissoes = new Set(["cliente.buscar", "cliente.cadastrar"]);
    const t = limpar(await Clientes() as ReactElement);
    for (const trecho of ["Buscar cliente", "Novo cliente", "Cada consulta fica registrada"]) expect(t).toContain(trecho);
    expect(t).not.toContain("Cadastrados por último");
    expect(t).not.toContain("Maria Teste");
  });

  it("dono: também a lista da rede, com máscaras", async () => {
    cenario.permissoes = new Set(["cliente.buscar", "cliente.cadastrar", "cliente.exportar"]);
    const t = limpar(await Clientes() as ReactElement);
    for (const trecho of ["Cadastrados por último", "Maria Teste", "nº 42 · •••.•••.247-25 · (41) •••••-0001"]) expect(t).toContain(trecho);
  });

  it("novo: só quem cadastra vê o formulário", async () => {
    expect(limpar(await NovoCliente() as ReactElement)).toContain("Seu papel não cadastra clientes");
    cenario.permissoes = new Set(["cliente.cadastrar"]);
    expect(limpar(await NovoCliente() as ReactElement)).toContain("Dados do cliente");
  });
});

describe("/clientes/[id]", () => {
  const abrir = (busca: Record<string, string> = {}) => FichaDoCliente({ params: Promise.resolve({ id: CLIENTE }), searchParams: Promise.resolve(busca) });

  it("ficha com máscaras, finalidades, compras visíveis, consentimento e quem consultou", async () => {
    cenario.permissoes = new Set(["cliente.buscar", "cliente.cadastrar", "auditoria.ver"]);
    cenario.respostas.cliente_ficha = { data: ficha(), error: null };
    const t = limpar(await abrir({ ok: "criado" }) as ReactElement);
    for (const trecho of ["Maria Teste", "nº 42", "Cliente cadastrado.", "•••.•••.247-25", "nota fiscal no nome do cliente", "2 compra(s) concluída(s) na rede",
      "Venda nº 77", "R$ 79,00", "Ofertas e campanhas por WhatsApp", "concedido", "Registrar", "Corrigir cadastro", "Quem consultou", "Dono Teste viu CPF/CNPJ"]) {
      expect(t).toContain(trecho);
    }
    expect(t).not.toContain(CPF);
    expect(cenario.chamadas).toEqual([{ nome: "cliente_ficha", argumentos: { p_cliente: CLIENTE } }]);
  });

  it("sem auditoria.ver não mostra quem consultou; sem cadastrar não corrige; cliente de outra rede: 404", async () => {
    cenario.permissoes = new Set(["cliente.buscar"]);
    cenario.respostas.cliente_ficha = { data: ficha(), error: null };
    const t = limpar(await abrir() as ReactElement);
    expect(t).not.toContain("Quem consultou");
    expect(t).not.toContain("Corrigir cadastro");
    expect(t).not.toContain("Registrar");
    cenario.respostas.cliente_ficha = { data: null, error: { code: "P0002" } };
    await expect(abrir()).rejects.toThrow("não encontrado");
    await expect(FichaDoCliente({ params: Promise.resolve({ id: "abc" }), searchParams: Promise.resolve({}) })).rejects.toThrow("não encontrado");
  });
});

describe("ações de clientes", () => {
  it("busca: valor incompleto não vai ao banco; o válido vai normalizado; o limite volta como aviso", async () => {
    expect(await buscarClientes("documento", "529.982")).toEqual({ situacao: "erro", clientes: [], erro: "busca" });
    expect(await buscarClientes("email", "a@b.c")).toEqual({ situacao: "erro", clientes: [], erro: "busca" });
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.cliente_buscar = { data: { situacao: "ok", clientes: [{ id: CLIENTE, numero: 42, nome: "Maria Teste" }] }, error: null };
    expect((await buscarClientes("documento", "529.982.247-25")).clientes).toHaveLength(1);
    expect(cenario.chamadas[0]).toEqual({ nome: "cliente_buscar", argumentos: { p_criterio: "documento", p_valor: CPF } });
    cenario.respostas.cliente_buscar = { data: { situacao: "limite", clientes: [] }, error: null };
    expect(await buscarClientes("telefone", "(41) 98765-0001")).toEqual({ situacao: "limite", clientes: [], erro: "limite" });
    cenario.respostas.cliente_buscar = { data: null, error: { code: "42501" } };
    expect(await buscarClientes("codigo", "42")).toMatchObject({ situacao: "erro", erro: "permissao" });
  });

  it("revelar: um campo conhecido de um cliente válido; o erro do banco vira mensagem", async () => {
    expect(await revelarDado("abc", "documento")).toEqual({ ok: false, erro: "dados" });
    expect(await revelarDado(CLIENTE, "senha")).toEqual({ ok: false, erro: "dados" });
    cenario.respostas.cliente_revelar = { data: { campo: "documento", valor: CPF }, error: null };
    expect(await revelarDado(CLIENTE, "documento")).toEqual({ ok: true, campo: "documento", valor: CPF });
    cenario.respostas.cliente_revelar = { data: null, error: { code: "OR028" } };
    expect(await revelarDado(CLIENTE, "telefone")).toEqual({ ok: false, erro: "limite" });
  });

  it("cadastro: erro devolve o que foi digitado; sucesso vai para a ficha; correção exige motivo", async () => {
    const vazio = { erro: null, valores: {} };
    const semIdentificador = await salvarCliente(vazio, formulario({ tipo: "pessoa_fisica", nome: "Maria", chave: "form:00000000-0000-4000-8000-000000000001" }));
    expect(semIdentificador).toEqual({ erro: "identificador", valores: { tipo: "pessoa_fisica", nome: "Maria" } });
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.cliente_salvar = { data: null, error: { code: "OR026" } };
    const duplicado = await salvarCliente(vazio, formulario({ tipo: "pessoa_fisica", nome: "Maria", documento: "529.982.247-25", finalidade: "nota_fiscal" }));
    expect(duplicado).toEqual({ erro: "duplicado", valores: { tipo: "pessoa_fisica", nome: "Maria", documento: "529.982.247-25", finalidade: ["nota_fiscal"] } });
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_cliente: null, p_motivo: null, p_dados: { tipo: "pessoa_fisica", nome: "Maria", documento: CPF, finalidades: ["nota_fiscal"] } });
    expect(String(cenario.chamadas[0]?.argumentos.p_chave)).toMatch(/^form:[0-9a-f-]{36}$/);

    cenario.respostas.cliente_salvar = { data: { id: CLIENTE, numero: 42, alterado: true }, error: null };
    expect(await destinoDe(salvarCliente(vazio, formulario({ tipo: "pessoa_fisica", nome: "Maria", telefone: "41987650001" })))).toBe(`/clientes/${CLIENTE}?ok=criado`);
    expect(await salvarCliente(vazio, formulario({ cliente: CLIENTE, telefone: "41987650009", motivo: "x" }))).toMatchObject({ erro: "motivo" });
    expect(await destinoDe(salvarCliente(vazio, formulario({ cliente: CLIENTE, telefone: "41987650009", motivo: "Cliente trocou de número" })))).toBe(`/clientes/${CLIENTE}?ok=alterado`);
    expect(cenario.chamadas.at(-1)?.argumentos).toEqual({ p_cliente: CLIENTE, p_dados: { telefone: "41987650009" }, p_motivo: "Cliente trocou de número", p_chave: null });
  });

  it("consentimento: valores do catálogo; repetido avisa; contato ausente volta com erro", async () => {
    expect(await destinoDe(registrarConsentimento(formulario({ cliente: CLIENTE, canal: "pombo", finalidade_contato: "ofertas", fonte: "loja", decisao: "concedido" }))))
      .toBe(`/clientes/${CLIENTE}?erro=dados`);
    cenario.respostas.cliente_consentir = { data: true, error: null };
    expect(await destinoDe(registrarConsentimento(formulario({ cliente: CLIENTE, canal: "whatsapp", finalidade_contato: "ofertas", fonte: "loja", decisao: "retirado" }))))
      .toBe(`/clientes/${CLIENTE}?ok=consentimento`);
    expect(cenario.chamadas[0]?.argumentos).toEqual({ p_cliente: CLIENTE, p_canal: "whatsapp", p_finalidade: "ofertas", p_concedido: false, p_fonte: "loja" });
    cenario.respostas.cliente_consentir = { data: null, error: { code: "22023", message: "Cadastre o contato deste canal antes de registrar o consentimento" } };
    expect(await destinoDe(registrarConsentimento(formulario({ cliente: CLIENTE, canal: "email", finalidade_contato: "pos_venda", fonte: "loja", decisao: "concedido" }))))
      .toBe(`/clientes/${CLIENTE}?erro=consentimento`);
  });

  it("venda: ligar exige cliente e motivo; tirar manda nulo; a conclusão leva o cliente escolhido", async () => {
    expect(await destinoDe(vincularClienteNaVenda(formulario({ venda: VENDA, motivo: "Esqueceu o CPF" })))).toBe(`/vendas/${VENDA}?erro=cliente`);
    expect(await destinoDe(vincularClienteNaVenda(formulario({ venda: VENDA, cliente_id: CLIENTE, motivo: "x" })))).toBe(`/vendas/${VENDA}?erro=motivo`);
    expect(await destinoDe(vincularClienteNaVenda(formulario({ venda: VENDA, cliente_id: CLIENTE, motivo: "Esqueceu o CPF" })))).toBe(`/vendas/${VENDA}?cliente=1`);
    expect(await destinoDe(vincularClienteNaVenda(formulario({ venda: VENDA, tirar: "sim", motivo: "Pediu para tirar" })))).toBe(`/vendas/${VENDA}?cliente=1`);
    expect(cenario.chamadas.map((c) => c.argumentos)).toEqual([
      { p_venda: VENDA, p_cliente: CLIENTE, p_motivo: "Esqueceu o CPF" }, { p_venda: VENDA, p_cliente: null, p_motivo: "Pediu para tirar" },
    ]);

    cenario.chamadas = [];
    cenario.respostas.concluir_venda = { data: { venda: VENDA }, error: null };
    expect(await destinoDe(concluirVenda(formulario({ venda: VENDA, chave: "00000000-0000-4000-8000-000000000002", pagamento_1_meio: "dinheiro", pagamento_1_valor: "79,00",
      cliente_id: CLIENTE, cliente_nome: "Maria (digitado)" })))).toBe(`/vendas/${VENDA}?concluida=1`);
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_cliente: { id: CLIENTE, nome: "Maria (digitado)" } });
    cenario.respostas.concluir_venda = { data: null, error: { code: "22023", message: "Cliente não encontrado nesta rede" } };
    expect(await destinoDe(concluirVenda(formulario({ venda: VENDA, pagamento_1_meio: "dinheiro", pagamento_1_valor: "79,00", cliente_id: CLIENTE })))).toBe("/vender?erro=cliente");
  });
});

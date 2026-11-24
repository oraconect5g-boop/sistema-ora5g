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
  /** Erro de leitura por tabela (L5e: falha e tabela ausente nos blocos da ficha). */
  erros: {} as Record<string, { code: string }>,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrado"); },
}));

class Consulta {
  linhas: Record<string, unknown>[];
  erro: { code: string } | null;
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; this.erro = cenario.erros[nome] ?? null; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  in() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Record<string, unknown>[] | null; error: { code: string } | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
  get molde() { return { permissoes: { has: (p: string) => Boolean(cenario.permissoes.has(p)) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
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
import { buscarClientes, marcarDiferentes, mesclarClientes, registrarConsentimento, revelarDado, salvarCliente, vincularClienteNaVenda } from "./acoes";
import Duplicados from "./duplicados/page";
import NovoCliente from "./novo/page";
import Clientes from "./page";
import Segmentos from "./segmentos/page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  // L5e: os blocos do histórico da ficha são montados à parte; o teste os executa para ler o que a tela mostra.
  if (isValidElement<Record<string, unknown>>(v) && typeof v.type === "function" && v.type.name === "HistoricoDaFicha") {
    return texto((v.type as (p: unknown) => unknown)(v.props));
  }
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
  cenario.erros = {};
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

  it("CRM-009a: a compra que nasceu de um pedido do site diz de onde veio; a falha dessa leitura aparece; sem a tabela, a lista segue", async () => {
    cenario.permissoes = new Set(["cliente.buscar"]);
    cenario.respostas.cliente_ficha = { data: ficha(), error: null };
    const PEDIDO = "00000000-0000-4000-8000-00000000b001";
    cenario.tabelas.loja_reservas = [
      { venda_id: VENDA, numero: 11, codigo: "UNI234", criada_em: "2026-11-08T12:00:01Z", origem: "instagram", pedido_id: PEDIDO, situacao: "atendida" },
      { venda_id: VENDA, numero: 12, codigo: "UNI235", criada_em: "2026-11-08T12:00:01Z", origem: "instagram", pedido_id: PEDIDO, situacao: "atendida" },
    ];
    cenario.tabelas.loja_pedidos = [{ id: PEDIDO, codigo: "ABC234", criado_em: "2026-11-08T12:00:00Z", venda_id: VENDA }];
    const comPedido = limpar(await abrir() as ReactElement);
    // A venda continua sendo do balcão (não vira "loja online"): a linha ganha o pedido do site e a data em que foi feito.
    expect(comPedido).toContain("Venda nº 77");
    expect(comPedido).toContain("· pedido do site ABC234, de 08/11/2026");
    expect(comPedido).not.toContain("loja online");
    // A reserva avulsa, com o código dela.
    cenario.tabelas.loja_reservas = [{ venda_id: VENDA, numero: 13, codigo: "RSV777", criada_em: "2026-11-09T18:30:00Z", origem: null, pedido_id: null, situacao: "atendida" }];
    cenario.tabelas.loja_pedidos = [];
    expect(limpar(await abrir() as ReactElement)).toContain("· reserva do site RSV777, de 09/11/2026");
    // Sem reserva nenhuma, nada é dito; a falha da leitura é dita; num banco sem a tabela, a lista segue calada.
    cenario.tabelas.loja_reservas = [];
    const semSite = limpar(await abrir() as ReactElement);
    expect(semSite).toContain("Venda nº 77");
    expect(semSite).not.toContain("do site");
    cenario.erros = { loja_reservas: { code: "57014" } };
    const falha = limpar(await abrir() as ReactElement);
    expect(falha).toContain("Venda nº 77");
    expect(falha).toContain("Não deu para ler agora quais destas compras vieram de um pedido do site.");
    cenario.erros = { loja_reservas: { code: "42P01" } };
    expect(limpar(await abrir() as ReactElement)).not.toContain("vieram de um pedido do site");
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

  // L5e (CRM-002): a ficha 360, lida pelo RLS de quem abre (aqui, o que o banco simulado devolve).
  it("mostra as OS, o funil e a agenda e o Ora Connect das compras; a linha só com o DDD e os quatro últimos dígitos", async () => {
    cenario.permissoes = new Set(["cliente.buscar"]);
    cenario.respostas.cliente_ficha = { data: ficha(), error: null };
    Object.assign(cenario.tabelas, {
      ordens_servico: [{ id: "00000000-0000-4000-9000-0000000000a1", numero: 12, aparelho: "Galaxy A15", situacao: "aberta", servico: "aguardando_orcamento", aberta_em: "2026-11-12T13:00:00Z", encerrada_em: null, prazo: null, cliente_id: CLIENTE },
        { id: "00000000-0000-4000-9000-0000000000a2", numero: 9, aparelho: "Moto G", situacao: "entregue", servico: "concluido", aberta_em: "2026-11-02T13:00:00Z", encerrada_em: "2026-11-05T13:00:00Z", prazo: null, cliente_id: CLIENTE }],
      oportunidades: [{ id: "00000000-0000-4000-9000-0000000000b1", numero: 3, etapa: "proposta", interesse: "iPhone 15", proximo_passo: "Ligar com a proposta", proximo_passo_em: "2026-11-16T15:00:00Z", encerrado_em: null, criado_em: "2026-11-10T13:00:00Z", cliente_id: CLIENTE }],
      atividades: [{ id: "00000000-0000-4000-9000-0000000000c1", tipo: "ligacao", descricao: "Retornar sobre o iPhone", situacao: "aberta", vence_em: "2026-11-16T15:00:00Z", encerrada_em: null, cliente_id: CLIENTE }],
      venda_itens: [{ id: "00000000-0000-4000-9000-0000000000d1", venda_id: VENDA }],
      connect_operacoes: [{ id: "00000000-0000-4000-9000-0000000000e1", numero: 5, tipo: "ativacao", situacao: "confirmada", criado_em: "2026-11-10T15:10:00Z", linha: null, numero_ativado: "41999991234", plano_nome: "Ora 20GB" }],
    });
    const t = limpar(await abrir() as ReactElement);
    for (const trecho of ["Assistência", "OS nº 12", "Galaxy A15", "Aguardando orçamento", "OS nº 9", "Entregue e cobrada", "Funil e agenda", "iPhone 15", "Proposta",
      "Próximo passo: Ligar com a proposta", "Ligação", "Retornar sobre o iPhone", "a fazer", "Ora Connect", "Ativação de chip", "nº 5", "linha (41) •••••-1234", "Ora 20GB", "Confirmada"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(t).not.toContain("41999991234");
  });

  it("falha de leitura aparece como falha; tabela que o banco não tem esconde o bloco; sem nada, só a assistência para quem abre OS", async () => {
    cenario.respostas.cliente_ficha = { data: ficha(), error: null };
    cenario.permissoes = new Set(["cliente.buscar"]);
    let t = limpar(await abrir() as ReactElement);
    for (const bloco of ["Assistência", "Funil e agenda", "Ora Connect"]) expect(t, bloco).not.toContain(bloco);
    cenario.permissoes = new Set(["cliente.buscar", "os.abrir"]);
    t = limpar(await abrir() as ReactElement);
    expect(t).toContain("Nenhuma ordem de serviço deste cliente.");
    cenario.erros = { ordens_servico: { code: "57014" }, oportunidades: { code: "PGRST205" }, atividades: { code: "PGRST205" }, connect_operacoes: { code: "57014" } };
    cenario.tabelas.venda_itens = [{ id: "00000000-0000-4000-9000-0000000000d1", venda_id: VENDA }];
    t = limpar(await abrir() as ReactElement);
    expect(t).toContain("Não deu para ler as ordens de serviço agora");
    expect(t).not.toContain("Funil e agenda");
    expect(t).toContain("Não deu para ler as operações do Ora Connect agora");
    expect(t).not.toContain("Nenhuma ordem de serviço");
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
    // #76: sem WhatsApp não vai ao banco, e o que foi digitado volta.
    const semWhatsApp = await salvarCliente(vazio, formulario({ tipo: "pessoa_fisica", nome: "Maria Teste", chave: "form:00000000-0000-4000-8000-000000000001" }));
    expect(semWhatsApp).toEqual({ erro: "whatsapp", valores: { tipo: "pessoa_fisica", nome: "Maria Teste" } });
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.cliente_salvar = { data: null, error: { code: "OR026" } };
    const duplicado = await salvarCliente(vazio, formulario({ tipo: "pessoa_fisica", nome: "Maria Teste", documento: "529.982.247-25", telefone: "41987650001" }));
    expect(duplicado).toEqual({ erro: "duplicado", valores: { tipo: "pessoa_fisica", nome: "Maria Teste", documento: "529.982.247-25", telefone: "41987650001" } });
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_cliente: null, p_motivo: null, p_dados: { tipo: "pessoa_fisica", nome: "Maria Teste", documento: CPF, telefone: "41987650001", finalidades: [] } });
    expect(String(cenario.chamadas[0]?.argumentos.p_chave)).toMatch(/^form:[0-9a-f-]{36}$/);

    cenario.respostas.cliente_salvar = { data: { id: CLIENTE, numero: 42, alterado: true }, error: null };
    expect(await destinoDe(salvarCliente(vazio, formulario({ tipo: "pessoa_fisica", nome: "Maria Teste", telefone: "41987650001" })))).toBe(`/clientes/${CLIENTE}?ok=criado`);
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

describe("mesclagem e segmentos (L5c)", () => {
  const OUTRO = "00000000-0000-4000-9000-000000000099";
  const lado = (id: string, nome: string, numero: number) => ({ id, numero, nome, documento: null, telefone: "(41) •••••-0001", compras: 1, criado_em: "2026-11-01T13:00:00Z" });

  it("ficha: segmento com a explicação; cadastro mesclado aponta para o que ficou e não se corrige", async () => {
    cenario.permissoes = new Set(["cliente.buscar", "cliente.cadastrar"]);
    cenario.respostas.cliente_ficha = { data: ficha({ segmento: { codigo: "recorrente", explicacao: "2 compra(s) em 12 meses, 2 no total; última há 3 dia(s)" } }), error: null };
    const t = limpar(await FichaDoCliente({ params: Promise.resolve({ id: CLIENTE }), searchParams: Promise.resolve({}) }) as ReactElement);
    expect(t).toContain("Recorrente");
    expect(t).toContain("Segmento recorrente: 2 compra(s) em 12 meses, 2 no total; última há 3 dia(s).");
    cenario.respostas.cliente_ficha = { data: ficha({ situacao: "mesclado", mesclado_em: { id: OUTRO, numero: 7, nome: "Maria Teste" } }), error: null };
    const m = limpar(await FichaDoCliente({ params: Promise.resolve({ id: CLIENTE }), searchParams: Promise.resolve({}) }) as ReactElement);
    expect(m).toContain("Este cadastro foi mesclado no cliente");
    expect(m).toContain("(nº 7)");
    expect(m).not.toContain("Corrigir cadastro");
    expect(m).not.toContain("Registrar");
  });

  it("lista de clientes mostra os atalhos do dono; duplicados e segmentos só para quem pode", async () => {
    cenario.permissoes = new Set(["cliente.buscar", "cliente.exportar", "cliente.mesclar"]);
    const t = limpar(await Clientes() as ReactElement);
    expect(t).toContain("Segmentos");
    expect(t).toContain("Duplicados");
    cenario.permissoes = new Set(["cliente.buscar"]);
    expect(limpar(await Duplicados({ searchParams: Promise.resolve({}) }) as ReactElement)).toContain("Mesclar cadastros é do dono");
    expect(limpar(await Segmentos() as ReactElement)).toContain("Os segmentos da rede são do dono");
  });

  it("duplicados: cada par com o motivo, mesclar escolhendo quem fica e marcar como diferentes", async () => {
    cenario.permissoes = new Set(["cliente.mesclar"]);
    cenario.respostas.clientes_duplicados = { data: [{ motivo: "mesmo telefone", a: lado(CLIENTE, "Maria Teste", 42), b: lado(OUTRO, "Maria T.", 43) }], error: null };
    const t = limpar(await Duplicados({ searchParams: Promise.resolve({ ok: "diferentes" }) }) as ReactElement);
    for (const trecho of ["Maria Teste × Maria T.", "mesmo telefone", "nº 42", "1 compra(s)", "Qual cadastro fica?", "Mesclar", "Marcar como diferentes", "sai da lista"]) expect(t).toContain(trecho);
  });

  it("segmentos: totais, alto valor, ofertas por canal e a regra de cada segmento", async () => {
    cenario.permissoes = new Set(["cliente.exportar"]);
    cenario.respostas.clientes_segmentos = { data: { corte_alto_valor: 15_800, segmentos: [
      { segmento: "recorrente", clientes: 3, alto_valor: 1, liquido_12m: 47_400, aceitam_ofertas: { whatsapp: 2, sms: 0, email: 1, ligacao: 0 } },
      { segmento: "sem_compra", clientes: 5, alto_valor: 0, liquido_12m: 0, aceitam_ofertas: { whatsapp: 0, sms: 0, email: 0, ligacao: 0 } },
    ] }, error: null };
    const t = limpar(await Segmentos() as ReactElement);
    for (const trecho of ["8 cliente(s) ativo(s)", "R$ 158,00", "Recorrente", "R$ 474,00", "Sem compra", "a última compra foi há mais de 1 ano"]) expect(t).toContain(trecho);
  });

  it("ações: mesclar descobre quem sai pelo par; motivo obrigatório; OR029 vira mensagem; marcar diferentes", async () => {
    expect(await destinoDe(mesclarClientes(formulario({ manter: CLIENTE, a: CLIENTE, b: OUTRO, motivo: "x" })))).toBe("/clientes/duplicados?erro=motivo");
    expect(await destinoDe(mesclarClientes(formulario({ manter: VENDA, a: CLIENTE, b: OUTRO, motivo: "Mesma pessoa" })))).toBe("/clientes/duplicados?erro=dados");
    expect(cenario.chamadas).toEqual([]);
    expect(await destinoDe(mesclarClientes(formulario({ manter: OUTRO, a: CLIENTE, b: OUTRO, motivo: "Mesma pessoa" })))).toBe(`/clientes/${OUTRO}?ok=mesclado`);
    expect(cenario.chamadas[0]).toEqual({ nome: "clientes_mesclar", argumentos: { p_manter: OUTRO, p_absorver: CLIENTE, p_motivo: "Mesma pessoa" } });
    cenario.respostas.clientes_mesclar = { data: null, error: { code: "OR029" } };
    expect(await destinoDe(mesclarClientes(formulario({ manter: CLIENTE, a: CLIENTE, b: OUTRO, motivo: "Mesma pessoa" })))).toBe("/clientes/duplicados?erro=documentos_diferentes");
    expect(await destinoDe(marcarDiferentes(formulario({ a: CLIENTE, b: OUTRO, motivo: "Mãe e filha" })))).toBe("/clientes/duplicados?ok=diferentes");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "clientes_marcar_diferentes", argumentos: { p_a: CLIENTE, p_b: OUTRO, p_motivo: "Mãe e filha" } });
  });
});

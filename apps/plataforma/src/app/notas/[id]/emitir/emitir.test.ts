// "Dados para emitir" (lote K1b, #76) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados fictícios.
// O que a tela mostra em cada resposta do banco; a regra (quem vê, a auditoria, depois da emissão) está em
// packages/banco/src/pdv-l6.test.ts. Desde 27/11/2026 (a NF-e 55 no fluxo interno), a mesma tela mostra também quem
// emite e os fatos da venda, com o texto para copiar; o caminho inteiro no banco está em nfe-modelo-55-ponta-a-ponta.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { lerDadosParaEmitir } from "../../../../lib/notas/dados-para-emitir";
import { cnpjDoEmitente, lerFatosParaEmitir, textoParaCopiar } from "../../../../lib/notas/fatos-para-emitir";
import { erroDasNotas } from "../../../../lib/notas/regras";

const PEDIDO = "00000000-0000-4000-9000-0000000000e1";
const VENDA = "00000000-0000-4000-9000-0000000000e2";
const LOJA = "00000000-0000-4000-9000-0000000000e3";
const VARIANTE = "00000000-0000-4000-9000-0000000000e4";
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  resposta: { data: null as unknown, error: null as null | { code: string; message?: string } },
  chamadas: [] as unknown[],
  // As tabelas que a tela lê, cada uma com a resposta para os filtros pedidos; tabela fora daqui responde "sem permissão".
  tabelas: {} as Record<string, (filtros: Record<string, unknown>) => { data: unknown; error: null | { code: string } }>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => { throw new Error(`redirecionou para ${d}`); }, notFound: () => { throw new Error("não encontrado"); } }));
vi.mock("../../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "loja", unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase: {
      rpc: async (nome: string, argumentos: unknown) => { cenario.chamadas.push({ nome, argumentos }); return cenario.resposta; },
      from: (tabela: string) => {
        const filtros: Record<string, unknown> = {};
        const responder = async () => (cenario.tabelas[tabela] ?? (() => ({ data: null, error: { code: "42501" } })))(filtros);
        const consulta = {
          select: () => consulta, order: () => consulta, limit: () => consulta, lte: () => consulta,
          eq: (coluna: string, valor: unknown) => { filtros[coluna] = valor; return consulta; },
          in: (coluna: string, valor: unknown) => { filtros[coluna] = valor; return consulta; },
          maybeSingle: responder,
          then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => responder().then(ok, falha),
        };
        return consulta;
      },
    },
  }),
}));

import DadosParaEmitirANota from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (id = PEDIDO) => texto(await DadosParaEmitirANota({ params: Promise.resolve({ id }) }) as ReactElement).replace(/\s+/g, " ");
const ENDERECO = { cep: "80000000", logradouro: "Rua das Flores", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "PR" };
const COM_CLIENTE = { pedido: PEDIDO, numero: 12, nome: "Carla Nota", documento: "52998224725", endereco: ENDERECO, cliente: "c", dados_de: "2026-11-14T13:00:00Z" };
const ok = (data: unknown): Resposta => ({ data, error: null });

// Uma venda fictícia de duas linhas (uma com desconto), paga em dinheiro e no crédito em 3x, na loja de teste com CNPJ,
// inscrição estadual e endereço configurados.
const VENDA_FICTICIA = { numero: 31, concluida_em: "2026-11-27T13:05:00Z", subtotal_centavos: 15800, desconto_centavos: "500", total_centavos: 15300 };
const ITENS = [
  { variante_id: VARIANTE, quantidade: 1, preco_unitario_centavos: 7900, desconto_centavos: 0 },
  { variante_id: VARIANTE, quantidade: 1, preco_unitario_centavos: "7900", desconto_centavos: 500 },
];
const PAGAMENTOS = [
  { meio: "dinheiro", valor_centavos: 5300, parcelas: null, entrada_do_financiamento: false },
  { meio: "cartao_picpay", valor_centavos: 10000, parcelas: 3, entrada_do_financiamento: false },
];
const LOJA_DE_TESTE = { nome: "Santa Cândida (teste)", cnpj: "11222333000181", cidade: "Curitiba", uf: "PR", unidade_emissora_id: null };
const CONFIGURACAO = { cep: "82000000", logradouro: "Rua do Teste", numero: "100", complemento: null, bairro: "Santa Cândida", inscricao_estadual: "1234567890", inscricao_municipal: null };
function vendaDeTeste() {
  cenario.tabelas = {
    notas_pedidos: () => ok({ venda_id: VENDA, unidade_id: LOJA }),
    vendas: (f) => ok(f.id === VENDA ? VENDA_FICTICIA : null),
    venda_itens: (f) => ok(f.venda_id === VENDA ? ITENS : []),
    venda_pagamentos: (f) => ok(f.venda_id === VENDA ? PAGAMENTOS : []),
    variantes: () => ok([{ id: VARIANTE, sku: "0042", nome: "Capa (teste)" }]),
    unidades: (f) => ok(f.id === LOJA ? LOJA_DE_TESTE : null),
    unidade_configuracoes: (f) => ok(f.unidade_id === LOJA ? CONFIGURACAO : null),
  };
}

beforeEach(() => { cenario.chamadas = []; cenario.resposta = { data: null, error: null }; cenario.tabelas = {}; });

describe("/notas/[id]/emitir (K1b)", () => {
  it("mostra nome, CPF formatado e endereço guardados no pedido, com a data do cadastro", async () => {
    cenario.resposta = { data: COM_CLIENTE, error: null };
    const t = await tela();
    expect(cenario.chamadas).toEqual([{ nome: "notas_dados_para_emitir", argumentos: { p_pedido: PEDIDO } }]);
    for (const trecho of ["Dados para emitir · pedido nº 12", "Carla Nota", "529.982.247-25", "Rua das Flores, 10 · Centro · Curitiba/PR · CEP 80000-000", "14/11/2026"]) expect(t).toContain(trecho);
  });

  it("sem destinatário, pedido de outra loja, nota já emitida, banco sem a função e resposta estranha", async () => {
    cenario.resposta = { data: { pedido: PEDIDO, numero: 13, nome: null, documento: null, endereco: null, cliente: null, dados_de: null }, error: null };
    expect(await tela()).toContain("Nota sem cliente identificado");
    cenario.resposta = { data: null, error: { code: "P0002" } };
    await expect(tela()).rejects.toThrow("não encontrado");
    await expect(tela("abc")).rejects.toThrow("não encontrado");
    cenario.resposta = { data: null, error: { code: "22023", message: "Os dados do destinatário só aparecem enquanto a nota espera a emissão" } };
    expect(await tela()).toContain("Esta nota já foi emitida");
    cenario.resposta = { data: null, error: { code: "PGRST202" } };
    expect(await tela()).toContain("Indisponível neste ambiente");
    cenario.resposta = { data: { numero: 14, documento: "123", endereco: null }, error: null };
    expect(await tela()).toContain("Não foi possível concluir agora");
  });
});

describe("/notas/[id]/emitir: quem emite e os fatos da venda na mesma tela (NF-e 55, 27/11/2026)", () => {
  it("mostra a loja emitente, os itens, os totais, os pagamentos e o texto para copiar, sem inventar tributo", async () => {
    cenario.resposta = { data: COM_CLIENTE, error: null };
    vendaDeTeste();
    const t = await tela();
    for (const trecho of [
      "Quem emite", "Santa Cândida (teste)", "11.222.333/0001-81", "1234567890", "Rua do Teste, 100 · Santa Cândida · Curitiba/PR · CEP 82000-000",
      "Venda nº 31", "Capa (teste)", "0042 · 1 × R$ 79,00", "− desconto R$ 5,00", "R$ 74,00", "R$ 158,00", "R$ 153,00", "Dinheiro: R$ 53,00", "em 3x: R$ 100,00",
      "NCM, CFOP e tributos não estão no cadastro", "Tudo para copiar",
    ]) expect(t).toContain(trecho);
    // O texto para copiar leva o destinatário do pedido e cada linha da venda.
    for (const trecho of [
      "Pedido de nota nº 12 · venda nº 31", "Emitente: Santa Cândida (teste) · CNPJ 11.222.333/0001-81 · IE 1234567890", "Destinatário: Carla Nota · CPF 529.982.247-25 · Rua das Flores",
      "1. 0042 · Capa (teste) · 1 × R$ 79,00 = R$ 79,00", "2. 0042 · Capa (teste) · 1 × R$ 79,00 − desconto R$ 5,00 = R$ 74,00", "Subtotal R$ 158,00 · Descontos R$ 5,00 · Total R$ 153,00",
    ]) expect(t).toContain(trecho);
    expect(t).not.toMatch(/ICMS|alíquota|\bNCM \d/);
  });

  it("os fatos só aparecem depois de o banco liberar a nota; sem eles, o destinatário fica e um aviso diz onde conferir", async () => {
    vendaDeTeste();
    cenario.resposta = { data: null, error: { code: "22023", message: "Os dados do destinatário só aparecem enquanto a nota espera a emissão" } };
    const emitida = await tela();
    expect(emitida).toContain("Esta nota já foi emitida");
    expect(emitida).not.toContain("Quem emite");
    cenario.resposta = { data: COM_CLIENTE, error: null };
    cenario.tabelas.venda_itens = () => ({ data: null, error: { code: "42501" } });
    const semItens = await tela();
    expect(semItens).toContain("Carla Nota");
    expect(semItens).toContain("Não deu para ler agora a venda e a loja deste pedido");
    expect(semItens).not.toContain("Tudo para copiar");
    vendaDeTeste();
    cenario.tabelas.variantes = () => ok([]);
    expect(await tela()).toContain("Não deu para ler agora a venda e a loja deste pedido");
  });
});

describe("leitura e mensagens (K1b)", () => {
  it("documento só com 11 ou 14 dígitos; endereço completo; mensagens novas do banco", () => {
    expect(lerDadosParaEmitir({ numero: 1, nome: "A", documento: "11222333000181", endereco: { ...ENDERECO, complemento: "ap 2" }, dados_de: null }))
      .toMatchObject({ documento: "11222333000181", endereco: { complemento: "ap 2" } });
    expect(() => lerDadosParaEmitir({ numero: 1, documento: "52998224725", endereco: { ...ENDERECO, uf: "pr" } })).toThrow();
    expect(() => lerDadosParaEmitir({ numero: 1, documento: "52998224725", endereco: { ...ENDERECO, cep: "" } })).toThrow();
    expect(erroDasNotas({ code: "22023", message: "O cliente não tem o endereço completo no cadastro: complete o cadastro (CEP, rua, número, bairro, cidade e UF) para a nota no nome dele" })).toBe("cliente_sem_endereco");
    expect(erroDasNotas({ code: "22023", message: "O cliente não tem CPF/CNPJ no cadastro: corrija o cadastro ou informe o documento aqui" })).toBe("cliente_sem_documento");
  });
});

describe("leitura dos fatos da venda (NF-e 55)", () => {
  const partes = { venda: VENDA_FICTICIA, itens: ITENS, variantes: [{ id: VARIANTE, sku: "0042", nome: "Capa (teste)" }], pagamentos: PAGAMENTOS, loja: LOJA_DE_TESTE, emissora: null, configuracao: CONFIGURACAO };

  it("o CNPJ que emite segue a regra do banco: o da loja ou, sem ele, o da emissora; sem nenhum, diz o que falta", () => {
    expect(lerFatosParaEmitir(partes).emitente).toMatchObject({ nome: "Santa Cândida (teste)", cnpj: "11222333000181", porOutraLoja: false });
    const semCnpj = { ...LOJA_DE_TESTE, cnpj: null, unidade_emissora_id: "outra" };
    const pelaEmissora = lerFatosParaEmitir({ ...partes, loja: semCnpj, emissora: { nome: "Matriz (teste)", cnpj: "11444777000161", cidade: "Curitiba", uf: "PR", unidade_emissora_id: null } }).emitente;
    expect(pelaEmissora).toMatchObject({ nome: "Matriz (teste)", cnpj: "11444777000161", porOutraLoja: true });
    const emissoraOculta = lerFatosParaEmitir({ ...partes, loja: semCnpj, emissora: null, configuracao: null }).emitente;
    expect(emissoraOculta).toMatchObject({ cnpj: null, porOutraLoja: true, inscricaoEstadual: null, endereco: null });
    expect(cnpjDoEmitente(emissoraOculta)).toContain("o da loja emissora");
    expect(cnpjDoEmitente(lerFatosParaEmitir({ ...partes, loja: { ...LOJA_DE_TESTE, cnpj: null } }).emitente)).toContain("não cadastrado");
  });

  it("forma inesperada é falha, nunca dado na tela; sem cliente, o texto diz que a nota vai sem destinatário", () => {
    expect(() => lerFatosParaEmitir({ ...partes, variantes: [] })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, itens: [{ ...ITENS[0], quantidade: 1.5 }] })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, pagamentos: [{ ...PAGAMENTOS[0], valor_centavos: "R$ 53" }] })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, loja: null })).toThrow();
    expect(() => lerFatosParaEmitir({ ...partes, configuracao: "Rua" })).toThrow();
    const semCliente = textoParaCopiar(lerFatosParaEmitir(partes), 13, { nome: null, documento: null, endereco: null });
    expect(semCliente).toContain("Destinatário: sem cliente identificado");
    expect(semCliente.split("\n").at(-1)).toBe("NCM, CFOP e tributos: não estão no cadastro; o contador e o emissor definem.");
  });
});

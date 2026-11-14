// "Dados para emitir" (lote K1b, #76) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados fictícios.
// O que a tela mostra em cada resposta do banco; a regra (quem vê, a auditoria, depois da emissão) está em
// packages/banco/src/pdv-l6.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { lerDadosParaEmitir } from "../../../../lib/notas/dados-para-emitir";
import { erroDasNotas } from "../../../../lib/notas/regras";

const PEDIDO = "00000000-0000-4000-9000-0000000000e1";
const cenario = vi.hoisted(() => ({ resposta: { data: null as unknown, error: null as null | { code: string; message?: string } }, chamadas: [] as unknown[] }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => { throw new Error(`redirecionou para ${d}`); }, notFound: () => { throw new Error("não encontrado"); } }));
vi.mock("../../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "loja", unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase: { rpc: async (nome: string, argumentos: unknown) => { cenario.chamadas.push({ nome, argumentos }); return cenario.resposta; } },
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

beforeEach(() => { cenario.chamadas = []; cenario.resposta = { data: null, error: null }; });

describe("/notas/[id]/emitir (K1b)", () => {
  it("mostra nome, CPF formatado e endereço guardados no pedido, com a data do cadastro", async () => {
    cenario.resposta = { data: { pedido: PEDIDO, numero: 12, nome: "Carla Nota", documento: "52998224725", endereco: ENDERECO, cliente: "c", dados_de: "2026-11-14T13:00:00Z" }, error: null };
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

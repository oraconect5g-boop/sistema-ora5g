// A tela Ações na Nogle (lote CONNECT-j; a D-061), com a sessão e o Supabase SIMULADOS: nenhuma credencial; linhas, PDVs e
// pessoas FICTÍCIOS. As regras do banco (quem pede, o PDV fora da gestão, o sensível à parte e o worker) estão em
// packages/banco/src/connect-acoes.test.ts; o envio à Nogle, em packages/dominio e apps/worker/src/connect.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA_A = "00000000-0000-4000-9000-0000000000a1";
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  acoes: [] as Record<string, unknown>[],
  rpc: [] as { nome: string; argumentos: unknown }[],
  erroDaRpc: null as null | { code: string },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => { throw new Error(`redirecionou para ${d}`); } }));
class Consulta {
  linhas: Record<string, unknown>[];
  constructor(linhas: Record<string, unknown>[]) { this.linhas = [...linhas]; }
  select() { return this; }
  order() { return this; }
  limit() { return this; }
  eq() { return this; }
  in(campo: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[campo])); return this; }
  then(resolver: (r: { data: unknown; error: null }) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const TABELAS: Record<string, () => Record<string, unknown>[]> = {
  connect_acoes: () => cenario.acoes,
  connect_referencias: () => [
    { tipo: "plano", codigo: "1718", nome: "10 GB", uf: null, valor_centavos: 5490 },
    { tipo: "cidade", codigo: "7703", nome: "Curitiba", uf: "PR", valor_centavos: null },
  ],
  connect_pdvs: () => [{ pdv_id: 7101, nome: "SUPERCELL AGUA VERDE", unidade_id: LOJA_A, ativo: true }],
  unidades: () => [{ id: LOJA_A, nome: "Água Verde" }],
};
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA_A, unidade_nome: "Água Verde", turno_termina_em: "2026-11-26T03:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Pessoa (fictícia)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: (tabela: string) => new Consulta(TABELAS[tabela]?.() ?? []),
    rpc: async (nome: string, argumentos: unknown) => { cenario.rpc.push({ nome, argumentos }); return { data: { id: "x", numero: 12, situacao: "registrada" }, error: cenario.erroDaRpc }; },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error { constructor(m: string) { super(`falha: ${m}`); } },
  obterSessao: async () => sessaoFicticia,
}));

import AcoesNaNogle from "./page";
import { cancelarAcao, pedirAcao } from "./servidor";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && /^[A-Z]/.test((v.type as { name?: string }).name ?? "")) {
      try { return texto((v.type as (p: unknown) => unknown)(v.props)); } catch { /* componente com estado: lê as propriedades */ }
    }
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const abrir = async (busca: Record<string, string> = {}) => texto(await AcoesNaNogle({ searchParams: Promise.resolve(busca) } as never)).replace(/\s+/g, " ");
const emOrdem = (t: string, ...partes: string[]) => expect(t).toMatch(new RegExp(partes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*?")));
const enviar = (acao: (d: FormData) => Promise<unknown>, campos: Record<string, string>) => {
  const dados = new FormData();
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return acao(dados);
};

beforeEach(() => {
  cenario.permissoes = new Set(["connect.operar", "connect.gerir"]);
  cenario.acoes = [];
  cenario.rpc = [];
  cenario.erroDaRpc = null;
});

describe("a tela Ações na Nogle (CONNECT-j)", () => {
  it("quem gere: as ações da linha, do cliente, a compra de chip e os PDVs, com o aviso de que mudam algo de verdade", async () => {
    const t = await abrir();
    emOrdem(t, "Ações na Nogle", "mudam algo de verdade na Nogle", "Linha do cliente", "Bloquear a linha", "PERDA", "Desbloquear a linha",
      "Bloquear a recarga automática", "Desbloquear a recarga automática", "Mudar o apelido da linha", "Programar recarga pelo saldo", "10 GB · R$ 54,90",
      "Reenviar o SMS da portabilidade", "Cliente na Nogle", "Cadastrar o cliente na Nogle", "Curitiba (PR)", "Compra de chip com entrega",
      "Só o chip, sem plano", "PDVs da Nogle", "Criar um PDV na Nogle", "Água Verde (PDV 7101)", "Inativar um PDV (e os usuários dele)",
      "Confirmo: o PDV e todos os usuários dele ficam inativos na Nogle.", "Pedidos", "Nenhum pedido ainda.");
  });

  it("os pedidos com a situação, a resposta da Nogle e o cancelamento enquanto estão na fila; quem não gere só vê o aviso", async () => {
    cenario.acoes = [
      { id: "00000000-0000-4000-9000-0000000000c1", numero: 7, tipo: "compra_chip", alvo: "•••.•••.789-09", parametros: { plano: "88888", quantidade: 1, metodo: "LINK" },
        motivo: "Cliente pediu pelo telefone", situacao: "feita", mensagem: null, resultado: { pedido: 9172, link_pagamento: "https://pagamento.invalid/x" },
        pedida_em: "2026-11-25T13:00:00Z", concluida_em: "2026-11-25T13:01:00Z" },
      { id: "00000000-0000-4000-9000-0000000000c2", numero: 8, tipo: "linha_bloquear", alvo: "41999998888", parametros: { linha: "41999998888", motivo_bloqueio: "ROUBO" },
        motivo: "Roubo do celular", situacao: "registrada", mensagem: null, resultado: {}, pedida_em: "2026-11-25T13:05:00Z", concluida_em: null },
    ];
    const t = await abrir({ ok: "pedido", numero: "8" });
    emOrdem(t, "Pedido nº 8 registrado: o servidor envia à Nogle em até 1 minuto, uma vez.");
    emOrdem(t, "Nº 7", "Feita", "Comprar chip com entrega · •••.•••.789-09 · só o chip · 1 chip · pago por LINK", "Pedido nº 9172 na Nogle", "Link para o cliente pagar");
    emOrdem(t, "Nº 8", "Na fila", "Bloquear a linha · (41) 99999-8888 · motivo ROUBO", "Cancelar o pedido");
    expect(t.match(/Cancelar o pedido/g)).toHaveLength(1);
    cenario.permissoes = new Set(["connect.operar"]);
    expect(await abrir()).toContain("As ações na Nogle são do dono e dos gerentes.");
  });

  it("as ações vão ao banco por UMA função, com o sensível só nos dados; o erro do banco vira a mensagem", async () => {
    await expect(enviar(pedirAcao, { tipo: "linha_bloquear", chave: "k1", motivo: "Roubo do celular", linha: "41 99999-8888", motivo_bloqueio: "ROUBO" }))
      .rejects.toThrow("redirecionou para /connect/acoes-na-nogle?ok=pedido&numero=12");
    await expect(enviar(pedirAcao, { tipo: "pdv_usuario", chave: "k2", motivo: "Usuário novo", pdv: "7101", usuario_nome: "Pessoa", usuario_email: "p@teste.invalid", usuario_senha: "senha-1234" }))
      .rejects.toThrow("ok=pedido");
    expect(cenario.rpc).toEqual([
      { nome: "connect_pedir_acao", argumentos: { p_tipo: "linha_bloquear", p_chave: "k1", p_motivo: "Roubo do celular", p_parametros: { linha: "41999998888", motivo_bloqueio: "ROUBO" } } },
      { nome: "connect_pedir_acao", argumentos: { p_tipo: "pdv_usuario", p_chave: "k2", p_motivo: "Usuário novo", p_parametros: { pdv: "7101" },
        p_dados: { nome: "Pessoa", email: "p@teste.invalid", senha: "senha-1234" } } },
    ]);
    cenario.rpc = [];
    await expect(enviar(pedirAcao, { tipo: "pdv_inativar", chave: "k3", motivo: "Loja fechou", pdv: "7101" })).rejects.toThrow("erro=confirmacao");
    expect(cenario.rpc).toEqual([]);
    cenario.erroDaRpc = { code: "42501" };
    await expect(enviar(pedirAcao, { tipo: "linha_desbloquear", chave: "k4", motivo: "Achou o celular", linha: "41999998888" })).rejects.toThrow("erro=sem_permissao");
    cenario.erroDaRpc = { code: "OR057" };
    await expect(enviar(cancelarAcao, { acao: "00000000-0000-4000-9000-0000000000c2", motivo: "Desistiu" })).rejects.toThrow("erro=ja_saiu");
  });
});

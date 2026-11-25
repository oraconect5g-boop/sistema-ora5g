// A tela Consultar linha (lote CONNECT-g; ORA-CONNECT-007), com a sessão e o Supabase SIMULADOS: nenhuma credencial; linhas,
// ICCIDs e nomes FICTÍCIOS. As regras do banco (quem pede, quem vê, o limite e o worker) estão em
// packages/banco/src/connect-consultas.test.ts; a consulta à Nogle, em packages/dominio e apps/worker/src/connect.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  consultas: [] as Record<string, unknown>[],
  rpc: [] as { nome: string; argumentos: unknown }[],
  erroDaRpc: null as null | { code: string },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  useRouter: () => ({ refresh: () => undefined }),
}));
class Consulta {
  linhas: Record<string, unknown>[];
  constructor(linhas: Record<string, unknown>[]) { this.linhas = [...linhas]; }
  select() { return this; }
  order() { return this; }
  limit(n: number) { this.linhas = this.linhas.slice(0, n); return this; }
  then(resolver: (r: { data: unknown; error: null }) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "loja", unidade_nome: "Santa Cândida (fictícia)", turno_termina_em: "2026-11-26T03:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Pessoa (fictícia)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: () => new Consulta(cenario.consultas),
    rpc: async (nome: string, argumentos: unknown) => { cenario.rpc.push({ nome, argumentos }); return { data: null, error: cenario.erroDaRpc }; },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error { constructor(m: string) { super(`falha: ${m}`); } },
  obterSessao: async () => sessaoFicticia,
}));

import { consultar } from "./acoes";
import ConsultarLinha from "./page";

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
const abrir = async (busca: Record<string, string> = {}) => texto(await ConsultarLinha({ searchParams: Promise.resolve(busca) } as never)).replace(/\s+/g, " ");
const emOrdem = (t: string, ...partes: string[]) => expect(t).toMatch(new RegExp(partes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*?")));
const CONSULTA = { mensagem: null, pedida_em: "2026-11-25T13:00:00Z", respondida_em: "2026-11-25T13:00:03Z", resposta_apagada_em: null };

beforeEach(() => {
  cenario.permissoes = new Set(["connect.operar"]);
  cenario.consultas = [];
  cenario.rpc = [];
  cenario.erroDaRpc = null;
});

describe("a tela Consultar linha (CONNECT-g)", () => {
  it("quem opera a loja: o formulário com as consultas da loja, sem a carteira; a lista diz que não há nada", async () => {
    const t = await abrir();
    emOrdem(t, "Consultar linha", "O que consultar", "Número com DDD ou ICCID do chip", "Situação da linha (pelo número)", "Saldo da linha (pelo número)",
      "Recargas da linha (pelo número)", "Consumo de internet no mês (pelo número)", "Número do chip (pelo ICCID)", "Ativação do chip (pelo ICCID)", "Consultar");
    expect(t).toContain("Só consulta: nada muda na linha nem no chip.");
    expect(t).not.toContain("Carteira da Ora na Nogle");
    expect(t).toContain("Nenhuma consulta ainda.");
    expect(t).not.toContain("Consultando a Nogle…");
  });

  it("o dono: também a carteira; quem não opera nem gere a Ora Connect só vê o aviso", async () => {
    cenario.permissoes = new Set(["connect.operar", "connect.gerir"]);
    emOrdem(await abrir(), "O que consultar", "Carteira da Ora na Nogle", "Consultar o saldo");
    cenario.permissoes = new Set(["venda.registrar"]);
    const sem = await abrir();
    expect(sem).toContain("Consultar linha é de quem opera a Ora Connect.");
    expect(sem).not.toContain("O que consultar");
  });

  it("as consultas: a resposta em português, o aviso da Nogle e, enquanto alguma espera, a tela se atualiza sozinha", async () => {
    cenario.consultas = [
      { ...CONSULTA, id: "c1", tipo: "linha_saldo", parametro: "41999998888", situacao: "respondida", resposta: { dados_mb: 512, minutos: 60, minutos_ilimitados: false, sms: 10 } },
      { ...CONSULTA, id: "c2", tipo: "linha_detalhes", parametro: "41999990000", situacao: "nao_encontrada", resposta: null, mensagem: "Linha não encontrada." },
      { ...CONSULTA, id: "c3", tipo: "iccid_numero", parametro: "8955170110000000016", situacao: "na_fila", resposta: null, respondida_em: null },
    ];
    const t = await abrir();
    emOrdem(t, "Minhas consultas", "Saldo da linha · (41) 99999-8888", "Respondida", "25/11/2026 às 10:00", "Internet: 512 MB", "Minutos: 60", "SMS: 10");
    emOrdem(t, "Situação da linha · (41) 99999-0000", "Não encontrada", "Linha não encontrada.");
    emOrdem(t, "Número do chip · 8955170110000000016", "Na fila");
    expect(t).toContain("Consultando a Nogle…");
  });

  it("os avisos de erro do pedido", async () => {
    expect(await abrir({ erro: "linha" })).toContain("digite o número da linha com DDD");
    expect(await abrir({ erro: "limite" })).toContain("Muitas consultas na última hora");
    expect(await abrir({ erro: "qualquer" })).toContain("Não foi possível pedir a consulta agora.");
  });

  it("a ação: vai ao banco por UMA função, só com o que a consulta pede; o erro do banco vira a mensagem", async () => {
    const enviar = (campos: Record<string, string>) => {
      const dados = new FormData();
      for (const [k, v] of Object.entries(campos)) dados.set(k, v);
      return consultar(dados);
    };
    await expect(enviar({ tipo: "linha_saldo", parametro: "(41) 99999-8888", chave: "k1" })).rejects.toThrow("redirecionou para /connect/linha");
    await expect(enviar({ tipo: "carteira_saldo", chave: "k2" })).rejects.toThrow("redirecionou para /connect/linha");
    expect(cenario.rpc).toEqual([
      { nome: "connect_consultar", argumentos: { p_tipo: "linha_saldo", p_chave: "k1", p_parametro: "41999998888" } },
      { nome: "connect_consultar", argumentos: { p_tipo: "carteira_saldo", p_chave: "k2" } },
    ]);
    cenario.rpc = [];
    await expect(enviar({ tipo: "iccid_numero", parametro: "41999998888", chave: "k3" })).rejects.toThrow("redirecionou para /connect/linha?erro=iccid");
    expect(cenario.rpc).toEqual([]);
    cenario.erroDaRpc = { code: "OR056" };
    await expect(enviar({ tipo: "linha_saldo", parametro: "41999998888", chave: "k4" })).rejects.toThrow("redirecionou para /connect/linha?erro=limite");
  });
});

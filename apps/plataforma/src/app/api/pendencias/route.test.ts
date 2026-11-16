// /api/pendencias (G6, REPORT-007) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados fictícios. A rota do
// sino devolve a mesma leitura do Início (as regras de cada pendência estão em app/inicio/inicio.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  erroDaSessao: false,
  semSessao: false,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  erros: {} as Record<string, { code: string }>,
  lidas: [] as string[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
class Consulta {
  linhas: Linha[];
  erro: { code: string } | null;
  constructor(nome: string) { cenario.lidas.push(nome); this.linhas = [...(cenario.tabelas[nome] ?? [])]; this.erro = cenario.erros[nome] ?? null; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq() { return this; }
  in() { return this; }
  lt() { return this; }
  lte() { return this; }
  gte() { return this; }
  or() { return this; }
  then(resolver: (r: { data: Linha[] | null; error: { code: string } | null; count: number | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro, count: null } : { data: null, error: null, count: this.linhas.length }).then(resolver);
  }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: async () => ({ data: null, error: { code: "PGRST202" } }),
};
// As permissões chegam com a sessão (public.molde_da_sessao, lote VEL-a): a rota não pergunta de novo ao banco.
vi.mock("../../../lib/acesso/sessao", () => {
  class FalhaDoServico extends Error {}
  return {
    FalhaDoServico,
    obterSessao: async () => {
      if (cenario.semSessao) throw new Error("redirecionou para /entrar");
      if (cenario.erroDaSessao) throw new FalhaDoServico("Falha ao consultar o serviço (molde_da_sessao)");
      return {
        usuario: { id: EU },
        situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
        molde: { permissoes: cenario.permissoes, nome: "Ana (fictícia)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
        supabase,
      };
    },
  };
});

import { GET } from "./route";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.permissoes = new Set();
  cenario.erroDaSessao = false;
  cenario.semSessao = false;
  cenario.tabelas = {};
  cenario.erros = {};
  cenario.lidas = [];
});

describe("a rota do sino", () => {
  it("devolve as pendências da loja do turno, como o Início, sem guardar em cache", async () => {
    cenario.permissoes = new Set(["desconto.aprovar", "nota.aprovar"]);
    cenario.tabelas = {
      aprovacoes_desconto: [{ unidade_id: LOJA, situacao: "pendente" }, { unidade_id: LOJA, situacao: "pendente" }, { unidade_id: LOJA, situacao: "aprovada" }],
      notas_pedidos: [],
    };
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("private, no-store");
    const corpo = await resposta.json() as { unidade: string; pendencias: Linha[] };
    expect(corpo.unidade).toBe(LOJA);
    expect(corpo.pendencias.map((p) => [p.rotulo, p.quantidade, p.icone, p.href, p.alerta])).toEqual([
      ["Descontos para aprovar", 2, "desconto", "/aprovacoes", false],
      ["Notas na fila", 0, "nota", "/notas", false],
    ]);
    // Quem não tem a permissão nem pergunta (o vendedor não lê a fila de descontos nem a das notas).
    cenario.permissoes = new Set(["venda.registrar"]);
    cenario.lidas = [];
    const doVendedor = await (await GET()).json() as { pendencias: Linha[] };
    expect(doVendedor.pendencias).toEqual([]);
    expect(cenario.lidas).toEqual([]);
  });

  it("falha de leitura (das pendências ou da sessão, que traz as permissões) volta 503 e o sino diz que não leu; o log não leva dado", async () => {
    cenario.permissoes = new Set(["desconto.aprovar"]);
    cenario.erros = { aprovacoes_desconto: { code: "57014" } };
    let resposta = await GET();
    expect(resposta.status).toBe(503);
    expect(await resposta.json()).toEqual({ erro: "falha" });
    expect(resposta.headers.get("cache-control")).toBe("private, no-store");
    cenario.erros = {};
    cenario.erroDaSessao = true;
    resposta = await GET();
    expect(resposta.status).toBe(503);
    expect(await resposta.json()).toEqual({ erro: "falha" });
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith("sino: falha ao ler as pendências", { fonte: expect.any(String) });
    expect(console.error).toHaveBeenLastCalledWith("sino: falha ao ler as pendências", { fonte: "Falha ao consultar o serviço (molde_da_sessao)" });
    // Nenhuma leitura de tabela foi tentada sem a sessão.
    expect(cenario.lidas).toEqual(["aprovacoes_desconto"]);
  });

  it("sem sessão não é falha: o caminho para a entrada segue, sem virar 503", async () => {
    cenario.semSessao = true;
    await expect(GET()).rejects.toThrow("redirecionou para /entrar");
    expect(console.error).not.toHaveBeenCalled();
    expect(cenario.lidas).toEqual([]);
  });
});

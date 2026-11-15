// Planilha da equipe e dos acessos (lote FIN-009d: ORA-FIN-009) pela rota /equipe/exportar, com sessão e Supabase
// simulados: um PostgREST em memória que filtra, ordena e corta cada resposta no teto de 1.000 linhas, como o da API.
// Confere a permissão, as redes de quem pede, as pessoas e os acessos, os convites em andamento e que falha nunca vira
// arquivo pela metade. Dados fictícios.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { abrirXlsx, linhasDaFolha } from "../../lib/xlsx-de-teste";

const ORG = "00000000-0000-4000-8000-0000000000a0";
const OUTRA_ORG = "00000000-0000-4000-8000-0000000000a9";
const DONO = "00000000-0000-4000-8000-0000000000f0";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const FECHADA = "00000000-0000-4000-8000-0000000000ce";
type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  permitido: true,
  tabelas: {} as Record<string, Linha[]>,
  falhaEm: null as string | null,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

const TETO = 1000;
class Consulta {
  private linhas: Linha[];
  private ordem: string[] = [];
  private de = 0;
  private ate = Number.MAX_SAFE_INTEGER;
  constructor(private tabela: string) { this.linhas = (cenario.tabelas[tabela] ?? []).map((l) => ({ ...l })); }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[coluna])); return this; }
  is(coluna: string, valor: null) { this.linhas = this.linhas.filter((l) => (l[coluna] ?? null) === valor); return this; }
  order(coluna: string) { this.ordem.push(coluna); return this; }
  range(de: number, ate: number) { this.de = de; this.ate = ate; return this; }
  then(resolver: (r: unknown) => unknown) {
    if (cenario.falhaEm === this.tabela) return Promise.resolve({ data: null, error: { code: "57014" } }).then(resolver);
    const ordenadas = [...this.linhas].sort((a, b) => { for (const c of this.ordem) { const d = String(a[c]).localeCompare(String(b[c])); if (d) return d; } return 0; });
    return Promise.resolve({ data: ordenadas.slice(this.de, Math.min(this.ate, this.de + TETO - 1) + 1), error: null }).then(resolver);
  }
}
const supabase = {
  from: (tabela: string) => new Consulta(tabela),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: argumentos.p_permissao === "usuarios.gerir" && cenario.permitido, error: null };
    return { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: DONO },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-15T23:00:00Z" },
    supabase,
  }),
}));

import { GET } from "./exportar/route";

const vinculo = (id: string, usuario: string, papel: string, unidade: string | null, mudancas: Linha = {}) => ({
  id, usuario_id: usuario, organizacao_id: ORG, papel, unidade_id: unidade, escopo: unidade ? "unidade" : "organizacao", fim: null, inicio: "2026-11-01T12:00:00Z", ...mudancas,
});
const pessoa = (id: string, nome: string, mudancas: Linha = {}) => ({ id, nome, email: `${nome.split(" ")[0]?.toLowerCase()}@teste.invalid`, status: "ativo", ultimo_acesso_em: null, ...mudancas });
const baixar = (consulta = "") => GET(new Request(`http://localhost/equipe/exportar${consulta ? `?${consulta}` : ""}`));

beforeEach(() => {
  Object.assign(cenario, {
    permitido: true, falhaEm: null,
    tabelas: {
      vinculos: [
        vinculo("v1", DONO, "dono", null),
        vinculo("v2", "p-bia", "gerente", LOJA),
        vinculo("v3", "p-bia", "vendedor", FECHADA, { inicio: "2026-11-05T12:00:00Z" }),
        vinculo("v4", "p-caio", "vendedor", LOJA, { fim: "2026-11-10T12:00:00Z" }),
        vinculo("v5", "p-de-fora", "dono", null, { organizacao_id: OUTRA_ORG }),
      ],
      organizacoes: [{ id: ORG, nome: "Ora 5G (teste)" }, { id: OUTRA_ORG, nome: "Outra rede (teste)" }],
      unidades: [
        { id: LOJA, nome: "Santa Cândida (teste)", status: "ativa", organizacao_id: ORG },
        { id: FECHADA, nome: "Loja fechada (teste)", status: "inativa", organizacao_id: ORG },
      ],
      perfis_usuario: [
        pessoa(DONO, "Dono Teste", { ultimo_acesso_em: "2026-11-15T04:00:00Z" }), pessoa("p-bia", "Bia Teste"), pessoa("p-caio", "Caio Teste", { status: "bloqueado" }),
        pessoa("p-de-fora", "Fora Teste"),
      ],
      convites: [
        { id: "c1", organizacao_id: ORG, nome: "Duda Teste", email: "duda@teste.invalid", papel: "vendedor", unidades: [LOJA], situacao: "erro", erro: "caixa cheia" },
        { id: "c2", organizacao_id: ORG, nome: "Edu Teste", email: "edu@teste.invalid", papel: "gerente", unidades: [LOJA], situacao: "cancelado", erro: null },
      ],
    },
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("planilha da equipe pela rota (FIN-009d)", () => {
  it("sem usuarios.gerir, ou sem ser dono ou administrador de nenhuma rede: 403", async () => {
    cenario.permitido = false;
    expect((await baixar()).status).toBe(403);
    cenario.permitido = true;
    cenario.tabelas.vinculos = [vinculo("v1", DONO, "gerente", LOJA)];
    const r = await baixar();
    expect(r.status).toBe(403);
    expect(await r.text()).toBe("Sem permissão para exportar a equipe.");
  });

  it("as pessoas da rede, uma linha por acesso ativo, a loja inativa marcada e os convites em andamento", async () => {
    const r = await baixar();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="ora5g-equipe-e-acessos-ora-5g-teste.xlsx"');
    const partes = abrirXlsx(new Uint8Array(await r.arrayBuffer()));
    const folha = partes.get("xl/worksheets/sheet1.xml") ?? "";
    const linhas = linhasDaFolha(folha);
    expect(linhas[0]).toEqual(["Equipe e acessos", "Ora 5G (teste)"]);
    expect(linhas[1]?.[2]).toBe("3 pessoas · 1 convite em andamento");
    expect(linhas[4]).toEqual(["Pessoa", "E-mail", "Situação", "Último acesso", "Função", "Onde", "Acesso desde"]);
    expect(linhas.slice(5, 9).map((l) => [l[0], l[2], l[4] ?? null, l[5]])).toEqual([
      ["Bia Teste", "ativo", "Gerente", "Santa Cândida (teste)"],
      ["Bia Teste", "ativo", "Vendedor", "Loja fechada (teste) (inativa)"],
      ["Caio Teste", "bloqueado", null, "sem acesso ativo nesta rede"],
      ["Dono Teste", "ativo", "Dono", "rede inteira"],
    ]);
    // os convites: o com erro, com o motivo; o cancelado não entra
    expect(linhas[10]?.slice(0, 2)).toEqual(["Convite para", "E-mail"]);
    expect(linhas.slice(11)).toEqual([["Duda Teste", "duda@teste.invalid", "Vendedor", "Santa Cândida (teste)", "não enviado", "caixa cheia"]]);
    // no Excel, o filtro fica na tabela das pessoas
    expect(folha).toContain('<autoFilter ref="A5:G9"/>');
    expect(JSON.stringify(linhas)).not.toContain("Fora Teste");
  });

  it("em CSV, para outros sistemas", async () => {
    const r = await baixar("formato=csv");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="ora5g-equipe-e-acessos-ora-5g-teste.csv"');
    const csv = await r.text();
    expect(csv).toContain("\r\nDono Teste;dono@teste.invalid;ativo;15/11/2026 01:00;Dono;rede inteira;01/11/2026 09:00");
  });

  it("uma leitura que falha, ou mais linhas que o limite: nada de equipe pela metade", async () => {
    cenario.falhaEm = "convites";
    await expect(baixar()).rejects.toThrow("equipe_exportar");
    cenario.falhaEm = null;
    cenario.tabelas.perfis_usuario = Array.from({ length: 5_001 }, (_, n) => pessoa(`p-${String(n).padStart(5, "0")}`, `Pessoa ${n}`));
    await expect(baixar()).rejects.toThrow("equipe_exportar_limite");
  });
});

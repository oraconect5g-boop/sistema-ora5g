// Planilha da auditoria (lote FIN-009d: ORA-FIN-009) pela rota /auditoria/exportar, com sessão e Supabase simulados:
// um PostgREST em memória que filtra, ordena e corta cada resposta no teto de 1.000 linhas, como o da API. Confere a
// permissão, o recorte (a loja do turno e a rede, no período), todas as linhas do período (a tela mostra 200), o
// filtro dos alertas e que falha nunca vira arquivo pela metade. Dados fictícios.
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { abrirXlsx, linhasDaFolha } from "../../lib/xlsx-de-teste";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const ANA = "00000000-0000-4000-8000-0000000000a1";
type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  permissao: true,
  tabelas: {} as Record<string, Linha[]>,
  falhaNaPagina: null as string | null,
  pedidos: [] as { tabela: string; de: number; ate: number }[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

const TETO = 1000;
class Consulta {
  private linhas: Linha[];
  private ordem: { coluna: string; crescente: boolean }[] = [];
  private de = 0;
  private ate = Number.MAX_SAFE_INTEGER;
  constructor(private tabela: string) { this.linhas = (cenario.tabelas[tabela] ?? []).map((l) => ({ ...l })); }
  select() { return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[coluna])); return this; }
  gte(coluna: string, valor: string) { this.linhas = this.linhas.filter((l) => String(l[coluna]) >= valor); return this; }
  or(filtro: string) {
    const loja = /^unidade_id\.eq\.([^,]+),unidade_id\.is\.null$/.exec(filtro)?.[1];
    if (!loja) throw new Error(`filtro inesperado: ${filtro}`);
    this.linhas = this.linhas.filter((l) => l.unidade_id === loja || l.unidade_id === null);
    return this;
  }
  order(coluna: string, opcoes?: { ascending?: boolean }) { this.ordem.push({ coluna, crescente: opcoes?.ascending !== false }); return this; }
  range(de: number, ate: number) { this.de = de; this.ate = ate; return this; }
  limit(n: number) { this.de = 0; this.ate = n - 1; return this; }
  then(resolver: (r: unknown) => unknown) {
    cenario.pedidos.push({ tabela: this.tabela, de: this.de, ate: this.ate });
    if (cenario.falhaNaPagina === this.tabela && (this.tabela !== "auditoria" || this.de > 0)) return Promise.resolve({ data: null, error: { code: "57014" } }).then(resolver);
    const ordenadas = [...this.linhas].sort((a, b) => {
      for (const o of this.ordem) {
        const x = a[o.coluna] as string | number;
        const y = b[o.coluna] as string | number;
        const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        if (d) return o.crescente ? d : -d;
      }
      return 0;
    });
    return Promise.resolve({ data: ordenadas.slice(this.de, Math.min(this.ate, this.de + TETO - 1) + 1), error: null }).then(resolver);
  }
}
const supabase = {
  from: (tabela: string) => new Consulta(tabela),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: argumentos.p_permissao === "auditoria.ver" && argumentos.p_unidade === LOJA && cenario.permissao, error: null };
    return { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: ANA },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-15T23:00:00Z" },
    supabase,
  }),
}));

import { GET } from "./exportar/route";
import Auditoria from "./page";

const HORA = 3_600_000;
const evento = (id: number, mudancas: Linha = {}) => ({
  id, ocorrido_em: new Date(Date.now() - (2 + id / 1000) * HORA).toISOString(), usuario_id: ANA, unidade_id: LOJA, acao: "vendas.criado",
  alvo_tipo: "vendas", alvo_id: `venda-${id}`, motivo: null, origem: "app", antes: { cpf: "fictício" }, depois: null, ...mudancas,
});
const baixar = (consulta = "") => GET(new Request(`http://localhost/auditoria/exportar${consulta ? `?${consulta}` : ""}`));
async function folha(consulta = "") {
  const r = await baixar(consulta);
  expect(r.status).toBe(200);
  return { r, linhas: linhasDaFolha(abrirXlsx(new Uint8Array(await r.arrayBuffer())).get("xl/worksheets/sheet1.xml") ?? "") };
}

beforeEach(() => {
  Object.assign(cenario, {
    permissao: true, falhaNaPagina: null, pedidos: [],
    tabelas: {
      auditoria: [
        evento(1),
        evento(2, { usuario_id: null, unidade_id: null, acao: "precos.alterado", origem: "banco", alvo_tipo: null, alvo_id: null }),
        evento(3, { acao: "sessao.unidade_negada", usuario_id: "00000000-0000-4000-8000-0000000000b9", motivo: "sem vínculo" }),
        evento(4, { unidade_id: OUTRA }),
        evento(5, { ocorrido_em: new Date(Date.now() - 40 * 24 * HORA).toISOString() }),
      ],
      perfis_usuario: [{ id: ANA, nome: "Ana (teste)" }],
    },
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("planilha da auditoria pela rota (FIN-009d)", () => {
  it("sem auditoria.ver na loja do turno: 403, sem ler nada", async () => {
    cenario.permissao = false;
    const r = await baixar();
    expect(r.status).toBe(403);
    expect(await r.text()).toBe("Sem permissão para exportar a auditoria.");
    expect(cenario.pedidos).toEqual([]);
  });

  it("a loja do turno e a rede, no período, do mais recente ao mais antigo; nada de outra loja nem de fora do período", async () => {
    const { r, linhas } = await folha("periodo=7");
    expect(r.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="ora5g-auditoria-7-dias-santa-candida-teste.xlsx"');
    expect(linhas[0]).toEqual(["Auditoria", "7 dias", "Santa Cândida (teste) e a rede"]);
    expect(linhas[1]?.[2]).toBe("3 registros");
    expect(linhas.slice(5).map((l) => [l[1], l[3] ?? null, l[4], l[5], l[7] ?? null, l[9] ?? null])).toEqual([
      ["Tentou entrar numa loja sem acesso", "Sim", "Pessoa de fora da sua equipe", "Santa Cândida (teste)", "venda-3", "sem vínculo"],
      ["Preço: alterado", null, "Sistema", "Rede", null, null],
      ["Venda: criado", null, "Ana (teste)", "Santa Cândida (teste)", "venda-1", null],
    ]);
    // o antes e o depois nunca saem
    expect(JSON.stringify(linhas)).not.toContain("fictício");
  });

  it("todas as linhas do período (a tela mostra 200), em páginas abaixo do teto da API", async () => {
    cenario.tabelas.auditoria = Array.from({ length: 1_500 }, (_, n) => evento(n + 1));
    const { linhas } = await folha("periodo=7");
    expect(linhas[1]?.[2]).toBe("1.500 registros");
    expect(linhas.slice(5)).toHaveLength(1_500);
    expect(cenario.pedidos.filter((p) => p.tabela === "auditoria").map((p) => [p.de, p.ate])).toEqual([[0, 499], [500, 999], [1000, 1499], [1500, 1999]]);
  });

  it("só os alertas, em CSV, com o nome do arquivo dizendo", async () => {
    const r = await baixar("periodo=7&alertas=1&formato=csv");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="ora5g-auditoria-7-dias-alertas-santa-candida-teste.csv"');
    const csv = await r.text();
    expect(csv).toContain("1 registro (só alertas)");
    expect(csv).toContain(";Tentou entrar numa loja sem acesso;sessao.unidade_negada;Sim;Pessoa de fora da sua equipe;");
    expect(csv).not.toContain("Venda: criado");
  });

  it("a tela oferece a planilha do mesmo período e do mesmo filtro", async () => {
    const enderecos = async (parametros: Record<string, string>) => {
      const achados: unknown[] = [];
      const percorrer = (v: unknown): void => {
        if (Array.isArray(v)) v.forEach(percorrer);
        else if (isValidElement<Linha>(v)) {
          if (typeof v.type === "function" && v.type.name === "BaixarPlanilha") achados.push(v.props.endereco);
          Object.values(v.props).forEach(percorrer);
        }
      };
      percorrer(await Auditoria({ searchParams: Promise.resolve(parametros) }));
      return achados;
    };
    expect(await enderecos({})).toEqual(["/auditoria/exportar"]);
    expect(await enderecos({ periodo: "30", alertas: "1" })).toEqual(["/auditoria/exportar?periodo=30&alertas=1"]);
  });

  it("uma página que falha ou os nomes que não se leram: nada de arquivo pela metade", async () => {
    cenario.tabelas.auditoria = Array.from({ length: 600 }, (_, n) => evento(n + 1));
    cenario.falhaNaPagina = "auditoria";
    await expect(baixar("periodo=7")).rejects.toThrow("auditoria_exportar");
    cenario.falhaNaPagina = "perfis_usuario";
    await expect(baixar("periodo=7")).rejects.toThrow("auditoria_exportar_pessoas");
  });
});

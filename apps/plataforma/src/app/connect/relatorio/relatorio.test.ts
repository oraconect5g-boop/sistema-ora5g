// A tela do relatório do vendedor e da loja da Ora Connect (lote CONNECT-k), com a sessão e o Supabase SIMULADOS: nenhuma
// credencial; pessoas, lojas e operações FICTÍCIAS. Quem vê o quê no banco é a RLS de connect_operacoes (provada em
// packages/banco); aqui, os filtros que a tela manda e o que ela mostra.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA_A = "00000000-0000-4000-9000-0000000000a1";
const LOJA_B = "00000000-0000-4000-9000-0000000000a2";
const ANA = "00000000-0000-4000-9000-0000000000b1";
const BIA = "00000000-0000-4000-9000-0000000000b2";
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  operacoes: [] as Record<string, unknown>[],
  filtros: [] as string[],
  // AUD-f: a soma do banco (connect_somas_por): os filtros que a tela mandou e se ela falha.
  somas: [] as Record<string, unknown>[],
  somaFalha: false,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => { throw new Error(`redirecionou para ${d}`); }, useRouter: () => ({ refresh: () => undefined }) }));
class Consulta {
  linhas: Record<string, unknown>[];
  tabela: string;
  constructor(tabela: string, linhas: Record<string, unknown>[]) { this.tabela = tabela; this.linhas = [...linhas]; }
  contar = false;
  total: number | null = null;
  select(_colunas?: string, opcoes?: { count?: string }) { this.contar = opcoes?.count === "exact"; return this; }
  order() { return this; }
  limit() { return this; }
  range(de: number, ate: number) { this.total = this.linhas.length; this.linhas = this.linhas.slice(de, ate + 1); return this; }
  gte(campo: string) { cenario.filtros.push(`${this.tabela}.${campo}>=`); return this; }
  lte(campo: string) { cenario.filtros.push(`${this.tabela}.${campo}<=`); return this; }
  eq(campo: string, valor: unknown) { cenario.filtros.push(`${this.tabela}.${campo}=${String(valor)}`); this.linhas = this.linhas.filter((l) => l[campo] === valor); return this; }
  in(campo: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[campo])); return this; }
  then(resolver: (r: { data: unknown; error: null; count?: number }) => unknown) {
    return Promise.resolve({ data: this.linhas, error: null, ...(this.contar ? { count: this.total ?? this.linhas.length } : {}) }).then(resolver);
  }
}
// A soma do banco de mentira: as mesmas categorias da função, pelas operações do cenário e pelos filtros que a tela mandou.
function somasFalsas(argumentos: Record<string, unknown>) {
  const grupos = new Map<string, Record<string, number | string>>();
  for (const l of cenario.operacoes.filter((o) => (!argumentos.p_unidade || o.unidade_id === argumentos.p_unidade) && (!argumentos.p_vendedor || o.vendedor_id === argumentos.p_vendedor))) {
    const chave = `${String(l.vendedor_id)}|${String(l.unidade_id)}`;
    const g = grupos.get(chave) ?? { vendedor_id: String(l.vendedor_id), unidade_id: String(l.unidade_id), operacoes: 0, ativacoes: 0, recargas: 0, portabilidades: 0,
      em_andamento: 0, sem_resultado: 0, nao_feitas: 0, valor_de_face_centavos: 0, recebido_centavos: 0 };
    const mais = (campo: string, v = 1) => { g[campo] = Number(g[campo]) + v; };
    mais("operacoes");
    if (l.situacao === "confirmada") {
      mais(l.tipo === "ativacao" ? "ativacoes" : l.tipo === "recarga" ? "recargas" : "portabilidades");
      if (l.tipo !== "portabilidade") mais("valor_de_face_centavos", Number(l.valor_face_centavos ?? 0));
      mais("recebido_centavos", Number(l.recebido_na_loja_centavos ?? 0));
    } else if (["registrada", "enviando", "aguardando_operadora"].includes(String(l.situacao))) mais("em_andamento");
    else if (["resultado_desconhecido", "erro_operadora"].includes(String(l.situacao))) mais("sem_resultado");
    else mais("nao_feitas");
    grupos.set(chave, g);
  }
  return [...grupos.values()];
}
const TABELAS: Record<string, () => Record<string, unknown>[]> = {
  connect_operacoes: () => cenario.operacoes,
  unidades: () => [{ id: LOJA_A, nome: "Água Verde", tipo: "loja_fisica" }, { id: LOJA_B, nome: "Butiatuvinha", tipo: "loja_fisica" }],
  perfis_usuario: () => [{ id: ANA, nome: "Ana (fictícia)" }, { id: BIA, nome: "Bia (fictícia)" }],
};
const sessaoFicticia = {
  usuario: { id: ANA },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA_A, unidade_nome: "Água Verde", turno_termina_em: "2026-11-26T03:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Pessoa (fictícia)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: (tabela: string) => new Consulta(tabela, TABELAS[tabela]?.() ?? []),
    rpc: async (nome: string, argumentos: Record<string, unknown>) => {
      if (nome !== "connect_somas_por") return { data: null, error: { code: "PGRST202" } };
      cenario.somas.push(argumentos);
      return cenario.somaFalha ? { data: null, error: { code: "57014" } } : { data: somasFalsas(argumentos), error: null };
    },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error { constructor(m: string) { super(`falha: ${m}`); } },
  obterSessao: async () => sessaoFicticia,
}));

import RelatorioDaConnect from "./page";

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
const abrir = async (busca: Record<string, string> = {}) => texto(await RelatorioDaConnect({ searchParams: Promise.resolve(busca) } as never)).replace(/\s+/g, " ");
const emOrdem = (t: string, ...partes: string[]) => expect(t).toMatch(new RegExp(partes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*?")));
const op = (o: Record<string, unknown>) => ({
  id: `o${String(o.numero)}`, tipo: "recarga", situacao: "confirmada", vendedor_id: ANA, unidade_id: LOJA_A, plano_nome: "10 GB", valor_face_centavos: 5490,
  recebido_na_loja_centavos: 5490, linha: "41999998888", criado_em: "2026-11-25T13:00:00Z", ...o,
});

beforeEach(() => {
  cenario.permissoes = new Set(["connect.operar", "connect.gerir"]);
  cenario.filtros = [];
  cenario.somas = [];
  cenario.somaFalha = false;
  cenario.operacoes = [
    op({ numero: 1, tipo: "ativacao", valor_face_centavos: 4990, recebido_na_loja_centavos: 4990 }),
    op({ numero: 2 }),
    op({ numero: 3, vendedor_id: BIA, situacao: "aguardando_operadora" }),
    op({ numero: 4, vendedor_id: BIA, unidade_id: LOJA_B }),
  ];
});

describe("o relatório do vendedor e da loja (CONNECT-k)", () => {
  it("quem gere: a loja do turno por padrão, com as somas, a tabela por vendedor e as operações para imprimir e exportar", async () => {
    const t = await abrir();
    expect(cenario.filtros).toEqual(expect.arrayContaining(["connect_operacoes.criado_em>=", "connect_operacoes.criado_em<=", `connect_operacoes.unidade_id=${LOJA_A}`]));
    emOrdem(t, "Relatório da Ora Connect", "Água Verde · Hoje");
    emOrdem(t, "Ativações confirmadas", "1", "Recargas confirmadas", "1", "Recebido na loja", "R$ 104,80", "Pendentes", "1");
    emOrdem(t, "Por vendedor", "Ana (fictícia)", "Bia (fictícia)");
    emOrdem(t, "Operações", "3 no período", "Exportar CSV", "Imprimir ou salvar em PDF", "Nº 3 · Recarga", "Aceita pela Nogle");
  });

  it("quem gere escolhe a rede (com a tabela por loja) ou um vendedor (o relatório individual dele)", async () => {
    const rede = await abrir({ loja: "rede" });
    expect(cenario.filtros.some((f) => f.includes("unidade_id="))).toBe(false);
    emOrdem(rede, "Toda a rede", "Por loja", "Água Verde", "Butiatuvinha");
    cenario.filtros = [];
    const daBia = await abrir({ loja: "rede", vendedor: BIA, periodo: "30" });
    expect(cenario.filtros).toContain(`connect_operacoes.vendedor_id=${BIA}`);
    emOrdem(daBia, "Bia (fictícia) · 30 dias", "Recargas confirmadas", "1", "Pendentes", "1");
    expect(daBia).not.toContain("Por vendedor");
  });

  it("quem só opera vê só o próprio relatório, sem escolher loja nem vendedor; sem a Ora Connect, só o aviso", async () => {
    cenario.permissoes = new Set(["connect.operar"]);
    const t = await abrir({ loja: "rede", vendedor: BIA });
    expect(cenario.filtros).toContain(`connect_operacoes.vendedor_id=${ANA}`);
    expect(cenario.filtros.some((f) => f.includes("unidade_id="))).toBe(false);
    emOrdem(t, "Ana (fictícia) · Hoje");
    expect(t).not.toContain("Toda a rede (as lojas que você vê)");
    cenario.permissoes = new Set(["venda.registrar"]);
    expect(await abrir()).toContain("O relatório da Ora Connect é de quem opera ou gere a Ora Connect.");
  });
});

describe("AUD-f: os totais do período inteiro, a lista em páginas e o recorte dito", () => {
  // 5.100 operações fictícias da Ana na loja A (a mais nova primeiro): mais do que uma leitura da API e mais do que a planilha.
  const muitas = () => Array.from({ length: 5_100 }, (_, i) => op({ numero: 5_100 - i, id: `m${5_100 - i}`, situacao: i % 2 ? "confirmada" : "aguardando_operadora" }));

  it("os totais vêm somados do banco com os mesmos filtros da lista, mesmo com mais operações do que a tela lê", async () => {
    cenario.operacoes = muitas();
    const t = await abrir();
    expect(cenario.somas).toEqual([expect.objectContaining({ p_unidade: LOJA_A })]);
    emOrdem(t, "Recargas confirmadas", "2.550", "Pendentes", "2.550");
    expect(t).not.toContain("um recorte, não o total");
    emOrdem(t, "Operações", "1–200 de 5.100, da mais recente para a mais antiga; a planilha leva as 5.000 mais recentes", "Nº 5100 ·");
    expect(t).not.toContain("Nº 4900 ·");
  });

  it("a lista em páginas de 200, na mesma ordem; a página fora do fim volta à última", async () => {
    cenario.operacoes = muitas();
    let t = await abrir({ pagina: "2" });
    emOrdem(t, "201–400 de 5.100", "Nº 4900 ·");
    expect(t).not.toContain("Nº 5100 ·");
    t = await abrir({ pagina: "999" });
    emOrdem(t, "4.801–5.000 de 5.100", "Nº 300 ·");
  });

  it("sem a soma do banco, os números são das operações lidas e a tela diz que é um recorte", async () => {
    cenario.operacoes = muitas();
    cenario.somaFalha = true;
    const t = await abrir();
    expect(t).toContain("os números abaixo são só das 5.000 operações mais recentes de 5.100 (um recorte, não o total)");
    emOrdem(t, "Recargas confirmadas", "2.500");
    // Com todas lidas, sem recorte: sem o aviso.
    cenario.operacoes = muitas().slice(0, 300);
    expect(await abrir()).not.toContain("um recorte, não o total");
  });
});

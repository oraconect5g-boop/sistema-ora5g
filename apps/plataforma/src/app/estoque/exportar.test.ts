// Planilhas do estoque (lote FIN-009b: ORA-FIN-009) pela rota /estoque/exportar, com sessão e Supabase simulados:
// um PostgREST em memória que filtra, ordena e corta cada resposta no teto de 1.000 linhas, sem aviso, como o da
// API. Confere a permissão, o recorte (o mesmo do painel), a leitura completa em páginas, o Excel e o CSV, e que
// falha ou nome que não se leu nunca vira arquivo pela metade. Dados fictícios.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { abrirXlsx, linhasDaFolha } from "../../lib/xlsx-de-teste";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const DEFEITOS = "00000000-0000-4000-8000-0000000000d0";
type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  permissao: true,
  /** estoque_painel: os locais que a pessoa consulta, a função ausente ou a falha. */
  painel: "ok" as "ok" | "ausente" | "falha",
  locais: [] as Linha[],
  tabelas: {} as Record<string, Linha[]>,
  /** Tabela cuja segunda página falha (uma leitura que cai no meio). */
  falhaNaPagina: null as string | null,
  pedidos: [] as { tabela: string; de: number; ate: number }[],
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
  order(coluna: string) { this.ordem.push(coluna); return this; }
  range(de: number, ate: number) { this.de = de; this.ate = ate; return this; }
  then(resolver: (r: unknown) => unknown) {
    cenario.pedidos.push({ tabela: this.tabela, de: this.de, ate: this.ate });
    if (cenario.falhaNaPagina === this.tabela && this.de > 0) return Promise.resolve({ data: null, error: { code: "57014" } }).then(resolver);
    const ordenadas = [...this.linhas].sort((a, b) => { for (const c of this.ordem) { const d = String(a[c]).localeCompare(String(b[c])); if (d) return d; } return 0; });
    return Promise.resolve({ data: ordenadas.slice(this.de, Math.min(this.ate, this.de + TETO - 1) + 1), error: null }).then(resolver);
  }
}
const ZERO = { fisico: 0, reservado: 0, disponivel: 0, abaixo_do_minimo: 0, parado: 0, chegando: 0 };
const SEM = { a_separar: 0, a_enviar: 0, a_receber: 0, inventarios_abertos: 0, retornos_a_conferir: 0, sem_conferencia_hoje: 0 };
const supabase = {
  from: (tabela: string) => new Consulta(tabela),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: argumentos.p_permissao === "estoque.consultar" && cenario.permissao, error: null };
    if (nome === "estoque_painel") {
      if (cenario.painel === "ausente") return { data: null, error: { code: "PGRST202" } };
      if (cenario.painel === "falha") return { data: null, error: { code: "57014" } };
      return { data: { totais: { ...ZERO, fora_da_venda: 0 }, locais: cenario.locais, modelos: [], categorias: [] }, error: null };
    }
    return { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-15T23:00:00Z" },
    supabase,
  }),
}));

import { GET } from "./exportar/route";

const local = (unidade_id: string, nome: string, vende = true) => ({ unidade_id, nome, tipo: vende ? "loja_fisica" : "excecao", vende, ...ZERO, ...SEM });
const id = (prefixo: string, n: number) => `00000000-0000-4000-${prefixo}-${String(n).padStart(12, "0")}`;
const variante = (n: number, mudancas: Linha = {}) => ({
  id: id("9000", n), nome: `Capa modelo ${String(n).padStart(4, "0")}`, sku: `CAP-${String(n).padStart(4, "0")}`, estoque_minimo: 0, produto_id: id("9100", n % 3), ...mudancas,
});
const PRODUTOS = [0, 1, 2].map((n) => ({ id: id("9100", n), nome: `Capa linha ${n}`, categoria_id: "c-ace", marca_id: n === 0 ? null : "m-ora" }));
const ITEM = (n: number, unidade: string, mudancas: Linha = {}) => ({
  id: id("9200", n), unidade_id: unidade, variante_id: id("9000", 1), imei: `35123456789${String(n).padStart(4, "0")}`, imei2: null, iccid: null, numero_serie: null,
  situacao: "disponivel", condicao: "novo", criado_em: "2026-11-01T15:00:00Z", conferido_em: null, em_estoque: true, ...mudancas,
});

async function baixar(consulta = "") {
  const r = await GET(new Request(`http://localhost/estoque/exportar${consulta ? `?${consulta}` : ""}`));
  return r;
}
async function folha(consulta = "") {
  const r = await baixar(consulta);
  expect(r.status).toBe(200);
  const partes = abrirXlsx(new Uint8Array(await r.arrayBuffer()));
  return { r, linhas: linhasDaFolha(partes.get("xl/worksheets/sheet1.xml") ?? ""), pasta: partes.get("xl/workbook.xml") ?? "" };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, {
    permissao: true, painel: "ok", falhaNaPagina: null, pedidos: [],
    locais: [local(LOJA, "Santa Cândida (teste)")],
    tabelas: {
      estoque_saldos: [
        { unidade_id: LOJA, variante_id: id("9000", 2), quantidade: 5, reservado: 1 },
        { unidade_id: LOJA, variante_id: id("9000", 1), quantidade: 2, reservado: 0 },
        { unidade_id: OUTRA, variante_id: id("9000", 1), quantidade: 9, reservado: 0 },
        { unidade_id: DEFEITOS, variante_id: id("9000", 1), quantidade: 3, reservado: 0 },
      ],
      variantes: [variante(1, { estoque_minimo: 4 }), variante(2)],
      produtos: PRODUTOS,
      categorias: [{ id: "c-ace", nome: "Acessórios" }],
      marcas: [{ id: "m-ora", nome: "Ora" }],
      itens_serializados: [
        ITEM(1, LOJA, { iccid: null }),
        ITEM(2, LOJA, { imei: null, iccid: "89550100123456789012", situacao: "reservado", condicao: "seminovo", conferido_em: "2026-11-15T01:30:00Z" }),
        ITEM(3, LOJA, { em_estoque: false, situacao: "vendido" }),
        ITEM(4, OUTRA),
      ],
    },
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("planilhas do estoque pela rota (FIN-009b)", () => {
  it("sem estoque.consultar na loja do turno: 403, sem ler nada", async () => {
    cenario.permissao = false;
    const r = await baixar();
    expect(r.status).toBe(403);
    expect(await r.text()).toBe("Sem permissão para exportar o estoque.");
    expect(cenario.pedidos).toEqual([]);
  });

  it("o padrão: o saldo da loja do turno, no Excel, com o número de cada coluna e o nome do arquivo", async () => {
    const { r, linhas, pasta } = await folha();
    expect(r.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="ora5g-estoque-saldo-santa-candida-teste.xlsx"');
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(pasta).toContain('<sheet name="Saldo por produto"');
    expect(linhas[0]).toEqual(["Estoque", "Saldo por produto", "Santa Cândida (teste)"]);
    expect(linhas[1]?.[2]).toBe("2 linhas");
    expect(linhas.slice(4)).toEqual([
      ["Local", "SKU", "Variação", "Produto", "Marca", "Categoria", "Físico", "Reservado", "Disponível para vender", "Mínimo", "Abaixo do mínimo"],
      ["Santa Cândida (teste)", "CAP-0001", "Capa modelo 0001", "Capa linha 1", "Ora", "Acessórios", 2, 0, 2, 4, "Sim"],
      ["Santa Cândida (teste)", "CAP-0002", "Capa modelo 0002", "Capa linha 2", "Ora", "Acessórios", 5, 1, 4, 0],
    ]);
    // só a loja do turno foi pedida ao banco, em páginas: a leitura avança pelo que veio e para na página vazia
    expect(cenario.pedidos.filter((p) => p.tabela === "estoque_saldos")).toEqual([{ tabela: "estoque_saldos", de: 0, ate: 499 }, { tabela: "estoque_saldos", de: 2, ate: 501 }]);
  });

  it("quem consulta vários locais: um deles, a rede inteira (o que não vende à parte) ou 403 no que não consulta", async () => {
    cenario.locais = [local(LOJA, "Santa Cândida (teste)"), local(OUTRA, "Loja 02 (teste)"), local(DEFEITOS, "DEFEITOS (teste)", false)];
    // sem escolher: a loja do turno
    expect((await folha()).linhas.slice(5).map((l) => l[0])).toEqual(["Santa Cândida (teste)", "Santa Cândida (teste)"]);
    const outra = await folha(`loja=${OUTRA}`);
    expect(outra.r.headers.get("content-disposition")).toBe('attachment; filename="ora5g-estoque-saldo-loja-02-teste.xlsx"');
    expect(outra.linhas.slice(5)).toEqual([["Loja 02 (teste)", "CAP-0001", "Capa modelo 0001", "Capa linha 1", "Ora", "Acessórios", 9, 0, 9, 4]]);
    const rede = await folha("loja=rede");
    expect(rede.linhas[0]).toEqual(["Estoque", "Saldo por produto", "Rede inteira"]);
    expect(rede.linhas.slice(5).map((l) => [l[0], l[6], l[8], l[10] ?? null])).toEqual([
      ["DEFEITOS (teste) (não vende)", 3, 0, null],
      ["Loja 02 (teste)", 9, 9, null],
      ["Santa Cândida (teste)", 2, 2, "Sim"],
      ["Santa Cândida (teste)", 5, 4, null],
    ]);
    const recusada = await baixar("loja=00000000-0000-4000-8000-000000000999");
    expect(recusada.status).toBe(403);
    expect(await recusada.text()).toBe("Sem permissão para exportar o estoque deste local.");
  });

  it("aparelhos e chips: só o que está no estoque, com o IMEI e o ICCID inteiros (texto) e as datas de São Paulo", async () => {
    const { r, linhas, pasta } = await folha("parte=itens");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="ora5g-estoque-aparelhos-e-chips-santa-candida-teste.xlsx"');
    expect(pasta).toContain('<sheet name="Aparelhos e chips"');
    expect(linhas[1]?.[2]).toBe("2 itens");
    expect(linhas.slice(5)).toEqual([
      ["Santa Cândida (teste)", "CAP-0001", "Capa modelo 0001", "351234567890001", null, null, null, "Disponível", "Novo", expect.closeTo(46_327.5, 6)],
      ["Santa Cândida (teste)", "CAP-0001", "Capa modelo 0001", null, null, "89550100123456789012", null, "Reservado (numa venda)", "Seminovo", expect.closeTo(46_327.5, 6), expect.closeTo(46_340.9375, 6)],
    ]);
    // o item vendido (fora do estoque) e o da outra loja não entram
    expect(JSON.stringify(linhas)).not.toContain("351234567890003");
    expect(JSON.stringify(linhas)).not.toContain("351234567890004");
  });

  it("CSV: as mesmas linhas, para outros sistemas, com o instante escrito em São Paulo", async () => {
    const r = await baixar("parte=itens&formato=csv");
    expect(r.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="ora5g-estoque-aparelhos-e-chips-santa-candida-teste.csv"');
    // o BOM fica (o Excel em português lê o arquivo como UTF-8); r.text() o tiraria
    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await r.arrayBuffer());
    expect(csv.startsWith("﻿Estoque;Aparelhos e chips;Santa Cândida (teste)\r\n")).toBe(true);
    expect(csv).toContain("\r\nSanta Cândida (teste);CAP-0001;Capa modelo 0001;;;89550100123456789012;;Reservado (numa venda);Seminovo;01/11/2026 12:00;14/11/2026 22:30");
  });

  it("leitura completa: 1.200 saldos saem inteiros, em páginas abaixo do teto da API", async () => {
    cenario.tabelas.variantes = Array.from({ length: 1200 }, (_, n) => variante(n + 1));
    cenario.tabelas.estoque_saldos = cenario.tabelas.variantes.map((v) => ({ unidade_id: LOJA, variante_id: v.id, quantidade: 1, reservado: 0 }));
    const { linhas } = await folha();
    expect(linhas[1]?.[2]).toBe("1.200 linhas");
    expect(linhas.slice(5)).toHaveLength(1200);
    expect(linhas.at(-1)?.[1]).toBe("CAP-1200");
    expect(cenario.pedidos.filter((p) => p.tabela === "estoque_saldos").map((p) => [p.de, p.ate])).toEqual([[0, 499], [500, 999], [1000, 1499], [1200, 1699]]);
  });

  it("banco sem o painel do estoque: a loja do turno, mesmo pedindo a rede; falha do painel derruba o arquivo", async () => {
    cenario.painel = "ausente";
    const { linhas } = await folha("loja=rede");
    expect(linhas[0]).toEqual(["Estoque", "Saldo por produto", "Santa Cândida (teste)"]);
    expect(linhas.slice(5).map((l) => l[0])).toEqual(["Santa Cândida (teste)", "Santa Cândida (teste)"]);
    cenario.painel = "falha";
    await expect(baixar()).rejects.toThrow("estoque_exportar_locais");
  });

  it("uma página que falha ou um nome que não se leu: nada de arquivo pela metade", async () => {
    cenario.tabelas.variantes = Array.from({ length: 600 }, (_, n) => variante(n + 1));
    cenario.tabelas.estoque_saldos = cenario.tabelas.variantes.map((v) => ({ unidade_id: LOJA, variante_id: v.id, quantidade: 1, reservado: 0 }));
    cenario.falhaNaPagina = "estoque_saldos";
    await expect(baixar()).rejects.toThrow("estoque_exportar_saldos");
    cenario.falhaNaPagina = null;
    cenario.tabelas.categorias = [];
    await expect(baixar()).rejects.toThrow("estoque_exportar_nomes");
    cenario.tabelas.categorias = [{ id: "c-ace", nome: "Acessórios" }];
    cenario.tabelas.variantes = cenario.tabelas.variantes.slice(1);
    await expect(baixar()).rejects.toThrow("estoque_exportar_nomes");
  });
});

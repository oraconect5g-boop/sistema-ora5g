// Os pedidos dos marketplaces (lote MKTPL-a: ORA-MKTPL-003, ORA-MKTPL-005 e ORA-MKTPL-008; ADR-018) com a sessão e o Supabase
// SIMULADOS: nenhuma credencial, arquivos e números fictícios. As regras do banco estão em packages/banco/src/marketplaces.test.ts;
// a leitura do arquivo, em lib/marketplaces.
import { createHash } from "node:crypto";

import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const IMPORTACAO = "00000000-0000-4000-9000-0000000000f2";
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, Resposta>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(linhas: Record<string, unknown>[]) { this.linhas = [...linhas]; }
  select() { return this; }
  order() { return this; }
  limit() { return this; }
  then(resolver: (r: Resposta) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-17T23:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Dono (fictício)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: (nome: string) => new Consulta(cenario.tabelas[nome] ?? []),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: null };
    },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { POST } from "./enviar/route";
import Marketplaces from "./page";

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
const limpar = (v: unknown) => texto(v).replace(/\s+/g, " ");
const chamadas = (nome: string) => cenario.chamadas.filter((c) => c.nome === nome).map((c) => c.argumentos);
const PAINEL_VAZIO = { canais: [], anuncios: [], pedidos: [], pedidos_no_periodo: 0, itens_sem_produto: 0 };

beforeEach(() => {
  cenario.permissoes = new Set(["resultado.ver"]);
  cenario.chamadas = [];
  cenario.respostas = { marketplace_painel: { data: PAINEL_VAZIO, error: null } };
  cenario.tabelas = {};
});

describe("o envio dos pedidos de um marketplace (rota)", () => {
  const csv = "Pedido;Data;Estado;SKU;Unidades;Valor;Tarifa\r\n#2000001;17/11/2026;Entregue;MLB-1;1;79,00;-10,27\r\n2000002;17/11/2026;A caminho;GAL;1;1.499,00;-150,00\r\nTotal;;;;;1.578,00;\r\n";
  const enviar = (campos: Record<string, string>, conteudo: string | null = csv) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    if (conteudo !== null) f.set("arquivo", new File([conteudo], "vendas.csv", { type: "text/csv" }));
    return POST(new Request("http://localhost/relatorios/marketplaces/enviar", { method: "POST", body: f }) as never);
  };
  const destino = (r: Response) => r.headers.get("location") ?? "";
  const certo = { canal: "mercado_livre", modo: "em_cada_linha", coluna_pedido: "0", coluna_data: "1", coluna_situacao: "2", coluna_codigo: "3", coluna_quantidade: "4", coluna_valor: "5", coluna_tarifas: "6" };

  it("junta as linhas de cada pedido e grava com a impressão digital", async () => {
    cenario.respostas.marketplace_importar = { data: { importacao: IMPORTACAO, numero: 1, pedidos: 2, novos: 2, atualizados: 0, repetido: false }, error: null };
    const resposta = await enviar(certo);
    expect(resposta.status).toBe(303);
    expect(destino(resposta)).toBe("/relatorios/marketplaces?ok=importado&novos=2&atualizados=0");
    expect(chamadas("marketplace_importar")).toEqual([{
      p_canal: "mercado_livre", p_arquivo: "vendas.csv", p_impressao: createHash("sha256").update(csv).digest("hex"), p_linhas: 2,
      p_pedidos: [
        { id_externo: "2000001", data: "2026-11-17", situacao: "Entregue", bruto: 7_900, tarifas: 1_027, itens: [{ numero: 2, codigo: "MLB-1", quantidade: 1, valor: 7_900 }] },
        { id_externo: "2000002", data: "2026-11-17", situacao: "A caminho", bruto: 149_900, tarifas: 15_000, itens: [{ numero: 3, codigo: "GAL", quantidade: 1, valor: 149_900 }] },
      ],
      p_mapeamento: { formato: "csv", modo: "em_cada_linha", colunas: { pedido: "Pedido", data: "Data", situacao: "Estado", codigo: "SKU", quantidade: "Unidades", valor: "Valor", tarifas: "Tarifa" }, de_fora: 1 },
    }]);
  });

  it("canal, modo e colunas conferidos antes de ler; a linha ruim volta apontada; quem não é o dono nem tem o arquivo lido", async () => {
    expect(destino(await enviar({ ...certo, canal: "amazon" }))).toBe("/relatorios/marketplaces?erro=canal");
    expect(destino(await enviar({ ...certo, modo: "outro" }))).toBe("/relatorios/marketplaces?erro=modo");
    expect(destino(await enviar({ ...certo, coluna_valor: "" }))).toBe("/relatorios/marketplaces?erro=mapeamento");
    expect(destino(await enviar(certo, "Pedido;Data;Estado;SKU;Unidades;Valor;Tarifa\nA1;32/11/2026;;;1;1,00;\n"))).toBe("/relatorios/marketplaces?erro=linha&linha=2&campo=data&texto=32%2F11%2F2026");
    cenario.permissoes = new Set(["venda.ver_todas"]);
    expect(destino(await enviar(certo))).toBe("/relatorios/marketplaces?erro=permissao");
    expect(chamadas("marketplace_importar")).toEqual([]);
  });

  it("o mesmo arquivo de novo não muda nada; a recusa do banco vira a mensagem do catálogo", async () => {
    cenario.respostas.marketplace_importar = { data: { importacao: IMPORTACAO, numero: 1, pedidos: 2, novos: 0, atualizados: 0, repetido: true }, error: null };
    expect(destino(await enviar(certo))).toBe("/relatorios/marketplaces?ok=repetido");
    cenario.respostas.marketplace_importar = { data: null, error: { code: "22023", message: "Pedido do arquivo fora do formato" } };
    expect(destino(await enviar(certo))).toBe("/relatorios/marketplaces?erro=dados");
  });
});

describe("a tela dos marketplaces", () => {
  const params = (p: Record<string, string> = {}) => ({ searchParams: Promise.resolve(p) }) as never;

  it("quem não vê o resultado da rede vê o aviso, sem ler nada", async () => {
    cenario.permissoes = new Set(["venda.ver_todas"]);
    expect(limpar(await Marketplaces(params()))).toContain("Os pedidos dos marketplaces são do dono");
    expect(cenario.chamadas).toEqual([]);
  });

  it("por canal, anúncio e pedido: o bruto, o que ficou com o canal, o líquido e o lucro; as fórmulas à vista", async () => {
    cenario.respostas.marketplace_painel = { data: {
      canais: [{ canal: "shopee", pedidos: 3, unidades: 4, bruto: 28_700, reembolsos: 7_900, tarifas: 2_500, frete: 800, liquido: 16_700, liquidos_estimados: 1,
        custo: 6_000, lucro: 6_500, pedidos_sem_custo: 1 }],
      anuncios: [{ canal: "shopee", codigo: "SHP-9", titulo: null, variante_id: null, produto: "Capa do Galaxy", unidades: 3, bruto: 23_700, liquido: 12_500, custo: 6_000, lucro: 6_500 },
        { canal: "shopee", codigo: "NADA", titulo: "Película", variante_id: null, produto: null, unidades: 1, bruto: 5_000, liquido: 4_200, custo: null, lucro: null }],
      pedidos: [{ id: "x", canal: "shopee", id_externo: "A2", data: "2026-11-17", situacao: "Cancelado", bruto: 7_900, tarifas: 500, frete: 0, reembolsos: 7_900,
        liquido: -500, liquido_estimado: false, data_repasse: "2026-11-20", unidades: 1, custo: 0, lucro: -500, itens_sem_custo: 0 }],
      pedidos_no_periodo: 3, itens_sem_produto: 1,
    }, error: null };
    cenario.tabelas.marketplace_importacoes = [{ id: IMPORTACAO, numero: 1, canal: "shopee", arquivo: "vendas.xlsx", periodo_inicio: "2026-11-17", periodo_fim: "2026-11-17",
      pedidos: 3, novos: 3, atualizados: 0, importado_em: "2026-11-17T21:00:00Z" }];
    const tela = limpar(await Marketplaces(params({ inicio: "2026-11-17", fim: "2026-11-17", ok: "importado", novos: "3", atualizados: "0" })));
    for (const trecho of ["De 17/11/2026 a 17/11/2026", "Pedidos importados:", "3 novos", "R$ 287,00", "R$ 167,00", "Lucro estimado", "R$ 65,00", "fora 1 pedido sem custo",
      "Shopee · 3 pedidos · 4 unidades", "reembolsos R$ 79,00", "tarifas R$ 25,00", "frete R$ 8,00", "líquido R$ 167,00", "(1 estimado)", "margem 22,6%",
      "Capa do Galaxy", "Película", "sem produto ligado", "Shopee nº A2", "Cancelado", "reembolso R$ 79,00", "repasse em 20/11/2026", "lucro -R$ 5,00",
      "Como cada número é calculado", "nº 1 · Shopee · vendas.xlsx"]) {
      expect(tela, trecho).toContain(trecho);
    }
    expect(chamadas("marketplace_painel")).toEqual([{ p_inicio: "2026-11-17", p_fim: "2026-11-17" }]);
  });
});

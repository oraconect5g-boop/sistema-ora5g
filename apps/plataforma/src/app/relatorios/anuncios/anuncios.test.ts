// O custo dos anúncios (lote META-a: ORA-META-001 por arquivo, ORA-META-003, ORA-META-004 e ORA-META-006; ADR-017) com a
// sessão e o Supabase SIMULADOS: nenhuma credencial, arquivos e números fictícios. As regras do banco estão em
// packages/banco/src/anuncios.test.ts; a leitura do arquivo e as fórmulas, em lib/anuncios.
import { createHash } from "node:crypto";

import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDEDOR = "00000000-0000-4000-8000-0000000000aa";
const IMPORTACAO = "00000000-0000-4000-9000-0000000000f1";
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
import Anuncios from "./page";

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
const PAINEL_VAZIO = { campanhas: [], por_loja: [], por_vendedor: [], contatos_sem_campanha: 0, importado_ate: null };

beforeEach(() => {
  cenario.permissoes = new Set(["resultado.ver"]);
  cenario.chamadas = [];
  cenario.respostas = { anuncios_painel: { data: PAINEL_VAZIO, error: null } };
  cenario.tabelas = {};
});

describe("o envio do custo dos anúncios (rota)", () => {
  const csv = "Dia;Nome da campanha;Valor usado (BRL);Impressões;Cliques no link\r\n17/11/2026;Natal 2026;R$ 150,25;12.345;321\r\n;Total;150,25;12.345;321\r\n";
  const enviar = (campos: Record<string, string>, conteudo: string | null = csv) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    if (conteudo !== null) f.set("arquivo", new File([conteudo], "relatorio.csv", { type: "text/csv" }));
    return POST(new Request("http://localhost/relatorios/anuncios/enviar", { method: "POST", body: f }) as never);
  };
  const destino = (r: Response) => r.headers.get("location") ?? "";
  const colunas = { coluna_dia: "0", coluna_campanha: "1", coluna_gasto: "2", coluna_impressoes: "3", coluna_cliques: "4" };

  it("lê o arquivo, monta os dias de campanha e grava com a impressão digital", async () => {
    cenario.respostas.anuncios_importar = { data: { importacao: IMPORTACAO, numero: 1, campanhas: 1, dias_de_campanha: 1, substituidos: 0, repetido: false }, error: null };
    const resposta = await enviar(colunas);
    expect(resposta.status).toBe(303);
    expect(destino(resposta)).toBe("/relatorios/anuncios?ok=importado&campanhas=1&dias=1&substituidos=0");
    expect(chamadas("anuncios_importar")).toEqual([{
      p_plataforma: "meta", p_arquivo: "relatorio.csv", p_impressao: createHash("sha256").update(csv).digest("hex"),
      p_linhas: [{ numero: 2, dia: "2026-11-17", campanha: "Natal 2026", gasto: 15_025, impressoes: 12_345, cliques: 321 }],
      p_mapeamento: { formato: "csv", colunas: { dia: "Dia", campanha: "Nome da campanha", gasto: "Valor usado (BRL)", impressoes: "Impressões", cliques: "Cliques no link" }, moeda: "BRL", moeda_conferida_por: "cabecalho", de_fora: 1 },
    }]);
  });

  it("o arquivo que não é por dia volta apontado, sem ir ao banco; quem não é o dono nem tem o arquivo lido", async () => {
    const mensal = "Início;Término;Campanha;Valor\n01/11/2026;30/11/2026;Natal;100,00\n";
    expect(destino(await enviar({ coluna_dia: "0", coluna_fim: "1", coluna_campanha: "2", coluna_gasto: "3" }, mensal)))
      .toBe("/relatorios/anuncios?erro=linha&linha=2&campo=por_dia&texto=01%2F11%2F2026+a+30%2F11%2F2026");
    expect(destino(await enviar({ coluna_dia: "0", coluna_campanha: "1" }))).toBe("/relatorios/anuncios?erro=mapeamento");
    expect(destino(await enviar(colunas, null))).toBe("/relatorios/anuncios?erro=arquivo");
    cenario.permissoes = new Set(["venda.ver_todas"]);
    expect(destino(await enviar(colunas))).toBe("/relatorios/anuncios?erro=permissao");
    expect(chamadas("anuncios_importar")).toEqual([]);
  });

  // Lote AUD-a (auditoria do Codex de 17/11; aceite A14): só real. A moeda no nome da coluna recusa o arquivo inteiro; a
  // coluna Moeda, quando escolhida, aponta a linha.
  it("o arquivo em outra moeda volta recusado, sem ir ao banco; a linha em dólar, apontada", async () => {
    const emDolar = "Day;Campaign name;Amount spent (USD)\n2026-11-17;Natal;20.00\n";
    expect(destino(await enviar({ coluna_dia: "0", coluna_campanha: "1", coluna_gasto: "2" }, emDolar))).toBe("/relatorios/anuncios?erro=moeda");
    const comColuna = "Dia;Nome da campanha;Valor usado;Moeda\n17/11/2026;Natal;150,00;BRL\n17/11/2026;Capas;20,00;USD\n";
    expect(destino(await enviar({ coluna_dia: "0", coluna_campanha: "1", coluna_gasto: "2", coluna_moeda: "3" }, comColuna)))
      .toBe("/relatorios/anuncios?erro=linha&linha=3&campo=moeda&texto=USD");
    expect(chamadas("anuncios_importar")).toEqual([]);
  });

  it("o mesmo arquivo de novo não muda nada; a recusa do banco vira a mensagem do catálogo", async () => {
    cenario.respostas.anuncios_importar = { data: { importacao: IMPORTACAO, numero: 1, campanhas: 1, dias_de_campanha: 1, substituidos: 0, repetido: true }, error: null };
    expect(destino(await enviar(colunas))).toBe("/relatorios/anuncios?ok=repetido");
    cenario.respostas.anuncios_importar = { data: null, error: { code: "42501", message: "Sem permissão para o custo dos anúncios" } };
    expect(destino(await enviar(colunas))).toBe("/relatorios/anuncios?erro=permissao");
  });
});

describe("a tela dos anúncios", () => {
  const params = (p: Record<string, string> = {}) => ({ searchParams: Promise.resolve(p) }) as never;

  it("quem não vê o resultado da rede vê o aviso, sem ler nada", async () => {
    cenario.permissoes = new Set(["venda.ver_todas"]);
    expect(limpar(await Anuncios(params()))).toContain("O custo dos anúncios é do dono");
    expect(cenario.chamadas).toEqual([]);
  });

  it("por campanha: o custo, os contatos, as vendas e as métricas; a campanha sem contato marcada; as fórmulas à vista", async () => {
    cenario.respostas.anuncios_painel = { data: {
      campanhas: [
        { chave: "natal 2026", campanha: "Natal 2026", gasto: 15_000, impressoes: 10_000, cliques: 200, resultados: 10, dias: 2, reservas: 1, oportunidades: 1,
          vendas: 2, vendas_devolvidas: 0, receita: 15_800, devolvido: 0, margem: 7_000, vendas_sem_custo: 0, recebido: 15_700, reembolsado: 0, clientes_novos: 1 },
        { chave: "sem contato", campanha: "Sem Contato", gasto: 2_000, impressoes: null, cliques: null, resultados: null, dias: 1, reservas: 0, oportunidades: 0,
          vendas: 0, vendas_devolvidas: 0, receita: 0, devolvido: 0, margem: 0, vendas_sem_custo: 0, recebido: 0, reembolsado: 0, clientes_novos: 0 },
      ],
      por_loja: [{ chave: "natal 2026", unidade_id: LOJA, loja: "Santa Cândida", contatos: 2, vendas: 2, receita: 15_800, devolvido: 0 }],
      por_vendedor: [{ chave: "natal 2026", vendedor_id: VENDEDOR, vendas: 2, receita: 15_800, devolvido: 0 }],
      contatos_sem_campanha: 3, importado_ate: "2026-11-17",
    }, error: null };
    cenario.respostas.ranking_nomes = { data: [{ id: VENDEDOR, nome: "Ana (fictícia)" }], error: null };
    cenario.tabelas.anuncios_importacoes = [{ id: IMPORTACAO, numero: 1, arquivo: "relatorio.csv", periodo_inicio: "2026-11-16", periodo_fim: "2026-11-17", campanhas: 2,
      dias_de_campanha: 3, substituidos: 0, gasto_centavos: 17_000, importado_em: "2026-11-17T20:00:00Z" }];
    const tela = limpar(await Anuncios(params({ inicio: "2026-11-16", fim: "2026-11-17", ok: "importado", campanhas: "2", dias: "3", substituidos: "1" })));
    // O texto lido junta as partes da tela com espaço: os trechos evitam a emenda entre duas partes.
    for (const trecho of ["De 16/11/2026 a 17/11/2026", "Custo importado: 2 campanhas", "3 dias de campanha", "1 dia substituído pelo arquivo novo", "Valor usado", "R$ 170,00",
      "custo importado até 17/11/2026", "Natal 2026", "1 do site, 1 do CRM)", "CPL R$ 75,00", "CPA R$ 75,00", "receita R$ 158,00", "ROAS 1,05×",
      "CTR 2%", "CPC R$ 0,75", "10 resultados (Meta), R$ 15,00 cada", "1 cliente novo", "CAC R$ 150,00", "recebido de fato R$ 157,00",
      "custo sem contato: confira o link da campanha", "Santa Cândida · Natal 2026", "Ana (fictícia) · Natal 2026", "3 contatos do período chegaram sem campanha", "Como cada número é calculado",
      "nº 1 · relatorio.csv"]) {
      expect(tela, trecho).toContain(trecho);
    }
    expect(chamadas("anuncios_painel")).toEqual([{ p_inicio: "2026-11-16", p_fim: "2026-11-17" }]);
  });

  it("as devoluções: a venda devolvida por inteiro, a receita líquida, o reembolso; a moeda, o fuso e a atribuição explicados", async () => {
    cenario.respostas.anuncios_painel = { data: {
      campanhas: [{ chave: "black", campanha: "Black", gasto: 10_000, impressoes: null, cliques: null, resultados: null, dias: 1, reservas: 0, oportunidades: 2,
        vendas: 2, vendas_devolvidas: 1, receita: 23_700, devolvido: 15_800, margem: 3_000, vendas_sem_custo: 0, recebido: 23_700, reembolsado: 7_900, clientes_novos: 1 }],
      por_loja: [{ chave: "black", unidade_id: LOJA, loja: "Santa Cândida", contatos: 2, vendas: 2, receita: 23_700, devolvido: 15_800 }],
      por_vendedor: [], contatos_sem_campanha: 0, importado_ate: "2026-11-17",
    }, error: null };
    const tela = limpar(await Anuncios(params({ inicio: "2026-11-17", fim: "2026-11-17" })));
    for (const trecho of ["2 vendas (1 devolvida por inteiro)", "CPA R$ 100,00", "receita R$ 237,00 − devolvido R$ 158,00 = R$ 79,00", "ROAS 0,79×",
      "recebido de fato R$ 158,00", "(já sem R$ 79,00 devolvidos ao cliente)", "1 venda · R$ 79,00 sem as devoluções", "R$ 79,00 (sem R$ 158,00 devolvidos)",
      "Atribuição não é prova de causa", "o arquivo em outra moeda é recusado", "o custo de um dia pode cair no dia vizinho"]) {
      expect(tela, trecho).toContain(trecho);
    }
    expect(limpar(await Anuncios(params({ erro: "moeda" })))).toContain("não está em reais (BRL)");
  });

  it("o período adulterado volta aos últimos 30 dias; a linha que não deu para ler aparece explicada", async () => {
    const tela = limpar(await Anuncios(params({ inicio: "2026-02-30", fim: "x", erro: "linha", linha: "2", campo: "por_dia", texto: "01/11/2026 a 30/11/2026" })));
    expect(tela).toContain("Linha 2 do arquivo: o período \"01/11/2026 a 30/11/2026\" não é um dia só");
    const [{ p_inicio, p_fim }] = chamadas("anuncios_painel") as [{ p_inicio: string; p_fim: string }];
    expect(Math.round((new Date(p_fim).getTime() - new Date(p_inicio).getTime()) / 86_400_000)).toBe(29);
  });
});

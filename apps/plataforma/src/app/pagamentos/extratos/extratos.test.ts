// Extratos por arquivo (lote EXT-a: ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; ADR-016) com a sessão e o Supabase SIMULADOS:
// nenhuma credencial, arquivos e dados fictícios. As regras do banco estão em packages/banco/src/extratos.test.ts; a leitura
// do arquivo, em lib/extratos/leitura.test.ts.
import { createHash } from "node:crypto";

import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const EXTRATO = "00000000-0000-4000-9000-0000000000e1";
const LINHA = "00000000-0000-4000-9000-0000000000e2";
const PAG = "00000000-0000-4000-9000-0000000000e3";
const VENDA = "00000000-0000-4000-9000-0000000000e4";
type Resposta = { data: unknown; error: null | { code: string; message?: string }; count?: number };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  vinculos: [] as { papel: string; escopo: string; unidade_id: string | null }[],
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, Resposta>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

/** Consulta simulada: devolve as linhas da tabela; os filtros de igualdade valem para as colunas que a linha tem. */
class Consulta {
  linhas: Record<string, unknown>[];
  constructor(linhas: Record<string, unknown>[]) { this.linhas = [...linhas]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => !(coluna in l) || l[coluna] === valor); return this; }
  in() { return this; }
  is() { return this; }
  gte() { return this; }
  lt() { return this; }
  order() { return this; }
  range() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: Resposta) => unknown) { return Promise.resolve({ data: this.linhas, error: null, count: this.linhas.length }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-17T23:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Dono (fictício)", vinculos: cenario.vinculos, pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: (nome: string) => new Consulta(cenario.tabelas[nome] ?? []),
    rpc: (nome: string, argumentos: Record<string, unknown> = {}) => {
      cenario.chamadas.push({ nome, argumentos });
      const resposta = cenario.respostas[nome] ?? { data: null, error: null };
      // Como o construtor do supabase-js: dá para filtrar o resultado (.in) antes de esperar.
      const promessa = Promise.resolve(resposta);
      return Object.assign(promessa, { in: () => promessa });
    },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { conciliarCertas, conciliarLinha, corrigirChargeback, desfazerLinha, ignorarLinha, ligarEstorno } from "./acoes";
import { POST } from "./enviar/route";
import ExtratoImportado from "./[id]/page";
import ImportarExtrato from "./importar/page";
import Extratos from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    // Componente de função do servidor sem estado (os do ui.tsx): desenha para ler o texto de dentro.
    if (typeof v.type === "function" && /^[A-Z]/.test((v.type as { name?: string }).name ?? "")) {
      try { return texto((v.type as (p: unknown) => unknown)(v.props)); } catch { /* componente com estado: lê as propriedades */ }
    }
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const limpar = (v: unknown) => texto(v).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) for (const valor of Array.isArray(v) ? v : [v]) f.append(k, valor);
  return f;
};
const chamadas = (nome: string) => cenario.chamadas.filter((c) => c.nome === nome).map((c) => c.argumentos);

beforeEach(() => {
  cenario.permissoes = new Set(["pagamento.conciliar"]);
  cenario.vinculos = [{ papel: "gerente", escopo: "unidade", unidade_id: LOJA }];
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.tabelas = {};
});

describe("as ações da tela do extrato", () => {
  const base = { extrato: EXTRATO, ver: "todas", pagina: "2" };

  it("conciliar uma linha chama o banco com a linha e o pagamento e volta ao mesmo filtro e página", async () => {
    cenario.respostas.extrato_conciliar = { data: { conciliada: true, repetida: false }, error: null };
    expect(await destinoDe(conciliarLinha(formulario({ ...base, linha: LINHA, pagamento: PAG })))).toBe(`/pagamentos/extratos/${EXTRATO}?ver=todas&pagina=2&ok=conciliada`);
    expect(chamadas("extrato_conciliar")).toEqual([{ p_linha: LINHA, p_pagamento: PAG }]);
    cenario.respostas.extrato_conciliar = { data: { conciliada: true, repetida: true }, error: null };
    expect(await destinoDe(conciliarLinha(formulario({ extrato: EXTRATO, linha: LINHA, pagamento: PAG })))).toBe(`/pagamentos/extratos/${EXTRATO}?ok=ja_conciliada`);
  });

  it("a recusa do banco vira a mensagem do catálogo; dado adulterado nem chega ao banco", async () => {
    cenario.respostas.extrato_conciliar = { data: null, error: { code: "22023", message: "O dinheiro desta linha ainda não caiu: concilie no dia do repasse" } };
    expect(await destinoDe(conciliarLinha(formulario({ extrato: EXTRATO, linha: LINHA, pagamento: PAG })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=futuro`);
    cenario.chamadas = [];
    expect(await destinoDe(conciliarLinha(formulario({ extrato: EXTRATO, linha: "1 or 1=1", pagamento: PAG })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=dados`);
    expect(await destinoDe(conciliarLinha(formulario({ extrato: "../x", linha: LINHA, pagamento: PAG })))).toBe("/pagamentos/extratos?erro=dados");
    // Filtro e página adulterados não voltam no endereço.
    expect(await destinoDe(conciliarLinha(formulario({ extrato: EXTRATO, linha: LINHA, pagamento: PAG, ver: "constructor", pagina: "-3" })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=futuro`);
    expect(chamadas("extrato_conciliar")).toHaveLength(1);
  });

  it("conciliar as certas diz quantas; tirar da conta e desfazer pedem o motivo", async () => {
    cenario.respostas.extrato_conciliar_certas = { data: { conciliadas: 3 }, error: null };
    expect(await destinoDe(conciliarCertas(formulario({ extrato: EXTRATO })))).toBe(`/pagamentos/extratos/${EXTRATO}?ok=certas&conciliadas=3`);
    expect(await destinoDe(ignorarLinha(formulario({ extrato: EXTRATO, linha: LINHA, motivo: "ab" })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=motivo`);
    expect(chamadas("extrato_ignorar")).toEqual([]);
    cenario.respostas.extrato_ignorar = { data: true, error: null };
    expect(await destinoDe(ignorarLinha(formulario({ extrato: EXTRATO, linha: LINHA, motivo: "  Tarifa   do mês " })))).toBe(`/pagamentos/extratos/${EXTRATO}?ok=ignorada`);
    expect(chamadas("extrato_ignorar")).toEqual([{ p_linha: LINHA, p_motivo: "Tarifa do mês" }]);
    cenario.respostas.extrato_desfazer = { data: false, error: null };
    expect(await destinoDe(desfazerLinha(formulario({ extrato: EXTRATO, linha: LINHA, motivo: "Engano" })))).toBe(`/pagamentos/extratos/${EXTRATO}?ok=sem_mudanca`);
  });
});

describe("o envio do extrato (rota)", () => {
  const csv = "Data;NSU;Valor bruto;Taxa\r\n17/11/2026;123;79,00;1,58\r\n17/11/2026;124;-79,00;\r\nSaldo;;;\r\n";
  const enviar = (campos: Record<string, string | string[]>, arquivo: { nome: string; conteudo: string } | null = { nome: "extrato.csv", conteudo: csv }) => {
    const f = formulario(campos);
    if (arquivo) f.set("arquivo", new File([arquivo.conteudo], arquivo.nome, { type: "text/csv" }));
    return POST(new Request("http://localhost/pagamentos/extratos/enviar", { method: "POST", body: f }) as never);
  };
  const destino = (r: Response) => r.headers.get("location") ?? "";
  const certo = { onde: "loja", tipo: "maquininha", fonte: "PicPay da loja", meios: ["pix_picpay", "cartao_picpay"], coluna_data: "0", coluna_referencia: "1", coluna_valor: "2", coluna_taxa: "3" };

  it("lê o arquivo inteiro, monta as linhas e grava no banco com a impressão digital; abre o extrato", async () => {
    cenario.respostas.extrato_importar = { data: { extrato: EXTRATO, numero: 7, linhas: 2, repetido: false }, error: null };
    const resposta = await enviar(certo);
    expect(resposta.status).toBe(303);
    expect(destino(resposta)).toBe(`/pagamentos/extratos/${EXTRATO}?ok=importado&de_fora=1`);
    expect(chamadas("extrato_importar")).toEqual([{
      p_unidade: LOJA, p_tipo: "maquininha", p_fonte: "PicPay da loja", p_meios: ["pix_picpay", "cartao_picpay"], p_arquivo: "extrato.csv",
      p_impressao: createHash("sha256").update(csv).digest("hex"),
      p_linhas: [{ numero: 2, data: "2026-11-17", valor: 7_900, taxa: 158, referencia: "123" }, { numero: 3, data: "2026-11-17", valor: -7_900, referencia: "124" }],
      p_mapeamento: { formato: "csv", colunas: { data: "Data", valor: "Valor bruto", taxa: "Taxa", referencia: "NSU" }, de_fora: 1 },
    }]);
  });

  it("o mesmo arquivo de novo abre o extrato que já existe; a rede vai sem loja e, recusada, diz quem pode", async () => {
    cenario.respostas.extrato_importar = { data: { extrato: EXTRATO, numero: 7, linhas: 2, repetido: true }, error: null };
    expect(destino(await enviar(certo))).toBe(`/pagamentos/extratos/${EXTRATO}?ok=repetido`);
    cenario.respostas.extrato_importar = { data: null, error: { code: "42501", message: "Sem permissão para conciliar pagamentos aqui" } };
    expect(destino(await enviar({ ...certo, onde: "rede", tipo: "banco" }))).toBe("/pagamentos/extratos/importar?erro=rede");
    expect(chamadas("extrato_importar").at(-1)).toMatchObject({ p_unidade: null, p_tipo: "banco" });
  });

  it("a linha que não deu para ler volta apontada, sem ir ao banco; o mapeamento sem valor também", async () => {
    const ruim = { nome: "extrato.csv", conteudo: "Data;Valor\n17/11/2026;79,00\n31/02/2026;1,00\n" };
    expect(destino(await enviar({ ...certo, coluna_referencia: "", coluna_taxa: "", coluna_valor: "1" }, ruim)))
      .toBe("/pagamentos/extratos/importar?erro=linha&linha=3&campo=data&texto=31%2F02%2F2026");
    expect(destino(await enviar({ ...certo, coluna_valor: "" }))).toBe("/pagamentos/extratos/importar?erro=mapeamento");
    expect(destino(await enviar({ ...certo, meios: [] }))).toBe("/pagamentos/extratos/importar?erro=meios");
    expect(destino(await enviar(certo, null))).toBe("/pagamentos/extratos/importar?erro=arquivo");
    expect(chamadas("extrato_importar")).toEqual([]);
  });

  it("o OFX dispensa as colunas; quem não concilia nem tem o arquivo lido; outra origem é recusada", async () => {
    cenario.respostas.extrato_importar = { data: { extrato: EXTRATO, numero: 8, linhas: 1, repetido: false }, error: null };
    const ofx = { nome: "banco.ofx", conteudo: "OFXHEADER:100\r\n\r\n<OFX><STMTTRN><DTPOSTED>20261117<TRNAMT>39.90<FITID>E2E1<MEMO>PIX</STMTTRN></OFX>" };
    expect(destino(await enviar({ onde: "loja", tipo: "banco", fonte: "Conta da loja", meios: "pix_direto" }, ofx))).toBe(`/pagamentos/extratos/${EXTRATO}?ok=importado`);
    expect(chamadas("extrato_importar")[0]).toMatchObject({ p_linhas: [{ numero: 1, data: "2026-11-17", valor: 3_990, referencia: "E2E1", descricao: "PIX" }], p_mapeamento: { formato: "ofx" } });
    cenario.permissoes = new Set();
    expect(destino(await enviar(certo))).toBe("/pagamentos/extratos/importar?erro=permissao");
    const deFora = await POST(new Request("http://localhost/pagamentos/extratos/enviar", { method: "POST", headers: { origin: "https://outro.exemplo", host: "localhost" }, body: formulario(certo) }) as never);
    expect(deFora.status).toBe(403);
    expect(chamadas("extrato_importar")).toHaveLength(1);
  });
});

describe("as telas", () => {
  it("quem não concilia vê o aviso, sem ler extrato algum", async () => {
    cenario.permissoes = new Set();
    expect(limpar(await Extratos({ searchParams: Promise.resolve({}) }))).toContain("Conciliar pagamentos é da gerência da loja.");
    expect(limpar(await ImportarExtrato({ searchParams: Promise.resolve({}) }))).toContain("Conciliar pagamentos é da gerência da loja.");
    expect(cenario.chamadas).toEqual([]);
  });

  it("a lista mostra cada extrato com as linhas a conferir; a importação oferece a rede só a quem tem vínculo com a rede", async () => {
    cenario.respostas.extratos_recentes = { data: [{ id: EXTRATO, numero: 7, unidade_id: LOJA, loja: "Santa Cândida (teste)", tipo: "maquininha", fonte: "PicPay da loja", arquivo: "extrato.csv",
      periodo_inicio: "2026-11-01", periodo_fim: "2026-11-17", linhas: 40, importado_em: "2026-11-17T20:00:00Z", pendentes: 3, conciliadas: 36, ignoradas: 1 }], error: null };
    const lista = limpar(await Extratos({ searchParams: Promise.resolve({}) }));
    expect(lista).toContain("Extrato nº 7 · PicPay da loja");
    expect(lista).toContain("3 a conferir");
    expect(lista).toContain("de 01/11/2026 a 17/11/2026 · 40 linhas");
    expect(limpar(await ImportarExtrato({ searchParams: Promise.resolve({}) }))).not.toContain("Da rede");
    cenario.vinculos = [{ papel: "dono", escopo: "organizacao", unidade_id: null }];
    const importar = limpar(await ImportarExtrato({ searchParams: Promise.resolve({ erro: "linha", linha: "3", campo: "data", texto: "31/02/2026" }) }));
    expect(importar).toContain("Da rede (a conta do banco da empresa)");
    expect(importar).toContain('Linha 3 do arquivo: não deu para ler a data (dia/mês/ano) "31/02/2026"');
  });

  it("o extrato: o bruto, as taxas, o líquido, o que vai cair, as sugestões de cada linha e as vendas sem linha", async () => {
    cenario.tabelas = {
      extratos: [{ id: EXTRATO, numero: 7, unidade_id: LOJA, tipo: "maquininha", fonte: "PicPay da loja", meios: ["pix_picpay"], arquivo: "extrato.csv",
        periodo_inicio: "2026-11-17", periodo_fim: "2026-11-17", linhas: 2, importado_em: "2026-11-17T20:00:00Z" }],
      unidades: [{ nome: "Santa Cândida (teste)" }],
      extrato_linhas: [{ id: LINHA, numero: 2, data: "2026-11-17", valor_centavos: 7_900, taxa_centavos: 158, liquido_centavos: null, data_liquidacao: "2026-11-18",
        referencia: "NSU-123", terminal: null, descricao: "Venda", situacao: "pendente", motivo: null, pagamento: null }],
      venda_pagamentos: [{ id: PAG, meio: "pix_picpay", valor_centavos: 3_900, comprovante: "E2E-9", vendas: { id: VENDA, numero: 41, concluida_em: "2026-11-17T15:00:00Z" } }],
    };
    cenario.respostas.extrato_resumo = { data: { creditos: 1, creditos_centavos: 7_900, debitos: 0, debitos_centavos: 0, taxas_centavos: 158, liquido_centavos: 7_742,
      a_cair_centavos: 7_742, pendentes: 1, conciliadas: 0, ignoradas: 0 }, error: null };
    cenario.respostas.extrato_sugestoes = { data: [{ linha_id: LINHA, pagamento_id: PAG, venda_numero: 40, meio: "pix_picpay", valor_centavos: 7_900,
      concluida_em: "2026-11-17T14:00:00Z", loja: "Santa Cândida (teste)", terminal: null, pela_referencia: true }], error: null };
    const tela = limpar(await ExtratoImportado({ params: Promise.resolve({ id: EXTRATO }), searchParams: Promise.resolve({ ok: "importado", de_fora: "1" }) }));
    for (const trecho of ["Extrato nº 7 · PicPay da loja", "Vendas no extrato (bruto)", "R$ 79,00", "R$ 1,58", "R$ 77,42", "Ainda vai cair", "Linha 2",
      "cai em 18/11/2026", "Venda nº 40 · Pix na maquininha PicPay", "mesma referência", "Conciliar as certas", "1 linhas do arquivo ficaram de fora",
      "Vendas do período ainda sem conciliação", "Venda nº 41", "R$ 39,00"]) {
      expect(tela, trecho).toContain(trecho);
    }
    expect(chamadas("extrato_sugestoes")).toEqual([{ p_extrato: EXTRATO }]);
  });

  it("AUD-c (F21-02): a linha que é o recebimento de um repasse diz de qual repasse é, não oferece conciliar nem desfazer, e conta à parte", async () => {
    cenario.vinculos = [{ papel: "dono", escopo: "organizacao", unidade_id: null }];
    cenario.tabelas = {
      extratos: [{ id: EXTRATO, numero: 9, unidade_id: null, tipo: "banco", fonte: "Banco da rede", meios: ["pix_direto"], arquivo: "extrato.ofx",
        periodo_inicio: "2026-11-10", periodo_fim: "2026-11-12", linhas: 1, importado_em: "2026-11-12T20:00:00Z" }],
      extrato_linhas: [{ id: LINHA, numero: 1, data: "2026-11-12", valor_centavos: 26_100, taxa_centavos: null, liquido_centavos: null, data_liquidacao: null,
        referencia: null, terminal: null, descricao: "TED MERCADO PAGO", situacao: "repasse", motivo: null, pagamento: null }],
      marketplace_repasses: [{ linha_id: LINHA, canal: "mercado_livre", data_repasse: "2026-11-10" }],
      venda_pagamentos: [],
    };
    cenario.respostas.extrato_resumo = { data: { creditos: 1, creditos_centavos: 26_100, debitos: 0, debitos_centavos: 0, taxas_centavos: 0, liquido_centavos: 26_100,
      a_cair_centavos: 0, pendentes: 0, conciliadas: 0, ignoradas: 0, repasses: 1 }, error: null };
    const tela = limpar(await ExtratoImportado({ params: Promise.resolve({ id: EXTRATO }), searchParams: Promise.resolve({ ver: "repasse" }) }));
    for (const trecho of ["Extrato nº 9 · Banco da rede", "De repasse", "Linha 1", "repasse de marketplace",
      "É o recebimento do repasse do Mercado Livre de 10/11/2026.", "desfaça o repasse em", "Repasses dos marketplaces"]) {
      expect(tela, trecho).toContain(trecho);
    }
    // Nada de tirar da conta nem de desfazer por aqui, e nenhuma venda sugerida: a linha só se solta desfazendo o repasse.
    for (const ausente of ["Tirar da conta", "Desfazer a conciliação", "Voltar para a conta", "Venda nº"]) expect(tela, ausente).not.toContain(ausente);
    expect(chamadas("extrato_sugestoes")).toEqual([]);
    // Quem não vê os repasses (a leitura deles volta vazia) lê a linha, sem o canal e a data.
    cenario.tabelas.marketplace_repasses = [];
    expect(limpar(await ExtratoImportado({ params: Promise.resolve({ id: EXTRATO }), searchParams: Promise.resolve({ ver: "repasse" }) })))
      .toContain("É o recebimento de um repasse de marketplace.");
    // A lista dos extratos conta as linhas de repasse à parte; a recusa do banco tem a mensagem dela.
    cenario.respostas.extratos_recentes = { data: [{ id: EXTRATO, numero: 9, unidade_id: null, loja: null, tipo: "banco", fonte: "Banco da rede", arquivo: "extrato.ofx",
      periodo_inicio: "2026-11-10", periodo_fim: "2026-11-12", linhas: 1, importado_em: "2026-11-12T20:00:00Z", pendentes: 0, conciliadas: 0, ignoradas: 0, repasses: 1 }], error: null };
    expect(limpar(await Extratos({ searchParams: Promise.resolve({}) }))).toContain("1 de repasse");
    cenario.respostas.extrato_conciliar = { data: null, error: { code: "OR046", message: "Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes" } };
    expect(await destinoDe(conciliarLinha(formulario({ extrato: EXTRATO, linha: LINHA, pagamento: PAG })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=de_repasse`);
  });

  it("extrato de outra loja (ou que não existe) não abre; endereço adulterado nem consulta", async () => {
    expect(limpar(await ExtratoImportado({ params: Promise.resolve({ id: EXTRATO }), searchParams: Promise.resolve({}) }))).toContain("Extrato não encontrado");
    expect(limpar(await ExtratoImportado({ params: Promise.resolve({ id: "x' or 1=1" }), searchParams: Promise.resolve({}) }))).toContain("Extrato não encontrado");
  });
});

// PAY-011a (ORA-PAY-011): o débito do extrato é a prova do estorno da venda. As regras do banco estão em
// packages/banco/src/debito-do-extrato-e-estorno.test.ts; aqui, a ação e o que a tela mostra e oferece.
describe("PAY-011a: o débito do extrato e o estorno da venda", () => {
  const ESTORNO = "00000000-0000-4000-9000-0000000000e5";
  const DEBITO = "00000000-0000-4000-9000-0000000000e6";
  const base = { extrato: EXTRATO, ver: "todas", pagina: "2" };
  const extratoDaLoja = { id: EXTRATO, numero: 7, unidade_id: LOJA, tipo: "maquininha", fonte: "PicPay da loja", meios: ["cartao_picpay"], arquivo: "extrato.csv",
    periodo_inicio: "2026-11-20", periodo_fim: "2026-11-20", linhas: 3, importado_em: "2026-11-20T20:00:00Z" };
  const debito = (extra: Record<string, unknown> = {}) => ({ id: DEBITO, numero: 5, data: "2026-11-20", valor_centavos: -7_900, taxa_centavos: null, liquido_centavos: null,
    data_liquidacao: null, referencia: "EST-55", terminal: null, descricao: "Estorno", situacao: "pendente", motivo: null, pagamento: null, confirmou_o_estorno: null,
    chargeback: null, estorno: null, ...extra });
  const resumo = (extra: Record<string, number> = {}) => ({ creditos: 0, creditos_centavos: 0, debitos: 1, debitos_centavos: 7_900, taxas_centavos: 0, liquido_centavos: -7_900,
    a_cair_centavos: 0, pendentes: 1, conciliadas: 0, ignoradas: 0, repasses: 0, estornos: 0, ...extra });
  const sugestao = (extra: Record<string, unknown> = {}) => ({ linha_id: DEBITO, estorno_id: ESTORNO, estorno_numero: 3, venda_id: VENDA, venda_numero: 21, meio: "cartao_picpay",
    valor_centavos: 7_900, situacao: "pendente", solicitado_em: "2026-11-20T15:00:00Z", confirmado_em: null, comprovante: null, loja: "Santa Cândida (teste)",
    de_devolucao: false, pela_referencia: false, pode_confirmar: true, na_loja_do_turno: true, ...extra });
  const abrir = async (ver = "todas") => limpar(await ExtratoImportado({ params: Promise.resolve({ id: EXTRATO }), searchParams: Promise.resolve({ ver }) }));

  it("ligar chama o banco com a linha, o estorno e se foi chargeback; a resposta diz se confirmou, se só guardou a prova ou se já estava ligado", async () => {
    cenario.respostas.extrato_casar_estorno = { data: { ligada: true, repetida: false, confirmou: true }, error: null };
    expect(await destinoDe(ligarEstorno(formulario({ ...base, linha: DEBITO, estorno: ESTORNO, chargeback: "sim" })))).toBe(`/pagamentos/extratos/${EXTRATO}?ver=todas&pagina=2&ok=estorno_confirmado`);
    cenario.respostas.extrato_casar_estorno = { data: { ligada: true, repetida: false, confirmou: false }, error: null };
    expect(await destinoDe(ligarEstorno(formulario({ extrato: EXTRATO, linha: DEBITO, estorno: ESTORNO })))).toBe(`/pagamentos/extratos/${EXTRATO}?ok=estorno_ligado`);
    cenario.respostas.extrato_casar_estorno = { data: { ligada: true, repetida: true, confirmou: true }, error: null };
    expect(await destinoDe(ligarEstorno(formulario({ extrato: EXTRATO, linha: DEBITO, estorno: ESTORNO, chargeback: "talvez" })))).toBe(`/pagamentos/extratos/${EXTRATO}?ok=ja_ligado`);
    // A caixa do chargeback só vale marcada como a tela manda; qualquer outro valor é "não".
    expect(chamadas("extrato_casar_estorno")).toEqual([
      { p_linha: DEBITO, p_estorno: ESTORNO, p_chargeback: true }, { p_linha: DEBITO, p_estorno: ESTORNO, p_chargeback: false }, { p_linha: DEBITO, p_estorno: ESTORNO, p_chargeback: false },
    ]);
  });

  it("a recusa do banco vira a mensagem dela; dado adulterado nem chega ao banco; o débito que confirmou não se solta nem sai da conta", async () => {
    const recusas: [{ code: string; message: string }, string][] = [
      [{ code: "22023", message: "Para confirmar o estorno, entre na loja da venda" }, "estorno_outra_loja"],
      [{ code: "42501", message: "Confirmar o estorno é da gerência da loja da venda" }, "estorno_gerencia"],
      [{ code: "22023", message: "Este estorno já tem o débito dele em outra linha de extrato" }, "estorno_outro_debito"],
      [{ code: "22023", message: "Esta linha do extrato já foi decidida: desfaça antes" }, "decidida"],
      [{ code: "42501", message: "Estorno não encontrado para você" }, "permissao"],
    ];
    for (const [error, chave] of recusas) {
      cenario.respostas.extrato_casar_estorno = { data: null, error };
      expect(await destinoDe(ligarEstorno(formulario({ extrato: EXTRATO, linha: DEBITO, estorno: ESTORNO }))), error.message).toBe(`/pagamentos/extratos/${EXTRATO}?erro=${chave}`);
    }
    cenario.chamadas = [];
    expect(await destinoDe(ligarEstorno(formulario({ extrato: EXTRATO, linha: DEBITO, estorno: "1 or 1=1" })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=dados`);
    expect(await destinoDe(ligarEstorno(formulario({ extrato: EXTRATO, linha: "x", estorno: ESTORNO })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=dados`);
    expect(await destinoDe(ligarEstorno(formulario({ extrato: "../x", linha: DEBITO, estorno: ESTORNO })))).toBe("/pagamentos/extratos?erro=dados");
    expect(chamadas("extrato_casar_estorno")).toEqual([]);
    cenario.respostas.extrato_desfazer = { data: null, error: { code: "OR047", message: "Este débito confirmou o estorno de uma venda: a confirmação não se desfaz, e a linha fica como a prova dele" } };
    expect(await destinoDe(desfazerLinha(formulario({ extrato: EXTRATO, linha: DEBITO, motivo: "Liguei errado" })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=estorno_fixo`);
    cenario.respostas.extrato_ignorar = { data: null, error: { code: "OR046", message: "Este débito é o estorno de uma venda: ele já tem o uso dele" } };
    expect(await destinoDe(ignorarLinha(formulario({ extrato: EXTRATO, linha: DEBITO, motivo: "Tarifa" })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=de_estorno`);
  });

  it("a marca de chargeback do débito já ligado se corrige com o motivo; sem motivo, ou com a marca adulterada, nem chega ao banco", async () => {
    cenario.respostas.extrato_estorno_chargeback = { data: true, error: null };
    expect(await destinoDe(corrigirChargeback(formulario({ ...base, linha: DEBITO, chargeback: "sim", motivo: "  O banco   avisou " })))).toBe(`/pagamentos/extratos/${EXTRATO}?ver=todas&pagina=2&ok=chargeback_marcado`);
    expect(await destinoDe(corrigirChargeback(formulario({ extrato: EXTRATO, linha: DEBITO, chargeback: "nao", motivo: "Foi estorno da loja" })))).toBe(`/pagamentos/extratos/${EXTRATO}?ok=chargeback_desmarcado`);
    expect(chamadas("extrato_estorno_chargeback")).toEqual([
      { p_linha: DEBITO, p_chargeback: true, p_motivo: "O banco avisou" }, { p_linha: DEBITO, p_chargeback: false, p_motivo: "Foi estorno da loja" }]);
    cenario.respostas.extrato_estorno_chargeback = { data: false, error: null };
    expect(await destinoDe(corrigirChargeback(formulario({ extrato: EXTRATO, linha: DEBITO, chargeback: "sim", motivo: "De novo" })))).toBe(`/pagamentos/extratos/${EXTRATO}?ok=sem_mudanca`);
    cenario.chamadas = [];
    expect(await destinoDe(corrigirChargeback(formulario({ extrato: EXTRATO, linha: DEBITO, chargeback: "sim", motivo: "ab" })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=motivo`);
    expect(await destinoDe(corrigirChargeback(formulario({ extrato: EXTRATO, linha: DEBITO, chargeback: "true", motivo: "Tentativa" })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=dados`);
    expect(await destinoDe(corrigirChargeback(formulario({ extrato: EXTRATO, linha: "x", chargeback: "sim", motivo: "Tentativa" })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=dados`);
    expect(chamadas("extrato_estorno_chargeback")).toEqual([]);
    cenario.respostas.extrato_estorno_chargeback = { data: null, error: { code: "42501", message: "Linha do extrato não encontrada para você" } };
    expect(await destinoDe(corrigirChargeback(formulario({ extrato: EXTRATO, linha: DEBITO, chargeback: "sim", motivo: "Tentativa" })))).toBe(`/pagamentos/extratos/${EXTRATO}?erro=permissao`);
  });

  it("a tela: o débito pendente mostra os estornos que ele pode provar e o que dá para fazer em cada um", async () => {
    cenario.tabelas = { extratos: [extratoDaLoja], unidades: [{ nome: "Santa Cândida (teste)" }], extrato_linhas: [debito()], venda_pagamentos: [] };
    cenario.respostas.extrato_resumo = { data: resumo(), error: null };
    // O estorno que espera, com a gerência na loja da venda: confirmar (e o aviso de que não se desfaz).
    cenario.respostas.extrato_sugestoes_de_estorno = { data: [sugestao()], error: null };
    let tela = await abrir();
    for (const trecho of ["Linha 5", "-R$ 79,00", "Estorno nº 3 ·", "venda nº 21", "Cartão na maquininha PicPay", "do cancelamento", "pedido em 20/11/2026",
      "Confirma o estorno da venda com este débito como comprovante. A confirmação não se desfaz.", "Foi contestação do cliente no banco (chargeback)",
      "Confirmar o estorno", "Tirar da conta"]) expect(tela, trecho).toContain(trecho);
    expect(tela).not.toContain("Guardar como a prova");
    expect(chamadas("extrato_sugestoes_de_estorno")).toEqual([{ p_extrato: EXTRATO }]);
    // O débito não é crédito: as sugestões de venda não são pedidas para ele.
    expect(chamadas("extrato_sugestoes")).toEqual([]);

    // O estorno já confirmado à mão: só guardar a prova, dizendo o comprovante; a referência igual é reconhecida.
    cenario.respostas.extrato_sugestoes_de_estorno = { data: [sugestao({ situacao: "confirmado", confirmado_em: "2026-11-20T16:00:00Z", comprovante: "EST-55", pela_referencia: true, de_devolucao: true })], error: null };
    tela = await abrir();
    for (const trecho of ["de uma devolução", "mesma referência", "Já confirmado em 20/11/2026", "com o comprovante EST-55. Este débito fica como a prova dele (dá para soltar depois, com o motivo).",
      "Guardar como a prova"]) expect(tela, trecho).toContain(trecho);
    expect(tela).not.toContain("Confirmar o estorno");

    // Quem não é da gerência, ou está em outra loja: a tela explica e não oferece o botão.
    cenario.respostas.extrato_sugestoes_de_estorno = { data: [sugestao({ pode_confirmar: false })], error: null };
    tela = await abrir();
    expect(tela).toContain("O estorno ainda espera a confirmação, e confirmar é da gerência da loja da venda.");
    for (const ausente of ["Confirmar o estorno", "Guardar como a prova", "Foi contestação"]) expect(tela, ausente).not.toContain(ausente);
    cenario.respostas.extrato_sugestoes_de_estorno = { data: [sugestao({ na_loja_do_turno: false, loja: "Loja de teste 2" })], error: null };
    tela = await abrir();
    expect(tela).toContain("Para confirmar, entre na Loja de teste 2 (a loja da venda) e abra este extrato de novo.");
    expect(tela).not.toContain("Confirmar o estorno");

    // Sem estorno do valor: a tela diz o caminho do chargeback (cancelar a venda primeiro) e o da tarifa.
    cenario.respostas.extrato_sugestoes_de_estorno = { data: [], error: null };
    tela = await abrir();
    expect(tela).toContain("Nenhum estorno deste valor para ligar aqui (nesta loja e nestes meios). Se é o estorno ou o chargeback de uma venda, cancele a venda primeiro, na tela dela: o estorno aparece aqui para confirmar. Se é tarifa ou saída, tire da conta, com o motivo.");

    // A sugestão fora da forma esperada é falha da tela, não meia sugestão.
    cenario.respostas.extrato_sugestoes_de_estorno = { data: [sugestao({ estorno_id: "x" })], error: null };
    await expect(abrir()).rejects.toThrow();
    cenario.respostas.extrato_sugestoes_de_estorno = { data: null, error: { code: "57014" } };
    await expect(abrir()).rejects.toThrow();
  });

  it("a tela: a linha de estorno diz de qual venda é; a que confirmou não oferece soltar, a que só guardou a prova oferece; o filtro e a lista contam", async () => {
    const doEstorno = { numero: 3, venda: { id: VENDA, numero: 21 } };
    cenario.tabelas = { extratos: [extratoDaLoja], unidades: [{ nome: "Santa Cândida (teste)" }], venda_pagamentos: [],
      extrato_linhas: [debito({ situacao: "estorno", confirmou_o_estorno: true, chargeback: true, estorno: doEstorno })] };
    cenario.respostas.extrato_resumo = { data: resumo({ pendentes: 0, estornos: 1 }), error: null };
    let tela = await abrir("estorno");
    for (const trecho of ["De estorno", "estorno de venda", "chargeback", "Contestação do cliente no banco: é o débito do estorno nº 3", "da venda nº 21",
      "Foi este débito que confirmou o estorno: ele fica como a prova e não se solta.", "Não foi chargeback", "Desmarcar"]) expect(tela, trecho).toContain(trecho);
    for (const ausente of ["Soltar do estorno", "Tirar da conta", "Desfazer a conciliação", "Confirmar o estorno"]) expect(tela, ausente).not.toContain(ausente);
    // Nenhuma sugestão é pedida para a linha que já tem o uso dela.
    expect(chamadas("extrato_sugestoes_de_estorno")).toEqual([]);

    cenario.tabelas.extrato_linhas = [debito({ situacao: "estorno", confirmou_o_estorno: false, chargeback: false, estorno: doEstorno })];
    tela = await abrir("estorno");
    for (const trecho of ["É o débito do estorno nº 3", "da venda nº 21", "O estorno já estava confirmado; este débito ficou como a prova dele.", "Soltar do estorno",
      "Foi chargeback (o cliente contestou no banco)", "Marcar como chargeback"]) expect(tela, trecho).toContain(trecho);
    expect(tela).not.toContain("Contestação do cliente");
    // Quem não lê a venda do estorno (a leitura volta sem ele) vê a linha, sem o número.
    cenario.tabelas.extrato_linhas = [debito({ situacao: "estorno", confirmou_o_estorno: true, chargeback: false, estorno: null })];
    tela = await abrir("estorno");
    expect(tela).toContain("É o débito do estorno de uma venda");
    expect(tela).not.toContain("estorno nº");

    // As mensagens de depois de ligar.
    const com = async (ok: string) => limpar(await ExtratoImportado({ params: Promise.resolve({ id: EXTRATO }), searchParams: Promise.resolve({ ver: "estorno", ok }) }));
    expect(await com("estorno_confirmado")).toContain("Estorno confirmado: este débito ficou como o comprovante dele.");
    // Na devolução o pagamento da venda não muda (só o reembolso fica confirmado): a mensagem não fala do pagamento.
    expect(await com("estorno_confirmado")).not.toContain("o pagamento da venda está estornado");
    expect(await com("estorno_ligado")).toContain("Débito ligado ao estorno, que já estava confirmado: ele ficou como a prova.");
    expect(await com("ja_ligado")).toContain("Este débito já estava ligado a este estorno.");
    expect(await com("chargeback_marcado")).toContain("Débito marcado como chargeback; o motivo ficou na auditoria.");
    expect(await com("chargeback_desmarcado")).toContain("Débito desmarcado como chargeback; o motivo ficou na auditoria.");

    // A lista dos extratos conta os débitos de estorno à parte.
    cenario.respostas.extratos_recentes = { data: [{ id: EXTRATO, numero: 7, unidade_id: LOJA, loja: "Santa Cândida (teste)", tipo: "maquininha", fonte: "PicPay da loja", arquivo: "extrato.csv",
      periodo_inicio: "2026-11-20", periodo_fim: "2026-11-20", linhas: 3, importado_em: "2026-11-20T20:00:00Z", pendentes: 0, conciliadas: 2, ignoradas: 0, repasses: 0, estornos: 1 }], error: null };
    expect(limpar(await Extratos({ searchParams: Promise.resolve({}) }))).toContain("1 de estorno");
  });
});

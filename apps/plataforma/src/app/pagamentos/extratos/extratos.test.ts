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

import { conciliarCertas, conciliarLinha, desfazerLinha, ignorarLinha } from "./acoes";
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

  it("extrato de outra loja (ou que não existe) não abre; endereço adulterado nem consulta", async () => {
    expect(limpar(await ExtratoImportado({ params: Promise.resolve({ id: EXTRATO }), searchParams: Promise.resolve({}) }))).toContain("Extrato não encontrado");
    expect(limpar(await ExtratoImportado({ params: Promise.resolve({ id: "x' or 1=1" }), searchParams: Promise.resolve({}) }))).toContain("Extrato não encontrado");
  });
});

// A carga do estoque inicial por loja (lote REIN-b; ADR-021) com a sessão e o Supabase SIMULADOS: nenhuma credencial,
// planilha e números fictícios. As regras do banco estão em packages/banco/src/estoque-carga.test.ts; a leitura do
// arquivo, em lib/estoque/carga.test.ts.
import { createHash } from "node:crypto";

import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const SC = "00000000-0000-4000-8000-0000000000a1";
const MS = "00000000-0000-4000-8000-0000000000a2";
const CARGA = "00000000-0000-4000-9000-0000000000c1";
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, Resposta | Resposta[]>,
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
  range() { return this; }
  in() { return this; }
  eq(campo: string, valor: unknown) { this.linhas = this.linhas.filter((l) => !(campo in l) || l[campo] === valor); return this; }
  not(campo: string) { this.linhas = this.linhas.filter((l) => l[campo] !== null && l[campo] !== undefined); return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: Resposta) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-18T23:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Administrador (fictício)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: (nome: string) => new Consulta(cenario.tabelas[nome] ?? []),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      cenario.chamadas.push({ nome, argumentos });
      if (nome === "tem_permissao") return { data: cenario.permissoes.has(argumentos.p_permissao as string), error: null };
      const r = cenario.respostas[nome];
      if (Array.isArray(r)) return r.shift() ?? { data: null, error: null };
      return r ?? { data: null, error: null };
    },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { xlsxMontadoAMao } from "../../../lib/xlsx-de-teste";
import { aplicarCarga, desfazerCarga, resolverDiferenca } from "./acoes";
import { POST } from "./enviar/route";
import UmaCarga from "./[id]/page";
import CargaDoEstoque from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && /^[A-Z]/.test((v.type as { name?: string }).name ?? "") && (v.type as { name?: string }).name !== "EscolherColunasDaCarga") {
      try { return texto((v.type as (p: unknown) => unknown)(v.props)); } catch { /* componente com estado: lê as propriedades */ }
    }
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const limpar = (v: unknown) => texto(v).replace(/\s+/g, " ");
const chamadas = (nome: string) => cenario.chamadas.filter((c) => c.nome === nome).map((c) => c.argumentos);
const LOJAS = [{ id: SC, nome: "Santa Cândida" }, { id: MS, nome: "Muffato Santa" }];

beforeEach(() => {
  cenario.permissoes = new Set(["importacao.executar"]);
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.tabelas = { unidades: [{ organizacao_id: "org", id: LOJA }, ...LOJAS], estoque_cargas: [], estoque_carga_linhas: [] };
});

describe("o envio do relatório (rota)", () => {
  const csv = "Código;Descrição;Santa Cândida Qtd.;Santa Cândida Qtd. Disponível;Muffato Santa Qtd.\n"
    + "ACE-1;Capa;10;8;5\nAPA-1;Galaxy;2;2;0\nACE-2;Película;0;0;0\n;;12;10;5\n";
  const enviar = (campos: Record<string, string>, conteudo: string | null = csv) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    if (conteudo !== null) f.set("arquivo", new File([conteudo], "relatorioProdutos.csv", { type: "text/csv" }));
    return POST(new Request("http://localhost/estoque/carga/enviar", { method: "POST", body: f }) as never);
  };
  const destino = (r: Response) => r.headers.get("location") ?? "";
  const campos = { corte: "2026-11-10T13:20", coluna_sku: "0", coluna_nome: "1", [`fisico_${SC}`]: "2", [`disponivel_${SC}`]: "3", [`fisico_${MS}`]: "4" };

  it("lê o arquivo e grava uma prévia por loja com quantidade, com a data de corte e o rodapé de fora", async () => {
    cenario.respostas.estoque_carga_previa = [{ data: { id: CARGA, numero: 1, repetida: false }, error: null }, { data: { id: CARGA, numero: 2, repetida: true }, error: null }];
    const resposta = await enviar(campos);
    expect(resposta.status).toBe(303);
    expect(destino(resposta)).toBe("/estoque/carga?ok=previa&cargas=1&repetidas=1");
    const impressao = createHash("sha256").update(csv).digest("hex");
    expect(chamadas("estoque_carga_previa")).toEqual([
      {
        p_organizacao: "org", p_unidade: SC, p_arquivo_nome: "relatorioProdutos.csv", p_sha256: impressao, p_corte: "2026-11-10T13:20:00-03:00",
        p_mapeamento: { formato: "csv", colunas: { sku: "Código", nome: "Descrição", fisico: "Santa Cândida Qtd.", disponivel: "Santa Cândida Qtd. Disponível" },
          fora: { linha: 5, motivo: "rodapé de totais no fim da planilha (sem código e sem nome, só números em 3 colunas; em 3 delas o número é a soma das linhas de cima)" } },
        p_linhas: [{ numero: 2, sku: "ACE-1", fisico: 10, disponivel: 8 }, { numero: 3, sku: "APA-1", fisico: 2, disponivel: 2 }],
      },
      {
        p_organizacao: "org", p_unidade: MS, p_arquivo_nome: "relatorioProdutos.csv", p_sha256: impressao, p_corte: "2026-11-10T13:20:00-03:00",
        p_mapeamento: { formato: "csv", colunas: { sku: "Código", nome: "Descrição", fisico: "Muffato Santa Qtd." },
          fora: { linha: 5, motivo: "rodapé de totais no fim da planilha (sem código e sem nome, só números em 3 colunas; em 3 delas o número é a soma das linhas de cima)" } },
        p_linhas: [{ numero: 2, sku: "ACE-1", fisico: 5, disponivel: null }],
      },
    ]);
  });

  it("F21-01: o rodapé do Excel escrito com vírgula em células de número fica de fora, e a quantidade escrita assim vai com a nota de como foi lida", async () => {
    cenario.respostas.estoque_carga_previa = [{ data: { id: CARGA, numero: 1, repetida: false }, error: null }, { data: { id: CARGA, numero: 2, repetida: false }, error: null }];
    // O relatório no formato da Rein: os produtos com números do Excel; uma quantidade e o rodapé escritos com vírgula.
    const xlsx = xlsxMontadoAMao([
      ["Código", "Descrição", "Santa Cândida Qtd.", "Santa Cândida Qtd. Disponível", "Muffato Santa Qtd."],
      ["ACE-1", "Capa", { n: "1.000,00" }, { n: "998" }, { n: "5" }],
      ["APA-1", "Galaxy", { n: "2" }, { n: "2" }, { n: "0.5" }],
      [null, null, { n: "1.002,00" }, { n: "1.000,00" }, { n: "5,50" }],
    ]);
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    f.set("arquivo", new File([xlsx], "relatorioProdutos.xlsx"));
    const resposta = await POST(new Request("http://localhost/estoque/carga/enviar", { method: "POST", body: f }) as never);
    expect(destino(resposta)).toBe("/estoque/carga?ok=previa&cargas=2&repetidas=0");
    const [sc, ms] = chamadas("estoque_carga_previa") as { p_mapeamento: Record<string, unknown>; p_linhas: unknown[] }[];
    const fora = { linha: 4, motivo: "rodapé de totais no fim da planilha (sem código e sem nome, só números em 3 colunas, 3 delas escritas com vírgula numa célula de número e lidas como estão; em 3 delas o número é a soma das linhas de cima)" };
    expect(sc?.p_mapeamento).toMatchObject({ formato: "xlsx", fora, fora_do_padrao: { celulas: 1, linhas: [2] } });
    expect(sc?.p_linhas).toEqual([{ numero: 2, sku: "ACE-1", fisico: 1000, disponivel: 998 }, { numero: 3, sku: "APA-1", fisico: 2, disponivel: 2 }]);
    // Na outra loja nenhuma quantidade veio fora do padrão (não há a nota), e a fração do Excel continua sem virar inteiro (F18-01).
    expect(ms?.p_mapeamento).toMatchObject({ fora });
    expect(ms?.p_mapeamento).not.toHaveProperty("fora_do_padrao");
    expect(ms?.p_linhas).toEqual([{ numero: 2, sku: "ACE-1", fisico: 5, disponivel: null },
      { numero: 3, sku: "APA-1", fisico: null, disponivel: null, problema: 'Quantidade que não é número inteiro: "0.5"' }]);
  });

  it("sem permissão, sem data de corte, sem mapeamento ou sem quantidade: volta apontado, sem ir ao banco; a recusa do banco vira a mensagem", async () => {
    expect(destino(await enviar({ ...campos, corte: "10/11/2026" }))).toBe("/estoque/carga?erro=corte");
    expect(destino(await enviar({ corte: "2026-11-10T13:20", coluna_sku: "0" }))).toBe("/estoque/carga?erro=mapeamento");
    expect(destino(await enviar({ ...campos }, "Código;Santa Cândida Qtd.\nACE-1;0\n"))).toBe("/estoque/carga?erro=mapeamento");
    expect(destino(await enviar({ corte: "2026-11-10T13:20", coluna_sku: "0", [`fisico_${SC}`]: "1" }, "Código;Santa Cândida Qtd.\nACE-1;0\n"))).toBe("/estoque/carga?erro=nenhuma");
    expect(chamadas("estoque_carga_previa")).toEqual([]);
    cenario.respostas.estoque_carga_previa = { data: null, error: { code: "OR023", message: "Este arquivo já foi aplicado nesta loja (carga nº 1)" } };
    expect(destino(await enviar(campos))).toBe("/estoque/carga?erro=aplicado");
    cenario.permissoes = new Set(["importacao.aprovar"]);
    expect(destino(await enviar(campos))).toBe("/estoque/carga?erro=permissao");
  });
});

const params = (p: Record<string, string> = {}) => ({ searchParams: Promise.resolve(p) }) as never;
const carga = (mudar: Record<string, unknown> = {}) => ({
  id: CARGA, numero: 7, unidade_id: SC, arquivo_nome: "relatorioProdutos.xlsx", corte: "2026-11-10T16:20:00Z", situacao: "previa", criado_por: "outra",
  criado_em: "2026-11-18T03:00:00Z", aplicado_em: null, encerrado_em: null, motivo: null, unidades: { nome: "Santa Cândida" },
  mapeamento: { fora: { linha: 2273, motivo: "rodapé de totais no fim da planilha" } },
  totais: { linhas: 5, entrar: 2, unidades_entrar: 15, serializado: 1, unidades_serializado: 2, sem_produto: 1, conferir: 1, nada: 0, fora_do_disponivel: 3 }, ...mudar,
});

describe("as telas da carga", () => {
  it("quem não importa nem aprova vê o aviso; a lista mostra cada carga com a situação e o formulário para quem importa", async () => {
    cenario.permissoes = new Set(["venda.ver_todas"]);
    expect(limpar(await CargaDoEstoque(params()))).toContain("é de quem importa (o administrador) e de quem aprova (o dono)");
    cenario.permissoes = new Set(["importacao.executar"]);
    cenario.tabelas.estoque_cargas = [carga()];
    const tela = limpar(await CargaDoEstoque(params({ ok: "previa", cargas: "2", repetidas: "1" })));
    for (const trecho of ["Prévia gerada: 2 lojas novas e 1 que já tinham a prévia deste arquivo", "Carga nº 7 · Santa Cândida", "posição de 10/11/2026 13:20",
      "prévia", "15 unidades a entrar", "2 com IMEI", "2 a conferir", "Data e hora da posição do arquivo", "Gerar as prévias", "Como a carga funciona"]) {
      expect(tela, trecho).toContain(trecho);
    }
    cenario.permissoes = new Set(["importacao.aprovar"]);
    expect(limpar(await CargaDoEstoque(params()))).toContain("Você aplica as prévias que outra pessoa gerou");
  });

  it("a carga: os totais, as linhas do tipo escolhido e aplicar só para quem aprova e não gerou a prévia", async () => {
    cenario.permissoes = new Set(["importacao.aprovar"]);
    cenario.tabelas.estoque_cargas = [carga()];
    cenario.tabelas.estoque_carga_linhas = [
      { numero: 2, sku: "ACE-1", fisico: 10, disponivel: 8, saldo_no_corte: 0, acao: "entrar", motivo: null, desfeita_em: null, variantes: { nome: "Capa" } },
      { numero: 4, sku: "XYZ-9", fisico: 1, disponivel: 1, saldo_no_corte: 0, acao: "sem_produto", motivo: "O código não está no catálogo: importe o catálogo antes", desfeita_em: null, variantes: null },
    ];
    const tela = limpar(await UmaCarga({ params: Promise.resolve({ id: CARGA }), searchParams: Promise.resolve({ ver: "entrar" }) } as never));
    for (const trecho of ["Carga nº 7 · Santa Cândida", "Entram no estoque", "15", "2 produtos (acessórios)", "Ficou de fora a linha 2273 do arquivo: rodapé de totais no fim da planilha.",
      "Linha 2 · ACE-1 · Capa", "físico 10 · disponível 8", "Aplicar a carga", "Descartar"]) {
      expect(tela, trecho).toContain(trecho);
    }
    expect(tela).not.toContain("XYZ-9");
    // F21-01: a prévia diz as quantidades que vieram escritas com vírgula numa célula de número, e como foram lidas.
    expect(tela).not.toContain("escritas com vírgula");
    cenario.tabelas.estoque_cargas = [carga({ mapeamento: { fora_do_padrao: { celulas: 2, linhas: [2, 9] } } })];
    expect(limpar(await UmaCarga({ params: Promise.resolve({ id: CARGA }), searchParams: Promise.resolve({ ver: "entrar" }) } as never)))
      .toContain("2 quantidade(s) desta loja vieram marcadas como número no Excel, mas escritas com vírgula (o formato da exportação): foram lidas como estão escritas. Confira as linhas 2, 9 do arquivo.");
    cenario.tabelas.estoque_cargas = [carga({ criado_por: "eu" })];
    const minha = limpar(await UmaCarga({ params: Promise.resolve({ id: CARGA }), searchParams: Promise.resolve({}) } as never));
    expect(minha).toContain("Você gerou esta prévia");
    expect(minha).not.toContain("Aplicar a carga");
    cenario.tabelas.estoque_cargas = [carga({ situacao: "aplicada", aplicado_em: "2026-11-18T04:00:00Z" })];
    const aplicada = limpar(await UmaCarga({ params: Promise.resolve({ id: CARGA }), searchParams: Promise.resolve({ ok: "aplicada", entradas: "2", unidades: "15" }) } as never));
    expect(aplicada).toContain("Carga aplicada: 2 produtos e 15 unidades entraram no estoque.");
    expect(aplicada).toContain("Desfazer a carga");
    expect(aplicada).not.toContain("Aplicar a carga");
  });
});

describe("a diferença entre o físico e o disponível (REIN-c, achado F18-03 da reanálise de 18/11)", () => {
  const linhaSemDecisao = { numero: 3, sku: "ACE-2", fisico: 5, disponivel: 2, saldo_no_corte: 0, acao: "conferir", lancar: null, pendencia: "fisico_maior_que_disponivel",
    resolucao: null, resolvido_por: null, resolvido_em: null, motivo_resolucao: null, desfeita_em: null, variantes: { nome: "Película" },
    motivo: "O físico (5) é maior que o disponível (2) na data de corte: a diferença pode estar reservada, a caminho ou com erro. Resolva antes de aplicar" };
  const linhaDecidida = { numero: 2, sku: "ACE-1", fisico: 10, disponivel: 8, saldo_no_corte: 0, acao: "entrar", lancar: 8, pendencia: "fisico_maior_que_disponivel",
    resolucao: "disponivel", resolvido_por: "outra", resolvido_em: "2026-11-18T13:00:00Z", motivo_resolucao: "Duas estão reservadas para clientes", desfeita_em: null,
    variantes: { nome: "Capa" }, motivo: "O físico (10) é maior que o disponível (8) na data de corte: a diferença pode estar reservada, a caminho ou com erro. Resolva antes de aplicar" };
  const totais = { linhas: 5, entrar: 1, unidades_entrar: 8, serializado: 1, unidades_serializado: 2, sem_produto: 1, conferir: 2, nada: 0, fora_do_disponivel: 5, a_resolver: 1, resolvidas: 1 };
  const abrir = async (busca: Record<string, string> = {}) => limpar(await UmaCarga({ params: Promise.resolve({ id: CARGA }), searchParams: Promise.resolve(busca) } as never));

  it("com linha sem decisão, a carga abre nas diferenças: cada linha com a decisão (quem, quando e o motivo) ou o formulário, e aplicar espera", async () => {
    cenario.permissoes = new Set(["importacao.aprovar"]);
    cenario.tabelas.estoque_cargas = [carga({ totais })];
    cenario.tabelas.estoque_carga_linhas = [linhaDecidida, linhaSemDecisao, { ...linhaSemDecisao, numero: 4, sku: "SEM-DIF", pendencia: null, motivo: "Linha sem o código do produto" }];
    cenario.tabelas.perfis_usuario = [{ id: "outra", nome: "Ana (teste)" }];
    const tela = await abrir();
    for (const trecho of ["Físico maior que o disponível (2; 1 sem decisão)", "1 linha sem decisão: resolva antes de aplicar", "o sistema não presume nada",
      "Linha 2 · ACE-1 · Capa", "físico 10 · disponível 8 · entram 8", "Decisão: Lançar só o disponível (8), por Ana (teste) em 18/11/2026 10:00: Duas estão reservadas para clientes",
      "Linha 3 · ACE-2 · Película", "Sem decisão: a carga não se aplica até resolver esta linha.", "Lançar o físico (5)", "Lançar só o disponível (2)", "Deixar a linha de fora",
      "Registrar a decisão", "Mudar a decisão", "Antes de aplicar, decida a linha com o físico maior que o disponível."]) {
      expect(tela, trecho).toContain(trecho);
    }
    expect(tela).not.toContain("SEM-DIF");
    expect(tela).not.toContain("Aplicar a carga");
    // Uma só sem decisão: o bloco não aparece (é para duas ou mais).
    expect(tela).not.toContain("Registrar para todas");
    cenario.tabelas.estoque_cargas = [carga({ totais: { ...totais, a_resolver: 3, resolvidas: 0 } })];
    const varias = await abrir({ ver: "diferenca" });
    expect(varias).toContain("Decidir de uma vez as 3 linhas sem decisão");
    expect(varias).toContain("Antes de aplicar, decida as 3 linhas com o físico maior que o disponível.");
    // Todas decididas: aplicar volta, e a vista de entrada mostra quantas entram.
    cenario.tabelas.estoque_cargas = [carga({ totais: { ...totais, a_resolver: 0, resolvidas: 2 } })];
    const decidida = await abrir({ ver: "entrar" });
    expect(decidida).toContain("Aplicar a carga");
    expect(decidida).toContain("2 linhas com a decisão registrada");
  });

  it("quem vê a carga aplicada lê as decisões, sem formulário; a carga antiga sem os totais novos abre como antes", async () => {
    cenario.permissoes = new Set(["importacao.aprovar"]);
    cenario.tabelas.estoque_cargas = [carga({ situacao: "aplicada", aplicado_em: "2026-11-18T14:00:00Z", totais: { ...totais, a_resolver: 0, resolvidas: 1 } })];
    cenario.tabelas.estoque_carga_linhas = [linhaDecidida];
    cenario.tabelas.perfis_usuario = [];
    const tela = await abrir({ ver: "diferenca" });
    expect(tela).toContain("Decisão: Lançar só o disponível (8), por quem importa ou aprova em 18/11/2026 10:00");
    expect(tela).not.toContain("Registrar a decisão");
    cenario.tabelas.estoque_cargas = [carga()];
    cenario.tabelas.estoque_carga_linhas = [];
    const antiga = await abrir({ ver: "diferenca" });
    expect(antiga).not.toContain("Físico maior que o disponível (");
    expect(antiga).toContain("Aplicar a carga");
  });

  const form = (campos: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; };
  it("a decisão de uma linha e a de todas vão ao banco com o motivo; o físico em bloco e a decisão desconhecida não saem daqui", async () => {
    cenario.respostas.estoque_carga_resolver = { data: { id: CARGA, numero: 2, acao: "entrar", lancar: 10 }, error: null };
    await expect(resolverDiferenca(form({ carga: CARGA, linha: "2", resolucao: "fisico", motivo: "Contei na loja: livres" })))
      .rejects.toThrow(`redirecionou para /estoque/carga/${CARGA}?ver=diferenca&ok=resolvida&linha=2`);
    expect(chamadas("estoque_carga_resolver")).toEqual([{ p_carga: CARGA, p_resolucao: "fisico", p_motivo: "Contei na loja: livres", p_numero: 2 }]);
    cenario.respostas.estoque_carga_resolver = { data: { id: CARGA, linhas: 3 }, error: null };
    await expect(resolverDiferenca(form({ carga: CARGA, resolucao: "disponivel", motivo: "Só o livre, até contar" })))
      .rejects.toThrow(`redirecionou para /estoque/carga/${CARGA}?ver=diferenca&ok=resolvidas&linhas=3`);
    expect(chamadas("estoque_carga_resolver")[1]).toEqual({ p_carga: CARGA, p_resolucao: "disponivel", p_motivo: "Só o livre, até contar" });
    await expect(resolverDiferenca(form({ carga: CARGA, resolucao: "fisico", motivo: "Tudo livre" }))).rejects.toThrow(`?ver=diferenca&erro=fisico_em_bloco`);
    await expect(resolverDiferenca(form({ carga: CARGA, linha: "2", resolucao: "metade", motivo: "Metade" }))).rejects.toThrow(`?ver=diferenca&erro=resolucao`);
    await expect(resolverDiferenca(form({ carga: CARGA, linha: "2 or 1", resolucao: "fora", motivo: "Fora" }))).rejects.toThrow(`?ver=diferenca&erro=dados`);
    await expect(resolverDiferenca(form({ carga: CARGA, linha: "2", resolucao: "fora", motivo: "x" }))).rejects.toThrow(`?ver=diferenca&erro=motivo`);
    expect(chamadas("estoque_carga_resolver")).toHaveLength(2);
    // As recusas do banco viram a mensagem certa.
    cenario.respostas.estoque_carga_resolver = { data: null, error: { code: "22023", message: "Esta linha não tem diferença a resolver" } };
    await expect(resolverDiferenca(form({ carga: CARGA, linha: "9", resolucao: "fora", motivo: "Fora" }))).rejects.toThrow(`?ver=diferenca&erro=sem_diferenca`);
    cenario.respostas.estoque_carga_resolver = { data: null, error: { code: "22023", message: "O físico se lança linha a linha, conferido na loja" } };
    await expect(resolverDiferenca(form({ carga: CARGA, linha: "", resolucao: "fora", motivo: "Fora" }))).rejects.toThrow(`?ver=diferenca&erro=fisico_em_bloco`);
    cenario.respostas.estoque_carga_resolver = { data: null, error: { code: "42501", message: "Sem permissão para resolver a linha da carga" } };
    await expect(resolverDiferenca(form({ carga: CARGA, linha: "2", resolucao: "fora", motivo: "Fora" }))).rejects.toThrow(`?ver=diferenca&erro=permissao`);
    cenario.respostas.estoque_carga_aplicar = { data: null, error: { code: "OR042", message: "Há linhas com o físico maior que o disponível sem resolução" } };
    await expect(aplicarCarga(form({ carga: CARGA, motivo: "Aplicando" }))).rejects.toThrow(`redirecionou para /estoque/carga/${CARGA}?erro=pendente`);
  });
});

describe("as ações", () => {
  const form = (campos: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; };
  it("aplicar e desfazer chamam o banco com o motivo e voltam à carga com o resultado; motivo curto não vai ao banco", async () => {
    cenario.respostas.estoque_carga_aplicar = { data: { id: CARGA, numero: 7, entradas: 2, unidades: 15 }, error: null };
    await expect(aplicarCarga(form({ carga: CARGA, motivo: "Carga inicial conferida" }))).rejects.toThrow(`redirecionou para /estoque/carga/${CARGA}?ok=aplicada&entradas=2&unidades=15`);
    expect(chamadas("estoque_carga_aplicar")).toEqual([{ p_carga: CARGA, p_motivo: "Carga inicial conferida" }]);
    await expect(aplicarCarga(form({ carga: CARGA, motivo: "x" }))).rejects.toThrow(`redirecionou para /estoque/carga/${CARGA}?erro=motivo`);
    cenario.respostas.estoque_carga_desfazer = { data: { desfeitas: 1, ficaram: 1 }, error: null };
    await expect(desfazerCarga(form({ carga: CARGA, motivo: "Carga errada" }))).rejects.toThrow(`redirecionou para /estoque/carga/${CARGA}?ok=desfeita&desfeitas=1&ficaram=1`);
    cenario.respostas.estoque_carga_aplicar = { data: null, error: { code: "OR024", message: "Quem gerou a prévia não aplica" } };
    await expect(aplicarCarga(form({ carga: CARGA, motivo: "Aplicando" }))).rejects.toThrow(`redirecionou para /estoque/carga/${CARGA}?erro=propria`);
    await expect(aplicarCarga(form({ carga: "1 or 1=1", motivo: "Aplicando" }))).rejects.toThrow("redirecionou para /estoque/carga?erro=dados");
  });
});

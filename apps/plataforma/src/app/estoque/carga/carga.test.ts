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

import { aplicarCarga, desfazerCarga } from "./acoes";
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

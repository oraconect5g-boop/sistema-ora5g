// Importação por planilha (L3c) com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede,
// nenhum arquivo real (o formato da Rein é a pendência B1). Confere o envio (origem, limites, colunas,
// impressão digital e linhas mandadas ao banco), a tela da prévia e as ações. As regras do banco estão
// provadas em packages/banco/src/importacao.test.ts.
import { createHash } from "node:crypto";

import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const ORG = "00000000-0000-4000-8000-0000000000ff";
const ADMIN = "00000000-0000-4000-8000-0000000000ab";
const DONO = "00000000-0000-4000-8000-0000000000aa";
const IMPORTACAO = "00000000-0000-4000-9000-000000000050";

const cenario = vi.hoisted(() => ({
  usuario: "",
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] !== valor); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Record<string, unknown>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  get usuario() { return { id: cenario.usuario }; },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-11T23:00:00Z" },
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: null };
    },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { aplicarImportacao, desfazerImportacao } from "./acoes";
import { POST } from "./enviar/route";
import Importar from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string> = {}) =>
  texto(await Importar({ searchParams: Promise.resolve(parametros) }) as ReactElement).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};
const CSV = "SKU;Descrição;Preço\nACE-9;Capa teste;79,90\nACE-10;Película teste;29,90\n";
function envio(campos: Record<string, string>, conteudo: string | null = CSV, origem = "http://127.0.0.1:3100") {
  const f = new FormData();
  if (conteudo !== null) f.set("arquivo", new File([conteudo], "catalogo.csv", { type: "text/csv" }));
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return new Request("http://127.0.0.1:3100/produtos/importar/enviar", { method: "POST", body: f, headers: { origin: origem, host: "127.0.0.1:3100" } });
}
const MAPA = { coluna_sku: "0", coluna_nome: "1", coluna_preco: "2", tipo_padrao: "acessorio", categoria_padrao: "Acessórios" };

beforeEach(() => {
  cenario.usuario = ADMIN;
  cenario.permissoes = new Set();
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.tabelas = {
    unidades: [{ id: LOJA, organizacao_id: ORG }],
    categorias: [{ nome: "Acessórios", ativa: true }],
    importacoes: [{
      id: IMPORTACAO, numero: 7, arquivo_nome: "catalogo.csv", situacao: "previa", criado_por: ADMIN, criado_em: "2026-11-11T13:00:00Z",
      aplicado_em: null, encerrado_em: null, motivo: null,
      totais: { linhas: 3, criar: 1, atualizar: 1, sem_mudanca: 0, erro: 1, categorias_novas: 0, marcas_novas: 1 },
      mapeamento: { colunas: { sku: "SKU", nome: "Descrição", preco: "Preço" }, padroes: { tipo: "acessorio", categoria: "Acessórios" } },
    }],
    importacao_linhas: [
      { importacao_id: IMPORTACAO, numero: 2, acao: "criar", erros: [], diferencas: {}, dados: { sku: "ACE-9", nome: "Capa teste", tipo: "acessorio", categoria: "Acessórios", marca: "Marca Nova", preco: 7_990 } },
      { importacao_id: IMPORTACAO, numero: 3, acao: "atualizar", erros: [], diferencas: { preco: [7_900, 8_490] }, dados: { sku: "ACE-0001", nome: "Capa de proteção" } },
      { importacao_id: IMPORTACAO, numero: 4, acao: "erro", erros: ["SKU repetido no arquivo (já na linha 2)"], diferencas: {}, dados: { sku: "ace-9", nome: "Repetido" } },
    ],
  };
});

describe("envio da planilha", () => {
  it("relê o arquivo no servidor, calcula a impressão digital e manda as linhas e o mapeamento ao banco", async () => {
    cenario.respostas.importacao_catalogo_previa = { data: { id: IMPORTACAO, repetida: false }, error: null };
    const r = await POST(envio(MAPA) as never);
    expect([r.status, r.headers.get("location")]).toEqual([303, `/produtos/importar?importacao=${IMPORTACAO}&ok=previa`]);
    const argumentos = cenario.chamadas[0]?.argumentos ?? {};
    expect(argumentos.p_organizacao).toBe(ORG);
    expect(argumentos.p_sha256).toBe(createHash("sha256").update(CSV).digest("hex"));
    expect(argumentos.p_mapeamento).toEqual({ colunas: { sku: "SKU", nome: "Descrição", preco: "Preço" }, padroes: { tipo: "acessorio", categoria: "Acessórios" } });
    expect(argumentos.p_linhas).toEqual([
      expect.objectContaining({ numero: 2, sku: "ACE-9", nome: "Capa teste", preco: 7_990, tipo: "acessorio", categoria: "Acessórios", erros: [] }),
      expect.objectContaining({ numero: 3, sku: "ACE-10", preco: 2_990 }),
    ]);
  });

  it("recusa outra origem, arquivo ausente, colunas faltando e CSV quebrado, sem chamar o banco", async () => {
    expect((await POST(envio(MAPA, CSV, "https://outro-site.exemplo") as never)).status).toBe(403);
    expect((await POST(envio(MAPA, null) as never)).headers.get("location")).toBe("/produtos/importar?erro=arquivo");
    expect((await POST(envio({ ...MAPA, coluna_nome: "" }) as never)).headers.get("location")).toBe("/produtos/importar?erro=mapeamento");
    expect((await POST(envio({ ...MAPA, tipo_padrao: "geladeira" }) as never)).headers.get("location")).toBe("/produtos/importar?erro=padrao");
    expect((await POST(envio(MAPA, 'SKU;Descrição\nA1;"aberta') as never)).headers.get("location")).toBe("/produtos/importar?erro=aspas");
    expect((await POST(envio(MAPA, "SKU;Descrição;Preço\n") as never)).headers.get("location")).toBe("/produtos/importar?erro=vazio");
    expect(cenario.chamadas).toEqual([]);
  });

  it("arquivo já aplicado volta com a mensagem do catálogo", async () => {
    cenario.respostas.importacao_catalogo_previa = { data: null, error: { code: "OR023", message: "Este arquivo já foi aplicado" } };
    expect((await POST(envio(MAPA) as never)).headers.get("location")).toBe("/produtos/importar?erro=ja_aplicado");
  });
});

describe("/produtos/importar", () => {
  it("sem importacao.executar nem importacao.aprovar: sem permissão", async () => {
    cenario.permissoes = new Set(["catalogo.gerir"]);
    expect(await tela()).toContain("Sem permissão");
  });

  it("administrador vê a prévia com os erros e as mudanças; não aplica (é dele) e pode enviar outra", async () => {
    cenario.permissoes = new Set(["importacao.executar"]);
    const t = await tela({ importacao: IMPORTACAO });
    for (const trecho of ["Importação nº 7", "prévia", "Linha 4", "SKU repetido no arquivo (já na linha 2)", "ACE-9", "R$ 79,90", "Preço de venda (R$): R$ 79,00 → R$ 84,90", "Gerar prévia", "Descartar esta prévia"]) {
      expect(t).toContain(trecho);
    }
    expect(t).not.toContain("Aplicar no catálogo");
  });

  it("dono que não gerou a prévia vê o botão de aplicar (desligado enquanto houver erro); quem gerou vê o aviso", async () => {
    cenario.usuario = DONO;
    cenario.permissoes = new Set(["importacao.aprovar"]);
    expect(await tela({ importacao: IMPORTACAO })).toContain("Aplicar no catálogo");
    cenario.usuario = ADMIN;
    expect(await tela({ importacao: IMPORTACAO })).toContain("Você gerou esta prévia");
  });

  it("ações: aplicar e desfazer mandam o motivo e voltam com a mensagem certa", async () => {
    cenario.respostas.importacao_aplicar = { data: null, error: { code: "OR024", message: "Quem gerou a prévia não aprova" } };
    expect(await destinoDe(aplicarImportacao(formulario({ importacao: IMPORTACAO, motivo: "Carga inicial" })))).toBe(`/produtos/importar?importacao=${IMPORTACAO}&erro=mesma_pessoa`);
    cenario.respostas.importacao_desfazer = { data: { repetida: false, desfeitas: 3, mantidas: 1 }, error: null };
    expect(await destinoDe(desfazerImportacao(formulario({ importacao: IMPORTACAO, motivo: "Arquivo errado" })))).toBe(`/produtos/importar?importacao=${IMPORTACAO}&ok=desfeita_parcial`);
    expect(await destinoDe(desfazerImportacao(formulario({ importacao: IMPORTACAO, motivo: "x" })))).toBe(`/produtos/importar?importacao=${IMPORTACAO}&erro=motivo`);
  });
});

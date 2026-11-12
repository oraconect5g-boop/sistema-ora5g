// Importação por planilha (L3c e R2) com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede,
// nenhum arquivo real (o formato da Rein é a pendência B1). Confere o envio (origem, limites, colunas,
// impressão digital e linhas mandadas ao banco), a tela da prévia (filtro, páginas, comparação conferida e
// resultado do desfazer) e as ações. As regras do banco estão provadas em packages/banco/src/importacao.test.ts,
// importacao-correcoes.test.ts e concorrencia.test.ts.
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
  consultas: [] as { tabela: string; filtros: string[]; faixa: [number, number] | null }[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  registro: { tabela: string; filtros: string[]; faixa: [number, number] | null };
  constructor(nome: string) {
    this.linhas = [...(cenario.tabelas[nome] ?? [])];
    this.registro = { tabela: nome, filtros: [], faixa: null };
    cenario.consultas.push(this.registro);
  }
  select() { return this; }
  eq(coluna: string, valor: unknown) {
    this.registro.filtros.push(`${coluna}=${String(valor)}`);
    this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor);
    return this;
  }
  neq(coluna: string, valor: unknown) {
    this.registro.filtros.push(`${coluna}<>${String(valor)}`);
    this.linhas = this.linhas.filter((l) => l[coluna] !== valor);
    return this;
  }
  order(coluna: string) {
    if (coluna === "numero") this.linhas.sort((a, b) => Number(a.numero) - Number(b.numero));
    return this;
  }
  limit() { return this; }
  // Como no PostgREST: os dois extremos entram, e faixa além do fim devolve lista vazia.
  range(de: number, ate: number) { this.registro.faixa = [de, ate]; this.linhas = this.linhas.slice(de, ate + 1); return this; }
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

import { aplicarImportacao, descartarImportacao, desfazerImportacao } from "./acoes";
import { POST } from "./enviar/route";
import Importar from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const arvore = async (parametros: Record<string, string> = {}) => await Importar({ searchParams: Promise.resolve(parametros) }) as ReactElement;
const tela = async (parametros: Record<string, string> = {}) => texto(await arvore(parametros)).replace(/\s+/g, " ");
/** Todos os elementos da árvore que passam no critério (para achar campo escondido e link pelo que são). */
function elementos(v: unknown, criterio: (props: Record<string, unknown>) => boolean, achados: Record<string, unknown>[] = []) {
  if (Array.isArray(v)) for (const item of v) elementos(item, criterio, achados);
  else if (isValidElement<Record<string, unknown>>(v)) {
    if (criterio(v.props)) achados.push(v.props);
    for (const filho of Object.values(v.props)) elementos(filho, criterio, achados);
  } else if (v && typeof v === "object") for (const item of Object.values(v)) elementos(item, criterio, achados);
  return achados;
}
const linhasDaFaixa = () => cenario.consultas.filter((c) => c.tabela === "importacao_linhas").at(-1);
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
  cenario.consultas = [];
  cenario.tabelas = {
    unidades: [{ id: LOJA, organizacao_id: ORG }],
    categorias: [{ nome: "Acessórios", ativa: true }],
    importacoes: [{
      id: IMPORTACAO, numero: 7, arquivo_nome: "catalogo.csv", situacao: "previa", criado_por: ADMIN, criado_em: "2026-11-11T13:00:00Z",
      aplicado_em: null, encerrado_em: null, motivo: null, comparacao: 1, comparado_em: null, desfazer: null,
      totais: { linhas: 3, criar: 1, atualizar: 1, sem_mudanca: 0, erro: 1, categorias_novas: 0, marcas_novas: 1 },
      mapeamento: { colunas: { sku: "SKU", nome: "Descrição", preco: "Preço" }, padroes: { tipo: "acessorio", categoria: "Acessórios" } },
    }],
    importacao_linhas: [
      { importacao_id: IMPORTACAO, numero: 2, acao: "criar", erros: [], diferencas: {}, desfeito: null, dados: { sku: "ACE-9", nome: "Capa teste", produto: "Capa", tipo: "acessorio", categoria: "Acessórios", marca: "Marca Nova", codigo_barras: "7891234567895", cor: "Preta", capacidade: null, preco: 7_990, custo: 3_100 } },
      { importacao_id: IMPORTACAO, numero: 3, acao: "atualizar", erros: [], diferencas: { preco: [7_900, 8_490] }, desfeito: null, dados: { sku: "ACE-0001", nome: "Capa de proteção" } },
      { importacao_id: IMPORTACAO, numero: 4, acao: "erro", erros: ["SKU repetido no arquivo (já na linha 2)"], diferencas: {}, desfeito: null, dados: { sku: "ace-9", nome: "Repetido" } },
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

  it("arquivo que já tinha prévia: diz se a comparação refeita mudou; sem o número da prévia, não inventa sucesso", async () => {
    const destino = async () => (await POST(envio(MAPA) as never)).headers.get("location");
    cenario.respostas.importacao_catalogo_previa = { data: { id: IMPORTACAO, repetida: true, atualizada: false }, error: null };
    expect(await destino()).toBe(`/produtos/importar?importacao=${IMPORTACAO}&ok=previa_repetida`);
    cenario.respostas.importacao_catalogo_previa = { data: { id: IMPORTACAO, repetida: true, atualizada: true }, error: null };
    expect(await destino()).toBe(`/produtos/importar?importacao=${IMPORTACAO}&ok=previa_atualizada`);
    cenario.respostas.importacao_catalogo_previa = { data: null, error: null };
    expect(await destino()).toBe("/produtos/importar?erro=falha");
  });

  it("planilha com categorias e marcas diferentes demais volta com a orientação de dividir", async () => {
    cenario.respostas.importacao_catalogo_previa = { data: null, error: { code: "22023", message: "O arquivo traz categorias e marcas diferentes demais para uma importação só: divida a planilha em partes" } };
    expect((await POST(envio(MAPA) as never)).headers.get("location")).toBe("/produtos/importar?erro=nomes");
  });
});


/** Prévia grande: as linhas numeradas a partir da 2 (a 1 é o cabeçalho), na ordem das ações pedidas. */
function previaGrande(acoes: { criar?: number; atualizar?: number; sem_mudanca?: number; erro?: number }) {
  const linhas: Record<string, unknown>[] = [];
  let numero = 2;
  for (const [acao, quantas] of Object.entries(acoes)) {
    for (let i = 0; i < quantas; i++, numero++) {
      linhas.push({
        importacao_id: IMPORTACAO, numero, acao, erros: acao === "erro" ? ["Preço inválido"] : [], diferencas: acao === "atualizar" ? { preco: [1_000, 1_100] } : {}, desfeito: null,
        dados: { sku: `G-${numero}`, nome: `Item ${numero}`, tipo: "acessorio", categoria: "Acessórios", marca: null, preco: 1_100, custo: null },
      });
    }
  }
  cenario.tabelas.importacao_linhas = linhas;
  Object.assign(cenario.tabelas.importacoes?.[0] ?? {}, {
    totais: { linhas: linhas.length, criar: acoes.criar ?? 0, atualizar: acoes.atualizar ?? 0, sem_mudanca: acoes.sem_mudanca ?? 0, erro: acoes.erro ?? 0, categorias_novas: 0, marcas_novas: 0 },
  });
}
const mudarImportacao = (campos: Record<string, unknown>) => Object.assign(cenario.tabelas.importacoes?.[0] ?? {}, campos);

describe("/produtos/importar", () => {
  it("sem importacao.executar nem importacao.aprovar: sem permissão", async () => {
    cenario.permissoes = new Set(["catalogo.gerir"]);
    expect(await tela()).toContain("Sem permissão");
    expect(cenario.consultas).toEqual([]);
  });

  it("administrador vê a prévia com os erros e as mudanças; não aplica (é dele) e pode enviar outra", async () => {
    cenario.permissoes = new Set(["importacao.executar"]);
    const a = await arvore({ importacao: IMPORTACAO });
    const t = texto(a).replace(/\s+/g, " ");
    for (const trecho of [
      "Importação nº 7", "prévia", "1 linha(s) com erro", "Ver só as linhas com erro", "Linha 4", "SKU repetido no arquivo (já na linha 2)",
      "ACE-9", "modelo Capa · Acessório (por quantidade) · Acessórios · Marca Nova · Preta · código de barras 7891234567895 · preço R$ 79,90 · custo R$ 31,00",
      "Preço de venda (R$): R$ 79,00 → R$ 84,90", "Gerar prévia", "Descartar esta prévia",
    ]) {
      expect(t).toContain(trecho);
    }
    expect(t).not.toContain("Aplicar no catálogo");
    expect(t).not.toContain("comparada de novo");
    expect(elementos(a, (p) => p.name === "comparacao")).toEqual([]);
  });

  it("dono que não gerou a prévia aplica a comparação que está na tela (botão desligado enquanto houver erro); quem gerou vê o aviso", async () => {
    cenario.usuario = DONO;
    cenario.permissoes = new Set(["importacao.aprovar"]);
    mudarImportacao({ comparacao: 3, comparado_em: "2026-11-12T15:30:00Z" });
    const a = await arvore({ importacao: IMPORTACAO });
    const t = texto(a).replace(/\s+/g, " ");
    expect(t).toContain("Aplicar no catálogo");
    expect(t).toContain("comparada de novo em 12/11/2026 12:30 (comparação nº 3)");
    expect(elementos(a, (p) => p.name === "comparacao")).toEqual([expect.objectContaining({ type: "hidden", value: "3" })]);
    expect(elementos(a, (p) => p.type === "submit" && p.children === "Aplicar")).toEqual([expect.objectContaining({ disabled: true })]);
    mudarImportacao({ totais: { linhas: 2, criar: 1, atualizar: 1, sem_mudanca: 0, erro: 0, categorias_novas: 0, marcas_novas: 1 } });
    expect(elementos(await arvore({ importacao: IMPORTACAO }), (p) => p.type === "submit" && p.children === "Aplicar")).toEqual([expect.objectContaining({ disabled: false })]);
    cenario.usuario = ADMIN;
    expect(await tela({ importacao: IMPORTACAO })).toContain("Você gerou esta prévia");
  });

  it("a prévia que voltou desatualizada explica que nada foi aplicado", async () => {
    cenario.usuario = DONO;
    cenario.permissoes = new Set(["importacao.aprovar"]);
    const t = await tela({ importacao: IMPORTACAO, erro: "desatualizada" });
    expect(t).toContain("O cadastro mudou depois da conferência e nada foi aplicado");
    expect(await tela({ importacao: IMPORTACAO, ok: "previa_atualizada" })).toContain("O cadastro mudou desde a última comparação");
  });

  it("conferência integral: o arquivo inteiro por filtro e por página, sem teto de linhas", async () => {
    cenario.usuario = DONO;
    cenario.permissoes = new Set(["importacao.aprovar"]);
    previaGrande({ criar: 120, atualizar: 100, sem_mudanca: 25, erro: 5 });
    // Os links levam a comparação em que a pessoa está conferindo (c=1).
    const base = `/produtos/importar?importacao=${IMPORTACAO}&c=1`;

    // Padrão: o que muda e o que tem erro (225 linhas), primeira página.
    let a = await arvore({ importacao: IMPORTACAO });
    let t = texto(a).replace(/\s+/g, " ");
    expect(linhasDaFaixa()).toEqual({ tabela: "importacao_linhas", filtros: [`importacao_id=${IMPORTACAO}`, "acao<>sem_mudanca"], faixa: [0, 99] });
    expect(t).toContain("Página 1 de 3 · 1–100 de 225 neste filtro");
    expect(t).toContain("G-2 ");
    expect(t).toContain("G-101 ");
    expect(t).not.toContain("G-102 ");
    expect(elementos(a, (p) => Array.isArray(p.opcoes))[0]?.opcoes).toEqual([
      { href: base, rotulo: "Com mudança ou erro", ativo: true, contagem: 225 },
      { href: `${base}&ver=criar`, rotulo: "Novos", ativo: false, contagem: 120 },
      { href: `${base}&ver=atualizar`, rotulo: "Mudam", ativo: false, contagem: 100 },
      { href: `${base}&ver=sem_mudanca`, rotulo: "Iguais", ativo: false, contagem: 25 },
      { href: `${base}&ver=erro`, rotulo: "Com erro", ativo: false, contagem: 5 },
      { href: `${base}&ver=todas`, rotulo: "Todas", ativo: false, contagem: 250 },
    ]);
    expect(elementos(a, (p) => p.children === "Próxima").map((p) => p.href)).toEqual([`${base}&pagina=2#linhas`]);
    expect(elementos(a, (p) => p.children === "Anterior")).toEqual([]);

    // Última página: o resto das que mudam e as cinco com erro; página além do fim cai na última.
    for (const pagina of ["3", "99"]) {
      a = await arvore({ importacao: IMPORTACAO, pagina });
      t = texto(a).replace(/\s+/g, " ");
      expect(linhasDaFaixa()?.faixa).toEqual([200, 299]);
      expect(t).toContain("Página 3 de 3 · 201–225 de 225 neste filtro");
      expect(t).toContain("G-251 ");
      expect(t).toContain("Preço inválido");
      expect(elementos(a, (p) => p.children === "Anterior").map((p) => p.href)).toEqual([`${base}&pagina=2#linhas`]);
      expect(elementos(a, (p) => p.children === "Próxima")).toEqual([]);
    }
    // Página que não é número inteiro positivo cai na primeira.
    for (const pagina of ["0", "-1", "abc", "1.5", ""]) {
      await arvore({ importacao: IMPORTACAO, pagina });
      expect(linhasDaFaixa()?.faixa).toEqual([0, 99]);
    }

    // As iguais também podem ser conferidas.
    t = await tela({ importacao: IMPORTACAO, ver: "sem_mudanca" });
    expect(linhasDaFaixa()).toEqual({ tabela: "importacao_linhas", filtros: [`importacao_id=${IMPORTACAO}`, "acao=sem_mudanca"], faixa: [0, 99] });
    expect(t).toContain("G-222 ");
    expect(t).toContain("Igual ao cadastro: nada muda.");
    expect(t).not.toContain("Página 1 de");

    // Todas: sem filtro de ação, 250 linhas em 3 páginas; o filtro vai junto nos links das páginas.
    a = await arvore({ importacao: IMPORTACAO, ver: "todas", pagina: "2" });
    expect(linhasDaFaixa()).toEqual({ tabela: "importacao_linhas", filtros: [`importacao_id=${IMPORTACAO}`], faixa: [100, 199] });
    expect(texto(a).replace(/\s+/g, " ")).toContain("Página 2 de 3 · 101–200 de 250 neste filtro");
    expect(elementos(a, (p) => p.children === "Anterior" || p.children === "Próxima").map((p) => p.href)).toEqual([`${base}&ver=todas#linhas`, `${base}&ver=todas&pagina=3#linhas`]);

    // Só as com erro; filtro desconhecido (ou nome herdado de objeto) vale como o padrão.
    t = await tela({ importacao: IMPORTACAO, ver: "erro" });
    expect(linhasDaFaixa()?.filtros).toEqual([`importacao_id=${IMPORTACAO}`, "acao=erro"]);
    expect(t).toContain("As linhas com erro estão abaixo");
    for (const ver of ["geladeira", "__proto__", "constructor"]) {
      await tela({ importacao: IMPORTACAO, ver });
      expect(linhasDaFaixa()?.filtros).toEqual([`importacao_id=${IMPORTACAO}`, "acao<>sem_mudanca"]);
    }
  });

  it("prévia comparada de novo no meio da conferência: a página seguinte avisa e não oferece o aplicar", async () => {
    cenario.usuario = DONO;
    cenario.permissoes = new Set(["importacao.aprovar"]);
    previaGrande({ criar: 120, atualizar: 100 });
    const aplicar = (a: unknown) => elementos(a, (p) => p.type === "submit" && p.children === "Aplicar").length;
    // A pessoa conferiu a página 1 na comparação nº 1; antes de abrir a 2, a prévia foi comparada de novo.
    mudarImportacao({ comparacao: 2, comparado_em: "2026-11-12T15:30:00Z" });
    let a = await arvore({ importacao: IMPORTACAO, c: "1", pagina: "2" });
    let t = texto(a).replace(/\s+/g, " ");
    expect(t).toContain("A prévia foi comparada de novo enquanto você conferia");
    expect(t).toContain("Agora vale a comparação nº 2: o que você já tinha visto pode ter mudado.");
    expect(t).toContain("Para aplicar, confira de novo desde o começo");
    expect([aplicar(a), elementos(a, (p) => p.name === "comparacao")]).toEqual([0, []]);
    // O link de recomeçar (e todos os outros) já levam a comparação nova.
    const recomeco = `/produtos/importar?importacao=${IMPORTACAO}&c=2`;
    expect(elementos(a, (p) => p.children === "Conferir de novo desde o começo").map((p) => p.href)).toEqual([recomeco]);
    expect(elementos(a, (p) => p.children === "Próxima").map((p) => p.href)).toEqual([`${recomeco}&pagina=3#linhas`]);

    // Recomeçando na comparação nova, o aplicar volta, com o número novo.
    a = await arvore({ importacao: IMPORTACAO, c: "2" });
    t = texto(a).replace(/\s+/g, " ");
    expect(t).not.toContain("enquanto você conferia");
    expect([aplicar(a), elementos(a, (p) => p.name === "comparacao").map((p) => p.value)]).toEqual([1, ["2"]]);
    // Sem o parâmetro (chegada pela lista ou depois do envio) ou com valor que não é número, não há o que comparar.
    for (const c of [undefined, "", "0", "abc", "1.5", "-1"]) {
      a = await arvore({ importacao: IMPORTACAO, ...(c === undefined ? {} : { c }) });
      expect([c, texto(a).includes("enquanto você conferia"), aplicar(a)]).toEqual([c, false, 1]);
    }

    // Quem gerou a prévia também é avisado (e continua sem poder aplicar).
    cenario.usuario = ADMIN;
    t = await tela({ importacao: IMPORTACAO, c: "1" });
    expect(t).toContain("A prévia foi comparada de novo enquanto você conferia");
    expect(t).toContain("Você gerou esta prévia");

    // Importação aplicada não é mais comparada: os links não levam o número e o parâmetro é ignorado.
    cenario.usuario = DONO;
    mudarImportacao({ situacao: "aplicada", aplicado_em: "2026-11-12T16:00:00Z" });
    a = await arvore({ importacao: IMPORTACAO, c: "1" });
    expect(texto(a)).not.toContain("enquanto você conferia");
    expect(elementos(a, (p) => p.children === "Próxima").map((p) => p.href)).toEqual([`/produtos/importar?importacao=${IMPORTACAO}&pagina=2#linhas`]);
  });

  it("filtro sem linha nenhuma diz que está vazio, sem inventar página", async () => {
    cenario.permissoes = new Set(["importacao.executar"]);
    const t = await tela({ importacao: IMPORTACAO, ver: "sem_mudanca", pagina: "7" });
    expect(linhasDaFaixa()?.faixa).toEqual([0, 99]);
    expect(t).toContain("Nenhuma linha neste filtro.");
  });

  it("importação desfeita mostra o que voltou e o que ficou, linha a linha e com o motivo", async () => {
    cenario.usuario = DONO;
    cenario.permissoes = new Set(["importacao.aprovar"]);
    mudarImportacao({
      situacao: "desfeita", aplicado_em: "2026-11-11T14:00:00Z", encerrado_em: "2026-11-11T16:00:00Z", motivo: "Arquivo errado",
      desfazer: { desfeitas: 1, parciais: 1, mantidas: 1 }, totais: { linhas: 3, criar: 2, atualizar: 1, sem_mudanca: 0, erro: 0, categorias_novas: 0, marcas_novas: 1 },
    });
    cenario.tabelas.importacao_linhas = [
      { importacao_id: IMPORTACAO, numero: 2, acao: "criar", erros: [], diferencas: {}, dados: { sku: "ACE-9", nome: "Capa teste", tipo: "acessorio", categoria: "Acessórios", preco: 7_990 }, desfeito: { situacao: "desfeita", revertidos: ["variacao"], mantidos: {} } },
      { importacao_id: IMPORTACAO, numero: 3, acao: "atualizar", erros: [], diferencas: { nome: ["Capa", "Capa nova"], preco: [7_900, 8_490], custo: [null, 3_000], codigo_barras: ["789", "790"] }, dados: { sku: "ACE-0001", nome: "Capa nova" },
        desfeito: { situacao: "parcial", revertidos: ["nome"], mantidos: { preco: "alterado_depois", custo: "sem_custo_anterior", codigo_barras: "codigo_em_uso" } } },
      { importacao_id: IMPORTACAO, numero: 4, acao: "criar", erros: [], diferencas: {}, dados: { sku: "ACE-10", nome: "Película", tipo: "acessorio", categoria: "Acessórios", preco: 2_990 }, desfeito: { situacao: "mantida", revertidos: [], mantidos: { variacao: "em_uso" } } },
    ];
    const t = await tela({ importacao: IMPORTACAO });
    for (const trecho of [
      "desfeita em 11/11/2026 13:00", "O que o desfazer fez", "1 linha(s) voltaram por inteiro · 1 voltaram em parte · 1 ficaram como estavam.",
      "categorias, marcas e modelos criados continuam no cadastro",
      "voltou Voltou: a variação saiu de circulação",
      "voltou em parte Voltou: Nome completo do item · Ficou: Preço de venda (R$): mudou depois da importação; Custo (R$): não havia custo antes da importação; Código de barras (EAN): o código de antes já está em outra variação",
      "ficou como estava Ficou: a variação: já foi usada (estoque, reserva, venda ou IMEI)",
    ]) {
      expect(t).toContain(trecho);
    }
    expect(t).not.toContain("Desfazer esta importação");

    // Desfeita antes do R2: não há resultado por linha, e a tela diz isso em vez de mostrar zeros.
    mudarImportacao({ desfazer: null });
    cenario.tabelas.importacao_linhas = cenario.tabelas.importacao_linhas.map((l) => ({ ...l, desfeito: null }));
    const antiga = await tela({ importacao: IMPORTACAO });
    expect(antiga).toContain("antes de o sistema guardar o resultado linha a linha");
    expect(antiga).not.toContain("O que o desfazer fez");
  });

  it("importação aplicada: quem aprova pode desfazer, com o aviso do que não volta", async () => {
    cenario.usuario = DONO;
    cenario.permissoes = new Set(["importacao.aprovar"]);
    mudarImportacao({ situacao: "aplicada", aplicado_em: "2026-11-11T14:00:00Z", totais: { linhas: 2, criar: 1, atualizar: 1, sem_mudanca: 0, erro: 0, categorias_novas: 0, marcas_novas: 1 } });
    const a = await arvore({ importacao: IMPORTACAO });
    const t = texto(a).replace(/\s+/g, " ");
    expect(t).toContain("Desfazer esta importação");
    expect(t).toContain("categorias, marcas e modelos criados continuam no cadastro");
    expect(t).not.toContain("Aplicar no catálogo");
    expect(elementos(a, (p) => p.name === "comparacao")).toEqual([]);
  });
});

describe("ações da importação", () => {
  const base = `/produtos/importar?importacao=${IMPORTACAO}`;
  const campos = { importacao: IMPORTACAO, motivo: "  Carga   inicial " };
  const erroDoBanco = (code: string, message?: string) => ({ data: null, error: { code, message } });

  it("aplicar manda ao banco a comparação conferida e só diz 'aplicada' quando o banco disse que aplicou agora", async () => {
    cenario.usuario = DONO;
    cenario.respostas.importacao_aplicar = { data: { repetida: false, atualizada: false, comparacao: 3, totais: {} }, error: null };
    expect(await destinoDe(aplicarImportacao(formulario({ ...campos, comparacao: "3" })))).toBe(`${base}&ok=aplicada`);
    expect(cenario.chamadas).toEqual([{ nome: "importacao_aplicar", argumentos: { p_importacao: IMPORTACAO, p_motivo: "Carga inicial", p_comparacao: 3 } }]);

    // O cadastro mudou depois da conferência: nada entrou, e a tela pede para conferir a comparação nova.
    cenario.respostas.importacao_aplicar = { data: { repetida: false, atualizada: true, comparacao: 4, totais: {} }, error: null };
    expect(await destinoDe(aplicarImportacao(formulario({ ...campos, comparacao: "3" })))).toBe(`${base}&erro=desatualizada`);
    // Segundo clique numa importação já aplicada.
    cenario.respostas.importacao_aplicar = { data: { repetida: true, atualizada: false, comparacao: 3, totais: {} }, error: null };
    expect(await destinoDe(aplicarImportacao(formulario({ ...campos, comparacao: "3" })))).toBe(`${base}&ok=ja_aplicada`);
    // Resposta vazia ou pela metade não vira sucesso.
    for (const data of [null, {}, { repetida: false }, { atualizada: false }, { repetida: "false", atualizada: false }, "ok"]) {
      cenario.respostas.importacao_aplicar = { data, error: null };
      expect(await destinoDe(aplicarImportacao(formulario({ ...campos, comparacao: "3" })))).toBe(`${base}&erro=falha`);
    }
  });

  it("aplicar sem a comparação conferida (ou com ela adulterada) não chega ao banco", async () => {
    cenario.usuario = DONO;
    expect(await destinoDe(aplicarImportacao(formulario(campos)))).toBe(`${base}&erro=conferencia`);
    for (const comparacao of ["", "0", "-1", "1.5", "abc", "1e3", " 3", "3 ", "03", "1234567890"]) {
      expect(await destinoDe(aplicarImportacao(formulario({ ...campos, comparacao })))).toBe(`${base}&erro=conferencia`);
    }
    expect(cenario.chamadas).toEqual([]);
  });

  it("motivo curto, longo ou importação inválida: a ação para antes do banco", async () => {
    for (const acao of [aplicarImportacao, descartarImportacao, desfazerImportacao]) {
      expect(await destinoDe(acao(formulario({ importacao: IMPORTACAO, motivo: " x ", comparacao: "1" })))).toBe(`${base}&erro=motivo`);
      expect(await destinoDe(acao(formulario({ importacao: IMPORTACAO, motivo: "m".repeat(201), comparacao: "1" })))).toBe(`${base}&erro=motivo`);
      expect(await destinoDe(acao(formulario({ importacao: "7", motivo: "Carga inicial", comparacao: "1" })))).toBe("/produtos/importar?erro=dados");
    }
    expect(cenario.chamadas).toEqual([]);
  });

  it("cada recusa do banco ao aplicar vira a mensagem certa, e nenhuma vira sucesso", async () => {
    cenario.usuario = DONO;
    const casos: [string, string | undefined, string][] = [
      ["OR024", "Quem gerou a prévia não aprova: outra pessoa confere e aplica", "mesma_pessoa"],
      ["OR023", "Este arquivo já foi aplicado", "ja_aplicado"],
      ["OR022", "Há mudança de preço agendada para uma das variações: cancele antes de importar", "agendado"],
      ["40001", "O cadastro mudou enquanto a importação era aplicada: tente de novo", "instante"],
      ["40P01", "deadlock detected", "instante"],
      ["23505", "duplicate key value violates unique constraint", "instante"],
      ["22023", "A prévia traz categorias e marcas diferentes demais para uma importação só: divida a planilha em partes", "nomes"],
      ["22023", "A prévia tem linhas com erro: corrija o arquivo e gere outra prévia", "com_erro"],
      ["22023", "Informe a comparação conferida", "conferencia"],
      ["22023", "Esta importação já foi encerrada (descartada)", "encerrada"],
      ["22023", "Informe o motivo", "motivo"],
      ["42501", "permission denied for function importacao_aplicar", "permissao"],
      ["P0002", "Importação não encontrada para você", "permissao"],
      ["57014", "canceling statement due to statement timeout", "falha"],
      ["55P03", "canceling statement due to lock timeout", "falha"],
      ["XX000", undefined, "falha"],
    ];
    for (const [codigo, mensagem, esperado] of casos) {
      cenario.respostas.importacao_aplicar = erroDoBanco(codigo, mensagem);
      expect([codigo, mensagem, await destinoDe(aplicarImportacao(formulario({ ...campos, comparacao: "1" })))]).toEqual([codigo, mensagem, `${base}&erro=${esperado}`]);
    }
  });

  it("desfazer diz quando voltou tudo, quando voltou em parte e quando já estava desfeita", async () => {
    cenario.usuario = DONO;
    const desfazer = () => destinoDe(desfazerImportacao(formulario(campos)));
    cenario.respostas.importacao_desfazer = { data: { repetida: false, desfeitas: 4, parciais: 0, mantidas: 0 }, error: null };
    expect(await desfazer()).toBe(`${base}&ok=desfeita`);
    expect(cenario.chamadas).toEqual([{ nome: "importacao_desfazer", argumentos: { p_importacao: IMPORTACAO, p_motivo: "Carga inicial" } }]);
    cenario.respostas.importacao_desfazer = { data: { repetida: false, desfeitas: 3, parciais: 0, mantidas: 1 }, error: null };
    expect(await desfazer()).toBe(`${base}&ok=desfeita_parcial`);
    cenario.respostas.importacao_desfazer = { data: { repetida: false, desfeitas: 3, parciais: 1, mantidas: 0 }, error: null };
    expect(await desfazer()).toBe(`${base}&ok=desfeita_parcial`);
    // Nenhuma linha voltou: também não é "os valores de antes voltaram".
    cenario.respostas.importacao_desfazer = { data: { repetida: false, desfeitas: 0, parciais: 0, mantidas: 2 }, error: null };
    expect(await desfazer()).toBe(`${base}&ok=desfeita_parcial`);
    cenario.respostas.importacao_desfazer = { data: { repetida: true, desfeitas: 3, parciais: 1, mantidas: 0 }, error: null };
    expect(await desfazer()).toBe(`${base}&ok=ja_desfeita`);
    for (const data of [null, {}, { desfeitas: 4 }, "ok"]) {
      cenario.respostas.importacao_desfazer = { data, error: null };
      expect(await desfazer()).toBe(`${base}&erro=falha`);
    }
    cenario.respostas.importacao_desfazer = erroDoBanco("22023", "Só se desfaz importação aplicada");
    expect(await desfazer()).toBe(`${base}&erro=situacao`);
    cenario.respostas.importacao_desfazer = erroDoBanco("42501", "permission denied for function importacao_desfazer");
    expect(await desfazer()).toBe(`${base}&erro=permissao`);
    cenario.respostas.importacao_desfazer = erroDoBanco("40P01", "deadlock detected");
    expect(await desfazer()).toBe(`${base}&erro=instante`);
  });

  it("descartar: o banco responde se descartou agora ou se já estava; resposta vazia não vira sucesso", async () => {
    const descartar = () => destinoDe(descartarImportacao(formulario(campos)));
    cenario.respostas.importacao_descartar = { data: true, error: null };
    expect(await descartar()).toBe(`${base}&ok=descartada`);
    expect(cenario.chamadas).toEqual([{ nome: "importacao_descartar", argumentos: { p_importacao: IMPORTACAO, p_motivo: "Carga inicial" } }]);
    cenario.respostas.importacao_descartar = { data: false, error: null };
    expect(await descartar()).toBe(`${base}&ok=descartada`);
    cenario.respostas.importacao_descartar = { data: null, error: null };
    expect(await descartar()).toBe(`${base}&erro=falha`);
    cenario.respostas.importacao_descartar = erroDoBanco("22023", "Só se descarta prévia (a aplicada se desfaz)");
    expect(await descartar()).toBe(`${base}&erro=situacao`);
  });
});

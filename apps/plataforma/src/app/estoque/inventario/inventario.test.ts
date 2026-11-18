// Inventário (L4b) com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede.
// Confere quem vê o quê (contagem às cegas, decisão só por outra pessoa), o que as ações mandam ao banco
// e como os erros do banco voltam para a tela. As regras do banco estão provadas em
// packages/banco/src/inventario.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const GERENTE = "00000000-0000-4000-8000-0000000000ab";
const DONO = "00000000-0000-4000-8000-0000000000ad";
const INV = "00000000-0000-4000-9000-000000000080";
const APARELHO = "00000000-0000-4000-9000-000000000030";
const CAPA = "00000000-0000-4000-9000-000000000031";

const cenario = vi.hoisted(() => ({
  usuario: "",
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrado"); },
}));

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Record<string, unknown>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
  get molde() { return { permissoes: { has: (p: string) => Boolean(cenario.permissoes.has(p)) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
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

import Inventario from "./[id]/page";
import { abrirInventario, cancelarInventario, contarItem, decidirInventario, enviarInventario } from "./acoes";
import Inventarios from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const limpar = (v: unknown) => texto(v).replace(/\s+/g, " ");
const lista = async () => limpar(await Inventarios({ searchParams: Promise.resolve({}) }) as ReactElement);
const detalhe = async (busca: Record<string, string> = {}) =>
  limpar(await Inventario({ params: Promise.resolve({ id: INV }), searchParams: Promise.resolve(busca) }) as ReactElement);
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const inventario = (mudancas: Record<string, unknown> = {}) => ({
  id: INV, numero: 7, descricao: "Capas e aparelhos do balcão", situacao: "em_contagem", unidade_id: LOJA, criado_por: GERENTE, enviado_por: null,
  criado_em: "2026-11-11T13:00:00Z", enviado_em: null, decidido_em: null, motivo_envio: null, motivo_decisao: null, ...mudancas,
});

beforeEach(() => {
  cenario.usuario = GERENTE;
  cenario.permissoes = new Set();
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.tabelas = {
    inventarios: [inventario()],
    inventario_itens: [
      { inventario_id: INV, variante_id: CAPA, tipo: "acessorio", sistema_quantidade: 5, contado_quantidade: 3, contados: null, contado_em: "2026-11-11T13:10:00Z",
        ajuste_quantidade: null, nao_baixados: null, encontrados_fora: null, variantes: { sku: "ACE-0001", nome: "Capa transparente" } },
      { inventario_id: INV, variante_id: APARELHO, tipo: "aparelho", sistema_quantidade: null, contado_quantidade: null, contados: null, contado_em: null,
        ajuste_quantidade: null, nao_baixados: null, encontrados_fora: null, variantes: { sku: "APA-0001", nome: "Galaxy A15" } },
    ],
  };
});

describe("/estoque/inventario", () => {
  it("sem estoque.conferir nem estoque.ajustar: aviso e nada mais", async () => {
    cenario.permissoes = new Set(["estoque.consultar"]);
    expect(await lista()).toContain("Seu papel não faz inventário nesta loja");
  });

  it("quem confere abre inventário e vê a lista da loja com a situação", async () => {
    cenario.permissoes = new Set(["estoque.conferir"]);
    const t = await lista();
    for (const trecho of ["Novo inventário", "Abrir inventário", "nº 7 · Capas e aparelhos do balcão", "em contagem"]) expect(t).toContain(trecho);
  });

  it("quem só aprova (dono) vê a lista, mas não abre inventário", async () => {
    cenario.permissoes = new Set(["estoque.ajustar"]);
    const t = await lista();
    expect(t).toContain("nº 7");
    expect(t).not.toContain("Abrir inventário");
  });
});

describe("/estoque/inventario/[id]", () => {
  it("em contagem é às cegas: não mostra o que o sistema tem; envio bloqueado enquanto falta contar", async () => {
    cenario.permissoes = new Set(["estoque.conferir", "estoque.solicitar_ajuste"]);
    const t = await detalhe();
    for (const trecho of ["Inventário nº 7", "Contagem (1 de 2 itens contados)", "falta contar", "Quantidade contada", "IMEI de cada unidade encontrada", "Faltam 1 item(ns) para contar"]) {
      expect(t).toContain(trecho);
    }
    expect(t).not.toContain("Sistema:");
    expect(t).not.toContain("Decidir");
  });

  it("enviado: mostra sistema, contado e diferença; quem enviou não decide", async () => {
    cenario.tabelas.inventarios = [inventario({ situacao: "enviado", enviado_por: GERENTE, motivo_envio: "Contagem de segunda" })];
    cenario.permissoes = new Set(["estoque.conferir", "estoque.solicitar_ajuste", "estoque.ajustar"]);
    const t = await detalhe();
    for (const trecho of ["aguardando aprovação", "Sistema: 5 · Contado: 3", "diferença -2", "Enviado com o motivo: Contagem de segunda", "outra pessoa com permissão de ajuste decide"]) {
      expect(t).toContain(trecho);
    }
    expect(t).not.toContain("Registrar decisão");
    expect(t).not.toContain("Gravar contagem");
  });

  it("enviado: outra pessoa com estoque.ajustar decide", async () => {
    cenario.usuario = DONO;
    cenario.tabelas.inventarios = [inventario({ situacao: "enviado", enviado_por: GERENTE })];
    cenario.permissoes = new Set(["estoque.ajustar"]);
    const t = await detalhe();
    for (const trecho of ["Decidir", "Aprovar e ajustar o estoque", "Recusar (recontar)", "Registrar decisão"]) expect(t).toContain(trecho);
    expect(t).not.toContain("Cancelar inventário");
  });

  it("aprovado: mostra o ajuste aplicado, o que não foi baixado e o lido fora da loja", async () => {
    cenario.usuario = DONO;
    cenario.tabelas.inventarios = [inventario({ situacao: "aprovado", enviado_por: GERENTE, motivo_envio: "Contagem", motivo_decisao: "Conferido" })];
    cenario.tabelas.inventario_itens = [
      { inventario_id: INV, variante_id: APARELHO, tipo: "aparelho", sistema_quantidade: 3, contado_quantidade: 2, contados: ["1", "2"], contado_em: "2026-11-11T13:10:00Z",
        ajuste_quantidade: -1, nao_baixados: ["x"], encontrados_fora: ["2"], variantes: { sku: "APA-0001", nome: "Galaxy A15" } },
    ];
    cenario.permissoes = new Set(["estoque.ajustar"]);
    const t = await detalhe({ ok: "aprovado" });
    for (const trecho of ["os ajustes entraram no livro do estoque", "ajuste aplicado -1", "1 não baixado(s)", "1 lido(s) fora do estoque desta variação nesta loja", "Decisão: Conferido"]) {
      expect(t).toContain(trecho);
    }
  });

  // Correção de 14/11/2026 (#78): quem contou (mesmo numa contagem refeita depois por outra pessoa) não decide.
  it("#78: quem contou não vê a decisão, nem pelo item nem pela trilha das contagens", async () => {
    cenario.usuario = DONO;
    cenario.tabelas.inventarios = [inventario({ situacao: "enviado", enviado_por: GERENTE })];
    cenario.permissoes = new Set(["estoque.ajustar"]);
    cenario.tabelas.inventario_itens = [{ ...cenario.tabelas.inventario_itens![0], contado_por: DONO }];
    let t = await detalhe();
    expect(t).toContain("Você abriu, contou ou enviou este inventário: outra pessoa com permissão de ajuste decide.");
    expect(t).not.toContain("Registrar decisão");
    // O gerente recontou depois (o item diz gerente), mas a trilha guarda a contagem do dono.
    cenario.tabelas.inventario_itens = [{ ...cenario.tabelas.inventario_itens[0], contado_por: GERENTE }];
    cenario.tabelas.inventario_contagens = [
      { inventario_id: INV, numero: 1, variante_id: CAPA, contado_por: DONO, desconhecidos: null, fora_da_loja: null, outra_variacao: null },
      { inventario_id: INV, numero: 2, variante_id: CAPA, contado_por: GERENTE, desconhecidos: null, fora_da_loja: null, outra_variacao: null },
    ];
    t = await detalhe();
    expect(t).toContain("Você abriu, contou ou enviou este inventário");
    expect(t).toContain("contado 2 vezes (vale a última)");
    expect(t).not.toContain("Registrar decisão");
    expect(await destinoDe(decidirInventario(formulario({ inventario: INV, aprovar: "sim", motivo: "Conferido" })))).toBe(`/estoque/inventario/${INV}?ok=aprovado`);
  });

  // Correção de 14/11/2026 (#79): os códigos lidos que não são unidades desta variação nesta loja viram alerta.
  it("#79: alertas da última leitura do aparelho, mesmo durante a contagem às cegas", async () => {
    cenario.permissoes = new Set(["estoque.conferir"]);
    const lidos = ["352099001999711", "352099001999712", "352099001999713", "352099001999714", "352099001999715", "352099001999716"];
    cenario.tabelas.inventario_contagens = [
      { inventario_id: INV, numero: 1, variante_id: APARELHO, contado_por: GERENTE, desconhecidos: ["111"], fora_da_loja: null, outra_variacao: null },
      { inventario_id: INV, numero: 2, variante_id: APARELHO, contado_por: GERENTE, desconhecidos: lidos, fora_da_loja: ["352099001700010"], outra_variacao: ["8955100000000000771"] },
    ];
    const t = await detalhe();
    for (const trecho of [
      "6 lido(s) sem cadastro na rede (confira se foi digitado certo):", "352099001999711, 352099001999712, 352099001999713, 352099001999714, 352099001999715 e mais 1",
      "1 lido(s) cadastrado(s) em outra loja ou fora do estoque (vendido, em trânsito ou baixado):", "352099001700010",
      "1 lido(s) desta loja, mas de outra variação:", "8955100000000000771",
      "Esses não contam como unidade desta variação nem mudam o saldo",
    ]) expect(t).toContain(trecho);
    expect(t).not.toContain("111");
    expect(t).not.toContain("Sistema:");
  });

  it("identificador inválido ou inventário fora do alcance: 404", async () => {
    await expect(Inventario({ params: Promise.resolve({ id: "abc" }), searchParams: Promise.resolve({}) })).rejects.toThrow("não encontrado");
    cenario.tabelas.inventarios = [];
    await expect(detalhe()).rejects.toThrow("não encontrado");
  });
});

describe("ações do inventário", () => {
  it("abrir: manda a loja do turno, os itens e a chave; volta para o inventário aberto", async () => {
    cenario.respostas.inventario_abrir = { data: { id: INV, numero: 7, repetida: false }, error: null };
    const destino = await destinoDe(abrirInventario(formulario({ descricao: "  Capas   do balcão ", chave: "form:abc12345", variante: [CAPA, APARELHO, "não-é-uuid"] })));
    expect(destino).toBe(`/estoque/inventario/${INV}?ok=aberto`);
    expect(cenario.chamadas[0]).toEqual({ nome: "inventario_abrir", argumentos: { p_unidade: LOJA, p_variantes: [CAPA, APARELHO], p_descricao: "Capas do balcão", p_chave: "form:abc12345" } });
  });

  it("abrir sem itens ou sem descrição não chama o banco", async () => {
    expect(await destinoDe(abrirInventario(formulario({ descricao: "Capas", chave: "form:abc12345" })))).toBe("/estoque/inventario?erro=itens");
    expect(await destinoDe(abrirInventario(formulario({ descricao: "C", chave: "form:abc12345", variante: CAPA })))).toBe("/estoque/inventario?erro=descricao");
    expect(cenario.chamadas).toEqual([]);
  });

  it("contar: acessório por quantidade; aparelho pela lista de IMEI (só dígitos); vazio = nenhum encontrado", async () => {
    expect(await destinoDe(contarItem(formulario({ inventario: INV, variante: CAPA, quantidade: "7" })))).toBe(`/estoque/inventario/${INV}?ok=contado`);
    expect(cenario.chamadas[0]?.argumentos).toEqual({ p_inventario: INV, p_variante: CAPA, p_quantidade: 7, p_identificadores: null });
    await destinoDe(contarItem(formulario({ inventario: INV, variante: APARELHO, identificadores: "35209-9001800091\n352099001800109; " })));
    expect(cenario.chamadas[1]?.argumentos).toEqual({ p_inventario: INV, p_variante: APARELHO, p_quantidade: null, p_identificadores: ["352099001800091", "352099001800109"] });
    await destinoDe(contarItem(formulario({ inventario: INV, variante: APARELHO, identificadores: "" })));
    expect(cenario.chamadas[2]?.argumentos).toMatchObject({ p_identificadores: [] });
  });

  it("contar com quantidade inválida volta com erro sem chamar o banco", async () => {
    expect(await destinoDe(contarItem(formulario({ inventario: INV, variante: CAPA, quantidade: "dois" })))).toBe(`/estoque/inventario/${INV}?erro=quantidade`);
    expect(await destinoDe(contarItem(formulario({ inventario: INV, variante: CAPA, quantidade: "" })))).toBe(`/estoque/inventario/${INV}?erro=quantidade`);
    expect(cenario.chamadas).toEqual([]);
  });

  it("enviar e cancelar exigem motivo; erros do banco voltam pelo catálogo", async () => {
    expect(await destinoDe(enviarInventario(formulario({ inventario: INV, motivo: "a" })))).toBe(`/estoque/inventario/${INV}?erro=motivo`);
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.inventario_enviar = { data: null, error: { code: "22023", message: "Conte todos os itens antes de enviar" } };
    expect(await destinoDe(enviarInventario(formulario({ inventario: INV, motivo: "Contagem de segunda" })))).toBe(`/estoque/inventario/${INV}?erro=nao_contado`);
    expect(await destinoDe(cancelarInventario(formulario({ inventario: INV, motivo: "Começar de novo" })))).toBe(`/estoque/inventario/${INV}?ok=cancelado`);
    expect(cenario.chamadas.map((c) => c.nome)).toEqual(["inventario_enviar", "inventario_cancelar"]);
  });

  it("decidir: aprovar manda true; a mesma pessoa recebe OR025; estoque mudado recebe OR001", async () => {
    expect(await destinoDe(decidirInventario(formulario({ inventario: INV, aprovar: "sim", motivo: "Conferido" })))).toBe(`/estoque/inventario/${INV}?ok=aprovado`);
    expect(cenario.chamadas[0]?.argumentos).toEqual({ p_inventario: INV, p_aprovar: true, p_motivo: "Conferido" });
    expect(await destinoDe(decidirInventario(formulario({ inventario: INV, aprovar: "nao", motivo: "Recontar" })))).toBe(`/estoque/inventario/${INV}?ok=recusado`);
    cenario.respostas.inventario_decidir = { data: null, error: { code: "OR025", message: "Quem abriu, contou ou enviou o inventário não decide: outra pessoa decide" } };
    expect(await destinoDe(decidirInventario(formulario({ inventario: INV, aprovar: "sim", motivo: "Conferido" })))).toBe(`/estoque/inventario/${INV}?erro=mesma_pessoa`);
    cenario.respostas.inventario_decidir = { data: null, error: { code: "OR001", message: "O estoque deste item mudou" } };
    expect(await destinoDe(decidirInventario(formulario({ inventario: INV, aprovar: "sim", motivo: "Conferido" })))).toBe(`/estoque/inventario/${INV}?erro=mudou`);
    expect(await destinoDe(decidirInventario(formulario({ inventario: INV, aprovar: "talvez", motivo: "Conferido" })))).toBe("/estoque/inventario?erro=dados");
  });
});

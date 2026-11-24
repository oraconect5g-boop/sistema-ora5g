// A tela das transferências (ADR-007; TRF-b, 18/11: o achado F10 da auditoria do Codex de 17/11) com a sessão e o Supabase
// SIMULADOS: nenhuma credencial, lojas e números fictícios. As regras do banco estão em packages/banco/src/transferencias.test.ts
// e transferencia-remessa.test.ts; aqui, o que a tela diz de cada passo e o saldo de cada lado.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGEM = "00000000-0000-4000-8000-0000000000a1";
const DESTINO = "00000000-0000-4000-8000-0000000000a2";
const CAPA = "00000000-0000-4000-8000-0000000000c1";
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  // VEL-g: com a função public.transferencias_tela (a leitura única) ou sem ela (as leituras de antes).
  comFuncao: false,
  leiturasSeparadas: 0,
  // TRF-d: as chamadas das ações ao banco (o nome e os argumentos) e a resposta da função que resolve a divergência.
  chamadas: [] as [string, Record<string, unknown>][],
  erroDaResolucao: null as null | { code: string },
  // TRF-f: os argumentos que a tela mandou à função e as contas que a função simulada devolve (vazio: o banco de antes).
  argumentosDaTela: {} as Record<string, unknown>,
  contas: {} as Record<string, number>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(linhas: Record<string, unknown>[]) { this.linhas = [...linhas]; }
  select() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  eq() { return this; }
  in(campo: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => !(campo in l) || valores.includes(l[campo])); return this; }
  // TRF-f: as em andamento e o histórico em leituras separadas, pelo filtro "in" e pelo "not in" da situação.
  filter(campo: string, operador: string, valor: string) {
    if (operador === "in") { const lista = valor.replace(/^\(|\)$/g, "").split(","); this.linhas = this.linhas.filter((l) => lista.includes(String(l[campo]))); }
    return this;
  }
  not(campo: string, operador: string, valor: string) {
    if (operador === "in") { const lista = valor.replace(/^\(|\)$/g, "").split(","); this.linhas = this.linhas.filter((l) => !lista.includes(String(l[campo]))); }
    return this;
  }
  then(resolver: (r: Resposta) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: ORIGEM, unidade_nome: "Santa Cândida", turno_termina_em: "2026-11-18T23:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Gerente (fictício)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: (nome: string) => { cenario.leiturasSeparadas += 1; return new Consulta(cenario.tabelas[nome] ?? []); },
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.permissoes.has(argumentos.p_permissao as string), error: null };
      if (nome === "transferencia_resolver_divergencia") { cenario.chamadas.push([nome, argumentos]); return { data: null, error: cenario.erroDaResolucao }; }
      if (nome !== "transferencias_tela") return { data: null, error: null };
      if (!cenario.comFuncao) return { data: null, error: { code: "PGRST202" } };
      // A função do banco simulada: o que as tabelas do cenário têm (o RLS simulado é o próprio cenário).
      const t = cenario.tabelas;
      cenario.argumentosDaTela = argumentos;
      return { data: {
        ...cenario.contas,
        transferencias: t.transferencias ?? [],
        variantes: (t.variantes ?? []).map((v) => ({ id: v.id, nome: v.nome, sku: v.sku, tipo: (v.produtos as { tipo?: string } | null)?.tipo ?? null })),
        unidades: t.unidades ?? [], itens: t.transferencia_itens ?? [], remessas: t.transferencia_remessas ?? [], saldos: t.estoque_saldos ?? [], disponiveis: [],
        // O banco com a migration do TRF-d traz as resoluções; o cenário sem a tabela simula o banco de antes.
        ...(t.transferencia_resolucoes ? { resolucoes: t.transferencia_resolucoes } : {}),
      }, error: null };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { resolverDivergencia } from "./acoes";
import Transferencias from "./page";

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
/** Os endereços dos links da árvore (TRF-f: a navegação entre as páginas). */
function enderecos(v: unknown, achados: string[] = [], vistos = new Set<unknown>()): string[] {
  if (!v || typeof v !== "object" || vistos.has(v)) return achados;
  vistos.add(v);
  if (Array.isArray(v)) { for (const x of v) enderecos(x, achados, vistos); return achados; }
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.props.href === "string") achados.push(v.props.href);
    for (const x of Object.values(v.props)) enderecos(x, achados, vistos);
  }
  return achados;
}
const transferencia = (numero: number, situacao: string) => ({
  id: `00000000-0000-4000-9000-${String(numero).padStart(12, "0")}`, numero, origem_id: ORIGEM, destino_id: DESTINO, variante_id: CAPA, quantidade: 2,
  motivo: "Reposição", situacao, solicitado_por: "outra", quantidade_recebida: null, observacao: null, solicitado_em: "2026-11-18T03:00:00Z", remessa_id: null,
});

beforeEach(() => {
  cenario.leiturasSeparadas = 0;
  cenario.argumentosDaTela = {};
  cenario.contas = {};
  cenario.chamadas = [];
  cenario.erroDaResolucao = null;
  cenario.permissoes = new Set(["estoque.transferir"]);
  cenario.tabelas = {
    transferencias: [transferencia(3, "enviada"), transferencia(2, "separada"), transferencia(1, "solicitada")],
    variantes: [{ id: CAPA, nome: "Capa de silicone", sku: "ACE-1", produtos: { tipo: "acessorio" } }],
    unidades: [{ id: ORIGEM, nome: "Santa Cândida", tipo: "loja_fisica" }, { id: DESTINO, nome: "Muffato Santa", tipo: "loja_fisica" }],
    transferencia_itens: [], transferencia_remessas: [],
    estoque_saldos: [{ unidade_id: ORIGEM, variante_id: CAPA, quantidade: 8, reservado: 2 }],
  };
});

describe.each([
  { comFuncao: true, caminho: "com a leitura única (VEL-g)" },
  { comFuncao: false, caminho: "sem a função (as leituras de antes)" },
])("a tela das transferências (TRF-b), $caminho", ({ comFuncao }) => {
  beforeEach(() => { cenario.comFuncao = comFuncao; });

  it("cada transferência diz o que o passo fez no estoque e o saldo de agora de cada lado que a pessoa vê", async () => {
    const tela = limpar(await Transferencias({ searchParams: Promise.resolve({}) }));
    for (const trecho of [
      "Pedida: reservada na origem desde o pedido. Saiu do disponível; o físico continua lá até o envio.",
      "Separada: os itens foram escolhidos e seguem reservados na origem; o físico continua lá até o envio.",
      "Em trânsito: saiu do físico da origem. Entra no destino quando a loja receber e conferir.",
      "Agora na origem (Santa Cândida): físico 8 · reservado 2 · disponível 6",
    ]) {
      expect(tela, trecho).toContain(trecho);
    }
    // O destino de outra loja não aparece pela RLS: a tela não inventa o saldo de lá.
    expect(tela).not.toContain("no destino (Muffato Santa)");
    cenario.tabelas.estoque_saldos = [...(cenario.tabelas.estoque_saldos ?? []), { unidade_id: DESTINO, variante_id: CAPA, quantidade: 1, reservado: 0 }];
    expect(limpar(await Transferencias({ searchParams: Promise.resolve({}) }))).toContain("no destino (Muffato Santa): físico 1 · reservado 0 · disponível 1");
    // Com a função, a tela não lê nenhuma tabela em separado: uma ida só, depois da sessão.
    if (comFuncao) expect(cenario.leiturasSeparadas).toBe(0);
    else expect(cenario.leiturasSeparadas).toBeGreaterThan(0);
  });
});

// TRF-d (ORA-INV-007; o achado F21-04 da auditoria do Codex de 21/11/2026): o que faltou no recebimento tem destino.
describe("a divergência do recebimento (TRF-d)", () => {
  const T = "00000000-0000-4000-9000-000000000009";
  const APARELHO = "00000000-0000-4000-8000-0000000000c2";
  const comFalta = (extra: Record<string, unknown> = {}) => ({ ...transferencia(9, "recebida_com_divergencia"), quantidade: 5, quantidade_recebida: 2,
    observacao: "A caixa chegou com três capas a menos", divergencia_resolvida_em: null, ...extra });
  const resolucao = (decisao: string, quantidade: number, motivo: string, i = 0) => ({
    transferencia_id: T, decisao, quantidade, item_serializado_id: null, motivo, criado_em: `2026-11-23T13:0${i}:00+00:00` });
  beforeEach(() => {
    cenario.comFuncao = true;
    cenario.tabelas.transferencias = [comFalta()];
    cenario.tabelas.transferencia_resolucoes = [];
  });
  const abrir = async () => limpar(await Transferencias({ searchParams: Promise.resolve({}) }));
  const formulario = (campos: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; };
  const destinoDe = (acao: Promise<unknown>) => acao.then(() => "não redirecionou", (e: Error) => e.message.replace("redirecionou para ", ""));

  it("a origem vê quanto faltou e pode dizer que voltou; a baixa só aparece para quem ajusta estoque; o destino diz que chegou depois", async () => {
    let tela = await abrir();
    for (const trecho of ["A caixa chegou com três capas a menos", "Faltaram 3: 3 ainda sem destino.", "Voltou para esta loja", "Dar a entrada de volta",
      "Quantas estão aqui (até 3)", "Quem resolve: a loja de destino, se chegou depois; a de origem, se voltou para ela"]) expect(tela, trecho).toContain(trecho);
    expect(tela).not.toContain("Chegou depois nesta loja");
    expect(tela).not.toContain("Dar baixa no que não apareceu");

    cenario.permissoes = new Set(["estoque.transferir", "estoque.ajustar"]);
    tela = await abrir();
    for (const trecho of ["Dar baixa no que não apareceu", "A baixa vale para tudo o que ainda falta (3).", "Confirmar a baixa"]) expect(tela, trecho).toContain(trecho);

    // A loja do turno como destino: confirma o que chegou depois, e não o que voltou nem a baixa.
    cenario.tabelas.transferencias = [comFalta({ origem_id: DESTINO, destino_id: ORIGEM })];
    tela = await abrir();
    for (const trecho of ["Chegou depois nesta loja", "Quantas chegaram (até 3)", "Dar a entrada do que chegou"]) expect(tela, trecho).toContain(trecho);
    expect(tela).not.toContain("Voltou para esta loja");
    expect(tela).not.toContain("Dar baixa no que não apareceu");

    // Quem só consulta não resolve: lê o que faltou e quem resolve.
    cenario.permissoes = new Set();
    tela = await abrir();
    expect(tela).toContain("Faltaram 3: 3 ainda sem destino.");
    expect(tela).not.toContain("Chegou depois nesta loja");
  });

  it("cada resolução aparece com a quantidade, o destino e o motivo; com tudo resolvido, não há mais o que fazer", async () => {
    cenario.permissoes = new Set(["estoque.transferir", "estoque.ajustar"]);
    cenario.tabelas.transferencia_resolucoes = [resolucao("chegou_depois", 1, "Estava no fundo da caixa", 1), resolucao("voltou_a_origem", 1, "Ficou na prateleira da origem", 2)];
    let tela = await abrir();
    for (const trecho of ["Faltaram 3: 1 chegou depois, 1 voltou para a origem e 1 ainda sem destino.", "1 · Chegou depois no destino: Estava no fundo da caixa",
      "1 · Voltou para a origem: Ficou na prateleira da origem", "Quantas estão aqui (até 1)"]) expect(tela, trecho).toContain(trecho);

    cenario.tabelas.transferencia_resolucoes = [...(cenario.tabelas.transferencia_resolucoes ?? []), resolucao("baixada", 1, "Não apareceu em nenhuma das lojas", 3)];
    cenario.tabelas.transferencias = [comFalta({ divergencia_resolvida_em: "2026-11-23T13:03:00+00:00" })];
    tela = await abrir();
    expect(tela).toContain("Faltaram 3: 1 chegou depois, 1 voltou para a origem e 1 com baixa.");
    expect(tela).toContain("1 · Baixa (não apareceu): Não apareceu em nenhuma das lojas");
    for (const trecho of ["Voltou para esta loja", "Dar baixa no que não apareceu", "Quem resolve:"]) expect(tela, trecho).not.toContain(trecho);
  });

  it("no aparelho, o destino é dado pelo IMEI lido; o banco de antes do TRF-d mostra o que faltou sem as resoluções", async () => {
    cenario.tabelas.variantes = [...(cenario.tabelas.variantes ?? []), { id: APARELHO, nome: "Galaxy A15", sku: "APA-1", produtos: { tipo: "aparelho" } }];
    cenario.tabelas.transferencias = [comFalta({ variante_id: APARELHO, quantidade: 1, quantidade_recebida: 0, observacao: "A caixa chegou sem o aparelho" })];
    cenario.tabelas.transferencia_itens = [{ transferencia_id: T, item_serializado_id: "i1", recebido: false }];
    let tela = await abrir();
    for (const trecho of ["Faltou 1: 1 ainda sem destino.", "IMEI/ICCID lidos nos itens que estão aqui (um por linha)", "algum não chegou"]) expect(tela, trecho).toContain(trecho);
    expect(tela).not.toContain("Quantas estão aqui");
    // O banco sem a migration: a função não traz as resoluções nem o campo; a tela mostra o que faltou e segue.
    delete cenario.tabelas.transferencia_resolucoes;
    cenario.tabelas.transferencias = [{ ...transferencia(9, "recebida_com_divergencia"), quantidade: 5, quantidade_recebida: 2, observacao: "A caixa chegou com três capas a menos" }];
    tela = await abrir();
    expect(tela).toContain("Faltaram 3: 3 ainda sem destino.");
  });

  it("a ação manda ao banco a decisão, o que foi contado ou lido, o motivo e a chave; os dados errados nem chegam lá", async () => {
    const CHAVE = "11111111-1111-4111-8111-111111111111";
    const base = { transferencia: T, serializado: "nao", chave: CHAVE, motivo: "Ficou na prateleira da origem" };
    expect(await destinoDe(resolverDivergencia(formulario({ ...base, decisao: "voltou_a_origem", quantidade: "2" })))).toBe("/transferencias?ok=divergencia");
    expect(cenario.chamadas).toEqual([["transferencia_resolver_divergencia", {
      p_transferencia: T, p_decisao: "voltou_a_origem", p_identificadores: [], p_quantidade: 2, p_motivo: "Ficou na prateleira da origem", p_chave: CHAVE }]]);

    // Aparelho: os números lidos, sem a quantidade. A baixa: nem números nem quantidade (vale para tudo o que falta).
    cenario.chamadas = [];
    await destinoDe(resolverDivergencia(formulario({ ...base, serializado: "sim", decisao: "chegou_depois", identificadores: "35-209900-176148-7" })));
    await destinoDe(resolverDivergencia(formulario({ ...base, serializado: "sim", decisao: "baixada", identificadores: "352099001761487", quantidade: "9" })));
    expect(cenario.chamadas.map(([, a]) => [a.p_decisao, a.p_identificadores, a.p_quantidade])).toEqual([
      ["chegou_depois", ["352099001761487"], null], ["baixada", [], null]]);

    // Nada chega ao banco: decisão desconhecida, transferência que não é um identificador, sem quantidade, sem IMEI, motivo curto.
    cenario.chamadas = [];
    for (const [campos, esperado] of [
      [{ ...base, decisao: "sumiu", quantidade: "1" }, "dados"], [{ ...base, transferencia: "9", decisao: "voltou_a_origem", quantidade: "1" }, "dados"],
      [{ ...base, decisao: "voltou_a_origem", quantidade: "0" }, "dados"], [{ ...base, decisao: "voltou_a_origem" }, "dados"],
      [{ ...base, serializado: "sim", decisao: "chegou_depois", identificadores: "" }, "dados"],
      [{ ...base, serializado: "sim", decisao: "chegou_depois", identificadores: "1234" }, "dados"],
      [{ ...base, decisao: "voltou_a_origem", quantidade: "1", motivo: "curto" }, "explicacao"],
    ] as const) {
      expect(await destinoDe(resolverDivergencia(formulario(campos))), JSON.stringify(campos)).toBe(`/transferencias?erro=${esperado}`);
    }
    expect(cenario.chamadas).toEqual([]);

    // A recusa do banco vira a mensagem do catálogo: outro lado ou sem permissão; a chave repetida com outros dados.
    for (const [code, esperado] of [["42501", "sem_permissao"], ["OR004", "repetida"], ["22023", "dados"], ["P0002", "nao_encontrada"]] as const) {
      cenario.erroDaResolucao = { code };
      expect(await destinoDe(resolverDivergencia(formulario({ ...base, decisao: "voltou_a_origem", quantidade: "1" })))).toBe(`/transferencias?erro=${esperado}`);
    }
    const tela = limpar(await Transferencias({ searchParams: Promise.resolve({ ok: "divergencia" }) }));
    expect(tela).toContain("Registrado: o que faltou teve destino, e o estoque foi acertado pelo livro.");
    expect(limpar(await Transferencias({ searchParams: Promise.resolve({ erro: "explicacao" }) }))).toContain("Explique o que houve com o que faltou, com pelo menos 10 letras");
  });
});

// TRF-f (o achado F24-01 da revisão do Codex de 24/11, P1): as em andamento sempre aparecem, cada parte tem as suas páginas,
// e a busca pelo número acha a que não está na página. F24-04: os passos são etapas diferentes.
describe("as em andamento, o histórico e a busca pelo número (TRF-f)", () => {
  beforeEach(() => { cenario.comFuncao = true; });

  it("as duas partes, com a contagem; a página de cada uma vai ao banco e a navegação guarda a da outra parte", async () => {
    cenario.tabelas.transferencias = [{ ...transferencia(4, "cancelada"), aberta: false }, { ...transferencia(1, "solicitada"), aberta: true }];
    cenario.contas = { abertas: 51, historico: 120, pagina_abertas: 2, paginas_abertas: 2, pagina: 3, paginas: 3 };
    const arvore = await Transferencias({ searchParams: Promise.resolve({ abertas: "2", historico: "3" }) });
    const tela = limpar(arvore);
    expect(cenario.argumentosDaTela).toMatchObject({ p_pagina_abertas: 2, p_pagina: 3 });
    for (const trecho of ["Em andamento (51)", "Histórico (120)", "Página 2 de 2", "Página 3 de 3"]) expect(tela, trecho).toContain(trecho);
    const links = enderecos(arvore);
    // Voltar uma página nas em andamento mantém o histórico na página 3, e o contrário.
    expect(links).toContain("/transferencias?historico=3");
    expect(links).toContain("/transferencias?abertas=2&historico=2");
    expect(tela).toContain("Os passos: pedir (reserva na origem: sai do disponível de lá) → separar → enviar (sai do físico da origem e fica em trânsito) → receber (entra no destino, uma vez só).");
  });

  it("a busca pelo número mostra só aquela transferência, ou diz que não há; o número fora da forma é ignorado", async () => {
    cenario.tabelas.transferencias = [{ ...transferencia(2, "separada"), aberta: true }];
    const achada = limpar(await Transferencias({ searchParams: Promise.resolve({ numero: "2" }) }));
    expect(cenario.argumentosDaTela).toMatchObject({ p_numero: 2 });
    expect(achada).toContain("Transferência Nº 2");
    expect(achada).toContain("Ver todas");
    expect(achada).not.toContain("Em andamento (");
    cenario.tabelas.transferencias = [];
    expect(limpar(await Transferencias({ searchParams: Promise.resolve({ numero: "99" }) }))).toContain("Nenhuma transferência Nº 99 saindo ou chegando nesta loja.");
    await Transferencias({ searchParams: Promise.resolve({ numero: "12a" }) });
    expect(cenario.argumentosDaTela.p_numero).toBeUndefined();
  });
});

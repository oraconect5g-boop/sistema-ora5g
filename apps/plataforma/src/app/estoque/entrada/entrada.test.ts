// Entrada de mercadoria (L4a e R1) com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede.
// Confere a permissão, o histórico e a entrada aberta lidos pelas funções do banco (nunca pelas tabelas),
// o custo protegido, a paginação, a volta à entrada depois de uma recusa, o que as ações mandam ao banco
// e a busca de itens. As regras do banco estão provadas em packages/banco/src/entrada-estoque.test.ts.
import { completarComDigitoVerificador } from "@ora5g/dominio";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERROS_DA_ENTRADA } from "../../../lib/estoque/entrada";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const ORG = "00000000-0000-4000-8000-0000000000ff";
const GERENTE = "00000000-0000-4000-8000-0000000000ab";
const FORN = "00000000-0000-4000-9000-000000000060";
const ENTRADA = "00000000-0000-4000-9000-000000000070";
const APARELHO = "00000000-0000-4000-9000-000000000030";
const CAPA = "00000000-0000-4000-9000-000000000031";
const INATIVO = "00000000-0000-4000-9000-000000000039";
// IMEIs FICTÍCIOS com dígito verificador válido.
const IMEI = completarComDigitoVerificador("35209900180009");
const IMEI_2 = completarComDigitoVerificador("35209900180010");

type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  /** Tabelas lidas direto (sem função do banco) e os filtros de igualdade pedidos, na ordem. */
  lidas: [] as string[],
  filtros: [] as [tabela: string, coluna: string, valor: unknown][],
  /** INV-009a: erro da leitura direta de uma tabela (ex.: a coluna pedido_id que o banco ainda não tem). */
  errosDasTabelas: {} as Record<string, { code: string }>,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

/** Coluna da própria linha ou de um recurso embutido ("produtos.ativo"), como no filtro do PostgREST. */
const valorDe = (linha: Record<string, unknown>, coluna: string) =>
  coluna.split(".").reduce<unknown>((v, parte) => (v !== null && typeof v === "object" ? (v as Record<string, unknown>)[parte] : undefined), linha);

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(readonly nome: string) { cenario.lidas.push(nome); this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) {
    cenario.filtros.push([this.nome, coluna, valor]);
    this.linhas = this.linhas.filter((l) => { const v = valorDe(l, coluna); return v === undefined || v === valor; });
    return this;
  }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
  // FIN-004a: as contas das entradas vêm em páginas (lib/leitura-completa).
  range(de: number, ate: number) { this.linhas = this.linhas.slice(de, ate + 1); return this; }
  ilike() { return this; }
  is() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() {
    const erro = cenario.errosDasTabelas[this.nome];
    return Promise.resolve(erro ? { data: null, error: erro } : { data: this.linhas[0] ?? null, error: null });
  }
  then(resolver: (r: { data: Record<string, unknown>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
  get molde() { return { permissoes: { has: (p: string) => Boolean(cenario.permissoes.has(p)) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  usuario: { id: GERENTE },
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

import { buscarItensParaEntrada, estornarEntrada, ligarPedido, registrarEntrada, salvarFornecedor } from "./acoes";
import EntradaDeMercadoria from "./page";

// O texto da tela: tudo o que a página montou, na ordem (inclusive endereços e classes). Componentes não
// são executados; por isso a página monta as partes dela com funções comuns.
function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string | string[]> = {}) =>
  texto(await EntradaDeMercadoria({ searchParams: Promise.resolve(parametros) }) as ReactElement).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
/** Os parâmetros do endereço para onde a ação mandou, como o Next os entrega à página. */
const parametrosDe = (destino: string) => Object.fromEntries(new URL(destino, "https://teste.invalid").searchParams);
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

// Respostas das funções do banco no formato da migration 20261112033713 (estoque_entradas, estoque_entrada).
const linha = (extra: Record<string, unknown> = {}) => ({
  linha: 1, sku: "APA-0001", nome: "Galaxy A15", quantidade: 1, condicao: "seminovo", custo_unitario: 105000, reentradas: 0, saldo_livre: null, identificadores: null, ...extra,
});
const capa = (extra: Record<string, unknown> = {}) => linha({ linha: 2, sku: "ACE-0001", nome: "Capa", quantidade: 20, condicao: "novo", custo_unitario: 1700, ...extra });
const entrada = (extra: Record<string, unknown> = {}) => ({
  id: ENTRADA, numero: 12, tipo: "compra", documento: "NF 1234", situacao: "registrada", total_unidades: 21, total_custo: "139000",
  criado_em: "2026-11-11T13:00:00+00:00", criado_por: "Gerente Teste", estornado_em: null, estornado_por: null, motivo_estorno: null, fornecedor: "Distribuidora Teste",
  itens: [linha(), capa()], ...extra,
});
const historico = (entradas: unknown[], extra: Record<string, unknown> = {}): Resposta =>
  ({ data: { ve_custo: true, total: entradas.length, entradas, proxima: null, ...extra }, error: null });
/** Entradas com número decrescente a partir de "maior" (a numeração é da rede: a de uma loja pula). */
const varias = (quantas: number, maior: number) => Array.from({ length: quantas }, (_, i) =>
  entrada({ id: `00000000-0000-4000-9000-0000000${10_000 + maior - i}`, numero: maior - i }));
/** A entrada aberta: o aparelho vendido (não livre), o que voltou por reentrada e a capa com saldo livre menor. */
const aberta = (extra: Record<string, unknown> = {}): Resposta => ({
  data: entrada({
    ve_custo: true, total_unidades: 22, total_custo: 244000,
    itens: [
      linha({ quantidade: 2, reentradas: 1, identificadores: [
        { identificador: IMEI, situacao: "vendido", livre: false, reentrada: false },
        { identificador: IMEI_2, situacao: "disponivel", livre: true, reentrada: true },
      ] }),
      capa({ saldo_livre: 15, identificadores: [] }),
    ],
    ...extra,
  }),
  error: null,
});
const recusa = (code: string, message: string): Resposta => ({ data: null, error: { code, message } });

beforeEach(() => {
  cenario.permissoes = new Set(["estoque.receber"]);
  cenario.chamadas = [];
  cenario.lidas = [];
  cenario.filtros = [];
  cenario.respostas = { estoque_entradas: historico([entrada()]) };
  cenario.errosDasTabelas = {};
  cenario.tabelas = {
    unidades: [{ id: LOJA, organizacao_id: ORG }],
    fornecedores: [{ id: FORN, nome: "Distribuidora Teste", ativo: true }],
    variantes: [
      { id: APARELHO, sku: "APA-0001", nome: "Galaxy A15", ativa: true, produtos: { tipo: "aparelho", ativo: true } },
      { id: CAPA, sku: "ACE-0001", nome: "Capa", ativa: true, produtos: { tipo: "acessorio", ativo: true } },
    ],
    produtos: [{ id: "p1" }],
  };
});

describe("/estoque/entrada: permissão e histórico", () => {
  it("sem estoque.receber (vendedor): aviso e nada mais, nem consulta ao histórico", async () => {
    cenario.permissoes = new Set(["estoque.consultar", "estoque.conferir"]);
    const t = await tela({ entrada: ENTRADA });
    expect(t).toContain("Receber mercadoria é da gerência da loja");
    for (const ausente of ["Nova entrada", "Entradas desta loja", "Entrada nº 12"]) expect(t).not.toContain(ausente);
    expect(cenario.chamadas).toEqual([]);
    expect(cenario.lidas).toEqual([]);
  });

  it("gerente: formulário, fornecedores e o histórico lido pela função do banco, nunca pelas tabelas", async () => {
    const t = await tela();
    for (const trecho of [
      "Nova entrada", "Cadastrar fornecedor", "Distribuidora Teste", "Entradas desta loja", "1 entrada(s) no total", "Abrir pelo número", "Entrada nº 12",
      "Compra de fornecedor · Distribuidora Teste · NF 1234 · 11/11/2026 10:00 · Gerente Teste",
      "21 unidade(s) · custo R$ 1.390,00: APA-0001 × 1 (Seminovo), ACE-0001 × 20",
      `/estoque/entrada?entrada=${ENTRADA}#entrada`, "Mostrando 1 de 1",
    ]) expect(t).toContain(trecho);
    // Sem entrada aberta não há estorno na tela; com uma página só, não há paginação.
    for (const ausente of ["Estornar esta entrada", "Ver anteriores", "Voltar às mais recentes", "custo oculto", "aberta acima"]) expect(t).not.toContain(ausente);
    expect(cenario.chamadas).toEqual([{ nome: "estoque_entradas", argumentos: { p_unidade: LOJA, p_limite: 20 } }]);
    expect(cenario.lidas).toEqual(["fornecedores"]);
  });

  it("loja sem entradas: a consulta deu certo e a tela diz que não há nenhuma", async () => {
    cenario.respostas.estoque_entradas = historico([]);
    const t = await tela();
    expect(t).toContain("0 entrada(s) no total");
    expect(t).toContain("Nenhuma entrada ainda nesta loja.");
    expect(t).toContain("Mostrando 0 de 0");
  });

  it("entrada estornada no histórico mostra a situação e o motivo; resumo longo diz quantas linhas faltam", async () => {
    const muitasLinhas = Array.from({ length: 8 }, (_, i) => capa({ linha: i + 1, sku: `ACE-000${i + 1}`, quantidade: 1 }));
    cenario.respostas.estoque_entradas = historico([
      entrada({ situacao: "estornada", estornado_em: "2026-11-11T15:30:00+00:00", estornado_por: "Gerente Teste", motivo_estorno: "Lançada na loja errada" }),
      entrada({ id: "00000000-0000-4000-9000-000000000071", numero: 9, tipo: "carga_inicial", fornecedor: null, documento: null, total_unidades: 8, total_custo: null, itens: muitasLinhas }),
    ]);
    const t = await tela();
    expect(t).toContain("Estornada: Lançada na loja errada");
    expect(t).toContain("Carga inicial (estoque que já está na loja) · 11/11/2026 10:00 · Gerente Teste");
    expect(t).toContain("8 unidade(s) · sem custo informado: ACE-0001 × 1, ACE-0002 × 1, ACE-0003 × 1, ACE-0004 × 1, ACE-0005 × 1, ACE-0006 × 1 e mais 2 linha(s)");
    expect(t).not.toContain("R$ 0,00");
  });

  it("perfil sem custo.ver: o banco não manda custo e a tela diz que está oculto, sem valor e sem zero", async () => {
    const semCusto = { total_custo: null, itens: [linha({ custo_unitario: null }), capa({ custo_unitario: null })] };
    cenario.respostas.estoque_entradas = historico([entrada(semCusto)], { ve_custo: false });
    cenario.respostas.estoque_entrada = aberta({
      ...semCusto, ve_custo: false, total_unidades: 21,
      itens: [linha({ custo_unitario: null, identificadores: [{ identificador: IMEI, situacao: "disponivel", livre: true, reentrada: false }] }), capa({ custo_unitario: null, saldo_livre: 20, identificadores: [] })],
    });
    const t = await tela({ entrada: ENTRADA });
    expect(t).toContain("1 entrada(s) no total · custo oculto para o seu perfil");
    expect(t).toContain("21 unidade(s): APA-0001 × 1 (Seminovo), ACE-0001 × 20");
    expect(t).toContain("Gerente Teste · 21 unidade(s) · custo oculto para o seu perfil");
    expect(t).toContain("SKU APA-0001 · 1 unidade(s) · Seminovo");
    expect(t).toContain("O estorno também volta o custo: se esta entrada informou o custo e foi a última a defini-lo");
    for (const ausente of ["R$", "custo unitário", "sem custo informado", "Hoje o banco recusaria"]) expect(t).not.toContain(ausente);
  });

  it("quem vê custo e a entrada não informou: diz que não foi informado, nunca R$ 0,00", async () => {
    const semCusto = { total_custo: null, itens: [linha({ custo_unitario: null, identificadores: [{ identificador: IMEI, situacao: "disponivel", livre: true, reentrada: false }] })] };
    cenario.respostas.estoque_entradas = historico([entrada({ total_custo: null, itens: [linha({ custo_unitario: null })] })]);
    cenario.respostas.estoque_entrada = aberta({ ...semCusto, total_unidades: 1 });
    const t = await tela({ entrada: ENTRADA });
    expect(t).toContain("1 unidade(s) · sem custo informado: APA-0001 × 1 (Seminovo)");
    expect(t).toContain("SKU APA-0001 · 1 unidade(s) · Seminovo · sem custo informado");
    for (const ausente of ["R$", "custo oculto", "O estorno também volta o custo"]) expect(t).not.toContain(ausente);
  });

  it("histórico completo, paginado pelo número: a primeira página aponta a continuação (REV-NOV-009)", async () => {
    cenario.respostas.estoque_entradas = historico(varias(20, 60), { total: 37, proxima: 41 });
    const t = await tela();
    expect(t).toContain("37 entrada(s) no total");
    expect(t).toContain("Mostrando 20 de 37");
    expect(t).toContain("Entrada nº 60");
    expect(t).toContain("Entrada nº 41");
    expect(t).toContain("/estoque/entrada?antes=41#historico");
    expect(t).toContain("Ver anteriores");
    expect(t).not.toContain("Voltar às mais recentes");
  });

  it("página seguinte: pede as anteriores ao número, os links preservam a página e o fim não oferece mais", async () => {
    cenario.respostas.estoque_entradas = historico(varias(17, 30), { total: 37 });
    const t = await tela({ antes: "41" });
    expect(cenario.chamadas).toEqual([{ nome: "estoque_entradas", argumentos: { p_unidade: LOJA, p_limite: 20, p_antes: 41 } }]);
    expect(t).toContain("Mostrando 17 de 37 · anteriores à nº 41");
    expect(t).toContain("/estoque/entrada?entrada=00000000-0000-4000-9000-000000010030&antes=41#entrada");
    expect(t).toContain("/estoque/entrada#historico");
    expect(t).toContain("Voltar às mais recentes");
    expect(t).not.toContain("Ver anteriores");
  });

  it("página inválida no endereço é ignorada; página além do fim diz que não há anteriores", async () => {
    await tela({ antes: "41; drop" });
    await tela({ antes: ["41", "42"] });
    await tela({ antes: "0" });
    expect(cenario.chamadas.map((c) => c.argumentos)).toEqual([{ p_unidade: LOJA, p_limite: 20 }, { p_unidade: LOJA, p_limite: 20 }, { p_unidade: LOJA, p_limite: 20 }]);
    cenario.respostas.estoque_entradas = historico([], { total: 37 });
    expect(await tela({ antes: "3" })).toContain("Nenhuma entrada anterior à nº 3.");
  });

  it("sem estoque.consultar: o histórico vira um estado explicado e o formulário continua", async () => {
    cenario.respostas.estoque_entradas = recusa("42501", "Sem permissão para ver as entradas desta loja");
    cenario.respostas.estoque_entrada = recusa("42501", "Sem permissão para ver as entradas desta loja");
    const t = await tela({ entrada: ENTRADA });
    expect(t).toContain("Histórico indisponível para o seu perfil");
    expect(t).toContain("Nova entrada");
    for (const ausente of ["Abrir pelo número", "Mostrando", "Nenhuma entrada", "Entrada nº 12"]) expect(t).not.toContain(ausente);
  });

  it("falha de consulta ou resposta fora do formato é falha: nunca vira lista vazia", async () => {
    for (const ruim of [{ data: null, error: null }, { data: { entradas: [] }, error: null }, recusa("57014", "canceling statement due to statement timeout"), recusa("P0002", "sumiu")]) {
      cenario.respostas.estoque_entradas = ruim;
      await expect(tela()).rejects.toThrow(/^estoque_entradas$/);
    }
    cenario.respostas.estoque_entradas = historico([entrada()]);
    for (const ruim of [{ data: null, error: null }, { data: entrada(), error: null }, { data: { id: ENTRADA }, error: null }, recusa("22023", "Informe a entrada ou o número dela"), recusa("57014", "timeout")]) {
      cenario.respostas.estoque_entrada = ruim;
      await expect(tela({ entrada: ENTRADA })).rejects.toThrow(/^estoque_entrada$/);
    }
  });
});

describe("/estoque/entrada: a conta a pagar de cada compra (FIN-004a)", () => {
  const OUTRA = "00000000-0000-4000-9000-000000000071";
  const CARGA = "00000000-0000-4000-9000-000000000072";
  beforeEach(() => {
    cenario.permissoes = new Set(["estoque.receber", "conta_pagar.gerir"]);
    cenario.respostas.estoque_entradas = historico([
      entrada(), entrada({ id: OUTRA, numero: 11, documento: "NF 99" }), entrada({ id: CARGA, numero: 10, tipo: "carga_inicial", documento: null, fornecedor: null }),
    ]);
    cenario.tabelas.contas_a_pagar = [
      { id: "c1", entrada_id: ENTRADA, situacao: "paga", valor_centavos: 50_000 },
      { id: "c2", entrada_id: ENTRADA, situacao: "aberta", valor_centavos: 50_000 },
      { id: "c3", entrada_id: ENTRADA, situacao: "cancelada", valor_centavos: 50_000 },
    ];
  });

  it("a compra com conta mostra as parcelas, o valor e quantas foram pagas; a sem conta leva ao lançamento já preenchido; a carga inicial, nada", async () => {
    const t = await tela();
    expect(t).toContain("Conta a pagar ligada: 2 parcelas, R$ 1.000,00 · 1 de 2 pagas · 1 cancelada(s)");
    expect(t).toContain(`/contas-a-pagar?loja=${LOJA}&entrada=${OUTRA}#lancar`);
    expect(t).toContain("Lançar a conta a pagar desta compra");
    expect(t).not.toContain(`entrada=${CARGA}#lancar`);
    expect(t).not.toContain(`entrada=${ENTRADA}#lancar`);
  });

  it("quem não gere as contas da loja não vê nada sobre elas, e as contas nem são lidas", async () => {
    cenario.permissoes = new Set(["estoque.receber"]);
    const t = await tela();
    expect(t).not.toContain("Conta a pagar");
    expect(t).not.toContain("Lançar a conta a pagar");
    expect(cenario.lidas).not.toContain("contas_a_pagar");
  });
});

describe("/estoque/entrada: a entrada aberta", () => {
  it("abre pelo endereço: linhas, IMEI/ICCID com a posição de hoje, reentrada, saldo livre e o estorno", async () => {
    cenario.respostas.estoque_entrada = aberta();
    const t = await tela({ entrada: ENTRADA });
    expect(cenario.chamadas).toEqual([
      { nome: "estoque_entradas", argumentos: { p_unidade: LOJA, p_limite: 20 } },
      { nome: "estoque_entrada", argumentos: { p_unidade: LOJA, p_entrada: ENTRADA, p_numero: null } },
    ]);
    for (const trecho of [
      "Compra de fornecedor · Distribuidora Teste · NF 1234",
      "Registrada em 11/11/2026 10:00 por Gerente Teste · 22 unidade(s) · custo R$ 2.440,00",
      "1. Galaxy A15", "SKU APA-0001 · 2 unidade(s) · Seminovo · custo unitário R$ 1.050,00 · 1 reentrada(s)",
      "2 IMEI/ICCID · hoje: 1 no estoque, 1 vendido",
      "2. Capa", "SKU ACE-0001 · 20 unidade(s) · Novo · custo unitário R$ 17,00",
      "Saldo livre desta variação hoje, nesta loja: 15",
      "Estornar esta entrada", "Hoje o banco recusaria este estorno",
      `1 IMEI/ICCID fora do estoque livre desta loja: ${IMEI} (vendido).`,
      "SKU ACE-0001: entraram 20, livres hoje 15.",
      "Quem decide é o banco, que confere de novo na hora do estorno.",
      "O estorno também volta o custo: se esta entrada foi a última a definir o custo de uma variação",
      `hidden entrada ${ENTRADA}`, "Motivo do estorno", "Fechar esta entrada", "aberta acima",
    ]) expect(t).toContain(trecho);
    expect(t).toMatch(new RegExp(`${IMEI}[^0-9]*aviso vendido`));
    expect(t).toMatch(new RegExp(`${IMEI_2}[^0-9]*sucesso no estoque[^0-9]*info reentrada`));
    expect(t).not.toMatch(new RegExp(`${IMEI}[^0-9]*reentrada`));
    expect(t).not.toContain("recusado");
  });

  it("abre pelo número digitado (zero à esquerda sai); com endereço e número, vale o endereço", async () => {
    cenario.respostas.estoque_entrada = aberta();
    expect(await tela({ numero: "12" })).toContain("Estornar esta entrada");
    await tela({ numero: " 007 " });
    await tela({ entrada: ENTRADA, numero: "99" });
    expect(cenario.chamadas.filter((c) => c.nome === "estoque_entrada").map((c) => c.argumentos)).toEqual([
      { p_unidade: LOJA, p_entrada: null, p_numero: 12 },
      { p_unidade: LOJA, p_entrada: null, p_numero: 7 },
      { p_unidade: LOJA, p_entrada: ENTRADA, p_numero: null },
    ]);
  });

  it("tudo livre: sem aviso de recusa, o formulário de estorno continua disponível", async () => {
    cenario.respostas.estoque_entrada = aberta({
      itens: [linha({ identificadores: [{ identificador: IMEI, situacao: "disponivel", livre: true, reentrada: false }] }), capa({ saldo_livre: 20, identificadores: [] })],
    });
    const t = await tela({ entrada: ENTRADA });
    expect(t).toContain("Estornar esta entrada");
    expect(t).toContain(`hidden entrada ${ENTRADA}`);
    expect(t).not.toContain("Hoje o banco recusaria");
  });

  it("entrada estornada: quem, quando e por quê; posições de hoje sem destaque e sem novo estorno", async () => {
    cenario.respostas.estoque_entrada = aberta({
      situacao: "estornada", estornado_em: "2026-11-11T15:30:00+00:00", estornado_por: "Gerente Teste", motivo_estorno: "Lançada na loja errada",
      itens: [linha({ identificadores: [{ identificador: IMEI, situacao: "baixado", livre: false, reentrada: false }] })],
    });
    const t = await tela({ entrada: ENTRADA, ok: "estornada" });
    expect(t).toContain("Entrada estornada: os itens saíram do estoque pelo livro, com o motivo.");
    expect(t).toContain("Estornada em 11/11/2026 12:30 por Gerente Teste");
    expect(t).toContain("Motivo: Lançada na loja errada. As posições abaixo são as de hoje");
    expect(t).toMatch(new RegExp(`${IMEI}[^0-9]*neutro fora do estoque \\(baixado\\)`));
    for (const ausente of ["Estornar esta entrada", "hidden entrada", "Hoje o banco recusaria", "O estorno também volta o custo"]) expect(t).not.toContain(ausente);
  });

  it("entrada que não é desta loja: aviso com o número pedido, formulário e histórico continuam", async () => {
    cenario.respostas.estoque_entrada = recusa("P0002", "Entrada não encontrada nesta loja");
    const peloNumero = await tela({ numero: "99" });
    expect(peloNumero).toContain("Entrada nº 99 não encontrada nesta loja");
    expect(peloNumero).toContain("A numeração das entradas é da rede inteira");
    for (const trecho of ["Nova entrada", "Entradas desta loja", "Entrada nº 12"]) expect(peloNumero).toContain(trecho);
    expect(peloNumero).not.toContain("Estornar esta entrada");
    expect(await tela({ entrada: "00000000-0000-4000-9000-0000000000aa" })).toContain("Entrada não encontrada nesta loja");
  });

  it("número inválido não consulta o banco; endereço de entrada que não é identificador é ignorado", async () => {
    for (const numero of ["12a", "0", "-3", "1234567890123"]) {
      expect(await tela({ numero })).toContain("Número de entrada inválido: use só os dígitos (ex.: 12).");
    }
    const t = await tela({ entrada: "12" });
    expect(t).not.toContain("Número de entrada inválido");
    expect(t).not.toContain("não encontrada");
    expect(cenario.chamadas.every((c) => c.nome === "estoque_entradas")).toBe(true);
  });

  it("entrada recém-registrada abre no topo e diz quantos aparelhos voltaram por reentrada", async () => {
    cenario.respostas.estoque_registrar_entrada = { data: { id: ENTRADA, numero: 12, repetida: false, reentradas: 1 }, error: null };
    const destino = await destinoDe(registrarEntrada(formulario({
      unidade: LOJA, tipo: "carga_inicial", chave: "form:abc12345", motivo: "Volta do aparelho", itens: JSON.stringify([{ variante: APARELHO, tipo: "aparelho", identificadores: IMEI_2 }]),
    })));
    expect(destino).toBe(`/estoque/entrada?ok=registrada&entrada=${ENTRADA}`);
    cenario.respostas.estoque_entrada = aberta();
    const t = await tela(parametrosDe(destino));
    expect(t).toContain("Entrada registrada: o estoque e o custo já estão atualizados. 1 aparelho(s) ou chip(s) voltaram ao estoque com a mesma identidade (reentrada): o histórico anterior foi preservado.");
    cenario.respostas.estoque_entrada = aberta({ itens: [capa({ saldo_livre: 20, identificadores: [] })] });
    const semReentrada = await tela(parametrosDe(destino));
    expect(semReentrada).toContain("Entrada registrada: o estoque e o custo já estão atualizados.");
    expect(semReentrada).not.toContain("voltaram ao estoque");
  });
});

describe("/estoque/entrada: recusas apontam onde corrigir", () => {
  it("estorno recusado volta à MESMA entrada, mesmo fora da primeira página, com o IMEI recusado em destaque (REV-NOV-009)", async () => {
    cenario.respostas.estoque_estornar_entrada = recusa("OR002", `O IMEI/ICCID ${IMEI} não está livre nesta loja (vendido, reservado ou transferido): o estorno não é possível`);
    const destino = await destinoDe(estornarEntrada(formulario({ entrada: ENTRADA, motivo: "Loja errada" })));
    expect(destino).toBe(`/estoque/entrada?erro=em_uso&entrada=${ENTRADA}&id=${IMEI}`);
    expect(cenario.chamadas).toEqual([{ nome: "estoque_estornar_entrada", argumentos: { p_entrada: ENTRADA, p_motivo: "Loja errada" } }]);

    // A loja tem 37 entradas e a nº 12 não está entre as 20 mais recentes: abre pelo endereço assim mesmo.
    cenario.respostas.estoque_entradas = historico(varias(20, 60), { total: 37, proxima: 41 });
    cenario.respostas.estoque_entrada = aberta();
    const t = await tela(parametrosDe(destino));
    expect(t).not.toContain(`/estoque/entrada?entrada=${ENTRADA}#entrada`);
    expect(t).toContain(ERROS_DA_ENTRADA.em_uso);
    expect(t).toContain(`Onde: IMEI/ICCID ${IMEI}.`);
    expect(t).toContain("Registrada em 11/11/2026 10:00 por Gerente Teste");
    expect(t).toMatch(new RegExp(`${IMEI}[^0-9]*perigo recusado`));
    expect(t).not.toMatch(new RegExp(`${IMEI_2}[^0-9]*recusado`));
    expect(t).toContain(`hidden entrada ${ENTRADA}`);
  });

  it("estorno sem quantidade livre volta à entrada com a linha; motivo curto também volta à entrada", async () => {
    cenario.respostas.estoque_estornar_entrada = recusa("OR001", "Não há quantidade livre para estornar a linha 2 (já vendida, reservada ou transferida)");
    const destino = await destinoDe(estornarEntrada(formulario({ entrada: ENTRADA, motivo: "Loja errada" })));
    expect(destino).toBe(`/estoque/entrada?erro=sem_saldo&entrada=${ENTRADA}&linha=2`);
    cenario.respostas.estoque_entrada = aberta();
    const t = await tela(parametrosDe(destino));
    expect(t).toContain(ERROS_DA_ENTRADA.sem_saldo);
    expect(t).toContain("Onde: linha 2 da entrada.");
    expect(await destinoDe(estornarEntrada(formulario({ entrada: ENTRADA, motivo: "x" })))).toBe(`/estoque/entrada?erro=motivo&entrada=${ENTRADA}`);
    expect(await destinoDe(estornarEntrada(formulario({ entrada: "12", motivo: "Loja errada" })))).toBe("/estoque/entrada?erro=dados");
    expect(cenario.chamadas.filter((c) => c.nome === "estoque_estornar_entrada")).toHaveLength(1);
  });

  it("entrada recusada diz o motivo certo e aponta a linha, o SKU e o IMEI/ICCID (REV-NOV-004, REV-NOV-005)", async () => {
    const registrar = (erro: { code: string; message: string }) => {
      cenario.respostas.estoque_registrar_entrada = { data: null, error: erro };
      return destinoDe(registrarEntrada(formulario({
        unidade: LOJA, tipo: "carga_inicial", chave: "form:abc12345", motivo: "Contagem", itens: JSON.stringify([{ variante: APARELHO, tipo: "aparelho", identificadores: IMEI }]),
      })));
    };
    const vendido = await registrar({ code: "23505", message: `IMEI/ICCID ${IMEI} já foi vendido: a volta ao estoque é pela devolução da venda` });
    expect(vendido).toBe(`/estoque/entrada?erro=vendido&id=${IMEI}`);
    const telaDoVendido = await tela(parametrosDe(vendido));
    expect(telaDoVendido).toContain(ERROS_DA_ENTRADA.vendido);
    expect(telaDoVendido).toContain(`Onde: IMEI/ICCID ${IMEI}.`);

    const inativo = await registrar({ code: "22023", message: "Linha 2 (APA-0001): o produto está inativo no catálogo: reative antes de receber" });
    expect(inativo).toBe("/estoque/entrada?erro=produto_inativo&linha=2&sku=APA-0001");
    const telaDoInativo = await tela(parametrosDe(inativo));
    expect(telaDoInativo).toContain(ERROS_DA_ENTRADA.produto_inativo);
    expect(telaDoInativo).toContain("Onde: linha 2 do formulário · SKU APA-0001.");

    const outraVariacao = await registrar({ code: "23505", message: `IMEI/ICCID ${IMEI} já tem histórico (ou está em contagem aberta) em outra variação: receba na variação original (SKU CAPA AZUL 500)` });
    expect(parametrosDe(outraVariacao)).toEqual({ erro: "outra_variacao", id: IMEI, sku: "CAPA AZUL 500" });
    expect(await tela(parametrosDe(outraVariacao))).toContain(`Onde: variação original: SKU CAPA AZUL 500 · IMEI/ICCID ${IMEI}.`);

    expect(await registrar({ code: "23505", message: `IMEI/ICCID ${IMEI} foi baixado por ajuste ou perda: a entrada não desfaz essa baixa` })).toBe(`/estoque/entrada?erro=baixado&id=${IMEI}`);
    expect(await registrar({ code: "40P01", message: "deadlock detected" })).toBe("/estoque/entrada?erro=concorrencia");
    expect(await tela({ erro: "concorrencia" })).toContain(ERROS_DA_ENTRADA.concorrencia);
  });

  it("o que vem no endereço só aparece no formato esperado; erro desconhecido não vira aviso", async () => {
    const t = await tela({ erro: "vendido", id: "<script>", linha: "9999", sku: "a  b" });
    expect(t).toContain(ERROS_DA_ENTRADA.vendido);
    for (const ausente of ["Onde:", "<script>", "9999"]) expect(t).not.toContain(ausente);
    const semErro = await tela({ erro: "constructor", id: IMEI });
    expect(semErro).not.toContain("Onde:");
    expect(semErro).not.toContain(IMEI);
    // Sem erro, o endereço não põe destaque em nenhum IMEI/ICCID da entrada aberta.
    cenario.respostas.estoque_entrada = aberta();
    expect(await tela({ entrada: ENTRADA, id: IMEI })).not.toContain("recusado");
  });
});

describe("ações da entrada", () => {
  it("registrar: linhas do formulário viram o JSON do banco (IMEI só dígitos, custo em centavos)", async () => {
    cenario.respostas.estoque_registrar_entrada = { data: { id: ENTRADA, numero: 12, repetida: false, reentradas: 0 }, error: null };
    const itens = JSON.stringify([
      { variante: APARELHO, tipo: "aparelho", identificadores: `${IMEI.slice(0, 5)} ${IMEI.slice(5)}`.replace(" ", "-"), custo: "1.050,00", condicao: "seminovo" },
      { variante: CAPA, tipo: "acessorio", quantidade: "20", custo: "17,00" },
    ]);
    const campos = { unidade: LOJA, tipo: "compra", fornecedor: FORN, documento: "NF 1234", chave: "form:abc12345", motivo: "Pedido da semana", itens };
    expect(await destinoDe(registrarEntrada(formulario(campos)))).toBe(`/estoque/entrada?ok=registrada&entrada=${ENTRADA}`);
    expect(cenario.chamadas[0]?.argumentos).toEqual({
      p_unidade: LOJA, p_tipo: "compra", p_fornecedor: FORN, p_documento: "NF 1234", p_chave: "form:abc12345", p_motivo: "Pedido da semana",
      p_itens: [{ variante: APARELHO, identificadores: [IMEI], condicao: "seminovo", custo: 105_000 }, { variante: CAPA, quantidade: 20, condicao: "novo", custo: 1_700 }],
    });
    // O mesmo formulário enviado de novo: o banco devolve a entrada que já existe e a tela avisa.
    cenario.respostas.estoque_registrar_entrada = { data: { id: ENTRADA, numero: 12, repetida: true, reentradas: 0 }, error: null };
    expect(await destinoDe(registrarEntrada(formulario(campos)))).toBe(`/estoque/entrada?ok=repetida&entrada=${ENTRADA}`);
  });

  it("erros do formulário não chamam o banco; estorno repetido não é erro", async () => {
    expect(await destinoDe(registrarEntrada(formulario({ unidade: LOJA, tipo: "carga_inicial", chave: "form:abc12345", motivo: "Contagem", itens: JSON.stringify([{ variante: APARELHO, tipo: "aparelho", identificadores: "123" }]) }))))
      .toBe("/estoque/entrada?erro=identificador");
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.estoque_estornar_entrada = { data: "estornada", error: null };
    expect(await destinoDe(estornarEntrada(formulario({ entrada: ENTRADA, motivo: "Loja errada" })))).toBe(`/estoque/entrada?ok=estornada&entrada=${ENTRADA}`);
    cenario.respostas.estoque_estornar_entrada = { data: "ja_estornada", error: null };
    expect(await destinoDe(estornarEntrada(formulario({ entrada: ENTRADA, motivo: "Loja errada" })))).toBe(`/estoque/entrada?ok=ja_estornada&entrada=${ENTRADA}`);
  });

  it("fornecedor novo vai para a rede da loja do turno", async () => {
    cenario.respostas.fornecedor_salvar = { data: { id: FORN, repetida: false }, error: null };
    expect(await destinoDe(salvarFornecedor(formulario({ nome: "Atacado Teste", cnpj: "", contato: "", motivo: "Fornecedor novo" })))).toBe("/estoque/entrada?ok=fornecedor");
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_organizacao: ORG, p_id: null, p_nome: "Atacado Teste", p_cnpj: null });
    cenario.respostas.fornecedor_salvar = recusa("23505", "Já existe outro fornecedor com este nome");
    expect(await destinoDe(salvarFornecedor(formulario({ nome: "Atacado Teste", cnpj: "", contato: "", motivo: "Fornecedor novo" })))).toBe("/estoque/entrada?erro=nome_repetido&form=fornecedor");
  });

  it("a busca devolve só itens com estoque, de produto e variação ativos (REV-NOV-005)", async () => {
    cenario.tabelas.variantes = [
      ...(cenario.tabelas.variantes ?? []),
      { id: "rec", sku: "REC-1", nome: "Recarga", ativa: true, produtos: { tipo: "recarga", ativo: true } },
      { id: INATIVO, sku: "APA-0009", nome: "Galaxy antigo", ativa: true, produtos: { tipo: "aparelho", ativo: false } },
    ];
    const achados = await buscarItensParaEntrada("galaxy");
    expect(achados.map((a) => a.id).sort()).toEqual([APARELHO, CAPA]);
    expect(achados.map((a) => a.tipo).sort()).toEqual(["acessorio", "aparelho"]);
    expect(cenario.filtros).toContainEqual(["variantes", "produtos.ativo", true]);
    expect(await buscarItensParaEntrada("g")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// INV-009a: o pedido de compra da entrada aberta
// ---------------------------------------------------------------------------------------------
const PEDIDO = "00000000-0000-4000-9000-0000000000a7";
const OUTRO_FORN = "00000000-0000-4000-9000-000000000061";
const pedidoDaLista = (extra: Record<string, unknown> = {}) => ({
  id: PEDIDO, numero: 7, unidade_id: LOJA, fornecedor_id: FORN, fornecedor: "Distribuidora Teste", documento: "COT-77", previsto_para: "2026-11-20",
  situacao: "aberto", criado_em: "2026-11-10T12:00:00Z", encerrado_em: null, motivo_encerramento: null, unidades: 12, recebidas: 0, entradas: 0, total_previsto: null, ...extra,
});
const pedidoAberto = (extra: Record<string, unknown> = {}) => ({
  ...pedidoDaLista(), observacao: null, ve_custo: true, itens: [], fora_do_pedido: [], entradas: [], ...extra,
});

describe("entrada aberta: o pedido de compra (INV-009a)", () => {
  beforeEach(() => {
    cenario.respostas.estoque_entrada = aberta();
    cenario.tabelas.entradas_estoque = [{ id: ENTRADA, fornecedor_id: FORN, pedido_id: null }];
  });

  it("a compra sem pedido oferece os pedidos abertos da loja do mesmo fornecedor; sem nenhum, leva aos pedidos", async () => {
    cenario.respostas.pedidos_compra = { data: [pedidoDaLista(), pedidoDaLista({ id: "00000000-0000-4000-9000-0000000000a8", numero: 8, fornecedor_id: OUTRO_FORN })], error: null };
    let t = await tela({ entrada: ENTRADA });
    expect(cenario.chamadas.find((c) => c.nome === "pedidos_compra")?.argumentos).toEqual({ p_unidade: LOJA, p_situacao: "aberto" });
    expect(t).toContain("Pedido de compra");
    expect(t).toContain(`${PEDIDO} nº 7 · COT-77 · previsto 20/11`);
    expect(t).not.toContain("nº 8");
    expect(t).toContain("Ligar ao pedido");
    cenario.respostas.pedidos_compra = { data: [pedidoDaLista({ fornecedor_id: OUTRO_FORN })], error: null };
    t = await tela({ entrada: ENTRADA });
    expect(t).toContain("Nenhum pedido aberto deste fornecedor nesta loja.");
    expect(t).toContain("/estoque/pedidos");
  });

  it("ligada: o atalho para a conferência no pedido; desligar só enquanto o pedido está aberto", async () => {
    cenario.tabelas.entradas_estoque = [{ id: ENTRADA, fornecedor_id: FORN, pedido_id: PEDIDO }];
    cenario.respostas.pedido_compra = { data: pedidoAberto(), error: null };
    let t = await tela({ entrada: ENTRADA });
    expect(t).toContain(`/estoque/pedidos?pedido=${PEDIDO}`);
    expect(t).toContain("pedido nº 7 : a conferência está no pedido.");
    expect(t).toContain("Desligar do pedido (ligada errado)");
    cenario.respostas.pedido_compra = { data: pedidoAberto({ situacao: "encerrado", encerrado_em: "2026-11-12T12:00:00Z", motivo_encerramento: "Recebido" }), error: null };
    t = await tela({ entrada: ENTRADA });
    expect(t).toContain("(pedido encerrado).");
    expect(t).not.toContain("Desligar do pedido");
  });

  it("banco sem os pedidos (coluna ausente): o bloco some; falha de leitura: diz; a carga inicial nem pergunta", async () => {
    cenario.errosDasTabelas.entradas_estoque = { code: "42703" };
    expect(await tela({ entrada: ENTRADA })).not.toContain("Pedido de compra nº");
    expect(await tela({ entrada: ENTRADA })).not.toContain("Ligar ao pedido");
    cenario.errosDasTabelas = {};
    cenario.respostas.pedidos_compra = { data: null, error: { code: "57014" } };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await tela({ entrada: ENTRADA })).toContain("Não deu para ler os pedidos de compra agora.");
    cenario.chamadas = [];
    cenario.respostas.estoque_entrada = aberta({ tipo: "carga_inicial", fornecedor: null, documento: null });
    await tela({ entrada: ENTRADA });
    expect(cenario.chamadas.some((c) => c.nome === "pedidos_compra")).toBe(false);
  });

  it("ligar e desligar mandam a entrada, o pedido e o motivo; cada recusa volta com a mensagem certa", async () => {
    cenario.respostas.pedido_compra_ligar_entrada = { data: true, error: null };
    expect(await destinoDe(ligarPedido(formulario({ entrada: ENTRADA, pedido: PEDIDO, motivo: "NF do pedido" })))).toBe(`/estoque/entrada?ok=pedido_ligado&entrada=${ENTRADA}`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "pedido_compra_ligar_entrada", argumentos: { p_entrada: ENTRADA, p_pedido: PEDIDO, p_motivo: "NF do pedido" } });
    expect(await destinoDe(ligarPedido(formulario({ entrada: ENTRADA, pedido: "", motivo: "Ligada errado" })))).toBe(`/estoque/entrada?ok=pedido_desligado&entrada=${ENTRADA}`);
    expect(cenario.chamadas.at(-1)?.argumentos.p_pedido).toBeNull();
    cenario.respostas.pedido_compra_ligar_entrada = { data: false, error: null };
    expect(await destinoDe(ligarPedido(formulario({ entrada: ENTRADA, pedido: PEDIDO, motivo: "De novo" })))).toBe(`/estoque/entrada?ok=pedido_sem_mudanca&entrada=${ENTRADA}`);
    for (const [erro, chave] of [
      [{ code: "22023", message: "O pedido é de outra loja" }, "pedido_outra_loja"], [{ code: "22023", message: "O pedido é de outro fornecedor" }, "pedido_outro_fornecedor"],
      [{ code: "22023", message: "O pedido já foi encerrado" }, "pedido_encerrado"], [{ code: "22023", message: "O pedido desta entrada já foi encerrado: a ligação fica" }, "pedido_ligacao_fica"],
      [{ code: "22023", message: "Só a entrada de compra de fornecedor recebe pedido" }, "pedido_so_compra"], [{ code: "22023", message: "A entrada foi estornada: não recebe pedido" }, "pedido_estornada"],
      [{ code: "P0002", message: "Pedido de compra não encontrado" }, "pedido_nao_encontrado"], [{ code: "P0002", message: "Entrada não encontrada para você" }, "permissao"],
      [{ code: "PGRST202", message: "" }, "pedidos_indisponiveis"], [{ code: "57014", message: "" }, "falha"],
    ] as const) {
      cenario.respostas.pedido_compra_ligar_entrada = { data: null, error: { ...erro } };
      expect(await destinoDe(ligarPedido(formulario({ entrada: ENTRADA, pedido: PEDIDO, motivo: "Tentativa" }))), erro.message).toBe(`/estoque/entrada?erro=${chave}&entrada=${ENTRADA}`);
      expect(Object.hasOwn(ERROS_DA_ENTRADA, chave)).toBe(true);
    }
    const antes = cenario.chamadas.length;
    expect(await destinoDe(ligarPedido(formulario({ entrada: "x", pedido: PEDIDO, motivo: "Tentativa" })))).toBe("/estoque/entrada?erro=dados");
    expect(await destinoDe(ligarPedido(formulario({ entrada: ENTRADA, pedido: "y", motivo: "Tentativa" })))).toBe(`/estoque/entrada?erro=dados&entrada=${ENTRADA}`);
    expect(await destinoDe(ligarPedido(formulario({ entrada: ENTRADA, pedido: PEDIDO, motivo: "x" })))).toBe(`/estoque/entrada?erro=motivo&entrada=${ENTRADA}`);
    expect(cenario.chamadas).toHaveLength(antes);
  });
});

// ---------------------------------------------------------------------------------------------
// INV-009b: receber a mercadoria a partir do pedido de compra
// ---------------------------------------------------------------------------------------------
/** As props do FormularioEntrada que a página montou (o componente não é executado). */
function propsDoFormulario(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) { for (const x of v) { const p = propsDoFormulario(x); if (p) return p; } return null; }
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && v.type.name === "FormularioEntrada") return v.props;
    for (const filho of Object.values(v.props)) { const p = propsDoFormulario(filho); if (p) return p; }
    return null;
  }
  if (v && typeof v === "object") { for (const x of Object.values(v)) { const p = propsDoFormulario(x); if (p) return p; } }
  return null;
}
const COMPLETO = "00000000-0000-4000-9000-000000000032";
const itemDoPedido = (extra: Record<string, unknown> = {}) => ({
  linha: 1, variante_id: CAPA, sku: "ACE-0001", nome: "Capa", produto: "Capa", quantidade: 10, recebida: 4, custo_combinado: 1_800, custo_da_nota: 1_900, ...extra,
});
const paginaDoPedido = async (parametros: Record<string, string>) => (await EntradaDeMercadoria({ searchParams: Promise.resolve(parametros) })) as ReactElement;

describe("receber a partir do pedido de compra (INV-009b)", () => {
  it("o pedido aberto desta loja vira as linhas do que falta, com o custo combinado; o completo e o inativo ficam de fora", async () => {
    cenario.respostas.pedido_compra = { data: pedidoAberto({ itens: [
      itemDoPedido(),
      itemDoPedido({ linha: 2, variante_id: APARELHO, sku: "APA-0001", nome: "Galaxy A15", produto: "Galaxy", quantidade: 2, recebida: 0, custo_combinado: 105_000, custo_da_nota: null }),
      itemDoPedido({ linha: 3, variante_id: INATIVO, sku: "ACE-0009", nome: "Fone", quantidade: 3, recebida: 0, custo_combinado: null, custo_da_nota: null }),
      itemDoPedido({ linha: 4, variante_id: COMPLETO, sku: "ACE-0002", nome: "Película", quantidade: 5, recebida: 5 }),
    ] }), error: null };
    const arvore = await paginaDoPedido({ pedido: PEDIDO });
    expect(cenario.chamadas.find((c) => c.nome === "pedido_compra")?.argumentos).toEqual({ p_pedido: PEDIDO });
    expect(propsDoFormulario(arvore)?.pedido).toEqual({
      id: PEDIDO, numero: 7, fornecedorId: FORN, fornecedor: "Distribuidora Teste", deFora: 1,
      linhas: [
        { item: { id: CAPA, sku: "ACE-0001", nome: "Capa", tipo: "acessorio" }, falta: 6, custo: "18,00" },
        { item: { id: APARELHO, sku: "APA-0001", nome: "Galaxy A15", tipo: "aparelho" }, falta: 2, custo: "1050,00" },
      ],
    });
    expect(texto(arvore)).toContain("Nova entrada: receber o pedido nº 7");
    // Sem o pedido no endereço (ou com um endereço que não é identificador), o formulário de sempre, sem ler pedido.
    cenario.chamadas = [];
    for (const parametros of [{}, { pedido: "x" }] as Record<string, string>[]) expect(propsDoFormulario(await paginaDoPedido(parametros))?.pedido).toBeNull();
    expect(cenario.chamadas.some((c) => c.nome === "pedido_compra")).toBe(false);
  });

  it("os avisos — outra loja, encerrado, completo, inativo, não encontrado, sem os pedidos no banco e a falha — e a entrada segue sem o pedido", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const casos: [Resposta, string][] = [
      [{ data: pedidoAberto({ unidade_id: "00000000-0000-4000-8000-0000000000dd", itens: [itemDoPedido()] }), error: null }, "Este pedido é de outra loja"],
      [{ data: pedidoAberto({ situacao: "encerrado", encerrado_em: "2026-11-15T13:00:00Z", motivo_encerramento: "Recebido", itens: [itemDoPedido()] }), error: null }, "Este pedido já foi encerrado"],
      [{ data: pedidoAberto({ itens: [itemDoPedido({ recebida: 10 })] }), error: null }, "Nada falta receber neste pedido"],
      [{ data: pedidoAberto({ itens: [itemDoPedido({ variante_id: INATIVO })] }), error: null }, "estão inativos no catálogo"],
      [recusa("P0002", "Pedido de compra não encontrado para você"), "Pedido de compra não encontrado para você"],
      [recusa("PGRST202", ""), "ainda não estão disponíveis neste ambiente"],
      [recusa("57014", ""), "Não deu para ler o pedido agora"],
    ];
    for (const [resposta, aviso] of casos) {
      cenario.respostas.pedido_compra = resposta;
      const arvore = await paginaDoPedido({ pedido: PEDIDO });
      expect(texto(arvore), aviso).toContain(aviso);
      expect(propsDoFormulario(arvore)?.pedido, aviso).toBeNull();
    }
  });

  it("registrar a entrada do pedido: sai ligada a ele; a ligação recusada deixa a entrada registrada e avisa; sem o pedido, como sempre", async () => {
    const itens = JSON.stringify([{ variante: CAPA, tipo: "acessorio", quantidade: "6", custo: "18,00" }]);
    const campos = { unidade: LOJA, tipo: "compra", fornecedor: FORN, documento: "NF 900", chave: "form:pedido007", motivo: "Recebimento do pedido nº 7", itens, pedido: PEDIDO };
    cenario.respostas.estoque_registrar_entrada = { data: { id: ENTRADA, numero: 12, repetida: false, reentradas: 0 }, error: null };
    cenario.respostas.pedido_compra_ligar_entrada = { data: true, error: null };
    expect(await destinoDe(registrarEntrada(formulario(campos)))).toBe(`/estoque/entrada?ok=registrada_no_pedido&entrada=${ENTRADA}`);
    expect(cenario.chamadas.map((c) => c.nome)).toEqual(["estoque_registrar_entrada", "pedido_compra_ligar_entrada"]);
    expect(cenario.chamadas[1]?.argumentos).toEqual({ p_entrada: ENTRADA, p_pedido: PEDIDO, p_motivo: "Recebida a partir do pedido de compra" });
    // A ligação recusada (o pedido encerrou no meio do caminho, por exemplo): a entrada continua registrada.
    cenario.respostas.pedido_compra_ligar_entrada = recusa("22023", "O pedido já foi encerrado");
    expect(await destinoDe(registrarEntrada(formulario(campos)))).toBe(`/estoque/entrada?ok=registrada_sem_pedido&entrada=${ENTRADA}`);
    // O mesmo formulário de novo: a entrada que já existe, ligada (ou religada) ao pedido.
    cenario.respostas.estoque_registrar_entrada = { data: { id: ENTRADA, numero: 12, repetida: true, reentradas: 0 }, error: null };
    cenario.respostas.pedido_compra_ligar_entrada = { data: false, error: null };
    expect(await destinoDe(registrarEntrada(formulario(campos)))).toBe(`/estoque/entrada?ok=repetida&entrada=${ENTRADA}`);
    // Pedido que não é identificador: nem tenta ligar.
    cenario.chamadas = [];
    cenario.respostas.estoque_registrar_entrada = { data: { id: ENTRADA, numero: 12, repetida: false, reentradas: 0 }, error: null };
    expect(await destinoDe(registrarEntrada(formulario({ ...campos, pedido: "x" })))).toBe(`/estoque/entrada?ok=registrada&entrada=${ENTRADA}`);
    expect(cenario.chamadas.map((c) => c.nome)).toEqual(["estoque_registrar_entrada"]);
  });

  it("a tela diz o resultado: ligada ao pedido, ou registrada sem a ligação (com o caminho para ligar)", async () => {
    cenario.respostas.estoque_entrada = aberta();
    cenario.tabelas.entradas_estoque = [{ id: ENTRADA, fornecedor_id: FORN, pedido_id: PEDIDO }];
    cenario.respostas.pedido_compra = { data: pedidoAberto(), error: null };
    expect(await tela({ ok: "registrada_no_pedido", entrada: ENTRADA })).toContain("Entrada registrada e ligada ao pedido de compra");
    cenario.tabelas.entradas_estoque = [{ id: ENTRADA, fornecedor_id: FORN, pedido_id: null }];
    cenario.respostas.pedidos_compra = { data: [pedidoDaLista()], error: null };
    const t = await tela({ ok: "registrada_sem_pedido", entrada: ENTRADA });
    expect(t).toContain("não deu para ligar ao pedido de compra agora");
    expect(t).toContain("Ligar ao pedido");
  });
});

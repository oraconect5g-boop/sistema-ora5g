// Financeiro real (#65) montado com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede.
// Confere permissão, escopo (loja do turno primeiro; rede só com venda.ver_todas), banco sem a
// função, período vazio e a exportação. Os cálculos estão provados em lib/financeiro/painel.test.ts e
// a soma no banco em packages/banco/src/financeiro-painel.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const VENDEDOR = "00000000-0000-4000-8000-0000000000aa";

const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  painel: null as unknown,
  erroDoPainel: null as null | { code: string },
  chamadas: [] as Record<string, unknown>[],
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  /** REPORT-005b: a resposta de pagamentos_por_terminal (o padrão é a função ausente). */
  maquininhas: null as unknown,
  erroDasMaquininhas: { code: "PGRST202" } as null | { code: string },
  /** FIN-001a: a resposta de financeiro_conferencia (o padrão é a função ausente) e os argumentos de cada chamada. */
  conferencia: null as unknown,
  erroDaConferencia: { code: "PGRST202" } as null | { code: string },
  chamadasDaConferencia: [] as Record<string, unknown>[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

// Consulta que aceita os filtros do PostgREST usados nas telas e devolve as linhas da tabela simulada.
class Consulta {
  linhas: Record<string, unknown>[];
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { if (!coluna.includes(".")) this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
  gte() { return this; }
  lt() { return this; }
  is(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  not(coluna: string, operador: string, valor: unknown) { if (operador === "is") this.linhas = this.linhas.filter((l) => l[coluna] !== valor); return this; }
  or() { return this; }
  order() { return this; }
  range(de: number, ate: number) { this.linhas = this.linhas.slice(de, ate + 1); return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Record<string, unknown>[]; count: number; error: null }) => unknown) {
    return Promise.resolve({ data: this.linhas, count: this.linhas.length, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  usuario: { id: VENDEDOR },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-10T23:00:00Z" },
  // As permissões do menu chegam com a sessão (public.molde_da_sessao, lote VEL-a): a tela não pergunta de novo ao banco.
  get molde() {
    return { permissoes: cenario.permissoes, nome: "Ana (fictícia)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } };
  },
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: Record<string, unknown>) => {
      if (nome === "tem_permissao") throw new Error("a tela não pergunta permissão do menu ao banco: ela chega com a sessão (molde)");
      if (nome === "pagamentos_por_terminal") return cenario.erroDasMaquininhas ? { data: null, error: cenario.erroDasMaquininhas } : { data: cenario.maquininhas, error: null };
      if (nome === "financeiro_conferencia") {
        cenario.chamadasDaConferencia.push(argumentos);
        return cenario.erroDaConferencia ? { data: null, error: cenario.erroDaConferencia } : { data: cenario.conferencia, error: null };
      }
      if (nome === "financeiro_painel") {
        cenario.chamadas.push(argumentos);
        return cenario.erroDoPainel ? { data: null, error: cenario.erroDoPainel } : { data: cenario.painel, error: null };
      }
      return { data: null, error: null };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import Financeiro from "./page";
import { GET as exportar } from "./exportar/route";

// Texto de toda a árvore de elementos (todas as props). Executa só os componentes de apresentação
// desta tela (síncronos, sem estado); os de cliente e o molde ficam como elementos.
const APRESENTACAO = new Set(["ConteudoFinanceiro", "TabelaDosRegistros", "PainelDaConciliacao", "PainelDasMaquininhas", "ContaDoPeriodo", "Lado", "VendasComDiferenca"]);
function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && APRESENTACAO.has(v.type.name)) return texto((v.type as (p: unknown) => unknown)(v.props));
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string> = {}) => texto(await Financeiro({ searchParams: Promise.resolve(parametros) }) as ReactElement);

const PAINEL = {
  periodos: [{ periodo: "2026-11-10T14", vendas: 2, vendido: 23_700, cancelamentos: 0, cancelado: 0, devolucoes: 1, devolvido: 7_900 }],
  pagamentos: [
    { meio: "dinheiro", situacao: "confirmado", meio_entrada: null, quantidade: 1, valor: 10_000, entrada: 0, troco: 2_100 },
    { meio: "pix_picpay", situacao: "confirmado", meio_entrada: null, quantidade: 1, valor: 15_800, entrada: 0, troco: 0 },
  ],
  reembolsos: [{ meio: "dinheiro", quantidade: 1, valor: 7_900 }],
  estornos: [],
  a_receber: [],
  movimentos: [{ periodo: "2026-11-10T14", tipo: "recebimento", meio: "dinheiro", quantidade: 1, valor: 10_000 }],
  caixas: { abertos_agora: 1, fechados: 0, conferidos: 0, com_diferenca: 0, diferenca: 0, diferenca_absoluta: 0 },
};
const VAZIO = { ...PAINEL, periodos: [], pagamentos: [], reembolsos: [], movimentos: [] };

beforeEach(() => {
  cenario.permissoes = new Set();
  cenario.painel = PAINEL;
  cenario.erroDoPainel = null;
  cenario.chamadas = [];
  cenario.maquininhas = null;
  cenario.erroDasMaquininhas = { code: "PGRST202" };
  cenario.conferencia = null;
  cenario.erroDaConferencia = { code: "PGRST202" };
  cenario.chamadasDaConferencia = [];
  cenario.tabelas = {
    vendas: [{ id: "v1", numero: 101, unidade_id: LOJA, vendedor_id: VENDEDOR, situacao: "concluida", total_centavos: 15_800, devolvido_centavos: 7_900, concluida_em: "2026-11-10T17:00:00Z" }],
    perfis_usuario: [{ id: VENDEDOR, nome: "Ana Teste" }],
    unidades: [{ id: LOJA, nome: "Santa Cândida (teste)", tipo: "loja_fisica" }, { id: OUTRA, nome: "Loja 02 (teste)", tipo: "loja_fisica" }],
  };
});

describe("/financeiro", () => {
  it("sem venda.ver_unidade nem venda.ver_todas: sem permissão e sem consultar o financeiro (abrir caixa não libera)", async () => {
    cenario.permissoes = new Set(["venda.registrar", "caixa.abrir"]);
    const t = await tela();
    expect(t).toContain("Sem permissão");
    expect(cenario.chamadas).toEqual([]);
  });

  it("gerente: loja do turno, período e o anterior, números do banco e o detalhamento", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade", "caixa.conferir"]);
    const t = await tela();
    expect(cenario.chamadas).toHaveLength(2);
    expect(cenario.chamadas.every((c) => c.p_unidade === LOJA)).toBe(true);
    expect(cenario.chamadas[0]?.p_por_hora).toBe(true);
    for (const trecho of ["Vendas concluídas", "Pagamentos registrados por meio", "Movimentação dos caixas", "Fechamentos", "Registros do período", "Ana Teste"]) expect(t).toContain(trecho);
    expect(t).toMatch(/Venda\s+101/); // link para o comprovante da venda do detalhamento
    expect(t).toContain("Pix na maquininha PicPay");
    expect(t).not.toContain("Rede inteira"); // gerente não consolida a rede
  });

  it("gerente pedindo a rede pelo endereço continua na loja do turno", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    await tela({ loja: "rede" });
    expect(cenario.chamadas.every((c) => c.p_unidade === LOJA)).toBe(true);
  });

  it("dono: a loja do turno primeiro; a rede inteira só quando escolhida", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade", "venda.ver_todas", "caixa.conferir"]);
    let t = await tela();
    expect(cenario.chamadas.every((c) => c.p_unidade === LOJA)).toBe(true);
    expect(t).toContain("Rede inteira");
    expect(t).toContain("Loja 02 (teste)");
    cenario.chamadas = [];
    t = await tela({ loja: "rede", periodo: "30" });
    expect(cenario.chamadas.every((c) => !("p_unidade" in c) && c.p_por_hora === false)).toBe(true);
    cenario.chamadas = [];
    await tela({ loja: OUTRA });
    expect(cenario.chamadas.every((c) => c.p_unidade === OUTRA)).toBe(true);
  });

  it("banco sem a leitura agregada: indisponível, sem número inventado", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    cenario.erroDoPainel = { code: "PGRST202" };
    const t = await tela();
    expect(t).toContain("Financeiro indisponível neste ambiente");
    expect(t).not.toContain("Vendas concluídas");
  });

  it("período sem fatos: vazio explicado, sem histórico comparável", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    cenario.painel = VAZIO;
    const t = await tela();
    expect(t).toContain("Nenhuma venda concluída no período");
    expect(t).toContain("Sem histórico para comparar com ontem até esta hora");
  });
});

describe("/financeiro/exportar", () => {
  it("gerente baixa o CSV da visão (BOM, ponto e vírgula, reais com vírgula)", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    const resposta = await exportar(new Request("http://teste/financeiro/exportar?ver=vendas"));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toContain("text/csv");
    // O BOM vai nos bytes (o Excel precisa dele); text() o remove ao decodificar.
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const conteudo = new TextDecoder().decode(bytes);
    expect(conteudo.split("\r\n")[0]).toBe("Venda;Quando;Loja;Vendedor;Total (R$);Devolvido (R$);Situação");
    expect(conteudo).toContain("101;");
    expect(conteudo).toContain(";Santa Cândida (teste);Ana Teste;158,00;79,00;concluida");
  });

  it("sem permissão: 403, sem consultar os registros", async () => {
    cenario.permissoes = new Set(["venda.registrar"]);
    const resposta = await exportar(new Request("http://teste/financeiro/exportar"));
    expect(resposta.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------------------
// Lote G2b: situação da conciliação de cartão e Pix (P5) e os registros que a explicam
// ---------------------------------------------------------------------------------------------
const SEM_CONCILIACAO = { conciliados: 0, conciliado: 0, liquido: 0 };
// O Pix de R$ 158,00 já foi conciliado (caíram R$ 154,00); os dois cartões de R$ 79,00 estão a conciliar.
const COM_CONCILIACAO = {
  ...PAINEL,
  pagamentos: [
    { meio: "cartao_picpay", situacao: "confirmado", meio_entrada: null, quantidade: 2, valor: 15_800, entrada: 0, troco: 0, ...SEM_CONCILIACAO },
    { meio: "dinheiro", situacao: "confirmado", meio_entrada: null, quantidade: 1, valor: 10_000, entrada: 0, troco: 2_100, ...SEM_CONCILIACAO },
    { meio: "pix_picpay", situacao: "confirmado", meio_entrada: null, quantidade: 1, valor: 15_800, entrada: 0, troco: 0, conciliados: 1, conciliado: 15_800, liquido: 15_400 },
  ],
};
const PAGAMENTOS = [
  { id: "p1", meio: "pix_picpay", situacao: "confirmado", valor_centavos: 15_800, entrada_centavos: 0, meio_entrada: null, criado_em: "2026-11-10T17:00:00Z",
    conciliado_em: "2026-11-10T20:00:00Z", liquidado_em: "2026-11-10", valor_liquido_centavos: 15_400, referencia_conciliacao: "EXTRATO-1", vendas: { id: "v1", numero: 101, unidade_id: LOJA } },
  { id: "p2", meio: "cartao_picpay", situacao: "confirmado", valor_centavos: 7_900, entrada_centavos: 0, meio_entrada: null, criado_em: "2026-11-10T16:00:00Z",
    conciliado_em: null, liquidado_em: null, valor_liquido_centavos: null, referencia_conciliacao: null, vendas: { id: "v2", numero: 102, unidade_id: LOJA } },
  { id: "p3", meio: "dinheiro", situacao: "confirmado", valor_centavos: 10_000, entrada_centavos: 0, meio_entrada: null, criado_em: "2026-11-10T15:00:00Z",
    conciliado_em: null, liquidado_em: null, valor_liquido_centavos: null, referencia_conciliacao: null, vendas: { id: "v3", numero: 103, unidade_id: LOJA } },
];

describe("/financeiro: conciliação de cartão e Pix (G2b)", () => {
  beforeEach(() => {
    cenario.painel = COM_CONCILIACAO;
    cenario.tabelas.venda_pagamentos = PAGAMENTOS;
  });

  it("a conciliar, conciliado e o que caiu na conta, com a diferença observada; conciliar só para quem pode", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade", "pagamento.conciliar"]);
    let t = await tela();
    for (const trecho of [
      "Conciliação de cartão e Pix", "A conciliar", "R$ 158,00", "2 pagamentos sem conferência com o extrato", "Conciliado", "1 pagamento · 50% do cartão e Pix",
      "Caiu na conta (líquido)", "R$ 154,00", "Diferença observada: R$ 4,00 (2,5% do conciliado)", "Conciliar pagamentos", "/pagamentos/conciliacao",
      "Ver os pagamentos a conciliar", "/financeiro?ver=pagamentos&situacao=a_conciliar#registros", "não a taxa do contrato",
    ]) expect(t).toContain(trecho);
    // O dinheiro não entra na conciliação.
    expect(t).not.toMatch(/Dinheiro\s+1\s+R\$ 100,00\s+R\$ 0,00/);

    cenario.permissoes = new Set(["venda.ver_unidade"]);
    t = await tela();
    expect(t).toContain("Conciliação de cartão e Pix");
    expect(t).not.toContain("Conciliar pagamentos");
  });

  it("banco sem a migration do G2b: só a conciliação fica indisponível; o resto do financeiro continua", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    cenario.painel = PAINEL;
    const t = await tela();
    expect(t).toContain("Indisponível neste ambiente");
    expect(t).toMatch(/migration\s+financeiro_conciliacao/);
    expect(t).toContain("Pagamentos registrados por meio");
    expect(t).not.toContain("Ver os pagamentos a conciliar");
  });

  it("sem cartão nem Pix no período: o vazio é explicado", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    cenario.painel = { ...COM_CONCILIACAO, pagamentos: [COM_CONCILIACAO.pagamentos[1]] };
    expect(await tela()).toContain("Nenhum pagamento de cartão ou Pix no período");
  });

  it("os registros explicam o número: a conciliar e conciliados como filtro, e a situação de cada pagamento", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    let t = await tela({ ver: "pagamentos", situacao: "a_conciliar" });
    expect(t).toMatch(/Venda\s+102/);
    expect(t).not.toMatch(/Venda\s+101/);
    expect(t).not.toMatch(/Venda\s+103/);
    expect(t).toContain("a conciliar");

    t = await tela({ ver: "pagamentos", situacao: "conciliado" });
    expect(t).toMatch(/Venda\s+101/);
    expect(t).not.toMatch(/Venda\s+102/);
    expect(t).toMatch(/R\$ 154,00\s+em\s+10\/11/);

    t = await tela({ ver: "pagamentos" });
    for (const venda of [101, 102, 103]) expect(t).toMatch(new RegExp(`Venda\\s+${venda}`));
  });

  it("a exportação dos pagamentos leva a conciliação de cada um", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    const resposta = await exportar(new Request("http://teste/financeiro/exportar?ver=pagamentos"));
    const linhas = new TextDecoder().decode(new Uint8Array(await resposta.arrayBuffer())).split("\r\n");
    expect(linhas[0]).toBe("Venda;Quando;Loja;Meio;Valor (R$);Entrada (R$);Meio da entrada;Situação;Conciliação;Dinheiro caiu em;Valor líquido (R$);Referência do extrato");
    expect(linhas[1]).toMatch(/^101;.*;Pix na maquininha PicPay;158,00;0,00;;confirmado;conciliado;10\/11\/2026;154,00;EXTRATO-1$/);
    expect(linhas[2]).toMatch(/^102;.*;Cartão na maquininha PicPay;79,00;0,00;;confirmado;a conciliar;;;$/);
    expect(linhas[3]).toMatch(/^103;.*;Dinheiro;100,00;0,00;;confirmado;;;;$/);
    // Só os a conciliar, se pedido.
    const filtrado = await exportar(new Request("http://teste/financeiro/exportar?ver=pagamentos&situacao=a_conciliar"));
    expect(new TextDecoder().decode(new Uint8Array(await filtrado.arrayBuffer())).split("\r\n").slice(1).map((l) => l.split(";")[0])).toEqual(["102"]);
  });
});

describe("pagamentos por maquininha (REPORT-005b)", () => {
  const TERMINAL = "00000000-0000-4000-8000-0000000000f1";
  it("com a leitura no banco, cada maquininha com o recebido, o conciliado, o que falta conciliar e o líquido; sem a função, o quadro some; falha aparece sem número", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade"]);
    cenario.erroDasMaquininhas = null;
    cenario.maquininhas = { unidade: null, terminais: [{
      terminal: TERMINAL, unidade: LOJA, provedor: "picpay", identificador: "PP-101", apelido: "Balcão", ativo: true,
      quantidade: 2, valor: 15_800, conciliados: 1, conciliado: 7_900, liquido: 7_600, estornados: 0, estornado: 0,
    }] };
    let t = (await tela()).replace(/\s+/g, " ");
    for (const trecho of ["Pagamentos por maquininha", "Balcão", "PicPay PP-101", "R$ 158,00", "R$ 79,00", "R$ 76,00", "2 pagamentos"]) expect(t, trecho).toContain(trecho);
    cenario.erroDasMaquininhas = { code: "PGRST202" };
    expect(await tela()).not.toContain("Pagamentos por maquininha");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    cenario.erroDasMaquininhas = { code: "57014" };
    t = await tela();
    expect(t).toContain("Pagamentos por maquininha");
    expect(t).not.toContain("PicPay PP-101");
    vi.restoreAllMocks();
  });
});

// FIN-001a (ORA-FIN-001; a ordem recomendada da auditoria do Codex de 21/11, item 6): a conta do período.
describe("/financeiro: a conta do período (FIN-001a)", () => {
  const SEM_DIFERENCA = { diferenca: 0, vendas_com_diferenca: 0, exemplos: [] };
  const FECHA = {
    vendas: 20, vendido: 428_100,
    pagamentos: { recebido_na_loja: 302_400, financiado: 109_900, vale_troca: 0, desfeitos: 15_800, ...SEM_DIFERENCA },
    caixa: { esperado: 318_200, no_livro: 318_200, ...SEM_DIFERENCA },
    estoque: { unidades: 19, no_livro: 19, ...SEM_DIFERENCA },
  };
  beforeEach(() => {
    cenario.permissoes = new Set(["venda.ver_unidade", "caixa.conferir"]);
    cenario.erroDaConferencia = null;
    cenario.conferencia = FECHA;
  });

  it("quando fecha, diz que fecha e mostra de onde vem cada lado; pede a mesma loja e o mesmo período do painel", async () => {
    const t = await tela();
    for (const trecho of [
      "A conta do período", "A conta fecha: 20 vendas, R$ 4.281,00 vendidos.",
      "O vendido (R$ 4.281,00) é a soma de: R$ 3.024,00 recebidos na loja + R$ 1.099,00 a receber das financeiras + R$ 158,00 de pagamentos de vendas canceladas depois.",
      "O que essas vendas lançaram no caixa ao serem concluídas (dinheiro, Pix, cartão, entrada do financiamento e vale-troca, com o troco descontado): R$ 3.182,00. No livro dos caixas: R$ 3.182,00.",
      "Aparelhos, chips e acessórios vendidos: 19 unidades. Saídas por venda no livro do estoque: 19 unidades. Serviço e recarga não têm estoque.",
      // O limite da conta fica dito: "fecha" não é "tudo conferido".
      "Esta conta confere o que cada venda gravou ao ser concluída.", "o estoque que voltou e o dinheiro devolvido ainda não são conferidos aqui.",
    ]) expect(t, trecho).toContain(trecho);
    expect(t).not.toContain("não fecha");
    expect(t).not.toContain("em vale-troca"); // parcela zerada não entra na frase
    expect(t).not.toContain("Isto não deveria acontecer");
    expect(cenario.chamadasDaConferencia).toHaveLength(1);
    const pedido = cenario.chamadasDaConferencia[0] ?? {};
    expect(pedido.p_unidade).toBe(LOJA);
    expect([pedido.p_inicio, pedido.p_fim]).toEqual([cenario.chamadas[0]?.p_inicio, cenario.chamadas[0]?.p_fim]);
  });

  it("quando não fecha, diz em que lado, de quanto é a diferença e quais vendas abrir; nada é corrigido sozinho", async () => {
    cenario.conferencia = {
      ...FECHA,
      pagamentos: { ...FECHA.pagamentos, diferenca: 0, vendas_com_diferenca: 2, exemplos: [{ id: "v-12", numero: 12 }, { id: "v-15", numero: 15 }] },
      estoque: { unidades: 19, no_livro: 20, diferenca: 1, vendas_com_diferenca: 1, exemplos: [{ id: "v-12", numero: 12 }] },
    };
    const t = await tela();
    for (const trecho of [
      "A conta não fecha em 2 vendas, de 20.", "Diferença de R$ 0,00 em 2 vendas.", "As vendas que não fecham:", "Diferença de 1 unidade em 1 venda.",
      "A venda que não fecha:", "Isto não deveria acontecer", "nada foi corrigido sozinho",
    ]) expect(t, trecho).toContain(trecho);
    expect(t).toMatch(/\/vendas\/v-12/);
    expect(t).toMatch(/\/vendas\/v-15/);
    expect(t).not.toContain("A conta fecha:");
  });

  it("mais vendas com diferença do que os exemplos: diz quantas faltam na lista", async () => {
    cenario.conferencia = { ...FECHA, caixa: { esperado: 318_200, no_livro: 318_000, diferenca: -200, vendas_com_diferenca: 23, exemplos: [{ id: "v-1", numero: 1 }, { id: "v-2", numero: 2 }] } };
    const t = await tela();
    expect(t).toContain("Diferença de R$ 2,00 em 23 vendas.");
    expect(t).toContain("e mais 21");
  });

  it("sem venda no período: nada a conferir; falha de leitura nunca vira \"fecha\"; o banco sem a função não mostra o cartão", async () => {
    cenario.conferencia = { vendas: 0, vendido: 0, pagamentos: { recebido_na_loja: 0, financiado: 0, vale_troca: 0, desfeitos: 0, ...SEM_DIFERENCA },
      caixa: { esperado: 0, no_livro: 0, ...SEM_DIFERENCA }, estoque: { unidades: 0, no_livro: 0, ...SEM_DIFERENCA } };
    const semVenda = await tela();
    expect(semVenda).toContain("Nenhuma venda concluída no período: não há o que conferir.");
    expect(semVenda).not.toContain("Esta conta confere o que cada venda gravou");

    for (const quebrado of [{ code: "57014" }, { code: "42501" }]) {
      cenario.erroDaConferencia = quebrado;
      const t = await tela();
      expect(t).toContain("Não deu para conferir a conta do período agora.");
      expect(t).not.toContain("A conta fecha");
      expect(t).toContain("Vendas concluídas"); // o resto da tela continua
    }
    cenario.erroDaConferencia = null;
    cenario.conferencia = { ...FECHA, estoque: { unidades: "19" } };
    expect(await tela()).toContain("Não deu para conferir a conta do período agora.");

    cenario.erroDaConferencia = { code: "PGRST202" };
    const semFuncao = await tela();
    expect(semFuncao).not.toContain("A conta do período");
    expect(semFuncao).toContain("Vendas concluídas");
  });

  it("o dono que escolhe a rede confere a rede inteira (sem a loja no pedido)", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade", "venda.ver_todas", "caixa.conferir"]);
    await tela({ loja: "rede" });
    expect(cenario.chamadasDaConferencia).toHaveLength(1);
    expect("p_unidade" in (cenario.chamadasDaConferencia[0] ?? {})).toBe(false);
  });

  it("o cartão do que ainda não é real não diz mais que a conciliação por arquivo não existe", async () => {
    const t = await tela();
    expect(t).toContain("Conciliação sem arquivo (direto do banco e da maquininha)");
    expect(t).toContain("a conciliação pelo arquivo do extrato já existe");
    expect(t).not.toContain("Conciliação automática com extratos");
  });
});

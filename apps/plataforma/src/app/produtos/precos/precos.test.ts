// Preços da variação (L3b) montados com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma
// rede. Confere permissão, o que vale em cada loja, agendados, histórico e o que as ações mandam ao
// banco. As regras do banco estão provadas em packages/banco/src/precos.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const DONO = "00000000-0000-4000-8000-0000000000aa";
const PRODUTO = "00000000-0000-4000-9000-000000000020";
const VARIANTE = "00000000-0000-4000-9000-000000000030";
const PRECO = "00000000-0000-4000-9000-000000000040";
const CAMPANHA = "00000000-0000-4000-9000-000000000041";
const AGENDADO = "00000000-0000-4000-9000-000000000042";

const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  errosDasTabelas: {} as Record<string, { code: string }>,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  erro: { code: string } | null;
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; this.erro = cenario.errosDasTabelas[nome] ?? null; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Record<string, unknown>[] | null; error: { code: string } | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
  get molde() { return { permissoes: { has: (p: string) => Boolean(cenario.permissoes.has(p)) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  usuario: { id: DONO },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-11T23:00:00Z" },
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
      cenario.chamadas.push({ nome, argumentos });
      if (nome === "precos_por_loja") {
        return argumentos.p_canal === "loja"
          ? { data: [
              { unidade_id: LOJA, unidade: "Santa Cândida (teste)", valor_centavos: "119990", origem: "campanha", de_loja: false, preco_id: CAMPANHA, fim: "2099-12-01T02:59:00Z" },
              { unidade_id: OUTRA, unidade: "Loja 02 (teste)", valor_centavos: null, origem: null, de_loja: null, preco_id: null, fim: null },
            ], error: null }
          : { data: [{ unidade_id: LOJA, unidade: "Santa Cândida (teste)", valor_centavos: "124990", origem: "manual", de_loja: false, preco_id: PRECO, fim: null }], error: null };
      }
      return cenario.respostas[nome] ?? { data: null, error: null };
    },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { horaDeSaoPauloParaIso, isoParaHoraDeSaoPaulo } from "../../../lib/lojas/regras";
import { cancelarPreco, corrigirCusto, criarCampanha, definirPreco } from "./acoes";
import PrecosDaVariante from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && ["Alcance", "CartaoDoCusto"].includes(v.type.name)) return texto((v.type as (p: unknown) => unknown)(v.props));
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string> = {}) =>
  texto(await PrecosDaVariante({ searchParams: Promise.resolve(parametros) }) as ReactElement).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  cenario.permissoes = new Set();
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.errosDasTabelas = {};
  cenario.tabelas = {
    variantes: [{ id: VARIANTE, sku: "APA-TESTE", nome: "Galaxy Teste 128 GB", produto_id: PRODUTO, produtos: { nome: "Galaxy Teste" } }],
    precos: [
      { id: AGENDADO, unidade_id: null, canal: "loja", valor_centavos: "134990", inicio: "2099-01-01T03:00:00Z", fim: null, origem: "manual", motivo: "Reajuste programado", criado_em: "2026-11-11T12:00:00Z", cancelado_em: null, motivo_cancelamento: null },
      { id: CAMPANHA, unidade_id: null, canal: "loja", valor_centavos: "119990", inicio: "2026-11-01T03:00:00Z", fim: "2099-12-01T02:59:00Z", origem: "campanha", motivo: "Black Friday", criado_em: "2026-11-01T12:00:00Z", cancelado_em: null, motivo_cancelamento: null },
      { id: PRECO, unidade_id: null, canal: "loja", valor_centavos: "129990", inicio: "2026-10-01T03:00:00Z", fim: null, origem: "importacao", motivo: null, criado_em: "2026-10-01T12:00:00Z", cancelado_em: null, motivo_cancelamento: null },
      { id: "00000000-0000-4000-9000-000000000043", unidade_id: OUTRA, canal: "loja", valor_centavos: "99990", inicio: "2026-11-20T03:00:00Z", fim: null, origem: "manual", motivo: "Erro", criado_em: "2026-11-10T12:00:00Z", cancelado_em: "2026-11-10T13:00:00Z", motivo_cancelamento: "Lançado por engano" },
    ],
  };
});

describe("/produtos/precos", () => {
  it("sem catalogo.gerir nem preco.alterar: sem permissão e sem consultar preços", async () => {
    cenario.permissoes = new Set(["venda.registrar"]);
    expect(await tela({ variante: VARIANTE })).toContain("Sem permissão");
    expect(cenario.chamadas).toEqual([]);
  });

  it("sem variação válida no endereço: pede para escolher pelo cadastro", async () => {
    cenario.permissoes = new Set(["catalogo.gerir"]);
    expect(await tela({ variante: "x" })).toContain("Escolha uma variação");
  });

  it("administrador (só catálogo): vê o que vale em cada loja e o histórico, sem formulários de preço", async () => {
    cenario.permissoes = new Set(["catalogo.gerir"]);
    const t = await tela({ variante: VARIANTE });
    for (const trecho of ["Preços · Galaxy Teste 128 GB", "APA-TESTE", "R$ 1.199,90", "campanha até", "sem preço", "online: R$ 1.249,90", "Black Friday", "cancelado", "Lançado por engano", "agendado"]) {
      expect(t).toContain(trecho);
    }
    expect(t).toContain("Só quem altera preços");
    expect(t).not.toContain("Gravar preço");
    expect(t).not.toContain("Encerrar a campanha agora");
  });

  it("dono (altera preço): formulários e o que ainda dá para desfazer", async () => {
    cenario.permissoes = new Set(["catalogo.gerir", "preco.alterar"]);
    const t = await tela({ variante: VARIANTE });
    for (const trecho of ["Gravar preço", "Gravar campanha", "Cancelar (ainda não começou)", "Encerrar a campanha agora", "Só na loja Loja 02 (teste)"]) expect(t).toContain(trecho);
  });
});

describe("ações de preço", () => {
  it("preço da rede agora: sem loja e sem início; formulário inválido não chama o banco", async () => {
    cenario.respostas.preco_definir = { data: { id: PRECO, repetida: false }, error: null };
    expect(await destinoDe(definirPreco(formulario({ variante: VARIANTE, unidade: "rede", canal: "loja", valor: "1.299,90", quando: "agora", motivo: "Reajuste" }))))
      .toBe(`/produtos/precos?variante=${VARIANTE}&ok=definido`);
    expect(cenario.chamadas[0]?.argumentos).toEqual({ p_variante: VARIANTE, p_unidade: null, p_canal: "loja", p_valor: 129_990, p_inicio: null, p_motivo: "Reajuste" });
    cenario.chamadas = [];
    expect(await destinoDe(definirPreco(formulario({ variante: VARIANTE, unidade: "rede", canal: "loja", valor: "abc", quando: "agora", motivo: "Reajuste" }))))
      .toBe(`/produtos/precos?variante=${VARIANTE}&erro=valor&form=preco`);
    expect(cenario.chamadas).toEqual([]);
  });

  it("agendamento repetido e conflito viram mensagens do catálogo", async () => {
    cenario.respostas.preco_definir = { data: null, error: { code: "OR022", message: "Já há mudança de preço agendada" } };
    expect(await destinoDe(definirPreco(formulario({ variante: VARIANTE, unidade: LOJA, canal: "online", valor: "10", quando: "data", inicio: "2099-01-02T08:00", motivo: "Reajuste" }))))
      .toBe(`/produtos/precos?variante=${VARIANTE}&erro=agendada&form=preco`);
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_unidade: LOJA, p_canal: "online", p_inicio: "2099-01-02T11:00:00.000Z" });
  });

  it("campanha manda o fim em horário de São Paulo; encerrar e cancelar voltam com a mensagem certa", async () => {
    cenario.respostas.preco_campanha = { data: { id: CAMPANHA, repetida: false }, error: null };
    // Fim daqui a 20 dias, digitado como no campo (hora de São Paulo); a campanha dura no máximo um ano.
    const fim = isoParaHoraDeSaoPaulo(new Date(Date.now() + 20 * 86_400_000).toISOString());
    expect(await destinoDe(criarCampanha(formulario({ variante: VARIANTE, unidade: "rede", canal: "loja", valor: "1.199,90", quando: "agora", fim, motivo: "Black Friday" }))))
      .toBe(`/produtos/precos?variante=${VARIANTE}&ok=campanha`);
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_inicio: null, p_fim: horaDeSaoPauloParaIso(fim), p_valor: 119_990 });
    cenario.respostas.preco_cancelar = { data: "encerrado", error: null };
    expect(await destinoDe(cancelarPreco(formulario({ preco: CAMPANHA, variante: VARIANTE, motivo: "Estoque acabou" })))).toBe(`/produtos/precos?variante=${VARIANTE}&ok=encerrado`);
    cenario.respostas.preco_cancelar = { data: null, error: { code: "22023", message: "Este preço já valeu: para mudar, defina um preço novo" } };
    expect(await destinoDe(cancelarPreco(formulario({ preco: PRECO, variante: VARIANTE, motivo: "Tentativa" })))).toBe(`/produtos/precos?variante=${VARIANTE}&erro=ja_valeu`);
  });
});

// ---------------------------------------------------------------------------------------------
// CAT-008b: o custo da variação e a correção com motivo
// ---------------------------------------------------------------------------------------------
const CUSTOS = [
  { id: "00000000-0000-4000-9000-000000000051", valor_centavos: "2050", inicio: "2026-11-15T13:00:00Z", origem: "correcao", referencia: "Nota com desconto" },
  { id: "00000000-0000-4000-9000-000000000052", valor_centavos: 2000, inicio: "2026-11-14T13:00:00Z", origem: "estorno", referencia: "estorno:entrada:12" },
  { id: "00000000-0000-4000-9000-000000000053", valor_centavos: 2500, inicio: "2026-11-13T13:00:00Z", origem: "entrada", referencia: "entrada:12:1" },
  { id: "00000000-0000-4000-9000-000000000054", valor_centavos: 2000, inicio: "2026-10-01T13:00:00Z", origem: "importacao", referencia: "importacao:3:7" },
];

describe("/produtos/precos: o custo da variação (CAT-008b)", () => {
  it("quem cadastra o catálogo e vê custo: o custo atual, de onde veio cada um e a correção com motivo", async () => {
    cenario.permissoes = new Set(["catalogo.gerir", "custo.ver"]);
    cenario.tabelas.custos = CUSTOS;
    const t = await tela({ variante: VARIANTE });
    for (const trecho of [
      "R$ 20,50", "desde 15/11/2026 10:00 · correção (Nota com desconto)", "estorno da entrada (entrada nº 12 estornada) · de 14/11/2026 10:00",
      "R$ 25,00", "entrada de mercadoria (entrada nº 12) · de 13/11/2026 10:00", "importação da planilha (importação nº 3) · de 01/10/2026 10:00", "Corrigir o custo", "Gravar o custo",
    ]) expect(t).toContain(trecho);
  });

  it("sem custo.ver, nada do custo nem a leitura; quem só altera preço vê o custo sem corrigir; sem custo e falha de leitura", async () => {
    cenario.permissoes = new Set(["catalogo.gerir"]);
    cenario.tabelas.custos = CUSTOS;
    expect(await tela({ variante: VARIANTE })).not.toContain("Vale o último custo gravado");
    cenario.permissoes = new Set(["preco.alterar", "custo.ver"]);
    let t = await tela({ variante: VARIANTE });
    expect(t).toContain("R$ 20,50");
    expect(t).not.toContain("Gravar o custo");
    cenario.tabelas.custos = [];
    expect(await tela({ variante: VARIANTE })).toContain("Sem custo gravado");
    cenario.errosDasTabelas.custos = { code: "57014" };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    t = await tela({ variante: VARIANTE });
    expect(t).toContain("Não deu para ler o custo agora");
    expect(t).not.toContain("Sem custo gravado");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["catálogo: falha ao ler o custo da variação", { codigo: "57014" }]);
  });

  it("corrigir manda a variação, o custo em centavos e o motivo; a resposta do banco escolhe a mensagem, e a tela a mostra", async () => {
    cenario.respostas.custo_corrigir = { data: true, error: null };
    expect(await destinoDe(corrigirCusto(formulario({ variante: VARIANTE, valor: "20,50", motivo: " Nota com  desconto " }))))
      .toBe(`/produtos/precos?variante=${VARIANTE}&ok=custo_corrigido`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "custo_corrigir", argumentos: { p_variante: VARIANTE, p_valor_centavos: 2_050, p_motivo: "Nota com desconto" } });
    cenario.respostas.custo_corrigir = { data: false, error: null };
    expect(await destinoDe(corrigirCusto(formulario({ variante: VARIANTE, valor: "0,00", motivo: "Brinde do fornecedor" })))).toBe(`/produtos/precos?variante=${VARIANTE}&ok=custo_sem_mudanca`);
    expect(cenario.chamadas.at(-1)?.argumentos.p_valor_centavos).toBe(0);
    for (const [erro, chave] of [
      [{ code: "P0002", message: "Variação não encontrada para você" }, "custo_permissao"], [{ code: "PGRST202", message: "" }, "custo_indisponivel"],
      [{ code: "22023", message: "O motivo tem até 300 letras" }, "custo_motivo"], [{ code: "57014", message: "" }, "custo_falha"],
    ] as const) {
      cenario.respostas.custo_corrigir = { data: null, error: { ...erro } };
      expect(await destinoDe(corrigirCusto(formulario({ variante: VARIANTE, valor: "20,50", motivo: "Tentativa" }))), erro.code).toBe(`/produtos/precos?variante=${VARIANTE}&erro=${chave}&form=custo`);
    }
    const antes = cenario.chamadas.length;
    for (const [campos, chave] of [
      [{ valor: "abc", motivo: "Tentativa" }, "custo_valor"], [{ valor: "1.000.000,01", motivo: "Tentativa" }, "custo_valor"], [{ valor: "-1", motivo: "Tentativa" }, "custo_valor"],
      [{ valor: "20,50", motivo: "x" }, "custo_motivo"],
    ] as const) {
      expect(await destinoDe(corrigirCusto(formulario({ variante: VARIANTE, ...campos }))), chave).toBe(`/produtos/precos?variante=${VARIANTE}&erro=${chave}&form=custo`);
    }
    expect(await destinoDe(corrigirCusto(formulario({ variante: "x", valor: "20,50", motivo: "Tentativa" })))).toBe("/produtos");
    expect(cenario.chamadas).toHaveLength(antes);
    cenario.permissoes = new Set(["catalogo.gerir", "custo.ver"]);
    expect(await tela({ variante: VARIANTE, erro: "custo_permissao", form: "custo" })).toContain("Só o dono e o administrador corrigem o custo");
  });
});

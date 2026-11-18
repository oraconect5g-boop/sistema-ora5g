// /caixa, saída autorizada (lote L7c), com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados
// fictícios. O que cada pessoa vê (quem pede, quem autoriza), o que a tela mostra em cada estado (sem a
// tabela no banco, falha de leitura, nomes não lidos) e o que as ações mandam ao banco. As regras do banco
// estão em packages/banco/src/caixa-saida.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const ANA = "00000000-0000-4000-8000-0000000000a1";
const GERENTE = "00000000-0000-4000-8000-0000000000f0";
const CAIXA_DA_ANA = "00000000-0000-4000-9000-0000000000c1";
const CAIXA_DO_GERENTE = "00000000-0000-4000-9000-0000000000c2";
const CAIXA_DE_FORA = "00000000-0000-4000-9000-0000000000c3";
const S1 = "00000000-0000-4000-9000-0000000000e1";
const S2 = "00000000-0000-4000-9000-0000000000e2";
const S3 = "00000000-0000-4000-9000-0000000000e3";
const S4 = "00000000-0000-4000-9000-0000000000e4";

type Linha = Record<string, unknown>;
type Erro = { code: string; message?: string };
const cenario = vi.hoisted(() => ({
  usuario: "",
  confere: false,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  errosDasTabelas: {} as Record<string, { code: string }>,
  /** Filtros de cada leitura: "tabela coluna=valor". */
  filtros: [] as string[],
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Linha[];
  erro: Erro | null;
  constructor(readonly tabela: string) {
    this.linhas = [...(cenario.tabelas[tabela] ?? [])];
    this.erro = cenario.errosDasTabelas[tabela] ?? null;
  }
  select() { return this; }
  eq(coluna: string, valor: unknown) {
    cenario.filtros.push(`${this.tabela} ${coluna}=${String(valor)}`);
    this.linhas = this.linhas.filter((l) => l[coluna] === valor);
    return this;
  }
  in(coluna: string, valores: unknown[]) {
    cenario.filtros.push(`${this.tabela} ${coluna} em ${valores.length}`);
    this.linhas = this.linhas.filter((l) => valores.includes(l[coluna]));
    return this;
  }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Linha[] | null; error: Erro | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas, error: null }).then(resolver);
  }
}
const supabase = {
  from: (tabela: string) => new Consulta(tabela),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: argumentos.p_permissao === "caixa.conferir" && cenario.confere, error: null };
    cenario.chamadas.push({ nome, argumentos });
    return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
    molde: { permissoes: { has: (p: string) => Boolean(p === "caixa.conferir" && cenario.confere) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
    usuario: { id: cenario.usuario },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-13T23:00:00Z" },
    supabase,
  }),
}));

import { ERROS_DA_SAIDA } from "../../lib/caixa/saidas";
import { cancelarSaida, decidirSaida, pedirSaida } from "./acoes";
import Caixa from "./page";

// ---------------------------------------------------------------------------------------------
// Leitura da árvore: só os quadros das saídas (componentes desta página) são executados.
// ---------------------------------------------------------------------------------------------
const LOCAIS = new Set(["MinhasSaidas", "SaidasParaAutorizar"]);
const executar = (x: ReactElement<Linha>) => (x.type as (p: unknown) => unknown)(x.props);
const local = (x: ReactElement<Linha>) => typeof x.type === "function" && LOCAIS.has(x.type.name);
function visivel(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      if (local(x)) andar(executar(x));
      else if (typeof x.type === "string") andar(x.props.children);
      else andar(typeof x.type === "function" && x.type.name === "MoldeReal" ? x.props.children : [x.props.titulo, x.props.subtitulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
function percorrer(v: unknown, visitar: (x: ReactElement<Linha>) => void) {
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (isValidElement<Linha>(x)) {
      visitar(x);
      if (local(x)) andar(executar(x));
      else andar(Object.values(x.props));
    }
  };
  andar(v);
}
/** Os cartões, na ordem da tela. */
function cartoes(v: unknown): string[] {
  const titulos: string[] = [];
  percorrer(v, (x) => { if (typeof x.type === "function" && x.type.name === "Cartao") titulos.push(String(x.props.titulo)); });
  return titulos;
}
/** Os formulários: nome da ação e campos escondidos. */
function formularios(v: unknown): { acao: string; campos: Record<string, string> }[] {
  const achados: { acao: string; campos: Record<string, string> }[] = [];
  percorrer(v, (x) => {
    if (x.type !== "form") return;
    const campos: Record<string, string> = {};
    percorrer(x.props.children, (y) => { if (y.type === "input" && y.props.type === "hidden") campos[String(y.props.name)] = String(y.props.value); });
    achados.push({ acao: (x.props.action as { name: string }).name, campos });
  });
  return achados;
}
const pagina = async (parametros: Record<string, string> = {}) => (await Caixa({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

const saida = (id: string, caixa: string, pedidaPor: string, situacao: string, extra: Linha = {}) => ({
  id, caixa_id: caixa, unidade_id: LOJA, valor_centavos: 3_000, motivo: "Pagar o motoboy", pedida_por: pedidaPor,
  pedida_em: "2026-11-13T17:05:00Z", situacao, motivo_decisao: null, decidida_em: null, ...extra,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, {
    usuario: ANA, confere: false, errosDasTabelas: {}, filtros: [], chamadas: [], respostas: {},
    tabelas: {
      caixas: [
        { id: CAIXA_DA_ANA, operador_id: ANA, unidade_id: LOJA, situacao: "aberto", aberto_em: "2026-11-13T12:00:00Z", fundo_centavos: 10_000 },
        { id: CAIXA_DO_GERENTE, operador_id: GERENTE, unidade_id: LOJA, situacao: "aberto", aberto_em: "2026-11-13T12:00:00Z", fundo_centavos: 5_000 },
      ],
      caixa_movimentos: [
        { caixa_id: CAIXA_DA_ANA, tipo: "fundo", meio: "dinheiro", valor_centavos: 10_000 },
        { caixa_id: CAIXA_DA_ANA, tipo: "saida_autorizada", meio: "dinheiro", valor_centavos: -2_000 },
      ],
      caixa_saidas: [
        saida(S1, CAIXA_DA_ANA, ANA, "pendente"),
        saida(S2, CAIXA_DA_ANA, ANA, "negada", { valor_centavos: 1_500, motivo: "Lanche da equipe", motivo_decisao: "Não é despesa da loja", decidida_em: "2026-11-13T16:00:00Z" }),
        saida(S3, CAIXA_DO_GERENTE, GERENTE, "pendente", { valor_centavos: 4_000, motivo: "Compra de material de limpeza" }),
        { ...saida(S4, CAIXA_DE_FORA, ANA, "pendente"), unidade_id: OUTRA },
      ],
      perfis_usuario: [{ id: ANA, nome: "Ana Teste" }, { id: GERENTE, nome: "Gerente Teste" }],
    },
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("/caixa: quem está com o caixa aberto pede a saída (L7c)", () => {
  it("pede com valor e motivo e acompanha os pedidos deste caixa: o pendente pode ser cancelado, o negado mostra o motivo", async () => {
    const tela = await pagina();
    const t = visivel(tela);
    expect(t).toContain("Saída de dinheiro");
    expect(t).toContain("O gerente ou o dono autoriza.");
    expect(t).toContain("Retire o dinheiro da gaveta só depois de autorizado");
    expect(t).toContain("R$ 30,00 · Pagar o motoboy aguardando autorização Cancelar");
    expect(t).toContain("R$ 15,00 · Lanche da equipe Motivo de negar: Não é despesa da loja negada");
    // A gaveta já desconta a saída autorizada.
    expect(t).toContain("Dinheiro R$ 80,00");
    expect(t).toContain("− saídas autorizadas");
    // O pedido pendente avisa no fechamento.
    expect(t).toContain("Há 1 pedido de saída aguardando autorização: depois de fechar o caixa, ele não pode mais ser autorizado.");
    expect(formularios(tela).map((f) => f.acao)).toEqual(["movimentarCaixa", "pedirSaida", "cancelarSaida", "fecharCaixa"]);
    expect(formularios(tela).find((f) => f.acao === "cancelarSaida")?.campos).toEqual({ saida: S1 });
    // A vendedora não autoriza: o quadro de autorizar nem é lido.
    expect(cartoes(tela)).toEqual(["Meu caixa aberto", "Suprimento ou sangria", "Saída de dinheiro", "Fechar caixa"]);
    expect(cenario.filtros.filter((f) => f.startsWith("caixa_saidas"))).toEqual([`caixa_saidas caixa_id=${CAIXA_DA_ANA}`]);
  });

  it("as mensagens das ações aparecem no topo; parâmetro desconhecido não mostra nada", async () => {
    expect(visivel(await pagina({ saida: "pedida" }))).toContain("Pedido de saída enviado: o gerente ou o dono autoriza.");
    expect(visivel(await pagina({ erro_saida: "acima" }))).toContain("A saída passa do dinheiro que há no caixa.");
    const t = visivel(await pagina({ saida: "__proto__", erro_saida: "toString" }));
    expect(t).not.toContain("Pedido de saída enviado");
    expect(t).not.toContain("Confira os dados");
  });
});

describe("/caixa: o gerente ou o dono autoriza (L7c)", () => {
  beforeEach(() => {
    cenario.usuario = GERENTE;
    cenario.confere = true;
  });

  it("vê os pendentes da loja com quem pediu e quando; autoriza ou nega com motivo; no próprio pedido não há botão", async () => {
    cenario.tabelas.caixas = cenario.tabelas.caixas?.filter((c) => c.operador_id !== GERENTE) ?? [];
    const tela = await pagina();
    const t = visivel(tela);
    expect(t).toContain("Saídas para autorizar");
    expect(t).toContain("R$ 30,00 Ana Teste · 13/11, 14:05 Pagar o motoboy Autorizar Motivo para negar Negar");
    expect(t).toContain("R$ 40,00 Gerente Teste · 13/11, 14:05 Compra de material de limpeza Seu pedido: outra pessoa (gerente ou dono) autoriza.");
    // Só os pendentes desta loja: o da outra loja e o negado não aparecem.
    expect(t).not.toContain("Lanche da equipe");
    expect(cenario.filtros).toEqual(expect.arrayContaining([`caixa_saidas unidade_id=${LOJA}`, "caixa_saidas situacao=pendente", "perfis_usuario id em 2"]));
    expect(formularios(tela).filter((f) => f.acao === "decidirSaida").map((f) => f.campos)).toEqual([
      { saida: S1, decisao: "autorizar" }, { saida: S1, decisao: "negar" },
    ]);
    // Alguém espera no balcão: o quadro de autorizar vem antes de tudo.
    expect(cartoes(tela)).toEqual(["Saídas para autorizar", "Abrir caixa", "Caixas fechados para conferir"]);
  });

  it("só o próprio pedido pendente: o quadro fica no lugar de sempre, depois do caixa", async () => {
    cenario.tabelas.caixa_saidas = cenario.tabelas.caixa_saidas?.filter((s) => s.pedida_por === GERENTE) ?? [];
    const tela = await pagina();
    expect(cartoes(tela)).toEqual(["Meu caixa aberto", "Suprimento ou sangria", "Saída de dinheiro", "Fechar caixa", "Saídas para autorizar", "Caixas fechados para conferir"]);
    expect(formularios(tela).filter((f) => f.acao === "decidirSaida")).toEqual([]);
  });

  it("nome de quem pediu não lido: o pedido aparece sem nome inventado", async () => {
    cenario.errosDasTabelas.perfis_usuario = { code: "57014" };
    const t = visivel(await pagina());
    expect(t).toContain("R$ 30,00 nome indisponível · 13/11, 14:05");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["caixa: falha ao ler os nomes de quem pediu saída", { codigo: "57014" }]);
  });
});

describe("/caixa: banco sem a saída autorizada ou com falha", () => {
  it("tabela ausente (migration do L7c não aplicada): o caixa segue igual e os quadros dizem que a função não está disponível", async () => {
    cenario.usuario = GERENTE;
    cenario.confere = true;
    cenario.errosDasTabelas.caixa_saidas = { code: "PGRST205" };
    const tela = await pagina();
    const t = visivel(tela);
    expect(t.split(ERROS_DA_SAIDA.indisponivel).length - 1).toBe(2);
    expect(t).toContain("Meu caixa aberto");
    expect(formularios(tela).map((f) => f.acao)).toEqual(["movimentarCaixa", "fecharCaixa"]);
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
  });

  it("falha de leitura: aviso no lugar da lista, nunca lista vazia, e o registro leva só o código", async () => {
    cenario.usuario = GERENTE;
    cenario.confere = true;
    cenario.errosDasTabelas.caixa_saidas = { code: "57014" };
    const tela = await pagina();
    const t = visivel(tela);
    expect(t.split("Não deu para ler os pedidos de saída agora").length - 1).toBe(2);
    expect(t).not.toContain("Nenhum pedido de saída esperando autorização");
    // Pedir continua possível: a leitura falhou, a função existe.
    expect(formularios(tela).map((f) => f.acao)).toContain("pedirSaida");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["caixa: falha ao ler os pedidos de saída", { codigo: "57014" }]);
  });

  it("pedido em forma inesperada é falha, não lista vazia", async () => {
    cenario.tabelas.caixa_saidas = [{ ...saida(S1, CAIXA_DA_ANA, ANA, "pendente"), situacao: "aprovada" }];
    expect(visivel(await pagina())).toContain("Não deu para ler os pedidos de saída agora");
    cenario.tabelas.caixa_saidas = [{ ...saida(S1, CAIXA_DA_ANA, ANA, "pendente"), valor_centavos: 1.5 }];
    expect(visivel(await pagina())).toContain("Não deu para ler os pedidos de saída agora");
  });
});

describe("ações da saída autorizada", () => {
  it("pedir: valor e motivo conferidos antes do banco; a chave do formulário vai junto", async () => {
    const chave = "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
    cenario.respostas.caixa_pedir_saida = { data: S1, error: null };
    expect(await destinoDe(pedirSaida(formulario({ valor: "30,00", motivo: "  Pagar   o motoboy ", chave })))).toBe("/caixa?saida=pedida");
    expect(cenario.chamadas).toEqual([{ nome: "caixa_pedir_saida", argumentos: { p_valor: 3_000, p_motivo: "Pagar o motoboy", p_chave: chave } }]);
    cenario.chamadas = [];
    expect(await destinoDe(pedirSaida(formulario({ valor: "0", motivo: "Pagar o motoboy", chave })))).toBe("/caixa?erro_saida=valor");
    expect(await destinoDe(pedirSaida(formulario({ valor: "trinta", motivo: "Pagar o motoboy", chave })))).toBe("/caixa?erro_saida=valor");
    expect(await destinoDe(pedirSaida(formulario({ valor: "30,00", motivo: "ok", chave })))).toBe("/caixa?erro_saida=motivo");
    expect(await destinoDe(pedirSaida(formulario({ valor: "30,00", motivo: "x".repeat(201), chave })))).toBe("/caixa?erro_saida=motivo");
    expect(cenario.chamadas).toEqual([]);
  });

  it("pedir: chave inválida no formulário vira uma nova; os erros do banco viram mensagem", async () => {
    cenario.respostas.caixa_pedir_saida = { data: S1, error: null };
    await destinoDe(pedirSaida(formulario({ valor: "30", motivo: "Pagar o motoboy", chave: "repetida" })));
    expect(String(cenario.chamadas[0]?.argumentos.p_chave)).toMatch(/^[0-9a-f-]{36}$/);
    const casos: [Erro, string][] = [
      [{ code: "23514", message: "A saída passa do dinheiro que há no caixa" }, "acima"],
      [{ code: "OR008", message: "Nenhum caixa aberto" }, "sem_caixa"],
      [{ code: "42501", message: "Sem permissão para mexer em caixa nesta loja" }, "permissao"],
      [{ code: "OR004", message: "Chave de idempotência já usada em outra operação" }, "dados"],
      [{ code: "PGRST202" }, "indisponivel"],
      [{ code: "57014" }, "falha"],
    ];
    for (const [erro, chave] of casos) {
      cenario.respostas.caixa_pedir_saida = { data: null, error: erro };
      expect(await destinoDe(pedirSaida(formulario({ valor: "30", motivo: "Pagar o motoboy" })))).toBe(`/caixa?erro_saida=${chave}`);
    }
  });

  it("decidir: autorizar vai sem motivo; negar exige motivo antes do banco; a resposta do banco escolhe a mensagem", async () => {
    cenario.respostas.caixa_decidir_saida = { data: "autorizada", error: null };
    expect(await destinoDe(decidirSaida(formulario({ saida: S1, decisao: "autorizar" })))).toBe("/caixa?saida=autorizada");
    expect(cenario.chamadas).toEqual([{ nome: "caixa_decidir_saida", argumentos: { p_saida: S1, p_autorizar: true, p_motivo: null } }]);
    cenario.chamadas = [];
    expect(await destinoDe(decidirSaida(formulario({ saida: S1, decisao: "negar", motivo: " " })))).toBe("/caixa?erro_saida=motivo_negar");
    expect(await destinoDe(decidirSaida(formulario({ saida: "1", decisao: "autorizar" })))).toBe("/caixa?erro_saida=dados");
    expect(await destinoDe(decidirSaida(formulario({ saida: S1, decisao: "aprovar" })))).toBe("/caixa?erro_saida=dados");
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.caixa_decidir_saida = { data: "negada", error: null };
    expect(await destinoDe(decidirSaida(formulario({ saida: S1, decisao: "negar", motivo: "Não é despesa da loja" })))).toBe("/caixa?saida=negada");
    expect(cenario.chamadas).toEqual([{ nome: "caixa_decidir_saida", argumentos: { p_saida: S1, p_autorizar: false, p_motivo: "Não é despesa da loja" } }]);
    const casos: [Erro, string][] = [
      [{ code: "42501", message: "Quem pediu a saída não autoriza a própria saída" }, "propria"],
      [{ code: "P0002", message: "Pedido de saída não encontrado para você" }, "nao_encontrado"],
      [{ code: "22023", message: "Pedido de saída já decidido" }, "decidida"],
      [{ code: "22023", message: "O caixa já foi fechado: negue o pedido ou peça de novo num caixa aberto" }, "fechado"],
      [{ code: "22023", message: "Diga o motivo de negar a saída" }, "motivo_negar"],
      [{ code: "23514", message: "A saída passa do dinheiro que há no caixa" }, "acima"],
    ];
    for (const [erro, chave] of casos) {
      cenario.respostas.caixa_decidir_saida = { data: null, error: erro };
      expect(await destinoDe(decidirSaida(formulario({ saida: S1, decisao: "autorizar" })))).toBe(`/caixa?erro_saida=${chave}`);
    }
  });

  it("cancelar: só o pedido ainda pendente; o já decidido avisa", async () => {
    cenario.respostas.caixa_cancelar_saida = { data: true, error: null };
    expect(await destinoDe(cancelarSaida(formulario({ saida: S1 })))).toBe("/caixa?saida=cancelada");
    expect(cenario.chamadas).toEqual([{ nome: "caixa_cancelar_saida", argumentos: { p_saida: S1 } }]);
    cenario.respostas.caixa_cancelar_saida = { data: false, error: null };
    expect(await destinoDe(cancelarSaida(formulario({ saida: S1 })))).toBe("/caixa?erro_saida=decidida");
    cenario.respostas.caixa_cancelar_saida = { data: null, error: { code: "P0002", message: "Pedido de saída não encontrado para você" } };
    expect(await destinoDe(cancelarSaida(formulario({ saida: S1 })))).toBe("/caixa?erro_saida=nao_encontrado");
    cenario.chamadas = [];
    expect(await destinoDe(cancelarSaida(formulario({ saida: "x" })))).toBe("/caixa?erro_saida=dados");
    expect(cenario.chamadas).toEqual([]);
  });
});

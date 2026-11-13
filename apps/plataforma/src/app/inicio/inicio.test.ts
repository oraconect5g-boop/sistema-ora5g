// Início real (lote G1) com sessão e Supabase simulados. Confere, por perfil, QUAIS perguntas vão ao
// banco (loja, vendedor, janela atual e anterior) e o que a tela mostra em cada estado: com fatos,
// sem movimentação, sem histórico comparável, fonte indisponível, falha de consulta e sem permissão.
// Dados fictícios. A soma no banco está provada em packages/banco/src/vendas-painel.test.ts e as
// regras puras em src/lib/inicio/painel.test.ts. A jornada no navegador, com login, fica no lote J1.
// Lote G2a: o indicador da margem bruta, pedido só para quem tem custo.ver e nunca na visão do
// vendedor (a soma da margem está provada em packages/banco/src/margem-painel.test.ts).
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lerPainel, resumoDoPainel } from "../../lib/financeiro/painel";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const SEM_VENDA = "00000000-0000-4000-8000-0000000000ee";
const DEFEITOS = "00000000-0000-4000-8000-0000000000d0";
const ANA = "00000000-0000-4000-8000-0000000000a1";
const BETO = "00000000-0000-4000-8000-0000000000b2";
const CAIO = "00000000-0000-4000-8000-0000000000c3";
const GESTOR = "00000000-0000-4000-8000-0000000000f0";
// 15h30 em São Paulo (o Brasil não tem horário de verão): "hoje" começa às 03:00Z.
const AGORA = new Date("2026-11-10T18:30:00.000Z");
const HOJE_DESDE = "2026-11-10T03:00:00.000Z";
const ONTEM_DESDE = "2026-11-09T03:00:00.000Z";
const ONTEM_ATE = "2026-11-09T18:30:00.000Z";

type Linha = Record<string, unknown>;
type Erro = { code: string };

const cenario = vi.hoisted(() => ({
  usuario: "",
  permissoes: new Set<string>(),
  /** Permissão cuja consulta falha. */
  erroDaPermissao: null as null | string,
  vendas: null as unknown,
  anterior: null as unknown,
  erroDeVendas: null as null | { code: string },
  erroDoAnterior: null as null | { code: string },
  financeiro: null as unknown,
  erroDoFinanceiro: null as null | { code: string },
  margem: null as unknown,
  erroDaMargem: null as null | { code: string },
  producao: null as unknown,
  erroDaProducao: null as null | { code: string },
  nomes: null as unknown,
  erroDosNomes: null as null | { code: string },
  /** Metas do mês (G4c): metas_lojas (gestão) e metas_painel (a própria, do vendedor). */
  metasDasLojas: null as unknown,
  minhaMeta: null as unknown,
  erroDasMetas: null as null | { code: string },
  /** Argumentos de cada chamada de função do banco, por nome. */
  chamadas: {} as Record<string, Record<string, unknown>[]>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  errosDasTabelas: {} as Record<string, { code: string }>,
  /** Tabelas cuja contagem volta sem erro e sem número (HEAD numa tabela ausente: 404 sem corpo). */
  semContagem: [] as string[],
  /** Tabelas lidas, na ordem. */
  lidas: [] as string[],
  /** Opções de cada chamada de obterSessao. */
  sessoes: [] as unknown[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

// Consulta de tabela: aplica os filtros de igualdade e de lista que a página pede (é o que prova que a
// contagem das pendências e a lista de lojas saem filtradas) e devolve o erro configurado, se houver.
class Consulta {
  linhas: Linha[];
  erro: Erro | null;
  constructor(readonly nome: string) {
    cenario.lidas.push(nome);
    this.linhas = [...(cenario.tabelas[nome] ?? [])];
    this.erro = cenario.errosDasTabelas[nome] ?? null;
  }
  select() { return this; }
  eq(coluna: string, valor: unknown) {
    this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor);
    return this;
  }
  in(coluna: string, valores: unknown[]) {
    this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna]));
    return this;
  }
  neq(coluna: string, valor: unknown) {
    this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] !== valor);
    return this;
  }
  lte(coluna: string, valor: string) {
    this.linhas = this.linhas.filter((l) => l[coluna] === undefined || String(l[coluna]) <= valor);
    return this;
  }
  or() { return this; }
  order() { return this; }
  maybeSingle() {
    return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas[0] ?? null, error: null });
  }
  then(resolver: (r: { data: Linha[] | null; count: number | null; error: Erro | null }) => unknown) {
    const resposta = this.erro ? { data: null, count: null, error: this.erro }
      : { data: this.linhas, count: cenario.semContagem.includes(this.nome) ? null : this.linhas.length, error: null };
    return Promise.resolve(resposta).then(resolver);
  }
}

const responder = (erro: Erro | null, dado: unknown) => (erro ? { data: null, error: erro } : { data: dado, error: null });
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    (cenario.chamadas[nome] ??= []).push(argumentos);
    if (nome === "tem_permissao") {
      // As permissões de rede chegam sem p_unidade; as de loja, com a loja do turno.
      return argumentos.p_permissao === cenario.erroDaPermissao ? responder({ code: "57014" }, null) : responder(null, cenario.permissoes.has(String(argumentos.p_permissao)));
    }
    // A janela atual termina "agora"; qualquer outra é a do período anterior.
    if (nome === "vendas_painel") return argumentos.p_fim === AGORA.toISOString() ? responder(cenario.erroDeVendas, cenario.vendas) : responder(cenario.erroDoAnterior, cenario.anterior);
    if (nome === "financeiro_painel") return responder(cenario.erroDoFinanceiro, cenario.financeiro);
    if (nome === "margem_painel") return responder(cenario.erroDaMargem, cenario.margem);
    if (nome === "connect_painel") return responder(cenario.erroDaProducao, cenario.producao);
    if (nome === "ranking_nomes") return responder(cenario.erroDosNomes, cenario.nomes);
    if (nome === "metas_lojas") return responder(cenario.erroDasMetas, cenario.metasDasLojas);
    if (nome === "metas_painel") return responder(cenario.erroDasMetas, cenario.minhaMeta);
    return responder({ code: "PGRST202" }, null);
  },
};
const sessao = () => ({
  usuario: { id: cenario.usuario },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-10T23:00:00Z" },
  supabase,
});
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async (opcoes: unknown) => {
    cenario.sessoes.push(opcoes);
    return sessao();
  },
}));

import { FalhaDoServico } from "../../lib/acesso/sessao";
import LayoutInicio from "./layout";
import CarregandoInicio from "./loading";
import Inicio from "./page";

// ---------------------------------------------------------------------------------------------
// Leitura da árvore devolvida pela página
// ---------------------------------------------------------------------------------------------
// Só os componentes de apresentação do Início são executados; os compartilhados (Cartao, Indicador,
// Linhas, BarrasHorizontais...) ficam como elementos, para o teste conferir as propriedades que recebem.
const APRESENTACAO = new Set([
  "ConteudoInicio", "EstadoDoPainel", "Indicadores", "PainelDeVendas", "PainelDeRecebimentos", "PainelDoMix", "PainelDasLojas", "PainelDeVendedores",
  "PainelDaMetaDoMes", "PainelDaMinhaMeta", "ResumoDaMeta", "MedidaPrincipal", "PorLoja", "BarrasDoRitmo",
]);
type Elemento = { tipo: string; props: Linha };
const nomeDoTipo = (tipo: unknown) => (typeof tipo === "string" ? tipo : typeof tipo === "function" ? tipo.name : "");

function percorrer(v: unknown, elemento: (e: Elemento) => void, folha: (texto: string) => void): void {
  if (Array.isArray(v)) {
    for (const x of v) percorrer(x, elemento, folha);
  } else if (typeof v === "string" || typeof v === "number") {
    folha(String(v));
  } else if (isValidElement<Linha>(v)) {
    const tipo = nomeDoTipo(v.type);
    if (typeof v.type === "function" && APRESENTACAO.has(tipo)) {
      percorrer((v.type as (p: unknown) => unknown)(v.props), elemento, folha);
    } else {
      elemento({ tipo, props: v.props });
      // O molde recebe a sessão inteira (com o cliente do banco): só o conteúdo dele é a tela.
      percorrer(tipo === "MoldeReal" ? v.props.children : Object.values(v.props), elemento, folha);
    }
  } else if (v && typeof v === "object" && !("$$typeof" in v)) {
    // Objetos do React que não são elementos (os ícones, por exemplo) têm nome próprio e não são texto da tela.
    percorrer(Object.values(v), elemento, folha);
  }
}
function ler(v: unknown) {
  const pedacos: string[] = [];
  const elementos: Elemento[] = [];
  percorrer(v, (e) => elementos.push(e), (t) => pedacos.push(t));
  return { texto: pedacos.join(" "), elementos, doTipo: (tipo: string) => elementos.filter((e) => e.tipo === tipo).map((e) => e.props) };
}

async function pagina(parametros: Record<string, string> = {}) {
  const lida = ler((await Inicio({ searchParams: Promise.resolve(parametros) })) as ReactElement);
  const cartoes = lida.doTipo("Cartao");
  const indicadores = lida.doTipo("Indicador");
  const achar = (lista: Linha[], campo: string, valor: string) => {
    const achado = lista.find((x) => x[campo] === valor);
    if (!achado) throw new Error(`a tela não tem "${valor}"`);
    return achado;
  };
  return {
    ...lida,
    /** Títulos dos cartões, na ordem em que aparecem. */
    cartoes: cartoes.map((c) => String(c.titulo)),
    /** Tudo o que um cartão mostra (título, subtítulo, ação e conteúdo). */
    cartao: (titulo: string) => ler(achar(cartoes, "titulo", titulo)),
    indicadores: indicadores.map((i) => String(i.rotulo)),
    indicador: (rotulo: string) => achar(indicadores, "rotulo", rotulo),
    enderecos: lida.elementos.flatMap((e) => (typeof e.props.href === "string" ? [e.props.href] : [])),
    filtro: (rotulo: string) => lida.doTipo("FiltroSegmentado").find((f) => f.rotulo === rotulo),
    /** As pendências do topo: rótulo → quantidade. */
    pendencias: Object.fromEntries(lida.elementos.filter((e) => typeof e.props.href === "string" && String(e.props.className).includes("rounded-cartao")).map((e) => {
      const trechos = ler(e.props.children).doTipo("span").map((s) => s.children);
      return [trechos.find((c) => typeof c === "string"), trechos.find((c) => typeof c === "number")];
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Fatos fictícios, na forma das respostas do banco (todos os números em centavos)
// ---------------------------------------------------------------------------------------------
const SEM_DESFEITOS = { cancelamentos: 0, cancelado: 0, devolucoes: 0, devolvido: 0 };
const SEM_ITENS_DESFEITOS = { itens_cancelados: 0, cancelado: 0, itens_devolvidos: 0, devolvido: 0 };
const UMA_DEVOLUCAO = { ...SEM_DESFEITOS, devolucoes: 1, devolvido: 30_000 };
const SANTA_CANDIDA = { unidade_id: LOJA, nome: "Santa Cândida (teste)" };

// Loja do turno, hoje: 3 vendas (R$ 4.500,00), R$ 200,00 de desconto em uma delas e uma devolução de R$ 300,00.
const HOJE = {
  totais: { vendas: 3, vendido: 450_000, subtotal: 470_000, descontos: 20_000, vendas_com_desconto: 1, ...UMA_DEVOLUCAO },
  periodos: [
    { periodo: "2026-11-10T10", vendas: 1, vendido: 150_000, subtotal: 150_000, descontos: 0, ...SEM_DESFEITOS },
    { periodo: "2026-11-10T14", vendas: 2, vendido: 300_000, subtotal: 320_000, descontos: 20_000, ...UMA_DEVOLUCAO },
  ],
  tipos: [
    { tipo: "aparelho", itens: 2, vendido: 380_000, ...SEM_ITENS_DESFEITOS },
    { tipo: "acessorio", itens: 3, vendido: 40_000, ...SEM_ITENS_DESFEITOS, itens_devolvidos: 1, devolvido: 30_000 },
    { tipo: "chip", itens: 2, vendido: 20_000, ...SEM_ITENS_DESFEITOS },
    { tipo: "recarga", itens: 1, vendido: 10_000, ...SEM_ITENS_DESFEITOS },
  ],
  categorias: [
    { categoria_id: "cat-1", categoria: "Smartphones", itens: 2, vendido: 380_000, ...SEM_ITENS_DESFEITOS },
    { categoria_id: "cat-2", categoria: "Capas e películas", itens: 3, vendido: 40_000, ...SEM_ITENS_DESFEITOS, itens_devolvidos: 1, devolvido: 30_000 },
    { categoria_id: null, categoria: null, itens: 3, vendido: 30_000, ...SEM_ITENS_DESFEITOS },
  ],
  lojas: [{ ...SANTA_CANDIDA, vendas: 3, vendido: 450_000, ...UMA_DEVOLUCAO }],
  vendedores: [
    { vendedor_id: ANA, vendas: 2, vendido: 300_000, ...UMA_DEVOLUCAO },
    { vendedor_id: BETO, vendas: 1, vendido: 150_000, ...SEM_DESFEITOS },
  ],
};
// Ontem até a mesma hora: 2 vendas (R$ 2.000,00), às 11h.
const ONTEM = {
  totais: { vendas: 2, vendido: 200_000, subtotal: 200_000, descontos: 0, vendas_com_desconto: 0, ...SEM_DESFEITOS },
  periodos: [{ periodo: "2026-11-09T11", vendas: 2, vendido: 200_000, subtotal: 200_000, descontos: 0, ...SEM_DESFEITOS }],
  tipos: [], categorias: [], lojas: [], vendedores: [],
};
const SEM_VENDAS = { totais: { vendas: 0, vendido: 0, subtotal: 0, descontos: 0, vendas_com_desconto: 0, ...SEM_DESFEITOS }, periodos: [], tipos: [], categorias: [], lojas: [], vendedores: [] };
// Só as vendas da Ana (o que o banco devolve com p_vendedor): 2 vendas, R$ 3.000,00.
const DA_ANA = {
  totais: { vendas: 2, vendido: 300_000, subtotal: 320_000, descontos: 20_000, vendas_com_desconto: 1, ...UMA_DEVOLUCAO },
  periodos: [HOJE.periodos[1]],
  tipos: [
    { tipo: "aparelho", itens: 1, vendido: 260_000, ...SEM_ITENS_DESFEITOS },
    { tipo: "acessorio", itens: 2, vendido: 20_000, ...SEM_ITENS_DESFEITOS, itens_devolvidos: 1, devolvido: 30_000 },
    { tipo: "chip", itens: 2, vendido: 20_000, ...SEM_ITENS_DESFEITOS },
  ],
  categorias: [{ categoria_id: "cat-1", categoria: "Smartphones", itens: 1, vendido: 260_000, ...SEM_ITENS_DESFEITOS }],
  lojas: [{ ...SANTA_CANDIDA, vendas: 2, vendido: 300_000, ...UMA_DEVOLUCAO }],
  vendedores: [HOJE.vendedores[0]],
};
// A rede, hoje: a loja do turno e mais 2 vendas (R$ 2.500,00) da Loja 02, feitas pelo Caio ao meio-dia.
const REDE = {
  totais: { vendas: 5, vendido: 700_000, subtotal: 720_000, descontos: 20_000, vendas_com_desconto: 1, ...UMA_DEVOLUCAO },
  periodos: [...HOJE.periodos, { periodo: "2026-11-10T12", vendas: 2, vendido: 250_000, subtotal: 250_000, descontos: 0, ...SEM_DESFEITOS }],
  tipos: [{ tipo: "aparelho", itens: 3, vendido: 630_000, ...SEM_ITENS_DESFEITOS }, ...HOJE.tipos.slice(1)],
  categorias: [{ categoria_id: "cat-1", categoria: "Smartphones", itens: 3, vendido: 630_000, ...SEM_ITENS_DESFEITOS }, ...HOJE.categorias.slice(1)],
  lojas: [...HOJE.lojas, { unidade_id: OUTRA, nome: "Loja 02 (teste)", vendas: 2, vendido: 250_000, ...SEM_DESFEITOS }],
  vendedores: [...HOJE.vendedores, { vendedor_id: CAIO, vendas: 2, vendido: 250_000, ...SEM_DESFEITOS }],
};
// Os mesmos fatos da loja, por dia (períodos de 7 e 30 dias).
const SEMANA = {
  ...HOJE,
  periodos: [
    { periodo: "2026-11-08", vendas: 1, vendido: 150_000, subtotal: 150_000, descontos: 0, ...SEM_DESFEITOS },
    { periodo: "2026-11-10", vendas: 2, vendido: 300_000, subtotal: 320_000, descontos: 20_000, ...UMA_DEVOLUCAO },
  ],
};
const SEMANA_ANTERIOR = { ...ONTEM, periodos: [{ ...ONTEM.periodos[0], periodo: "2026-11-03" }] };

// Pagamentos das 3 vendas: R$ 600,00 em dinheiro com R$ 100,00 de troco, R$ 2.000,00 em Pix na maquininha
// e um aparelho de R$ 2.000,00 pela PayJoy com R$ 500,00 de entrada em Pix direto. Na gaveta: fundo de
// R$ 200,00, o dinheiro recebido, o troco e a devolução de R$ 300,00 paga em dinheiro.
const FINANCEIRO = {
  periodos: [{ periodo: "2026-11-10", vendas: 3, vendido: 450_000, ...UMA_DEVOLUCAO }],
  pagamentos: [
    { meio: "dinheiro", situacao: "confirmado", meio_entrada: null, quantidade: 1, valor: 60_000, entrada: 0, troco: 10_000 },
    { meio: "pix_picpay", situacao: "confirmado", meio_entrada: null, quantidade: 2, valor: 200_000, entrada: 0, troco: 0 },
    { meio: "payjoy", situacao: "confirmado", meio_entrada: "pix_direto", quantidade: 1, valor: 200_000, entrada: 50_000, troco: 0 },
  ],
  reembolsos: [{ meio: "dinheiro", quantidade: 1, valor: 30_000 }],
  estornos: [],
  a_receber: [],
  movimentos: [
    { periodo: "2026-11-10", tipo: "fundo", meio: "dinheiro", quantidade: 1, valor: 20_000 },
    { periodo: "2026-11-10", tipo: "recebimento", meio: "dinheiro", quantidade: 1, valor: 60_000 },
    { periodo: "2026-11-10", tipo: "troco", meio: "dinheiro", quantidade: 1, valor: -10_000 },
    { periodo: "2026-11-10", tipo: "estorno", meio: "dinheiro", quantidade: 1, valor: -30_000 },
  ],
  caixas: { abertos_agora: 1, fechados: 0, conferidos: 0, com_diferenca: 0, diferenca: 0, diferenca_absoluta: 0 },
};
const FINANCEIRO_VAZIO = { ...FINANCEIRO, periodos: [], pagamentos: [], reembolsos: [], movimentos: [], caixas: { ...FINANCEIRO.caixas, abertos_agora: 0 } };
const NOMES = [{ id: ANA, nome: "Ana Teste" }, { id: BETO, nome: "Beto Teste" }];

// Margem bruta da loja, hoje (o que public.margem_painel devolve). Das 8 unidades vendidas, 7 tinham
// custo gravado (a recarga não tem): R$ 4.400,00 vendidos com custo de R$ 3.000,00. A devolução tira
// R$ 300,00 de venda e devolve R$ 120,00 de custo: 1.400,00 − 180,00 = R$ 1.220,00 de margem.
const MARGEM_ZERADA = {
  itens: 0, vendido: 0, itens_com_custo: 0, vendido_com_custo: 0, custo: 0, itens_sem_custo: 0, vendido_sem_custo: 0,
  itens_devolvidos_com_custo: 0, devolvido_com_custo: 0, custo_devolvido: 0,
  itens_cancelados_com_custo: 0, cancelado_com_custo: 0, custo_cancelado: 0, margem: 0,
};
const MARGEM_DO_DIA = {
  ...MARGEM_ZERADA, itens: 8, vendido: 450_000, itens_com_custo: 7, vendido_com_custo: 440_000, custo: 300_000, itens_sem_custo: 1, vendido_sem_custo: 10_000,
  itens_devolvidos_com_custo: 1, devolvido_com_custo: 30_000, custo_devolvido: 12_000, margem: 122_000,
};
const MARGEM = { totais: MARGEM_DO_DIA, periodos: [{ periodo: "2026-11-10", ...MARGEM_DO_DIA }], lojas_com_custo: 1, lojas_fora: 0 };
const MARGEM_SEM_FATOS = { totais: MARGEM_ZERADA, periodos: [], lojas_com_custo: 0, lojas_fora: 0 };
// Os mesmos itens, nenhum com custo gravado: a margem é desconhecida.
const SO_SEM_CUSTO = { ...MARGEM_ZERADA, itens: 8, vendido: 450_000, itens_sem_custo: 8, vendido_sem_custo: 450_000 };
const MARGEM_SEM_CUSTO = { totais: SO_SEM_CUSTO, periodos: [{ periodo: "2026-11-10", ...SO_SEM_CUSTO }], lojas_com_custo: 1, lojas_fora: 0 };

// Permissões de cada perfil, como na matriz de papéis do banco (só as que o Início e o menu perguntam).
// As de metas (metas.gerir, metas.ver_unidade e metas.ver_propria) entram só nos testes da meta do mês (G4c).
const PERFIS = {
  dono: ["venda.registrar", "venda.ver_propria", "venda.ver_unidade", "venda.ver_todas", "ranking.ver", "custo.ver", "desconto.aprovar", "nota.aprovar", "caixa.abrir", "caixa.conferir", "estoque.consultar", "connect.operar", "connect.gerir", "cliente.buscar", "auditoria.ver", "usuarios.gerir", "unidades.gerir", "conta_pagar.gerir"],
  administrador: ["venda.ver_todas", "ranking.ver", "custo.ver", "estoque.consultar", "usuarios.gerir", "unidades.gerir", "auditoria.ver"],
  gerente: ["venda.registrar", "venda.ver_unidade", "ranking.ver", "custo.ver", "desconto.aprovar", "nota.aprovar", "caixa.abrir", "caixa.conferir", "estoque.consultar", "cliente.buscar", "auditoria.ver", "conta_pagar.gerir"],
  vendedor: ["venda.registrar", "venda.ver_propria", "caixa.abrir", "estoque.consultar", "cliente.buscar"],
  tecnico: [],
} as const;
function entrar(perfil: keyof typeof PERFIS, usuario = GESTOR) {
  cenario.permissoes = new Set<string>(PERFIS[perfil]);
  cenario.usuario = usuario;
}
const PAINEIS_DA_LOJA = ["Vendas", "Recebimentos por meio", "Mix de vendas", "Equipe", "Atalhos"];
const INDICADORES_DE_VENDAS = ["Vendas realizadas", "Ticket médio", "Descontos concedidos", "Devoluções e cancelamentos"];
const INDICADORES_DO_FINANCEIRO = ["Recebido na loja (registro)", "Movimentação dos caixas (dinheiro)"];
// Loja ou rede: os quatro de vendas, a margem bruta e os dois do financeiro, nesta ordem.
const INDICADORES_DA_LOJA = [...INDICADORES_DE_VENDAS, "Margem bruta", ...INDICADORES_DO_FINANCEIRO, "Ora Connect confirmado"];
// Ora Connect (G4a): hoje, 2 ativações e 1 recarga confirmadas e 1 chip vendido; 1 operação ainda sem confirmação.
const PRODUCAO = {
  totais: { chips: 1, ativacoes: 2, portabilidades: 0, recargas: 1, por_evidencia: 3, por_revisao: 0, valor_face_recargas: 2_000, em_andamento: 1, sem_resultado: 0, debito: 0, lojas_sem_custo: 0 },
  periodos: [{ periodo: "2026-11-10", chips: 1, ativacoes: 2, portabilidades: 0, recargas: 1 }],
};
// Metas de novembro (G4c), no dia 10 de 30: o ritmo pede 1/3 da meta até hoje.
const R = (vendido_liquido: number, aparelhos: number, acessorios: number, connect: number) => ({ vendido_liquido, aparelhos, acessorios, connect });
const METAS_DA_LOJA = {
  mes: "2026-11-01", dias_no_mes: 30, dias_decorridos: 10, regra_contagem: 1,
  lojas: [{ unidade_id: LOJA, metas: { vendido_liquido: "3000000", aparelhos: 30 }, realizado: R(1_200_000, 8, 50_000, 4) }],
};
const METAS_DA_REDE = {
  ...METAS_DA_LOJA,
  lojas: [
    ...METAS_DA_LOJA.lojas,
    { unidade_id: OUTRA, metas: { vendido_liquido: 2_000_000 }, realizado: R(500_000, 3, 0, 1) },
    { unidade_id: SEM_VENDA, metas: {}, realizado: R(90_000, 1, 0, 0) },
  ],
};
const MINHA_META = { mes: "2026-11-01", dias_no_mes: 30, dias_decorridos: 10, regra_contagem: 1, loja: null, vendedores: [{ vendedor_id: ANA, metas: { vendido_liquido: 800_000 }, realizado: R(300_000, 2, 0, 1) }] };
const errosRegistrados = () => vi.mocked(console.error).mock.calls;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, {
    usuario: GESTOR, permissoes: new Set<string>(), erroDaPermissao: null,
    vendas: HOJE, anterior: ONTEM, erroDeVendas: null, erroDoAnterior: null,
    financeiro: FINANCEIRO, erroDoFinanceiro: null, margem: MARGEM, erroDaMargem: null, producao: PRODUCAO, erroDaProducao: null, nomes: NOMES, erroDosNomes: null,
    metasDasLojas: METAS_DA_LOJA, minhaMeta: MINHA_META, erroDasMetas: null,
    chamadas: {}, errosDasTabelas: {}, semContagem: [], lidas: [], sessoes: [],
    tabelas: {
      perfis_usuario: [{ id: GESTOR, nome: "Gestor Teste" }, { id: ANA, nome: "Ana Teste" }, { id: BETO, nome: "Beto Teste" }],
      unidades: [
        { id: OUTRA, nome: "Loja 02 (teste)", tipo: "loja_fisica" },
        { id: SEM_VENDA, nome: "Loja 03 (teste)", tipo: "loja_fisica" },
        { id: LOJA, nome: "Santa Cândida (teste)", tipo: "loja_fisica" },
        { id: DEFEITOS, nome: "DEFEITOS (teste)", tipo: "excecao" },
      ],
      aprovacoes_desconto: [
        { unidade_id: LOJA, situacao: "pendente" }, { unidade_id: LOJA, situacao: "pendente" },
        { unidade_id: LOJA, situacao: "aprovada" }, { unidade_id: OUTRA, situacao: "pendente" },
      ],
      caixas: [{ unidade_id: LOJA, situacao: "fechado" }, { unidade_id: LOJA, situacao: "aberto" }, { unidade_id: OUTRA, situacao: "fechado" }],
      estornos_externos: [{ unidade_id: LOJA, situacao: "pendente" }, { unidade_id: OUTRA, situacao: "pendente" }],
      connect_operacoes: [{ unidade_id: LOJA, situacao: "resultado_desconhecido" }, { unidade_id: LOJA, situacao: "confirmada" }],
      // Saídas do caixa (L7c): conta só a pendente da loja que outra pessoa pediu.
      caixa_saidas: [
        { unidade_id: LOJA, situacao: "pendente", pedida_por: ANA }, { unidade_id: LOJA, situacao: "pendente", pedida_por: GESTOR },
        { unidade_id: LOJA, situacao: "autorizada", pedida_por: BETO }, { unidade_id: OUTRA, situacao: "pendente", pedida_por: CAIO },
      ],
      // Contas a pagar (L8a): contam as em aberto vencidas ou para hoje (10/11); o RLS decide de quais lojas.
      contas_a_pagar: [
        { situacao: "aberta", vencimento: "2026-11-09" }, { situacao: "aberta", vencimento: "2026-11-10" },
        { situacao: "aberta", vencimento: "2026-11-12" }, { situacao: "paga", vencimento: "2026-11-01" },
      ],
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function primeiro<T>(lista: T[]): T {
  const [item] = lista;
  if (item === undefined) throw new Error("a tela não tem esse componente");
  return item;
}

// ---------------------------------------------------------------------------------------------
describe("Início: o gerente acompanha a loja do turno", () => {
  beforeEach(() => entrar("gerente"));

  it("pergunta ao banco só pela loja do turno: hoje até agora e ontem até a mesma hora", async () => {
    const p = await pagina();
    expect(cenario.chamadas.vendas_painel).toStrictEqual([
      { p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString(), p_por_hora: true, p_unidade: LOJA },
      { p_inicio: ONTEM_DESDE, p_fim: ONTEM_ATE, p_por_hora: true, p_unidade: LOJA },
    ]);
    expect(cenario.chamadas.financeiro_painel).toStrictEqual([{ p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString(), p_por_hora: false, p_unidade: LOJA }]);
    // A margem é pedida uma vez, só para o período atual (não há comparação com o anterior).
    expect(cenario.chamadas.margem_painel).toStrictEqual([{ p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString(), p_unidade: LOJA }]);
    expect(cenario.chamadas.ranking_nomes).toStrictEqual([{ p_vendedores: [ANA, BETO] }]);
    // Não lê o cadastro de lojas nem oferece troca de loja.
    expect(cenario.lidas).not.toContain("unidades");
    expect(p.filtro("Loja")).toBeUndefined();
    expect(p.filtro("Período")).toMatchObject({ opcoes: [
      { href: "/inicio", rotulo: "Hoje", ativo: true },
      { href: "/inicio?periodo=7", rotulo: "7 dias", ativo: false },
      { href: "/inicio?periodo=30", rotulo: "30 dias", ativo: false },
    ] });
  });

  it("o endereço não amplia o recorte: ?loja de outra loja continua na loja do turno", async () => {
    await pagina({ loja: OUTRA });
    expect(cenario.chamadas.vendas_painel?.map((c) => c.p_unidade)).toEqual([LOJA, LOJA]);
    expect(cenario.chamadas.financeiro_painel?.map((c) => c.p_unidade)).toEqual([LOJA]);
    expect(cenario.chamadas.margem_painel?.map((c) => c.p_unidade)).toEqual([LOJA]);
  });

  it("mostra os números conhecidos do período e a comparação com ontem até a mesma hora", async () => {
    const p = await pagina();
    expect(p.cartoes).toEqual(PAINEIS_DA_LOJA);
    expect(p.indicadores).toEqual(INDICADORES_DA_LOJA);
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3", detalhe: "R$ 4.500,00 vendidos", variacao: { fracao: 0.5, referencia: "vs. ontem até esta hora", bomQuandoSobe: true } });
    expect(p.indicador("Ticket médio")).toMatchObject({ valor: "R$ 1.500,00", detalhe: "Vendido ÷ vendas concluídas", variacao: { fracao: 0.5 } });
    // Ontem não houve desconto nem devolução: sem base, não há percentual.
    expect(p.indicador("Descontos concedidos")).toMatchObject({ valor: "R$ 200,00", detalhe: "4,3% do valor de tabela · 1 venda com desconto" });
    expect(p.indicador("Descontos concedidos").variacao).toBeUndefined();
    expect(p.indicador("Devoluções e cancelamentos")).toMatchObject({ valor: "R$ 300,00", detalhe: "1 devolução · 0 cancelamentos" });
    expect(p.indicador("Devoluções e cancelamentos").variacao).toBeUndefined();

    const vendas = p.cartao("Vendas");
    expect(vendas.texto).toContain("Por hora · vendas concluídas, pela data da conclusão");
    for (const trecho of ["R$ 4.500,00", "3 vendas", "R$ 4.200,00", "depois de devoluções e cancelamentos", "Ontem até esta hora: R$ 2.000,00 em 2 vendas."]) expect(vendas.texto).toContain(trecho);
    expect(vendas.doTipo("SeloVariacao")).toMatchObject([{ variacao: { fracao: 1.25 } }]);
    const linhas = primeiro(vendas.doTipo("Linhas"));
    expect(linhas.rotulosX).toEqual(["07h", "08h", "09h", "10h", "11h", "12h", "13h", "14h", "15h"]);
    expect(linhas.series).toMatchObject([
      { nome: "Hoje", serie: 1, valores: [0, 0, 0, 150_000, 0, 0, 0, 300_000, 0] },
      { nome: "Ontem", serie: "comparacao", tracejada: true, valores: [0, 0, 0, 0, 200_000, 0, 0, 0, 0] },
    ]);
    const tabela = primeiro(vendas.doTipo("TabelaDoGrafico"));
    expect(tabela.colunas).toEqual(["Hora", "Vendas hoje", "Vendido hoje", "Vendas ontem", "Vendido ontem"]);
    expect((tabela.linhas as unknown[][]).filter((l) => l[1] !== "0" || l[3] !== "0")).toEqual([
      ["10h", "1", "R$ 1.500,00", "0", "R$ 0,00"],
      ["11h", "0", "R$ 0,00", "2", "R$ 2.000,00"],
      ["14h", "2", "R$ 3.000,00", "0", "R$ 0,00"],
    ]);
  });

  it("7 dias: soma por dia e compara com o dia equivalente dos 7 dias anteriores", async () => {
    cenario.vendas = SEMANA;
    cenario.anterior = SEMANA_ANTERIOR;
    const p = await pagina({ periodo: "7" });
    expect(cenario.chamadas.vendas_painel).toStrictEqual([
      { p_inicio: "2026-11-04T03:00:00.000Z", p_fim: AGORA.toISOString(), p_por_hora: false, p_unidade: LOJA },
      { p_inicio: "2026-10-28T03:00:00.000Z", p_fim: "2026-11-03T18:30:00.000Z", p_por_hora: false, p_unidade: LOJA },
    ]);
    const vendas = p.cartao("Vendas");
    expect(vendas.texto).toContain("Por dia · vendas concluídas, pela data da conclusão");
    expect(vendas.texto).toContain("Nos 7 dias anteriores: R$ 2.000,00 em 2 vendas.");
    const linhas = primeiro(vendas.doTipo("Linhas"));
    expect(linhas.rotulosX).toEqual(["04/11", "05/11", "06/11", "07/11", "08/11", "09/11", "10/11"]);
    expect(linhas.series).toMatchObject([
      { nome: "Estes 7 dias", serie: 1, valores: [0, 0, 0, 0, 150_000, 0, 300_000] },
      { nome: "7 dias anteriores", serie: "comparacao", valores: [0, 0, 0, 0, 0, 0, 200_000] },
    ]);
    const tabela = primeiro(vendas.doTipo("TabelaDoGrafico"));
    expect(tabela.colunas).toEqual(["Dia", "Vendas", "Vendido", "Dia anterior equivalente", "Vendas no dia anterior", "Vendido no dia anterior"]);
    expect((tabela.linhas as unknown[][]).at(-1)).toEqual(["10/11", "2", "R$ 3.000,00", "03/11", "2", "R$ 2.000,00"]);
    // O filtro e os atalhos de conferência levam o mesmo período.
    expect(p.filtro("Período")).toMatchObject({ opcoes: [{ ativo: false }, { rotulo: "7 dias", ativo: true }, { ativo: false }] });
    expect(p.enderecos).toEqual(expect.arrayContaining(["/financeiro?periodo=7", "/financeiro?periodo=7&ver=pagamentos"]));
  });

  it("período desconhecido no endereço cai em hoje", async () => {
    await pagina({ periodo: "365" });
    expect(cenario.chamadas.vendas_painel?.[0]).toStrictEqual({ p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString(), p_por_hora: true, p_unidade: LOJA });
  });

  it("margem bruta: o valor do período, o percentual sobre o vendido com custo e o que ficou fora da conta", async () => {
    let margem = (await pagina()).indicador("Margem bruta");
    // 1.220,00 ÷ (4.400,00 − 300,00 devolvidos) = 29,8%. O item sem custo gravado não entra como custo zero: é avisado.
    expect(margem).toMatchObject({ valor: "R$ 1.220,00", detalhe: "29,8% do vendido com custo · 1 item sem custo fora da conta", tom: "atencao" });
    // Não há comparação com o período anterior: o custo de ontem não é a base de hoje.
    expect(margem.variacao).toBeUndefined();

    // Todos os itens com custo gravado: nada a avisar.
    const tudo = { ...MARGEM_DO_DIA, itens_com_custo: 8, vendido_com_custo: 450_000, custo: 305_000, itens_sem_custo: 0, vendido_sem_custo: 0, margem: 127_000 };
    cenario.margem = { ...MARGEM, totais: tudo, periodos: [{ periodo: "2026-11-10", ...tudo }] };
    margem = (await pagina()).indicador("Margem bruta");
    expect(margem).toMatchObject({ valor: "R$ 1.270,00", detalhe: "30,2% do vendido com custo", tom: "neutro" });

    // Período só com a devolução de uma venda anterior: a margem fica abaixo de zero e não há base para percentual.
    const soDevolucao = { ...MARGEM_ZERADA, itens_devolvidos_com_custo: 1, devolvido_com_custo: 30_000, custo_devolvido: 12_000, margem: -18_000 };
    cenario.margem = { ...MARGEM, totais: soDevolucao, periodos: [{ periodo: "2026-11-10", ...soDevolucao }] };
    margem = (await pagina()).indicador("Margem bruta");
    expect(margem).toMatchObject({ valor: "−R$ 180,00", detalhe: "Sem base para percentual", tom: "neutro" });
  });

  it("margem bruta em 7 dias: a mesma janela das vendas, pedida uma vez", async () => {
    await pagina({ periodo: "7" });
    expect(cenario.chamadas.margem_painel).toStrictEqual([{ p_inicio: "2026-11-04T03:00:00.000Z", p_fim: AGORA.toISOString(), p_unidade: LOJA }]);
  });

  it("recebimentos por meio: troco descontado, entrada de financiamento no meio em que foi paga e o total do financeiro", async () => {
    const p = await pagina();
    // O mesmo cálculo do /financeiro, sobre a mesma resposta do banco.
    const resumo = resumoDoPainel(lerPainel(FINANCEIRO));
    expect(resumo.recebido).toBe(300_000);
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "R$ 3.000,00", detalhe: "Pagamentos confirmados, troco descontado. Não é liquidação" });
    expect(p.indicador("Movimentação dos caixas (dinheiro)")).toMatchObject({ valor: "R$ 400,00", detalhe: "Entradas menos saídas das gavetas no período · 1 caixa aberto agora" });
    const cartao = p.cartao("Recebimentos por meio");
    expect(cartao.texto).toContain("Registro na loja, troco descontado. Não é dinheiro liquidado");
    // Cada meio com a sua cor, sempre a mesma: Pix PicPay 1, dinheiro 3, Pix direto 4.
    const partes = primeiro(cartao.doTipo("BarraSegmentada")).partes as { valor: number }[];
    expect(partes).toEqual([
      { nome: "Pix PicPay", valor: 200_000, serie: 1 },
      { nome: "Dinheiro", valor: 50_000, serie: 3 },
      { nome: "Pix direto", valor: 50_000, serie: 4 },
    ]);
    expect(partes.reduce((s, x) => s + x.valor, 0)).toBe(resumo.recebido);
    expect(primeiro(cartao.doTipo("TabelaDoGrafico")).linhas).toEqual([
      ["Pix na maquininha PicPay", "R$ 2.000,00", "2", "R$ 0,00"],
      ["Dinheiro", "R$ 500,00", "1", "R$ 0,00"],
      ["Pix direto", "R$ 500,00", "0", "R$ 500,00"],
    ]);
    // O financiado não é recebimento da loja: fica à parte, como valor a receber da financeira.
    expect(primeiro(cartao.doTipo("ListaDados")).itens).toEqual([
      ["Entradas de financiamento (já somadas no meio em que foram pagas)", "R$ 500,00"],
      ["Financiamento PayJoy: a receber", "R$ 1.500,00"],
    ]);
    expect(p.enderecos).toEqual(expect.arrayContaining(["/financeiro", "/financeiro?ver=pagamentos"]));
  });

  it("mix por grupo e por categoria, com a cor presa ao grupo", async () => {
    const mix = (await pagina()).cartao("Mix de vendas");
    expect(primeiro(mix.doTipo("BarraSegmentada")).partes).toEqual([
      { nome: "Aparelhos", valor: 380_000, serie: 1 },
      { nome: "Acessórios", valor: 40_000, serie: 2 },
      { nome: "Ora Connect", valor: 30_000, serie: 3 },
      { nome: "Serviços", valor: 0, serie: 4 },
    ]);
    expect(primeiro(mix.doTipo("BarrasHorizontais")).dados).toEqual([
      { rotulo: "Smartphones", valor: 380_000, detalhe: "2 itens" },
      { rotulo: "Capas e películas", valor: 40_000, detalhe: "3 itens" },
      { rotulo: "Sem categoria", valor: 30_000, detalhe: "3 itens" },
    ]);
    const [grupos, categorias] = mix.doTipo("TabelaDoGrafico");
    expect(grupos?.linhas).toContainEqual(["Acessórios", "3", "R$ 400,00", "1", "R$ 300,00"]);
    expect(grupos?.linhas).toContainEqual(["Total", "8", "R$ 4.500,00", "1", "R$ 300,00"]);
    expect(categorias?.titulo).toBe("Ver categorias em tabela");
    expect(mix.texto).toContain("A categoria é a atual do cadastro do produto, não um retrato do dia da venda.");
  });

  it("equipe: vendido por vendedor de origem, com os nomes liberados pelo ranking", async () => {
    const equipe = (await pagina()).cartao("Equipe");
    expect(equipe.texto).toContain("Vendido por vendedor de origem. Não é comissão");
    expect(primeiro(equipe.doTipo("BarrasHorizontais")).dados).toEqual([
      { rotulo: "Ana Teste", valor: 300_000, detalhe: "2 vendas" },
      { rotulo: "Beto Teste", valor: 150_000, detalhe: "1 venda" },
    ]);
    expect(primeiro(equipe.doTipo("TabelaDoGrafico")).linhas).toEqual([
      ["Ana Teste", "2", "R$ 3.000,00", "R$ 300,00", "R$ 2.700,00", "R$ 1.500,00"],
      ["Beto Teste", "1", "R$ 1.500,00", "R$ 0,00", "R$ 1.500,00", "R$ 1.500,00"],
    ]);
  });

  it("quem consulta se reconhece na equipe", async () => {
    entrar("gerente", BETO);
    const equipe = (await pagina()).cartao("Equipe");
    expect(primeiro(equipe.doTipo("BarrasHorizontais")).dados).toMatchObject([{ rotulo: "Ana Teste" }, { rotulo: "Beto Teste (você)" }]);
  });

  it("as pendências continuam no topo, contadas só na loja do turno e só para quem tem a permissão", async () => {
    const p = await pagina();
    expect(p.pendencias).toEqual({ "Descontos para aprovar": 2, "Notas na fila": 0, "Saídas do caixa": 1, "Contas a pagar": 2, "Caixas para conferir": 1, "Transferências": 0, "Estornos a confirmar": 1, "Itens a conferir": 0 });
    expect(cenario.lidas).not.toContain("connect_operacoes");
  });

  it("saídas do caixa (L7c): a pendência leva ao quadro de autorizar; banco ainda sem a tabela, ela some e o resto continua", async () => {
    expect((await pagina()).enderecos).toContain("/caixa#saidas");
    const semSaidas = { "Descontos para aprovar": 2, "Notas na fila": 0, "Contas a pagar": 2, "Caixas para conferir": 1, "Transferências": 0, "Estornos a confirmar": 1, "Itens a conferir": 0 };
    cenario.errosDasTabelas.caixa_saidas = { code: "PGRST205" };
    expect((await pagina()).pendencias).toEqual(semSaidas);
    // Como chega de verdade: a contagem só de cabeçalho numa tabela ausente volta sem erro e sem número.
    // Sem número não é zero: a pendência some.
    cenario.errosDasTabelas = {};
    cenario.semContagem = ["caixa_saidas"];
    expect((await pagina()).pendencias).toEqual(semSaidas);
  });

  it("contas a pagar (L8a): as em aberto vencidas ou para hoje levam à tela; banco ainda sem a tabela, a pendência some", async () => {
    const p = await pagina();
    expect(p.pendencias["Contas a pagar"]).toBe(2);
    expect(p.enderecos).toContain("/contas-a-pagar");
    const semContas = { "Descontos para aprovar": 2, "Notas na fila": 0, "Saídas do caixa": 1, "Caixas para conferir": 1, "Transferências": 0, "Estornos a confirmar": 1, "Itens a conferir": 0 };
    cenario.errosDasTabelas.contas_a_pagar = { code: "PGRST205" };
    expect((await pagina()).pendencias).toEqual(semContas);
    cenario.errosDasTabelas = {};
    cenario.semContagem = ["contas_a_pagar"];
    expect((await pagina()).pendencias).toEqual(semContas);
    // Erro de outra natureza para a página: zero pendência inventado não.
    cenario.semContagem = [];
    cenario.errosDasTabelas.contas_a_pagar = { code: "57014" };
    await expect(pagina()).rejects.toBeInstanceOf(FalhaDoServico);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Início: o vendedor acompanha só as próprias vendas", () => {
  beforeEach(() => {
    entrar("vendedor", ANA);
    cenario.vendas = DA_ANA;
  });

  it("pergunta só pelas vendas de quem está logado: sem financeiro, sem gaveta e sem nome de colega", async () => {
    const p = await pagina();
    expect(cenario.chamadas.vendas_painel).toStrictEqual([
      { p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString(), p_por_hora: true, p_vendedor: ANA },
      { p_inicio: ONTEM_DESDE, p_fim: ONTEM_ATE, p_por_hora: true, p_vendedor: ANA },
    ]);
    expect(cenario.chamadas.financeiro_painel).toBeUndefined();
    expect(cenario.chamadas.margem_painel).toBeUndefined();
    expect(cenario.chamadas.ranking_nomes).toBeUndefined();
    expect(cenario.lidas).not.toContain("unidades");
    expect(p.filtro("Loja")).toBeUndefined();
    expect((p.filtro("Período")?.opcoes as { href: string }[]).map((o) => o.href)).toEqual(["/inicio", "/inicio?periodo=7", "/inicio?periodo=30"]);
  });

  it("a visão do vendedor nunca pede a margem, nem para quem tem a permissão de ver o custo", async () => {
    cenario.permissoes.add("custo.ver");
    const p = await pagina();
    expect(cenario.chamadas.margem_painel).toBeUndefined();
    expect(p.indicadores).toEqual(["Minhas vendas", "Ticket médio", "Descontos concedidos", "Devoluções e cancelamentos"]);
    expect(p.texto).not.toMatch(/[Mm]argem/);
  });

  it("mostra os próprios números e nada da loja nem dos colegas", async () => {
    const p = await pagina();
    expect(p.texto).toContain("Olá, Ana Teste");
    expect(p.texto).toContain("Meus resultados");
    expect(p.texto).toContain("Só as suas vendas (você como vendedor de origem), nas lojas em que você trabalha · Hoje");
    expect(p.indicadores).toEqual(["Minhas vendas", "Ticket médio", "Descontos concedidos", "Devoluções e cancelamentos"]);
    expect(p.indicador("Minhas vendas")).toMatchObject({ valor: "2", detalhe: "R$ 3.000,00 vendidos" });
    expect(p.indicador("Ticket médio")).toMatchObject({ valor: "R$ 1.500,00" });
    expect(p.cartoes).toEqual(["Minhas vendas", "Minha produção", "Resumo da loja e ranking", "Atalhos"]);
    const vendas = p.cartao("Minhas vendas");
    for (const trecho of ["R$ 3.000,00", "2 vendas", "R$ 2.700,00", "Ontem até esta hora: R$ 2.000,00 em 2 vendas."]) expect(vendas.texto).toContain(trecho);
    expect(primeiro(vendas.doTipo("Linhas")).series).toMatchObject([{ nome: "Hoje", valores: [0, 0, 0, 0, 0, 0, 0, 300_000, 0] }, { nome: "Ontem" }]);
    // O resumo da loja e o ranking com os colegas esperam a decisão do proprietário (P3).
    const resumo = p.cartao("Resumo da loja e ranking");
    expect(resumo.texto).toContain("Sem permissão");
    expect(resumo.texto).toContain("dependem de uma decisão do proprietário");
    expect(p.texto).not.toContain("Beto Teste");
    expect(p.texto).not.toContain("Recebido na loja");
    expect(p.texto).not.toContain("Movimentação dos caixas");
    expect(p.texto).not.toContain("Margem bruta");
    // Nenhuma ligação leva ao financeiro nem a outra loja.
    expect(p.enderecos).toContain("/vendas");
    expect(p.enderecos.filter((e) => e.startsWith("/financeiro") || e.includes("loja="))).toEqual([]);
    expect(p.pendencias).toEqual({ "Transferências": 0 });
    // Quem não confere caixa nem pergunta pelas saídas a autorizar; quem não gere contas, pelas contas a pagar.
    expect(cenario.lidas).not.toContain("caixa_saidas");
    expect(cenario.lidas).not.toContain("contas_a_pagar");
  });

  it("minha produção: itens vendidos por grupo, sem valor da loja", async () => {
    const producao = (await pagina()).cartao("Minha produção");
    expect(producao.texto).toContain("5 itens vendidos");
    expect(primeiro(producao.doTipo("BarraSegmentada"))).toMatchObject({ rotulo: "Itens", partes: [
      { nome: "Aparelhos", valor: 1, serie: 1 },
      { nome: "Acessórios", valor: 2, serie: 2 },
      { nome: "Ora Connect", valor: 2, serie: 3 },
      { nome: "Serviços", valor: 0, serie: 4 },
    ] });
    expect(primeiro(producao.doTipo("TabelaDoGrafico")).linhas).toContainEqual(["Total", "5", "R$ 3.000,00", "1", "R$ 300,00"]);
    expect(producao.doTipo("BarrasHorizontais")).toEqual([]);
  });

  it("quem vendeu em mais de uma loja vê onde vendeu, sem ligação para outra loja", async () => {
    cenario.vendas = { ...DA_ANA, lojas: [
      { ...SANTA_CANDIDA, vendas: 1, vendido: 200_000, ...UMA_DEVOLUCAO },
      // Loja que a pessoa não lê mais: o banco não devolve o nome.
      { unidade_id: OUTRA, nome: null, vendas: 1, vendido: 100_000, ...SEM_DESFEITOS },
    ] };
    const p = await pagina();
    expect(p.cartoes).toEqual(["Minhas vendas", "Minha produção", "Onde vendi", "Resumo da loja e ranking", "Atalhos"]);
    const onde = p.cartao("Onde vendi");
    expect(primeiro(onde.doTipo("BarrasHorizontais")).dados).toEqual([
      { rotulo: "Santa Cândida (teste)", valor: 200_000, detalhe: "1 venda" },
      { rotulo: "Loja inativa", valor: 100_000, detalhe: "1 venda" },
    ]);
    expect(primeiro(onde.doTipo("TabelaDoGrafico")).linhas).toEqual([
      ["Santa Cândida (teste)", "1", "R$ 2.000,00", "R$ 300,00", "R$ 1.700,00", "R$ 2.000,00"],
      ["Loja inativa", "1", "R$ 1.000,00", "R$ 0,00", "R$ 1.000,00", "R$ 1.000,00"],
    ]);
    expect(p.enderecos.filter((e) => e.includes("loja="))).toEqual([]);
  });

  it("o endereço não amplia o recorte: ?loja não muda a pergunta nem lê o cadastro de lojas", async () => {
    await pagina({ loja: OUTRA, periodo: "7" });
    expect(cenario.chamadas.vendas_painel).toStrictEqual([
      { p_inicio: "2026-11-04T03:00:00.000Z", p_fim: AGORA.toISOString(), p_por_hora: false, p_vendedor: ANA },
      { p_inicio: "2026-10-28T03:00:00.000Z", p_fim: "2026-11-03T18:30:00.000Z", p_por_hora: false, p_vendedor: ANA },
    ]);
    expect(cenario.chamadas.financeiro_painel).toBeUndefined();
    expect(cenario.lidas).not.toContain("unidades");
  });

  it("fonte indisponível: os indicadores continuam com o nome do vendedor e sem número", async () => {
    cenario.erroDeVendas = cenario.erroDoAnterior = { code: "PGRST202" };
    const p = await pagina();
    expect(p.indicadores).toEqual(["Minhas vendas", "Ticket médio", "Descontos concedidos", "Devoluções e cancelamentos"]);
    expect(p.indicador("Minhas vendas")).toMatchObject({ valor: "—", detalhe: "Indisponível neste ambiente", tom: "atencao" });
    expect(p.cartoes).toEqual(["Minhas vendas", "Minha produção", "Resumo da loja e ranking", "Atalhos"]);
    expect(p.cartao("Minha produção").texto).toContain("migration vendas_painel");
  });
});

// ---------------------------------------------------------------------------------------------
describe("Início: quem vê a rede começa pela rede inteira e pode escolher uma loja", () => {
  beforeEach(() => {
    entrar("dono");
    cenario.vendas = REDE;
  });

  it("rede inteira: nenhuma pergunta leva loja nem vendedor, e o filtro oferece só as lojas que vendem", async () => {
    const p = await pagina();
    expect(cenario.chamadas.vendas_painel).toStrictEqual([
      { p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString(), p_por_hora: true },
      { p_inicio: ONTEM_DESDE, p_fim: ONTEM_ATE, p_por_hora: true },
    ]);
    expect(cenario.chamadas.financeiro_painel).toStrictEqual([{ p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString(), p_por_hora: false }]);
    // A margem da rede também vai sem loja: o banco soma só as lojas em que quem pede vê o custo.
    expect(cenario.chamadas.margem_painel).toStrictEqual([{ p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString() }]);
    expect(cenario.chamadas.ranking_nomes).toStrictEqual([{ p_vendedores: [ANA, BETO, CAIO] }]);
    expect(cenario.lidas).toContain("unidades");
    // A rede primeiro, depois a loja do turno e as demais em ordem alfabética; o local DEFEITOS não vende.
    expect(p.filtro("Loja")).toMatchObject({ opcoes: [
      { href: "/inicio", rotulo: "Rede inteira", ativo: true },
      { href: `/inicio?loja=${LOJA}`, rotulo: "Santa Cândida (teste)", ativo: false },
      { href: `/inicio?loja=${OUTRA}`, rotulo: "Loja 02 (teste)", ativo: false },
      { href: `/inicio?loja=${SEM_VENDA}`, rotulo: "Loja 03 (teste)", ativo: false },
    ] });
    expect(p.texto).toContain("Rede inteira · Hoje");
    expect(p.texto).not.toContain("DEFEITOS");
    expect(p.cartoes).toEqual(["Vendas", "Recebimentos por meio", "Mix de vendas", "Desempenho das lojas", "Melhores vendedores", "Atalhos"]);
    expect(p.indicadores).toEqual(INDICADORES_DA_LOJA);
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "5", detalhe: "R$ 7.000,00 vendidos" });
    expect(p.enderecos).toEqual(expect.arrayContaining(["/financeiro?loja=rede", "/financeiro?loja=rede&ver=pagamentos"]));
    expect(p.pendencias).toEqual({ "Descontos para aprovar": 2, "Notas na fila": 0, "Saídas do caixa": 1, "Contas a pagar": 2, "Caixas para conferir": 1, "Transferências": 0, "Ora Connect a decidir": 1, "Estornos a confirmar": 1, "Itens a conferir": 0 });
  });

  it("desempenho das lojas: a venda fica na loja em que foi feita, e loja sem venda aparece com zero", async () => {
    const p = await pagina();
    const lojas = p.cartao("Desempenho das lojas");
    expect(primeiro(lojas.doTipo("BarrasHorizontais")).dados).toEqual([
      { rotulo: "Santa Cândida (teste)", valor: 450_000, detalhe: "3 vendas" },
      { rotulo: "Loja 02 (teste)", valor: 250_000, detalhe: "2 vendas" },
      { rotulo: "Loja 03 (teste)", valor: 0, detalhe: "0 vendas" },
    ]);
    const linhas = primeiro(lojas.doTipo("TabelaDoGrafico")).linhas as unknown[][];
    expect(linhas.map((l) => l.slice(1))).toEqual([
      ["3", "R$ 4.500,00", "R$ 300,00", "R$ 4.200,00", "R$ 1.500,00"],
      ["2", "R$ 2.500,00", "R$ 0,00", "R$ 2.500,00", "R$ 1.250,00"],
      ["0", "R$ 0,00", "R$ 0,00", "R$ 0,00", "—"],
    ]);
    // Cada loja abre o Início daquela loja.
    expect(lojas.elementos.flatMap((e) => (typeof e.props.href === "string" ? [e.props.href] : []))).toEqual([`/inicio?loja=${LOJA}`, `/inicio?loja=${OUTRA}`, `/inicio?loja=${SEM_VENDA}`]);
  });

  it("melhores vendedores da rede: sem nome liberado, a pessoa aparece como não identificada", async () => {
    const vendedores = (await pagina()).cartao("Melhores vendedores");
    expect(primeiro(vendedores.doTipo("BarrasHorizontais"))).toMatchObject({ duasColunas: true, dados: [
      { rotulo: "Ana Teste", valor: 300_000, detalhe: "2 vendas" },
      { rotulo: "Vendedor não identificado", valor: 250_000, detalhe: "2 vendas" },
      { rotulo: "Beto Teste", valor: 150_000, detalhe: "1 venda" },
    ] });
  });

  it("margem da rede: loja em que quem pede não vê o custo fica fora da soma e é avisada, sem dizer qual", async () => {
    cenario.margem = { ...MARGEM, lojas_fora: 1 };
    let margem = (await pagina()).indicador("Margem bruta");
    expect(margem).toMatchObject({ valor: "R$ 1.220,00", detalhe: "29,8% do vendido com custo · 1 item sem custo fora da conta · 1 loja fora (custo não visível para você)", tom: "atencao" });

    // Movimento só em lojas fora: não há margem a mostrar, e isso não é margem zero.
    cenario.margem = { ...MARGEM_SEM_FATOS, lojas_fora: 2 };
    margem = (await pagina()).indicador("Margem bruta");
    expect(margem).toMatchObject({ valor: "—", detalhe: "O movimento do período foi só em loja em que você não vê o custo" });
  });

  it("escolhendo uma loja: todas as perguntas levam a loja, e os atalhos de conferência também", async () => {
    cenario.vendas = SEMANA;
    cenario.anterior = SEMANA_ANTERIOR;
    const p = await pagina({ loja: OUTRA, periodo: "7" });
    expect(cenario.chamadas.vendas_painel).toStrictEqual([
      { p_inicio: "2026-11-04T03:00:00.000Z", p_fim: AGORA.toISOString(), p_por_hora: false, p_unidade: OUTRA },
      { p_inicio: "2026-10-28T03:00:00.000Z", p_fim: "2026-11-03T18:30:00.000Z", p_por_hora: false, p_unidade: OUTRA },
    ]);
    expect(cenario.chamadas.financeiro_painel).toStrictEqual([{ p_inicio: "2026-11-04T03:00:00.000Z", p_fim: AGORA.toISOString(), p_por_hora: false, p_unidade: OUTRA }]);
    expect(cenario.chamadas.margem_painel).toStrictEqual([{ p_inicio: "2026-11-04T03:00:00.000Z", p_fim: AGORA.toISOString(), p_unidade: OUTRA }]);
    expect(p.texto).toContain("Loja 02 (teste) · 7 dias");
    expect(p.cartoes).toEqual(["Vendas", "Recebimentos por meio", "Mix de vendas", "Equipe", "Atalhos"]);
    expect((p.filtro("Loja")?.opcoes as { rotulo: string; ativo: boolean }[]).filter((o) => o.ativo).map((o) => o.rotulo)).toEqual(["Loja 02 (teste)"]);
    expect((p.filtro("Período")?.opcoes as { href: string }[]).map((o) => o.href)).toEqual([`/inicio?loja=${OUTRA}`, `/inicio?periodo=7&loja=${OUTRA}`, `/inicio?periodo=30&loja=${OUTRA}`]);
    expect(p.enderecos).toEqual(expect.arrayContaining([`/financeiro?periodo=7&loja=${OUTRA}`, `/financeiro?periodo=7&loja=${OUTRA}&ver=pagamentos`]));
    // As pendências continuam sendo as da loja do turno, qualquer que seja a loja dos painéis.
    expect(p.pendencias).toMatchObject({ "Descontos para aprovar": 2, "Caixas para conferir": 1 });
  });

  it("a loja do turno escolhida no filtro confere no financeiro sem parâmetro (lá ela é o padrão)", async () => {
    const p = await pagina({ loja: LOJA });
    expect(cenario.chamadas.vendas_painel?.map((c) => c.p_unidade)).toEqual([LOJA, LOJA]);
    expect(p.enderecos).toEqual(expect.arrayContaining(["/financeiro", "/financeiro?ver=pagamentos"]));
    expect(p.enderecos.filter((e) => e.startsWith("/financeiro?loja="))).toEqual([]);
  });

  it("loja desconhecida ou que não vende no endereço: volta para a rede inteira", async () => {
    for (const loja of ["00000000-0000-4000-8000-00000000ffff", DEFEITOS, "rede"]) {
      cenario.chamadas = {};
      const p = await pagina({ loja });
      expect(cenario.chamadas.vendas_painel).toStrictEqual([
        { p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString(), p_por_hora: true },
        { p_inicio: ONTEM_DESDE, p_fim: ONTEM_ATE, p_por_hora: true },
      ]);
      expect((p.filtro("Loja")?.opcoes as { rotulo: string; ativo: boolean }[]).filter((o) => o.ativo).map((o) => o.rotulo)).toEqual(["Rede inteira"]);
    }
  });

  it("quem vê a rede mas não confere caixas não acompanha a gaveta", async () => {
    entrar("administrador");
    const p = await pagina();
    expect(cenario.chamadas.vendas_painel?.[0]).toStrictEqual({ p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString(), p_por_hora: true });
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "R$ 3.000,00" });
    const gaveta = p.indicador("Movimentação dos caixas (dinheiro)");
    expect(gaveta).toMatchObject({ valor: "—", detalhe: "Só quem confere caixas acompanha a gaveta" });
    expect(gaveta.tom).toBeUndefined();
    expect(p.pendencias).toEqual({ "Transferências": 0 });
  });
});

// ---------------------------------------------------------------------------------------------
describe("Início: cada estado tem a sua mensagem, e falha nunca vira zero", () => {
  beforeEach(() => entrar("gerente"));

  it("sem movimentação: zero só aqui, com a leitura funcionando, e os painéis continuam no lugar", async () => {
    cenario.vendas = SEM_VENDAS;
    cenario.financeiro = FINANCEIRO_VAZIO;
    cenario.margem = MARGEM_SEM_FATOS;
    const p = await pagina();
    expect(p.cartoes).toEqual(PAINEIS_DA_LOJA);
    expect(p.indicadores).toEqual(INDICADORES_DA_LOJA);
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "0", detalhe: "Nenhuma venda concluída no período" });
    expect(p.indicador("Ticket médio")).toMatchObject({ valor: "Sem vendas" });
    expect(p.indicador("Ticket médio").variacao).toBeUndefined();
    expect(p.indicador("Descontos concedidos")).toMatchObject({ valor: "R$ 0,00", detalhe: "Sem vendas no período" });
    expect(p.indicador("Devoluções e cancelamentos")).toMatchObject({ valor: "R$ 0,00", detalhe: "0 devoluções · 0 cancelamentos" });
    // Margem zero só aqui: a leitura respondeu e não houve venda, devolução nem cancelamento.
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "R$ 0,00", detalhe: "Nenhuma venda, devolução ou cancelamento no período" });
    expect(p.indicador("Margem bruta").tom).toBeUndefined();
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "R$ 0,00" });
    expect(p.indicador("Movimentação dos caixas (dinheiro)")).toMatchObject({ valor: "R$ 0,00", detalhe: "Entradas menos saídas das gavetas no período · 0 caixas abertos agora" });
    const vendas = p.cartao("Vendas");
    expect(vendas.doTipo("EstadoVazio")).toMatchObject([{ titulo: "Nenhuma venda concluída no período" }]);
    expect(vendas.texto).toContain("A leitura está funcionando; só não houve venda concluída");
    expect(vendas.texto).toContain("Ontem até esta hora: R$ 2.000,00 em 2 vendas.");
    expect(vendas.doTipo("Linhas")).toEqual([]);
    expect(p.cartao("Recebimentos por meio").doTipo("EstadoVazio")).toMatchObject([{ titulo: "Nenhum pagamento confirmado no período" }]);
    expect(p.cartao("Mix de vendas").doTipo("EstadoVazio")).toMatchObject([{ titulo: "Nenhum item vendido no período" }]);
    expect(p.cartao("Equipe").texto).toContain("ninguém concluiu venda neste recorte");
    // Sem vendedor no período não há nome a pedir.
    expect(cenario.chamadas.ranking_nomes).toBeUndefined();
    expect(p.doTipo("Linhas")).toEqual([]);
    expect(p.doTipo("BarraSegmentada")).toEqual([]);
    expect(p.doTipo("BarrasHorizontais")).toEqual([]);
  });

  it("devolução de venda antiga em período sem venda aparece, sem virar venda", async () => {
    cenario.vendas = { ...SEM_VENDAS, totais: { ...SEM_VENDAS.totais, ...UMA_DEVOLUCAO } };
    const p = await pagina();
    expect(p.indicador("Devoluções e cancelamentos")).toMatchObject({ valor: "R$ 300,00", detalhe: "1 devolução · 0 cancelamentos" });
    expect(p.cartao("Vendas").texto).toContain("em devoluções e cancelamentos de vendas anteriores, registrados neste período.");
  });

  it("sem histórico comparável: mostra o período, sem percentual e sem a série anterior", async () => {
    cenario.anterior = SEM_VENDAS;
    const p = await pagina();
    for (const rotulo of INDICADORES_DE_VENDAS) expect(p.indicador(rotulo).variacao).toBeUndefined();
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3", detalhe: "R$ 4.500,00 vendidos · sem histórico comparável" });
    const vendas = p.cartao("Vendas");
    expect(vendas.texto).toContain("Sem histórico comparável: nenhuma venda ontem até esta hora.");
    expect(vendas.doTipo("SeloVariacao")).toEqual([]);
    expect(primeiro(vendas.doTipo("Linhas")).series).toMatchObject([{ nome: "Hoje" }]);
    expect((primeiro(vendas.doTipo("Linhas")).series as unknown[]).length).toBe(1);
    expect(primeiro(vendas.doTipo("TabelaDoGrafico")).colunas).toEqual(["Hora", "Vendas", "Vendido"]);
  });

  it("período anterior não lido: os números de hoje aparecem, sem comparação e sem inventar base", async () => {
    cenario.erroDoAnterior = { code: "57014" };
    const p = await pagina();
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3", detalhe: "R$ 4.500,00 vendidos · sem comparação agora" });
    for (const rotulo of INDICADORES_DE_VENDAS) expect(p.indicador(rotulo).variacao).toBeUndefined();
    const vendas = p.cartao("Vendas");
    expect(vendas.texto).toContain("O período anterior não pôde ser lido agora: sem comparação.");
    expect(vendas.texto).not.toContain("Sem histórico comparável");
    expect(vendas.doTipo("SeloVariacao")).toEqual([]);
  });

  it("fonte indisponível no ambiente: sem número, com o motivo, e o que depende de outra fonte continua", async () => {
    cenario.erroDeVendas = cenario.erroDoAnterior = { code: "PGRST202" };
    const p = await pagina();
    expect(p.cartoes).toEqual(PAINEIS_DA_LOJA);
    for (const rotulo of INDICADORES_DE_VENDAS) {
      expect(p.indicador(rotulo)).toMatchObject({ valor: "—", detalhe: "Indisponível neste ambiente", tom: "atencao" });
      expect(p.indicador(rotulo).variacao).toBeUndefined();
    }
    for (const titulo of ["Vendas", "Mix de vendas", "Equipe"]) {
      const cartao = p.cartao(titulo);
      expect(cartao.doTipo("Aviso")).toMatchObject([{ tom: "aviso", titulo: "Indisponível neste ambiente" }]);
      expect(cartao.texto).toContain("migration vendas_painel");
      expect(cartao.texto).not.toMatch(/R\$|\b0\b/);
    }
    // O financeiro tem a sua própria leitura e continua valendo.
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "R$ 3.000,00" });
    expect(p.cartao("Recebimentos por meio").doTipo("BarraSegmentada")).toHaveLength(1);
    expect(cenario.chamadas.ranking_nomes).toBeUndefined();
    // Ambiente sem a função não é erro a investigar: nada no registro.
    expect(errosRegistrados()).toEqual([]);
  });

  it("falha de consulta: nenhum número, oferta de tentar de novo no mesmo recorte e registro só com o código", async () => {
    cenario.erroDeVendas = { code: "57014" };
    const p = await pagina({ periodo: "7" });
    expect(p.cartoes).toEqual(PAINEIS_DA_LOJA);
    for (const rotulo of INDICADORES_DE_VENDAS) expect(p.indicador(rotulo)).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora", tom: "atencao" });
    for (const titulo of ["Vendas", "Mix de vendas", "Equipe"]) {
      const cartao = p.cartao(titulo);
      expect(cartao.doTipo("Aviso")).toMatchObject([{ tom: "perigo", titulo: "Não foi possível ler agora" }]);
      expect(cartao.texto).toContain("Nenhum número é mostrado: falha de leitura não vira zero.");
      expect(cartao.texto).toContain("Tentar de novo");
      expect(cartao.elementos.map((e) => e.props.href)).toContain("/inicio?periodo=7");
    }
    expect(cenario.chamadas.ranking_nomes).toBeUndefined();
    expect(errosRegistrados()).toEqual([["inicio: falha ao consultar vendas_painel", { codigo: "57014" }]]);
  });

  it("resposta do banco em forma inesperada é falha, não zero", async () => {
    cenario.vendas = { ...HOJE, totais: { ...HOJE.totais, vendido: undefined } };
    const p = await pagina();
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora" });
    expect(p.cartao("Vendas").texto).toContain("falha de leitura não vira zero");
    expect(errosRegistrados()).toEqual([["inicio: resposta inesperada de vendas_painel"]]);
  });

  it("financeiro indisponível ou em falha: recebimentos e gaveta sem número, vendas continuam", async () => {
    cenario.erroDoFinanceiro = { code: "PGRST202" };
    let p = await pagina();
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
    for (const rotulo of INDICADORES_DO_FINANCEIRO) expect(p.indicador(rotulo)).toMatchObject({ valor: "—", detalhe: "Indisponível neste ambiente", tom: "atencao" });
    expect(p.cartao("Recebimentos por meio").texto).toContain("migration financeiro_painel");
    expect(errosRegistrados()).toEqual([]);

    cenario.erroDoFinanceiro = { code: "57014" };
    p = await pagina();
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
    for (const rotulo of INDICADORES_DO_FINANCEIRO) expect(p.indicador(rotulo)).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora", tom: "atencao" });
    const recebimentos = p.cartao("Recebimentos por meio");
    expect(recebimentos.texto).toContain("falha de leitura não vira zero");
    expect(recebimentos.doTipo("BarraSegmentada")).toEqual([]);
    expect(errosRegistrados()).toEqual([["inicio: falha ao ler financeiro_painel", { motivo: "consulta" }]]);
  });

  it("financeiro em forma inesperada também é falha", async () => {
    cenario.financeiro = { ...FINANCEIRO, pagamentos: "x" };
    const p = await pagina();
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora" });
    expect(errosRegistrados()).toEqual([["inicio: falha ao ler financeiro_painel", { motivo: "resposta" }]]);
  });

  it("margem sem custo gravado: desconhecida, com aviso, e nunca zero", async () => {
    cenario.margem = MARGEM_SEM_CUSTO;
    const margem = (await pagina()).indicador("Margem bruta");
    expect(margem).toMatchObject({ valor: "Sem custo", detalhe: "Nenhum item do período tinha custo gravado: a margem é desconhecida, não zero", tom: "atencao" });
    expect(margem.valor).not.toMatch(/R\$/);
  });

  it("margem indisponível ou em falha: só o indicador dela fica sem número, e o resto da loja continua", async () => {
    cenario.erroDaMargem = { code: "PGRST202" };
    let p = await pagina();
    expect(p.indicadores).toEqual(INDICADORES_DA_LOJA);
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "—", detalhe: "Indisponível neste ambiente", tom: "atencao" });
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "R$ 3.000,00" });
    expect(p.cartoes).toEqual(PAINEIS_DA_LOJA);
    // Ambiente sem a função não é erro a investigar: nada no registro.
    expect(errosRegistrados()).toEqual([]);

    cenario.erroDaMargem = { code: "57014" };
    p = await pagina();
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora", tom: "atencao" });
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "R$ 3.000,00" });
    expect(errosRegistrados()).toEqual([["margem: falha ao consultar margem_painel", { codigo: "57014" }]]);
  });

  it("margem em forma inesperada, ou com a conta que não fecha, é falha: nenhum número é mostrado", async () => {
    // A soma devolvida não bate com as parcelas (deveria ser 122_000): não dá para confiar no número.
    cenario.margem = { ...MARGEM, totais: { ...MARGEM_DO_DIA, margem: 122_001 } };
    let p = await pagina();
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora", tom: "atencao" });
    expect(errosRegistrados()).toEqual([["margem: resposta inesperada de margem_painel"]]);

    // Campo ausente não é zero lojas.
    cenario.margem = { ...MARGEM, lojas_fora: undefined };
    p = await pagina();
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora", tom: "atencao" });
    expect(errosRegistrados()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Início: sem permissão não há número nem pergunta ao banco", () => {
  it("gerente sem ranking.ver: a equipe fica sem permissão, e os nomes nem são pedidos", async () => {
    entrar("gerente");
    cenario.permissoes.delete("ranking.ver");
    const p = await pagina();
    expect(p.cartoes).toEqual(PAINEIS_DA_LOJA);
    const equipe = p.cartao("Equipe");
    expect(equipe.doTipo("Aviso")).toMatchObject([{ tom: "neutro", titulo: "Sem permissão" }]);
    expect(equipe.texto).toContain("Você não tem a permissão de ver o ranking de vendedores nesta loja.");
    expect(equipe.texto).not.toMatch(/R\$|Ana Teste|Beto Teste/);
    expect(cenario.chamadas.ranking_nomes).toBeUndefined();
    // O resto da loja continua: a permissão do ranking não é a das vendas.
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
  });

  it("sem custo.ver: a margem fica sem número e o banco nem é perguntado, com o resto da loja no lugar", async () => {
    entrar("gerente");
    cenario.permissoes.delete("custo.ver");
    const p = await pagina();
    expect(cenario.chamadas.tem_permissao).toEqual(expect.arrayContaining([{ p_permissao: "custo.ver", p_unidade: LOJA }]));
    expect(cenario.chamadas.margem_painel).toBeUndefined();
    // O indicador continua no lugar, dizendo o motivo, sem tom de alerta: não é problema a resolver.
    expect(p.indicadores).toEqual(INDICADORES_DA_LOJA);
    const margem = p.indicador("Margem bruta");
    expect(margem).toMatchObject({ valor: "—", detalhe: "Só quem vê o custo dos produtos acompanha a margem" });
    expect(margem.tom).toBeUndefined();
    expect(p.cartoes).toEqual(PAINEIS_DA_LOJA);
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "R$ 3.000,00" });
  });

  it("sem ranking.ver, a permissão vem antes da falha: continua 'sem permissão' com as vendas fora do ar", async () => {
    entrar("gerente");
    cenario.permissoes.delete("ranking.ver");
    cenario.erroDeVendas = { code: "57014" };
    const equipe = (await pagina()).cartao("Equipe");
    expect(equipe.doTipo("Aviso")).toMatchObject([{ titulo: "Sem permissão" }]);
    expect(cenario.chamadas.ranking_nomes).toBeUndefined();
  });

  it("nomes do ranking fora do ar: nenhum número de vendedor, em vez de uma lista de não identificados", async () => {
    entrar("gerente");
    cenario.erroDosNomes = { code: "57014" };
    let equipe = (await pagina()).cartao("Equipe");
    expect(equipe.doTipo("Aviso")).toMatchObject([{ tom: "perigo", titulo: "Não foi possível ler agora" }]);
    expect(equipe.texto).not.toMatch(/R\$|não identificado/);
    expect(equipe.doTipo("BarrasHorizontais")).toEqual([]);
    expect(errosRegistrados()).toEqual([["inicio: falha ao consultar ranking_nomes", { codigo: "57014" }]]);

    cenario.erroDosNomes = { code: "PGRST202" };
    equipe = (await pagina()).cartao("Equipe");
    expect(equipe.doTipo("Aviso")).toMatchObject([{ tom: "aviso", titulo: "Indisponível neste ambiente" }]);
    expect(equipe.texto).toContain("a leitura dos nomes do ranking (migration vendas_painel)");

    cenario.erroDosNomes = null;
    cenario.nomes = { id: ANA };
    equipe = (await pagina()).cartao("Equipe");
    expect(equipe.doTipo("Aviso")).toMatchObject([{ titulo: "Não foi possível ler agora" }]);
  });

  it("quem não vê venda alguma: o painel diz isso e o banco não é perguntado", async () => {
    entrar("tecnico");
    const p = await pagina();
    expect(p.cartoes).toEqual(["Vendas", "Atalhos"]);
    expect(p.cartao("Vendas").texto).toContain("Você não tem permissão para acompanhar vendas nesta loja.");
    expect(p.indicadores).toEqual([]);
    expect(p.doTipo("FiltroSegmentado")).toEqual([]);
    expect(cenario.chamadas.vendas_painel).toBeUndefined();
    expect(cenario.chamadas.financeiro_painel).toBeUndefined();
    expect(cenario.chamadas.margem_painel).toBeUndefined();
    expect(cenario.chamadas.ranking_nomes).toBeUndefined();
    expect(cenario.lidas).not.toContain("unidades");
    expect(p.pendencias).toEqual({});
  });

  it("rede sem a lista de lojas: não dá para conferir a loja pedida, então nenhum número é pedido nem mostrado", async () => {
    entrar("dono");
    cenario.errosDasTabelas.unidades = { code: "57014" };
    const p = await pagina({ loja: OUTRA });
    expect(cenario.chamadas.vendas_painel).toBeUndefined();
    expect(cenario.chamadas.financeiro_painel).toBeUndefined();
    expect(cenario.chamadas.margem_painel).toBeUndefined();
    expect(cenario.chamadas.ranking_nomes).toBeUndefined();
    expect(p.filtro("Loja")).toBeUndefined();
    for (const rotulo of INDICADORES_DA_LOJA) expect(p.indicador(rotulo)).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora" });
    expect(p.cartao("Vendas").texto).toContain("falha de leitura não vira zero");
    expect(errosRegistrados()).toEqual([["inicio: falha ao consultar as lojas", { codigo: "57014" }]]);
    // As pendências da loja do turno não dependem dos painéis.
    expect(p.pendencias).toMatchObject({ "Descontos para aprovar": 2 });
  });
});

// ---------------------------------------------------------------------------------------------
describe("Início: o que para a página inteira", () => {
  beforeEach(() => entrar("gerente"));

  it("sem resposta sobre uma permissão não há como decidir a visão", async () => {
    for (const permissao of ["ranking.ver", "venda.ver_propria", "custo.ver"]) {
      cenario.erroDaPermissao = permissao;
      cenario.chamadas = {};
      await expect(pagina()).rejects.toBeInstanceOf(FalhaDoServico);
      expect(cenario.chamadas.vendas_painel).toBeUndefined();
      expect(cenario.chamadas.margem_painel).toBeUndefined();
    }
  });

  it("contagem de pendência com erro não vira zero pendências", async () => {
    cenario.errosDasTabelas.caixas = { code: "57014" };
    await expect(pagina()).rejects.toBeInstanceOf(FalhaDoServico);
    // Nas saídas do caixa também: só a tabela ausente (migration não aplicada) tira a pendência.
    cenario.errosDasTabelas = { caixa_saidas: { code: "57014" } };
    await expect(pagina()).rejects.toBeInstanceOf(FalhaDoServico);
  });

  it("nome de quem entrou não lido: a página para em vez de saudar errado", async () => {
    cenario.errosDasTabelas.perfis_usuario = { code: "57014" };
    await expect(pagina()).rejects.toBeInstanceOf(FalhaDoServico);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Início: sessão e carregamento", () => {
  it("o layout exige sessão com loja antes de qualquer conteúdo (inclusive do esqueleto)", async () => {
    await expect(LayoutInicio({ children: "conteúdo" })).resolves.toBe("conteúdo");
    expect(cenario.sessoes).toEqual([{ exigirLoja: true }]);
  });

  it("a página também confere a sessão com loja", async () => {
    entrar("gerente");
    await pagina();
    expect(cenario.sessoes).toEqual([{ exigirLoja: true }]);
  });

  it("o esqueleto de carregamento avisa que está carregando e não mostra texto nem número", () => {
    const esqueleto = CarregandoInicio() as ReactElement<Linha>;
    expect(esqueleto.props).toMatchObject({ "aria-busy": "true", "aria-label": "Carregando o início" });
    const { elementos } = ler(esqueleto);
    expect(elementos.length).toBeGreaterThan(10);
    expect(elementos.filter((e) => typeof e.props.children === "string" || typeof e.props.children === "number")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Início: produção do Ora Connect (G4a)", () => {
  it("gerente: as operações confirmadas e os chips vendidos de hoje, na loja do turno", async () => {
    entrar("gerente");
    const p = await pagina();
    expect(cenario.chamadas.connect_painel).toStrictEqual([{ p_inicio: HOJE_DESDE, p_fim: AGORA.toISOString(), p_unidade: LOJA }]);
    expect(p.indicador("Ora Connect confirmado")).toMatchObject({ valor: "3", detalhe: "2 ativações · 1 recarga · 1 chip vendido · 1 ainda sem confirmação" });
  });

  it("a visão da vendedora não pergunta a produção aqui (ela fica no Ora Connect)", async () => {
    entrar("vendedor", ANA);
    await pagina();
    expect(cenario.chamadas.connect_painel).toBeUndefined();
  });

  it("leitura indisponível ou em falha: o indicador fica sem número, e o resto continua", async () => {
    entrar("gerente");
    cenario.erroDaProducao = { code: "PGRST202" };
    let p = await pagina();
    expect(p.indicador("Ora Connect confirmado")).toMatchObject({ valor: "—", detalhe: "Indisponível neste ambiente", tom: "atencao" });
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
    cenario.erroDaProducao = { code: "57014" };
    p = await pagina();
    expect(p.indicador("Ora Connect confirmado")).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora" });
    expect(errosRegistrados()).toEqual([["connect: falha ao consultar connect_painel", { codigo: "57014" }]]);
  });
});

describe("Início: a meta do mês (G4c)", () => {
  const acompanhar = (...extras: string[]) => { for (const p of extras) cenario.permissoes.add(p); };
  const enderecosDe = (c: ReturnType<typeof ler>) => c.elementos.flatMap((e) => (typeof e.props.href === "string" ? [e.props.href] : []));
  const barras = (c: ReturnType<typeof ler>, i = 0) =>
    (c.doTipo("BarrasHorizontais")[i] as { dados: { rotulo: string; valor: number; meta: number }[] }).dados.map((d) => [d.rotulo, Math.round(d.valor * 10) / 10, Math.round(d.meta * 10) / 10]);

  it("gerente que acompanha as metas: a meta da loja no mês de hoje, com o medidor do vendido líquido e o ritmo; o período escolhido não muda o mês", async () => {
    entrar("gerente");
    acompanhar("metas.ver_unidade", "metas.gerir");
    const p = await pagina({ periodo: "7" });
    expect(cenario.chamadas.metas_lojas).toStrictEqual([{ p_mes: "2026-11-01", p_unidade: LOJA }]);
    expect(cenario.chamadas.metas_painel).toBeUndefined();
    expect(p.cartoes).toEqual(["Meta da loja em novembro de 2026", ...PAINEIS_DA_LOJA]);
    const c = p.cartao("Meta da loja em novembro de 2026");
    // R$ 12 mil de R$ 30 mil (40%) contra 33,3% esperados: no ritmo. 8 de 30 aparelhos (26,7%): abaixo.
    expect(c.doTipo("Medidor")[0]).toMatchObject({ percentual: 40, tom: "marca", rotulo: "Valor vendido líquido" });
    expect(barras(c)).toEqual([["Vendido líquido", 40, 33.3], ["Aparelhos", 26.7, 33.3]]);
    expect(c.texto).toContain("Até hoje (10 de 30 dias)");
    expect(enderecosDe(c)).toContain("/metas");
  });

  it("rede inteira: a soma só das lojas com meta (e quantas são) e o vendido líquido de cada loja; o dono escolhe uma loja", async () => {
    entrar("dono");
    acompanhar("metas.ver_unidade", "metas.gerir", "metas.ver_propria");
    cenario.metasDasLojas = METAS_DA_REDE;
    let p = await pagina();
    expect(cenario.chamadas.metas_lojas).toStrictEqual([{ p_mes: "2026-11-01" }]);
    const c = p.cartao("Meta da rede em novembro de 2026");
    // R$ 17 mil (12 + 5, a loja sem meta fica fora) de R$ 50 mil: 34%.
    expect(c.doTipo("Medidor")[0]).toMatchObject({ percentual: 34 });
    expect(c.texto).toContain("Vendido líquido: soma de 2 de 3 lojas · Aparelhos: soma de 1 de 3 lojas. As lojas sem meta ficam fora da comparação.");
    expect(barras(c, 1)).toEqual([["Santa Cândida (teste)", 40, 33.3], ["Loja 02 (teste)", 25, 33.3]]);
    expect(c.texto).toContain("Sem meta do vendido líquido neste mês: Loja 03 (teste).");

    cenario.metasDasLojas = { ...METAS_DA_LOJA, lojas: [METAS_DA_REDE.lojas[1]] };
    p = await pagina({ loja: OUTRA });
    expect(cenario.chamadas.metas_lojas?.at(-1)).toStrictEqual({ p_mes: "2026-11-01", p_unidade: OUTRA });
    const daLoja = p.cartao("Meta da loja em novembro de 2026");
    expect(enderecosDe(daLoja)).toContain(`/metas?loja=${OUTRA}`);
    expect(daLoja.doTipo("BarrasHorizontais")).toHaveLength(1);
  });

  it("sem meta da loja no mês: o quadro diz \"nenhuma meta\", nunca 0%", async () => {
    entrar("gerente");
    acompanhar("metas.ver_unidade");
    cenario.metasDasLojas = { ...METAS_DA_LOJA, lojas: [{ ...METAS_DA_LOJA.lojas[0], metas: {} }] };
    const c = (await pagina()).cartao("Meta da loja em novembro de 2026");
    expect(c.doTipo("EstadoVazio")[0]).toMatchObject({ titulo: "Nenhuma meta da loja definida para este mês" });
    expect(c.doTipo("Medidor")).toEqual([]);
  });

  it("quem não acompanha metas (o administrador) não pergunta ao banco nem vê o quadro", async () => {
    entrar("administrador");
    const p = await pagina();
    expect(cenario.chamadas.metas_lojas).toBeUndefined();
    expect(p.cartoes.filter((c) => c.startsWith("Meta"))).toEqual([]);
  });

  it("vendedora: a própria meta do mês na loja do turno, sem nada da loja; sem meta, o aviso", async () => {
    entrar("vendedor", ANA);
    acompanhar("metas.ver_propria");
    let p = await pagina();
    expect(cenario.chamadas.metas_painel).toStrictEqual([{ p_mes: "2026-11-01", p_unidade: LOJA }]);
    expect(cenario.chamadas.metas_lojas).toBeUndefined();
    expect(p.cartoes).toEqual(["Minha meta em novembro de 2026", "Minhas vendas", "Minha produção", "Resumo da loja e ranking", "Atalhos"]);
    // R$ 3 mil de R$ 8 mil (37,5%) contra 33,3% esperados: no ritmo.
    const c = p.cartao("Minha meta em novembro de 2026");
    expect(c.doTipo("Medidor")[0]).toMatchObject({ percentual: 37.5, tom: "marca" });
    expect(enderecosDe(c)).toContain("/metas");

    cenario.minhaMeta = { ...MINHA_META, vendedores: [] };
    p = await pagina();
    expect(p.cartao("Minha meta em novembro de 2026").doTipo("EstadoVazio")[0]).toMatchObject({ titulo: "Nenhuma meta sua definida para este mês" });
  });

  it("indisponível ou em falha: o quadro diz por quê, sem número, e o resto do Início continua", async () => {
    entrar("gerente");
    acompanhar("metas.ver_unidade");
    cenario.erroDasMetas = { code: "PGRST202" };
    let p = await pagina();
    let c = p.cartao("Meta do mês");
    expect(c.texto).toContain("Indisponível neste ambiente");
    expect(c.texto).toContain("a leitura das metas (migration metas)");
    expect(c.doTipo("Medidor")).toEqual([]);
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
    cenario.erroDasMetas = { code: "57014" };
    p = await pagina();
    c = p.cartao("Meta do mês");
    expect(c.texto).toContain("Não foi possível ler agora");
    expect(errosRegistrados()).toEqual([["metas: falha ao consultar metas_lojas", { codigo: "57014" }]]);
  });
});

// Relatórios reais (lote G2a) com sessão e Supabase simulados. Confere, por perfil, QUAIS perguntas vão
// ao banco (loja, janela atual e anterior, página do detalhe) e o que a tela mostra em cada estado: com
// fatos, sem movimento, margem desconhecida, loja fora da margem, fonte indisponível, falha de consulta e
// sem permissão; e a exportação em CSV, com a mesma permissão e o mesmo recorte da tela. Dados fictícios.
// As somas no banco estão provadas em packages/banco/src/vendas-painel.test.ts e margem-painel.test.ts;
// as regras puras, em src/lib/relatorios/painel.test.ts e src/lib/margem/painel.test.ts. A jornada no
// navegador, com login, fica no lote J1.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const SEM_VENDA = "00000000-0000-4000-8000-0000000000ee";
const DEFEITOS = "00000000-0000-4000-8000-0000000000d0";
const ANA = "00000000-0000-4000-8000-0000000000a1";
const BETO = "00000000-0000-4000-8000-0000000000b2";
const CAIO = "00000000-0000-4000-8000-0000000000c3";
const GESTOR = "00000000-0000-4000-8000-0000000000f0";
// Terça-feira, 10/11/2026, 15h30 em São Paulo (03:00Z é meia-noite lá). Os 14 dias vão de 28/10 até
// agora; os 14 anteriores, de 14/10 até 27/10 na mesma hora.
const AGORA = new Date("2026-11-10T18:30:00.000Z");
const FIM = AGORA.toISOString();
const DESDE = { "7": "2026-11-04T03:00:00.000Z", "14": "2026-10-28T03:00:00.000Z", "30": "2026-10-12T03:00:00.000Z" } as const;
const ANTERIOR = {
  "7": { p_inicio: "2026-10-28T03:00:00.000Z", p_fim: "2026-11-03T18:30:00.000Z" },
  "14": { p_inicio: "2026-10-14T03:00:00.000Z", p_fim: "2026-10-27T18:30:00.000Z" },
  "30": { p_inicio: "2026-09-12T03:00:00.000Z", p_fim: "2026-10-11T18:30:00.000Z" },
} as const;

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
  itens: null as unknown,
  erroDosItens: null as null | { code: string },
  producao: null as unknown,
  erroDaProducao: null as null | { code: string },
  /** Resposta de margem_itens lote a lote (a exportação pede o detalhe em lotes de 1.000). */
  loteDosItens: null as null | ((argumentos: Record<string, unknown>) => { data: unknown; error: { code: string } | null }),
  /** Argumentos de cada chamada de função do banco, por nome. */
  chamadas: {} as Record<string, Record<string, unknown>[]>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  errosDasTabelas: {} as Record<string, { code: string }>,
  /** Tabelas lidas, na ordem. */
  lidas: [] as string[],
  /** Opções de cada chamada de obterSessao. */
  sessoes: [] as unknown[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

// Consulta de tabela: aplica o filtro de lista que a lista de lojas pede (é o que tira DEFEITOS, que
// não vende) e devolve o erro configurado, se houver.
class Consulta {
  linhas: Linha[];
  erro: Erro | null;
  constructor(nome: string) {
    cenario.lidas.push(nome);
    this.linhas = [...(cenario.tabelas[nome] ?? [])];
    this.erro = cenario.errosDasTabelas[nome] ?? null;
  }
  select() { return this; }
  in(coluna: string, valores: unknown[]) {
    this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna]));
    return this;
  }
  order() { return this; }
  then(resolver: (r: { data: Linha[] | null; error: Erro | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas, error: null }).then(resolver);
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
    if (nome === "vendas_painel") return argumentos.p_fim === FIM ? responder(cenario.erroDeVendas, cenario.vendas) : responder(cenario.erroDoAnterior, cenario.anterior);
    if (nome === "financeiro_painel") return responder(cenario.erroDoFinanceiro, cenario.financeiro);
    if (nome === "margem_painel") return responder(cenario.erroDaMargem, cenario.margem);
    if (nome === "margem_itens") return cenario.loteDosItens ? cenario.loteDosItens(argumentos) : responder(cenario.erroDosItens, cenario.itens);
    if (nome === "connect_painel") return responder(cenario.erroDaProducao, cenario.producao);
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
import { GET as exportar } from "./exportar/route";
import LayoutRelatorios from "./layout";
import CarregandoRelatorios from "./loading";
import Relatorios from "./page";

// ---------------------------------------------------------------------------------------------
// Leitura da árvore devolvida pela página
// ---------------------------------------------------------------------------------------------
// Só os componentes de apresentação dos Relatórios são executados; os compartilhados (Cartao, Indicador,
// Linhas, Colunas, BarraSegmentada, Tabela...) ficam como elementos, para o teste conferir o que recebem.
const APRESENTACAO = new Set([
  "ConteudoRelatorios", "EstadoDoPainel", "Indicadores", "PainelDeVendas", "PainelDeRecebimentos", "PainelDoMix", "PainelDasLojas",
  "PainelDaMargem", "PainelDaCobertura", "PainelDoTicket", "PainelDosDescontos", "PainelDosItens", "PainelDaProducaoPorDia",
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
/** O texto junta os pedaços com um espaço só (JSX com trechos e valores vira vários pedaços). */
function ler(v: unknown) {
  const pedacos: string[] = [];
  const elementos: Elemento[] = [];
  percorrer(v, (e) => elementos.push(e), (t) => pedacos.push(t));
  return { texto: pedacos.join(" ").replace(/\s+/g, " "), elementos, doTipo: (tipo: string) => elementos.filter((e) => e.tipo === tipo).map((e) => e.props) };
}
/** Só o que aparece escrito: os filhos de cada elemento, sem as demais propriedades (classes, tons). */
function visivel(v: unknown): string {
  if (Array.isArray(v)) return v.map(visivel).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  return isValidElement<Linha>(v) ? visivel(v.props.children) : "";
}
/** As células de uma linha de tabela, como aparecem escritas. */
const celulas = (linha: Linha) => (linha.children as unknown[]).filter((c) => isValidElement(c)).map((c) => visivel(c).replace(/\s+/g, " ").trim());
const enderecosDe = (elementos: Elemento[]) => elementos.flatMap((e) => (typeof e.props.href === "string" ? [e.props.href] : []));

async function pagina(parametros: Record<string, string> = {}) {
  const lida = ler((await Relatorios({ searchParams: Promise.resolve(parametros) })) as ReactElement);
  const cartoes = lida.doTipo("Cartao");
  const indicadores = lida.doTipo("Indicador");
  const achar = (lista: Linha[], campo: string, valor: string) => {
    const achado = lista.find((x) => x[campo] === valor);
    if (!achado) throw new Error(`a tela não tem "${valor}"`);
    return achado;
  };
  const cartao = (titulo: string) => {
    const lido = ler(achar(cartoes, "titulo", titulo));
    return { ...lido, enderecos: enderecosDe(lido.elementos) };
  };
  return {
    ...lida,
    /** O bloco do título (sobretítulo com o recorte, e a exportação por dia). */
    titulo: primeiro(lida.doTipo("TituloPagina")),
    /** Títulos dos cartões, na ordem em que aparecem. */
    cartoes: cartoes.map((c) => String(c.titulo)),
    /** Tudo o que um cartão mostra (título, subtítulo, ação e conteúdo). */
    cartao,
    indicadores: indicadores.map((i) => String(i.rotulo)),
    indicador: (rotulo: string) => achar(indicadores, "rotulo", rotulo),
    /** Endereços das ligações e botões (as opções dos filtros ficam em `filtro`). */
    enderecos: enderecosDe(lida.elementos),
    filtro: (rotulo: string) => lida.doTipo("FiltroSegmentado").find((f) => f.rotulo === rotulo),
  };
}

// ---------------------------------------------------------------------------------------------
// Fatos fictícios, na forma das respostas do banco (todos os números em centavos)
// ---------------------------------------------------------------------------------------------
const SEM_DESFEITOS = { cancelamentos: 0, cancelado: 0, devolucoes: 0, devolvido: 0 };
const SEM_ITENS_DESFEITOS = { itens_cancelados: 0, cancelado: 0, itens_devolvidos: 0, devolvido: 0 };
const UMA_DEVOLUCAO = { ...SEM_DESFEITOS, devolucoes: 1, devolvido: 30_000 };

// Loja do turno, nos 14 dias: em 08/11, uma venda de R$ 1.200,00 (um aparelho sem custo gravado); em
// 10/11, duas vendas (R$ 3.300,00), R$ 200,00 de desconto em uma delas e a devolução de R$ 300,00.
const VENDAS_08 = { periodo: "2026-11-08", vendas: 1, vendido: 120_000, subtotal: 120_000, descontos: 0, ...SEM_DESFEITOS };
const VENDAS_10 = { periodo: "2026-11-10", vendas: 2, vendido: 330_000, subtotal: 350_000, descontos: 20_000, ...UMA_DEVOLUCAO };
const VENDAS = {
  totais: { vendas: 3, vendido: 450_000, subtotal: 470_000, descontos: 20_000, vendas_com_desconto: 1, ...UMA_DEVOLUCAO },
  periodos: [VENDAS_08, VENDAS_10],
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
  lojas: [{ unidade_id: LOJA, nome: "Santa Cândida (teste)", vendas: 3, vendido: 450_000, ...UMA_DEVOLUCAO }],
  vendedores: [
    { vendedor_id: ANA, vendas: 2, vendido: 330_000, ...UMA_DEVOLUCAO },
    { vendedor_id: BETO, vendas: 1, vendido: 120_000, ...SEM_DESFEITOS },
  ],
};
// Os 14 dias anteriores: 2 vendas (R$ 2.000,00) em 27/10, o dia equivalente a 10/11.
const ANTES = {
  totais: { vendas: 2, vendido: 200_000, subtotal: 200_000, descontos: 0, vendas_com_desconto: 0, ...SEM_DESFEITOS },
  periodos: [{ periodo: "2026-10-27", vendas: 2, vendido: 200_000, subtotal: 200_000, descontos: 0, ...SEM_DESFEITOS }],
  tipos: [], categorias: [], lojas: [], vendedores: [],
};
const SEM_VENDAS = { totais: { vendas: 0, vendido: 0, subtotal: 0, descontos: 0, vendas_com_desconto: 0, ...SEM_DESFEITOS }, periodos: [], tipos: [], categorias: [], lojas: [], vendedores: [] };
// A rede: a loja do turno e mais 2 vendas (R$ 2.500,00) da Loja 02 em 09/11, feitas pelo Caio.
const REDE = {
  ...VENDAS,
  totais: { vendas: 5, vendido: 700_000, subtotal: 720_000, descontos: 20_000, vendas_com_desconto: 1, ...UMA_DEVOLUCAO },
  periodos: [VENDAS_08, { periodo: "2026-11-09", vendas: 2, vendido: 250_000, subtotal: 250_000, descontos: 0, ...SEM_DESFEITOS }, VENDAS_10],
  lojas: [...VENDAS.lojas, { unidade_id: OUTRA, nome: "Loja 02 (teste)", vendas: 2, vendido: 250_000, ...SEM_DESFEITOS }],
  vendedores: [...VENDAS.vendedores, { vendedor_id: CAIO, vendas: 2, vendido: 250_000, ...SEM_DESFEITOS }],
};

// Pagamentos: R$ 600,00 em dinheiro com R$ 100,00 de troco, R$ 2.000,00 em Pix na maquininha e um
// aparelho de R$ 2.000,00 pela PayJoy com R$ 500,00 de entrada em Pix direto (o mesmo do Início).
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

// Margem bruta (o que public.margem_painel devolve), dia a dia.
const MARGEM_ZERADA = {
  itens: 0, vendido: 0, itens_com_custo: 0, vendido_com_custo: 0, custo: 0, itens_sem_custo: 0, vendido_sem_custo: 0,
  itens_devolvidos_com_custo: 0, devolvido_com_custo: 0, custo_devolvido: 0,
  itens_cancelados_com_custo: 0, cancelado_com_custo: 0, custo_cancelado: 0, margem: 0,
};
// 08/11: o aparelho vendido não tinha custo gravado. Houve movimento, e a margem do dia é desconhecida.
const MARGEM_08 = { ...MARGEM_ZERADA, itens: 1, vendido: 120_000, itens_sem_custo: 1, vendido_sem_custo: 120_000 };
// 10/11: 6 das 7 unidades com custo (a recarga não tem): R$ 3.200,00 vendidos com custo de R$ 2.200,00.
// A devolução tira R$ 300,00 de venda e devolve R$ 120,00 de custo: 1.000,00 − 180,00 = R$ 820,00.
const DEVOLUCAO_COM_CUSTO = { itens_devolvidos_com_custo: 1, devolvido_com_custo: 30_000, custo_devolvido: 12_000 };
const MARGEM_10 = {
  ...MARGEM_ZERADA, itens: 7, vendido: 330_000, itens_com_custo: 6, vendido_com_custo: 320_000, custo: 220_000, itens_sem_custo: 1, vendido_sem_custo: 10_000,
  ...DEVOLUCAO_COM_CUSTO, margem: 82_000,
};
const MARGEM_TOTAL = { ...MARGEM_10, itens: 8, vendido: 450_000, itens_sem_custo: 2, vendido_sem_custo: 130_000 };
const MARGEM = { totais: MARGEM_TOTAL, periodos: [{ periodo: "2026-11-08", ...MARGEM_08 }, { periodo: "2026-11-10", ...MARGEM_10 }], lojas_com_custo: 1, lojas_fora: 0 };
const MARGEM_SEM_FATOS = { totais: MARGEM_ZERADA, periodos: [], lojas_com_custo: 0, lojas_fora: 0 };
// Só os itens sem custo gravado: a margem é desconhecida (não é zero).
const MARGEM_SEM_CUSTO = { totais: MARGEM_08, periodos: [{ periodo: "2026-11-08", ...MARGEM_08 }], lojas_com_custo: 1, lojas_fora: 0 };

// Uma página do detalhe (public.margem_itens), da venda mais recente para a mais antiga.
const ITEM = {
  venda_id: "venda-1003", numero: 1003, concluida_em: "2026-11-10T17:15:00+00:00", unidade_id: LOJA, unidade: "Santa Cândida (teste)", situacao: "concluida",
  item_id: "item-1", tipo: "aparelho", variante: "Galaxy A55 128 GB (fictício)", sku: "A55-128",
  quantidade: 1, preco_unitario: 250_000, desconto: 20_000, valor: 230_000, custo_unitario: 150_000, margem: 80_000, devolvidos: 0,
};
const ITENS = {
  total: 4,
  itens: [
    ITEM,
    // A recarga não tem custo gravado: custo e margem vêm nulos, juntos.
    { ...ITEM, item_id: "item-2", tipo: "recarga", variante: "Recarga R$ 100 (fictícia)", sku: null, preco_unitario: 10_000, desconto: 0, valor: 10_000, custo_unitario: null, margem: null },
    // Uma das três capas foi devolvida depois: a linha continua mostrando o item como foi vendido.
    {
      ...ITEM, venda_id: "venda-1002", numero: 1002, concluida_em: "2026-11-10T14:40:00+00:00", item_id: "item-3", tipo: "acessorio", variante: "Capa (fictícia)", sku: "CAPA-01",
      quantidade: 3, preco_unitario: 10_000, desconto: 0, valor: 30_000, custo_unitario: 4_000, margem: 18_000, devolvidos: 1,
    },
    // Venda concluída e cancelada depois.
    {
      ...ITEM, venda_id: "venda-1001", numero: 1001, concluida_em: "2026-11-08T13:05:00+00:00", situacao: "cancelada", item_id: "item-4", tipo: "chip", variante: "Chip (fictício)", sku: "CHIP-01",
      preco_unitario: 1_000, desconto: 0, valor: 1_000, custo_unitario: 300, margem: 700,
    },
  ],
};

// Permissões de cada perfil, como na matriz de papéis do banco (só as que o menu e os relatórios perguntam).
const PERFIS = {
  dono: ["venda.registrar", "venda.ver_propria", "venda.ver_unidade", "venda.ver_todas", "ranking.ver", "custo.ver", "desconto.aprovar", "nota.aprovar", "caixa.abrir", "caixa.conferir", "estoque.consultar", "connect.operar", "connect.gerir", "cliente.buscar", "auditoria.ver", "usuarios.gerir", "unidades.gerir"],
  administrador: ["venda.ver_todas", "ranking.ver", "custo.ver", "estoque.consultar", "usuarios.gerir", "unidades.gerir", "auditoria.ver"],
  gerente: ["venda.registrar", "venda.ver_unidade", "ranking.ver", "custo.ver", "desconto.aprovar", "nota.aprovar", "caixa.abrir", "caixa.conferir", "estoque.consultar", "cliente.buscar", "auditoria.ver"],
  vendedor: ["venda.registrar", "venda.ver_propria", "caixa.abrir", "estoque.consultar", "cliente.buscar"],
  tecnico: [],
} as const;
function entrar(perfil: keyof typeof PERFIS, usuario = GESTOR) {
  cenario.permissoes = new Set<string>(PERFIS[perfil]);
  cenario.usuario = usuario;
}

const INDICADORES = ["Vendas realizadas", "Ticket médio", "Descontos concedidos", "Devoluções e cancelamentos", "Margem bruta", "Recebido na loja (registro)"];
const CONNECT = "Chips, ativações e recargas por dia";
const PAINEIS_DA_LOJA = ["Vendas", "Recebimentos por meio", "Margem bruta por dia", "Cobertura do custo", "Ticket médio por dia", "Descontos concedidos por dia", "Mix de vendas", CONNECT, "Margem por item"];
const PAINEIS_DA_REDE = [...PAINEIS_DA_LOJA.slice(0, 7), "Desempenho das lojas", CONNECT, "Margem por item"];
const PAINEIS_SEM_CUSTO = ["Vendas", "Recebimentos por meio", "Margem bruta", "Ticket médio por dia", "Descontos concedidos por dia", "Mix de vendas", CONNECT];
// Ora Connect (G4a): em 08/11, 1 chip vendido e 2 ativações; em 10/11, 1 recarga; 1 operação ainda sem confirmação.
const PRODUCAO = {
  totais: { chips: 1, ativacoes: 2, portabilidades: 0, recargas: 1, por_evidencia: 2, por_revisao: 1, valor_face_recargas: 2_000, em_andamento: 1, sem_resultado: 0, debito: 3_300, lojas_sem_custo: 0 },
  periodos: [{ periodo: "2026-11-08", chips: 1, ativacoes: 2, portabilidades: 0, recargas: 0 }, { periodo: "2026-11-10", chips: 0, ativacoes: 0, portabilidades: 0, recargas: 1 }],
};
// Os 14 dias da janela padrão, como o eixo e as tabelas os mostram.
const DIAS = ["28/10", "29/10", "30/10", "31/10", "01/11", "02/11", "03/11", "04/11", "05/11", "06/11", "07/11", "08/11", "09/11", "10/11"];
/** Um valor por dia dos 14: os dias citados com o valor dado; os demais, com `resto`. */
function porDia<T>(valores: Record<string, T>, resto: T): T[] {
  return DIAS.map((d) => (Object.hasOwn(valores, d) ? (valores[d] as T) : resto));
}
const errosRegistrados = () => vi.mocked(console.error).mock.calls;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, {
    usuario: GESTOR, permissoes: new Set<string>(), erroDaPermissao: null,
    vendas: VENDAS, anterior: ANTES, erroDeVendas: null, erroDoAnterior: null,
    financeiro: FINANCEIRO, erroDoFinanceiro: null, margem: MARGEM, erroDaMargem: null,
    itens: ITENS, erroDosItens: null, loteDosItens: null, producao: PRODUCAO, erroDaProducao: null,
    chamadas: {}, errosDasTabelas: {}, lidas: [], sessoes: [],
    tabelas: {
      unidades: [
        { id: OUTRA, nome: "Loja 02 (teste)", tipo: "loja_fisica" },
        { id: SEM_VENDA, nome: "Loja 03 (teste)", tipo: "loja_fisica" },
        { id: LOJA, nome: "Santa Cândida (teste)", tipo: "loja_fisica" },
        { id: DEFEITOS, nome: "DEFEITOS (teste)", tipo: "excecao" },
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
describe("Relatórios: o gerente acompanha a loja do turno", () => {
  beforeEach(() => entrar("gerente"));

  it("pergunta ao banco só pela loja do turno: 14 dias até agora e os 14 anteriores, dia a dia", async () => {
    const p = await pagina();
    const atual = { p_inicio: DESDE["14"], p_fim: FIM };
    expect(cenario.chamadas.vendas_painel).toStrictEqual([
      { ...atual, p_por_hora: false, p_unidade: LOJA },
      { ...ANTERIOR["14"], p_por_hora: false, p_unidade: LOJA },
    ]);
    expect(cenario.chamadas.financeiro_painel).toStrictEqual([{ ...atual, p_por_hora: false, p_unidade: LOJA }]);
    // A margem é pedida uma vez, só para o período atual; o detalhe, uma página de 50 itens.
    expect(cenario.chamadas.margem_painel).toStrictEqual([{ ...atual, p_unidade: LOJA }]);
    expect(cenario.chamadas.margem_itens).toStrictEqual([{ ...atual, p_unidade: LOJA, p_limite: 50, p_apos: 0 }]);
    // custo.ver é perguntado na loja do turno, uma vez; os nomes da equipe não são assunto dos relatórios.
    expect(cenario.chamadas.tem_permissao?.filter((c) => c.p_permissao === "custo.ver")).toStrictEqual([{ p_permissao: "custo.ver", p_unidade: LOJA }]);
    expect(cenario.chamadas.ranking_nomes).toBeUndefined();
    // Não lê o cadastro de lojas nem oferece troca de loja.
    expect(cenario.lidas).not.toContain("unidades");
    expect(p.filtro("Loja")).toBeUndefined();
    expect(p.filtro("Período")).toMatchObject({ opcoes: [
      { href: "/relatorios?periodo=7", rotulo: "7 dias", ativo: false },
      { href: "/relatorios", rotulo: "14 dias", ativo: true },
      { href: "/relatorios?periodo=30", rotulo: "30 dias", ativo: false },
    ] });
  });

  it("o endereço não amplia o recorte: ?loja de outra loja continua na loja do turno", async () => {
    const p = await pagina({ loja: OUTRA });
    expect(cenario.chamadas.vendas_painel?.map((c) => c.p_unidade)).toEqual([LOJA, LOJA]);
    for (const funcao of ["financeiro_painel", "margem_painel", "margem_itens"]) expect(cenario.chamadas[funcao]?.map((c) => c.p_unidade), funcao).toEqual([LOJA]);
    expect(p.titulo.sobretitulo).toBe("Santa Cândida (teste)");
    // Nenhum endereço da tela (ligações, filtros, exportações) leva a outra loja.
    expect(p.texto).not.toContain(OUTRA);
  });

  it("7 e 30 dias: as janelas mudam juntas (vendas, anterior, recebimentos, margem e detalhe)", async () => {
    for (const periodo of ["7", "30"] as const) {
      cenario.chamadas = {};
      const p = await pagina({ periodo });
      const atual = { p_inicio: DESDE[periodo], p_fim: FIM };
      expect(cenario.chamadas.vendas_painel).toStrictEqual([{ ...atual, p_por_hora: false, p_unidade: LOJA }, { ...ANTERIOR[periodo], p_por_hora: false, p_unidade: LOJA }]);
      expect(cenario.chamadas.financeiro_painel).toStrictEqual([{ ...atual, p_por_hora: false, p_unidade: LOJA }]);
      expect(cenario.chamadas.margem_painel).toStrictEqual([{ ...atual, p_unidade: LOJA }]);
      expect(cenario.chamadas.margem_itens).toStrictEqual([{ ...atual, p_unidade: LOJA, p_limite: 50, p_apos: 0 }]);
      expect(p.filtro("Período")?.opcoes).toContainEqual({ href: `/relatorios?periodo=${periodo}`, rotulo: `${periodo} dias`, ativo: true });
      expect(primeiro(p.cartao("Ticket médio por dia").doTipo("Linhas")).rotulosX).toHaveLength(Number(periodo));
    }
  });

  it("período desconhecido no endereço cai em 14 dias", async () => {
    for (const periodo of ["14", "365", "hoje", "toString"]) {
      cenario.chamadas = {};
      await pagina({ periodo });
      expect(cenario.chamadas.vendas_painel?.[0], periodo).toMatchObject({ p_inicio: DESDE["14"], p_fim: FIM });
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("Relatórios: o que a tela mostra com fatos", () => {
  beforeEach(() => entrar("gerente"));

  it("os seis números do período, com a comparação com os 14 dias anteriores", async () => {
    const p = await pagina();
    expect(p.indicadores).toEqual(INDICADORES);
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3", detalhe: "R$ 4.500,00 vendidos", variacao: { fracao: 0.5, referencia: "vs. os 14 dias anteriores", bomQuandoSobe: true } });
    expect(p.indicador("Ticket médio")).toMatchObject({ valor: "R$ 1.500,00", detalhe: "Vendido ÷ vendas concluídas", variacao: { fracao: 0.5 } });
    // Antes não houve desconto nem devolução: sem base, não há percentual.
    expect(p.indicador("Descontos concedidos")).toMatchObject({ valor: "R$ 200,00", detalhe: "4,3% do valor de tabela · 1 venda com desconto" });
    expect(p.indicador("Descontos concedidos").variacao).toBeUndefined();
    expect(p.indicador("Devoluções e cancelamentos")).toMatchObject({ valor: "R$ 300,00", detalhe: "1 devolução · 0 cancelamentos" });
    // 820,00 ÷ (3.200,00 − 300,00 devolvidos) = 28,3%; os 2 itens sem custo gravado ficam fora da conta, avisados.
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "R$ 820,00", detalhe: "28,3% do vendido com custo · 2 itens sem custo fora da conta", tom: "atencao" });
    // A margem não se compara com o período anterior: o custo de antes não é a base de agora.
    expect(p.indicador("Margem bruta").variacao).toBeUndefined();
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "R$ 3.000,00", detalhe: "Pagamentos confirmados, troco descontado. Não é liquidação" });
  });

  it("vendas por dia contra o dia equivalente dos 14 dias anteriores", async () => {
    const p = await pagina();
    expect(p.cartoes).toEqual(PAINEIS_DA_LOJA);
    const vendas = p.cartao("Vendas");
    expect(vendas.texto).toContain("Por dia · vendas concluídas, pela data da conclusão");
    for (const trecho of ["R$ 4.500,00", "3 vendas · R$ 4.200,00 depois de devoluções e cancelamentos", "Nos 14 dias anteriores: R$ 2.000,00 em 2 vendas."]) expect(vendas.texto).toContain(trecho);
    expect(vendas.doTipo("SeloVariacao")).toMatchObject([{ variacao: { fracao: 1.25, referencia: "vs. os 14 dias anteriores" } }]);
    const linhas = primeiro(vendas.doTipo("Linhas"));
    expect(linhas.rotulosX).toEqual(DIAS);
    expect(linhas.series).toMatchObject([
      { nome: "Estes 14 dias", serie: 1, valores: porDia({ "08/11": 120_000, "10/11": 330_000 }, 0) },
      { nome: "14 dias anteriores", serie: "comparacao", tracejada: true, valores: porDia({ "10/11": 200_000 }, 0) },
    ]);
    const tabela = primeiro(vendas.doTipo("TabelaDoGrafico"));
    expect(tabela.colunas).toEqual(["Dia", "Vendas", "Vendido", "Dia anterior equivalente", "Vendas no dia anterior", "Vendido no dia anterior"]);
    expect(tabela.linhas).toHaveLength(14);
    expect((tabela.linhas as string[][]).filter((l) => l[1] !== "0" || l[4] !== "0")).toEqual([
      ["08/11", "1", "R$ 1.200,00", "25/10", "0", "R$ 0,00"],
      ["10/11", "2", "R$ 3.300,00", "27/10", "2", "R$ 2.000,00"],
    ]);
    // O mix é o mesmo do Início; a loja do turno não tem o desempenho por loja.
    expect(primeiro(p.cartao("Mix de vendas").doTipo("BarraSegmentada")).partes).toMatchObject([{ nome: "Aparelhos", valor: 380_000 }, { nome: "Acessórios", valor: 40_000 }, { nome: "Ora Connect", valor: 30_000 }, { nome: "Serviços", valor: 0 }]);
  });

  it("o financeiro não tem 14 dias: as ligações abrem o de 30, o menor que cobre o período, e dizem qual é", async () => {
    let p = await pagina();
    expect(p.cartao("Vendas").texto).toContain("Conferir no financeiro (30 dias)");
    expect(p.cartao("Vendas").enderecos).toContain("/financeiro?periodo=30");
    const recebimentos = p.cartao("Recebimentos por meio");
    expect(recebimentos.texto).toContain("Ver pagamentos (30 dias)");
    expect(recebimentos.enderecos).toContain("/financeiro?periodo=30&ver=pagamentos");
    expect(recebimentos.texto).toContain("R$ 3.000,00");

    // Em 7 e 30 dias o recorte é o mesmo nos dois lugares: a ligação não precisa avisar.
    p = await pagina({ periodo: "7" });
    expect(p.cartao("Vendas").texto).toContain("Conferir no financeiro");
    expect(p.cartao("Vendas").texto).not.toContain("(30 dias)");
    expect(p.cartao("Vendas").enderecos).toContain("/financeiro?periodo=7");
    expect(p.cartao("Recebimentos por meio").enderecos).toContain("/financeiro?periodo=7&ver=pagamentos");
    expect(primeiro(p.cartao("Vendas").doTipo("Linhas")).series).toMatchObject([{ nome: "Estes 7 dias" }, { nome: "7 dias anteriores" }]);
  });

  it("título com a loja do recorte e as exportações no mesmo recorte da tela", async () => {
    let p = await pagina();
    expect(p.titulo).toMatchObject({ sobretitulo: "Santa Cândida (teste)", titulo: "Relatórios" });
    expect(p.enderecos).toContain("/relatorios/exportar");
    expect(p.cartao("Margem por item").enderecos).toContain("/relatorios/exportar?ver=itens");
    p = await pagina({ periodo: "30" });
    expect(p.enderecos).toEqual(expect.arrayContaining(["/relatorios/exportar?periodo=30", "/relatorios/exportar?periodo=30&ver=itens"]));
  });

  it("sem venda concluída no período: cada painel de vendas explica o vazio, sem inventar ticket", async () => {
    cenario.vendas = SEM_VENDAS;
    const p = await pagina();
    expect(p.indicador("Ticket médio")).toMatchObject({ valor: "Sem vendas" });
    expect(p.cartao("Vendas").texto).toContain("A leitura está funcionando; só não houve venda concluída no período");
    expect(p.cartao("Ticket médio por dia").texto).toContain("A leitura está funcionando; sem venda concluída não há ticket médio.");
    expect(p.cartao("Ticket médio por dia").doTipo("Linhas")).toEqual([]);
    expect(p.cartao("Descontos concedidos por dia").texto).toContain("A leitura está funcionando; sem venda concluída não há desconto concedido.");
    expect(p.cartao("Descontos concedidos por dia").doTipo("Colunas")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Relatórios: margem bruta por dia e cobertura do custo", () => {
  beforeEach(() => entrar("gerente"));

  it("por dia: o valor do período, o gráfico com o dia desconhecido em branco e a tabela com o total", async () => {
    const cartao = (await pagina()).cartao("Margem bruta por dia");
    expect(cartao.texto).toContain("R$ 820,00");
    expect(cartao.texto).toContain("28,3% do vendido com custo · 2 itens sem custo fora da conta");
    const linhas = primeiro(cartao.doTipo("Linhas"));
    expect(linhas.rotulosX).toEqual(DIAS);
    // 08/11 teve venda, e nenhum item dela tinha custo gravado: o ponto fica em branco (null), não zero.
    expect(linhas.series).toMatchObject([{ nome: "Margem bruta", serie: 1, valores: porDia<number | null>({ "08/11": null, "10/11": 82_000 }, 0) }]);
    expect(linhas.semValor).toBe("sem custo");
    expect(cartao.texto).toContain("Dia em branco no gráfico: houve movimento, e nenhum item dele tinha custo gravado. A margem desse dia é desconhecida, não zero.");
    const tabela = primeiro(cartao.doTipo("TabelaDoGrafico"));
    expect(tabela.colunas).toEqual(["Dia", "Margem bruta", "Vendido com custo (líquido)", "Custo", "Margem %", "Cobertura do custo", "Itens sem custo", "Vendido sem custo"]);
    const dias = tabela.linhas as string[][];
    expect(dias).toHaveLength(15);
    expect(dias[0]).toEqual(["28/10", "R$ 0,00", "R$ 0,00", "R$ 0,00", "—", "—", "0", "R$ 0,00"]);
    expect(dias[11]).toEqual(["08/11", "sem custo", "R$ 0,00", "R$ 0,00", "—", "0%", "1", "R$ 1.200,00"]);
    expect(dias[13]).toEqual(["10/11", "R$ 820,00", "R$ 2.900,00", "R$ 2.080,00", "28,3%", "97%", "1", "R$ 100,00"]);
    expect(dias[14]).toEqual(["Total", "R$ 820,00", "R$ 2.900,00", "R$ 2.080,00", "28,3%", "71,1%", "2", "R$ 1.300,00"]);
  });

  it("dia só com a devolução de uma venda anterior: a margem do dia fica abaixo de zero, com o sinal", async () => {
    // A devolução de 10/11 passa para 09/11; o total do período não muda.
    const MARGEM_09 = { ...MARGEM_ZERADA, ...DEVOLUCAO_COM_CUSTO, margem: -18_000 };
    const SO_VENDAS_10 = { ...MARGEM_10, itens_devolvidos_com_custo: 0, devolvido_com_custo: 0, custo_devolvido: 0, margem: 100_000 };
    cenario.margem = { ...MARGEM, periodos: [{ periodo: "2026-11-08", ...MARGEM_08 }, { periodo: "2026-11-09", ...MARGEM_09 }, { periodo: "2026-11-10", ...SO_VENDAS_10 }] };
    const cartao = (await pagina()).cartao("Margem bruta por dia");
    expect(primeiro(cartao.doTipo("Linhas")).series).toMatchObject([{ valores: porDia<number | null>({ "08/11": null, "09/11": -18_000, "10/11": 100_000 }, 0) }]);
    const dias = primeiro(cartao.doTipo("TabelaDoGrafico")).linhas as string[][];
    expect(dias[12]).toEqual(["09/11", "−R$ 180,00", "−R$ 300,00", "−R$ 120,00", "—", "—", "0", "R$ 0,00"]);
    expect(dias[13]).toEqual(["10/11", "R$ 1.000,00", "R$ 3.200,00", "R$ 2.200,00", "31,3%", "97%", "1", "R$ 100,00"]);
    expect(dias[14]?.[1]).toBe("R$ 820,00");
  });

  it("cobertura do custo: quanto do vendido entra na conta, e a conta da margem do período", async () => {
    const cartao = (await pagina()).cartao("Cobertura do custo");
    expect(primeiro(cartao.doTipo("p")).children).toBe("71,1%");
    expect(cartao.texto).toContain("do vendido tem custo gravado no item da venda · 2 itens sem custo ficaram fora da margem");
    expect(primeiro(cartao.doTipo("BarraSegmentada")).partes).toEqual([
      { nome: "Com custo", valor: 320_000, serie: 1 },
      { nome: "Sem custo", valor: 130_000, serie: "comparacao" },
    ]);
    expect(primeiro(cartao.doTipo("TabelaDoGrafico")).linhas).toEqual([
      ["Com custo gravado", "6", "R$ 3.200,00", "71,1%"],
      ["Sem custo gravado", "2", "R$ 1.300,00", "28,9%"],
      ["Total", "8", "R$ 4.500,00", "100%"],
    ]);
    expect(primeiro(cartao.doTipo("ListaDados")).itens).toEqual([
      ["Vendido com custo, depois de devoluções e cancelamentos", "R$ 2.900,00"],
      ["Custo desses itens", "R$ 2.080,00"],
      ["Margem bruta", "R$ 820,00"],
      ["Margem sobre o vendido com custo", "28,3%"],
      ["Itens sem custo gravado, fora da conta", "2"],
    ]);
    expect(cartao.texto).toContain("Não é lucro: taxa de meio de pagamento, comissão, frete e imposto ficam fora.");
  });

  it("sem movimento no período: margem zero, explicada, e a cobertura sem o que medir", async () => {
    Object.assign(cenario, { vendas: SEM_VENDAS, anterior: SEM_VENDAS, margem: MARGEM_SEM_FATOS, itens: { total: 0, itens: [] } });
    const p = await pagina();
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "R$ 0,00", detalhe: "Nenhuma venda, devolução ou cancelamento no período" });
    expect(p.indicador("Margem bruta").tom).toBeUndefined();
    const margem = p.cartao("Margem bruta por dia");
    expect(margem.texto).toContain("Nenhuma venda, devolução ou cancelamento no período");
    expect(margem.doTipo("Linhas")).toEqual([]);
    const cobertura = p.cartao("Cobertura do custo");
    expect(cobertura.texto).toContain("Nenhuma venda concluída no período");
    expect(cobertura.doTipo("ListaDados")).toEqual([]);
    expect(p.cartao("Margem por item").texto).toContain("Nenhum item em venda concluída no período");
    expect(p.cartao("Margem por item").enderecos).not.toContain("/relatorios/exportar?ver=itens");
  });

  it("movimento sem custo gravado: a margem é desconhecida, e nunca aparece como zero", async () => {
    cenario.margem = MARGEM_SEM_CUSTO;
    const p = await pagina();
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "Sem custo", tom: "atencao" });
    const margem = p.cartao("Margem bruta por dia");
    expect(margem.doTipo("Aviso")).toMatchObject([{ tom: "aviso", titulo: "Margem desconhecida" }]);
    expect(margem.texto).toContain("Isso não é margem zero: sem custo não há como calcular.");
    expect(margem.doTipo("Linhas")).toEqual([]);
    expect(margem.texto).not.toMatch(/R\$/);
    const cobertura = p.cartao("Cobertura do custo");
    expect(primeiro(cobertura.doTipo("p")).children).toBe("0%");
    expect(cobertura.texto).toContain("do vendido tem custo gravado no item da venda · 1 item sem custo ficou fora da margem");
    expect(cobertura.texto).toContain("Nenhum item do período tinha custo gravado: a margem é desconhecida, não zero.");
    expect(cobertura.doTipo("ListaDados")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Relatórios: ticket médio e descontos por dia", () => {
  beforeEach(() => entrar("gerente"));

  it("ticket médio de cada dia; dia sem venda fica em branco, não zero", async () => {
    const cartao = (await pagina()).cartao("Ticket médio por dia");
    expect(primeiro(cartao.doTipo("p")).children).toBe("R$ 1.500,00");
    expect(cartao.texto).toContain("Ticket médio do período · 3 vendas");
    expect(primeiro(cartao.doTipo("Linhas")).series).toMatchObject([{ nome: "Ticket médio", serie: 1, valores: porDia<number | null>({ "08/11": 120_000, "10/11": 165_000 }, null) }]);
    expect(cartao.texto).toContain("Dia sem venda concluída fica em branco no gráfico: sem venda não há ticket (não é zero).");
    const dias = primeiro(cartao.doTipo("TabelaDoGrafico")).linhas as string[][];
    expect(dias[0]).toEqual(["28/10", "0", "R$ 0,00", "sem venda"]);
    expect(dias.filter((l) => l[1] !== "0")).toEqual([["08/11", "1", "R$ 1.200,00", "R$ 1.200,00"], ["10/11", "2", "R$ 3.300,00", "R$ 1.650,00"]]);
  });

  it("descontos de cada dia, sobre o valor de tabela do dia", async () => {
    const cartao = (await pagina()).cartao("Descontos concedidos por dia");
    expect(primeiro(cartao.doTipo("p")).children).toBe("R$ 200,00");
    expect(cartao.texto).toContain("4,3% do valor de tabela · 1 venda com desconto");
    expect(primeiro(cartao.doTipo("Colunas")).dados).toEqual(DIAS.map((rotulo) => ({ rotulo, valor: rotulo === "10/11" ? 20_000 : 0 })));
    const dias = primeiro(cartao.doTipo("TabelaDoGrafico")).linhas as string[][];
    expect(dias[0]).toEqual(["28/10", "R$ 0,00", "R$ 0,00", "—"]);
    expect(dias[11]).toEqual(["08/11", "R$ 0,00", "R$ 1.200,00", "0%"]);
    expect(dias[13]).toEqual(["10/11", "R$ 200,00", "R$ 3.500,00", "5,7%"]);
  });

  it("vendas sem desconto: o cartão diz que saíram pelo valor de tabela", async () => {
    const semDesconto = { ...VENDAS_10, subtotal: 330_000, descontos: 0 };
    cenario.vendas = { ...VENDAS, totais: { ...VENDAS.totais, subtotal: 450_000, descontos: 0, vendas_com_desconto: 0 }, periodos: [VENDAS_08, semDesconto] };
    let cartao = (await pagina()).cartao("Descontos concedidos por dia");
    expect(cartao.texto).toContain("Nenhum desconto concedido no período");
    expect(cartao.texto).toContain("As 3 vendas concluídas no período saíram pelo valor de tabela.");
    expect(cartao.doTipo("Colunas")).toEqual([]);

    cenario.vendas = { ...VENDAS, totais: { ...VENDAS.totais, vendas: 1, vendido: 120_000, subtotal: 120_000, descontos: 0, vendas_com_desconto: 0, ...SEM_DESFEITOS }, periodos: [VENDAS_08] };
    cartao = (await pagina()).cartao("Descontos concedidos por dia");
    expect(cartao.texto).toContain("A venda concluída no período saiu pelo valor de tabela.");
  });
});

// ---------------------------------------------------------------------------------------------
describe("Relatórios: margem por item", () => {
  beforeEach(() => entrar("gerente"));
  const COLUNAS = ["Venda", "Produto", "Qtd.", "Valor", "Custo unit.", "Margem bruta", "Situação"];

  it("uma linha por item, como foi vendido; sem custo gravado não vira zero", async () => {
    const cartao = (await pagina()).cartao("Margem por item");
    expect(primeiro(cartao.doTipo("Tabela"))).toMatchObject({ legenda: "Margem por item", colunas: COLUNAS, alinharDireita: [2, 3, 4, 5] });
    expect(cartao.doTipo("tr").map(celulas)).toEqual([
      ["Venda 1003 10/11, 14:15", "Galaxy A55 128 GB (fictício) Aparelho · A55-128", "1", "R$ 2.300,00", "R$ 1.500,00", "R$ 800,00", "concluída"],
      ["Venda 1003 10/11, 14:15", "Recarga R$ 100 (fictícia) Recarga", "1", "R$ 100,00", "sem custo", "—", "concluída"],
      ["Venda 1002 10/11, 11:40", "Capa (fictícia) Acessório · CAPA-01", "3", "R$ 300,00", "R$ 40,00", "R$ 180,00", "concluída 1 unidade devolvida"],
      ["Venda 1001 08/11, 10:05", "Chip (fictício) Chip · CHIP-01", "1", "R$ 10,00", "R$ 3,00", "R$ 7,00", "cancelada"],
    ]);
    // Cada venda abre o detalhe dela; a situação vai num selo com nome (não só cor).
    expect(cartao.enderecos.filter((e) => e.startsWith("/vendas/"))).toEqual(["/vendas/venda-1003", "/vendas/venda-1003", "/vendas/venda-1002", "/vendas/venda-1001"]);
    expect(cartao.doTipo("Selo")).toMatchObject([{ tom: "sucesso" }, { tom: "sucesso" }, { tom: "sucesso" }, { tom: "neutro" }]);
    expect(cartao.texto).toContain("Devolução e cancelamento não mudam a linha");
    expect(cartao.texto).not.toContain("Não entram os itens");
    // Até 50 itens não há páginas; o arquivo traz todos os itens do período.
    expect(cartao.doTipo("BotaoLink")).toEqual([]);
    expect(cartao.enderecos).toContain("/relatorios/exportar?ver=itens");
  });

  it("mais de 50 itens: página a página, no mesmo recorte, voltando ao detalhe", async () => {
    cenario.itens = { ...ITENS, total: 120 };
    let cartao = (await pagina({ pagina: "2" })).cartao("Margem por item");
    expect(cenario.chamadas.margem_itens).toStrictEqual([{ p_inicio: DESDE["14"], p_fim: FIM, p_unidade: LOJA, p_limite: 50, p_apos: 50 }]);
    expect(cartao.texto).toContain("51–100 de 120");
    expect(cartao.doTipo("BotaoLink").map((b) => [b.children, b.href])).toEqual([["Anterior", "/relatorios#itens"], ["Próxima", "/relatorios?pagina=3#itens"]]);

    cenario.chamadas = {};
    cartao = (await pagina({ periodo: "7", pagina: "3" })).cartao("Margem por item");
    expect(cenario.chamadas.margem_itens).toStrictEqual([{ p_inicio: DESDE["7"], p_fim: FIM, p_unidade: LOJA, p_limite: 50, p_apos: 100 }]);
    expect(cartao.texto).toContain("101–120 de 120");
    expect(cartao.doTipo("BotaoLink").map((b) => [b.children, b.href])).toEqual([["Anterior", "/relatorios?periodo=7&pagina=2#itens"]]);
  });

  it("página do endereço que não é número cai na primeira", async () => {
    for (const valor of ["0", "-3", "abc"]) {
      cenario.chamadas = {};
      await pagina({ pagina: valor });
      expect(cenario.chamadas.margem_itens?.[0], valor).toMatchObject({ p_apos: 0 });
    }
  });

  it("página depois do fim da lista: diz quantos itens há e leva de volta à primeira", async () => {
    cenario.itens = { total: 120, itens: [] };
    const cartao = (await pagina({ pagina: "9" })).cartao("Margem por item");
    expect(cartao.texto).toContain("Esta página não tem itens");
    expect(cartao.texto).toContain("O período tem 120 itens ao todo.");
    expect(cartao.doTipo("BotaoLink").map((b) => [b.children, b.href])).toEqual([["Voltar à primeira página", "/relatorios#itens"]]);
    expect(cartao.doTipo("Tabela")).toEqual([]);
    expect(cartao.enderecos).toContain("/relatorios/exportar?ver=itens");
  });
});

// ---------------------------------------------------------------------------------------------
describe("Relatórios: quem vê a rede escolhe a loja", () => {
  beforeEach(() => {
    entrar("dono");
    cenario.vendas = REDE;
  });

  it("começa pela rede inteira: perguntas sem loja, filtro de lojas e desempenho por loja", async () => {
    const p = await pagina();
    const atual = { p_inicio: DESDE["14"], p_fim: FIM };
    expect(cenario.chamadas.vendas_painel).toStrictEqual([{ ...atual, p_por_hora: false }, { ...ANTERIOR["14"], p_por_hora: false }]);
    expect(cenario.chamadas.financeiro_painel).toStrictEqual([{ ...atual, p_por_hora: false }]);
    expect(cenario.chamadas.margem_painel).toStrictEqual([atual]);
    expect(cenario.chamadas.margem_itens).toStrictEqual([{ ...atual, p_limite: 50, p_apos: 0 }]);
    expect(cenario.lidas).toEqual(["unidades"]);
    expect(p.titulo.sobretitulo).toBe("Rede inteira");
    expect(p.cartoes).toEqual(PAINEIS_DA_REDE);
    expect(p.filtro("Loja")).toMatchObject({ opcoes: [
      { href: "/relatorios", rotulo: "Rede inteira", ativo: true },
      { href: `/relatorios?loja=${LOJA}`, rotulo: "Santa Cândida (teste)", ativo: false },
      { href: `/relatorios?loja=${OUTRA}`, rotulo: "Loja 02 (teste)", ativo: false },
      { href: `/relatorios?loja=${SEM_VENDA}`, rotulo: "Loja 03 (teste)", ativo: false },
    ] });
    // DEFEITOS guarda itens com problema e não vende: fica fora do filtro e do desempenho.
    expect(p.texto).not.toContain("DEFEITOS");
    const lojas = p.cartao("Desempenho das lojas");
    expect(primeiro(lojas.doTipo("BarrasHorizontais")).dados).toMatchObject([
      { rotulo: "Santa Cândida (teste)", valor: 450_000 }, { rotulo: "Loja 02 (teste)", valor: 250_000 }, { rotulo: "Loja 03 (teste)", valor: 0 },
    ]);
    expect(lojas.enderecos).toEqual([`/relatorios?loja=${LOJA}`, `/relatorios?loja=${OUTRA}`, `/relatorios?loja=${SEM_VENDA}`]);
    expect(p.enderecos).toEqual(expect.arrayContaining(["/relatorios/exportar", "/relatorios/exportar?ver=itens", "/financeiro?periodo=30&loja=rede", "/financeiro?periodo=30&loja=rede&ver=pagamentos"]));
  });

  it("na rede inteira, cada linha do detalhe diz a loja da venda", async () => {
    const cartao = (await pagina()).cartao("Margem por item");
    expect(primeiro(cartao.doTipo("Tabela"))).toMatchObject({ colunas: ["Venda", "Produto", "Qtd.", "Valor", "Custo unit.", "Margem bruta", "Situação"], alinharDireita: [2, 3, 4, 5] });
    expect(celulas(primeiro(cartao.doTipo("tr")))).toEqual(["Venda 1003 10/11, 14:15 · Santa Cândida (teste)", "Galaxy A55 128 GB (fictício) Aparelho · A55-128", "1", "R$ 2.300,00", "R$ 1.500,00", "R$ 800,00", "concluída"]);
  });

  it("?loja escolhe uma loja do cadastro: todas as perguntas e todos os endereços levam a loja", async () => {
    const p = await pagina({ loja: OUTRA, periodo: "7" });
    for (const funcao of ["vendas_painel", "financeiro_painel", "margem_painel", "margem_itens"]) {
      expect(cenario.chamadas[funcao]?.map((c) => c.p_unidade), funcao).toEqual(funcao === "vendas_painel" ? [OUTRA, OUTRA] : [OUTRA]);
    }
    expect(p.titulo.sobretitulo).toBe("Loja 02 (teste)");
    expect(p.cartoes).toEqual(PAINEIS_DA_LOJA);
    expect(p.filtro("Loja")?.opcoes).toContainEqual({ href: `/relatorios?periodo=7&loja=${OUTRA}`, rotulo: "Loja 02 (teste)", ativo: true });
    expect(p.filtro("Loja")?.opcoes).toContainEqual({ href: "/relatorios?periodo=7", rotulo: "Rede inteira", ativo: false });
    expect(p.filtro("Período")?.opcoes).toContainEqual({ href: `/relatorios?loja=${OUTRA}`, rotulo: "14 dias", ativo: false });
    expect(p.enderecos).toEqual(expect.arrayContaining([
      `/relatorios/exportar?periodo=7&loja=${OUTRA}`, `/relatorios/exportar?periodo=7&loja=${OUTRA}&ver=itens`,
      `/financeiro?periodo=7&loja=${OUTRA}`, `/financeiro?periodo=7&loja=${OUTRA}&ver=pagamentos`,
    ]));
    // Uma loja só: o detalhe não repete a loja em cada linha.
    expect(celulas(primeiro(p.cartao("Margem por item").doTipo("tr")))[0]).toBe("Venda 1003 10/11, 14:15");
  });

  it("loja fora do cadastro lido (DEFEITOS, desconhecida) volta para a rede inteira", async () => {
    for (const loja of [DEFEITOS, "00000000-0000-4000-8000-000000000999", "rede"]) {
      cenario.chamadas = {};
      const p = await pagina({ loja });
      expect(cenario.chamadas.vendas_painel?.[0], loja).not.toHaveProperty("p_unidade");
      expect(p.titulo.sobretitulo).toBe("Rede inteira");
    }
  });

  it("loja com movimento em que a pessoa não vê o custo: a margem das demais aparece, e o que ficou fora é dito", async () => {
    entrar("administrador");
    cenario.margem = { ...MARGEM, lojas_fora: 1 };
    const p = await pagina();
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "R$ 820,00", detalhe: "28,3% do vendido com custo · 2 itens sem custo fora da conta · 1 loja fora (custo não visível para você)", tom: "atencao" });
    expect(p.cartao("Margem bruta por dia").texto).toContain("1 loja fora (custo não visível para você)");
    expect(primeiro(p.cartao("Cobertura do custo").doTipo("ListaDados")).itens).toContainEqual(["Lojas com movimento fora da conta (custo não visível para você)", "1"]);
    expect(p.cartao("Margem por item").texto).toContain("Não entram os itens de 1 loja em que você não vê o custo.");
  });

  it("movimento só em lojas em que a pessoa não vê o custo: nenhum número de margem, com o motivo", async () => {
    entrar("administrador");
    Object.assign(cenario, { margem: { ...MARGEM_SEM_FATOS, lojas_fora: 2 }, itens: { total: 0, itens: [] } });
    const p = await pagina();
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "—", detalhe: "O movimento do período foi só em loja em que você não vê o custo" });
    for (const titulo of ["Margem bruta por dia", "Cobertura do custo", "Margem por item"]) {
      const cartao = p.cartao(titulo);
      expect(cartao.doTipo("Aviso"), titulo).toMatchObject([{ tom: "neutro", titulo: "Sem permissão" }]);
      expect(cartao.texto).toContain("O movimento do período foi só em loja em que você não vê o custo dos produtos");
      expect(cartao.texto).not.toMatch(/R\$/);
    }
  });

  it("sem a lista de lojas não dá para conferir o recorte: nenhum número, e o banco não é perguntado", async () => {
    cenario.errosDasTabelas.unidades = { code: "57014" };
    const p = await pagina({ loja: OUTRA });
    for (const funcao of ["vendas_painel", "financeiro_painel", "margem_painel", "margem_itens"]) expect(cenario.chamadas[funcao], funcao).toBeUndefined();
    expect(p.filtro("Loja")).toBeUndefined();
    for (const rotulo of INDICADORES) expect(p.indicador(rotulo), rotulo).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora", tom: "atencao" });
    expect(p.cartoes).toEqual(PAINEIS_DA_REDE);
    for (const titulo of PAINEIS_DA_REDE) expect(p.cartao(titulo).doTipo("Aviso"), titulo).toMatchObject([{ tom: "perigo", titulo: "Não foi possível ler agora" }]);
    expect(errosRegistrados()).toEqual([["relatorios: falha ao consultar as lojas", { codigo: "57014" }]]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Relatórios: sem a permissão de ver o custo", () => {
  beforeEach(() => {
    entrar("gerente");
    cenario.permissoes.delete("custo.ver");
  });

  it("a margem não é pedida ao banco; um cartão diz por quê, e o resto do relatório continua", async () => {
    const p = await pagina();
    expect(cenario.chamadas.margem_painel).toBeUndefined();
    expect(cenario.chamadas.margem_itens).toBeUndefined();
    expect(cenario.chamadas.vendas_painel).toHaveLength(2);
    expect(p.cartoes).toEqual(PAINEIS_SEM_CUSTO);
    expect(p.indicadores).toEqual(INDICADORES);
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "—", detalhe: "Só quem vê o custo dos produtos acompanha a margem" });
    expect(p.indicador("Margem bruta").tom).toBeUndefined();
    const margem = p.cartao("Margem bruta");
    expect(margem.doTipo("Aviso")).toMatchObject([{ tom: "neutro", titulo: "Sem permissão" }]);
    expect(margem.texto).toContain("Você não tem a permissão de ver o custo dos produtos nesta loja; sem ela, a margem não é mostrada.");
    // A exportação por dia continua (sem as colunas de margem); o detalhe por item não aparece.
    expect(p.enderecos).toContain("/relatorios/exportar");
    expect(p.texto).not.toContain("ver=itens");
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
  });
});

// ---------------------------------------------------------------------------------------------
describe("Relatórios: cada leitura com o seu estado", () => {
  beforeEach(() => entrar("gerente"));
  const PAINEIS_DE_VENDAS = ["Vendas", "Ticket médio por dia", "Descontos concedidos por dia", "Mix de vendas"];
  const INDICADORES_DE_VENDAS = INDICADORES.slice(0, 4);

  it("vendas indisponíveis no ambiente: sem número, com o motivo, e nada no registro", async () => {
    cenario.erroDeVendas = cenario.erroDoAnterior = { code: "PGRST202" };
    const p = await pagina();
    expect(p.cartoes).toEqual(PAINEIS_DA_LOJA);
    for (const rotulo of INDICADORES_DE_VENDAS) expect(p.indicador(rotulo), rotulo).toMatchObject({ valor: "—", detalhe: "Indisponível neste ambiente", tom: "atencao" });
    for (const titulo of PAINEIS_DE_VENDAS) {
      const cartao = p.cartao(titulo);
      expect(cartao.doTipo("Aviso"), titulo).toMatchObject([{ tom: "aviso", titulo: "Indisponível neste ambiente" }]);
      expect(cartao.texto).toContain("migration vendas_painel");
    }
    // A margem e os recebimentos são outras leituras: continuam.
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "R$ 820,00" });
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "R$ 3.000,00" });
    expect(errosRegistrados()).toEqual([]);
  });

  it("falha nas vendas: nenhum número, tentar de novo no mesmo recorte e registro só com o código", async () => {
    cenario.erroDeVendas = { code: "57014" };
    const p = await pagina({ periodo: "30", pagina: "2" });
    for (const rotulo of INDICADORES_DE_VENDAS) expect(p.indicador(rotulo), rotulo).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora", tom: "atencao" });
    for (const titulo of PAINEIS_DE_VENDAS) {
      const cartao = p.cartao(titulo);
      expect(cartao.doTipo("Aviso"), titulo).toMatchObject([{ tom: "perigo", titulo: "Não foi possível ler agora" }]);
      expect(cartao.texto).toContain("Nenhum número é mostrado: falha de leitura não vira zero.");
      expect(cartao.enderecos).toContain("/relatorios?periodo=30&pagina=2");
    }
    expect(errosRegistrados()).toEqual([["inicio: falha ao consultar vendas_painel", { codigo: "57014" }]]);
  });

  it("vendas em forma inesperada são falha, não zero", async () => {
    cenario.vendas = { ...VENDAS, totais: { ...VENDAS.totais, vendido: undefined } };
    const p = await pagina();
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora" });
    expect(p.cartao("Ticket médio por dia").texto).toContain("falha de leitura não vira zero");
    expect(errosRegistrados()).toEqual([["inicio: resposta inesperada de vendas_painel"]]);
  });

  it("período anterior sem leitura: os números do período aparecem, sem comparação", async () => {
    cenario.erroDoAnterior = { code: "57014" };
    const p = await pagina();
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3", detalhe: "R$ 4.500,00 vendidos · sem comparação agora" });
    expect(p.indicador("Vendas realizadas").variacao).toBeUndefined();
    const vendas = p.cartao("Vendas");
    expect(vendas.texto).toContain("O período anterior não pôde ser lido agora: sem comparação.");
    expect(primeiro(vendas.doTipo("Linhas")).series).toHaveLength(1);
    expect(vendas.doTipo("SeloVariacao")).toEqual([]);
    expect(errosRegistrados()).toEqual([["inicio: falha ao consultar vendas_painel", { codigo: "57014" }]]);
  });

  it("recebimentos sem leitura: só o indicador e o cartão deles ficam sem número", async () => {
    cenario.erroDoFinanceiro = { code: "57014" };
    const p = await pagina();
    expect(p.indicador("Recebido na loja (registro)")).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora", tom: "atencao" });
    expect(p.cartao("Recebimentos por meio").doTipo("Aviso")).toMatchObject([{ tom: "perigo", titulo: "Não foi possível ler agora" }]);
    expect(p.cartao("Recebimentos por meio").doTipo("BarraSegmentada")).toEqual([]);
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "R$ 820,00" });
    expect(errosRegistrados()).toEqual([["inicio: falha ao ler financeiro_painel", { motivo: "consulta" }]]);
  });

  it("margem indisponível ou em falha: os dois cartões da margem sem número; o detalhe é outra leitura", async () => {
    cenario.erroDaMargem = { code: "PGRST202" };
    let p = await pagina();
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "—", detalhe: "Indisponível neste ambiente", tom: "atencao" });
    for (const titulo of ["Margem bruta por dia", "Cobertura do custo"]) {
      expect(p.cartao(titulo).doTipo("Aviso"), titulo).toMatchObject([{ tom: "aviso", titulo: "Indisponível neste ambiente" }]);
      expect(p.cartao(titulo).texto).toContain("migration margem_painel");
    }
    expect(p.cartao("Margem por item").doTipo("tr")).toHaveLength(4);
    expect(errosRegistrados()).toEqual([]);

    cenario.erroDaMargem = { code: "57014" };
    p = await pagina();
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora", tom: "atencao" });
    for (const titulo of ["Margem bruta por dia", "Cobertura do custo"]) {
      expect(p.cartao(titulo).doTipo("Aviso"), titulo).toMatchObject([{ tom: "perigo", titulo: "Não foi possível ler agora" }]);
      expect(p.cartao(titulo).enderecos).toContain("/relatorios");
    }
    expect(p.indicador("Vendas realizadas")).toMatchObject({ valor: "3" });
    expect(errosRegistrados()).toEqual([["margem: falha ao consultar margem_painel", { codigo: "57014" }]]);
  });

  it("margem com a conta que não fecha é falha: melhor nenhum número do que uma conta que não bate", async () => {
    cenario.margem = { ...MARGEM, totais: { ...MARGEM_TOTAL, margem: 82_001 } };
    const p = await pagina();
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora" });
    expect(p.cartao("Margem bruta por dia").doTipo("Aviso")).toMatchObject([{ tom: "perigo" }]);
    expect(p.cartao("Cobertura do custo").doTipo("Aviso")).toMatchObject([{ tom: "perigo" }]);
    expect(errosRegistrados()).toEqual([["margem: resposta inesperada de margem_painel"]]);
  });

  it("detalhe por item indisponível, em falha ou em forma inesperada: só o cartão dele fica sem número", async () => {
    cenario.erroDosItens = { code: "PGRST202" };
    let p = await pagina();
    let itens = p.cartao("Margem por item");
    expect(itens.doTipo("Aviso")).toMatchObject([{ tom: "aviso", titulo: "Indisponível neste ambiente" }]);
    expect(itens.texto).toContain("migration margem_painel");
    expect(p.indicador("Margem bruta")).toMatchObject({ valor: "R$ 820,00" });
    expect(errosRegistrados()).toEqual([]);

    cenario.erroDosItens = { code: "57014" };
    p = await pagina({ pagina: "2" });
    itens = p.cartao("Margem por item");
    expect(itens.doTipo("Aviso")).toMatchObject([{ tom: "perigo", titulo: "Não foi possível ler agora" }]);
    expect(itens.enderecos).toContain("/relatorios?pagina=2");
    expect(errosRegistrados()).toEqual([["margem: falha ao consultar margem_itens", { codigo: "57014" }]]);

    // Item com custo e sem margem (ou o contrário): a página inteira é recusada.
    cenario.erroDosItens = null;
    cenario.itens = { ...ITENS, itens: [{ ...ITEM, margem: null }] };
    itens = (await pagina()).cartao("Margem por item");
    expect(itens.doTipo("Aviso")).toMatchObject([{ tom: "perigo", titulo: "Não foi possível ler agora" }]);
    expect(errosRegistrados().at(-1)).toEqual(["margem: resposta inesperada de margem_itens"]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Relatórios: quem não é da gerência não vê número nenhum", () => {
  it.each(["vendedor", "tecnico"] as const)("%s: sem permissão, e nenhuma pergunta de número ao banco", async (perfil) => {
    entrar(perfil);
    const p = await pagina();
    expect(p.doTipo("Aviso")).toMatchObject([{ tom: "aviso", titulo: "Sem permissão" }]);
    expect(p.texto).toContain("Os relatórios são da gerência e da diretoria.");
    expect(p.titulo).toMatchObject({ titulo: "Relatórios" });
    // Só o menu foi perguntado; nem custo.ver, nem leitura de tabela.
    expect(Object.keys(cenario.chamadas)).toEqual(["tem_permissao"]);
    expect(cenario.chamadas.tem_permissao?.map((c) => c.p_permissao)).not.toContain("custo.ver");
    expect(cenario.lidas).toEqual([]);
    expect(p.cartoes).toEqual([]);
    expect(p.indicadores).toEqual([]);
    expect(p.enderecos.filter((e) => e.startsWith("/relatorios/exportar"))).toEqual([]);
  });

  it("sem resposta sobre uma permissão a página para: não há como decidir o que mostrar", async () => {
    entrar("gerente");
    for (const permissao of ["venda.ver_unidade", "custo.ver"]) {
      cenario.erroDaPermissao = permissao;
      cenario.chamadas = {};
      await expect(pagina(), permissao).rejects.toBeInstanceOf(FalhaDoServico);
      expect(cenario.chamadas.vendas_painel).toBeUndefined();
      expect(cenario.chamadas.margem_painel).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("Relatórios: sessão e carregamento", () => {
  it("o layout exige sessão com loja antes de qualquer conteúdo (inclusive do esqueleto)", async () => {
    await expect(LayoutRelatorios({ children: "conteúdo" })).resolves.toBe("conteúdo");
    expect(cenario.sessoes).toEqual([{ exigirLoja: true }]);
  });

  it("a página e a exportação também conferem a sessão com loja", async () => {
    entrar("gerente");
    await pagina();
    await exportar(new Request("http://teste/relatorios/exportar"));
    expect(cenario.sessoes).toEqual([{ exigirLoja: true }, { exigirLoja: true }]);
  });

  it("o esqueleto de carregamento avisa que está carregando e não mostra texto nem número", () => {
    const esqueleto = CarregandoRelatorios() as ReactElement<Linha>;
    expect(esqueleto.props).toMatchObject({ "aria-busy": "true", "aria-label": "Carregando os relatórios" });
    const { elementos } = ler(esqueleto);
    expect(elementos.length).toBeGreaterThan(10);
    expect(elementos.filter((e) => typeof e.props.children === "string" || typeof e.props.children === "number")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// /relatorios/exportar: a mesma permissão e o mesmo recorte da tela, conferidos no servidor
// ---------------------------------------------------------------------------------------------
async function baixar(caminho: string) {
  const resposta = await exportar(new Request(`http://teste${caminho}`));
  // O BOM vai nos bytes (o Excel precisa dele); o TextDecoder o tira ao decodificar.
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  return { resposta, bytes, linhas: new TextDecoder().decode(bytes).split("\r\n") };
}
const lote = (total: number, apos: number, quantos: number) => ({
  data: { total, itens: Array.from({ length: quantos }, (_, i) => ({ ...ITEM, item_id: `item-${apos + i}` })) }, error: null,
});

describe("/relatorios/exportar", () => {
  const CABECALHO_DE_VENDAS = "Dia;Vendas;Vendido (R$);Ticket médio (R$);Valor de tabela (R$);Descontos (R$);Cancelamentos;Cancelado (R$);Devoluções;Devolvido (R$);Líquido (R$)";
  const CABECALHO_DA_MARGEM = "Margem bruta (R$);Vendido com custo, líquido (R$);Custo (R$);Margem (%);Cobertura do custo (%);Itens sem custo;Vendido sem custo (R$)";

  it("gerente: uma linha por dia dos 14, com a margem, pronta para o Excel em português", async () => {
    entrar("gerente");
    const { resposta, bytes, linhas } = await baixar("/relatorios/exportar");
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(resposta.headers.get("content-disposition")).toBe('attachment; filename="ora5g-relatorio-por-dia-14-dias.csv"');
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(linhas[0]).toBe(`${CABECALHO_DE_VENDAS};${CABECALHO_DA_MARGEM}`);
    expect(linhas).toHaveLength(16);
    expect(linhas[1]).toBe("28/10/2026;0;0,00;;0,00;0,00;0;0,00;0;0,00;0,00;0,00;0,00;0,00;;;0;0,00");
    // 08/11: houve venda, e nenhum item tinha custo gravado: a margem do dia fica vazia, não zero.
    expect(linhas[12]).toBe("08/11/2026;1;1200,00;1200,00;1200,00;0,00;0;0,00;0;0,00;1200,00;;0,00;0,00;;0,0;1;1200,00");
    expect(linhas[14]).toBe("10/11/2026;2;3300,00;1650,00;3500,00;200,00;0;0,00;1;300,00;3000,00;820,00;2900,00;2080,00;28,3;97,0;1;100,00");
    expect(linhas[15]).toBe("Total;3;4500,00;1500,00;4700,00;200,00;0;0,00;1;300,00;4200,00;820,00;2900,00;2080,00;28,3;71,1;2;1300,00");
    // O mesmo recorte da tela, lido uma vez; recebimentos e o detalhe por item não entram neste arquivo.
    expect(cenario.chamadas.vendas_painel).toStrictEqual([{ p_inicio: DESDE["14"], p_fim: FIM, p_por_hora: false, p_unidade: LOJA }]);
    expect(cenario.chamadas.margem_painel).toStrictEqual([{ p_inicio: DESDE["14"], p_fim: FIM, p_unidade: LOJA }]);
    expect(cenario.chamadas.financeiro_painel).toBeUndefined();
    expect(cenario.chamadas.margem_itens).toBeUndefined();
  });

  it("sem a permissão de ver o custo: o arquivo sai sem as colunas de margem, e a margem nem é pedida", async () => {
    entrar("gerente");
    cenario.permissoes.delete("custo.ver");
    const { resposta, linhas } = await baixar("/relatorios/exportar?periodo=7");
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-disposition")).toBe('attachment; filename="ora5g-relatorio-por-dia-7-dias.csv"');
    expect(linhas[0]).toBe(CABECALHO_DE_VENDAS);
    expect(linhas).toHaveLength(9);
    expect(linhas.join("\n")).not.toMatch(/[Cc]usto|[Mm]argem/);
    expect(cenario.chamadas.margem_painel).toBeUndefined();
    expect(cenario.chamadas.vendas_painel).toStrictEqual([{ p_inicio: DESDE["7"], p_fim: FIM, p_por_hora: false, p_unidade: LOJA }]);
  });

  it("detalhe por item: uma linha por item, com custo e margem vazios quando o custo não foi gravado", async () => {
    entrar("gerente");
    const { resposta, linhas } = await baixar("/relatorios/exportar?ver=itens");
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-disposition")).toBe('attachment; filename="ora5g-relatorio-margem-por-item-14-dias.csv"');
    expect(linhas).toEqual([
      "Venda;Concluída em;Loja;Situação da venda;Tipo;Produto;SKU;Quantidade;Preço unitário (R$);Desconto (R$);Valor (R$);Custo unitário (R$);Margem bruta (R$);Unidades devolvidas",
      "1003;10/11/2026 14:15;Santa Cândida (teste);concluída;Aparelho;Galaxy A55 128 GB (fictício);A55-128;1;2500,00;200,00;2300,00;1500,00;800,00;0",
      "1003;10/11/2026 14:15;Santa Cândida (teste);concluída;Recarga;Recarga R$ 100 (fictícia);;1;100,00;0,00;100,00;;;0",
      "1002;10/11/2026 11:40;Santa Cândida (teste);concluída;Acessório;Capa (fictícia);CAPA-01;3;100,00;0,00;300,00;40,00;180,00;1",
      "1001;08/11/2026 10:05;Santa Cândida (teste);cancelada;Chip;Chip (fictício);CHIP-01;1;10,00;0,00;10,00;3,00;7,00;0",
    ]);
    expect(cenario.chamadas.margem_itens).toStrictEqual([{ p_inicio: DESDE["14"], p_fim: FIM, p_unidade: LOJA, p_limite: 1000, p_apos: 0 }]);
    expect(cenario.chamadas.vendas_painel).toBeUndefined();
  });

  it("o detalhe vem do banco em lotes de 1.000, até o total", async () => {
    entrar("gerente");
    cenario.loteDosItens = (a) => lote(2_345, Number(a.p_apos), Math.min(Number(a.p_limite), 2_345 - Number(a.p_apos)));
    const { linhas } = await baixar("/relatorios/exportar?ver=itens");
    expect(cenario.chamadas.margem_itens?.map((c) => [c.p_limite, c.p_apos])).toEqual([[1000, 0], [1000, 1000], [1000, 2000]]);
    expect(linhas).toHaveLength(1 + 2_345);
  });

  it("mais de 20.000 itens: o arquivo para no limite e a última linha avisa", async () => {
    entrar("gerente");
    cenario.loteDosItens = (a) => lote(25_000, Number(a.p_apos), Number(a.p_limite));
    const { linhas } = await baixar("/relatorios/exportar?ver=itens");
    expect(cenario.chamadas.margem_itens).toHaveLength(20);
    expect(linhas).toHaveLength(1 + 20_000 + 1);
    // O aviso tem ponto e vírgula: vai entre aspas, para o Excel mostrar numa célula só.
    expect(linhas.at(-1)).toBe('"Atenção: exportação limitada a 20000 itens; escolha um período menor ou uma loja."');
  });

  it("lote que falha no meio: o arquivo inteiro falha, nunca pela metade", async () => {
    entrar("gerente");
    cenario.loteDosItens = (a) => (Number(a.p_apos) === 0 ? lote(1_500, 0, 1000) : { data: null, error: { code: "57014" } });
    await expect(exportar(new Request("http://teste/relatorios/exportar?ver=itens"))).rejects.toBeInstanceOf(FalhaDoServico);
    expect(cenario.chamadas.margem_itens).toHaveLength(2);
    expect(errosRegistrados()).toEqual([["margem: falha ao consultar margem_itens", { codigo: "57014" }]]);
  });

  it("quem não é da gerência: 403, sem nenhuma pergunta de número ao banco", async () => {
    for (const perfil of ["vendedor", "tecnico"] as const) {
      entrar(perfil);
      cenario.chamadas = {};
      for (const caminho of ["/relatorios/exportar", "/relatorios/exportar?ver=itens"]) {
        const resposta = await exportar(new Request(`http://teste${caminho}`));
        expect(resposta.status, `${perfil} ${caminho}`).toBe(403);
        expect(await resposta.text()).toBe("Sem permissão para exportar os relatórios.");
        expect(resposta.headers.get("cache-control")).toBe("no-store");
      }
      expect(Object.keys(cenario.chamadas)).toEqual(["tem_permissao"]);
      expect(cenario.chamadas.tem_permissao?.map((c) => c.p_permissao)).not.toContain("custo.ver");
    }
    expect(cenario.lidas).toEqual([]);
  });

  it("detalhe por item sem a permissão de ver o custo: 403, e os itens nem são pedidos", async () => {
    entrar("gerente");
    cenario.permissoes.delete("custo.ver");
    const resposta = await exportar(new Request("http://teste/relatorios/exportar?ver=itens"));
    expect(resposta.status).toBe(403);
    expect(await resposta.text()).toBe("Sem permissão para exportar a margem por item: ela depende de ver o custo dos produtos.");
    expect(cenario.chamadas.margem_itens).toBeUndefined();
    expect(cenario.lidas).toEqual([]);
  });

  it("banco sem a função: 503 com o motivo; falha de leitura: a exportação para", async () => {
    entrar("gerente");
    const casos = [["erroDeVendas", "/relatorios/exportar"], ["erroDaMargem", "/relatorios/exportar"], ["erroDosItens", "/relatorios/exportar?ver=itens"]] as const;
    for (const [campo, caminho] of casos) {
      Object.assign(cenario, { erroDeVendas: null, erroDaMargem: null, erroDosItens: null, [campo]: { code: "PGRST202" } });
      const resposta = await exportar(new Request(`http://teste${caminho}`));
      expect(resposta.status, campo).toBe(503);
      expect(await resposta.text()).toBe("Exportação indisponível neste ambiente: o banco ainda não tem a leitura agregada das vendas ou da margem.");

      Object.assign(cenario, { [campo]: { code: "57014" } });
      await expect(exportar(new Request(`http://teste${caminho}`)), campo).rejects.toBeInstanceOf(FalhaDoServico);
    }
  });

  it("vendas em forma inesperada: a exportação para, em vez de sair com zero", async () => {
    entrar("gerente");
    cenario.vendas = { ...VENDAS, periodos: "x" };
    await expect(exportar(new Request("http://teste/relatorios/exportar"))).rejects.toBeInstanceOf(FalhaDoServico);
    expect(errosRegistrados()).toEqual([["inicio: resposta inesperada de vendas_painel"]]);
  });

  it("o recorte de loja do endereço só vale para quem vê a rede", async () => {
    entrar("gerente");
    await baixar(`/relatorios/exportar?loja=${OUTRA}`);
    expect(cenario.chamadas.vendas_painel?.map((c) => c.p_unidade)).toEqual([LOJA]);
    expect(cenario.lidas).toEqual([]);

    entrar("dono");
    cenario.chamadas = {};
    await baixar(`/relatorios/exportar?loja=${OUTRA}&ver=itens`);
    expect(cenario.chamadas.margem_itens?.map((c) => c.p_unidade)).toEqual([OUTRA]);
    expect(cenario.lidas).toEqual(["unidades"]);

    cenario.chamadas = {};
    const { resposta } = await baixar("/relatorios/exportar?periodo=30");
    expect(resposta.headers.get("content-disposition")).toBe('attachment; filename="ora5g-relatorio-por-dia-30-dias.csv"');
    expect(cenario.chamadas.vendas_painel).toStrictEqual([{ p_inicio: DESDE["30"], p_fim: FIM, p_por_hora: false }]);
    expect(cenario.chamadas.margem_painel).toStrictEqual([{ p_inicio: DESDE["30"], p_fim: FIM }]);
  });

  it("sem a lista de lojas não dá para conferir o recorte: a exportação para", async () => {
    entrar("dono");
    cenario.errosDasTabelas.unidades = { code: "57014" };
    await expect(exportar(new Request(`http://teste/relatorios/exportar?loja=${OUTRA}`))).rejects.toBeInstanceOf(FalhaDoServico);
    expect(cenario.chamadas.vendas_painel).toBeUndefined();
    expect(errosRegistrados()).toEqual([["relatorios: falha ao consultar as lojas", { codigo: "57014" }]]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Relatórios: produção do Ora Connect por dia (G4a)", () => {
  beforeEach(() => entrar("gerente"));

  it("chips vendidos e operações confirmadas por dia, na mesma janela e no mesmo recorte das vendas", async () => {
    const p = await pagina();
    expect(cenario.chamadas.connect_painel).toStrictEqual([{ p_inicio: DESDE["14"], p_fim: FIM, p_unidade: LOJA }]);
    const cartao = p.cartao(CONNECT);
    expect(cartao.texto).toContain("3 operações confirmadas · 1 chip vendido · 1 ainda sem confirmação (fora da conta)");
    expect(primeiro(cartao.doTipo("Linhas")).series).toMatchObject([
      { nome: "Chips vendidos", serie: 1, valores: porDia({ "08/11": 1 }, 0) },
      { nome: "Ativações", serie: 2, valores: porDia({ "08/11": 2 }, 0) },
      { nome: "Portabilidades", serie: 3, valores: porDia({}, 0) },
      { nome: "Recargas", serie: 4, valores: porDia({ "10/11": 1 }, 0) },
    ]);
    expect((primeiro(cartao.doTipo("TabelaDoGrafico")).linhas as string[][])[11]).toEqual(["08/11", "1", "2", "0", "0"]);
  });

  it("sem produção, a falta é explicada; leitura indisponível ou em falha não vira zero", async () => {
    cenario.producao = { ...PRODUCAO, totais: { ...PRODUCAO.totais, chips: 0, ativacoes: 0, recargas: 0, por_evidencia: 0, por_revisao: 0 }, periodos: [] };
    expect((await pagina()).cartao(CONNECT).texto).toContain("Nenhum chip vendido nem operação confirmada no período");
    cenario.erroDaProducao = { code: "PGRST202" };
    expect((await pagina()).cartao(CONNECT).doTipo("Aviso")).toMatchObject([{ tom: "aviso", titulo: "Indisponível neste ambiente" }]);
    cenario.erroDaProducao = { code: "57014" };
    expect((await pagina()).cartao(CONNECT).doTipo("Aviso")).toMatchObject([{ tom: "perigo", titulo: "Não foi possível ler agora" }]);
    expect(errosRegistrados()).toEqual([["connect: falha ao consultar connect_painel", { codigo: "57014" }]]);
  });
});

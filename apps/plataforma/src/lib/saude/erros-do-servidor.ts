// Erros do servidor (lote OBS-a: ORA-QUAL-006 e ORA-QUAL-013, em parte; o pedido do proprietário de 18/11 de fechar os
// outros setores). O Next chama onRequestError (instrumentation.ts) a cada erro que vira a página de erro ou uma
// resposta 500: numa tela, numa ação, numa rota ou no proxy. Cada erro vira uma linha no log do servidor e entra numa
// lista em memória que a Saúde da operação lê: o dono vê quantos, onde, quando e o código que a página de erro mostrou à
// loja ("avise o administrador com o código ..."), sem serviço externo.
//
// O que NUNCA entra: o texto do erro, o endereço com os valores (só o molde da rota, como /vendas/[id]), o que vem depois
// do "?", cabeçalhos, corpo, cookie, token e a sessão. Da FalhaDoServico (o banco ou a rede não responderam) entra a
// etapa, que é palavra escrita no código ("connect", "vendas_painel").
//
// A lista é do processo: recomeça a cada publicação e a cada reinício (a tela diz desde quando conta). Com mais de um
// processo servindo o site, cada um teria a sua; aí o certo é um serviço de monitoramento (ORA-QUAL-006, a escolher).
//
// QUAL-006a (24/11): o pedido estranho (malformado ou para um endereço que não existe: robôs que testam o site; de 18 a
// 24/11, 11 dos 13 erros foram assim) não é falha do Ora: conta à parte, fora da lista, e não avisa no celular. E o
// relato (relatoDosErros) vai a cada minuto para o worker dos avisos, que o leva ao banco: só dentro do servidor
// (pedidoDeDentroDoServidor; app/saude/erros/route.ts).
import { ROTA_DO_ERRO, type RelatoDoSite } from "@ora5g/dominio/avisos";

export type TipoDoErro = "tela" | "acao" | "rota" | "proxy";
export type ErroDoServidor = {
  /** Instante do erro, em milissegundos. */
  quando: number;
  tipo: TipoDoErro;
  metodo: string;
  /** O molde da rota ("/vendas/[id]"), nunca o endereço com os valores. */
  rota: string;
  /** O código que a página de erro mostra à loja (o "digest" do Next). */
  codigo: string | null;
  /** A etapa da FalhaDoServico (o banco ou a rede não responderam). */
  etapa: string | null;
  /** Pedido estranho (malformado ou para um endereço que não existe): conta à parte e não avisa. */
  estranho: boolean;
};

/** Quantos erros a lista guarda (os mais recentes); o total conta todos desde o começo. */
export const ERROS_GUARDADOS = 200;
const CHAVE = Symbol.for("ora5g.erros-do-servidor");
/** total: os erros desde o começo (sem os estranhos); estranhos: os pedidos estranhos; erros: os mais recentes. */
type Lista = { desde: number; total: number; estranhos: number; erros: ErroDoServidor[] };

function lista(agora: () => number): Lista {
  const global = globalThis as unknown as Record<symbol, Lista | undefined>;
  return (global[CHAVE] ??= { desde: agora(), total: 0, estranhos: 0, erros: [] });
}

/** Só para os testes: começa a lista de novo. */
export function recomecarErrosDoServidor(desde: number) {
  (globalThis as unknown as Record<symbol, Lista | undefined>)[CHAVE] = { desde, total: 0, estranhos: 0, erros: [] };
}

// Os "erros" que o próprio Next usa para mudar de tela (redirect, notFound, a troca para o navegador) não são falha.
// O Next já não os manda para o onRequestError; a regra fica aqui de garantia.
const DO_PROPRIO_NEXT = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;
const TIPOS: Readonly<Record<string, TipoDoErro>> = { render: "tela", action: "acao", route: "rota", proxy: "proxy" };
const METODOS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const CODIGO = /^[\w-]{1,40}$/;
const ETAPA = /^[a-z0-9_.:-]{1,60}$/i;

const campo = (objeto: unknown, nome: string): unknown =>
  objeto !== null && typeof objeto === "object" ? (objeto as Record<string, unknown>)[nome] : undefined;

// O pedido estranho: para o endereço que não existe (a página "não encontrada" do Next) ou com o cabeçalho de navegação
// que o próprio site nunca manda malformado. O texto do erro (o do Next ao ler o pedido) só decide isso; nunca é guardado.
// Se o Next mudar esse texto, o erro volta a avisar: o engano fica do lado de avisar a mais.
const ENDERECO_QUE_NAO_EXISTE = "/_not-found/page";
const PEDIDO_MALFORMADO = /^The router state header was sent but could not be parsed/;
function pedidoEstranho(erro: unknown, rota: string): boolean {
  const mensagem = campo(erro, "message");
  return rota === ENDERECO_QUE_NAO_EXISTE || (typeof mensagem === "string" && PEDIDO_MALFORMADO.test(mensagem));
}

/**
 * Registra um erro do servidor: uma linha no log e a lista da Saúde da operação. Devolve o que foi guardado, ou nulo
 * quando o "erro" é do próprio Next (uma troca de tela).
 */
export function registrarErroDoServidor(
  erro: unknown,
  pedido: { method?: unknown },
  contexto: { routePath?: unknown; routeType?: unknown },
  meios: { agora?: () => number; escrever?: (linha: string) => void } = {},
): ErroDoServidor | null {
  const agora = meios.agora ?? Date.now;
  const digest = campo(erro, "digest");
  if (typeof digest === "string" && DO_PROPRIO_NEXT.test(digest)) return null;
  const metodo = typeof pedido.method === "string" && METODOS.has(pedido.method.toUpperCase()) ? pedido.method.toUpperCase() : "?";
  const caminho = typeof contexto.routePath === "string" ? (contexto.routePath.split("?")[0] ?? "") : "";
  const etapa = campo(erro, "etapa");
  const registro: ErroDoServidor = {
    quando: agora(),
    tipo: TIPOS[String(contexto.routeType)] ?? "tela",
    metodo,
    rota: caminho.startsWith("/") && ROTA_DO_ERRO.test(caminho) ? caminho : "(rota desconhecida)",
    codigo: typeof digest === "string" && CODIGO.test(digest) ? digest : null,
    etapa: campo(erro, "name") === "FalhaDoServico" && typeof etapa === "string" && ETAPA.test(etapa) ? etapa : null,
    estranho: false,
  };
  registro.estranho = pedidoEstranho(erro, registro.rota);
  const l = lista(agora);
  if (registro.estranho) {
    l.estranhos += 1;
  } else {
    l.total += 1;
    l.erros.push(registro);
    if (l.erros.length > ERROS_GUARDADOS) l.erros.splice(0, l.erros.length - ERROS_GUARDADOS);
  }
  const escrever = meios.escrever ?? ((linha: string) => console.error(linha));
  escrever(`[erro] ${registro.tipo} ${registro.metodo} ${registro.rota}${registro.codigo ? ` código ${registro.codigo}` : ""}${registro.etapa ? ` etapa ${registro.etapa}` : ""}${registro.estranho ? " (pedido estranho)" : ""}`);
  return registro;
}

export type RotaComErro = { tipo: TipoDoErro; rota: string; quantidade: number; ultimo: number };
export type ResumoDosErros = {
  /** Desde quando a lista conta (a última vez que o servidor subiu). */
  desde: number;
  /** Todos os erros desde então, mesmo os que já saíram da lista (sem os pedidos estranhos). */
  total: number;
  /** Os pedidos estranhos desde então (robôs): fora da conta e da lista. */
  estranhos: number;
  ultimaHora: number;
  ultimoDia: number;
  /** A lista está cheia de erros das últimas 24 horas: o número do dia é "pelo menos". */
  cheia: boolean;
  /** As rotas com erro nas últimas 24 horas, as de mais erros primeiro (até 10). */
  porRota: RotaComErro[];
  /** Os erros mais recentes, do mais novo para o mais antigo (até 10). */
  recentes: ErroDoServidor[];
};

const HORA = 3_600_000;
const DIA = 24 * HORA;

/** O que a Saúde da operação mostra. */
export function resumoDosErros(agora: number): ResumoDosErros {
  const l = lista(() => agora);
  const doDia = l.erros.filter((e) => e.quando > agora - DIA);
  const rotas = new Map<string, RotaComErro>();
  for (const e of doDia) {
    const chave = `${e.tipo} ${e.rota}`;
    const r = rotas.get(chave) ?? { tipo: e.tipo, rota: e.rota, quantidade: 0, ultimo: 0 };
    r.quantidade += 1;
    r.ultimo = Math.max(r.ultimo, e.quando);
    rotas.set(chave, r);
  }
  return {
    desde: l.desde,
    total: l.total,
    estranhos: l.estranhos,
    ultimaHora: doDia.filter((e) => e.quando > agora - HORA).length,
    ultimoDia: doDia.length,
    cheia: l.erros.length >= ERROS_GUARDADOS && (l.erros[0]?.quando ?? 0) > agora - DIA,
    porRota: [...rotas.values()].sort((a, b) => b.quantidade - a.quantidade || b.ultimo - a.ultimo).slice(0, 10),
    recentes: l.erros.slice(-10).reverse(),
  };
}

/** O relato para o worker dos avisos (/saude/erros): desde quando a lista conta, quantos erros e o mais recente. */
export function relatoDosErros(agora: number): RelatoDoSite {
  const l = lista(() => agora);
  const ultimo = l.erros.at(-1);
  return {
    desde: new Date(l.desde).toISOString(),
    erros: l.total,
    ultimo: ultimo ? { quando: new Date(Math.max(ultimo.quando, l.desde)).toISOString(), rota: ultimo.rota } : null,
  };
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const HOST_LOCAL = /^(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/;
/**
 * O pedido veio de dentro do servidor (o worker dos avisos), sem passar pelo Apache? O Next preenche os x-forwarded-* que
 * faltam com os do próprio pedido (o IP de quem ligou, o host, http); o Apache põe os dele: o IP de quem pediu (depois do
 * que a pessoa mandou, que não substitui), o domínio, o https e o nome do servidor. Qualquer um desses de fora: não é daqui.
 */
export function pedidoDeDentroDoServidor(cabecalhos: Headers): boolean {
  const host = cabecalhos.get("host") ?? "";
  return HOST_LOCAL.test(host)
    && LOOPBACK.has(cabecalhos.get("x-forwarded-for") ?? "")
    && (cabecalhos.get("x-forwarded-host") ?? host) === host
    && (cabecalhos.get("x-forwarded-proto") ?? "http") === "http"
    && !cabecalhos.has("x-forwarded-server") && !cabecalhos.has("forwarded") && !cabecalhos.has("x-real-ip");
}

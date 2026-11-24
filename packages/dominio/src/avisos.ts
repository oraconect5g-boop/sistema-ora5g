// Regras dos avisos no celular (lote PWA-b; ADR-014), as mesmas no site e no worker. O banco confere de novo o formato
// da inscrição (public.aviso_inscrever).

/** Os serviços de envio dos navegadores (Chrome, Edge, Firefox, Safari): nada é mandado nem aceito de outro endereço. */
const SERVICOS_DE_ENVIO = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

/** O endereço de envio é de um serviço conhecido, por https, na porta padrão? */
export function servicoDeEnvioConhecido(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.port === "" && SERVICOS_DE_ENVIO.test(url.hostname) && endpoint.length <= 1000;
  } catch {
    return false;
  }
}

export type InscricaoDoNavegador = { endpoint: string; p256dh: string; auth: string };

/** A inscrição que o navegador devolve (PushSubscription.toJSON()), no formato que o banco aceita, ou null. */
export function inscricaoDoNavegador(dados: unknown): InscricaoDoNavegador | null {
  if (typeof dados !== "object" || dados === null) return null;
  const d = dados as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = d.endpoint;
  const p256dh = d.keys?.p256dh;
  const auth = d.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (!servicoDeEnvioConhecido(endpoint) || !/^[A-Za-z0-9_-]{86,88}$/.test(p256dh) || !/^[A-Za-z0-9_-]{20,24}$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/** Um nome curto do aparelho para a pessoa reconhecer na lista ("Android · Chrome", "iPhone · Safari"); nada mais do navegador é guardado. */
export function nomeDoDispositivo(userAgent: string): string {
  const ua = userAgent.slice(0, 500);
  const sistema = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Outro aparelho";
  const navegador = /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${sistema} · ${navegador}`;
}

// O relato dos erros do servidor (lote QUAL-006a; ADR-015, adendo de 24/11): o site o serve em /saude/erros, só dentro
// do servidor, e o worker dos avisos o leva a cada minuto ao banco (public.erros_do_servidor_relatar), que confere de
// novo. Só números, instantes e o molde da rota: nunca o texto do erro nem o endereço com os valores.

/** O molde da rota de um erro ("/vendas/[id]"), nunca o endereço com os valores; ou "(rota desconhecida)". */
export const ROTA_DO_ERRO = /^(\/[\w\-[\]./()@]{0,160}|\(rota desconhecida\))$/;
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type RelatoDoSite = {
  /** Desde quando o processo que serve o site conta (UTC, "2026-11-24T12:00:00.000Z"). */
  desde: string;
  /** Os erros do servidor desde então, sem os pedidos estranhos. */
  erros: number;
  /** O mais recente deles (nulo quando não houve erro). */
  ultimo: { quando: string; rota: string } | null;
};

const instante = (valor: unknown): valor is string => typeof valor === "string" && INSTANTE.test(valor) && !Number.isNaN(Date.parse(valor));

/** O relato que o site serve, conferido; ou null, se veio fora do formato. */
export function relatoDoSite(dados: unknown): RelatoDoSite | null {
  if (typeof dados !== "object" || dados === null || Array.isArray(dados)) return null;
  const d = dados as { desde?: unknown; erros?: unknown; ultimo?: unknown };
  if (!instante(d.desde) || typeof d.erros !== "number" || !Number.isSafeInteger(d.erros) || d.erros < 0 || d.erros > 2_000_000_000) return null;
  if (d.ultimo === null) return d.erros === 0 ? { desde: d.desde, erros: 0, ultimo: null } : null;
  if (typeof d.ultimo !== "object" || d.erros === 0) return null;
  const u = d.ultimo as { quando?: unknown; rota?: unknown };
  if (!instante(u.quando) || typeof u.rota !== "string" || !ROTA_DO_ERRO.test(u.rota) || u.quando < d.desde) return null;
  return { desde: d.desde, erros: d.erros, ultimo: { quando: u.quando, rota: u.rota } };
}

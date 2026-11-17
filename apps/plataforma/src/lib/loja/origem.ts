// Lote MKT-a (ORA-ONLINE-003 e ORA-META-002): de onde o visitante chegou ao site.
//
// O link de uma campanha traz os parâmetros utm_* (por exemplo, o anúncio do Instagram com
// ?utm_source=instagram&utm_campaign=natal). Quando o visitante entra na loja online por um link assim, ou vindo de outro
// site (o Google, o Instagram), o proxy guarda isso num cookie da sessão do navegador, só da loja online (`/loja`), e a
// reserva leva junto. Nada disso identifica a pessoa: é o que estava no link em que ela tocou. O banco limpa de novo
// (public.loja_reservar) e decide o que guarda.

/** As origens que o banco aceita, na ordem em que aparecem nas telas. */
export const ORIGENS_DO_SITE = ["google", "instagram", "facebook", "whatsapp", "tiktok", "youtube", "email", "outro_site", "outra_campanha", "direto"] as const;
export type OrigemDoSite = (typeof ORIGENS_DO_SITE)[number];

export const NOMES_DAS_ORIGENS: Record<OrigemDoSite | "sem_registro", string> = {
  google: "Google",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  youtube: "YouTube",
  email: "E-mail",
  outro_site: "Outro site",
  outra_campanha: "Outra campanha",
  direto: "Direto",
  sem_registro: "Sem registro",
};

export const CAMPOS_DE_CAMPANHA = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type CampoDeCampanha = (typeof CAMPOS_DE_CAMPANHA)[number];

/** O que a reserva leva: a origem, os parâmetros de campanha que vieram no link e o domínio do site que mandou o visitante. */
export type OrigemDaVisita = { origem: OrigemDoSite; referencia?: string } & Partial<Record<CampoDeCampanha, string>>;

/** O cookie da origem: da sessão do navegador (sem prazo), só da loja online, fora do alcance do JavaScript da página. */
export const COOKIE_DA_ORIGEM = "ora_origem";
export const OPCOES_DO_COOKIE_DA_ORIGEM = { httpOnly: true, sameSite: "lax", path: "/loja" } as const;

const MAXIMO_DO_CAMPO = 100;
const DOMINIO = /^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$/;

/** O texto de um parâmetro de campanha, limpo como o banco limpa: minúsculas, espaços e caracteres de controle viram um espaço, até 100 letras. */
export function textoDeCampanha(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const limpo = valor.toLowerCase().replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, " ").trim().slice(0, MAXIMO_DO_CAMPO).trim();
  return limpo === "" ? undefined : limpo;
}

/** A origem pela fonte da campanha (utm_source), quando o link traz uma; a fonte fora da lista é "outra campanha". */
export function origemDaFonte(fonte: string, meio?: string): OrigemDoSite {
  const f = fonte.replace(/[\s_-]+/g, "");
  if (/^(google|googleads|adwords|gads)$/.test(f)) return "google";
  if (/^(ig|insta|instagram)$/.test(f)) return "instagram";
  if (/^(fb|face|facebook|meta)$/.test(f)) return "facebook";
  if (/^(wa|wpp|zap|whats|whatsapp)$/.test(f)) return "whatsapp";
  if (/^(tt|tiktok)$/.test(f)) return "tiktok";
  if (/^(yt|youtube)$/.test(f)) return "youtube";
  if (/^(email|mail|newsletter)$/.test(f) || (meio !== undefined && /^e-?mail$/.test(meio))) return "email";
  return "outra_campanha";
}

const SITES: readonly [RegExp, OrigemDoSite][] = [
  [/^(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/, "email"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, "facebook"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
];

/** A origem pelo site que mandou o visitante (o domínio do cabeçalho Referer). */
export function origemDoSite(dominio: string): OrigemDoSite {
  return SITES.find(([padrao]) => padrao.test(dominio))?.[1] ?? "outro_site";
}

const semWww = (host: string) => host.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");

/** O domínio do endereço de onde o visitante veio, ou null quando não há, não é http(s) ou é o próprio site. */
export function dominioDeFora(referencia: string | null, proprios: readonly (string | null | undefined)[]): string | null {
  if (!referencia) return null;
  let url: URL;
  try {
    url = new URL(referencia);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const dominio = url.hostname.toLowerCase();
  if (!DOMINIO.test(dominio)) return null;
  const meus = new Set(proprios.flatMap((h) => (h ? [semWww(h)] : [])));
  return meus.has(semWww(dominio)) ? null : dominio;
}

/**
 * O que o proxy guarda quando o visitante abre a loja online: com os parâmetros de campanha no link, a campanha; sem
 * eles, vindo de outro site, o site. null: nada novo (navegação dentro do próprio site, ou sem informação), e o que
 * já estava guardado continua valendo.
 */
export function origemDaVisita(parametros: URLSearchParams, referencia: string | null, proprios: readonly (string | null | undefined)[]): OrigemDaVisita | null {
  const campanha: Partial<Record<CampoDeCampanha, string>> = {};
  for (const campo of CAMPOS_DE_CAMPANHA) {
    const texto = textoDeCampanha(parametros.get(campo));
    if (texto !== undefined) campanha[campo] = texto;
  }
  const dominio = dominioDeFora(referencia, proprios);
  if (campanha.utm_source !== undefined) {
    return { origem: origemDaFonte(campanha.utm_source, campanha.utm_medium), ...campanha, ...(dominio ? { referencia: dominio } : {}) };
  }
  if (Object.keys(campanha).length > 0) {
    // Link com campanha, mas sem a fonte: a origem sai do site que mandou, ou fica "outra campanha".
    return { origem: dominio ? origemDoSite(dominio) : "outra_campanha", ...campanha, ...(dominio ? { referencia: dominio } : {}) };
  }
  return dominio ? { origem: origemDoSite(dominio), referencia: dominio } : null;
}

/** O valor do cookie (JSON em base64url: só letras, números, - e _). */
export function escreverOrigem(origem: OrigemDaVisita): string {
  return Buffer.from(JSON.stringify(origem), "utf8").toString("base64url");
}

/** Lê o cookie de volta, conferindo cada campo; qualquer coisa fora do formato vale como sem cookie (null). */
export function lerOrigem(valor: string | undefined): OrigemDaVisita | null {
  if (!valor || valor.length > 2_000 || !/^[A-Za-z0-9_-]+$/.test(valor)) return null;
  let dados: unknown;
  try {
    dados = JSON.parse(Buffer.from(valor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof dados !== "object" || dados === null || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  if (typeof d.origem !== "string" || !(ORIGENS_DO_SITE as readonly string[]).includes(d.origem)) return null;
  const lida: OrigemDaVisita = { origem: d.origem as OrigemDoSite };
  for (const campo of CAMPOS_DE_CAMPANHA) {
    const texto = textoDeCampanha(d[campo]);
    if (texto !== undefined) lida[campo] = texto;
  }
  if (typeof d.referencia === "string" && DOMINIO.test(d.referencia)) lida.referencia = d.referencia;
  return lida;
}

/** O texto curto da origem de uma reserva, para a equipe: "Instagram · campanha natal". */
export function textoDaOrigem(reserva: { origem: string | null; utm_source?: string | null; utm_campaign?: string | null }): string {
  const origem = reserva.origem === null ? "sem_registro" : reserva.origem;
  const nome = NOMES_DAS_ORIGENS[origem as OrigemDoSite] ?? "Sem registro";
  const fonte = origem === "outra_campanha" && reserva.utm_source ? ` (${reserva.utm_source})` : "";
  return `${nome}${fonte}${reserva.utm_campaign ? ` · campanha ${reserva.utm_campaign}` : ""}`;
}

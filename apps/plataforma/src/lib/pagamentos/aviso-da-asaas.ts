// O aviso da Asaas (webhook) do pagamento pelo site (lote PAY-014a; ADR-025), lido com rigor e sem confiar nele: o site
// só repassa ao banco o token do cabeçalho e os campos que o worker usa. Pela documentação oficial (docs.asaas.com, lida
// em 24/11): o evento tem "id" (único; o exemplo traz "&": evt_...&368604920), "event" e o objeto "payment" com "id",
// "paymentLink" (o link que originou a cobrança), "value" (reais) e "status"; o token vem no cabeçalho asaas-access-token
// e tem de 32 a 255 caracteres, sem espaço; campos novos podem aparecer (são ignorados). Nada daqui vai para log.

/** O tamanho máximo do corpo (o evento da Asaas tem poucos kB; com divisões e estornos, mais um pouco). */
export const TAMANHO_MAXIMO_DO_AVISO = 256 * 1024;

/** O token do cabeçalho, se tiver a forma que a documentação exige (32 a 255 caracteres visíveis); senão, nulo. */
export function tokenDoAviso(valor: string | null): string | null {
  return valor !== null && /^[!-~]{32,255}$/.test(valor) ? valor : null;
}

/** O que vai para o banco (public.pagamento_aviso_receber), que confere tudo de novo. */
export type AvisoParaOBanco = { id: string; evento: string; pagamento: string | null; link: string | null; valor: number | null; situacao: string | null };

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null);
const texto = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

/**
 * O evento da Asaas no formato do banco. Sem "id" ou sem "event" (texto), nulo: não é um aviso. Os campos do pagamento
 * que faltarem vão nulos (o worker conclui o aviso sem pagamento); o id do link pode vir como número, e vira texto.
 */
export function avisoDaAsaas(corpo: unknown): AvisoParaOBanco | null {
  const c = objeto(corpo);
  if (!c || typeof c.id !== "string" || typeof c.event !== "string") return null;
  const p = objeto(c.payment);
  const link = p?.paymentLink;
  return {
    id: c.id, evento: c.event, pagamento: texto(p?.id),
    link: typeof link === "number" && Number.isSafeInteger(link) && link >= 0 ? String(link) : texto(link),
    valor: typeof p?.value === "number" && Number.isFinite(p.value) ? p.value : null,
    situacao: texto(p?.status),
  };
}

export type RespostaDoAviso = { status: 200 | 400 | 401 | 413 | 429 | 503; corpo: { ok: true; aviso: "guardado" | "repetido" } | { erro: string } };

/**
 * A resposta à Asaas pelo que o banco disse. 200 só com o aviso guardado (ou já guardado antes: a entrega é "pelo menos
 * uma vez"). O token que não confere é 401; o aviso fora do formato, 400; o resto (banco fora do ar, função ausente), 503,
 * para a Asaas mandar de novo depois.
 */
export function respostaDoAviso(data: unknown, erro: { code?: string } | null): RespostaDoAviso {
  if (!erro && (data === "guardado" || data === "repetido")) return { status: 200, corpo: { ok: true, aviso: data } };
  if (erro?.code === "42501") return { status: 401, corpo: { erro: "token" } };
  if (erro?.code === "22023") return { status: 400, corpo: { erro: "aviso" } };
  return { status: 503, corpo: { erro: "indisponivel" } };
}

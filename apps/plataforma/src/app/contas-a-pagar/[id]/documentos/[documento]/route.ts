// Abrir o documento da conta a pagar (lote FIN-004b): o link assinado do Storage é pedido na hora, válido por um
// minuto, em vez de vir pronto na lista (que pode ficar aberta por horas). Lê o registro pelo RLS de quem pede (só
// quem lê a conta, conta_pagar.gerir) e assina o link COMO A PESSOA LOGADA (o Storage confere de novo). O documento
// retirado não abre: o registro e o motivo ficam na lista.
import { ehUuid } from "../../../../../lib/acesso/regras";
import { obterSessao } from "../../../../../lib/acesso/sessao";

export const dynamic = "force-dynamic";
const VALIDADE_DO_LINK = 60;

const resposta = (texto: string, status: number) => new Response(texto, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string; documento: string }> }) {
  const { id, documento } = await params;
  if (!ehUuid(id) || !ehUuid(documento)) return resposta("Documento não encontrado.", 404);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const lido = await supabase.from("conta_pagar_anexos").select("caminho, retirado_em").eq("id", documento).eq("conta_id", id).maybeSingle();
  if (lido.error) {
    console.error("contas a pagar: falha ao ler o documento", { codigo: lido.error.code || null });
    return resposta("Não deu para abrir o documento agora. Tente de novo em instantes.", 503);
  }
  if (!lido.data || lido.data.retirado_em) return resposta("Documento não encontrado.", 404);
  const link = await supabase.storage.from("contas").createSignedUrl(lido.data.caminho, VALIDADE_DO_LINK);
  if (link.error || !link.data?.signedUrl) {
    console.error("contas a pagar: falha ao assinar o link do documento", { codigo: (link.error as { statusCode?: string } | null)?.statusCode ?? null });
    return resposta("Não deu para abrir o documento agora. Tente de novo em instantes.", 503);
  }
  return new Response(null, { status: 303, headers: { Location: link.data.signedUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

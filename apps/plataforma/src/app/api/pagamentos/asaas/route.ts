// O aviso da Asaas (webhook) do pagamento pelo site (lote PAY-014a; ADR-025). O site não guarda segredo nem decide nada:
// repassa ao banco (public.pagamento_aviso_receber) o token do cabeçalho asaas-access-token e só os campos que o worker
// usa. O banco confere o token pela impressão digital e guarda o aviso uma vez só, pelo id do evento. A resposta 200 sai
// só depois de guardar (a documentação da Asaas: "responda 200 somente após confirmar a persistência"); o aviso nunca
// confirma o pagamento: o worker pergunta de novo à Asaas. Fora do proxy (sem login): quem chama é a Asaas.
import { headers } from "next/headers";

import { criarLimitador, enderecoDeQuemPede } from "../../../../lib/loja/reserva";
import { avisoDaAsaas, respostaDoAviso, TAMANHO_MAXIMO_DO_AVISO, tokenDoAviso } from "../../../../lib/pagamentos/aviso-da-asaas";
import { clienteSupabaseServidor } from "../../../../lib/supabase/servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };
const responder = (status: number, corpo: unknown) => Response.json(corpo, { status, headers: SEM_CACHE });
// Muitos pedidos seguidos do mesmo endereço (a Asaas manda poucos por minuto): 429, e ela manda de novo depois.
const limitar = criarLimitador(300, 60_000);

export async function POST(requisicao: Request) {
  const token = tokenDoAviso(requisicao.headers.get("asaas-access-token"));
  if (!token) return responder(401, { erro: "token" });
  if (!limitar(enderecoDeQuemPede(await headers()))) return responder(429, { erro: "limite" });
  if (Number(requisicao.headers.get("content-length") ?? "0") > TAMANHO_MAXIMO_DO_AVISO) return responder(413, { erro: "grande" });
  const bruto = await requisicao.text();
  if (bruto.length > TAMANHO_MAXIMO_DO_AVISO) return responder(413, { erro: "grande" });
  let corpo: unknown;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return responder(400, { erro: "aviso" });
  }
  const aviso = avisoDaAsaas(corpo);
  if (!aviso) return responder(400, { erro: "aviso" });
  const supabase = await clienteSupabaseServidor();
  if (!supabase) return responder(503, { erro: "indisponivel" });
  const { data, error } = await supabase.rpc("pagamento_aviso_receber", { p_token: token, p_aviso: aviso });
  const r = respostaDoAviso(data, error);
  if (r.status === 503) console.error("aviso da Asaas: o banco não guardou", { codigo: error?.code ?? null });
  else if (r.status !== 200) console.warn("aviso da Asaas recusado", { status: r.status });
  return responder(r.status, r.corpo);
}

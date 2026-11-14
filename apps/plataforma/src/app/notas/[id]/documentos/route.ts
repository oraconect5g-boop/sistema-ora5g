// Envio do documento da nota emitida (lote L10a: ORA-FISC-005): o PDF (DANFE) ou o XML. Rota do servidor (e não
// ação) porque o arquivo pode passar de 1 MB. Confere a origem do pedido (como as ações do Next), o arquivo
// (lib/notas/documento.ts) e grava no bucket privado "notas" COMO A PESSOA LOGADA (o Storage confere nota.aprovar);
// depois o banco registra (notas_anexar_documento), conferindo de novo a nota, o caminho e o tipo.
import { createHash, randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../../lib/acesso/regras";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { conferirDocumento } from "../../../../lib/notas/documento";
import { erroDasNotas } from "../../../../lib/notas/regras";

export const dynamic = "force-dynamic";

function mesmaOrigem(pedido: Request): boolean {
  const origem = pedido.headers.get("origin");
  if (!origem) return true; // navegadores mandam Origin no POST; sem ele, os cookies SameSite=Lax já barram o envio de outro site
  const host = pedido.headers.get("x-forwarded-host") ?? pedido.headers.get("host");
  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}

export async function POST(pedido: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id) || !mesmaOrigem(pedido)) return new Response("Pedido recusado.", { status: 403 });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const nota = await supabase.from("notas_pedidos").select("id, organizacao_id, unidade_id, venda_id, situacao, chave_acesso").eq("id", id).maybeSingle();
  if (nota.error || !nota.data) return new Response("Nota não encontrada.", { status: 404 });
  const daNota = nota.data;
  const volta = (parametro: string): never => redirect(`/vendas/${daNota.venda_id}?${parametro}`);
  if (daNota.situacao !== "emitida" || !daNota.chave_acesso) volta("erro_nota=dados");

  const dados = await pedido.formData();
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File)) volta("erro_nota=documento_tipo");
  const bytes = new Uint8Array(await (arquivo as File).arrayBuffer());
  const protocolo = dados.get("protocolo");
  const conferido = conferirDocumento(bytes, daNota.chave_acesso as string, typeof protocolo === "string" ? protocolo : null);
  if (!conferido.ok) volta(`erro_nota=${conferido.erro}`);
  const documento = (conferido as Extract<typeof conferido, { ok: true }>).documento;

  const caminho = `${daNota.organizacao_id}/${daNota.unidade_id}/${daNota.id}/${randomUUID()}.${documento.tipo}`;
  const envio = await supabase.storage.from("notas").upload(caminho, bytes, { contentType: documento.contentType, upsert: false });
  if (envio.error) {
    console.error("notas: falha ao enviar o documento ao Storage", { codigo: (envio.error as { statusCode?: string }).statusCode ?? null });
    volta("erro_nota=falha");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.rpc("notas_anexar_documento", { p_pedido: daNota.id, p_tipo: documento.tipo, p_caminho: caminho, p_sha256: sha256, p_protocolo: documento.protocolo as string });
  if (error) volta(`erro_nota=${erroDasNotas(error)}`);
  return volta(`nota=documento_${documento.tipo}`);
}

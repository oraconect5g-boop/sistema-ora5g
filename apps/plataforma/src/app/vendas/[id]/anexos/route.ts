// Envio de documento da venda (lote L5d: ORA-CRM-008): contrato, termo de garantia, contrato da linha ou comprovante.
// Rota do servidor (e não ação) porque o arquivo pode passar de 1 MB, como a do documento da nota (L10a). Confere a
// origem do pedido, o tipo e o conteúdo do arquivo (lib/vendas/anexos.ts) e grava no bucket privado "anexos" COMO A
// PESSOA LOGADA (o Storage confere quem vende na loja e quem lê a venda); depois o banco registra
// (venda_anexar_documento), conferindo de novo a venda, quem envia, o caminho e o formato.
import { createHash, randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../../lib/acesso/regras";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { conferirAnexo, erroDosAnexos, lerDadosDoAnexo } from "../../../../lib/vendas/anexos";

export const dynamic = "force-dynamic";

// A mesma regra da rota do documento da nota: navegadores mandam Origin no POST; sem ele, os cookies SameSite=Lax já
// barram o envio de outro site.
function mesmaOrigem(pedido: Request): boolean {
  const origem = pedido.headers.get("origin");
  if (!origem) return true;
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
  const venda = await supabase.from("vendas").select("id, organizacao_id, unidade_id, situacao").eq("id", id).maybeSingle();
  if (venda.error || !venda.data) return new Response("Venda não encontrada.", { status: 404 });
  const daVenda = venda.data;
  const volta = (parametro: string): never => redirect(`/vendas/${daVenda.id}?${parametro}`);
  if (daVenda.situacao !== "concluida" && daVenda.situacao !== "cancelada") volta("erro_anexo=anexo_venda_aberta");

  const dados = await pedido.formData();
  const lido = lerDadosDoAnexo(dados.get("tipo"), dados.get("descricao"));
  if (!lido.ok) volta("erro_anexo=anexo_dados");
  const { tipo, descricao } = lido as Extract<typeof lido, { ok: true }>;
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File)) volta("erro_anexo=anexo_tipo");
  const bytes = new Uint8Array(await (arquivo as File).arrayBuffer());
  const conferido = conferirAnexo(bytes);
  if (!conferido.ok) volta(`erro_anexo=${conferido.erro}`);
  const { formato, contentType } = conferido as Extract<typeof conferido, { ok: true }>;

  const caminho = `${daVenda.organizacao_id}/${daVenda.unidade_id}/${daVenda.id}/${randomUUID()}.${formato}`;
  const envio = await supabase.storage.from("anexos").upload(caminho, bytes, { contentType, upsert: false });
  if (envio.error) {
    const status = (envio.error as { statusCode?: string }).statusCode ?? null;
    console.error("vendas: falha ao enviar o documento ao Storage", { codigo: status });
    volta(`erro_anexo=${status === "403" ? "anexo_permissao" : "anexo_falha"}`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.rpc("venda_anexar_documento", {
    p_venda: daVenda.id, p_tipo: tipo, p_descricao: descricao as string, p_caminho: caminho, p_sha256: sha256,
  });
  if (error) volta(`erro_anexo=${erroDosAnexos(error)}`);
  return volta("anexo=guardado");
}

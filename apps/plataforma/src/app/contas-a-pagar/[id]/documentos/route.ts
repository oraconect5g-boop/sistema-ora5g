// Envio do documento da conta a pagar (lote FIN-004b: ORA-FIN-004): o boleto, a nota do fornecedor ou o comprovante do
// pagamento. Rota do servidor (e não ação) porque o arquivo pode passar de 1 MB, como a dos documentos da venda (L5d).
// Confere a origem do pedido, o tipo e o conteúdo do arquivo (lib/vendas/anexos.ts) e grava no bucket privado "contas"
// COMO A PESSOA LOGADA (o Storage confere quem gere a conta); depois o banco registra (conta_pagar_anexar), conferindo
// de novo a conta, quem envia, o caminho e o formato. Volta para a lista com 303 (o navegador pede a lista com GET, sem
// mandar o arquivo de novo).
import { createHash, randomUUID } from "node:crypto";

import { ehUuid } from "../../../../lib/acesso/regras";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { erroDoEnvio, erroDosDocumentos, lerDadosDoDocumento } from "../../../../lib/contas-a-pagar/documentos";
import { enderecoDaVolta } from "../../../../lib/contas-a-pagar/regras";
import { conferirAnexo } from "../../../../lib/vendas/anexos";

export const dynamic = "force-dynamic";

// A mesma regra das rotas dos documentos da venda e da nota: navegadores mandam Origin no POST; sem ele, os cookies
// SameSite=Lax já barram o envio de outro site.
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
  const dados = await pedido.formData().catch(() => null);
  if (!dados) return new Response("Pedido recusado.", { status: 400 });
  const volta = (resultado: Parameters<typeof enderecoDaVolta>[1]) =>
    new Response(null, { status: 303, headers: { Location: enderecoDaVolta(dados, resultado), "Cache-Control": "no-store" } });

  const conta = await supabase.from("contas_a_pagar").select("id, organizacao_id").eq("id", id).maybeSingle();
  if (conta.error) {
    console.error("contas a pagar: falha ao ler a conta do documento", { codigo: conta.error.code || null });
    return volta({ erro: "documento_falha" });
  }
  if (!conta.data) return volta({ erro: "nao_encontrada" });
  const lido = lerDadosDoDocumento(dados.get("tipo"), dados.get("descricao"));
  if (!lido.ok) return volta({ erro: "documento_dados" });
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File)) return volta({ erro: "documento_arquivo" });
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const conferido = conferirAnexo(bytes);
  if (!conferido.ok) return volta({ erro: conferido.erro === "anexo_grande" ? "documento_grande" : "documento_arquivo" });

  const caminho = `${conta.data.organizacao_id}/${conta.data.id}/${randomUUID()}.${conferido.formato}`;
  const envio = await supabase.storage.from("contas").upload(caminho, bytes, { contentType: conferido.contentType, upsert: false });
  if (envio.error) {
    const status = (envio.error as { statusCode?: string }).statusCode ?? null;
    console.error("contas a pagar: falha ao enviar o documento ao Storage", { codigo: status });
    return volta({ erro: erroDoEnvio(status) });
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.rpc("conta_pagar_anexar", {
    p_conta: conta.data.id, p_tipo: lido.tipo, p_descricao: lido.descricao as string, p_caminho: caminho, p_sha256: sha256,
  });
  if (error) {
    console.error("contas a pagar: o banco não registrou o documento", { codigo: error.code || null });
    return volta({ erro: erroDosDocumentos(error) });
  }
  return volta({ ok: "documento_guardado" });
}

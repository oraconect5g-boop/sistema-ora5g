import { Store } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EstadoVazio } from "../../../componentes/ui";
import { ehUuidDaVitrine, linksDasFotos, organizacaoDaLoja, type DetalheDoProduto } from "../../../lib/loja/vitrine";
import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";
import { DetalheDaLoja } from "./DetalheDaLoja";

export const metadata: Metadata = { title: "Produto" };
export const dynamic = "force-dynamic";

// O detalhe de um produto do site (ONLINE-a; ADR-009): as fotos, a descrição e, em cada variação, o preço do balcão e
// a situação do estoque em cada loja. Fora do site (ou sem preço em loja nenhuma), "não encontrado".
export default async function ProdutoDaLoja({ params }: { params: Promise<{ produto: string }> }) {
  const { produto } = await params;
  if (!ehUuidDaVitrine(produto)) notFound();
  const organizacao = organizacaoDaLoja();
  const supabase = organizacao ? await clienteSupabaseServidor() : null;
  if (!organizacao || !supabase) {
    return <EstadoVazio titulo="A loja online ainda não está no ar" icone={Store}>Enquanto isso, procure uma das lojas da Ora 5G.</EstadoVazio>;
  }
  const { data, error } = await supabase.rpc("loja_produto", { p_organizacao: organizacao, p_produto: produto });
  if (error?.code === "P0002") notFound();
  if (error || !data) {
    console.error("loja: falha ao ler o produto", { codigo: error?.code });
    return <EstadoVazio titulo="A loja online está fora do ar agora" icone={Store}>Tente de novo em instantes.</EstadoVazio>;
  }
  const p = data as unknown as DetalheDoProduto;
  const fotos = await linksDasFotos(supabase, p.fotos.map((f) => f.caminho));
  const imagens = p.fotos.flatMap((f) => (fotos.get(f.caminho) ? [{ ...f, url: fotos.get(f.caminho) as string }] : []));
  return <DetalheDaLoja produto={p} imagens={imagens} />;
}

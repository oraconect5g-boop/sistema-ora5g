import { Store } from "lucide-react";
import type { Metadata } from "next";

import { EstadoVazio } from "../../componentes/ui";
import { buscaDaVitrine, ehUuidDaVitrine, linksDasFotos, organizacaoDaLoja, type Vitrine } from "../../lib/loja/vitrine";
import { textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { clienteSupabaseServidor } from "../../lib/supabase/servidor";
import { VitrineDaLoja } from "./VitrineDaLoja";

export const metadata: Metadata = { title: "Celulares e acessórios" };
export const dynamic = "force-dynamic";

// A vitrine (ONLINE-a; ADR-009): o que o dono marcou para o site, com o preço do balcão e se há estoque nas lojas.
export default async function Loja({ searchParams }: { searchParams: Promise<{ busca?: ValorDeParametro; categoria?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const busca = buscaDaVitrine(textoDoParametro(parametros.busca));
  const categoriaPedida = textoDoParametro(parametros.categoria);
  const categoria = ehUuidDaVitrine(categoriaPedida) ? categoriaPedida : null;
  const organizacao = organizacaoDaLoja();
  const supabase = organizacao ? await clienteSupabaseServidor() : null;
  if (!organizacao || !supabase) {
    return <EstadoVazio titulo="A loja online ainda não está no ar" icone={Store}>Enquanto isso, procure uma das lojas da Ora 5G.</EstadoVazio>;
  }
  const { data, error } = await supabase.rpc("loja_vitrine", { p_organizacao: organizacao, p_busca: busca ?? undefined, p_categoria: categoria ?? undefined });
  if (error || !data) {
    console.error("loja: falha ao ler a vitrine", { codigo: error?.code });
    return <EstadoVazio titulo="A loja online está fora do ar agora" icone={Store}>Tente de novo em instantes.</EstadoVazio>;
  }
  const vitrine = data as unknown as Vitrine;
  const fotos = await linksDasFotos(supabase, vitrine.produtos.map((p) => p.foto));
  return <VitrineDaLoja vitrine={vitrine} fotos={fotos} busca={busca} categoria={categoria} />;
}

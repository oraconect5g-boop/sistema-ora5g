import { randomUUID } from "node:crypto";

import { Store } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EstadoVazio } from "../../../../componentes/ui";
import { ehUuidDaVitrine, organizacaoDaLoja, type DetalheDoProduto } from "../../../../lib/loja/vitrine";
import { textoDoParametro, type ValorDeParametro } from "../../../../lib/parametros";
import { clienteSupabaseServidor } from "../../../../lib/supabase/servidor";
import { TelaDeReservar, VoltarAoProduto } from "./TelaDeReservar";

export const metadata: Metadata = { title: "Reservar" };
export const dynamic = "force-dynamic";

// ONLINE-b (ORA-ONLINE-006; ADR-009): a reserva de um produto do site numa loja com estoque, por 24 horas, para pagar e
// retirar na loja. A tela confirma o produto, a variação, a loja e o preço antes do formulário.
export default async function Reservar({ params, searchParams }: { params: Promise<{ produto: string }>; searchParams: Promise<{ variante?: ValorDeParametro; loja?: ValorDeParametro }> }) {
  const { produto } = await params;
  const parametros = await searchParams;
  const variante = textoDoParametro(parametros.variante);
  const loja = textoDoParametro(parametros.loja);
  if (!ehUuidDaVitrine(produto) || !ehUuidDaVitrine(variante) || !ehUuidDaVitrine(loja)) notFound();
  const organizacao = organizacaoDaLoja();
  const supabase = organizacao ? await clienteSupabaseServidor() : null;
  if (!organizacao || !supabase) {
    return <EstadoVazio titulo="A loja online ainda não está no ar" icone={Store}>Enquanto isso, procure uma das lojas da Ora 5G.</EstadoVazio>;
  }
  const { data, error } = await supabase.rpc("loja_produto", { p_organizacao: organizacao, p_produto: produto });
  if (error?.code === "P0002") notFound();
  if (error || !data) {
    console.error("loja: falha ao ler o produto para reservar", { codigo: error?.code });
    return <EstadoVazio titulo="A loja online está fora do ar agora" icone={Store}>Tente de novo em instantes.</EstadoVazio>;
  }
  const p = data as unknown as DetalheDoProduto;
  const escolhida = p.variantes.find((v) => v.id === variante);
  const naLoja = escolhida?.lojas.find((l) => l.id === loja);
  if (!escolhida || !naLoja || naLoja.disponibilidade === "sem_estoque") {
    return <div className="mx-auto max-w-lg space-y-4"><VoltarAoProduto produto={p.id} /><EstadoVazio titulo="Esta loja não tem este produto agora" icone={Store}>Volte ao produto e escolha outra loja com estoque.</EstadoVazio></div>;
  }
  return <TelaDeReservar produto={p.id} variacao={escolhida} loja={naLoja} chave={randomUUID()} />;
}

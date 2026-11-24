import { Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EstadoVazio } from "../../../componentes/ui";
import { codigoDoPedido } from "../../../lib/loja/carrinho";
import { organizacaoDaLoja } from "../../../lib/loja/vitrine";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { ConsultaDoPedido } from "./ConsultaDoPedido";

export const metadata: Metadata = { title: "Meu pedido" };
export const dynamic = "force-dynamic";

// O visitante acompanha o pedido do site (lote ONLINE-d: ORA-ONLINE-002; ADR-023) pelo código e pelo WhatsApp, sem conta.
// PAY-014a: a volta da página de pagamento da Asaas traz ?codigo= (só o código; o WhatsApp a pessoa digita).
export default async function MeuPedido({ searchParams }: { searchParams: Promise<{ codigo?: ValorDeParametro }> }) {
  const codigo = codigoDoPedido(textoDoParametro((await searchParams).codigo));
  if (!organizacaoDaLoja()) {
    return <EstadoVazio titulo="A loja online ainda não está no ar" icone={Store}>Enquanto isso, procure uma das lojas da Ora 5G.</EstadoVazio>;
  }
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Meu pedido</h1>
      <p className="text-sm text-suave">Digite o código do pedido e o WhatsApp que você usou ao reservar.</p>
      <ConsultaDoPedido codigoInicial={codigo} />
      <p className="text-sm"><Link href="/loja" className="font-semibold text-acao">Voltar à loja</Link></p>
    </div>
  );
}

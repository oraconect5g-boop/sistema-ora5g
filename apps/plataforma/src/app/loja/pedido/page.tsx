import { Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EstadoVazio } from "../../../componentes/ui";
import { organizacaoDaLoja } from "../../../lib/loja/vitrine";
import { ConsultaDoPedido } from "./ConsultaDoPedido";

export const metadata: Metadata = { title: "Meu pedido" };
export const dynamic = "force-dynamic";

// O visitante acompanha o pedido do site (lote ONLINE-d: ORA-ONLINE-002; ADR-023) pelo código e pelo WhatsApp, sem conta.
export default function MeuPedido() {
  if (!organizacaoDaLoja()) {
    return <EstadoVazio titulo="A loja online ainda não está no ar" icone={Store}>Enquanto isso, procure uma das lojas da Ora 5G.</EstadoVazio>;
  }
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Meu pedido</h1>
      <p className="text-sm text-suave">Digite o código do pedido e o WhatsApp que você usou ao reservar.</p>
      <ConsultaDoPedido />
      <p className="text-sm"><Link href="/loja" className="font-semibold text-acao">Voltar à loja</Link></p>
    </div>
  );
}

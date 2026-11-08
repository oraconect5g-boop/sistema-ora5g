import { NextResponse } from "next/server";

// Redirecionamento com endereço RELATIVO: atrás do Apache do cPanel o aplicativo recebe o pedido
// como 127.0.0.1:3100, e um endereço absoluto mandaria o navegador para lá. 303: o navegador
// sempre segue com GET. Sem cache, porque a resposta depende da sessão.
export function redirecionar(caminho: string): NextResponse {
  if (!caminho.startsWith("/") || caminho.startsWith("//")) throw new Error("caminho de redirecionamento inválido");
  return new NextResponse(null, { status: 303, headers: { Location: caminho, "Cache-Control": "private, no-store" } });
}

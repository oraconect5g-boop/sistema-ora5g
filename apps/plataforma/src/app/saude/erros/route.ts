import { NextResponse, type NextRequest } from "next/server";

import { agora } from "../../../lib/formato";
import { pedidoDeDentroDoServidor, relatoDosErros } from "../../../lib/saude/erros-do-servidor";

export const dynamic = "force-dynamic";

// QUAL-006a (ADR-015, adendo de 24/11): o relato dos erros do servidor para o worker dos avisos, que roda no mesmo
// servidor e o leva ao banco a cada minuto (o banco decide o alerta no celular). Só dentro do servidor: o pedido que
// passou pelo Apache recebe 404, como um endereço que não existe. Só números, instantes e o molde da rota do último
// erro; nunca o texto do erro nem o endereço com os valores. Não lê o banco nem segredos.
export function GET(pedido: NextRequest) {
  if (!pedidoDeDentroDoServidor(pedido.headers)) return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store, max-age=0" } });
  return NextResponse.json(relatoDosErros(agora().getTime()), { headers: { "cache-control": "no-store, max-age=0" } });
}

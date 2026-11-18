import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_LOJA, COOKIE_PERFIL, ehPerfil, PERFIL_PADRAO } from "../../../../demo/perfis";
import { lojasPermitidas } from "../../../../demo/sessao";

// Troca a loja da sessão da DEMONSTRAÇÃO (ADR-002: o usuário só opera a unidade escolhida, entre
// as vinculadas). A loja pedida é conferida contra os vínculos do perfil; valor estranho é ignorado.
// O retorno só aceita caminhos da própria demonstração (nada de redirecionar para outro site).

export function GET(requisicao: NextRequest) {
  if (process.env.ORA_DEMO_DESLIGADA === "1") return new NextResponse(null, { status: 404 });
  const pedida = requisicao.nextUrl.searchParams.get("l");
  const voltar = requisicao.nextUrl.searchParams.get("voltar") ?? "/demo";
  const destino = /^\/demo(\/[a-z0-9-]+)*$/.test(voltar) ? voltar : "/demo";

  const valorPerfil = requisicao.cookies.get(COOKIE_PERFIL)?.value;
  const perfil = ehPerfil(valorPerfil) ? valorPerfil : PERFIL_PADRAO;

  const resposta = new NextResponse(null, { status: 303, headers: { Location: destino } });
  if (pedida !== null && lojasPermitidas(perfil).includes(pedida)) {
    resposta.cookies.set(COOKIE_LOJA, pedida, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  }
  return resposta;
}

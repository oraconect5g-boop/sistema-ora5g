import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_PERFIL, ehPerfil } from "../../../../demo/perfis";

// Troca o perfil da DEMONSTRAÇÃO (cookie sem valor sensível) e volta ao início.
// Redireciona com caminho relativo: atrás do proxy do Apache o host interno é 127.0.0.1.
export function GET(requisicao: NextRequest) {
  if (process.env.APP_ENV === "producao") return new NextResponse(null, { status: 404 });
  const perfil = requisicao.nextUrl.searchParams.get("p");
  const resposta = new NextResponse(null, { status: 303, headers: { Location: "/demo" } });
  if (ehPerfil(perfil)) {
    resposta.cookies.set(COOKIE_PERFIL, perfil, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  }
  return resposta;
}

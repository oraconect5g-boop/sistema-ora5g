import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { configuracaoSupabase } from "./lib/supabase/configuracao";

// Atrás do Apache do cPanel, um pedido da raiz ("/") chega como o arquivo de índice que o
// Apache procura (index.php, index.html, default.htm...). Esses nomes viram a página inicial.
const INDICE_DO_APACHE = /^\/(index|default|home)\.[a-z0-9]{1,6}$/i;

export async function proxy(requisicao: NextRequest) {
  if (INDICE_DO_APACHE.test(requisicao.nextUrl.pathname)) {
    return NextResponse.rewrite(new URL("/", requisicao.url));
  }
  return renovarSessao(requisicao);
}

// REV-009: renova a sessão do Supabase ANTES de renderizar as páginas com login.
// Em componente de servidor os cookies são só leitura; aqui a renovação é gravada na resposta,
// junto com os cabeçalhos que impedem cache de resposta com sessão (exigência do @supabase/ssr).
async function renovarSessao(requisicao: NextRequest) {
  const configuracao = configuracaoSupabase();
  if (!configuracao) return NextResponse.next();

  let resposta = NextResponse.next({ request: requisicao });
  const supabase = createServerClient(configuracao.url, configuracao.chavePublica, {
    cookies: {
      getAll: () => requisicao.cookies.getAll(),
      setAll: (lista, cabecalhos) => {
        for (const { name, value } of lista) requisicao.cookies.set(name, value);
        resposta = NextResponse.next({ request: requisicao });
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
        for (const [nome, valor] of Object.entries(cabecalhos)) resposta.headers.set(nome, valor);
      },
    },
  });

  // Valida o token (e o renova se preciso) antes de qualquer resposta ser gerada.
  await supabase.auth.getClaims();
  resposta.headers.set("Cache-Control", "private, no-store");
  return resposta;
}

export const config = {
  matcher: ["/conta/:path*", "/((?:index|default|home|Default|Home|INDEX)\\.[a-zA-Z0-9]{1,6})"],
};

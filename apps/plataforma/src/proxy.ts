import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { configuracaoSupabase } from "./lib/supabase/configuracao";

export async function proxy(requisicao: NextRequest) {
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

export const config = { matcher: ["/conta/:path*", "/inicio", "/api/pendencias", "/escolher-loja", "/equipe/:path*", "/catalogo/:path*", "/vender/:path*", "/vendas/:path*", "/caixa/:path*", "/aprovacoes/:path*", "/estoque/:path*", "/transferencias/:path*", "/connect/:path*", "/notas/:path*", "/auditoria/:path*", "/financeiro/:path*", "/relatorios/:path*", "/metas/:path*", "/lojas/:path*", "/produtos/:path*", "/clientes/:path*", "/crm/:path*", "/pagamentos/:path*", "/contas-a-pagar/:path*", "/resultado/:path*", "/previsao/:path*", "/assistencia/:path*"] };

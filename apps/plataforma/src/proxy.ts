import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { configuracaoSupabase } from "./lib/supabase/configuracao";
import { medidorDeTempos, rotuloDoPedido } from "./lib/supabase/tempos";

export async function proxy(requisicao: NextRequest) {
  return renovarSessao(requisicao);
}

// REV-009: renova a sessão do Supabase ANTES de renderizar as páginas com login.
// Em componente de servidor os cookies são só leitura; aqui a renovação é gravada na resposta,
// junto com os cabeçalhos que impedem cache de resposta com sessão (exigência do @supabase/ssr).
async function renovarSessao(requisicao: NextRequest) {
  const configuracao = configuracaoSupabase();
  if (!configuracao) return NextResponse.next();

  // Log de tempos (ORA_MEDIR_TEMPOS=1; desligado, é null e nada muda): uma linha diz qual pedido chegou, e a conferência
  // do token só aparece embaixo dela quando precisou ir ao Auth (token sem chave assimétrica, ou renovação).
  const tempos = medidorDeTempos("p", () => rotuloDoPedido(requisicao.method, requisicao.nextUrl.pathname, requisicao.headers));
  let resposta = NextResponse.next({ request: requisicao });
  const supabase = createServerClient(configuracao.url, configuracao.chavePublica, {
    ...(tempos ? { global: { fetch: tempos.fetch } } : {}),
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

export const config = { matcher: ["/conta/:path*", "/entrar/codigo", "/inicio", "/api/pendencias", "/escolher-loja", "/equipe/:path*", "/catalogo/:path*", "/vender/:path*", "/vendas/:path*", "/reservas-do-site/:path*", "/caixa/:path*", "/aprovacoes/:path*", "/estoque/:path*", "/transferencias/:path*", "/connect/:path*", "/notas/:path*", "/auditoria/:path*", "/financeiro/:path*", "/relatorios/:path*", "/metas/:path*", "/lojas/:path*", "/produtos/:path*", "/clientes/:path*", "/crm/:path*", "/pagamentos/:path*", "/contas-a-pagar/:path*", "/resultado/:path*", "/previsao/:path*", "/assistencia/:path*", "/operacao", "/entregas"] };

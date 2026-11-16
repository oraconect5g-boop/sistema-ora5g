import { NextResponse } from "next/server";

import { identidadeDaVersao } from "../../../lib/versao-no-ar";

export const dynamic = "force-dynamic";

// #99: a identidade da versão no ar, para o conferidor da publicação comparar com o commit esperado. Pública como o
// rodapé: o commit inteiro, o número da versão, a hora da build e o nome do ambiente; não lê o banco nem segredos.
export function GET() {
  const identidade = identidadeDaVersao({
    ORA_COMMIT_COMPLETO: process.env.ORA_COMMIT_COMPLETO, NEXT_PUBLIC_ORA_BUILD: process.env.NEXT_PUBLIC_ORA_BUILD, APP_ENV: process.env.APP_ENV,
  });
  return NextResponse.json(identidade, { headers: { "cache-control": "no-store, max-age=0" } });
}

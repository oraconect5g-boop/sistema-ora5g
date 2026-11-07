import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { COOKIE_PERFIL, ehPerfil, PERFIL_PADRAO, podeAcessar, type Pagina, type Perfil } from "./perfis";

// A demonstração nunca roda em produção (docs/08: "impedir mocks em produção").
export function garantirDemonstracaoLigada() {
  if (process.env.APP_ENV === "producao") notFound();
}

export async function perfilAtual(): Promise<Perfil> {
  const valor = (await cookies()).get(COOKIE_PERFIL)?.value;
  return ehPerfil(valor) ? valor : PERFIL_PADRAO;
}

export async function acessoDaPagina(pagina: Pagina) {
  const perfil = await perfilAtual();
  return { perfil, permitido: podeAcessar(perfil, pagina) };
}

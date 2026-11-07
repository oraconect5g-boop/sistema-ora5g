import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { LOJAS } from "./dados";
import { COOKIE_LOJA, COOKIE_PERFIL, ehPerfil, LOJAS_DO_PERFIL, PERFIL_PADRAO, PERFIS, podeAcessar, REDE, type Pagina, type Perfil } from "./perfis";

// A demonstração nunca roda em produção (docs/08: "impedir mocks em produção").
export function garantirDemonstracaoLigada() {
  if (process.env.APP_ENV === "producao") notFound();
}

/** Lojas que o perfil pode escolher. Dono e administrador: a rede inteira ou qualquer loja. */
export function lojasPermitidas(perfil: Perfil): readonly string[] {
  const base = LOJAS_DO_PERFIL[perfil];
  return base.includes(REDE) ? [REDE, ...LOJAS.map((l) => l.codigo)] : base;
}

export type ContextoDemo = {
  perfil: Perfil;
  pessoaId: string;
  /** Loja atual da sessão (ADR-002: o usuário opera só a unidade escolhida) ou REDE. */
  loja: string;
  lojas: readonly string[];
  ehRede: boolean;
};

/** Perfil e loja da demonstração, lidos dos cookies e SEMPRE validados (valor estranho volta ao padrão). */
export async function contextoDemo(): Promise<ContextoDemo> {
  const jarra = await cookies();
  const valor = jarra.get(COOKIE_PERFIL)?.value;
  const perfil = ehPerfil(valor) ? valor : PERFIL_PADRAO;
  const lojas = lojasPermitidas(perfil);
  const pedida = jarra.get(COOKIE_LOJA)?.value;
  const loja = pedida !== undefined && lojas.includes(pedida) ? pedida : (lojas[0] ?? REDE);
  return { perfil, pessoaId: PERFIS[perfil].pessoaId, loja, lojas, ehRede: loja === REDE };
}

export async function perfilAtual(): Promise<Perfil> {
  return (await contextoDemo()).perfil;
}

export async function acessoDaPagina(pagina: Pagina) {
  const contexto = await contextoDemo();
  return { ...contexto, permitido: podeAcessar(contexto.perfil, pagina) };
}

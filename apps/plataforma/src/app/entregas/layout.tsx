import type { ReactNode } from "react";

import { obterSessao } from "../../lib/acesso/sessao";

// A sessão é conferida aqui, ANTES do esqueleto de carregamento (loading.tsx fica dentro deste layout):
// sem login, o servidor responde 307 para /entrar como nas outras telas reais, sem mandar o esqueleto.
export default async function LayoutEntregas({ children }: { children: ReactNode }) {
  await obterSessao({ exigirLoja: true });
  return children;
}

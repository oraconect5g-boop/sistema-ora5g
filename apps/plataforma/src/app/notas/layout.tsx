import type { ReactNode } from "react";

import { obterSessao } from "../../lib/acesso/sessao";

// A sessão é conferida aqui, ANTES do esqueleto de carregamento (loading.tsx fica dentro deste layout):
// sem login, o servidor responde 307 para /entrar como nas outras telas reais, sem mandar o esqueleto.
// A página confere de novo sem outra ida ao banco: a leitura da sessão é uma só por pedido (cache do React).
export default async function LayoutNotas({ children }: { children: ReactNode }) {
  await obterSessao({ exigirLoja: true });
  return children;
}

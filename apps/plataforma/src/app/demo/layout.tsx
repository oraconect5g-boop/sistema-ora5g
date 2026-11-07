import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "../../componentes/AppShell";
import { garantirDemonstracaoLigada, perfilAtual } from "../../demo/sessao";

export const metadata: Metadata = { title: "Demonstração | Ora 5G" };

export default async function LayoutDemonstracao({ children }: { children: ReactNode }) {
  garantirDemonstracaoLigada();
  return <AppShell perfil={await perfilAtual()}>{children}</AppShell>;
}

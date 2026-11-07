import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "../../componentes/AppShell";
import { alertasDoEscopo, aprovacoesVisiveis } from "../../demo/consultas";
import { contextoDemo, garantirDemonstracaoLigada } from "../../demo/sessao";

export const metadata: Metadata = {
  title: { template: "%s · Demonstração | Ora 5G", default: "Demonstração | Ora 5G" },
};

export default async function LayoutDemonstracao({ children }: { children: ReactNode }) {
  garantirDemonstracaoLigada();
  const contexto = await contextoDemo();
  const aprovacoes = aprovacoesVisiveis(contexto).length;
  return (
    <AppShell contexto={contexto} avisos={alertasDoEscopo(contexto)} pendencias={{ aprovacoes }}>
      {children}
    </AppShell>
  );
}

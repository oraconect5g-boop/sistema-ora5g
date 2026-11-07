import type { Metadata } from "next";

import { contextoDemo } from "../../demo/sessao";
import { InicioVendedor } from "./_paineis/InicioVendedor";
import { InicioTecnico, PainelAdministrador } from "./_paineis/OutrosPaineis";
import { PainelGestao } from "./_paineis/PainelGestao";

export const metadata: Metadata = { title: "Início" };

// Cada perfil tem o seu início (REPORT-001, 002 e 003). O que aparece já vem filtrado do servidor.
export default async function InicioDemonstracao() {
  const contexto = await contextoDemo();
  if (contexto.perfil === "vendedor") return <InicioVendedor contexto={contexto} />;
  if (contexto.perfil === "administrador") return <PainelAdministrador contexto={contexto} />;
  if (contexto.perfil === "tecnico") return <InicioTecnico />;
  return <PainelGestao contexto={contexto} />;
}

"use client";

import { useState } from "react";

import { Botao, Selo } from "../../../componentes/ui";

export function Decisao({ id }: { id: string }) {
  const [decisao, setDecisao] = useState<"aprovado" | "negado" | null>(null);
  if (decisao) return <Selo tom={decisao === "aprovado" ? "sucesso" : "perigo"}>{decisao === "aprovado" ? "Aprovado (demonstração)" : "Negado (demonstração)"}</Selo>;
  return (
    <div className="flex gap-2">
      <Botao onClick={() => setDecisao("aprovado")} aria-label={`Aprovar ${id}`}>Aprovar</Botao>
      <Botao variante="perigo" onClick={() => setDecisao("negado")} aria-label={`Negar ${id}`}>Negar</Botao>
    </div>
  );
}

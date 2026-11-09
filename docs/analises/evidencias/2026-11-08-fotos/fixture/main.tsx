import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { EnviarFoto } from "@produto/EnviarFoto";
import { FotoAmpliavel } from "@produto/FotoAmpliavel";

declare global {
  interface Window {
    auditoria: { uploads: { path: string; size: number }[]; registros: { largura: number; altura: number }[]; refreshes: number; falharRegistro: boolean };
  }
}
const tela = document.createElement("canvas");
tela.width = 200; tela.height = 200;
tela.getContext("2d")!.fillRect(0, 0, 200, 200);
const boa = tela.toDataURL("image/png");
window.auditoria = { uploads: [], registros: [], refreshes: 0, falharRegistro: true };

function App() {
  const [url, setUrl] = useState(location.search.includes("boa") ? boa : "/arquivo-invalido.png");
  return <>
    <button onClick={() => setUrl(boa)}>Trocar URL</button>
    <FotoAmpliavel url={url} rotulo="Imagem de teste" ilustracao={false} />
    <EnviarFoto supabaseUrl="https://projeto-ficticio.supabase.invalid" chavePublica="sb_publishable_exemplo"
      organizacao="10000000-0000-4000-8000-000000000001" produto="10000000-0000-4000-8000-000000000002"
      variante={null} rotulo="Produto de teste" />
  </>;
}
createRoot(document.getElementById("root")!).render(<App />);


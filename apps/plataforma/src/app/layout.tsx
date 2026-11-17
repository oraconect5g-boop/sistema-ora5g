import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { RegistrarServiceWorker } from "../componentes/RegistrarServiceWorker";
import "./global.css";

// Fonte geométrica, como nos prints de referência (10/11/2026); baixada na build, sem chamada ao Google em uso.
const fonte = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--fonte-principal", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Ora 5G", template: "%s | Ora 5G" },
  description: "Plataforma de gestão integrada da Ora 5G",
  robots: { index: false, follow: false },
  // Site instalável (PWA-a): no iPhone, aberto pela tela inicial, em tela cheia e com o nome curto.
  appleWebApp: { capable: true, title: "Ora 5G", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#10131a", width: "device-width", initialScale: 1 };

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={fonte.variable}>
      <body className="min-h-dvh">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}

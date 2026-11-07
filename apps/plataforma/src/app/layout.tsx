import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "./global.css";

const inter = Inter({ subsets: ["latin"], variable: "--fonte-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Ora 5G",
  description: "Plataforma de gestão integrada da Ora 5G",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0e192b", width: "device-width", initialScale: 1 };

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

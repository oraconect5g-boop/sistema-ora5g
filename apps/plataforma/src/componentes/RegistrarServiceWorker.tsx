"use client";

import { useEffect } from "react";

// Registra o service worker do site instalável (lote PWA-a) só na versão publicada: em desenvolvimento ele atrapalharia
// a troca das telas. Se o registro falhar, nada muda para quem usa: o site segue funcionando sem ele.
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}

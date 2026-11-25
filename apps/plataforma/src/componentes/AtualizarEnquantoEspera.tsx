"use client";

// Enquanto há algo esperando o servidor (uma consulta da Nogle na fila, por exemplo), pede a tela de novo a cada poucos
// segundos, no máximo `vezes` vezes (lote CONNECT-g). A tela que não tem mais nada esperando não desenha este componente, e o
// relógio para sozinho.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AtualizarEnquantoEspera({ segundos = 2, vezes = 45, aviso = "Esperando a resposta…" }: { segundos?: number; vezes?: number; aviso?: string }) {
  const router = useRouter();
  useEffect(() => {
    let feitas = 0;
    const relogio = setInterval(() => {
      feitas += 1;
      if (feitas > vezes) {
        clearInterval(relogio);
        return;
      }
      router.refresh();
    }, segundos * 1000);
    return () => clearInterval(relogio);
  }, [router, segundos, vezes]);
  return <p role="status" className="sr-only">{aviso}</p>;
}

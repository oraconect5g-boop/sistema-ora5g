"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

// Sem internet, nada é gravado (lote L6a: ORA-POS-015). O sistema não promete venda offline: sem conexão,
// esta faixa aparece e qualquer formulário enviado é segurado aqui, antes de sair do aparelho, para ninguém
// achar que uma venda, um pagamento ou um ajuste foi feito. Quando a conexão volta, a pessoa envia de novo:
// as chaves de idempotência fazem a repetição devolver o mesmo resultado, sem duplicar.
export function AvisoDeRede() {
  const [online, setOnline] = useState(true);
  const [segurado, setSegurado] = useState(false);
  useEffect(() => {
    const atualizar = () => { setOnline(navigator.onLine); if (navigator.onLine) setSegurado(false); };
    const segurar = (evento: SubmitEvent) => {
      if (!navigator.onLine) { evento.preventDefault(); evento.stopPropagation(); setSegurado(true); setOnline(false); }
    };
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    document.addEventListener("submit", segurar, true);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
      document.removeEventListener("submit", segurar, true);
    };
  }, []);
  if (online) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-perigo px-4 py-2 text-sm font-semibold text-white">
      <WifiOff aria-hidden className="size-4" />
      {segurado ? "Sem internet: o envio não saiu do aparelho e nada foi gravado. Tente de novo quando a conexão voltar." : "Sem internet: nada é gravado até a conexão voltar."}
    </div>
  );
}

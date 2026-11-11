"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Leitura de código de barras e QR pela câmera do celular (lote L6a: ORA-POS-016), sem biblioteca externa: usa o
// BarcodeDetector do navegador (Chrome no Android). O que for lido vai para o campo indicado, como se tivesse sido
// digitado, e o formulário é enviado: a regra da busca e do checkout não muda. Leitor USB ou Bluetooth funciona
// como teclado e não precisa deste botão. Sem suporte (iPhone, por exemplo), avisa e a pessoa digita.
type Detector = { detect: (fonte: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type ConstrutorDeDetector = new (opcoes: { formats: string[] }) => Detector;
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];
const construtor = () => (globalThis as unknown as { BarcodeDetector?: ConstrutorDeDetector }).BarcodeDetector;
const SEM_SUPORTE = "Este aparelho não lê código pela câmera no navegador. Digite o número ou use um leitor USB/Bluetooth.";

export function LerCodigo({ alvo, enviar = true }: { alvo: string; enviar?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const Construtor = construtor();
    if (!aberto || aviso || !Construtor) return;
    let ativo = true;
    let fluxo: MediaStream | null = null;
    const detector = new Construtor({ formats: FORMATOS });
    (async () => {
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!ativo || !video.current) return;
        video.current.srcObject = fluxo;
        await video.current.play();
        while (ativo && video.current) {
          const achados = await detector.detect(video.current).catch(() => []);
          const lido = achados[0]?.rawValue?.trim();
          if (lido) {
            const campo = document.getElementById(alvo) as HTMLInputElement | HTMLTextAreaElement | null;
            if (campo) {
              campo.value = campo instanceof HTMLTextAreaElement && campo.value ? `${campo.value}\n${lido}` : lido;
              campo.dispatchEvent(new Event("input", { bubbles: true }));
              if (enviar) campo.form?.requestSubmit();
            }
            setAberto(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setAviso("Não deu para abrir a câmera. Confira a permissão do navegador ou digite o número.");
      }
    })();
    return () => { ativo = false; fluxo?.getTracks().forEach((t) => t.stop()); };
  }, [aberto, aviso, alvo, enviar]);

  return (
    <>
      <button type="button" onClick={() => { setAviso(construtor() && typeof navigator.mediaDevices?.getUserMedia === "function" ? null : SEM_SUPORTE); setAberto(true); }} aria-label="Ler código pela câmera"
        className="inline-flex min-h-11 items-center gap-1 rounded-botao border border-borda bg-white px-3 text-sm font-semibold text-acao">
        <Camera aria-hidden className="size-4" /> Câmera
      </button>
      {aberto && (
        <div role="dialog" aria-modal="true" aria-label="Ler código pela câmera" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4">
          {aviso ? <p className="max-w-sm rounded-xl bg-white p-4 text-sm">{aviso}</p>
            : <video ref={video} muted playsInline className="max-h-[60vh] w-full max-w-md rounded-xl bg-black" />}
          <p className="text-sm text-white">{aviso ? "" : "Aponte para o código de barras ou o QR."}</p>
          <button type="button" onClick={() => setAberto(false)} className="inline-flex min-h-11 items-center gap-1 rounded-botao bg-white px-4 text-sm font-semibold">
            <X aria-hidden className="size-4" /> Fechar
          </button>
        </div>
      )}
    </>
  );
}

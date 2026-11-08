"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Botao } from "../../componentes/ui";
import { caminhoDaFoto, conferirArquivo, dimensionar, ERROS_DE_FOTO, type ErroDeFoto, ehTipoDeFoto, type TipoDeFoto } from "../../lib/catalogo/fotos";
import type { Database } from "../../lib/supabase/tipos-banco";
import { registrarFoto } from "./acoes";

type Previa = { blob: Blob; url: string; largura: number; altura: number; tipo: TipoDeFoto };

// Reduz no próprio celular (lado maior 1600 px, sem cortar) e grava em WebP ou, se o aparelho
// não souber, em JPEG. A foto anterior só deixa de valer depois do registro no banco.
async function preparar(arquivo: File): Promise<Previa | ErroDeFoto> {
  if (!ehTipoDeFoto(arquivo.type)) return "tipo";
  const imagem = await createImageBitmap(arquivo);
  const { largura, altura } = dimensionar(imagem.width, imagem.height);
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  tela.getContext("2d")?.drawImage(imagem, 0, 0, largura, altura);
  const gerar = (tipo: string) => new Promise<Blob | null>((resolver) => tela.toBlob(resolver, tipo, 0.85));
  let blob = await gerar("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await gerar("image/jpeg");
  if (!blob || !ehTipoDeFoto(blob.type)) return "tipo";
  const problema = conferirArquivo(blob.type, blob.size, largura, altura);
  return problema ?? { blob, url: URL.createObjectURL(blob), largura, altura, tipo: blob.type };
}

export function EnviarFoto({ supabaseUrl, chavePublica, organizacao, produto, variante, rotulo }: {
  supabaseUrl: string; chavePublica: string; organizacao: string; produto: string; variante: string | null; rotulo: string;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<ErroDeFoto | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function escolher(arquivo: File | undefined) {
    setErro(null);
    if (!arquivo) return;
    const resultado = await preparar(arquivo).catch((): ErroDeFoto => "tipo");
    if (typeof resultado === "string") setErro(resultado);
    else setPrevia(resultado);
  }

  async function enviar() {
    if (!previa) return;
    setEnviando(true);
    setErro(null);
    try {
      const caminho = caminhoDaFoto(organizacao, produto, variante, crypto.randomUUID(), previa.tipo);
      const supabase = createBrowserClient<Database>(supabaseUrl, chavePublica);
      const envio = await supabase.storage.from("produtos").upload(caminho, previa.blob, { contentType: previa.tipo, upsert: false });
      if (envio.error) {
        setErro(/row-level security|unauthorized|403/i.test(envio.error.message) ? "permissao" : "envio");
        return;
      }
      const registro = await registrarFoto({ produto, variante, caminho, largura: previa.largura, altura: previa.altura });
      if (!registro.ok) {
        setErro(registro.erro);
        return;
      }
      URL.revokeObjectURL(previa.url);
      setPrevia(null);
      router.refresh();
    } catch {
      setErro("envio");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-2">
      <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only"
        aria-label={`Foto de ${rotulo}`} onChange={(e) => void escolher(e.target.files?.[0])} />
      {!previa && <Botao type="button" tamanho="sm" variante="secundario" onClick={() => entrada.current?.click()}><Camera aria-hidden className="size-4" /> Foto</Botao>}
      {previa && (
        <div className="space-y-2 rounded-xl border border-borda p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- prévia local antes do envio */}
          <img src={previa.url} alt={`Prévia da foto de ${rotulo}`} className="max-h-48 w-full rounded-lg object-contain" />
          <div className="flex gap-2">
            <Botao type="button" tamanho="sm" onClick={() => void enviar()} disabled={enviando}>{enviando ? "Enviando…" : "Usar esta foto"}</Botao>
            <Botao type="button" tamanho="sm" variante="fantasma" onClick={() => { URL.revokeObjectURL(previa.url); setPrevia(null); }} disabled={enviando}>Descartar</Botao>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="text-xs text-perigo">{ERROS_DE_FOTO[erro]}</p>}
    </div>
  );
}

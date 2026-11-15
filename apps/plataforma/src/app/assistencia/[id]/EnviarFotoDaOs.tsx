"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Botao } from "../../../componentes/ui";
import { dimensionar } from "../../../lib/catalogo/fotos";
import { caminhoDaFotoDaOs, ERROS_DA_OS, type ErroDaOs, LIMITE_DA_FOTO, type TipoDaFoto } from "../../../lib/assistencia/regras";
import { clienteDoNavegador } from "../../../lib/supabase/navegador";
import { registrarFotoDaOs } from "../acoes";

// Foto do aparelho na abertura da OS (lote L12a): reduzida no próprio celular (lado maior 1600 px, sem cortar), gravada
// no bucket privado "os" como a pessoa logada e registrada pelo servidor, que confere o conteúdo.
async function preparar(arquivo: File): Promise<{ blob: Blob; url: string; tipo: TipoDaFoto } | null> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type)) return null;
  const imagem = await createImageBitmap(arquivo);
  const { largura, altura } = dimensionar(imagem.width, imagem.height);
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  tela.getContext("2d")?.drawImage(imagem, 0, 0, largura, altura);
  const gerar = (tipo: string) => new Promise<Blob | null>((resolver) => tela.toBlob(resolver, tipo, 0.85));
  let blob = await gerar("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await gerar("image/jpeg");
  if (!blob || (blob.type !== "image/webp" && blob.type !== "image/jpeg") || blob.size > LIMITE_DA_FOTO) return null;
  return { blob, url: URL.createObjectURL(blob), tipo: blob.type };
}

export function EnviarFotoDaOs({ supabaseUrl, chavePublica, organizacao, unidade, os }: {
  supabaseUrl: string; chavePublica: string; organizacao: string; unidade: string; os: string;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<{ blob: Blob; url: string; tipo: TipoDaFoto } | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [erro, setErro] = useState<ErroDaOs | null>(null);
  const [enviando, setEnviando] = useState(false);
  const limpar = () => {
    if (previa) URL.revokeObjectURL(previa.url);
    setPrevia(null);
    setEnviado(null);
    if (entrada.current) entrada.current.value = "";
  };

  async function escolher(arquivo: File | undefined) {
    setErro(null);
    if (!arquivo) return;
    const resultado = await preparar(arquivo).catch(() => null);
    if (!resultado) {
      setErro("foto");
      if (entrada.current) entrada.current.value = "";
      return;
    }
    setEnviado(null);
    setPrevia(resultado);
  }

  async function enviar() {
    if (!previa) return;
    setEnviando(true);
    setErro(null);
    try {
      // Caminho já enviado para esta prévia: se o registro falhar, o novo clique só registra de novo.
      let caminho = enviado;
      if (!caminho) {
        const novo = caminhoDaFotoDaOs(organizacao, unidade, os, crypto.randomUUID(), previa.tipo);
        const supabase = await clienteDoNavegador(supabaseUrl, chavePublica);
        const envio = await supabase.storage.from("os").upload(novo, previa.blob, { contentType: previa.tipo, upsert: false });
        if (envio.error) {
          setErro(/row-level security|unauthorized|403/i.test(envio.error.message) ? "sem_permissao" : "falha");
          return;
        }
        caminho = novo;
        setEnviado(novo);
      }
      const registro = await registrarFotoDaOs({ os, caminho });
      if (!registro.ok) {
        setErro(registro.erro);
        return;
      }
      limpar();
      router.refresh();
    } catch {
      setErro("falha");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-2">
      <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only"
        aria-label="Foto do aparelho" onChange={(e) => void escolher(e.target.files?.[0])} />
      {!previa && <Botao type="button" tamanho="sm" variante="secundario" onClick={() => entrada.current?.click()}><Camera aria-hidden className="size-4" /> Tirar foto do aparelho</Botao>}
      {previa && (
        <div className="space-y-2 rounded-xl border border-borda p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- prévia local antes do envio */}
          <img src={previa.url} alt="Prévia da foto do aparelho" className="max-h-56 w-full rounded-lg object-contain" />
          <div className="flex gap-2">
            <Botao type="button" tamanho="sm" onClick={() => void enviar()} disabled={enviando}>{enviando ? "Enviando…" : "Guardar esta foto"}</Botao>
            <Botao type="button" tamanho="sm" variante="fantasma" onClick={limpar} disabled={enviando}>Descartar</Botao>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="text-xs text-perigo">{ERROS_DA_OS[erro]}</p>}
    </div>
  );
}

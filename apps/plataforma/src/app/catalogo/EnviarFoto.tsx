"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Botao } from "../../componentes/ui";
import { caminhoDaFoto, ERROS_DE_FOTO, type ErroDeFoto } from "../../lib/catalogo/fotos";
import { prepararFoto, type FotoPreparada } from "../../lib/catalogo/preparar-foto";
import { clienteDoNavegador } from "../../lib/supabase/navegador";
import { registrarFoto } from "./acoes";

type Previa = FotoPreparada & { url: string };

// A foto é preparada no próprio celular (lib/catalogo/preparar-foto.ts). A foto anterior só deixa de valer depois do
// registro no banco.
async function preparar(arquivo: File): Promise<Previa | ErroDeFoto> {
  const resultado = await prepararFoto(arquivo);
  return typeof resultado === "string" ? resultado : { ...resultado, url: URL.createObjectURL(resultado.blob) };
}

export function EnviarFoto({ supabaseUrl, chavePublica, organizacao, produto, variante, rotulo }: {
  supabaseUrl: string; chavePublica: string; organizacao: string; produto: string; variante: string | null; rotulo: string;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<ErroDeFoto | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Caminho já enviado ao Storage para ESTA prévia (REV-040, #42): se o registro falhar, o novo clique
  // só registra de novo (o banco devolve a mesma foto), sem mandar o arquivo outra vez.
  const [enviado, setEnviado] = useState<string | null>(null);
  // Descartar ou concluir limpa a escolha (REV-041, #43): o mesmo arquivo pode ser escolhido de novo.
  const limpar = (atual: Previa | null) => {
    if (atual) URL.revokeObjectURL(atual.url);
    setPrevia(null);
    setEnviado(null);
    if (entrada.current) entrada.current.value = "";
  };

  async function escolher(arquivo: File | undefined) {
    setErro(null);
    if (!arquivo) return;
    const resultado = await preparar(arquivo).catch((): ErroDeFoto => "tipo");
    if (typeof resultado === "string") {
      setErro(resultado);
      if (entrada.current) entrada.current.value = "";
    } else {
      setEnviado(null);
      setPrevia(resultado);
    }
  }

  async function enviar() {
    if (!previa) return;
    setEnviando(true);
    setErro(null);
    try {
      let caminho = enviado;
      if (!caminho) {
        const novo = caminhoDaFoto(organizacao, produto, variante, crypto.randomUUID(), previa.tipo);
        const supabase = await clienteDoNavegador(supabaseUrl, chavePublica);
        const envio = await supabase.storage.from("produtos").upload(novo, previa.blob, { contentType: previa.tipo, upsert: false });
        if (envio.error) {
          setErro(/row-level security|unauthorized|403/i.test(envio.error.message) ? "permissao" : "envio");
          return;
        }
        caminho = novo;
        setEnviado(novo);
      }
      const registro = await registrarFoto({ produto, variante, caminho, largura: previa.largura, altura: previa.altura });
      if (!registro.ok) {
        setErro(registro.erro);
        return;
      }
      limpar(previa);
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
            <Botao type="button" tamanho="sm" variante="fantasma" onClick={() => limpar(previa)} disabled={enviando}>Descartar</Botao>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="text-xs text-perigo">{ERROS_DE_FOTO[erro]}</p>}
    </div>
  );
}

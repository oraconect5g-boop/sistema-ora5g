"use client";

import { createBrowserClient } from "@supabase/ssr";
import { CheckCircle2, CircleAlert, ImagePlus, LoaderCircle, MinusCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Botao } from "../../../componentes/ui";
import { ERROS_DE_FOTO } from "../../../lib/catalogo/fotos";
import {
  enviarLote, MAXIMO_DO_LOTE, MOTIVOS_DE_FICAR_DE_FORA, planejarLote, resumoDoLote, skusDoLote, type ItemDoLote, type PassosDoEnvio,
} from "../../../lib/catalogo/lote-de-fotos";
import { prepararFoto } from "../../../lib/catalogo/preparar-foto";
import type { Database } from "../../../lib/supabase/tipos-banco";
import { localizarDestinos, registrarFoto } from "../acoes";

// Fotos em lote (lote CAT-010): escolher várias fotos de uma vez, ver para onde cada uma vai e enviar uma a uma, com o
// mesmo caminho da foto avulsa (reduzida no aparelho, guardada no Storage como a pessoa logada e registrada pelo banco).
// As regras estão em lib/catalogo/lote-de-fotos.ts.

const ERRO_DA_BUSCA = {
  dados: "Nenhuma das fotos tem nome de SKU para procurar.",
  permissao: "Só quem gere o catálogo envia fotos.",
  falha: "Não deu para procurar os SKUs agora. Tente de novo em instantes.",
} as const;

function Situacao({ item }: { item: ItemDoLote }) {
  const s = item.situacao;
  if (s.estado === "pronta") return <span className="text-xs text-suave">pronta para enviar</span>;
  if (s.estado === "enviando") return <span className="inline-flex items-center gap-1 text-xs text-acao"><LoaderCircle aria-hidden className="size-3.5 animate-spin" /> enviando…</span>;
  if (s.estado === "feita") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-sucesso"><CheckCircle2 aria-hidden className="size-3.5" /> foto em uso</span>;
  if (s.estado === "erro") return <span className="inline-flex items-start gap-1 text-xs text-perigo"><CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {ERROS_DE_FOTO[s.erro]}</span>;
  return <span className="inline-flex items-start gap-1 text-xs text-suave"><MinusCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {MOTIVOS_DE_FICAR_DE_FORA[s.motivo]}</span>;
}

/** O resumo e a lista do lote: cada foto com a prévia, o destino e a situação (só apresentação). */
export function PlanoDoLote({ itens, previas }: { itens: readonly ItemDoLote[]; previas: readonly string[] }) {
  const resumo = resumoDoLote(itens);
  return (
    <>
      <p className="text-sm" aria-live="polite">
        {[
          resumo.feitas > 0 && `${resumo.feitas} em uso`,
          resumo.enviando > 0 && "enviando…",
          resumo.prontas > 0 && `${resumo.prontas} ${resumo.prontas === 1 ? "pronta" : "prontas"} para enviar`,
          resumo.comErro > 0 && `${resumo.comErro} com erro`,
          resumo.deFora > 0 && `${resumo.deFora} de fora`,
        ].filter(Boolean).join(" · ")}
      </p>
      <ul className="divide-y divide-borda rounded-xl border border-borda">
        {itens.map((item) => (
          <li key={item.indice} className="flex items-center gap-3 p-2">
            {previas[item.indice]
              // eslint-disable-next-line @next/next/no-img-element -- prévia local da foto escolhida, antes do envio
              ? <img src={previas[item.indice]} alt="" className="size-14 shrink-0 rounded-lg bg-fundo object-cover" />
              : <span className="size-14 shrink-0 rounded-lg bg-fundo" />}
            <div className="min-w-0 flex-1">
              <p className="numeros truncate text-sm font-semibold">{item.nome}</p>
              {item.destino && (
                <p className="text-xs">{item.destino.rotulo}{item.destino.temFoto && <span className="text-suave"> (troca a foto atual)</span>}</p>
              )}
              <Situacao item={item} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function FotosEmLote({ supabaseUrl, chavePublica }: { supabaseUrl: string; chavePublica: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [previas, setPrevias] = useState<string[]>([]);
  const [itens, setItens] = useState<ItemDoLote[] | null>(null);
  const [procurando, setProcurando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroDaBusca, setErroDaBusca] = useState<keyof typeof ERRO_DA_BUSCA | null>(null);

  // As prévias são endereços locais das fotos escolhidas: liberadas ao trocar o lote e ao sair da tela.
  useEffect(() => () => previas.forEach((u) => URL.revokeObjectURL(u)), [previas]);

  async function escolher(lista: FileList | null) {
    setErroDaBusca(null);
    setItens(null);
    const escolhidos = lista ? [...lista] : [];
    setArquivos(escolhidos);
    setPrevias(escolhidos.slice(0, MAXIMO_DO_LOTE).map((a) => URL.createObjectURL(a)));
    if (escolhidos.length === 0) return;
    const descritos = escolhidos.map((a) => ({ nome: a.name, tipo: a.type }));
    const skus = skusDoLote(descritos);
    if (skus.length === 0) {
      setItens(planejarLote(descritos, []));
      return;
    }
    setProcurando(true);
    try {
      const achados = await localizarDestinos(skus);
      if (!achados.ok) setErroDaBusca(achados.erro);
      else setItens(planejarLote(descritos, achados.destinos));
    } catch {
      setErroDaBusca("falha");
    } finally {
      setProcurando(false);
    }
  }

  async function enviar() {
    if (!itens) return;
    setEnviando(true);
    const supabase = createBrowserClient<Database>(supabaseUrl, chavePublica);
    const passos: PassosDoEnvio = {
      preparar: async (indice) => {
        const arquivo = arquivos[indice];
        return arquivo ? prepararFoto(arquivo) : "tipo";
      },
      enviar: async (caminho, foto) => {
        const envio = await supabase.storage.from("produtos").upload(caminho, foto.blob, { contentType: foto.tipo, upsert: false });
        if (!envio.error) return "ok";
        return /row-level security|unauthorized|403/i.test(envio.error.message) ? "permissao" : "envio";
      },
      registrar: (dados) => registrarFoto(dados),
      novoId: () => crypto.randomUUID(),
    };
    try {
      await enviarLote(itens, passos, setItens);
    } finally {
      setEnviando(false);
    }
  }

  const resumo = itens ? resumoDoLote(itens) : null;
  const paraEnviar = resumo ? resumo.prontas + resumo.comErro : 0;
  return (
    <div className="space-y-4">
      <input ref={entrada} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Escolher as fotos do lote"
        onChange={(e) => void escolher(e.target.files)} />
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="button" onClick={() => entrada.current?.click()} disabled={enviando || procurando}><ImagePlus aria-hidden className="size-4" /> Escolher as fotos</Botao>
        {arquivos.length > 0 && <span className="text-sm text-suave">{`${arquivos.length} ${arquivos.length === 1 ? "foto escolhida" : "fotos escolhidas"}`}</span>}
      </div>
      {procurando && <p className="inline-flex items-center gap-2 text-sm text-suave"><LoaderCircle aria-hidden className="size-4 animate-spin" /> Procurando os SKUs no catálogo…</p>}
      {erroDaBusca && <p role="alert" className="text-sm text-perigo">{ERRO_DA_BUSCA[erroDaBusca]}</p>}

      {itens && resumo && (
        <>
          <PlanoDoLote itens={itens} previas={previas} />
          <div className="flex flex-wrap items-center gap-2">
            {paraEnviar > 0 && (
              <Botao type="button" onClick={() => void enviar()} disabled={enviando}>
                {enviando ? "Enviando…" : resumo.comErro > 0 && resumo.prontas === 0 ? `Tentar de novo as ${resumo.comErro} com erro` : `Enviar ${paraEnviar} ${paraEnviar === 1 ? "foto" : "fotos"}`}
              </Botao>
            )}
            {!enviando && resumo.feitas > 0 && <Link href="/catalogo?pendentes=1" className="text-sm font-semibold text-acao hover:underline">Ver o que ainda falta no catálogo</Link>}
          </div>
        </>
      )}
    </div>
  );
}

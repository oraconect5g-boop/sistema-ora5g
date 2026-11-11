"use client";

import { Search, X } from "lucide-react";
import { useState, useTransition } from "react";

import { buscarItensParaEntrada, type ItemParaEntrada } from "../entrada/acoes";

// Escolha dos itens a contar: busca no banco (nome ou SKU) e lista os escolhidos; cada um vai no
// formulário como "variante" (o banco confere de novo se é da rede, ativo e com estoque).
export function EscolherItens() {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<ItemParaEntrada[] | null>(null);
  const [escolhidos, setEscolhidos] = useState<ItemParaEntrada[]>([]);
  const [buscando, iniciar] = useTransition();
  const buscar = () => iniciar(async () => setAchados(await buscarItensParaEntrada(termo)));
  const incluir = (item: ItemParaEntrada) => setEscolhidos((e) => (e.some((x) => x.id === item.id) ? e : [...e, item].slice(0, 300)));
  const incluirTodos = () => achados && setEscolhidos((e) => [...e, ...achados.filter((a) => !e.some((x) => x.id === a.id))].slice(0, 300));

  return (
    <div className="space-y-2">
      {escolhidos.map((e) => <input key={e.id} type="hidden" name="variante" value={e.id} />)}
      <label htmlFor="busca-inventario" className="block text-sm font-medium">Itens a contar (nome ou SKU)</label>
      <div className="flex gap-2">
        <input id="busca-inventario" value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
          placeholder="capa, película, APA-" className="min-h-11 min-w-0 flex-1 rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" />
        <button type="button" onClick={buscar} disabled={buscando || termo.trim().length < 2} className="inline-flex min-h-11 items-center gap-1 rounded-botao bg-acao-clara px-3 text-sm font-semibold text-acao disabled:opacity-50">
          <Search aria-hidden className="size-4" /> {buscando ? "Buscando" : "Buscar"}
        </button>
      </div>
      {achados && (
        <div className="rounded-xl border border-borda">
          <ul className="max-h-56 divide-y divide-borda overflow-y-auto text-sm">
            {achados.map((a) => (
              <li key={a.id}><button type="button" onClick={() => incluir(a)} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-acao-clara">
                <span><span className="numeros font-semibold">{a.sku}</span> {a.nome}</span><span className="text-xs text-acao">incluir</span>
              </button></li>
            ))}
            {achados.length === 0 && <li className="px-3 py-2 text-suave">Nada encontrado.</li>}
          </ul>
          {achados.length > 1 && <button type="button" onClick={incluirTodos} className="min-h-10 w-full border-t border-borda text-sm font-semibold text-acao">Incluir todos os {achados.length}</button>}
        </div>
      )}
      <ul className="flex flex-wrap gap-2">
        {escolhidos.map((e) => (
          <li key={e.id} className="inline-flex items-center gap-1 rounded-full bg-fundo py-1 pl-3 pr-1 text-xs">
            <span className="numeros font-semibold">{e.sku}</span>
            <button type="button" onClick={() => setEscolhidos((x) => x.filter((y) => y.id !== e.id))} aria-label={`Tirar ${e.sku}`} className="grid size-8 place-items-center rounded-full hover:bg-white"><X aria-hidden className="size-3.5" /></button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-suave">{escolhidos.length} item(ns) escolhido(s) (até 300).</p>
    </div>
  );
}

"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { BotaoDeEnvio } from "../../../componentes/BotaoDeEnvio";
import type { ItemParaEntrada } from "../entrada/acoes";
import { BuscaDoItem } from "../entrada/FormularioEntrada";
import { criarPedido } from "./acoes";

// O pedido novo (lote INV-009a): o fornecedor, a referência, a previsão, a observação e os itens (a busca é a mesma da
// entrada de mercadoria). As linhas vão para o servidor num campo só (JSON), que o servidor e o banco conferem de novo;
// a chave do formulário (gerada na tela do servidor) impede pedido em dobro.
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
type Linha = { chave: string; item: ItemParaEntrada | null; quantidade: string; custo: string };
const novaLinha = (n: number): Linha => ({ chave: `l${n}`, item: null, quantidade: "1", custo: "" });

export function FormularioPedido({ unidade, chave, fornecedores, hoje }: { unidade: string; chave: string; fornecedores: { id: string; nome: string }[]; hoje: string }) {
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha(1)]);
  const [proxima, setProxima] = useState(2);
  const mudar = (chaveDaLinha: string, mudanca: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chaveDaLinha ? { ...l, ...mudanca } : l)));
  const prontas = linhas.filter((l) => l.item);
  const itens = JSON.stringify(prontas.map((l) => ({ variante: l.item?.id, quantidade: l.quantidade, custo: l.custo })));
  const unidades = prontas.reduce((s, l) => s + (Number(l.quantidade) || 0), 0);

  return (
    <form action={criarPedido} className="space-y-4">
      <input type="hidden" name="unidade" value={unidade} />
      <input type="hidden" name="chave" value={chave} />
      <input type="hidden" name="itens" value={itens} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Fornecedor
          <select name="fornecedor" required className={campo} defaultValue="">
            <option value="" disabled>escolha o fornecedor</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Referência do fornecedor (opcional)<input name="documento" maxLength={60} placeholder="Cotação 77, pedido no site" className={campo} /></label>
        <label className="block text-sm font-medium">Previsão de entrega (opcional)<input name="previsto" type="date" min={hoje} className={campo} /></label>
        <label className="block text-sm font-medium">Observação (opcional)<input name="observacao" minLength={3} maxLength={300} placeholder="Entregar pela manhã" className={campo} /></label>
      </div>

      <ol className="space-y-3">
        {linhas.map((l, i) => (
          <li key={l.chave} className="rounded-xl border border-borda p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">Item {i + 1}{l.item && <>: <span className="numeros">{l.item.sku}</span> {l.item.nome}</>}</p>
              {linhas.length > 1 && (
                <button type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))} aria-label={`Tirar o item ${i + 1}`} className="grid size-10 place-items-center rounded-full text-perigo hover:bg-perigo-clara">
                  <Trash2 aria-hidden className="size-4" />
                </button>
              )}
            </div>
            {!l.item ? <BuscaDoItem aoEscolher={(item) => mudar(l.chave, { item })} /> : (
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-medium">Quantidade<input type="number" min={1} max={10000} value={l.quantidade} onChange={(e) => mudar(l.chave, { quantidade: e.target.value })} required className={campo} /></label>
                <label className="block text-sm font-medium">Custo combinado por unidade (R$, opcional)<input inputMode="decimal" value={l.custo} onChange={(e) => mudar(l.chave, { custo: e.target.value })} placeholder="1.050,00" className={campo} /></label>
                <button type="button" onClick={() => mudar(l.chave, { item: null })} className="self-end text-left text-sm font-semibold text-acao">Trocar o item</button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => { setLinhas((ls) => [...ls, novaLinha(proxima)]); setProxima((n) => n + 1); }}
        className="inline-flex min-h-11 items-center gap-2 rounded-botao border border-borda bg-white px-4 text-sm font-semibold text-acao">
        <Plus aria-hidden className="size-4" /> Mais um item
      </button>
      <BotaoDeEnvio disabled={prontas.length === 0} enquanto="Registrando o pedido…" className="block min-h-11 rounded-botao bg-acao px-5 text-sm font-semibold text-white disabled:opacity-50">
        {`Registrar o pedido (${prontas.length} ${prontas.length === 1 ? "item" : "itens"}, ${unidades} ${unidades === 1 ? "unidade" : "unidades"})`}
      </BotaoDeEnvio>
    </form>
  );
}

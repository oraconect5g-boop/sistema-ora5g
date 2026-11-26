"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { BotaoDeEnvio } from "../../../componentes/BotaoDeEnvio";
import { CONDICOES, contarAparelhosNaEntrada, separarIdentificadores, TIPOS_DE_ENTRADA } from "../../../lib/estoque/entrada";
import type { PedidoParaReceber } from "../../../lib/estoque/receber-do-pedido";
import { buscarItensParaEntrada, registrarEntrada, type ItemParaEntrada } from "./acoes";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
/** `falta`: na entrada a partir do pedido de compra (INV-009b), quanto falta receber deste item do pedido. */
type Linha = { chave: string; item: ItemParaEntrada | null; quantidade: string; identificadores: string; custo: string; condicao: string; falta?: number };
const novaLinha = (n: number): Linha => ({ chave: `l${n}`, item: null, quantidade: "1", identificadores: "", custo: "", condicao: "novo" });
/** As linhas do que falta receber do pedido: o acessório já com a quantidade; aparelho e chip esperam a leitura dos códigos. */
const linhasDoPedido = (pedido: PedidoParaReceber): Linha[] => pedido.linhas.map((l, i) => ({
  chave: `p${i + 1}`, item: l.item, quantidade: l.item.tipo === "acessorio" ? String(l.falta) : "1", identificadores: "", custo: l.custo, condicao: "novo", falta: l.falta,
}));

export function BuscaDoItem({ aoEscolher }: { aoEscolher: (item: ItemParaEntrada) => void }) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<ItemParaEntrada[] | null>(null);
  const [buscando, iniciar] = useTransition();
  const id = useId();
  const buscar = () => iniciar(async () => setAchados(await buscarItensParaEntrada(termo)));
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">Item (nome, marca, SKU ou código de barras)</label>
      <div className="mt-1 flex gap-2">
        <input id={id} value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
          className="min-h-11 min-w-0 flex-1 rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" placeholder="Galaxy A16 ou APA-0001" />
        <button type="button" onClick={buscar} disabled={buscando || termo.trim().length < 2} className="inline-flex min-h-11 items-center gap-1 rounded-botao bg-acao-clara px-3 text-sm font-semibold text-acao disabled:opacity-50">
          <Search aria-hidden className="size-4" /> {buscando ? "Buscando" : "Buscar"}
        </button>
      </div>
      {achados && (
        <ul className="mt-2 max-h-56 divide-y divide-borda overflow-y-auto rounded-xl border border-borda text-sm">
          {achados.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => aoEscolher(a)} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-acao-clara">
                <span><span className="numeros font-semibold">{a.sku}</span> {a.nome}</span>
                <span className="text-xs text-suave">{a.tipo === "acessorio" ? "por quantidade" : a.tipo === "aparelho" ? "por IMEI" : "por ICCID"}</span>
              </button>
            </li>
          ))}
          {achados.length === 0 && <li className="px-3 py-2 text-suave">Nada encontrado (só itens com estoque: aparelho, chip e acessório).</li>}
        </ul>
      )}
    </div>
  );
}

// Formulário da entrada: as linhas vão para o servidor num campo só (JSON), que o servidor e o banco
// conferem de novo. A chave do formulário (gerada na tela do servidor) impede entrada em dobro.
export function FormularioEntrada({ unidade, chave, fornecedores, pedido = null }: {
  unidade: string; chave: string; fornecedores: { id: string; nome: string }[]; pedido?: PedidoParaReceber | null;
}) {
  const [tipo, setTipo] = useState<"compra" | "carga_inicial">(pedido || fornecedores.length ? "compra" : "carga_inicial");
  const [linhas, setLinhas] = useState<Linha[]>(() => (pedido ? linhasDoPedido(pedido) : [novaLinha(1)]));
  const [proxima, setProxima] = useState(() => (pedido ? pedido.linhas.length + 1 : 2));
  const mudar = (chaveDaLinha: string, mudanca: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chaveDaLinha ? { ...l, ...mudanca } : l)));
  const prontas = linhas.filter((l) => l.item);
  const itens = JSON.stringify(prontas.map((l) => ({
    variante: l.item?.id, tipo: l.item?.tipo, quantidade: l.quantidade, identificadores: l.identificadores, custo: l.custo, condicao: l.condicao,
  })));

  return (
    <form action={registrarEntrada} className="space-y-4">
      <input type="hidden" name="unidade" value={unidade} />
      <input type="hidden" name="chave" value={chave} />
      <input type="hidden" name="itens" value={itens} />
      {pedido ? (
        <>
          {/* INV-009b: a compra do pedido, do fornecedor do pedido; registrada, a entrada já sai ligada a ele. */}
          <input type="hidden" name="pedido" value={pedido.id} />
          <input type="hidden" name="tipo" value="compra" />
          <input type="hidden" name="fornecedor" value={pedido.fornecedorId} />
          <div className="rounded-xl bg-acao-clara/50 p-3 text-sm">
            <p className="font-semibold">{`Recebendo o pedido de compra nº ${pedido.numero}, de ${pedido.fornecedor}`}</p>
            <p className="mt-1 text-suave">As linhas são o que falta receber. Confira com a nota: tire o que não veio e acerte as quantidades; aparelho e chip entram pela leitura do IMEI ou do ICCID.{pedido.deFora === 1 ? " 1 item do pedido ficou de fora por estar inativo no catálogo." : pedido.deFora > 1 ? ` ${pedido.deFora} itens do pedido ficaram de fora por estarem inativos no catálogo.` : ""}</p>
          </div>
          <label className="block text-sm font-medium">Documento (nota)<input name="documento" maxLength={60} placeholder="NF 1234" className={campo} /></label>
        </>
      ) : (
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 font-medium">Tipo de entrada</legend>
          {Object.entries(TIPOS_DE_ENTRADA).map(([valor, nome]) => (
            <label key={valor} className="flex min-h-10 items-center gap-2">
              <input type="radio" name="tipo" value={valor} checked={tipo === valor} onChange={() => setTipo(valor as typeof tipo)} className="size-4 accent-acao" /> {nome}
            </label>
          ))}
        </fieldset>
      )}
      {!pedido && tipo === "compra" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Fornecedor
            <select name="fornecedor" required className={campo} defaultValue="">
              <option value="" disabled>escolha o fornecedor</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Documento (nota, pedido)<input name="documento" maxLength={60} placeholder="NF 1234" className={campo} /></label>
        </div>
      )}

      <ol className="space-y-3">
        {linhas.map((l, i) => (
          <li key={l.chave} className="rounded-xl border border-borda p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">Linha {i + 1}{l.item && <>: <span className="numeros">{l.item.sku}</span> {l.item.nome}</>}</p>
              {linhas.length > 1 && (
                <button type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))} aria-label={`Tirar a linha ${i + 1}`} className="grid size-10 place-items-center rounded-full text-perigo hover:bg-perigo-clara">
                  <Trash2 aria-hidden className="size-4" />
                </button>
              )}
            </div>
            {!l.item ? <BuscaDoItem aoEscolher={(item) => mudar(l.chave, { item })} /> : (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {l.item.tipo === "acessorio" ? (
                  <label className="block text-sm font-medium">Quantidade<input type="number" min={1} max={10000} value={l.quantidade} onChange={(e) => mudar(l.chave, { quantidade: e.target.value })} required className={campo} />
                    {l.falta !== undefined && <span className="text-xs text-suave">{`faltam ${l.falta} do pedido`}</span>}
                  </label>
                ) : (
                  <label className="block text-sm font-medium sm:col-span-2">{l.item.tipo === "aparelho" ? "IMEI de cada unidade (um aparelho por linha)" : "ICCID de cada unidade (um por linha)"}
                    <textarea rows={4} value={l.identificadores} onChange={(e) => mudar(l.chave, { identificadores: e.target.value })} required inputMode={l.item.tipo === "aparelho" ? "text" : "numeric"} className={`${campo} py-2 font-mono`} />
                    {l.item.tipo === "aparelho" && <span className="block text-xs text-suave">Se o aparelho tiver dois IMEIs, use IMEI 1/IMEI 2 na mesma linha. Isso conta uma unidade.</span>}
                    <span className="text-xs text-suave">{(l.item.tipo === "aparelho" ? contarAparelhosNaEntrada(l.identificadores) : separarIdentificadores(l.identificadores).length)} unidade(s){l.falta !== undefined ? ` · faltam ${l.falta} do pedido` : ""}</span>
                  </label>
                )}
                <label className="block text-sm font-medium">Custo por unidade (R$, opcional)<input inputMode="decimal" value={l.custo} onChange={(e) => mudar(l.chave, { custo: e.target.value })} placeholder="1.050,00" className={campo} /></label>
                {l.item.tipo !== "acessorio" && (
                  <label className="block text-sm font-medium">Condição
                    <select value={l.condicao} onChange={(e) => mudar(l.chave, { condicao: e.target.value })} className={campo}>
                      {Object.entries(CONDICOES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </select>
                  </label>
                )}
                <button type="button" onClick={() => mudar(l.chave, { item: null, identificadores: "" })} className="self-end text-left text-sm font-semibold text-acao">Trocar o item</button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => { setLinhas((ls) => [...ls, novaLinha(proxima)]); setProxima((n) => n + 1); }}
        className="inline-flex min-h-11 items-center gap-2 rounded-botao border border-borda bg-white px-4 text-sm font-semibold text-acao">
        <Plus aria-hidden className="size-4" /> Mais um item
      </button>
      <label className="block text-sm font-medium">Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={200} defaultValue={pedido ? `Recebimento do pedido nº ${pedido.numero}` : undefined} placeholder={tipo === "compra" ? "Pedido da semana" : "Estoque que já estava na loja"} className={campo} /></label>
      <BotaoDeEnvio disabled={prontas.length === 0} enquanto="Registrando a entrada…" className="inline-flex min-h-11 items-center justify-center rounded-botao bg-acao px-5 text-sm font-semibold text-white disabled:opacity-50">
        Registrar entrada ({prontas.length} {prontas.length === 1 ? "linha" : "linhas"})
      </BotaoDeEnvio>
    </form>
  );
}

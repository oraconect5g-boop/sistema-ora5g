"use client";

import { ArrowRightLeft, Boxes, PackageCheck, QrCode, Truck } from "lucide-react";
import { useState } from "react";

import { Aviso, Botao, Cartao, Etapas, ListaDados, Selo } from "../../../../componentes/ui";
import type { PlanoConnect } from "../../../../demo/dados/connect";
import { iccidNoFormatoContel } from "../../../../integracoes/nogle/regras";
import { brl } from "../../../../lib/formato";
import { classeCampo, soDigitos } from "./util";

type Compra = { id: number; cliente: string; quantidade: number; plano: string; rastreio: readonly { diasAtras: number; status: string }[] };

/** Estoque de chips (GET /linhas/estoque, /pdv/estoque), transferência para a loja e compra com entrega (POST /compra). */
export function ChipsConnect({ loja, fisicosDaLoja, esimDaLoja, estoqueMinimo, estoqueVirgem, podeTransferir, compras, planos, logistica }: {
  loja: string;
  fisicosDaLoja: readonly string[];
  esimDaLoja: number;
  estoqueMinimo: number;
  estoqueVirgem: readonly { id: string; iccid: string; tipo: "físico" | "eSIM" }[];
  podeTransferir: boolean;
  compras: readonly Compra[];
  planos: readonly PlanoConnect[];
  logistica: { frete: number; chip: number };
}) {
  const [fisicos, setFisicos] = useState([...fisicosDaLoja]);
  const [esim, setEsim] = useState(esimDaLoja);
  const [virgem, setVirgem] = useState([...estoqueVirgem]);
  const [modo, setModo] = useState<"unidade" | "lote" | "esim">("unidade");
  const [transf, setTransf] = useState({ iccid: "", inicial: "", final: "", quantidade: "5", resultado: "" });
  const [lista, setLista] = useState<Compra[]>([...compras]);
  const [compra, setCompra] = useState({ cliente: "", plano: 0, quantidade: "1", erro: "" });
  const [aberta, setAberta] = useState<number | null>(compras[0]?.id ?? null);

  const abaixoDoMinimo = fisicos.length < estoqueMinimo;

  function transferir() {
    if (modo === "unidade") {
      const chip = virgem.find((c) => c.iccid === soDigitos(transf.iccid) && c.tipo === "físico");
      if (!chip) return setTransf({ ...transf, resultado: iccidNoFormatoContel(transf.iccid) ? "Esse chip não está no estoque virgem da Ora." : "ICCID inválido: 19 dígitos que começam com 8955." });
      setFisicos([...fisicos, chip.iccid]);
      setVirgem(virgem.filter((c) => c !== chip));
      return setTransf({ ...transf, iccid: "", resultado: `1 chip transferido para ${loja}.` });
    }
    if (modo === "lote") {
      const ini = soDigitos(transf.inicial);
      const fim = soDigitos(transf.final);
      if (!iccidNoFormatoContel(ini) || !iccidNoFormatoContel(fim) || ini > fim) return setTransf({ ...transf, resultado: "Informe o ICCID inicial e o final do lote (do menor para o maior)." });
      const lote = virgem.filter((c) => c.tipo === "físico" && c.iccid >= ini && c.iccid <= fim);
      setFisicos([...fisicos, ...lote.map((c) => c.iccid)]);
      setVirgem(virgem.filter((c) => !lote.includes(c)));
      return setTransf({ ...transf, resultado: `${lote.length} transferidos, 0 não transferidos.` });
    }
    // REV-024 (#23): o eSIM sai do estoque virgem (cada unidade uma vez só) e nunca passa do que há nele.
    const quantidade = Number(transf.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 100) return setTransf({ ...transf, resultado: "Quantidade de eSIM entre 1 e 100." });
    const disponiveis = virgem.filter((c) => c.tipo === "eSIM");
    if (quantidade > disponiveis.length) {
      return setTransf({ ...transf, resultado: disponiveis.length === 0 ? "Não há eSIM no estoque virgem da Ora." : `Só há ${disponiveis.length} eSIM no estoque virgem da Ora. Nada foi transferido.` });
    }
    const levados = new Set(disponiveis.slice(0, quantidade));
    setVirgem(virgem.filter((c) => !levados.has(c)));
    setEsim(esim + quantidade);
    setTransf({ ...transf, resultado: `${quantidade} eSIM transferidos para ${loja}.` });
  }

  const planoCompra = planos.find((p) => p.id === compra.plano);
  const quantidade = Math.max(1, Math.min(15, Number(compra.quantidade) || 1));
  const totalCompra = quantidade * (logistica.chip + (planoCompra?.valor ?? 0)) + logistica.frete;

  function comprar() {
    if (compra.cliente.trim().length < 3) return setCompra({ ...compra, erro: "Informe o nome do cliente." });
    const id = 9_200 + lista.length;
    setLista([{ id, cliente: compra.cliente.trim(), quantidade, plano: planoCompra?.plano ?? "Apenas chip", rastreio: [{ diasAtras: 0, status: "AGUARDANDO PAGAMENTO" }] }, ...lista]);
    setAberta(id);
    setCompra({ cliente: "", plano: 0, quantidade: "1", erro: "" });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Cartao titulo={`Chips em ${loja}`} subtitulo="Estoque da loja na Contel (GET /pdv/estoque)" icone={Boxes}>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-fundo p-3"><p className="text-2xl font-bold">{fisicos.length}</p><p className="text-xs text-suave">Chips físicos</p></div>
          <div className="rounded-xl bg-fundo p-3"><p className="text-2xl font-bold">{esim}</p><p className="text-xs text-suave">eSIM</p></div>
        </div>
        {abaixoDoMinimo ? <Aviso tom="aviso" className="mt-3">Abaixo do mínimo da loja ({estoqueMinimo} chips físicos).</Aviso> : <p className="mt-3 text-xs text-suave">Mínimo da loja: {estoqueMinimo} chips físicos.</p>}
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs">
          {fisicos.map((c) => <li key={c} className="numeros flex justify-between rounded bg-slate-50 px-2 py-1">ICCID •••• {c.slice(-4)}<Selo tom="sucesso">virgem</Selo></li>)}
        </ul>
      </Cartao>

      <Cartao titulo="Levar chips para a loja" subtitulo="Do estoque virgem da Ora na Contel (GET /linhas/estoque)" icone={ArrowRightLeft}>
        {!podeTransferir ? (
          <p className="text-sm text-suave">A transferência de chips entre o estoque central e as lojas é feita pelo gerente ou pelo dono.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de transferência">
              {([["unidade", "Um chip"], ["lote", "Lote"], ["esim", "eSIM"]] as const).map(([valor, rotulo]) => (
                <button key={valor} type="button" aria-pressed={modo === valor} onClick={() => setModo(valor)} className={`min-h-9 rounded-lg border px-3 text-xs font-semibold ${modo === valor ? "border-acao bg-acao-clara text-acao-escura" : "border-borda bg-white text-suave"}`}>{rotulo}</button>
              ))}
            </div>
            {modo === "unidade" && (
              <label className="block text-sm font-medium">ICCID do chip
                <select value={transf.iccid} onChange={(e) => setTransf({ ...transf, iccid: e.target.value, resultado: "" })} className={`${classeCampo} numeros mt-1`}>
                  <option value="">Escolha um chip virgem</option>
                  {virgem.filter((c) => c.tipo === "físico").map((c) => <option key={c.iccid} value={c.iccid}>•••• {c.iccid.slice(-6)}</option>)}
                </select>
              </label>
            )}
            {modo === "lote" && (
              <div className="grid gap-2">
                <label className="text-sm font-medium">ICCID inicial<input value={transf.inicial} onChange={(e) => setTransf({ ...transf, inicial: e.target.value, resultado: "" })} inputMode="numeric" className={`${classeCampo} numeros mt-1`} /></label>
                <label className="text-sm font-medium">ICCID final<input value={transf.final} onChange={(e) => setTransf({ ...transf, final: e.target.value, resultado: "" })} inputMode="numeric" className={`${classeCampo} numeros mt-1`} /></label>
                <p className="text-xs text-suave">Ex.: do <span className="numeros">{virgem.find((c) => c.tipo === "físico")?.iccid ?? "—"}</span> ao <span className="numeros">{virgem.filter((c) => c.tipo === "físico").at(-1)?.iccid ?? "—"}</span></p>
              </div>
            )}
            {modo === "esim" && <label className="block text-sm font-medium">Quantidade de eSIM<input value={transf.quantidade} onChange={(e) => setTransf({ ...transf, quantidade: e.target.value.replace(/\D/g, ""), resultado: "" })} inputMode="numeric" className={`${classeCampo} numeros mt-1`} /></label>}
            <Botao onClick={transferir} className="w-full"><PackageCheck aria-hidden className="size-4" /> Transferir para {loja}</Botao>
            {transf.resultado && <p aria-live="polite" className="text-sm">{transf.resultado}</p>}
            <p className="text-xs text-suave">Estoque virgem: {virgem.filter((c) => c.tipo === "físico").length} físicos · {virgem.filter((c) => c.tipo === "eSIM").length} eSIM.</p>
          </div>
        )}
      </Cartao>

      <Cartao titulo="Chip com entrega em casa" subtitulo="A Contel entrega pelo correio (POST /compra/solicitar)" icone={Truck}>
        <div className="space-y-3">
          <label className="block text-sm font-medium">Nome do cliente<input value={compra.cliente} onChange={(e) => setCompra({ ...compra, cliente: e.target.value, erro: "" })} className={`${classeCampo} mt-1`} /></label>
          <label className="block text-sm font-medium">Plano<select value={compra.plano} onChange={(e) => setCompra({ ...compra, plano: Number(e.target.value) })} className={`${classeCampo} mt-1`}><option value={0}>Apenas chip</option>{planos.filter((p) => !p.campanha).map((p) => <option key={p.id} value={p.id}>{p.plano} · {brl(p.valor)}</option>)}</select></label>
          <label className="block text-sm font-medium">Quantidade (até 15)<input value={compra.quantidade} onChange={(e) => setCompra({ ...compra, quantidade: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={`${classeCampo} numeros mt-1`} /></label>
          <ListaDados itens={[["Chip", `${quantidade} × ${brl(logistica.chip)}`], ...(planoCompra ? [["Plano", `${quantidade} × ${brl(planoCompra.valor)}`] as const] : []), ["Frete", brl(logistica.frete)], ["Total", <strong key="t">{brl(totalCompra)}</strong>]]} />
          {compra.erro && <p role="alert" className="text-sm text-perigo">{compra.erro}</p>}
          <Botao onClick={comprar} className="w-full">Gerar pedido</Botao>
          <p className="text-xs text-suave">Valores de frete e chip do exemplo da documentação (GET /logistica).</p>
        </div>
      </Cartao>

      <Cartao className="xl:col-span-3" titulo="Pedidos de chip com entrega" subtitulo="Rastreio pela transportadora (POST /compra/rastrear)" icone={QrCode}>
        <ul className="divide-y divide-borda">
          {lista.map((c) => (
            <li key={c.id} className="py-3">
              <button type="button" aria-expanded={aberta === c.id} onClick={() => setAberta(aberta === c.id ? null : c.id)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left text-sm">
                <span><strong>Pedido {c.id}</strong> · {c.cliente} · {c.quantidade} chip{c.quantidade > 1 ? "s" : ""} · {c.plano}</span>
                <Selo tom={c.rastreio.at(-1)?.status === "EM ROTA" ? "info" : "aviso"} ponto>{c.rastreio.at(-1)?.status ?? "—"}</Selo>
              </button>
              {aberta === c.id && (
                <div className="mt-3">
                  <Etapas etapas={["Pagamento", "Postado", "Em rota", "Entregue"]} atual={c.rastreio.length - 1} rotulo={`Rastreio do pedido ${c.id}`} />
                  <ol className="mt-2 space-y-1 text-xs text-suave">{c.rastreio.map((r, i) => <li key={i}>{r.status} · há {r.diasAtras} dia{r.diasAtras === 1 ? "" : "s"}</li>)}</ol>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Cartao>
    </div>
  );
}

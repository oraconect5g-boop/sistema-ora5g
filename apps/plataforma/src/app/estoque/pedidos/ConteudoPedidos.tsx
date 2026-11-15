// A apresentação dos pedidos de compra (lote INV-009a): a lista e o pedido com a conferência. Só apresentação: os dados
// chegam lidos por lib/estoque/pedidos-de-compra.ts (o custo só para quem vê custo), e as ações chamam o banco.
import { ClipboardCheck, PackageSearch } from "lucide-react";
import Link from "next/link";

import { Botao, Cartao, EstadoVazio, Selo } from "../../../componentes/ui";
import { conferenciaDaLinha, type PedidoDaLista, type PedidoDeCompra, type SituacaoDoPedido } from "../../../lib/estoque/pedidos-de-compra";
import { brl, numero } from "../../../lib/formato";
import { encerrarPedido } from "./acoes";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(iso));
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const SELO_DA_SITUACAO: Record<SituacaoDoPedido, { tom: "info" | "sucesso" | "neutro"; texto: string }> = {
  aberto: { tom: "info", texto: "aberto" }, encerrado: { tom: "sucesso", texto: "encerrado" }, cancelado: { tom: "neutro", texto: "cancelado" },
};

/** A lista dos pedidos da loja, com o recebido de cada um. */
export function ListaDePedidos({ pedidos }: { pedidos: readonly PedidoDaLista[] }) {
  if (pedidos.length === 0) return <EstadoVazio titulo="Nenhum pedido aqui" icone={PackageSearch}>Os pedidos de compra registrados aparecem nesta lista.</EstadoVazio>;
  return (
    <ul className="divide-y divide-borda text-sm">
      {pedidos.map((p) => (
        <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
          <div className="min-w-0 flex-[1_1_14rem]">
            <p className="flex flex-wrap items-center gap-2">
              <Link href={`/estoque/pedidos?pedido=${p.id}`} className="font-semibold text-acao underline-offset-2 hover:underline">{`Pedido nº ${p.numero}`}</Link>
              <Selo tom={SELO_DA_SITUACAO[p.situacao].tom}>{SELO_DA_SITUACAO[p.situacao].texto}</Selo>
            </p>
            <p className="text-xs text-suave">{[p.fornecedor, p.documento, `feito em ${quando(p.criadoEm)}`, p.previstoPara && p.situacao === "aberto" ? `previsto para ${dia(p.previstoPara)}` : null].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="w-full sm:w-auto sm:text-right">
            <p className="numeros font-semibold">{`${numero(p.recebidas)} de ${numero(p.unidades)} recebidas`}</p>
            <p className="numeros text-xs text-suave">{[`${p.entradas} ${p.entradas === 1 ? "entrada" : "entradas"}`, p.totalPrevisto !== null ? `combinado ${brl(p.totalPrevisto)}` : null].filter(Boolean).join(" · ")}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** O pedido com a conferência: o pedido contra o recebido nas entradas ligadas, linha a linha, e o encerramento. */
export function DetalheDoPedido({ pedido }: { pedido: PedidoDeCompra }) {
  const p = pedido;
  const conferidas = p.itens.map((i) => ({ ...i, ...conferenciaDaLinha(i) }));
  const faltam = conferidas.reduce((s, i) => s + i.falta, 0);
  const aMais = conferidas.reduce((s, i) => s + i.aMais, 0) + p.foraDoPedido.reduce((s, i) => s + i.recebida, 0);
  const custosDiferentes = conferidas.filter((i) => i.custoDiferente).length;
  const nada = p.entradasLigadas.every((e) => !e.registrada);
  return (
    <Cartao className="mt-4" titulo={`Pedido nº ${p.numero}`} icone={ClipboardCheck}
      subtitulo={[p.fornecedor, p.documento, `feito em ${quando(p.criadoEm)}`, p.previstoPara ? `previsto para ${dia(p.previstoPara)}` : null].filter(Boolean).join(" · ")}
      acao={<Selo tom={SELO_DA_SITUACAO[p.situacao].tom}>{SELO_DA_SITUACAO[p.situacao].texto}</Selo>}>
      {p.observacao && <p className="text-sm text-suave">{`Observação: ${p.observacao}`}</p>}
      {p.situacao !== "aberto" && p.encerradoEm && <p className="mt-1 text-sm text-suave">{`${p.situacao === "cancelado" ? "Cancelado" : "Encerrado"} em ${quando(p.encerradoEm)}: ${p.motivo ?? ""}`}</p>}
      <p className="mt-2 text-sm">
        {nada ? "Nada recebido ainda: registre a entrada de mercadoria e ligue a este pedido, na entrada aberta."
          : [faltam > 0 ? `faltam ${numero(faltam)}` : "nada falta", aMais > 0 ? `${numero(aMais)} a mais ou fora do pedido` : null,
            p.veCusto && custosDiferentes > 0 ? `${custosDiferentes} ${custosDiferentes === 1 ? "item com custo" : "itens com custo"} diferente do combinado` : null].filter(Boolean).join(" · ")}
      </p>
      {/* No celular, cada linha num bloco; a tabela a partir da tela média. */}
      <ul className="mt-3 divide-y divide-borda text-sm sm:hidden">
        {conferidas.map((i) => (
          <li key={i.linha} className="space-y-1 py-2">
            <p><span className="numeros font-semibold">{i.sku}</span> <span className="text-suave">{i.nome}</span></p>
            <p className="flex flex-wrap items-center gap-2">
              <span className="numeros">{`pedido ${numero(i.quantidade)} · recebido ${numero(i.recebida)}`}</span>
              {i.falta > 0 ? <Selo tom="aviso">{`falta ${numero(i.falta)}`}</Selo> : i.aMais > 0 ? <Selo tom="info">{`${numero(i.aMais)} a mais`}</Selo> : <Selo tom="sucesso">completo</Selo>}
            </p>
            {p.veCusto && (i.custoCombinado !== null || i.custoDaNota !== null) && (
              <p className={`numeros text-xs ${i.custoDiferente ? "font-semibold text-perigo" : "text-suave"}`}>
                {`combinado ${i.custoCombinado !== null ? brl(i.custoCombinado) : "—"} · na nota ${i.custoDaNota !== null ? brl(i.custoDaNota) : "—"}`}
              </p>
            )}
          </li>
        ))}
        {p.foraDoPedido.map((i) => (
          <li key={i.varianteId} className="space-y-1 py-2">
            <p><span className="numeros font-semibold">{i.sku}</span> <span className="text-suave">{i.nome}</span></p>
            <p className="flex flex-wrap items-center gap-2"><span className="numeros">{`recebido ${numero(i.recebida)}`}</span><Selo tom="info">fora do pedido</Selo></p>
            {p.veCusto && i.custoDaNota !== null && <p className="numeros text-xs text-suave">{`na nota ${brl(i.custoDaNota)}`}</p>}
          </li>
        ))}
      </ul>
      <div className="mt-3 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-left text-xs text-suave">
            <tr><th className="py-2 pr-2 font-medium">Item</th><th className="px-2 text-right font-medium">Pedido</th><th className="px-2 text-right font-medium">Recebido</th>
              <th className="px-2 font-medium">Conferência</th>{p.veCusto && <><th className="px-2 text-right font-medium">Combinado</th><th className="pl-2 text-right font-medium">Na nota</th></>}</tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {conferidas.map((i) => (
              <tr key={i.linha}>
                <td className="py-2 pr-2"><span className="numeros font-semibold">{i.sku}</span> <span className="text-suave">{i.nome}</span></td>
                <td className="numeros px-2 text-right">{numero(i.quantidade)}</td>
                <td className="numeros px-2 text-right">{numero(i.recebida)}</td>
                <td className="px-2">{i.falta > 0 ? <Selo tom="aviso">{`falta ${numero(i.falta)}`}</Selo> : i.aMais > 0 ? <Selo tom="info">{`${numero(i.aMais)} a mais`}</Selo> : <Selo tom="sucesso">completo</Selo>}</td>
                {p.veCusto && (
                  <>
                    <td className="numeros px-2 text-right">{i.custoCombinado !== null ? brl(i.custoCombinado) : "—"}</td>
                    <td className={`numeros pl-2 text-right ${i.custoDiferente ? "font-semibold text-perigo" : ""}`}>{i.custoDaNota !== null ? brl(i.custoDaNota) : "—"}</td>
                  </>
                )}
              </tr>
            ))}
            {p.foraDoPedido.map((i) => (
              <tr key={i.varianteId}>
                <td className="py-2 pr-2"><span className="numeros font-semibold">{i.sku}</span> <span className="text-suave">{i.nome}</span></td>
                <td className="numeros px-2 text-right">—</td>
                <td className="numeros px-2 text-right">{numero(i.recebida)}</td>
                <td className="px-2"><Selo tom="info">fora do pedido</Selo></td>
                {p.veCusto && <><td className="numeros px-2 text-right">—</td><td className="numeros pl-2 text-right">{i.custoDaNota !== null ? brl(i.custoDaNota) : "—"}</td></>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.veCusto && <p className="mt-2 text-xs text-suave">O custo na nota é a média do custo das entradas ligadas, pela quantidade.</p>}
      {p.entradasLigadas.length > 0 && (
        <div className="mt-3 border-t border-borda pt-3">
          <h3 className="text-sm font-bold">Entradas ligadas</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {p.entradasLigadas.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/estoque/entrada?entrada=${e.id}#entrada`} className="font-semibold text-acao underline-offset-2 hover:underline">{`Entrada nº ${e.numero}`}</Link>
                <span className="numeros text-xs text-suave">{[e.documento, quando(e.criadaEm), `${numero(e.unidades)} un.`].filter(Boolean).join(" · ")}</span>
                {!e.registrada && <Selo tom="neutro">estornada, não conta</Selo>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.situacao === "aberto" && (
        <details className="mt-3 border-t border-borda pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-acao">{nada ? "Cancelar o pedido" : "Encerrar o pedido"}</summary>
          <p className="mt-1 text-xs text-suave">{nada ? "Sem nada recebido, o pedido fica cancelado." : "O pedido fica encerrado com o que foi recebido; a conferência continua aqui."}</p>
          <form action={encerrarPedido} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input type="hidden" name="pedido" value={p.id} />
            <input name="motivo" required minLength={3} maxLength={300} placeholder={nada ? "Ex.: fornecedor sem estoque" : "Ex.: recebido, faltou o aparelho"} aria-label="Motivo" className={campo} />
            <Botao type="submit" variante={nada ? "perigo" : "secundario"} className="self-end">{nada ? "Cancelar" : "Encerrar"}</Botao>
          </form>
        </details>
      )}
    </Cartao>
  );
}

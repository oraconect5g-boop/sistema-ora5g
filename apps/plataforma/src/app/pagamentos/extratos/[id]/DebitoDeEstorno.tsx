import type { ReactNode } from "react";
import Link from "next/link";

import { Botao, Selo } from "../../../../componentes/ui";
import { acaoDaSugestao, type SugestaoDeEstorno } from "../../../../lib/extratos/estornos";
import { nomeDoMeioDoExtrato } from "../../../../lib/extratos/regras";
import { corrigirChargeback, ligarEstorno } from "../acoes";

// O débito do extrato e o estorno da venda (lote PAY-011a: ORA-PAY-011; ADR-016, adendo de 24/11), na tela do extrato:
// o que o débito pendente pode provar (as sugestões do banco, com o que dá para fazer em cada uma) e, depois de ligado, de
// qual venda ele é. O banco decide de novo em cada gravação; aqui só não se oferece o que já se sabe recusado.

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");

/** Os estornos que o débito pendente pode provar, um formulário por estorno; sem nenhum, o caminho do chargeback e o da tarifa. */
export function EstornosDoDebito({ linha, sugestoes, ocultos }: { linha: string; sugestoes: SugestaoDeEstorno[]; ocultos: ReactNode }) {
  if (sugestoes.length === 0) {
    return (
      <p className="text-xs text-suave">
        Nenhum estorno deste valor para ligar aqui (nesta loja e nestes meios). Se é o estorno ou o chargeback de uma venda, cancele a venda primeiro, na tela dela: o estorno aparece aqui para confirmar. Se é tarifa ou saída, tire da conta, com o motivo.
      </p>
    );
  }
  return (
    <>
      {sugestoes.map((s) => {
        const acao = acaoDaSugestao(s);
        return (
          <form key={s.estorno_id} action={ligarEstorno} className="space-y-2 rounded-xl border border-borda px-3 py-2">
            {ocultos}<input type="hidden" name="linha" value={linha} /><input type="hidden" name="estorno" value={s.estorno_id} />
            <p className="numeros text-xs">
              Estorno nº {s.estorno_numero} · <Link href={`/vendas/${s.venda_id}`} className="font-semibold text-acao">venda nº {s.venda_numero}</Link> · {nomeDoMeioDoExtrato(s.meio)} · {s.de_devolucao ? "de uma devolução" : "do cancelamento"} · pedido em {quando(s.solicitado_em)} · {s.loja}
              {s.pela_referencia && <Selo tom="sucesso" className="ml-2">mesma referência</Selo>}
            </p>
            <p className="text-xs text-suave">
              {acao === "guardar" && `Já confirmado${s.confirmado_em ? ` em ${quando(s.confirmado_em)}` : ""}${s.comprovante ? `, com o comprovante ${s.comprovante}` : ""}. Este débito fica como a prova dele (dá para soltar depois, com o motivo).`}
              {acao === "confirmar" && "Confirma o estorno da venda com este débito como comprovante. A confirmação não se desfaz."}
              {acao === "gerencia" && "O estorno ainda espera a confirmação, e confirmar é da gerência da loja da venda."}
              {acao === "outra_loja" && `O estorno ainda espera a confirmação. Para confirmar, entre na ${s.loja} (a loja da venda) e abra este extrato de novo.`}
            </p>
            {(acao === "guardar" || acao === "confirmar") && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" name="chargeback" value="sim" className="size-4" />Foi contestação do cliente no banco (chargeback)</label>
                <Botao type="submit" tamanho="sm" variante={acao === "confirmar" ? "primario" : "secundario"} enquanto="Gravando…">{acao === "confirmar" ? "Confirmar o estorno" : "Guardar como a prova"}</Botao>
              </div>
            )}
          </form>
        );
      })}
    </>
  );
}

export type EstornoDaLinha = { numero: number; venda: { id: string; numero: number } | null } | null;

/** O débito já ligado: de qual estorno e de qual venda ele é, se foi ele que confirmou, e a marca de chargeback (que se corrige com o motivo). */
export function DebitoLigado({ linha, estorno, confirmou, chargeback, ocultos }: { linha: string; estorno: EstornoDaLinha; confirmou: boolean; chargeback: boolean; ocultos: ReactNode }) {
  return (
    <>
      <p className="text-xs">
        {chargeback ? "Contestação do cliente no banco: é o débito do estorno" : "É o débito do estorno"}{estorno ? ` nº ${estorno.numero}` : ""}{" "}
        {estorno?.venda ? <Link href={`/vendas/${estorno.venda.id}`} className="font-semibold text-acao">da venda nº {estorno.venda.numero}</Link> : "de uma venda"}.{" "}
        {confirmou
          ? "Foi este débito que confirmou o estorno: ele fica como a prova e não se solta."
          : "O estorno já estava confirmado; este débito ficou como a prova dele."}
      </p>
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-acao">{chargeback ? "Não foi chargeback" : "Foi chargeback (o cliente contestou no banco)"}</summary>
        <form action={corrigirChargeback} className="mt-2 flex flex-wrap items-end gap-2">
          {ocultos}<input type="hidden" name="linha" value={linha} /><input type="hidden" name="chargeback" value={chargeback ? "nao" : "sim"} />
          <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
          <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Gravando…">{chargeback ? "Desmarcar" : "Marcar como chargeback"}</Botao>
        </form>
      </details>
    </>
  );
}

// O cartão do custo na página de preços da variação (lote CAT-008b: ORA-CAT-008): o custo que vale agora e de onde
// veio, o histórico e, para quem cadastra o catálogo e vê custo na rede, a correção com motivo. Só apresentação: a
// leitura é a de lib/catalogo/custos.ts, e a regra é a do banco.
import { CircleDollarSign } from "lucide-react";

import { Botao, Cartao } from "../../../componentes/ui";
import { ORIGENS_DO_CUSTO, type CustoGravado } from "../../../lib/catalogo/custos";
import { brl } from "../../../lib/formato";
import type { Leitura } from "../../../lib/leitura-do-banco";
import { corrigirCusto } from "./acoes";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const rotulo = "block text-sm font-medium";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");

export function CartaoDoCusto({ custos, podeCorrigir, variante, aberto }: { custos: Leitura<CustoGravado[]>; podeCorrigir: boolean; variante: string; aberto: boolean }) {
  return (
    <Cartao className="mt-4" titulo="Custo" icone={CircleDollarSign}
      subtitulo="Vale o último custo gravado, nas próximas vendas; cada venda guarda o custo do momento em que foi feita.">
      {custos.estado !== "ok" ? <p className="text-sm text-perigo">Não deu para ler o custo agora. Tente de novo em instantes.</p> : (
        <>
          {custos.dados[0] ? (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <strong className="numeros text-lg">{brl(custos.dados[0].valor)}</strong>
              <span className="text-xs text-suave">{`desde ${quando(custos.dados[0].desde)} · ${ORIGENS_DO_CUSTO[custos.dados[0].origem]}${custos.dados[0].detalhe ? ` (${custos.dados[0].detalhe})` : ""}`}</span>
            </p>
          ) : <p className="text-sm text-suave">Sem custo gravado: a margem desta variação fica de fora até a primeira entrada com custo (ou a correção).</p>}
          {podeCorrigir && (
            <details className="mt-3" open={aberto}>
              <summary className="cursor-pointer text-sm font-semibold text-acao">Corrigir o custo</summary>
              <form action={corrigirCusto} className="mt-2 grid gap-3 sm:grid-cols-[11rem_1fr_auto]">
                <input type="hidden" name="variante" value={variante} />
                <label className={rotulo}>Custo certo (R$)<input name="valor" required inputMode="decimal" placeholder="18,90" className={campo} /></label>
                <label className={rotulo}>Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={300} placeholder="Nota com desconto do fornecedor" className={campo} /></label>
                <Botao type="submit" className="self-end">Gravar o custo</Botao>
              </form>
              <p className="mt-2 text-xs text-suave">Entrada lançada errada? Estorne a entrada: o custo volta sozinho ao que valia antes dela.</p>
            </details>
          )}
          {custos.dados.length > 1 && (
            <div className="mt-3 border-t border-borda pt-2">
              <p className="text-xs font-semibold text-suave">Custos anteriores</p>
              <ul className="divide-y divide-borda text-sm">
                {custos.dados.slice(1).map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                    <span className="numeros">{brl(c.valor)}</span>
                    <span className="text-xs text-suave">{`${ORIGENS_DO_CUSTO[c.origem]}${c.detalhe ? ` (${c.detalhe})` : ""} · de ${quando(c.desde)}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Cartao>
  );
}

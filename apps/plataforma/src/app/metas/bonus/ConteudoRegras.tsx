import { Gift, History, Info } from "lucide-react";

import { Botao, Cartao, Celula, EstadoVazio, Tabela } from "../../../componentes/ui";
import { MAXIMO_DE_FAIXAS, regraNoMes, resumoDasFaixas, valorDaFaixaNoCampo, type VersaoDaRegra } from "../../../lib/bonus/regras";
import { MEDIDAS, nomeDoMes, ORDEM_DAS_MEDIDAS } from "../../../lib/metas/painel";
import { definirBonus } from "./acoes";

// As partes da tela das regras do bônus (lote L9a): o formulário das faixas a partir de um mês, como
// funciona e o histórico das versões. Só apresentação; a página confere quem pode e lê as versões.

const campo = "min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (instante: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(instante));

export function Formulario({ versoes, desde }: { versoes: readonly VersaoDaRegra[]; desde: string }) {
  return (
    <Cartao titulo={`Faixas a partir de ${nomeDoMes(desde)}`} subtitulo={`Preencha só as linhas que vai usar; medida sem nenhuma linha fica sem bônus. Até ${MAXIMO_DE_FAIXAS} faixas por medida: salve para abrir mais uma linha.`} icone={Gift}>
      <form action={definirBonus} className="grid gap-4">
        <input type="hidden" name="desde" value={desde} />
        {ORDEM_DAS_MEDIDAS.map((m) => {
          const faixas = regraNoMes(versoes, m, desde) ?? [];
          return (
            <fieldset key={m} className="rounded-xl border border-borda px-3 pb-3 pt-2">
              <legend className="px-1 text-sm font-semibold">{MEDIDAS[m].nome}</legend>
              <p className="text-xs text-suave">{faixas.length > 0 ? `Valendo: ${resumoDasFaixas(faixas)}` : "Sem bônus nesta medida."}</p>
              <div className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs font-semibold text-suave sm:grid-cols-[6rem_minmax(0,1fr)]">
                <span aria-hidden>% da meta</span>
                <span aria-hidden>Bônus (R$)</span>
                {/* As faixas que valem e mais uma linha livre (no mínimo duas): salvar abre a próxima. */}
                {Array.from({ length: Math.min(MAXIMO_DE_FAIXAS, Math.max(2, faixas.length + 1)) }, (_, i) => {
                  const f = faixas[i];
                  return (
                    <div key={i} className="contents">
                      <input
                        name={`pct_${m}_${i + 1}`} defaultValue={f ? String(f.aPartirDe) : ""} inputMode="numeric" autoComplete="off"
                        placeholder={i === 0 ? "100" : ""} aria-label={`${MEDIDAS[m].nome}, faixa ${i + 1}: porcentagem da meta`} className={`${campo} numeros`}
                      />
                      <input
                        name={`valor_${m}_${i + 1}`} defaultValue={f ? valorDaFaixaNoCampo(f.valor) : ""} inputMode="decimal" autoComplete="off"
                        placeholder={i === 0 ? "300,00" : ""} aria-label={`${MEDIDAS[m].nome}, faixa ${i + 1}: valor do bônus em reais`} className={`${campo} numeros`}
                      />
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        <label className="block text-sm font-medium">
          Motivo (para mudar ou retirar uma regra que já vale)
          <input name="motivo" maxLength={300} placeholder="Ex.: campanha de Natal" autoComplete="off" className={`mt-1 ${campo}`} />
        </label>
        <Botao type="submit" className="w-full sm:w-auto sm:justify-self-start" enquanto="Salvando…">Salvar as regras</Botao>
      </form>
    </Cartao>
  );
}

export function ComoFunciona() {
  const itens = [
    "Cada faixa diz: a partir de X% da meta, o vendedor ganha R$ Y. Vale a maior faixa alcançada; as faixas não somam.",
    "As faixas valem para a meta individual de cada vendedor, em todas as lojas. Sem meta na medida, não há bônus nela. A meta da loja inteira não paga bônus.",
    "A venda conta quando é concluída, inclusive a financiada pela PayJoy ou pela Aiva. Devolução e cancelamento descontam no mês em que acontecem.",
    "A regra vale do mês escolhido em diante, até você mudar de novo. O mês que já terminou não muda.",
    "O valor fica provisório até o fechamento do mês. O vendedor vê o próprio bônus e o extrato, venda a venda.",
  ];
  return (
    <Cartao titulo="Como funciona" icone={Info}>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        {itens.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </Cartao>
  );
}

export function Historico({ versoes }: { versoes: readonly VersaoDaRegra[] }) {
  return (
    <Cartao className="mt-4" titulo="Histórico das regras" subtitulo="Cada versão gravada, da mais nova para a mais antiga. Nada se apaga." icone={History} corpo="px-4 pb-2 pt-3 sm:px-5">
      {versoes.length === 0 ? (
        <EstadoVazio titulo="Nenhuma regra definida ainda" icone={History}>As faixas que você salvar aparecem aqui, com a data e o motivo.</EstadoVazio>
      ) : (
        <Tabela colunas={["Quando", "Medida", "Vale a partir de", "Faixas", "Motivo"]} legenda="Histórico das regras do bônus" minimo="min-w-[44rem]">
          {versoes.map((v) => (
            <tr key={v.versao}>
              <Celula className="numeros whitespace-nowrap">{quando(v.definidaEm)}</Celula>
              <Celula className="whitespace-nowrap">{MEDIDAS[v.medida].curto}</Celula>
              <Celula className="whitespace-nowrap">{nomeDoMes(v.vigenteDesde)}</Celula>
              <Celula className="numeros">{v.faixas ? resumoDasFaixas(v.faixas) : <span className="text-suave">sem bônus (retirada)</span>}</Celula>
              <Celula className="text-suave">{v.motivo ?? "—"}</Celula>
            </tr>
          ))}
        </Tabela>
      )}
    </Cartao>
  );
}

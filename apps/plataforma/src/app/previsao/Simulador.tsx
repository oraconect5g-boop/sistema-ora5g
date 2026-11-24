"use client";

import { useId, useState } from "react";

import { CalendarRange, Scale, TrendingUp, Wallet } from "lucide-react";

import { ExportarPlanilha } from "../../componentes/ExportarPlanilha";
import { ColunasDivergentes, Linhas, TabelaDoGrafico } from "../../componentes/graficos";
import { Aviso, Cartao, Indicador } from "../../componentes/ui";
import { brl, brlCompacto, brlCompactoComSinal, brlComSinal, brlEixo, brlEixoComSinal, numero } from "../../lib/formato";
import { geradoEm, parteDoNome } from "../../lib/csv";
import { planilhaDaPrevisao, type FatosDaPlanilha } from "../../lib/previsao/planilha";
import { AJUSTES, diaCurto, lerSaldo, projetar, type Estimativa, type SemanaFutura } from "../../lib/previsao/regras";

// Previsão de caixa (lote L8c): a parte que roda no navegador. O saldo de partida digitado aqui fica só
// neste navegador (decisão do proprietário de 13/11): não vai para o endereço, não é enviado ao servidor
// e não é gravado. A simulação muda só a estimativa das vendas; as contas são fatos.

const rotuloDoAjuste = (a: number) => (a === 0 ? "Média" : `${a > 0 ? "+" : "−"}${Math.round(Math.abs(a) * 100)}%`);

export type PropsDoSimulador = {
  semanas: SemanaFutura[];
  vencidas: { valor: number; quantidade: number };
  estimativa: Estimativa | null;
  /** Para a planilha (L8d): de onde é a previsão, de que dia e os fatos que ficam fora da conta. */
  onde: string;
  hoje: string;
  fatos: FatosDaPlanilha;
};

export function Simulador({ semanas, vencidas, estimativa, onde, hoje, fatos }: PropsDoSimulador) {
  const [texto, setTexto] = useState("");
  const [ajuste, setAjuste] = useState(0);
  const campo = useId();
  const saldo = lerSaldo(texto);
  const linhas = projetar(semanas, vencidas.valor, estimativa?.media ?? null, ajuste, typeof saldo === "number" ? saldo : null);
  const contas = linhas.reduce((s, l) => s + l.sai, 0);
  const quantidade = semanas.reduce((s, x) => s + x.quantidade, 0) + vencidas.quantidade;
  const diferenca = linhas.reduce((s, l) => s + l.diferenca, 0);
  // FIN-007b: o que as financeiras devem e vence no período, pelo prazo de repasse (zero sem prazo gravado: tudo como antes).
  const repasses = linhas.reduce((s, l) => s + l.financeiras, 0);
  const comFinanceiras = repasses > 0;
  const ultimo = linhas.at(-1);
  const negativa = linhas.find((l) => l.saldo !== null && l.saldo < 0);
  const apertada = linhas.find((l) => l.diferenca < 0);
  const comSaldo = typeof saldo === "number";
  // A planilha sai do navegador com a simulação e o saldo da tela; nada vai ao servidor.
  const planilha = planilhaDaPrevisao({ onde, linhas, estimativa, ajuste, comSaldo, fatos, gerado: geradoEm() });

  return (
    <>
      <Cartao
        titulo="Simular"
        icone={Scale}
        subtitulo="O saldo que você digitar fica só neste navegador: não é enviado ao servidor nem gravado."
        acao={<ExportarPlanilha nomeArquivo={`previsao-${parteDoNome(onde)}-${hoje}`} aba="Previsão de caixa" rotulo="Baixar planilha" secoes={planilha} />}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:items-end">
          <div className="min-w-0">
            <label htmlFor={campo} className="text-xs font-medium">Saldo no banco hoje (opcional)</label>
            <input
              id={campo}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ex.: 25.000,00"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-invalid={saldo === undefined}
              className="mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20"
            />
            {saldo === undefined && <p className="mt-1 text-xs text-perigo">Valor inválido: escreva como 25.000,00 (ou -1.500,00 se o saldo estiver negativo).</p>}
          </div>
          <div className="min-w-0">
            <p id={`${campo}-vendas`} className="text-xs font-medium">Vendas das próximas semanas</p>
            <div role="group" aria-labelledby={`${campo}-vendas`} className="mt-1">
              <div className="flex flex-wrap gap-2">
                {AJUSTES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={a === ajuste}
                    disabled={estimativa === null}
                    onClick={() => setAjuste(a)}
                    className={`min-h-10 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition disabled:opacity-40 ${a === ajuste ? "border-navegacao bg-navegacao text-white" : "border-borda bg-white text-texto hover:border-borda-forte"}`}
                  >
                    {rotuloDoAjuste(a)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Cartao>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador
          rotulo="Contas no período" icone={CalendarRange} valor={brlCompacto(contas)}
          detalhe={`${numero(quantidade)} ${quantidade === 1 ? "conta" : "contas"}${vencidas.valor > 0 ? ` · ${brl(vencidas.valor)} já vencidas` : ""}`}
        />
        <Indicador
          rotulo="Entrada estimada por semana" icone={TrendingUp} valor={estimativa === null ? "—" : brlCompactoComSinal(linhas[0]?.entra ?? 0)}
          detalhe={`${estimativa === null ? "Sem vendas nas 8 semanas anteriores" : `Média de ${estimativa.semanas} ${estimativa.semanas === 1 ? "semana" : "semanas"}${ajuste === 0 ? "" : ` · simulação ${rotuloDoAjuste(ajuste)}`}`}${
            comFinanceiras ? ` · mais ${brl(repasses)} das financeiras no período` : ""}`}
        />
        <Indicador
          rotulo="Diferença no período" icone={Scale} valor={brlCompactoComSinal(diferenca)}
          tom={diferenca < 0 ? "ruim" : "neutro"}
          detalhe={comFinanceiras ? "Entrada estimada e financeiras, menos as contas" : "Entrada estimada menos as contas"}
        />
        <Indicador
          rotulo="Saldo previsto ao fim" icone={Wallet}
          valor={comSaldo && ultimo?.saldo !== null && ultimo !== undefined ? brlCompactoComSinal(ultimo.saldo ?? 0) : "—"}
          tom={comSaldo && (ultimo?.saldo ?? 0) < 0 ? "ruim" : "neutro"}
          detalhe={comSaldo && ultimo ? `Em ${diaCurto(ultimo.fim)}` : "Digite o saldo de hoje"}
        />
      </div>

      {negativa ? (
        <Aviso tom="perigo" titulo="Saldo previsto negativo">
          {`O saldo previsto fica negativo na semana de ${diaCurto(negativa.inicio)} a ${diaCurto(negativa.fim)} (${brlComSinal(negativa.saldo ?? 0)}).`}
        </Aviso>
      ) : !comSaldo && apertada ? (
        <Aviso tom="aviso" titulo="Semana apertada">
          {`Na semana de ${diaCurto(apertada.inicio)} a ${diaCurto(apertada.fim)}, as contas passam ${comFinanceiras ? "o que deve entrar" : "a entrada estimada"} em ${brl(-apertada.diferenca)}. Digite o saldo de hoje para ver se ele cobre.`}
        </Aviso>
      ) : null}

      <Cartao
        titulo="Semana a semana"
        icone={CalendarRange}
        subtitulo={comFinanceiras
          ? "Para cima, a entrada estimada e o que as financeiras devem, na semana do vencimento; para baixo, as contas que vencem (as já vencidas na primeira semana)."
          : estimativa === null ? "Só as contas: sem vendas nas 8 semanas anteriores, não há estimativa." : "Para cima, a entrada estimada; para baixo, as contas que vencem (as já vencidas na primeira semana)."}
      >
        <ColunasDivergentes
          dados={linhas.map((l) => ({ rotulo: diaCurto(l.inicio), entrada: Math.max(0, l.entra) + l.financeiras, saida: l.sai + Math.max(0, -l.entra) }))}
          formatar={brl}
          formatarEixo={brlEixo}
          nomes={[comFinanceiras ? "Entrada (estimativa e financeiras)" : "Entrada estimada", "Contas"]}
          rotuloSaldo="Diferença da semana"
          cadaRotulo={linhas.length > 8 ? 2 : 1}
        />
        {comSaldo && (
          <div className="mt-5">
            <p className="text-sm font-semibold">Saldo previsto no fim de cada semana</p>
            <Linhas
              series={[{ nome: "Saldo previsto", serie: 1, valores: [saldo, ...linhas.map((l) => l.saldo)], area: true }]}
              rotulosX={["Hoje", ...linhas.map((l) => diaCurto(l.fim))]}
              formatar={brlComSinal}
              formatarEixo={brlEixoComSinal}
              formatarPonto={brlCompactoComSinal}
              cadaRotulo={linhas.length > 8 ? 2 : 1}
              altura={180}
            />
          </div>
        )}
        <TabelaDoGrafico
          colunas={["Semana", "Entrada estimada", ...(comFinanceiras ? ["Financeiras (pelo prazo)"] : []), "Contas", "Diferença", ...(comSaldo ? ["Saldo previsto"] : [])]}
          linhas={linhas.map((l) => [
            `${diaCurto(l.inicio)} a ${diaCurto(l.fim)}`, brlComSinal(l.entra), ...(comFinanceiras ? [brl(l.financeiras)] : []),
            `${brl(l.sai)}${l.vencidas > 0 ? ` (${brl(l.vencidas)} vencidas)` : ""}`, brlComSinal(l.diferenca),
            ...(comSaldo ? [brlComSinal(l.saldo ?? 0)] : []),
          ])}
        />
      </Cartao>
    </>
  );
}

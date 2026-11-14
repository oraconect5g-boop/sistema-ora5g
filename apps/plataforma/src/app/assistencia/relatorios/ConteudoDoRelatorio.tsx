import { Boxes, ClipboardCheck, HandCoins, PackageCheck, SearchCheck, Timer, Users, Wrench } from "lucide-react";
import Link from "next/link";

import { BarraSegmentada, BarrasHorizontais, TabelaDoGrafico } from "../../../componentes/graficos";
import { Cartao, EstadoVazio, Indicador, ListaDados, Selo } from "../../../componentes/ui";
import { TIPOS_SEM_VENDA, type OsSemVenda, type RelatorioDaAssistencia } from "../../../lib/assistencia/relatorio";
import { brl, numero } from "../../../lib/formato";

// O conteúdo dos relatórios da assistência (lote L12e), à parte da página: recebe a leitura já conferida.
const diaDe = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(iso));
const emDias = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${v === 1 ? "dia" : "dias"}`);
const TOM_SEM_VENDA = { devolvida_sem_cobrar: "perigo", venda_cancelada: "aviso", pronta_parada: "aviso" } as const;

function detalheDaOs(o: OsSemVenda): string {
  if (o.tipo === "pronta_parada") return o.dias === 0 ? "voltou hoje" : `parada há ${o.dias} ${o.dias === 1 ? "dia" : "dias"}`;
  if (o.tipo === "venda_cancelada") return `venda nº ${o.venda}${o.quando ? ` cancelada em ${diaDe(o.quando)}` : ""}`;
  return `${o.quando ? `${diaDe(o.quando)}: ` : ""}${o.motivo ?? "sem motivo"}`;
}

export function ConteudoDoRelatorio({ r }: { r: RelatorioDaAssistencia }) {
  const s = r.resumo;
  const encerradas = s.entregues + s.devolvidasSemConserto + s.devolvidasSemCobrar + s.canceladas;
  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="OS abertas" icone={Wrench} valor={numero(s.abertas)} detalhe="aparelhos recebidos no período" />
        <Indicador rotulo="Consertos cobrados" icone={HandCoins} valor={brl(s.valorCobrado)}
          detalhe={`${numero(s.consertosCobrados)} ${s.consertosCobrados === 1 ? "conserto cobrado" : "consertos cobrados"} no PDV`} />
        <Indicador rotulo="Prontas sem cobrança" icone={PackageCheck} valor={numero(s.prontasParadas)} tom={s.prontasParadas > 0 ? "atencao" : "neutro"}
          detalhe="consertadas, na loja agora" />
        <Indicador rotulo="Devolvidas sem cobrar" icone={SearchCheck} valor={numero(s.devolvidasSemCobrar)} tom={s.devolvidasSemCobrar > 0 ? "ruim" : "neutro"}
          detalhe="conserto feito que saiu sem venda" />
      </div>

      <Cartao className="mt-4" titulo="Como as OS se encerraram" icone={ClipboardCheck}
        subtitulo={encerradas > 0 ? `${numero(encerradas)} ${encerradas === 1 ? "OS encerrada" : "OS encerradas"} no período` : undefined}>
        {encerradas === 0 ? (
          <EstadoVazio titulo="Nenhuma OS encerrada no período" icone={ClipboardCheck}>A leitura está funcionando; nada se encerrou nestes dias.</EstadoVazio>
        ) : (
          <BarraSegmentada rotulo="OS encerradas no período" formatar={numero} partes={[
            { nome: "Entregues e cobradas", valor: s.entregues, serie: 1 },
            { nome: "Devolvidas sem conserto", valor: s.devolvidasSemConserto, serie: 2 },
            { nome: "Devolvidas sem cobrar", valor: s.devolvidasSemCobrar, serie: 3 },
            { nome: "Canceladas", valor: s.canceladas, serie: "comparacao" },
          ]} />
        )}
      </Cartao>

      <Cartao className="mt-4" titulo="OS que pedem atenção" icone={SearchCheck}
        subtitulo="Conserto que saiu sem venda, venda cancelada depois da entrega e conserto pronto parado na loja">
        {r.semVenda.length === 0 ? (
          <EstadoVazio titulo="Nenhuma OS sem venda" icone={SearchCheck}>Todo conserto do período saiu cobrado.</EstadoVazio>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {r.semVenda.map((o) => (
              <li key={`${o.tipo}:${o.id}`} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <Link href={`/assistencia/${o.id}`} className="font-semibold text-acao">OS nº {o.numero}</Link>
                  <Selo tom={TOM_SEM_VENDA[o.tipo]}>{TIPOS_SEM_VENDA[o.tipo]}</Selo>
                </div>
                <div className="mt-1 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <span className="min-w-0 text-suave">{[o.loja, o.aparelho, o.clienteNome].join(" · ")}</span>
                  <span className="text-xs text-suave sm:shrink-0 sm:text-right">{detalheDaOs(o)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao className="mt-4" titulo="Por pessoa" icone={Users} subtitulo="O valor dos consertos que cada pessoa cobrou no PDV (a produção conta para quem cobra) e quantas OS abriu">
        {r.porPessoa.length === 0 ? (
          <EstadoVazio titulo="Ninguém abriu nem cobrou OS no período" icone={Users}>A leitura está funcionando.</EstadoVazio>
        ) : (
          <>
            <BarrasHorizontais nomeSerie="Consertos cobrados" formatar={brl} dados={r.porPessoa.map((p) => ({ rotulo: p.nome, valor: p.valor }))} />
            <TabelaDoGrafico titulo="Ver OS abertas e consertos cobrados por pessoa" colunas={["Pessoa", "OS abertas", "Consertos cobrados", "Valor cobrado"]}
              linhas={r.porPessoa.map((p) => [p.nome, numero(p.abertas), numero(p.cobrados), brl(p.valor)])} />
          </>
        )}
      </Cartao>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Tempo de conserto" icone={Timer} subtitulo="Da abertura da OS ao conserto pronto e à entrega">
          <ListaDados itens={[
            ["Consertos concluídos", numero(r.tempo.consertos)],
            ["Média até o conserto", emDias(r.tempo.mediaDiasConserto)],
            ["O mais demorado", emDias(r.tempo.maiorDiasConserto)],
            ["Entregas", numero(r.tempo.entregas)],
            ["Média até a entrega", emDias(r.tempo.mediaDiasAteEntrega)],
          ]} />
        </Cartao>
        <Cartao titulo="Peças × serviços" icone={Boxes} subtitulo="Por loja: OS com peça usada que fechou sem cobrança pede olho">
          {r.porLoja.length === 0 ? (
            <p className="text-sm text-suave">Nenhuma OS nas lojas do recorte.</p>
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-suave">
                  <tr><th className="py-1 pr-3 font-medium">Loja</th><th className="py-1 pr-3 text-right font-medium">Consertos cobrados</th>
                    <th className="py-1 pr-3 text-right font-medium">Peças usadas</th><th className="py-1 text-right font-medium">Com peça, sem cobrança</th></tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {r.porLoja.map((l) => (
                    <tr key={l.unidade}>
                      <td className="py-2 pr-3">{l.nome}</td>
                      <td className="numeros whitespace-nowrap py-2 pr-3 text-right">{numero(l.consertosCobrados)}</td>
                      <td className="numeros whitespace-nowrap py-2 pr-3 text-right">{numero(l.pecasUsadas)}</td>
                      <td className="numeros whitespace-nowrap py-2 text-right">{l.osComPecaSemCobranca > 0 ? <Selo tom="perigo">{numero(l.osComPecaSemCobranca)}</Selo> : "0"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>
    </>
  );
}

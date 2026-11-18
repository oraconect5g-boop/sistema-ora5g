import { MEIOS, type MeioPagamento } from "@ora5g/dominio";
import { Banknote, CalendarClock, FileText, HandCoins, Landmark, Scale, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { BarraSegmentada, ColunasDivergentes, TabelaDoGrafico } from "../../../componentes/graficos";
import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, BotaoLink, Cartao, Celula, Indicador, ListaDados, Selo, Tabela, TituloPagina } from "../../../componentes/ui";
import { lojasVisiveis, vendasVisiveis } from "../../../demo/consultas";
import { caixaDaLoja, CONCILIACAO, CONTAS, financiadoPorFinanceira, fluxoDeCaixa, NOMES_NOTA, nomeDaLoja, recebimentosPorMeio, VENDAS_HOJE } from "../../../demo/dados";
import { REDE } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import { agora, brl, brlCompacto, brlEixo, diaMes, diasAntes } from "../../../lib/formato";
import { partesPorMeio } from "../_paineis/PainelGestao";

export const metadata: Metadata = { title: "Caixa e financeiro" };

export default async function Financeiro() {
  const contexto = await acessoDaPagina("financeiro");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Caixa e financeiro" />;
  const hoje = agora();
  const rede = contexto.loja === REDE;
  const vendas = vendasVisiveis(contexto);
  const recebimentos = recebimentosPorMeio(vendas);
  const totalRecebido = [...recebimentos.values()].reduce((s, v) => s + v, 0);
  const aConciliar = [...recebimentos.entries()].filter(([meio]) => CONCILIACAO[meio].tom !== "sucesso").reduce((s, [, v]) => s + v, 0);
  const financeiras = financiadoPorFinanceira(vendas);
  const aReceber = financeiras.reduce((s, f) => s + f.aReceber, 0);
  const caixas = lojasVisiveis(contexto).map((l) => ({ loja: l, ...caixaDaLoja(l.codigo, VENDAS_HOJE) }));
  const divergentes = caixas.filter((c) => c.diferenca !== 0);
  const caixa = rede ? null : caixas[0];
  const contas = CONTAS.filter((c) => rede ? true : c.loja === contexto.loja);
  const fluxo = fluxoDeCaixa().map((d, i) => ({ rotulo: i === 13 ? "Hoje" : diaMes(diasAntes(hoje, 13 - i)), ...d }));
  const notas = vendas.filter((v) => v.nota !== "nao_solicitada").slice().reverse().slice(0, 8);
  const meios = [...recebimentos.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <TituloPagina
        sobretitulo={rede ? "Rede inteira" : nomeDaLoja(contexto.loja)}
        titulo="Caixa, financeiro e notas"
        subtitulo="Venda, recebimento, liquidação, repasse e conciliação são números diferentes (PAY-003)"
        acao={<ExportarCsv nomeArquivo="recebimentos" colunas={["Meio de pagamento", "Valor (R$)", "Situação"]} linhas={meios.map(([meio, valor]) => [MEIOS[meio].nome, (valor / 100).toFixed(2).replace(".", ","), CONCILIACAO[meio].situacao])} />}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Recebido hoje" valor={brlCompacto(totalRecebido)} icone={Wallet} detalhe="Todos os meios, na loja" />
        {caixa ? (
          <Indicador rotulo="Dinheiro: previsto × contado" valor={brl(caixa.previsto)} icone={Banknote} detalhe={caixa.diferenca === 0 ? "Sem diferença" : `Contado ${brl(caixa.contado)} · diferença ${brl(Math.abs(caixa.diferenca))}`} tom={caixa.diferenca === 0 ? "bom" : "ruim"} />
        ) : (
          <Indicador rotulo="Caixas com diferença" valor={`${divergentes.length} de ${caixas.length}`} icone={Scale} detalhe={divergentes.map((c) => c.loja.nome).join(", ") || "Todos conferidos"} tom={divergentes.length > 0 ? "ruim" : "bom"} />
        )}
        <Indicador rotulo="A conciliar" valor={brlCompacto(aConciliar)} icone={Landmark} detalhe="Maquininhas e links, com o extrato" tom="atencao" />
        <Indicador rotulo="A receber de financeiras" valor={brlCompacto(aReceber)} icone={HandCoins} detalhe="PayJoy e Aiva, sem juros" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Recebimentos por meio" subtitulo="Conciliação por terminal e extrato, sem supor API das maquininhas" className="xl:col-span-2"
          acao={<BotaoLink href="/demo/financeiro/extratos" tamanho="sm" variante="secundario">Extratos</BotaoLink>}>
          <BarraSegmentada partes={partesPorMeio(recebimentos)} formatar={brlCompacto} rotulo="Recebido" />
          <div className="mt-4">
            <Tabela colunas={["Meio", "Valor", "Situação"]} legenda="Recebimentos e conciliação por meio" alinharDireita={[1]}>
              {meios.map(([meio, valor]: [MeioPagamento, number]) => (
                <tr key={meio}>
                  <Celula>{MEIOS[meio].nome}</Celula>
                  <Celula className="numeros text-right">{brl(valor)}</Celula>
                  <Celula><Selo tom={CONCILIACAO[meio].tom} ponto>{CONCILIACAO[meio].situacao}</Selo></Celula>
                </tr>
              ))}
            </Tabela>
          </div>
        </Cartao>
        {caixa ? (
          <Cartao titulo="Fechamento do caixa (dinheiro)" subtitulo={caixa.conferidoPor ? `Conferido por ${caixa.conferidoPor}` : "Aguardando conferência"} icone={Banknote}>
            <ListaDados itens={[["Abertura", brl(caixa.abertura)], ["Vendas em dinheiro", brl(caixa.dinheiro)], ["Sangrias", `− ${brl(caixa.sangrias)}`], ["Previsto", brl(caixa.previsto)], ["Contado", brl(caixa.contado)]]} />
            <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${caixa.diferenca === 0 ? "bg-sucesso-clara text-emerald-900" : "bg-perigo-clara text-red-900"}`}>
              {caixa.diferenca === 0 ? "Caixa fechado sem diferença." : `Diferença de ${brl(Math.abs(caixa.diferenca))} ${caixa.diferenca < 0 ? "a menos" : "a mais"}: justificar antes de fechar.`}
            </p>
          </Cartao>
        ) : (
          <Cartao titulo="Caixas das lojas" subtitulo="Previsto × contado no fechamento">
            <ul className="max-h-96 divide-y divide-borda overflow-y-auto">
              {caixas.map((c) => (
                <li key={c.loja.codigo} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{c.loja.nome}</span>
                  {c.diferenca === 0 ? <Selo tom="sucesso" ponto>Sem diferença</Selo> : <Selo tom="perigo" ponto>Diferença {brl(Math.abs(c.diferenca))}</Selo>}
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {rede && (
          <Cartao titulo="Fluxo de caixa da rede · 14 dias" subtitulo="Entradas para cima, saídas para baixo, na mesma escala" className="xl:col-span-2">
            <ColunasDivergentes dados={fluxo} formatar={brl} formatarEixo={brlEixo} nomes={["Entradas", "Saídas"]} cadaRotulo={2} />
            <TabelaDoGrafico colunas={["Dia", "Entradas", "Saídas", "Saldo"]} linhas={fluxo.map((d) => [d.rotulo, brl(d.entrada), brl(d.saida), `${d.entrada - d.saida < 0 ? "−" : ""}${brl(Math.abs(d.entrada - d.saida))}`])} />
          </Cartao>
        )}
        <Cartao titulo="Financeiras" subtitulo="Entrada paga na loja + restante a receber" icone={HandCoins} className={rede ? "" : "xl:col-span-1"}>
          <ul className="space-y-3">
            {financeiras.map((f) => (
              <li key={f.meio} className="rounded-xl border border-borda p-3 text-sm">
                <p className="flex items-center justify-between font-semibold">{f.nome}<span className="text-xs font-normal text-suave">{f.vendas} {f.vendas === 1 ? "venda" : "vendas"}</span></p>
                <ListaDados className="mt-2" itens={[["Entradas recebidas", brl(f.entradas)], ["A receber", brl(f.aReceber)]]} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-suave">Prazo e taxa do repasse dependem da resposta P8.</p>
        </Cartao>
        {!rede && (
          <Cartao titulo="Notas fiscais da loja" subtitulo="Solicitadas, aguardando o dono e emitidas" icone={FileText} className="xl:col-span-2">
            <ul className="divide-y divide-borda">
              {notas.map((v) => (
                <li key={v.numero} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block font-medium">{v.numero} · {brl(v.total)}</span><span className="block truncate text-xs text-suave">{v.hora} · {v.cliente ?? "Cliente não identificado"}</span></span>
                  <Selo tom={v.nota === "emitida" ? "sucesso" : "aviso"} ponto>{NOMES_NOTA[v.nota]}</Selo>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
      </div>

      <Cartao className="mt-4" titulo="Contas a pagar e a receber" subtitulo="Próximos dias (exemplos)" icone={CalendarClock}>
        <Tabela colunas={["Descrição", "Tipo", "Vencimento", "Valor", "Situação"]} legenda="Contas a pagar e a receber" alinharDireita={[3]}>
          {contas.map((c) => (
            <tr key={c.descricao}>
              <Celula>{c.descricao}<span className="block text-xs text-suave">{c.loja === "rede" ? "Rede" : nomeDaLoja(c.loja)}</span></Celula>
              <Celula><Selo tom={c.tipo === "pagar" ? "neutro" : "info"}>{c.tipo === "pagar" ? "A pagar" : "A receber"}</Selo></Celula>
              <Celula className="numeros">{c.vencimento < 0 ? `venceu há ${-c.vencimento} dia` : c.vencimento === 0 ? "hoje" : diaMes(diasAntes(hoje, -c.vencimento))}</Celula>
              <Celula className="numeros text-right">{brl(c.valor)}</Celula>
              <Celula><Selo tom={c.situacao === "Vencida" ? "perigo" : c.tipo === "receber" ? "info" : "aviso"} ponto>{c.situacao}</Selo></Celula>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <Aviso tom="aviso" className="mt-4" titulo="Emissão automática de nota depende de terceiros">Emissor fiscal por API, certificado A1 e validação do contador. Hoje a nota segue manual, pelo dono. Parcela só é dada como paga com confirmação do meio de pagamento.</Aviso>
    </>
  );
}

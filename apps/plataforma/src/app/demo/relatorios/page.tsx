import { BadgePercent, Coins, Percent, Receipt, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";

import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { BarraSegmentada, BarrasHorizontais, Colunas, Linhas, TabelaDoGrafico } from "../../../componentes/graficos";
import { SemPermissao } from "../../../componentes/SemPermissao";
import { Cartao, FiltroSegmentado, Indicador, Selo, TituloPagina } from "../../../componentes/ui";
import { estoqueVisivel, historicoDoEscopo, lojasVisiveis, mixPorCategoria, vendasVisiveis } from "../../../demo/consultas";
import { historicoDaLoja, nomeDaLoja, nomeDoProduto, PRODUTOS, recebimentosPorMeio, resumoDeVendas, VENDAVEL, type ResumoDia } from "../../../demo/dados";
import { REDE } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import { agora, brl, brlCompacto, brlEixo, diaMes, diasAntes, numero, percentual } from "../../../lib/formato";
import { variacaoEntre } from "../_paineis/comum";
import { partesPorMeio } from "../_paineis/PainelGestao";

export const metadata: Metadata = { title: "Relatórios" };

const PERIODOS = { "7": "7 dias", "14": "14 dias", "30": "30 dias" } as const;
type Periodo = keyof typeof PERIODOS;

const somar = (dias: readonly ResumoDia[]) => dias.reduce((s, d) => ({ faturamento: s.faturamento + d.faturamento, vendas: s.vendas + d.vendas, telecom: s.telecom + d.telecom, custo: s.custo + d.custo, descontos: s.descontos + d.descontos }), { faturamento: 0, vendas: 0, telecom: 0, custo: 0, descontos: 0 });

export default async function Relatorios({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const contexto = await acessoDaPagina("relatorios");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Relatórios" />;
  const { periodo: pedido } = await searchParams;
  const periodo: Periodo = Object.hasOwn(PERIODOS, pedido ?? "") ? (pedido as Periodo) : "14";
  const n = Number(periodo);
  const hoje = agora();
  const rede = contexto.loja === REDE;

  const vendasHoje = vendasVisiveis(contexto);
  const resumoHoje = resumoDeVendas(vendasHoje);
  const historico = historicoDoEscopo(contexto, hoje);
  // Período = (n − 1) dias anteriores + hoje; comparação com os n dias antes disso.
  const dias = [...historico.slice(30 - (n - 1)), resumoHoje];
  const anteriores = historico.slice(Math.max(0, 30 - (n - 1) - n), 30 - (n - 1));
  const atual = somar(dias);
  const antes = somar(anteriores);
  // Comparação só com período anterior COMPLETO (REV-035, #37): 30 dias contra 1 dia inventava +2900%.
  const comparavel = anteriores.length === n;
  const variacaoDe = (agora: number, antes_: number, referencia: string) => (comparavel ? { fracao: variacaoEntre(agora, antes_), referencia } : undefined);
  const rotulos = dias.map((_, i) => (i === dias.length - 1 ? "Hoje" : diaMes(diasAntes(hoje, dias.length - 1 - i))));
  const metaDia = lojasVisiveis(contexto).reduce((s, l) => s + l.metaDia, 0);
  const cada = n > 14 ? 5 : n > 7 ? 2 : 1;
  const cadaPequeno = n > 14 ? 7 : n > 7 ? 4 : 2;
  const margem = (d: ResumoDia) => (d.faturamento > 0 ? (d.faturamento - d.custo) / d.faturamento : 0);

  const ranking = lojasVisiveis(contexto)
    .map((l) => {
      const h = historicoDaLoja(l.codigo, hoje);
      const total = somar([...h.slice(30 - (n - 1)), resumoDeVendas(vendasHoje.filter((v) => v.loja === l.codigo))]);
      return { rotulo: l.nome, valor: total.faturamento, meta: l.metaDia * n, detalhe: percentual(total.faturamento / (l.metaDia * n)) };
    })
    .sort((a, b) => b.valor - a.valor);

  const parados = estoqueVisivel(contexto).filter((u) => VENDAVEL.includes(u.situacao) && u.diasEmEstoque > 60).sort((a, b) => b.diasEmEstoque - a.diasEmEstoque);
  const linhasCsv = dias.map((d, i) => [rotulos[i] ?? "", (d.faturamento / 100).toFixed(2).replace(".", ","), d.vendas, (d.vendas > 0 ? d.faturamento / d.vendas / 100 : 0).toFixed(2).replace(".", ","), percentual(margem(d)), (d.descontos / 100).toFixed(2).replace(".", ","), d.telecom]);

  return (
    <>
      <TituloPagina
        sobretitulo={rede ? "Rede inteira" : nomeDaLoja(contexto.loja)}
        titulo="Relatórios"
        subtitulo="Faturamento, margem, ticket, descontos, meios de pagamento, telecom e estoque parado"
        acao={<ExportarCsv nomeArquivo={`relatorio-${periodo}-dias`} colunas={["Dia", "Faturamento (R$)", "Vendas", "Ticket médio (R$)", "Margem bruta", "Descontos (R$)", "Chips/ativações/recargas"]} linhas={linhasCsv} />}
      />
      <FiltroSegmentado rotulo="Período" opcoes={(Object.keys(PERIODOS) as Periodo[]).map((p) => ({ href: p === "14" ? "/demo/relatorios" : `/demo/relatorios?periodo=${p}`, rotulo: `Últimos ${PERIODOS[p]}`, ativo: p === periodo }))} />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <Indicador rotulo="Faturamento" valor={brlCompacto(atual.faturamento)} icone={Coins} variacao={variacaoDe(atual.faturamento, antes.faturamento, `vs. ${PERIODOS[periodo]} antes`)} />
        <Indicador rotulo="Vendas" valor={numero(atual.vendas)} icone={ShoppingBag} variacao={variacaoDe(atual.vendas, antes.vendas, "vs. antes")} />
        <Indicador rotulo="Ticket médio" valor={brl(atual.vendas > 0 ? atual.faturamento / atual.vendas : 0)} icone={Receipt} variacao={variacaoDe(atual.vendas > 0 ? atual.faturamento / atual.vendas : 0, antes.vendas > 0 ? antes.faturamento / antes.vendas : 0, "vs. antes")} />
        <Indicador rotulo="Margem bruta" valor={percentual(margem(atual))} icone={Percent} detalhe={`Antes: ${percentual(margem(antes))}`} />
        <Indicador rotulo="Descontos" valor={percentual(atual.faturamento > 0 ? atual.descontos / atual.faturamento : 0)} icone={BadgePercent} detalhe={`${brlCompacto(atual.descontos)} do faturamento`} className="col-span-2 xl:col-span-1" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Faturamento por dia e meta diária" subtitulo={`${rede ? "Rede inteira" : nomeDaLoja(contexto.loja)} · últimos ${PERIODOS[periodo]}`} className="xl:col-span-2">
          <Linhas rotulosX={rotulos} formatar={brl} formatarEixo={brlEixo} cadaRotulo={cada} altura={280} series={[{ nome: "Faturamento", serie: 1, valores: dias.map((d) => d.faturamento), area: true }, { nome: "Meta diária", serie: 2, valores: dias.map(() => metaDia) }]} />
          <TabelaDoGrafico colunas={["Dia", "Faturamento", "Meta"]} linhas={dias.map((d, i) => [rotulos[i] ?? "", brl(d.faturamento), brl(metaDia)])} />
        </Cartao>
        <div className="min-w-0 space-y-4">
          <Cartao titulo="Meios de pagamento hoje" subtitulo="Por terminal e meio (REPORT-005)">
            <BarraSegmentada partes={partesPorMeio(recebimentosPorMeio(vendasHoje))} formatar={brlCompacto} rotulo="Recebido" />
          </Cartao>
          <Cartao titulo="Mix de vendas hoje">
            <BarraSegmentada partes={mixPorCategoria(vendasHoje)} formatar={brlCompacto} rotulo="Vendido" />
          </Cartao>
        </div>
      </div>

      <Cartao className="mt-4" titulo={rede ? "Lojas no período" : "Loja no período"} subtitulo="Faturamento contra a meta do período (traço = meta)">
        <BarrasHorizontais nomeSerie="Faturamento" formatar={brlCompacto} duasColunas={ranking.length > 4} dados={ranking.map((r) => ({ ...r, destaque: false }))} />
        <TabelaDoGrafico colunas={["Loja", "Faturamento", "Meta", "Atingido"]} linhas={ranking.map((r) => [r.rotulo, brl(r.valor), brl(r.meta), r.detalhe])} />
      </Cartao>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Margem bruta por dia" subtitulo="Depois do custo dos produtos; taxas de meio de pagamento à parte">
          <Linhas rotulosX={rotulos} formatar={(v) => percentual(v / 10_000)} formatarEixo={(v) => percentual(v / 10_000)} cadaRotulo={cadaPequeno} altura={170} series={[{ nome: "Margem bruta", serie: 3, valores: dias.map((d) => Math.round(margem(d) * 10_000)), area: true }]} />
        </Cartao>
        <Cartao titulo="Ticket médio por dia" subtitulo="Faturamento dividido pelo número de vendas">
          <Linhas rotulosX={rotulos} formatar={brl} formatarEixo={brlEixo} cadaRotulo={cadaPequeno} altura={170} series={[{ nome: "Ticket médio", serie: 2, valores: dias.map((d) => (d.vendas > 0 ? Math.round(d.faturamento / d.vendas) : 0)), area: true }]} />
        </Cartao>
        <Cartao titulo="Descontos concedidos por dia" subtitulo="Acompanhe para não virar hábito">
          <Colunas dados={dias.map((d, i) => ({ rotulo: rotulos[i] ?? "", valor: d.descontos, destaque: i === dias.length - 1 }))} formatar={brl} formatarEixo={brlEixo} nomeSerie="Descontos" serie={3} cadaRotulo={cadaPequeno} altura={170} />
        </Cartao>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Chips, ativações e recargas por dia" subtitulo="Só as confirmadas pela operadora (REPORT-004)">
          <Colunas dados={dias.map((d, i) => ({ rotulo: rotulos[i] ?? "", valor: d.telecom, destaque: i === dias.length - 1 }))} formatar={(v) => numero(v)} nomeSerie="Operações" serie={4} cadaRotulo={cadaPequeno} altura={190} />
        </Cartao>
      <Cartao className="xl:col-span-2" titulo="Estoque parado há mais de 60 dias" subtitulo="Candidatos a campanha ou transferência (REPORT-007)">
        {parados.length === 0 ? <p className="text-sm text-suave">Nenhum aparelho parado há mais de 60 dias.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {parados.slice(0, 8).map((u) => (
              <li key={u.imei} className="flex items-center justify-between gap-3 rounded-xl border border-borda px-3 py-2 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium">{nomeDoProduto(u.sku)}</span><span className="block text-xs text-suave">{nomeDaLoja(u.loja)} · {brl(PRODUTOS.find((p) => p.sku === u.sku)?.preco ?? 0)}</span></span>
                <Selo tom={u.diasEmEstoque > 90 ? "perigo" : "aviso"}>{u.diasEmEstoque} dias</Selo>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      </div>
    </>
  );
}

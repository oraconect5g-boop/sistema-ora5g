import { MEIOS, type MeioPagamento } from "@ora5g/dominio";
import { ArrowRight, BadgePercent, ClipboardCheck, Percent, Receipt, ShoppingBag, Signal, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

import { BarraSegmentada, BarrasHorizontais, Linhas, Medidor, TabelaDoGrafico, type Parte, type SerieCor } from "../../../componentes/graficos";
import { Avatar, BotaoLink, Cartao, FiltroSegmentado, Indicador, Progresso, Selo, SeloVariacao, TituloPagina } from "../../../componentes/ui";
import {
  alertasDoEscopo, aprovacoesVisiveis, desempenhoDe, historicoDoEscopo, lojasVisiveis, mixPorCategoria, vendasPorHora, vendasVisiveis, vendedoresVisiveis,
} from "../../../demo/consultas";
import { caixaDaLoja, LOJAS, nomeDaLoja, primeiroNome, recebimentosPorMeio, resumoDeVendas, VENDAS_HOJE, type ResumoDia } from "../../../demo/dados";
import { podeAcessar, REDE, type Pagina } from "../../../demo/perfis";
import type { ContextoDemo } from "../../../demo/sessao";
import { agora, brl, brlCompacto, brlEixo, diaDaSemanaEData, diaMes, diasAntes, numero, percentual } from "../../../lib/formato";
import { CartaoAvisos, variacaoEntre } from "./comum";

const ORDEM_MEIOS: MeioPagamento[] = ["pix_picpay", "cartao_picpay", "dinheiro", "pix_direto", "cartao_pagseguro", "link_pagamento"];

export function partesPorMeio(mapa: Map<MeioPagamento, number>): Parte[] {
  const principais = ORDEM_MEIOS.slice(0, 5).map((meio, i) => ({ nome: MEIOS[meio].nome, valor: mapa.get(meio) ?? 0, serie: (i + 1) as SerieCor }));
  const outros = [...mapa.entries()].filter(([meio]) => !ORDEM_MEIOS.slice(0, 5).includes(meio)).reduce((s, [, v]) => s + v, 0);
  return [...principais, { nome: "Outros (link e entradas de financiamento)", valor: outros, serie: 6 }];
}

// Período do gráfico principal (visual de 10/11/2026): hoje por hora contra ontem, ou os últimos 7 ou 14
// dias contra o mesmo número de dias antes. O histórico fictício tem 30 dias; 14 + 14 cabem nele.
export const PERIODOS_DO_PAINEL = { hoje: "Hoje", "7": "7 dias", "14": "14 dias" } as const;
export type PeriodoDoPainel = keyof typeof PERIODOS_DO_PAINEL;
// Ordem explícita: chaves numéricas ("7", "14") viriam antes de "hoje" em Object.keys.
const ORDEM_DOS_PERIODOS: readonly PeriodoDoPainel[] = ["hoje", "7", "14"];
export const periodoDoPainel = (valor: unknown): PeriodoDoPainel => (valor === "7" || valor === "14" ? valor : "hoje");

// Dia típico (09h–19h) para repartir o faturamento de ontem por hora: o histórico fictício só tem o total do dia.
const PERFIL_DO_DIA = [5, 7, 9, 10, 11, 10, 10, 10, 10, 9, 9].map((p, i) => p * (1 + 0.12 * Math.sin(i * 1.7)));

export type SerieDoPainel = { titulo: string; rotulos: string[]; atual: number[]; anterior: number[]; nomes: readonly [string, string]; referencia: string; cadaRotulo: number };

export function serieDoPainel(periodo: PeriodoDoPainel, dados: {
  porHora: readonly { hora: string; valor: number }[];
  historico: readonly ResumoDia[];
  faturamentoHoje: number;
  hoje: Date;
}): SerieDoPainel {
  const { porHora, historico, faturamentoHoje, hoje } = dados;
  if (periodo === "hoje") {
    const ontem = historico[historico.length - 1]?.faturamento ?? 0;
    const soma = PERFIL_DO_DIA.reduce((s, p) => s + p, 0);
    return {
      titulo: "Faturamento por hora",
      rotulos: porHora.map((h) => h.hora),
      atual: porHora.map((h) => h.valor),
      anterior: PERFIL_DO_DIA.slice(0, porHora.length).map((p) => Math.round((ontem * p) / soma)),
      nomes: ["Hoje", "Ontem"],
      referencia: "vs. ontem",
      cadaRotulo: 2,
    };
  }
  const dias = periodo === "7" ? 7 : 14;
  return {
    titulo: "Faturamento por dia",
    rotulos: Array.from({ length: dias }, (_, i) => (i === dias - 1 ? "Hoje" : diaMes(diasAntes(hoje, dias - 1 - i)))),
    atual: [...historico.slice(-(dias - 1)).map((d) => d.faturamento), faturamentoHoje],
    anterior: historico.slice(-(2 * dias - 1), -(dias - 1)).map((d) => d.faturamento),
    nomes: [`Últimos ${dias} dias`, `${dias} dias anteriores`],
    referencia: `vs. ${dias} dias anteriores`,
    cadaRotulo: dias === 7 ? 1 : 2,
  };
}

const soma = (valores: readonly number[]) => valores.reduce((s, v) => s + v, 0);

/** Painel do dono (rede ou loja) e do gerente (loja): REPORT-001 e REPORT-002. */
export function PainelGestao({ contexto, periodo = "hoje" }: { contexto: ContextoDemo; periodo?: PeriodoDoPainel }) {
  const hoje = agora();
  const rede = contexto.loja === REDE;
  const vendas = vendasVisiveis(contexto);
  const resumo = resumoDeVendas(vendas);
  const historico = historicoDoEscopo(contexto, hoje);
  const ontem = historico[29] ?? resumo;
  const lojas = lojasVisiveis(contexto);
  const meta = lojas.reduce((s, l) => s + l.metaDia, 0);
  const ticket = resumo.vendas > 0 ? resumo.faturamento / resumo.vendas : 0;
  const ticketOntem = ontem.vendas > 0 ? ontem.faturamento / ontem.vendas : 0;
  const margem = resumo.faturamento > 0 ? (resumo.faturamento - resumo.custo) / resumo.faturamento : 0;
  const margemOntem = ontem.faturamento > 0 ? (ontem.faturamento - ontem.custo) / ontem.faturamento : 0;
  const aprovacoes = aprovacoesVisiveis(contexto);
  const alertas = alertasDoEscopo(contexto);
  const gerente = contexto.perfil === "gerente";
  const titulo = rede ? "Visão geral da rede" : gerente ? `Gestão da loja · ${nomeDaLoja(contexto.loja)}` : `Visão da loja · ${nomeDaLoja(contexto.loja)}`;
  const pode = (p: Pagina) => podeAcessar(contexto.perfil, p);
  const atalho = (p: Pagina, href: string, rotulo: string) => (pode(p) ? { href, rotulo } : undefined);

  const grafico = serieDoPainel(periodo, { porHora: vendasPorHora(vendas), historico, faturamentoHoje: resumo.faturamento, hoje });
  const totalAtual = soma(grafico.atual);
  const variacaoDoGrafico = periodo === "hoje" ? variacaoEntre(resumo.faturamento, ontem.faturamento) : variacaoEntre(totalAtual, soma(grafico.anterior));

  const fracaoDaMeta = meta > 0 ? resumo.faturamento / meta : 0;
  const falta = Math.max(0, meta - resumo.faturamento);
  const mix = mixPorCategoria(vendas);
  const totalDoMix = soma(mix.map((p) => p.valor));

  const rankingLojas = lojas
    .map((l) => ({ loja: l, vendido: resumoDeVendas(VENDAS_HOJE.filter((v) => v.loja === l.codigo)).faturamento }))
    .sort((a, b) => b.vendido / b.loja.metaDia - a.vendido / a.loja.metaDia);
  const equipe = vendedoresVisiveis(contexto)
    .map((p) => desempenhoDe(p, contexto.loja))
    .filter((d) => d.vendas > 0 || !rede)
    .sort((a, b) => b.vendido - a.vendido);
  const caixa = rede ? null : caixaDaLoja(contexto.loja, VENDAS_HOJE);
  const destaques = (rede ? vendedoresVisiveis(contexto).map((p) => desempenhoDe(p)) : equipe).slice().sort((a, b) => b.vendido - a.vendido).slice(0, 5);

  const indicadores: ComponentProps<typeof Indicador>[] = [
    { rotulo: "Vendas realizadas", valor: numero(resumo.vendas), icone: ShoppingBag, variacao: { fracao: variacaoEntre(resumo.vendas, ontem.vendas), referencia: "vs. ontem" }, acao: atalho("vendas", "/demo/vendas", "Ver vendas") },
    { rotulo: "Ticket médio", valor: brl(ticket), icone: Receipt, variacao: { fracao: variacaoEntre(ticket, ticketOntem), referencia: "vs. ontem" }, acao: atalho("relatorios", "/demo/relatorios", "Relatórios") },
    { rotulo: "Margem bruta", valor: percentual(margem), icone: Percent, detalhe: `${brlCompacto(resumo.faturamento - resumo.custo)} de margem · ontem ${percentual(margemOntem)}`, acao: atalho("relatorios", "/demo/relatorios", "Detalhes") },
    { rotulo: "Chips, ativações e recargas", valor: numero(resumo.telecom), icone: Signal, detalhe: "Só as confirmadas pela operadora", acao: atalho("connect", "/demo/connect", "Ver Connect") },
    {
      rotulo: "Descontos concedidos", valor: brl(resumo.descontos), icone: BadgePercent,
      variacao: { fracao: variacaoEntre(resumo.descontos, ontem.descontos), referencia: "vs. ontem", bomQuandoSobe: false }, acao: atalho("aprovacoes", "/demo/aprovacoes", "Aprovações"),
    },
    caixa
      ? {
        rotulo: "Caixa (dinheiro)", valor: brl(caixa.previsto), icone: Wallet, tom: caixa.diferenca === 0 ? "bom" : "ruim",
        detalhe: caixa.diferenca === 0 ? "Conferido sem diferença" : `Contado ${brl(caixa.contado)} · diferença ${brl(Math.abs(caixa.diferenca))}`, acao: atalho("financeiro", "/demo/financeiro", "Ver caixa"),
      }
      : {
        rotulo: "Aprovações pendentes", valor: numero(aprovacoes.length), icone: ClipboardCheck, tom: aprovacoes.length > 0 ? "atencao" : "bom",
        detalhe: "Descontos, notas e cancelamentos", acao: atalho("aprovacoes", "/demo/aprovacoes", "Abrir fila"),
      },
  ];

  return (
    <>
      <TituloPagina
        sobretitulo={`Hoje · ${diaDaSemanaEData(hoje)}`}
        titulo={titulo}
        subtitulo={rede ? `Consolidado das ${LOJAS.length} lojas · troque para uma loja no seletor do topo` : gerente ? "Caixa, equipe, metas e aprovações da sua loja" : "Uma loja da rede · todos os vendedores dela"}
        acao={
          <>
            {aprovacoes.length > 0 && <BotaoLink href="/demo/aprovacoes" variante="secundario"><ClipboardCheck aria-hidden className="size-4" /> Aprovações ({aprovacoes.length})</BotaoLink>}
            <BotaoLink href="/demo/relatorios"><TrendingUp aria-hidden className="size-4" /> Relatórios</BotaoLink>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Cartao titulo={grafico.titulo} subtitulo={`${rede ? "Rede inteira" : nomeDaLoja(contexto.loja)} · ${grafico.nomes[0].toLowerCase()} × ${grafico.nomes[1].toLowerCase()}`} className="xl:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-suave">{periodo === "hoje" ? "Faturamento de hoje" : `Faturamento dos ${grafico.nomes[0].toLowerCase()}`}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="numeros text-[30px] font-extrabold leading-tight tracking-tight">{brlCompacto(totalAtual)}</p>
                <SeloVariacao variacao={{ fracao: variacaoDoGrafico, referencia: grafico.referencia }} />
              </div>
            </div>
            <FiltroSegmentado
              rotulo="Período do gráfico"
              opcoes={ORDEM_DOS_PERIODOS.map((p) => ({ href: p === "hoje" ? "/demo" : `/demo?periodo=${p}`, rotulo: PERIODOS_DO_PAINEL[p], ativo: p === periodo }))}
            />
          </div>
          <Linhas
            suave
            altura={250}
            rotulosX={grafico.rotulos}
            formatar={brl}
            formatarEixo={brlEixo}
            formatarPonto={brlCompacto}
            cadaRotulo={grafico.cadaRotulo}
            series={[
              { nome: grafico.nomes[0], serie: 1, valores: grafico.atual, area: true, ponto: "maximo" },
              { nome: grafico.nomes[1], serie: "comparacao", valores: grafico.anterior, tracejada: true, ponto: "nenhum" },
            ]}
          />
          <TabelaDoGrafico
            colunas={[periodo === "hoje" ? "Hora" : "Dia", grafico.nomes[0], grafico.nomes[1]]}
            linhas={grafico.rotulos.map((r, i) => [r, brl(grafico.atual[i] ?? 0), brl(grafico.anterior[i] ?? 0)])}
          />
        </Cartao>
        <div className="min-w-0 space-y-4">
          <Cartao titulo="Meta do dia" subtitulo={meta > 0 ? `${brlCompacto(resumo.faturamento)} de ${brlCompacto(meta)}` : "Sem meta cadastrada"}>
            <div className="flex items-center gap-5">
              <Medidor percentual={fracaoDaMeta * 100} rotulo="Meta do dia" detalhe="da meta" tamanho={124} />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-sm text-suave">
                  {falta > 0 ? <>Faltam <strong className="numeros text-texto">{brlCompacto(falta)}</strong></> : <strong className="text-sucesso">Meta do dia batida</strong>}
                </p>
                {mix.map((p) => {
                  const fracao = totalDoMix > 0 ? p.valor / totalDoMix : 0;
                  return (
                    <div key={p.nome}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate"><span className="font-semibold">{p.nome.replace(/ \(.*\)$/, "")}</span> <span className="numeros text-suave">· {brlCompacto(p.valor)}</span></span>
                        <b className="numeros shrink-0 font-bold">{percentual(fracao)}</b>
                      </div>
                      <Progresso valor={fracao * 100} rotulo={`Participação de ${p.nome} no vendido hoje`} tom="marca" />
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-4 text-xs text-suave">Participação no vendido hoje, em valor.</p>
          </Cartao>
          <Cartao titulo="Recebimentos por meio" subtitulo="O que entrou hoje (financeiras à parte)" acao={<Link href="/demo/financeiro" className="text-sm font-semibold text-acao hover:underline">Caixa</Link>}>
            <BarraSegmentada partes={partesPorMeio(recebimentosPorMeio(vendas))} formatar={brlCompacto} rotulo="Recebido" />
          </Cartao>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section aria-label="Indicadores de hoje" className="min-w-0 xl:col-span-2">
          <div className="sem-barra -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {indicadores.map((i) => <Indicador key={i.rotulo} {...i} className="w-[78%] shrink-0 snap-start sm:w-auto" />)}
          </div>
        </section>
        <CartaoAvisos alertas={alertas} limite={3} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {rede ? (
          <Cartao titulo="Desempenho das lojas hoje" subtitulo="Vendas contra a meta do dia (traço = meta)" className="xl:col-span-2" acao={<Link href="/demo/lojas" className="inline-flex items-center gap-1 text-sm font-semibold text-acao hover:underline">Lojas <ArrowRight aria-hidden className="size-4" /></Link>}>
            <BarrasHorizontais
              nomeSerie="Vendido hoje"
              formatar={brl}
              dados={rankingLojas.map(({ loja, vendido }) => ({ rotulo: `${loja.nome}${loja.piloto ? " (piloto)" : ""}`, valor: vendido, meta: loja.metaDia, detalhe: percentual(vendido / loja.metaDia), destaque: loja.piloto }))}
            />
            <TabelaDoGrafico colunas={["Loja", "Vendido", "Meta", "Atingido"]} linhas={rankingLojas.map(({ loja, vendido }) => [loja.nome, brl(vendido), brl(loja.metaDia), percentual(vendido / loja.metaDia)])} />
          </Cartao>
        ) : (
          <Cartao titulo="Equipe hoje" subtitulo={`Todos os vendedores de ${nomeDaLoja(contexto.loja)} · traço = meta do dia`} className="xl:col-span-2" acao={<Link href="/demo/metas" className="inline-flex items-center gap-1 text-sm font-semibold text-acao hover:underline">Metas <ArrowRight aria-hidden className="size-4" /></Link>}>
            {equipe.length === 0 ? <p className="text-sm text-suave">Nenhuma venda registrada hoje nesta loja.</p> : (
              <BarrasHorizontais nomeSerie="Vendido hoje" formatar={brl} dados={equipe.map((d) => ({ rotulo: d.pessoa.nome, valor: d.vendido, meta: d.meta, detalhe: `${d.vendas} vendas` }))} />
            )}
            <TabelaDoGrafico colunas={["Vendedor", "Vendido", "Meta", "Vendas"]} linhas={equipe.map((d) => [d.pessoa.nome, brl(d.vendido), brl(d.meta), d.vendas])} />
          </Cartao>
        )}
        <Cartao titulo="Aprovações aguardando" subtitulo="Ninguém aprova o próprio pedido; tudo fica na auditoria" acao={<Link href="/demo/aprovacoes" className="inline-flex items-center gap-1 text-sm font-semibold text-acao hover:underline">Abrir fila <ArrowRight aria-hidden className="size-4" /></Link>}>
          {aprovacoes.length === 0 ? <p className="text-sm text-suave">Nenhum pedido aguardando.</p> : (
            <ul className="divide-y divide-borda">
              {aprovacoes.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.tipo === "desconto" ? "Desconto" : a.tipo === "nota" ? "Nota fiscal" : "Cancelamento"} · {a.venda.numero}</span>
                    <span className="block truncate text-xs text-suave">{primeiroNome(a.venda.vendedor)} · {nomeDaLoja(a.venda.loja)} · {brl(a.venda.total)}</span>
                  </span>
                  <Selo tom={(a.venda.pedido?.esperaMinutos ?? 0) > 30 ? "perigo" : "aviso"} ponto>há {a.venda.pedido?.esperaMinutos ?? 0} min</Selo>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <section aria-labelledby="titulo-destaques" className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="titulo-destaques" className="text-lg font-bold tracking-tight">{rede ? "Melhores vendedores da rede hoje" : "Melhores vendedores hoje"}</h2>
            <p className="text-sm text-suave">Gestores veem todos os vendedores; cada vendedor vê só os próprios números.</p>
          </div>
          <Link href="/demo/metas" className="inline-flex items-center gap-1 text-sm font-semibold text-acao hover:underline">Ver a equipe <ArrowRight aria-hidden className="size-4" /></Link>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {destaques.map((d, i) => (
            <li key={d.pessoa.id} className="relative rounded-cartao border border-borda/80 bg-white p-4 shadow-cartao sm:p-5">
              <span className={`absolute right-4 top-4 grid size-8 place-items-center rounded-full text-xs font-bold ${i === 0 ? "bg-acao text-white" : "bg-slate-100 text-suave"}`}>{i + 1}º</span>
              <Avatar nome={d.pessoa.nome} tamanho="size-12 text-sm" />
              <p className="mt-3 truncate font-semibold">{d.pessoa.nome}</p>
              <p className="truncate text-xs text-suave">{d.porLoja.map((l) => nomeDaLoja(l.loja)).join(" + ") || nomeDaLoja(d.pessoa.lojas[0] ?? "")} · {d.vendas} vendas</p>
              <p className="numeros mt-3 text-lg font-extrabold tracking-tight">{brl(d.vendido)}</p>
              <div className="mt-2"><Progresso valor={d.meta > 0 ? (d.vendido / d.meta) * 100 : 0} rotulo={`Meta de ${d.pessoa.nome}`} /></div>
              <p className="mt-1 text-xs text-suave">{percentual(d.meta > 0 ? d.vendido / d.meta : 0)} da meta de {brlCompacto(d.meta)}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

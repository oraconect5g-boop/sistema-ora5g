import { MEIOS, type MeioPagamento } from "@ora5g/dominio";
import { ArrowRight, BadgePercent, ClipboardCheck, Coins, Percent, Receipt, ShoppingBag, Signal, Target, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";

import { BarraSegmentada, BarrasHorizontais, Colunas, TabelaDoGrafico, type Parte, type SerieCor } from "../../../componentes/graficos";
import { Avatar, BotaoLink, Cartao, Indicador, Progresso, Selo, TituloPagina } from "../../../componentes/ui";
import {
  alertasDoEscopo, aprovacoesVisiveis, desempenhoDe, historicoDoEscopo, lojasVisiveis, mixPorCategoria, vendasPorHora, vendasVisiveis, vendedoresVisiveis,
} from "../../../demo/consultas";
import { caixaDaLoja, LOJAS, nomeDaLoja, primeiroNome, recebimentosPorMeio, resumoDeVendas, VENDAS_HOJE } from "../../../demo/dados";
import { REDE } from "../../../demo/perfis";
import type { ContextoDemo } from "../../../demo/sessao";
import { agora, brl, brlCompacto, brlEixo, diaDaSemanaEData, numero, percentual } from "../../../lib/formato";
import { CartaoAvisos, GraficoFaturamento, variacaoEntre } from "./comum";

const ORDEM_MEIOS: MeioPagamento[] = ["pix_picpay", "cartao_picpay", "dinheiro", "pix_direto", "cartao_pagseguro", "link_pagamento"];

export function partesPorMeio(mapa: Map<MeioPagamento, number>): Parte[] {
  const principais = ORDEM_MEIOS.slice(0, 5).map((meio, i) => ({ nome: MEIOS[meio].nome, valor: mapa.get(meio) ?? 0, serie: (i + 1) as SerieCor }));
  const outros = [...mapa.entries()].filter(([meio]) => !ORDEM_MEIOS.slice(0, 5).includes(meio)).reduce((s, [, v]) => s + v, 0);
  return [...principais, { nome: "Outros (link e entradas de financiamento)", valor: outros, serie: 6 }];
}

/** Painel do dono (rede ou loja) e do gerente (loja): REPORT-001 e REPORT-002. */
export function PainelGestao({ contexto }: { contexto: ContextoDemo }) {
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
  const tendencia = [...historico.slice(-13).map((d) => d.faturamento), resumo.faturamento];
  const porHora = vendasPorHora(vendas);
  const gerente = contexto.perfil === "gerente";
  const titulo = rede ? "Visão geral da rede" : gerente ? `Gestão da loja · ${nomeDaLoja(contexto.loja)}` : `Visão da loja · ${nomeDaLoja(contexto.loja)}`;

  const rankingLojas = lojas
    .map((l) => ({ loja: l, vendido: resumoDeVendas(VENDAS_HOJE.filter((v) => v.loja === l.codigo)).faturamento }))
    .sort((a, b) => b.vendido / b.loja.metaDia - a.vendido / a.loja.metaDia);
  const equipe = vendedoresVisiveis(contexto)
    .map((p) => desempenhoDe(p, contexto.loja))
    .filter((d) => d.vendas > 0 || !rede)
    .sort((a, b) => b.vendido - a.vendido);
  const caixa = rede ? null : caixaDaLoja(contexto.loja, VENDAS_HOJE);
  const destaques = (rede ? vendedoresVisiveis(contexto).map((p) => desempenhoDe(p)) : equipe).slice().sort((a, b) => b.vendido - a.vendido).slice(0, 5);

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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Faturamento de hoje" valor={brlCompacto(resumo.faturamento)} icone={Coins} variacao={{ fracao: variacaoEntre(resumo.faturamento, ontem.faturamento), referencia: "vs. ontem" }} tendencia={tendencia} />
        <Indicador rotulo="Vendas realizadas" valor={numero(resumo.vendas)} icone={ShoppingBag} variacao={{ fracao: variacaoEntre(resumo.vendas, ontem.vendas), referencia: "vs. ontem" }} tendencia={[...historico.slice(-13).map((d) => d.vendas), resumo.vendas]} />
        <Indicador rotulo="Ticket médio" valor={brl(ticket)} icone={Receipt} variacao={{ fracao: variacaoEntre(ticket, ticketOntem), referencia: "vs. ontem" }} />
        <Indicador rotulo="Margem bruta" valor={percentual(margem)} icone={Percent} detalhe={`${brlCompacto(resumo.faturamento - resumo.custo)} de margem · ontem ${percentual(margemOntem)}`} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Meta do dia" valor={percentual(meta > 0 ? resumo.faturamento / meta : 0)} icone={Target} detalhe={`de ${brlCompacto(meta)}`} tom={resumo.faturamento >= meta ? "bom" : "atencao"} />
        <Indicador rotulo="Chips, ativações e recargas" valor={numero(resumo.telecom)} icone={Signal} detalhe="Só as confirmadas pela operadora" />
        <Indicador rotulo="Descontos concedidos" valor={brl(resumo.descontos)} icone={BadgePercent} variacao={{ fracao: variacaoEntre(resumo.descontos, ontem.descontos), referencia: "vs. ontem", bomQuandoSobe: false }} />
        {caixa ? (
          <Indicador rotulo="Caixa (dinheiro)" valor={brl(caixa.previsto)} icone={Wallet} detalhe={caixa.diferenca === 0 ? "Conferido sem diferença" : `Contado ${brl(caixa.contado)} · diferença ${brl(Math.abs(caixa.diferenca))}`} tom={caixa.diferenca === 0 ? "bom" : "ruim"} />
        ) : (
          <Indicador rotulo="Aprovações pendentes" valor={numero(aprovacoes.length)} icone={ClipboardCheck} detalhe="Descontos, notas e cancelamentos" tom={aprovacoes.length > 0 ? "atencao" : "bom"} />
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Faturamento dos últimos 14 dias" subtitulo={rede ? "Rede inteira · hoje em destaque" : `${nomeDaLoja(contexto.loja)} · hoje em destaque`} className="xl:col-span-2">
          <GraficoFaturamento historico={historico} hoje={hoje} valorHoje={resumo.faturamento} />
        </Cartao>
        <CartaoAvisos alertas={alertas} limite={5} />
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
        <div className="min-w-0 space-y-4">
          <Cartao titulo="Mix de vendas" subtitulo="Em valor, hoje">
            <BarraSegmentada partes={mixPorCategoria(vendas)} formatar={brlCompacto} rotulo="Vendido" />
          </Cartao>
          <Cartao titulo="Recebimentos por meio" subtitulo="O que entrou hoje (financeiras à parte)" acao={<Link href="/demo/financeiro" className="text-sm font-semibold text-acao hover:underline">Caixa</Link>}>
            <BarraSegmentada partes={partesPorMeio(recebimentosPorMeio(vendas))} formatar={brlCompacto} rotulo="Recebido" />
          </Cartao>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Vendas por hora" subtitulo="Ajuda a escalar a equipe nos horários de pico" className="xl:col-span-2">
          <Colunas dados={porHora.map((h) => ({ rotulo: h.hora, valor: h.valor }))} formatar={brl} formatarEixo={brlEixo} nomeSerie="Vendido" serie={2} altura={190} />
          <TabelaDoGrafico colunas={["Hora", "Vendido", "Vendas"]} linhas={porHora.map((h) => [h.hora, brl(h.valor), h.quantidade])} />
        </Cartao>
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
            <h2 id="titulo-destaques" className="text-lg font-semibold tracking-tight">{rede ? "Melhores vendedores da rede hoje" : "Melhores vendedores hoje"}</h2>
            <p className="text-sm text-suave">Gestores veem todos os vendedores; cada vendedor vê só os próprios números.</p>
          </div>
          <Link href="/demo/metas" className="inline-flex items-center gap-1 text-sm font-semibold text-acao hover:underline">Ver a equipe <ArrowRight aria-hidden className="size-4" /></Link>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {destaques.map((d, i) => (
            <li key={d.pessoa.id} className="relative rounded-cartao border border-borda bg-white p-4 shadow-cartao">
              <span className={`absolute right-3 top-3 grid size-7 place-items-center rounded-full text-xs font-bold ${i === 0 ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-suave"}`}>{i + 1}º</span>
              <Avatar nome={d.pessoa.nome} tamanho="size-11 text-sm" />
              <p className="mt-3 truncate font-semibold">{d.pessoa.nome}</p>
              <p className="truncate text-xs text-suave">{d.porLoja.map((l) => nomeDaLoja(l.loja)).join(" + ") || nomeDaLoja(d.pessoa.lojas[0] ?? "")} · {d.vendas} vendas</p>
              <p className="numeros mt-3 text-lg font-bold tracking-tight">{brl(d.vendido)}</p>
              <div className="mt-2"><Progresso valor={d.meta > 0 ? (d.vendido / d.meta) * 100 : 0} rotulo={`Meta de ${d.pessoa.nome}`} /></div>
              <p className="mt-1 text-xs text-suave">{percentual(d.meta > 0 ? d.vendido / d.meta : 0)} da meta de {brlCompacto(d.meta)}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

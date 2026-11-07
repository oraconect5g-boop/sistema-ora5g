import { ArrowRight, ArrowRightLeft, Clock, MapPin, MessageCircle, Package, Plus, Receipt, RefreshCw, Signal, Store } from "lucide-react";
import Link from "next/link";

import { Medidor } from "../../../componentes/graficos";
import { BotaoLink, Cartao, Selo } from "../../../componentes/ui";
import { alertasDoEscopo, desempenhoDe, resumoDaLoja, vendasVisiveis } from "../../../demo/consultas";
import { nomeDaLoja, pessoa, VENDEDORES } from "../../../demo/dados";
import type { ContextoDemo } from "../../../demo/sessao";
import { agora, brl, diaDaSemanaEData, minutosEmSaoPaulo, percentual, saudacao } from "../../../lib/formato";
import { CartaoAvisos } from "./comum";

const ATALHOS = [
  { href: "/demo/vender?item=chip", titulo: "Chip + ativação", sub: "Linha nova", icone: Signal },
  { href: "/demo/vender?item=recarga", titulo: "Recarga", sub: "Escolher valor", icone: RefreshCw },
  { href: "/demo/vender?item=portabilidade", titulo: "Portabilidade", sub: "Trazer número", icone: ArrowRightLeft },
  { href: "/demo/estoque", titulo: "Estoque", sub: "Consultar IMEI", icone: Package },
  { href: "/demo/clientes", titulo: "Cliente", sub: "Busca exata", icone: MessageCircle },
  { href: "/demo/vendas", titulo: "Minhas vendas", sub: "Hoje", icone: Receipt },
];

const hhmm = (minutos: number) => `${String(Math.floor(minutos / 60)).padStart(2, "0")}h${minutos % 60 ? String(minutos % 60).padStart(2, "0") : ""}`;

/** Início do vendedor no celular (REPORT-003): produção do dia, meta, atalhos e loja da sessão. */
export function InicioVendedor({ contexto }: { contexto: ContextoDemo }) {
  const hoje = agora();
  const eu = pessoa(contexto.pessoaId) ?? VENDEDORES[0];
  if (!eu) return null;
  const meuDia = desempenhoDe(eu);
  const nestaLoja = desempenhoDe(eu, contexto.loja);
  const loja = resumoDaLoja(contexto.loja);
  const turno = eu.turnos[contexto.loja];
  const pct = eu.metaDia > 0 ? (meuDia.vendido / eu.metaDia) * 100 : 0;
  const falta = Math.max(0, eu.metaDia - meuDia.vendido);
  const ultimas = vendasVisiveis(contexto).slice(-3).reverse();
  const outrasLojas = eu.lojas.filter((l) => l !== contexto.loja);
  // Vendedor em duas lojas: se o turno daqui acabou e o da outra loja está valendo, sugere a troca.
  const agoraMin = minutosEmSaoPaulo(hoje);
  const dentro = (t?: readonly [number, number]) => t !== undefined && agoraMin >= t[0] && agoraMin < t[1];
  const lojaDoTurno = !dentro(turno) ? outrasLojas.find((l) => dentro(eu.turnos[l])) : undefined;
  const turnoDela = lojaDoTurno ? eu.turnos[lojaDoTurno] : undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <section className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-navegacao via-navegacao-2 to-[#0b3b3a] p-5 text-white shadow-cartao sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-destaque/10 blur-2xl" />
        <p className="text-sm text-slate-300">{diaDaSemanaEData(hoje)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{saudacao(hoje)}, {eu.nome.split(" ")[0]}!</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300">
          <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden className="size-4 text-destaque" /> {nomeDaLoja(contexto.loja)}</span>
          {turno && <span>Turno hoje: {hhmm(turno[0])} às {hhmm(turno[1])}</span>}
        </p>
        <div className="mt-5 flex items-center gap-5">
          <div className="rounded-full bg-white p-1.5"><Medidor percentual={pct} rotulo="Meta do dia" detalhe="da meta" tamanho={104} /></div>
          <div className="min-w-0">
            <p className="text-sm text-slate-300">Minhas vendas hoje</p>
            <p className="text-3xl font-bold tracking-tight">{brl(meuDia.vendido)}</p>
            <p className="mt-1 text-sm text-slate-300">{falta > 0 ? `Faltam ${brl(falta)} para a meta de ${brl(eu.metaDia)}` : `Meta de ${brl(eu.metaDia)} batida!`}</p>
          </div>
        </div>
        <BotaoLink href="/demo/vender" tamanho="lg" className="mt-5 w-full bg-destaque text-navegacao shadow-none hover:bg-teal-300 sm:w-auto">
          <Plus aria-hidden className="size-5" /> Nova venda
        </BotaoLink>
      </section>

      {lojaDoTurno && turnoDela && turno && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-blue-200 bg-info-clara px-4 py-3 text-sm text-blue-950">
          <p className="flex items-start gap-2"><Clock aria-hidden className="mt-0.5 size-4 shrink-0" /><span>Seu turno em {nomeDaLoja(contexto.loja)} terminou às {hhmm(turno[1])}. Agora você está escalada na <strong>{nomeDaLoja(lojaDoTurno)}</strong> ({hhmm(turnoDela[0])} às {hhmm(turnoDela[1])}).</span></p>
          <a href={`/demo/loja/usar?l=${lojaDoTurno}&voltar=/demo`} className="inline-flex min-h-10 items-center rounded-botao bg-info px-3 text-sm font-semibold text-white hover:opacity-90">Trocar para {nomeDaLoja(lojaDoTurno)}</a>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ATALHOS.map((a) => (
          <Link key={a.titulo} href={a.href} className="group flex items-center gap-3 rounded-cartao border border-borda bg-white p-3 shadow-cartao transition hover:-translate-y-0.5 hover:border-acao/40 lg:block lg:p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-acao-clara text-acao transition group-hover:bg-acao group-hover:text-white"><a.icone aria-hidden className="size-5" /></span>
            <span className="block min-w-0 lg:mt-3">
              <span className="block text-sm font-semibold leading-5 lg:text-base">{a.titulo}</span>
              <span className="block truncate text-xs text-suave">{a.sub}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Minha produção hoje" subtitulo="Cada item conta uma vez; telecom só depois da confirmação da operadora">
          <ul className="grid grid-cols-3 gap-2 text-center">
            {[["Aparelhos", meuDia.aparelhos], ["Acessórios", meuDia.acessorios], ["Chips", meuDia.chips], ["Ativações", meuDia.ativacoes], ["Portabilidades", meuDia.portabilidades], ["Recargas", meuDia.recargas]].map(([rotulo, valor]) => (
              <li key={rotulo} className="rounded-xl bg-fundo px-2 py-3">
                <p className="text-2xl font-bold tracking-tight">{valor}</p>
                <p className="truncate text-xs text-suave">{rotulo}</p>
              </li>
            ))}
          </ul>
        </Cartao>

        <Cartao titulo="Onde vendi hoje" subtitulo="Cada venda fica com a loja em que foi feita" icone={Store}>
          <ul className="space-y-2">
            {eu.lojas.map((codigo) => {
              const daLoja = meuDia.porLoja.find((l) => l.loja === codigo);
              return (
                <li key={codigo} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${codigo === contexto.loja ? "border-acao/40 bg-acao-clara/50" : "border-borda"}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{nomeDaLoja(codigo)}</span>
                    <span className="block text-xs text-suave">{daLoja ? `${daLoja.vendas} ${daLoja.vendas === 1 ? "venda" : "vendas"}` : "Nenhuma venda hoje"}{codigo === contexto.loja ? " · loja da sessão" : ""}</span>
                  </span>
                  <span className="numeros text-sm font-semibold">{brl(daLoja?.vendido ?? 0)}</span>
                </li>
              );
            })}
          </ul>
          {outrasLojas.length > 0 && <p className="mt-3 text-xs text-suave">Vai trabalhar em outra loja? Troque no seletor “Loja da sessão”, no topo. Você só vende e consulta a loja escolhida.</p>}
        </Cartao>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo={`Resumo de ${nomeDaLoja(contexto.loja)}`} subtitulo="Total da loja. Os números de cada colega ficam só com a gestão.">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="numeros whitespace-nowrap text-2xl font-bold tracking-tight">{brl(loja.faturamento)}</p>
            <Selo tom={loja.faturamento >= loja.meta ? "sucesso" : "info"} ponto>{percentual(loja.meta > 0 ? loja.faturamento / loja.meta : 0)} da meta da loja</Selo>
          </div>
          <p className="mt-1 text-sm text-suave">{loja.vendas} vendas hoje · minha parte nesta loja: {brl(nestaLoja.vendido)}</p>
        </Cartao>
        <CartaoAvisos alertas={alertasDoEscopo(contexto)} limite={4} />
      </div>

      <Cartao titulo="Minhas últimas vendas nesta loja" className="mt-4" acao={<Link href="/demo/vendas" className="inline-flex items-center gap-1 text-sm font-semibold text-acao hover:underline">Ver todas <ArrowRight aria-hidden className="size-4" /></Link>}>
        {ultimas.length === 0 ? <p className="text-sm text-suave">Nenhuma venda sua nesta loja hoje ainda.</p> : (
          <ul className="divide-y divide-borda">
            {ultimas.map((v) => (
              <li key={v.numero} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{v.itens.map((i) => i.nome).join(" + ")}</span>
                  <span className="block text-xs text-suave">{v.numero} · {v.hora} · {v.cliente ?? "Cliente não identificado"}</span>
                </span>
                <span className="numeros shrink-0 font-semibold">{brl(v.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}

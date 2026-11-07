import { ArrowDownRight, ArrowUpRight, CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { iniciais, variacao as textoVariacao } from "../lib/formato";
import { Sparkline } from "./graficos";

// Componentes visuais básicos (docs/08: KpiCard, Badge, EmptyState, NoPermissionState...).
// Todos funcionam no servidor; os interativos ficam em arquivos com "use client".

export function Cartao({ titulo, subtitulo, acao, icone: IconeCartao, children, className = "", id, corpo }: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  acao?: ReactNode;
  icone?: LucideIcon;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Classes do corpo; por padrão, espaçamento interno do cartão. */
  corpo?: string;
}) {
  const espaco = corpo ?? (titulo || acao ? "px-4 pb-4 pt-3 sm:px-5 sm:pb-5" : "p-4 sm:p-5");
  return (
    <section id={id} className={`min-w-0 rounded-cartao border border-borda bg-superficie shadow-cartao ${className}`}>
      {(titulo || acao) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="flex min-w-0 items-start gap-3">
            {IconeCartao && (
              <span className="grid size-9 shrink-0 place-items-center rounded-botao bg-acao-clara text-acao">
                <IconeCartao aria-hidden className="size-[18px]" />
              </span>
            )}
            <div className="min-w-0">
              {titulo && <h2 className="text-[15px] font-semibold leading-6 tracking-tight">{titulo}</h2>}
              {subtitulo && <p className="text-sm text-suave">{subtitulo}</p>}
            </div>
          </div>
          {acao && <div className="shrink-0">{acao}</div>}
        </header>
      )}
      <div className={espaco}>{children}</div>
    </section>
  );
}

const TONS = {
  neutro: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-info-clara text-blue-800 ring-blue-200",
  sucesso: "bg-sucesso-clara text-emerald-800 ring-emerald-200",
  aviso: "bg-aviso-clara text-amber-900 ring-amber-200",
  perigo: "bg-perigo-clara text-red-800 ring-red-200",
  marca: "bg-acao-clara text-acao-escura ring-teal-200",
} as const;

const PONTOS = {
  neutro: "bg-slate-400",
  info: "bg-info",
  sucesso: "bg-sucesso",
  aviso: "bg-amber-500",
  perigo: "bg-perigo",
  marca: "bg-acao",
} as const;

export type Tom = keyof typeof TONS;

export function Selo({ tom = "neutro", children, ponto = false, className = "" }: { tom?: Tom; children: ReactNode; ponto?: boolean; className?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONS[tom]} ${className}`}>
      {ponto && <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${PONTOS[tom]}`} />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

const BOTOES = {
  primario: "bg-acao text-white shadow-sm hover:bg-acao-escura",
  secundario: "border border-borda bg-white text-texto shadow-sm hover:border-borda-forte hover:bg-slate-50",
  fantasma: "text-acao hover:bg-acao-clara",
  perigo: "border border-red-200 bg-white text-perigo hover:bg-perigo-clara",
  escuro: "bg-navegacao text-white hover:bg-navegacao-3",
  claro: "bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/15",
} as const;

const TAMANHOS = {
  sm: "min-h-9 px-3 text-[13px]",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
} as const;

export type VarianteBotao = keyof typeof BOTOES;

export const classeBotao = (variante: VarianteBotao = "primario", tamanho: keyof typeof TAMANHOS = "md", extra = "") =>
  `inline-flex items-center justify-center gap-2 rounded-botao font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${TAMANHOS[tamanho]} ${BOTOES[variante]} ${extra}`;

export function Botao({ variante = "primario", tamanho = "md", className = "", ...props }: ComponentProps<"button"> & { variante?: VarianteBotao; tamanho?: keyof typeof TAMANHOS }) {
  return <button type="button" className={classeBotao(variante, tamanho, className)} {...props} />;
}

export function BotaoLink({ variante = "primario", tamanho = "md", className = "", ...props }: ComponentProps<typeof Link> & { variante?: VarianteBotao; tamanho?: keyof typeof TAMANHOS }) {
  return <Link className={classeBotao(variante, tamanho, className)} {...props} />;
}

const ICONES_AVISO: Record<Tom, LucideIcon> = {
  neutro: Info,
  info: Info,
  marca: Info,
  sucesso: CircleCheck,
  aviso: TriangleAlert,
  perigo: OctagonAlert,
};

const FUNDOS_AVISO: Record<Tom, string> = {
  neutro: "border-slate-200 bg-slate-50 text-slate-800",
  info: "border-blue-200 bg-info-clara text-blue-950",
  marca: "border-teal-200 bg-acao-clara text-teal-950",
  sucesso: "border-emerald-200 bg-sucesso-clara text-emerald-950",
  aviso: "border-amber-200 bg-aviso-clara text-amber-950",
  perigo: "border-red-200 bg-perigo-clara text-red-950",
};

export function Aviso({ tom = "info", titulo, children, className = "" }: { tom?: Tom; titulo?: ReactNode; children?: ReactNode; className?: string }) {
  const IconeAviso = ICONES_AVISO[tom];
  return (
    <div role="note" className={`flex gap-3 rounded-cartao border px-4 py-3 text-sm ${FUNDOS_AVISO[tom]} ${className}`}>
      <IconeAviso aria-hidden className="mt-0.5 size-[18px] shrink-0 opacity-80" />
      <div className="min-w-0">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className={titulo ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
    </div>
  );
}

export function TituloPagina({ titulo, subtitulo, sobretitulo, acao }: { titulo: string; subtitulo?: ReactNode; sobretitulo?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mb-6">
      <div className="min-w-0">
        {sobretitulo && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-acao">{sobretitulo}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-texto sm:text-[28px] sm:leading-9">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-suave">{subtitulo}</p>}
      </div>
      {acao && <div className="flex flex-wrap items-center gap-2">{acao}</div>}
    </div>
  );
}

/** Variação contra um período anterior. `bomQuandoSobe` decide a cor (ex.: desconto subir é ruim). */
export type Variacao = { fracao: number; referencia: string; bomQuandoSobe?: boolean };

export function SeloVariacao({ variacao }: { variacao: Variacao }) {
  const { fracao, referencia, bomQuandoSobe = true } = variacao;
  const neutro = Math.abs(fracao) < 0.0005;
  const bom = neutro ? null : fracao > 0 === bomQuandoSobe;
  const Seta = fracao >= 0 ? ArrowUpRight : ArrowDownRight;
  const cor = bom === null ? "text-suave" : bom ? "text-sucesso" : "text-perigo";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[13px] font-semibold ${cor}`}>
      {!neutro && <Seta aria-hidden className="size-4" />}
      {textoVariacao(fracao)}
      <span className="font-normal text-suave">&nbsp;{referencia}</span>
    </span>
  );
}

const TONS_INDICADOR = {
  neutro: "text-suave",
  bom: "text-sucesso",
  atencao: "text-aviso",
  ruim: "text-perigo",
} as const;

/** Bloco de indicador (KPI): rótulo, valor, variação e, se houver, a tendência recente. */
export function Indicador({ rotulo, valor, detalhe, tom = "neutro", icone: IconeIndicador, variacao, tendencia, className = "" }: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  tom?: keyof typeof TONS_INDICADOR;
  icone?: LucideIcon;
  variacao?: Variacao;
  tendencia?: readonly number[];
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col rounded-cartao border border-borda bg-superficie p-4 shadow-cartao ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-suave">{rotulo}</p>
        {IconeIndicador && (
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-acao-clara text-acao">
            <IconeIndicador aria-hidden className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-1 break-words text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">{valor}</p>
      {variacao && <div className="mt-1"><SeloVariacao variacao={variacao} /></div>}
      {detalhe && <p className={`mt-1 text-[13px] font-medium ${TONS_INDICADOR[tom]}`}>{detalhe}</p>}
      {tendencia && tendencia.length > 1 && (
        <div className="mt-auto pt-3">
          <Sparkline valores={tendencia} rotulo={`Tendência de ${rotulo.toLowerCase()}`} />
        </div>
      )}
    </div>
  );
}

/** Barra de progresso. Em "meta" a cor indica a situação; nas demais é só identidade. */
export function Progresso({ valor, rotulo, tom = "meta", grossura = "h-2" }: {
  valor: number;
  rotulo: string;
  tom?: "meta" | "marca" | "info" | "neutro";
  grossura?: string;
}) {
  const largura = Math.max(0, Math.min(100, valor));
  const cor =
    tom === "marca" ? "bg-serie-1"
      : tom === "info" ? "bg-serie-2"
        : tom === "neutro" ? "bg-slate-400"
          : valor >= 100 ? "bg-sucesso" : valor >= 80 ? "bg-serie-1" : "bg-amber-500";
  return (
    <div role="progressbar" aria-label={rotulo} aria-valuenow={Math.round(valor)} aria-valuemin={0} aria-valuemax={100} className={`w-full overflow-hidden rounded-full bg-slate-100 ${grossura}`}>
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${largura}%` }} />
    </div>
  );
}

export function Tabela({ colunas, children, legenda, minimo = "min-w-[34rem]", alinharDireita = [] }: {
  colunas: string[];
  children: ReactNode;
  legenda: string;
  minimo?: string;
  alinharDireita?: number[];
}) {
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className={`w-full text-left text-sm ${minimo}`}>
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="border-y border-borda bg-slate-50/70 text-xs font-semibold uppercase tracking-wide text-suave">
            {colunas.map((c, i) => (
              <th key={c} scope="col" className={`px-4 py-2.5 font-semibold sm:px-5 ${alinharDireita.includes(i) ? "text-right" : ""}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">{children}</tbody>
      </table>
    </div>
  );
}

export function Celula({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle sm:px-5 ${className}`}>{children}</td>;
}

export function EstadoVazio({ titulo, children, icone: IconeVazio = Info, acao }: { titulo: string; children?: ReactNode; icone?: LucideIcon; acao?: ReactNode }) {
  return (
    <div className="rounded-cartao border border-dashed border-borda-forte bg-white/60 px-6 py-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-slate-100 text-suave">
        <IconeVazio aria-hidden className="size-5" />
      </span>
      <p className="mt-3 font-semibold">{titulo}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-suave">{children}</div>}
      {acao && <div className="mt-4 flex justify-center">{acao}</div>}
    </div>
  );
}

const CORES_AVATAR = ["bg-teal-100 text-teal-800", "bg-blue-100 text-blue-800", "bg-orange-100 text-orange-800", "bg-violet-100 text-violet-800", "bg-amber-100 text-amber-900", "bg-pink-100 text-pink-800"];

export function Avatar({ nome, tamanho = "size-9 text-sm", className = "" }: { nome: string; tamanho?: string; className?: string }) {
  const indice = [...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES_AVATAR.length;
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-semibold ${CORES_AVATAR[indice]} ${tamanho} ${className}`}>
      {iniciais(nome)}
    </span>
  );
}

/** Etapas de um fluxo (OS, importação, venda). `atual` começa em 0. */
export function Etapas({ etapas, atual, rotulo }: { etapas: readonly string[]; atual: number; rotulo: string }) {
  return (
    <ol aria-label={rotulo} className="flex w-full items-center">
      {etapas.map((etapa, i) => {
        const feita = i < atual;
        const corrente = i === atual;
        return (
          <li key={etapa} className="flex min-w-0 flex-1 items-center last:flex-none" aria-current={corrente ? "step" : undefined}>
            <span
              title={etapa}
              className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${feita ? "bg-acao text-white" : corrente ? "bg-white text-acao ring-2 ring-acao" : "bg-slate-100 text-suave"}`}
            >
              {feita ? "✓" : i + 1}
              <span className="sr-only">{` ${etapa}${feita ? " (feita)" : corrente ? " (atual)" : ""}`}</span>
            </span>
            {i < etapas.length - 1 && <span aria-hidden className={`mx-1 h-0.5 flex-1 rounded-full ${feita ? "bg-acao" : "bg-slate-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Lista de pares rótulo/valor (resumos e comprovantes). */
export function ListaDados({ itens, className = "" }: { itens: readonly (readonly [ReactNode, ReactNode])[]; className?: string }) {
  return (
    <dl className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm ${className}`}>
      {itens.map(([rotulo, valor], i) => (
        <div key={i} className="contents">
          <dt className="text-suave">{rotulo}</dt>
          <dd className="numeros text-right font-medium">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Filtro em botões (links): funciona sem JavaScript e o endereço pode ser compartilhado. */
export function FiltroSegmentado({ opcoes, rotulo }: { opcoes: readonly { href: string; rotulo: string; ativo: boolean; contagem?: number }[]; rotulo: string }) {
  return (
    <nav aria-label={rotulo} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-1 rounded-xl bg-slate-100 p-1">
        {opcoes.map((o) => (
          <li key={o.href}>
            <Link
              href={o.href}
              scroll={false}
              aria-current={o.ativo ? "true" : undefined}
              className={`flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-[13px] font-semibold transition ${o.ativo ? "bg-white text-texto shadow-sm" : "text-suave hover:text-texto"}`}
            >
              {o.rotulo}
              {o.contagem !== undefined && <span className={`numeros rounded-full px-1.5 text-[11px] ${o.ativo ? "bg-acao-clara text-acao-escura" : "bg-white/70"}`}>{o.contagem}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Campo de busca que envia por GET (funciona sem JavaScript). */
export function FormBusca({ acao, nome = "busca", valor, rotulo, dica, ocultos = {} }: {
  acao: string;
  nome?: string;
  valor?: string;
  rotulo: string;
  dica: string;
  ocultos?: Record<string, string | undefined>;
}) {
  return (
    <form action={acao} method="get" role="search" className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
      {Object.entries(ocultos).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="sr-only" htmlFor={`campo-${nome}`}>{rotulo}</label>
      <input id={`campo-${nome}`} name={nome} defaultValue={valor} placeholder={dica} autoComplete="off" className="min-h-10 min-w-0 flex-1 rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" />
      <button type="submit" className={classeBotao("secundario", "sm", "min-h-10")}>Buscar</button>
    </form>
  );
}

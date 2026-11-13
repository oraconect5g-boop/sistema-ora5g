import type { ReactNode } from "react";

import { CamadaDicas } from "./DicasGrafico";
import { escala, escalaComPiso, larguraMinimaDosRotulos, mostrarRotulo, trechosComValor, type EncaixeDosRotulos } from "./escala";

export { escala, mostrarRotulo };

// Gráficos sem biblioteca externa: HTML + SVG desenhados no servidor, leves e acessíveis.
// Regras (guia de visualização): marcas finas, grade discreta, uma só escala por gráfico,
// cor segue a entidade, texto nunca na cor da série, legenda a partir de 2 séries, e todo
// gráfico tem a "tabela" equivalente (TabelaDoGrafico) para quem não enxerga as cores.

export type SerieCor = 1 | 2 | 3 | 4 | 5 | 6;
/**
 * Cor de uma marca: uma série da paleta ou o cinza neutro "comparacao", que não é identidade de
 * série: serve ao período anterior (ênfase no atual) e à parte de um todo que ficou fora da conta.
 */
export type CorDaLinha = SerieCor | "comparacao";

const FUNDO: Record<CorDaLinha, string> = {
  1: "bg-serie-1", 2: "bg-serie-2", 3: "bg-serie-3", 4: "bg-serie-4", 5: "bg-serie-5", 6: "bg-serie-6", comparacao: "bg-serie-comparacao",
};
const COR_CSS: Record<CorDaLinha, string> = {
  1: "var(--color-serie-1)", 2: "var(--color-serie-2)", 3: "var(--color-serie-3)", 4: "var(--color-serie-4)", 5: "var(--color-serie-5)", 6: "var(--color-serie-6)",
  comparacao: "var(--color-serie-comparacao)",
};
const FUNDO_SUAVE: Record<SerieCor, string> = {
  1: "bg-serie-1/40", 2: "bg-serie-2/40", 3: "bg-serie-3/40", 4: "bg-serie-4/40", 5: "bg-serie-5/40", 6: "bg-serie-6/40",
};
const TRACO: Record<CorDaLinha, string> = {
  1: "stroke-serie-1", 2: "stroke-serie-2", 3: "stroke-serie-3", 4: "stroke-serie-4", 5: "stroke-serie-5", 6: "stroke-serie-6", comparacao: "stroke-serie-comparacao",
};
// Texto dentro de um bloco colorido: branco, ou quase preto nos tons claros (amarelo, rosa e o cinza
// neutro, em que o branco só chega a 3:1).
const TEXTO_SOBRE: Record<CorDaLinha, string> = {
  1: "text-white", 2: "text-white", 3: "text-white", 4: "text-white", 5: "text-texto", 6: "text-texto", comparacao: "text-texto",
};

const pct = (valor: number, topo: number) => (topo > 0 ? Math.max(0, Math.min(100, (valor / topo) * 100)) : 0);
/** Altura (%) de um valor no eixo que vai de `piso` a `topo`. O piso é zero, salvo na série com valor negativo. */
const posicao = (valor: number, piso: number, topo: number) => (topo > piso ? Math.max(0, Math.min(100, ((valor - piso) / (topo - piso)) * 100)) : 0);

export function Legenda({ itens, className = "" }: { itens: readonly { nome: string; serie: CorDaLinha; forma?: "bloco" | "linha" | "tracejada" }[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-suave ${className}`}>
      {itens.map((item) => (
        <li key={item.nome} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={item.forma === "tracejada" ? "h-0 w-[18px] border-t-2 border-dashed" : `${item.forma === "linha" ? "h-[3px] w-[18px] rounded-full" : "size-2.5 rounded-[3px]"} ${FUNDO[item.serie]}`}
            style={item.forma === "tracejada" ? { borderColor: COR_CSS[item.serie] } : undefined}
          />
          {item.nome}
        </li>
      ))}
    </ul>
  );
}

/** Versão em tabela de qualquer gráfico (acessibilidade e conferência dos números). */
export function TabelaDoGrafico({ colunas, linhas, titulo = "Ver dados em tabela" }: { colunas: readonly string[]; linhas: readonly (readonly ReactNode[])[]; titulo?: string }) {
  return (
    <details className="group mt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-semibold text-acao hover:underline">
        <span aria-hidden className="transition-transform group-open:rotate-90">›</span> {titulo}
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-borda">
        <table className="numeros w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-suave">
            <tr>{colunas.map((c) => <th key={c} scope="col" className="px-3 py-2 font-semibold">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((linha, i) => (
              <tr key={i}>{linha.map((celula, j) => <td key={j} className="px-3 py-1.5">{celula}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function EixoY({ marcas, topo, piso = 0, formatar, largura = "w-14" }: { marcas: number[]; topo: number; piso?: number; formatar: (v: number) => string; largura?: string }) {
  return (
    <div aria-hidden className={`numeros relative shrink-0 text-[11px] text-suave ${largura}`}>
      {marcas.map((m) => (
        <span key={m} className="absolute right-2 translate-y-1/2 whitespace-nowrap" style={{ bottom: `${posicao(m, piso, topo)}%` }}>{formatar(m)}</span>
      ))}
    </div>
  );
}

function Grade({ marcas, topo, piso = 0 }: { marcas: number[]; topo: number; piso?: number }) {
  return (
    <>
      {marcas.map((m) => (
        <div key={m} aria-hidden className={`absolute inset-x-0 h-px ${m === 0 ? "bg-eixo" : "bg-grade"}`} style={{ bottom: `${posicao(m, piso, topo)}%` }} />
      ))}
    </>
  );
}

// Largura do gráfico a partir da qual um rótulo do eixo X aparece. As classes ficam por extenso para
// o Tailwind gerá-las; a largura pedida sobe até o degrau seguinte.
const DEGRAUS_DO_ROTULO: readonly (readonly [number, string])[] = [
  [120, "hidden @min-[120px]:block"], [140, "hidden @min-[140px]:block"], [160, "hidden @min-[160px]:block"], [180, "hidden @min-[180px]:block"],
  [200, "hidden @min-[200px]:block"], [220, "hidden @min-[220px]:block"], [240, "hidden @min-[240px]:block"], [260, "hidden @min-[260px]:block"],
  [280, "hidden @min-[280px]:block"], [300, "hidden @min-[300px]:block"], [320, "hidden @min-[320px]:block"], [340, "hidden @min-[340px]:block"],
  [360, "hidden @min-[360px]:block"], [380, "hidden @min-[380px]:block"], [400, "hidden @min-[400px]:block"], [440, "hidden @min-[440px]:block"],
  [480, "hidden @min-[480px]:block"], [520, "hidden @min-[520px]:block"], [560, "hidden @min-[560px]:block"], [600, "hidden @min-[600px]:block"],
  [640, "hidden @min-[640px]:block"], [680, "hidden @min-[680px]:block"], [720, "hidden @min-[720px]:block"], [760, "hidden @min-[760px]:block"],
  [800, "hidden @min-[800px]:block"], [900, "hidden @min-[900px]:block"], [1000, "hidden @min-[1000px]:block"], [1100, "hidden @min-[1100px]:block"],
  [1200, "hidden @min-[1200px]:block"], [1400, "hidden @min-[1400px]:block"], [1600, "hidden @min-[1600px]:block"],
];
/** Abaixo disto nenhum gráfico é desenhado: o rótulo fica sempre à vista. */
const SEMPRE_A_VISTA = 100;
const classeDoRotulo = (minimo: number) => (minimo <= SEMPRE_A_VISTA ? "" : (DEGRAUS_DO_ROTULO.find(([largura]) => largura >= minimo)?.[1] ?? "hidden"));

/**
 * Rótulos do eixo X. Cada um só aparece quando o gráfico tem largura para ele não encostar no vizinho:
 * no celular ficam menos datas, no computador as de sempre. A conta é de `larguraMinimaDosRotulos`; quem
 * esconde e mostra é o CSS (consulta de contêiner), sem JavaScript. Navegador sem esse recurso mostra só
 * os rótulos que cabem em qualquer largura.
 */
function RotulosX({ rotulos, cada, encaixe }: { rotulos: readonly string[]; cada: number; encaixe: EncaixeDosRotulos }) {
  const total = rotulos.length;
  const minimos = larguraMinimaDosRotulos(rotulos, cada, encaixe);
  const nasBordas = encaixe === "pontos" && total > 1;
  return (
    <div aria-hidden className="@container relative ml-14 mt-1.5 h-4 text-[11px] text-suave">
      {rotulos.map((rotulo, i) => {
        const minimo = minimos[i] ?? null;
        if (minimo === null) return null;
        const esquerda = encaixe === "colunas" ? ((i + 0.5) / total) * 100 : total <= 1 ? 50 : (i / (total - 1)) * 100;
        const transform = nasBordas && i === 0 ? "none" : nasBordas && i === total - 1 ? "translateX(-100%)" : "translateX(-50%)";
        return (
          <span key={rotulo} className={`absolute whitespace-nowrap ${classeDoRotulo(minimo)}`} style={{ left: `${esquerda}%`, transform }}>
            {rotulo}
          </span>
        );
      })}
    </div>
  );
}

export type Ponto = { rotulo: string; valor: number; destaque?: boolean };

/** Colunas verticais de uma série (ex.: faturamento por dia). `destaque` realça uma coluna. */
export function Colunas({ dados, formatar, formatarEixo = formatar, nomeSerie, altura = 180, cadaRotulo = 1, serie = 1 }: {
  dados: readonly Ponto[];
  formatar: (valor: number) => string;
  formatarEixo?: (valor: number) => string;
  nomeSerie: string;
  altura?: number;
  cadaRotulo?: number;
  serie?: SerieCor;
}) {
  const { topo, marcas } = escala(Math.max(0, ...dados.map((d) => d.valor)));
  const temDestaque = dados.some((d) => d.destaque);
  return (
    <CamadaDicas className="pt-2">
      <div className="flex" style={{ height: altura }}>
        <EixoY marcas={marcas} topo={topo} formatar={formatarEixo} />
        <div className="relative min-w-0 flex-1">
          <Grade marcas={marcas} topo={topo} />
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {dados.map((d) => (
              <div
                key={d.rotulo}
                tabIndex={0}
                data-dica={`${d.rotulo}\n${nomeSerie}|${formatar(d.valor)}`}
                aria-label={`${d.rotulo}: ${formatar(d.valor)}`}
                className="group flex h-full min-w-0 flex-1 items-end justify-center rounded-sm focus-visible:bg-slate-100"
              >
                <div
                  className={`w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-70 ${temDestaque && !d.destaque ? FUNDO_SUAVE[serie] : FUNDO[serie]}`}
                  style={{ height: d.valor > 0 ? `max(2px, ${pct(d.valor, topo)}%)` : 0 }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <RotulosX rotulos={dados.map((d) => d.rotulo)} cada={cadaRotulo} encaixe="colunas" />
    </CamadaDicas>
  );
}

/**
 * Série de uma linha. `tracejada` e a cor "comparacao" servem ao período anterior (ênfase: o atual na
 * cor da marca, o anterior em cinza). `ponto`: marca o último valor (padrão), o maior (com o valor numa
 * pílula, como nos prints de referência) ou nenhum. Um valor `null` é ponto sem valor (dia sem venda no
 * ticket médio): a linha se interrompe ali, em vez de descer a zero. Valor negativo desce abaixo do zero.
 */
export type SerieLinha = {
  nome: string;
  serie: CorDaLinha;
  valores: readonly (number | null)[];
  area?: boolean;
  tracejada?: boolean;
  ponto?: "ultimo" | "maximo" | "nenhum";
};

type Coordenada = readonly [number, number];

/** Curva suave (Catmull-Rom em Bézier) pelos pontos, sem passar do chão nem do teto do gráfico. */
export function caminhoSuave(pontos: readonly Coordenada[]): string {
  const [primeiro] = pontos;
  if (!primeiro) return "";
  const limite = (v: number) => Math.max(0, Math.min(100, v));
  let d = `M${primeiro[0]},${primeiro[1]}`;
  for (let i = 0; i < pontos.length - 1; i++) {
    const b = pontos[i] ?? primeiro;
    const c = pontos[i + 1] ?? b;
    const a = pontos[i - 1] ?? b;
    const e = pontos[i + 2] ?? c;
    const c1: Coordenada = [b[0] + (c[0] - a[0]) / 6, limite(b[1] + (c[1] - a[1]) / 6)];
    const c2: Coordenada = [c[0] - (e[0] - b[0]) / 6, limite(c[1] - (e[1] - b[1]) / 6)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${c[0]},${c[1]}`;
  }
  return d;
}

// Identificador estável do degradê da área (componente de servidor: sem useId).
const idDoDegrade = (series: readonly SerieLinha[]) =>
  `area-${[...series.map((s) => `${s.nome}${s.valores.join(",")}`).join("|")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;

/**
 * Linhas no tempo (1 a 3 séries, mesma unidade, um só eixo). `suave` desenha curvas. O eixo começa no
 * zero; só desce abaixo dele quando alguma série tem valor negativo, e a área vai sempre até a linha do zero.
 */
export function Linhas({ series, rotulosX, formatar, formatarEixo = formatar, formatarPonto = formatar, altura = 200, cadaRotulo = 1, suave = false, semValor = "—" }: {
  series: readonly SerieLinha[];
  rotulosX: readonly string[];
  formatar: (valor: number) => string;
  formatarEixo?: (valor: number) => string;
  /** Valor na pílula do maior ponto (ex.: "R$ 42 mil"). */
  formatarPonto?: (valor: number) => string;
  altura?: number;
  cadaRotulo?: number;
  suave?: boolean;
  /** O que a dica e o leitor de tela dizem no ponto sem valor (ex.: "sem venda"). */
  semValor?: string;
}) {
  const n = rotulosX.length;
  const comValor = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
  const { piso, topo, marcas } = escalaComPiso(Math.min(0, ...comValor), Math.max(0, ...comValor));
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - posicao(v, piso, topo);
  const zero = y(0);
  const texto = (v: number | null | undefined) => (v === null ? semValor : formatar(v ?? 0));
  const degrade = idDoDegrade(series);
  const comPilula = series.some((s) => s.ponto === "maximo");
  return (
    <CamadaDicas className={comPilula ? "pt-9" : "pt-2"}>
      {series.length > 1 && (
        <Legenda className={comPilula ? "-mt-7 mb-9" : "mb-3"} itens={series.map((s) => ({ nome: s.nome, serie: s.serie, forma: s.tracejada ? ("tracejada" as const) : ("linha" as const) }))} />
      )}
      <div className="flex" style={{ height: altura }}>
        <EixoY marcas={marcas} topo={topo} piso={piso} formatar={formatarEixo} />
        <div className="relative min-w-0 flex-1">
          <Grade marcas={marcas} topo={topo} piso={piso} />
          <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              {series.filter((s) => s.area).map((s, i) => (
                <linearGradient key={s.nome} id={`${degrade}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: COR_CSS[s.serie], stopOpacity: 0.22 }} />
                  <stop offset="100%" style={{ stopColor: COR_CSS[s.serie], stopOpacity: 0 }} />
                </linearGradient>
              ))}
            </defs>
            {series.map((s) => {
              const indiceDaArea = series.filter((o) => o.area).indexOf(s);
              return (
                <g key={s.nome}>
                  {trechosComValor(s.valores).map((trecho) => {
                    const [primeiro, ultimo] = [trecho[0], trecho.at(-1)];
                    // Ponto sem vizinho não forma linha: ele é desenhado adiante, como ponto.
                    if (!primeiro || !ultimo || trecho.length < 2) return null;
                    const pontos = trecho.map((p): Coordenada => [x(p.indice), y(p.valor)]);
                    const linha = suave ? caminhoSuave(pontos) : `M${pontos.map(([a, b]) => `${a},${b}`).join(" L")}`;
                    return (
                      <g key={primeiro.indice}>
                        {s.area && <path d={`${linha} L${x(ultimo.indice)},${zero} L${x(primeiro.indice)},${zero} Z`} fill={`url(#${degrade}-${indiceDaArea})`} />}
                        <path
                          d={linha}
                          fill="none"
                          strokeWidth={s.tracejada ? 2 : 2.75}
                          strokeDasharray={s.tracejada ? "5 5" : undefined}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                          className={TRACO[s.serie]}
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
          {series.flatMap((s) =>
            trechosComValor(s.valores).map((trecho) => {
              const [sozinho] = trecho;
              if (!sozinho || trecho.length > 1) return null;
              return (
                <span
                  key={`${s.nome}-${sozinho.indice}`}
                  aria-hidden
                  className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${FUNDO[s.serie]}`}
                  style={{ left: `${x(sozinho.indice)}%`, top: `${y(sozinho.valor)}%` }}
                />
              );
            }),
          )}
          {series.map((s) => {
            const modo = s.ponto ?? "ultimo";
            const pontos = trechosComValor(s.valores).flat();
            // O maior é o primeiro que chega ao pico (em empate, o dia mais antigo), como antes.
            const maior = pontos.reduce<(typeof pontos)[number] | undefined>((m, p) => (!m || p.valor > m.valor ? p : m), undefined);
            const escolhido = modo === "nenhum" ? undefined : modo === "maximo" ? maior : pontos.at(-1);
            if (!escolhido) return null;
            const { indice, valor } = escolhido;
            const deslocamento = indice === 0 ? "0%" : indice === s.valores.length - 1 ? "-100%" : "-50%";
            return (
              <span key={s.nome} aria-hidden>
                {modo === "maximo" && (
                  <>
                    <span className="absolute border-l border-dashed" style={{ left: `${x(indice)}%`, top: `${y(valor)}%`, bottom: `${100 - zero}%`, borderColor: COR_CSS[s.serie] }} />
                    <span
                      className={`numeros absolute whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold shadow-sm ${FUNDO[s.serie]} ${TEXTO_SOBRE[s.serie]}`}
                      style={{ left: `${x(indice)}%`, top: `${y(valor)}%`, transform: `translate(${deslocamento}, calc(-100% - 10px))` }}
                    >
                      {formatarPonto(valor)}
                    </span>
                  </>
                )}
                <span
                  className={`absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-white ${FUNDO[s.serie]}`}
                  style={{ left: `${x(indice)}%`, top: `${y(valor)}%` }}
                />
              </span>
            );
          })}
          {rotulosX.map((rotulo, i) => {
            const esquerda = i === 0 ? 0 : (x(i - 1) + x(i)) / 2;
            const direita = i === n - 1 ? 100 : (x(i) + x(i + 1)) / 2;
            const largura = Math.max(0.0001, direita - esquerda);
            const dica = [rotulo, ...series.map((s) => `${s.nome}|${texto(s.valores[i])}`)].join("\n");
            return (
              <div
                key={rotulo}
                tabIndex={0}
                data-dica={dica}
                aria-label={`${rotulo}: ${series.map((s) => `${s.nome} ${texto(s.valores[i])}`).join(", ")}`}
                className="group absolute inset-y-0 focus-visible:outline-none"
                style={{ left: `${esquerda}%`, width: `${largura}%` }}
              >
                <span aria-hidden className="absolute inset-y-0 w-px bg-borda-forte opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" style={{ left: `${((x(i) - esquerda) / largura) * 100}%` }} />
              </div>
            );
          })}
        </div>
      </div>
      <RotulosX rotulos={rotulosX} cada={cadaRotulo} encaixe="pontos" />
    </CamadaDicas>
  );
}

export type Barra = { rotulo: string; valor: number; meta?: number; detalhe?: ReactNode; destaque?: boolean };

/** Ranking em barras horizontais, com marca opcional da meta (ex.: lojas, vendedores, produtos). */
export function BarrasHorizontais({ dados, formatar, nomeSerie, serie = 1, maximo, duasColunas = false }: {
  dados: readonly Barra[];
  formatar: (valor: number) => string;
  nomeSerie: string;
  serie?: SerieCor;
  maximo?: number;
  /** Em telas largas, divide a lista em duas colunas (rankings longos). */
  duasColunas?: boolean;
}) {
  const topo = maximo ?? Math.max(1, ...dados.map((d) => Math.max(d.valor, d.meta ?? 0)));
  const temDestaque = dados.some((d) => d.destaque);
  return (
    <CamadaDicas>
      <ul className={duasColunas ? "grid gap-x-10 gap-y-3 xl:grid-cols-2" : "space-y-3"}>
        {dados.map((d) => {
          const dica = [d.rotulo, `${nomeSerie}|${formatar(d.valor)}`, ...(d.meta !== undefined ? [`Meta|${formatar(d.meta)}`] : [])].join("\n");
          return (
            <li key={d.rotulo} tabIndex={0} data-dica={dica} className="rounded-md outline-offset-4">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className={`min-w-0 truncate ${d.destaque ? "font-semibold" : ""}`}>{d.rotulo}</span>
                <span className="numeros shrink-0 font-semibold">{formatar(d.valor)}{d.detalhe && <span className="ml-1.5 text-xs font-medium text-suave">{d.detalhe}</span>}</span>
              </div>
              <div className="relative h-2.5 rounded-[3px] bg-grade">
                <div className={`h-full rounded-r-[4px] ${temDestaque && !d.destaque ? FUNDO_SUAVE[serie] : FUNDO[serie]}`} style={{ width: `${pct(d.valor, topo)}%` }} />
                {d.meta !== undefined && (
                  <span aria-hidden title="Meta" className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-texto/70" style={{ left: `calc(${pct(d.meta, topo)}% - 1px)` }} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </CamadaDicas>
  );
}

/** `serie: "comparacao"` (cinza neutro) é para a parte que ficou fora da conta, como o vendido sem custo gravado. */
export type Parte = { nome: string; valor: number; serie: CorDaLinha };

/** Partes de um todo (mix de vendas, meios de pagamento). Barra alta segmentada + lista com os valores. */
export function BarraSegmentada({ partes, formatar, rotulo }: { partes: readonly Parte[]; formatar: (valor: number) => string; rotulo: string }) {
  const total = partes.reduce((s, p) => s + Math.max(0, p.valor), 0);
  const fracao = (v: number) => (total > 0 ? v / total : 0);
  const porcento = (v: number) => `${(fracao(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <CamadaDicas>
      <div role="img" aria-label={`${rotulo}: ${partes.map((p) => `${p.nome} ${porcento(p.valor)}`).join(", ")}`} className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px]">
        {total === 0 && <div className="h-full w-full rounded-[4px] bg-grade" />}
        {partes.filter((p) => p.valor > 0).map((p) => (
          <div
            key={p.nome}
            data-dica={`${p.nome}\n${rotulo}|${formatar(p.valor)}\nParticipação|${porcento(p.valor)}`}
            className={`flex h-full min-w-0 items-center rounded-[4px] px-2 text-[11px] font-semibold ${FUNDO[p.serie]} ${TEXTO_SOBRE[p.serie]}`}
            style={{ width: `${fracao(p.valor) * 100}%` }}
          >
            {fracao(p.valor) >= 0.12 ? porcento(p.valor) : ""}
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {partes.map((p) => (
          <li key={p.nome} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2"><span aria-hidden className={`size-2.5 shrink-0 rounded-[3px] ${FUNDO[p.serie]}`} /><span className="truncate">{p.nome}</span></span>
            <span className="numeros shrink-0 text-suave"><strong className="font-semibold text-texto">{formatar(p.valor)}</strong> · {porcento(p.valor)}</span>
          </li>
        ))}
      </ul>
    </CamadaDicas>
  );
}

/** Medidor circular de meta (% atingido). A cor indica a situação; o número fica no centro. */
export function Medidor({ percentual, rotulo, detalhe, tamanho = 120 }: { percentual: number; rotulo: string; detalhe?: string; tamanho?: number }) {
  const raio = 50;
  const circunferencia = 2 * Math.PI * raio;
  const preenchido = Math.max(0, Math.min(1, percentual / 100));
  const cor = percentual >= 100 ? "stroke-sucesso" : percentual >= 80 ? "stroke-serie-1" : "stroke-amber-500";
  const trilho = percentual >= 100 ? "stroke-sucesso-clara" : percentual >= 80 ? "stroke-acao-clara" : "stroke-aviso-clara";
  // Ponta arredondada encosta no começo do anel perto de 100%: ali a ponta fica reta.
  const ponta = preenchido > 0.9 && preenchido < 1 ? "butt" : "round";
  return (
    <div role="img" aria-label={`${rotulo}: ${Math.round(percentual)}%${detalhe ? `, ${detalhe}` : ""}`} className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg aria-hidden viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={raio} fill="none" strokeWidth={11} className={trilho} />
        <circle cx="60" cy="60" r={raio} fill="none" strokeWidth={11} strokeLinecap={ponta} className={cor} strokeDasharray={circunferencia} strokeDashoffset={circunferencia * (1 - preenchido)} />
      </svg>
      <div aria-hidden className="absolute inset-0 grid place-content-center text-center text-texto">
        <span className={`${tamanho >= 110 ? "text-2xl" : "text-lg"} font-extrabold leading-none tracking-tight`}>{Math.round(percentual)}%</span>
        {detalhe && <span className="mt-1 text-[11px] font-medium text-suave">{detalhe}</span>}
      </div>
    </div>
  );
}

/** Mini tendência para os indicadores: linha discreta e o último ponto na cor da marca. */
export function Sparkline({ valores, rotulo }: { valores: readonly number[]; rotulo: string }) {
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const faixa = max - min || 1;
  const n = valores.length;
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 90 - ((v - min) / faixa) * 80;
  const ultimo = valores[n - 1] ?? 0;
  return (
    <div role="img" aria-label={rotulo} className="relative h-7 w-full">
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <polyline points={valores.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-slate-300" />
      </svg>
      <span aria-hidden className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-serie-1 ring-2 ring-white" style={{ left: `${x(n - 1)}%`, top: `${y(ultimo)}%` }} />
    </div>
  );
}

/** Entradas para cima e saídas para baixo a partir do zero (fluxo de caixa), na mesma escala. */
export function ColunasDivergentes({ dados, formatar, formatarEixo = formatar, nomes, altura = 200, cadaRotulo = 1, rotuloSaldo = "Saldo do dia" }: {
  dados: readonly { rotulo: string; entrada: number; saida: number }[];
  formatar: (valor: number) => string;
  formatarEixo?: (valor: number) => string;
  nomes: readonly [string, string];
  altura?: number;
  cadaRotulo?: number;
  /** Rótulo da diferença na dica (ex.: "Líquido do dia"; "saldo" pode ser lido como saldo de banco). */
  rotuloSaldo?: string;
}) {
  const { topo, marcas } = escala(Math.max(0, ...dados.flatMap((d) => [d.entrada, d.saida])), 2);
  const meia = (v: number) => (topo > 0 ? (v / topo) * 50 : 0);
  return (
    <CamadaDicas className="pt-2">
      <Legenda className="mb-3" itens={[{ nome: nomes[0], serie: 1 }, { nome: nomes[1], serie: 3 }]} />
      <div className="flex" style={{ height: altura }}>
        <div aria-hidden className="numeros relative w-14 shrink-0 text-[11px] text-suave">
          {[...marcas.slice(1).reverse().map((m) => m), 0, ...marcas.slice(1).map((m) => -m)].map((m) => (
            <span key={m} className="absolute right-2 translate-y-1/2 whitespace-nowrap" style={{ bottom: `${50 + meia(m)}%` }}>{m < 0 ? `−${formatarEixo(-m)}` : formatarEixo(m)}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {[...marcas.slice(1).map((m) => m), ...marcas.slice(1).map((m) => -m)].map((m) => (
            <div key={m} aria-hidden className="absolute inset-x-0 h-px bg-grade" style={{ bottom: `${50 + meia(m)}%` }} />
          ))}
          <div aria-hidden className="absolute inset-x-0 h-px bg-eixo" style={{ bottom: "50%" }} />
          <div className="absolute inset-0 flex gap-[2px]">
            {dados.map((d) => (
              <div
                key={d.rotulo}
                tabIndex={0}
                data-dica={`${d.rotulo}\n${nomes[0]}|${formatar(d.entrada)}\n${nomes[1]}|${formatar(d.saida)}\n${rotuloSaldo}|${d.entrada - d.saida < 0 ? "−" : ""}${formatar(Math.abs(d.entrada - d.saida))}`}
                aria-label={`${d.rotulo}: ${nomes[0]} ${formatar(d.entrada)}, ${nomes[1]} ${formatar(d.saida)}`}
                className="group relative h-full min-w-0 flex-1 rounded-sm focus-visible:bg-slate-100"
              >
                <div className="absolute inset-x-0 flex justify-center" style={{ bottom: "50%", height: `${meia(d.entrada)}%` }}>
                  <div className="h-full w-full max-w-6 rounded-t-[4px] bg-serie-1 group-hover:opacity-70" />
                </div>
                <div className="absolute inset-x-0 flex justify-center" style={{ top: "50%", height: `${meia(d.saida)}%` }}>
                  <div className="h-full w-full max-w-6 rounded-b-[4px] bg-serie-3 group-hover:opacity-70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <RotulosX rotulos={dados.map((d) => d.rotulo)} cada={cadaRotulo} encaixe="colunas" />
    </CamadaDicas>
  );
}

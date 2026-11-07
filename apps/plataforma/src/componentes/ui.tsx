import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Componentes visuais básicos (docs/08: KpiCard, Badge, EmptyState, NoPermissionState...).

export function Cartao({ titulo, subtitulo, acao, children, className = "" }: {
  titulo?: string;
  subtitulo?: string;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-cartao border border-borda bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(titulo || acao) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h2 className="text-base font-semibold">{titulo}</h2>}
            {subtitulo && <p className="text-sm text-suave">{subtitulo}</p>}
          </div>
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

export function Indicador({ rotulo, valor, detalhe, tom = "neutro" }: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  tom?: "neutro" | "bom" | "atencao";
}) {
  const cor = tom === "bom" ? "text-sucesso" : tom === "atencao" ? "text-aviso" : "text-suave";
  return (
    <div className="min-w-0 rounded-cartao border border-borda bg-white p-4 shadow-sm">
      <p className="text-sm text-suave">{rotulo}</p>
      <p className="mt-1 break-words text-xl font-bold tracking-tight sm:text-2xl">{valor}</p>
      {detalhe && <p className={`mt-1 text-sm font-medium ${cor}`}>{detalhe}</p>}
    </div>
  );
}

const TONS = {
  neutro: "bg-slate-100 text-slate-700",
  info: "bg-blue-50 text-blue-800",
  sucesso: "bg-emerald-50 text-emerald-800",
  aviso: "bg-amber-50 text-amber-900",
  perigo: "bg-red-50 text-red-800",
} as const;

export type Tom = keyof typeof TONS;

export function Selo({ tom = "neutro", children }: { tom?: Tom; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONS[tom]}`}>{children}</span>;
}

const BOTOES = {
  primario: "bg-acao text-white hover:bg-acao-escura",
  secundario: "border border-borda bg-white text-texto hover:bg-slate-50",
  perigo: "border border-red-200 bg-white text-perigo hover:bg-red-50",
} as const;

const classeBotao = (variante: keyof typeof BOTOES, extra = "") =>
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-botao px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${BOTOES[variante]} ${extra}`;

export function Botao({ variante = "primario", className = "", ...props }: ComponentProps<"button"> & { variante?: keyof typeof BOTOES }) {
  return <button type="button" className={classeBotao(variante, className)} {...props} />;
}

export function BotaoLink({ variante = "primario", className = "", ...props }: ComponentProps<typeof Link> & { variante?: keyof typeof BOTOES }) {
  return <Link className={classeBotao(variante, className)} {...props} />;
}

export function Progresso({ valor, rotulo }: { valor: number; rotulo: string }) {
  const largura = Math.max(0, Math.min(100, valor));
  const cor = valor >= 100 ? "bg-sucesso" : valor >= 80 ? "bg-acao" : "bg-aviso";
  return (
    <div role="progressbar" aria-label={rotulo} aria-valuenow={Math.round(valor)} aria-valuemin={0} aria-valuemax={100} className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${largura}%` }} />
    </div>
  );
}

export function Aviso({ tom = "info", titulo, children }: { tom?: Tom; titulo?: string; children: ReactNode }) {
  return (
    <div role="note" className={`rounded-cartao px-4 py-3 text-sm ${TONS[tom]}`}>
      {titulo && <p className="font-semibold">{titulo}</p>}
      <div>{children}</div>
    </div>
  );
}

export function TituloPagina({ titulo, subtitulo, acao }: { titulo: string; subtitulo?: string; acao?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="text-sm text-suave">{subtitulo}</p>}
      </div>
      {acao}
    </div>
  );
}

export function Tabela({ colunas, children, legenda }: { colunas: string[]; children: ReactNode; legenda: string }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="border-b border-borda text-xs uppercase tracking-wide text-suave">
            {colunas.map((c) => (
              <th key={c} scope="col" className="px-4 py-2 font-semibold sm:px-3">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">{children}</tbody>
      </table>
    </div>
  );
}

export function Celula({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top sm:px-3 ${className}`}>{children}</td>;
}

export function EstadoVazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-cartao border border-dashed border-borda bg-white p-8 text-center">
      <p className="font-semibold">{titulo}</p>
      {children && <div className="mt-1 text-sm text-suave">{children}</div>}
    </div>
  );
}

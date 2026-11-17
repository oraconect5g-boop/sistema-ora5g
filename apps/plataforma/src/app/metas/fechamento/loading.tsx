import { MarcaDeEsqueleto } from "../../../componentes/ancora";

// Esqueleto do fechamento do bônus: título, filtros do mês e da loja, os indicadores e as linhas.
export default function CarregandoFechamentoDoBonus() {
  return (
    <div aria-busy="true" aria-label="Carregando o fechamento do bônus" className="mx-auto max-w-5xl animate-pulse px-4 pt-6 sm:px-6">
      <MarcaDeEsqueleto />
      <div className="h-4 w-40 rounded bg-slate-200" />
      <div className="mt-3 h-8 w-64 max-w-full rounded-lg bg-slate-200" />
      <div className="mt-5 flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 w-24 rounded-full bg-slate-200/80" />)}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-cartao bg-slate-200/70" />)}</div>
      <div className="mt-4 h-[28rem] rounded-cartao bg-slate-200/70" />
    </div>
  );
}

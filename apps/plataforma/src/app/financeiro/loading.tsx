import { MarcaDeEsqueleto } from "../../componentes/ancora";

// Enquanto o financeiro soma o período no banco: esqueleto no lugar do conteúdo (sem número algum).
export default function CarregandoFinanceiro() {
  return (
    <div aria-busy="true" aria-label="Carregando o financeiro" className="mx-auto max-w-6xl animate-pulse px-4 pt-6 sm:px-6">
      <MarcaDeEsqueleto />
      <div className="h-4 w-40 rounded bg-slate-200" />
      <div className="mt-3 h-8 w-56 max-w-full rounded-lg bg-slate-200" />
      <div className="mt-5 flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 w-20 rounded-full bg-slate-200/80" />)}</div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-32 rounded-cartao bg-slate-200/80" />)}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="h-72 rounded-cartao bg-slate-200/70 xl:col-span-2" />
        <div className="h-72 rounded-cartao bg-slate-200/70" />
      </div>
    </div>
  );
}

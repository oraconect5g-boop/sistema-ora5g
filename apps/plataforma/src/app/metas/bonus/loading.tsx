import { MarcaDeEsqueleto } from "../../../componentes/ancora";

// Esqueleto das regras do bônus: título, filtro do mês, o formulário das quatro medidas e o histórico.
export default function CarregandoRegrasDoBonus() {
  return (
    <div aria-busy="true" aria-label="Carregando as regras do bônus" className="mx-auto max-w-5xl animate-pulse px-4 pt-6 sm:px-6">
      <MarcaDeEsqueleto />
      <div className="h-4 w-40 rounded bg-slate-200" />
      <div className="mt-3 h-8 w-56 max-w-full rounded-lg bg-slate-200" />
      <div className="mt-5 flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 w-24 rounded-full bg-slate-200/80" />)}</div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="h-[32rem] rounded-cartao bg-slate-200/70" />
        <div className="h-64 rounded-cartao bg-slate-200/70" />
      </div>
    </div>
  );
}

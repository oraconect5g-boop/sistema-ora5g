// Esqueleto do extrato do bônus: título, filtros, o resumo do bônus e a lista dos fatos do mês.
export default function CarregandoExtrato() {
  return (
    <div aria-busy="true" aria-label="Carregando o extrato do bônus" className="mx-auto max-w-5xl animate-pulse px-4 pt-6 sm:px-6">
      <div className="h-4 w-40 rounded bg-slate-200" />
      <div className="mt-3 h-8 w-64 max-w-full rounded-lg bg-slate-200" />
      <div className="mt-5 flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 w-24 rounded-full bg-slate-200/80" />)}</div>
      <div className="mt-5 h-56 rounded-cartao bg-slate-200/70" />
      <div className="mt-4 h-96 rounded-cartao bg-slate-200/70" />
    </div>
  );
}

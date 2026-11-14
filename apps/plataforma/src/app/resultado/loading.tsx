// Esqueleto do resultado do mês, mostrado enquanto o banco soma o mês: título, mês e lojas, quatro
// indicadores, o demonstrativo e os gráficos, para o conteúdo não pular quando chegar.
export default function CarregandoResultado() {
  return (
    <div aria-busy="true" aria-label="Carregando o resultado do mês" className="mx-auto max-w-6xl animate-pulse px-4 pt-6 sm:px-6">
      <div className="h-4 w-32 rounded bg-slate-200" />
      <div className="mt-3 h-8 w-64 max-w-full rounded-lg bg-slate-200" />
      <div className="mt-5 h-10 w-72 max-w-full rounded-full bg-slate-200/80" />
      <div className="mt-3 flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 w-28 rounded-full bg-slate-200/80" />)}</div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-cartao bg-slate-200/80" />)}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <div className="h-[34rem] rounded-cartao bg-slate-200/70 xl:col-span-3" />
        <div className="h-[34rem] rounded-cartao bg-slate-200/70 xl:col-span-2" />
      </div>
    </div>
  );
}

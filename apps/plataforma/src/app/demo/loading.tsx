// Enquanto a tela carrega: esqueleto no lugar do conteúdo (o menu continua visível).
export default function Carregando() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="animate-pulse">
      <div className="h-4 w-32 rounded bg-slate-200" />
      <div className="mt-3 h-8 w-72 max-w-full rounded-lg bg-slate-200" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-cartao bg-slate-200/80" />)}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="h-72 rounded-cartao bg-slate-200/70 xl:col-span-2" />
        <div className="h-72 rounded-cartao bg-slate-200/70" />
      </div>
    </div>
  );
}

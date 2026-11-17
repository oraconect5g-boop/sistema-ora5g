import { MarcaDeEsqueleto } from "../../componentes/ancora";

// Esqueleto das metas, mostrado enquanto o servidor confere a permissão e soma o mês. Tem o desenho da
// tela da gestão (título, filtro do mês, quatro indicadores, ritmo e equipe) para o conteúdo não pular.
export default function CarregandoMetas() {
  return (
    <div aria-busy="true" aria-label="Carregando as metas" className="mx-auto max-w-6xl animate-pulse px-4 pt-6 sm:px-6">
      <MarcaDeEsqueleto />
      <div className="h-4 w-40 rounded bg-slate-200" />
      <div className="mt-3 h-8 w-56 max-w-full rounded-lg bg-slate-200" />
      <div className="mt-5 flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 w-24 rounded-full bg-slate-200/80" />)}</div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-cartao bg-slate-200/80" />)}
      </div>
      <div className="mt-4 h-64 rounded-cartao bg-slate-200/70" />
      <div className="mt-4 h-72 rounded-cartao bg-slate-200/70" />
    </div>
  );
}

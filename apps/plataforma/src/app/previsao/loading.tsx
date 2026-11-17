import { MarcaDeEsqueleto } from "../../componentes/ancora";

// Esqueleto da previsão de caixa, mostrado enquanto o banco lê os fatos: título, horizonte e lojas, o
// simulador, quatro indicadores e os gráficos, para o conteúdo não pular quando chegar.
export default function CarregandoPrevisao() {
  return (
    <div aria-busy="true" aria-label="Carregando a previsão de caixa" className="mx-auto max-w-6xl animate-pulse px-4 pt-6 sm:px-6">
      <MarcaDeEsqueleto />
      <div className="h-4 w-32 rounded bg-slate-200" />
      <div className="mt-3 h-8 w-64 max-w-full rounded-lg bg-slate-200" />
      <div className="mt-5 flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 w-28 rounded-full bg-slate-200/80" />)}</div>
      <div className="mt-4 h-32 rounded-cartao bg-slate-200/70" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-cartao bg-slate-200/80" />)}
      </div>
      <div className="mt-4 h-80 rounded-cartao bg-slate-200/70" />
    </div>
  );
}

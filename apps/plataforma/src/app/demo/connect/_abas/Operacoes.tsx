import { ArrowRightLeft, CircleCheck, CircleX, Hourglass, RefreshCw, Signal } from "lucide-react";

import { BarraSegmentada, BarrasHorizontais, TabelaDoGrafico } from "../../../../componentes/graficos";
import { Cartao, EstadoVazio, FiltroSegmentado, Indicador, Selo, type Tom } from "../../../../componentes/ui";
import { lojasVisiveis } from "../../../../demo/consultas";
import { nomeDaLoja, nomeDaPessoa, OPERACOES_CONNECT, type OperacaoConnect } from "../../../../demo/dados";
import { vePorVendedor } from "../../../../demo/perfis";
import type { ContextoDemo } from "../../../../demo/sessao";
import { brl, numero } from "../../../../lib/formato";

const tom = (s: OperacaoConnect["situacao"]): Tom => (s.startsWith("Confirmada") ? "sucesso" : s.startsWith("Falhou") ? "perigo" : "info");
export const FILTROS_OPERACOES = { todas: "Todas", aguardando: "Aguardando", falhou: "Falharam" } as const;
export type FiltroOperacoes = keyof typeof FILTROS_OPERACOES;
const FILTROS = FILTROS_OPERACOES;
type Filtro = FiltroOperacoes;

export function operacoesVisiveis(contexto: ContextoDemo) {
  const gestao = vePorVendedor(contexto.perfil);
  const lojas = lojasVisiveis(contexto).map((l) => l.codigo);
  return OPERACOES_CONNECT.filter((o) => lojas.includes(o.loja) && (gestao || o.vendedor === contexto.pessoaId));
}

/** Operações do dia que vieram das vendas (chip, ativação, portabilidade, recarga), por vendedor e situação. */
export function Operacoes({ contexto, filtro }: { contexto: ContextoDemo; filtro: Filtro }) {
  const gestao = vePorVendedor(contexto.perfil);
  const operacoes = operacoesVisiveis(contexto);
  const conta = (tipo: OperacaoConnect["tipo"], soConfirmada = false) => operacoes.filter((o) => o.tipo === tipo && (!soConfirmada || o.situacao.startsWith("Confirmada"))).length;
  const aguardando = operacoes.filter((o) => o.situacao === "Aguardando operadora");
  const falhas = operacoes.filter((o) => o.situacao.startsWith("Falhou"));
  const recargas = operacoes.filter((o) => o.tipo === "Recarga");
  const lista = (filtro === "aguardando" ? aguardando : filtro === "falhou" ? falhas : operacoes).slice().reverse();
  const porVendedor = gestao
    ? [...new Set(operacoes.map((o) => o.vendedor))].map((id) => ({ rotulo: nomeDaPessoa(id), valor: operacoes.filter((o) => o.vendedor === id && o.situacao.startsWith("Confirmada")).length })).sort((a, b) => b.valor - a.valor).slice(0, 8)
    : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Chips vendidos" valor={numero(conta("Chip"))} icone={Signal} />
        <Indicador rotulo="Ativações confirmadas" valor={numero(conta("Ativação", true))} icone={CircleCheck} detalhe={`${conta("Ativação") - conta("Ativação", true)} aguardando ou com falha`} tom={falhas.length > 0 ? "atencao" : "neutro"} />
        <Indicador rotulo="Portabilidades" valor={numero(conta("Portabilidade"))} icone={ArrowRightLeft} detalhe={`${conta("Portabilidade", true)} confirmadas`} />
        <Indicador rotulo="Recargas" valor={numero(recargas.length)} icone={RefreshCw} detalhe={`${brl(recargas.reduce((s, o) => s + o.valor, 0))} em valor de face (não é receita)`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Operações de hoje" subtitulo="O status vem da operadora; nada é dado como confirmado sem resposta" className="xl:col-span-2" corpo="p-0">
          <div className="border-b border-borda px-4 pb-3 sm:px-5">
            <FiltroSegmentado rotulo="Filtrar operações" opcoes={(Object.keys(FILTROS) as Filtro[]).map((f) => ({ href: f === "todas" ? "/demo/connect" : `/demo/connect?filtro=${f}`, rotulo: FILTROS[f], ativo: f === filtro, contagem: f === "todas" ? operacoes.length : f === "aguardando" ? aguardando.length : falhas.length }))} />
          </div>
          {lista.length === 0 ? <div className="p-5"><EstadoVazio titulo="Nenhuma operação aqui" icone={Signal} /></div> : (
            <ul className="divide-y divide-borda">
              {lista.slice(0, 40).map((o) => (
                <li key={o.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:px-5">
                  <span className="numeros text-sm text-suave">{o.hora}</span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">{o.tipo} · <span className="numeros">{o.linha}</span></span>
                    <span className="block truncate text-xs text-suave">{gestao ? `${nomeDaPessoa(o.vendedor)} · ` : ""}{nomeDaLoja(o.loja)}{o.valor > 0 ? ` · ${brl(o.valor)}` : ""}</span>
                  </span>
                  <Selo tom={tom(o.situacao)} ponto className="max-w-[11rem] sm:max-w-none">{o.situacao.startsWith("Confirmada") ? "Confirmada" : o.situacao.startsWith("Falhou") ? "Falhou · reconsultar" : "Aguardando"}</Selo>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
        <div className="min-w-0 space-y-4">
          <Cartao titulo="Operações por tipo" subtitulo="Contagem de hoje">
            <BarraSegmentada rotulo="Operações" formatar={(v) => numero(v)} partes={[
              { nome: "Chips", valor: conta("Chip"), serie: 1 },
              { nome: "Ativações", valor: conta("Ativação"), serie: 2 },
              { nome: "Portabilidades", valor: conta("Portabilidade"), serie: 3 },
              { nome: "Recargas", valor: recargas.length, serie: 4 },
            ]} />
          </Cartao>
          {gestao && porVendedor.length > 0 && (
            <Cartao titulo="Confirmadas por vendedor" subtitulo="Contam na produção de cada um">
              <BarrasHorizontais nomeSerie="Confirmadas" formatar={(v) => numero(v)} dados={porVendedor} serie={2} />
              <TabelaDoGrafico colunas={["Vendedor", "Confirmadas"]} linhas={porVendedor.map((p) => [p.rotulo, p.valor])} />
            </Cartao>
          )}
          <div className="flex flex-wrap gap-2 text-xs text-suave">
            <span className="inline-flex items-center gap-1"><Hourglass aria-hidden className="size-3.5" /> {aguardando.length} aguardando</span>
            <span className="inline-flex items-center gap-1"><CircleX aria-hidden className="size-3.5 text-perigo" /> {falhas.length} com falha</span>
          </div>
        </div>
      </div>

    </>
  );
}

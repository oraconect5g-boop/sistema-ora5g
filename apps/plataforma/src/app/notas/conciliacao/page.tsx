import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { EstadoDoPainel } from "../../../componentes/paineis-de-vendas";
import { Aviso, Botao, Cartao, FiltroSegmentado, TituloPagina } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import {
  ehPeriodo, enderecoDaConciliacao, ERROS_DA_CONCILIACAO, intervaloDoPeriodo, lerConciliacao, PERIODOS, type Periodo,
} from "../../../lib/notas/conciliacao";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { ConteudoDaConciliacao } from "./ConteudoDaConciliacao";

export const metadata: Metadata = { title: "Conciliação das notas" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
// Conciliação das notas (lote L10b: ORA-FISC-008 em parte): as vendas do período contra a fila de notas, o que falta
// guardar e as divergências que não dependem de regra do contador. Só de quem aprova nota (dono e gerente), das lojas
// onde aprova; quem decide é o banco.
export default async function ConciliacaoDasNotas({ searchParams }: {
  searchParams: Promise<{ periodo?: ValorDeParametro; loja?: ValorDeParametro; erro?: ValorDeParametro; ok?: ValorDeParametro }>;
}) {
  const parametros = await searchParams;
  const pedido = textoDoParametro(parametros.periodo);
  const periodo: Periodo = ehPeriodo(pedido) ? pedido : "mes";
  const lojaPedida = textoDoParametro(parametros.loja);
  const unidade = ehUuid(lojaPedida) ? lojaPedida : null;
  const erro = chaveDoCatalogo(ERROS_DA_CONCILIACAO, parametros.erro);
  const conferida = textoDoParametro(parametros.ok) === "conferida";
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { inicio, fim } = intervaloDoPeriodo(periodo, hoje);
  const sessao = await obterSessao({ exigirLoja: true });
  const [leitura, politica] = await Promise.all([
    lerConciliacao(sessao.supabase, inicio, fim, unidade),
    sessao.supabase.from("fiscal_politicas").select("alerta_minutos").maybeSingle(),
  ]);
  if (leitura.estado === "sem_permissao") {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">A conciliação das notas é do dono e do gerente (das lojas onde aprovam nota).</Aviso></MoldeReal>;
  }
  if (politica.error) throw new FalhaDoServico("notas_politica");

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <Link href="/notas" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Notas fiscais</Link>
      <TituloPagina titulo="Conciliação das notas"
        subtitulo={`De ${dataBr(inicio)} a ${dataBr(fim)}: as vendas do período, a fila de notas, os documentos guardados e o que não fecha.`} />
      {erro && <Aviso tom="perigo">{ERROS_DA_CONCILIACAO[erro]}</Aviso>}
      {conferida && <Aviso tom="sucesso">Conferência registrada (com o que você escreveu, na auditoria).</Aviso>}
      <div className="nao-imprimir mt-4 flex flex-wrap items-end gap-3">
        <FiltroSegmentado rotulo="Período" opcoes={(Object.keys(PERIODOS) as Periodo[]).map((p) => ({ href: enderecoDaConciliacao(p, unidade), rotulo: PERIODOS[p], ativo: p === periodo }))} />
        {leitura.estado === "ok" && leitura.dados.lojas.length > 1 && (
          <form className="flex items-end gap-2" action="/notas/conciliacao">
            <input type="hidden" name="periodo" value={periodo} />
            <label className="text-sm font-medium">Loja
              <select name="loja" defaultValue={unidade ?? ""} className={campo}>
                <option value="">Todas as lojas</option>
                {leitura.dados.lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </label>
            <Botao type="submit" tamanho="sm" variante="secundario">Ver</Botao>
          </form>
        )}
      </div>
      <Aviso tom="info" className="mt-4">
        O valor da nota contra o da venda e os tributos entram quando o contador definir o que vai em cada documento (conserto, recarga e chip podem ter documento próprio).
      </Aviso>
      {leitura.estado === "ok"
        ? <ConteudoDaConciliacao r={leitura.dados} periodo={periodo} prazo={politica.data?.alerta_minutos ?? null} />
        : <Cartao className="mt-4" titulo="Conciliação"><EstadoDoPainel estado={leitura.estado} fonte="conciliacao_fiscal" tentarDeNovo={enderecoDaConciliacao(periodo, unidade)} /></Cartao>}
    </MoldeReal>
  );
}

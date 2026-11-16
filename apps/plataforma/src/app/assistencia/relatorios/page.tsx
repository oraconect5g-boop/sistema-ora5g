import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { EstadoDoPainel } from "../../../componentes/paineis-de-vendas";
import { Aviso, Botao, Cartao, FiltroSegmentado, TituloPagina } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { ehPeriodo, intervaloDoPeriodo, lerRelatorio, PERIODOS, type Periodo } from "../../../lib/assistencia/relatorio";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { ConteudoDoRelatorio } from "./ConteudoDoRelatorio";

export const metadata: Metadata = { title: "Relatórios da assistência" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
// Relatórios da assistência (lote L12e: ORA-OS-006; seção 2C da Etapa 0, item 5): OS sem venda, por pessoa, tempo de
// conserto e peças × serviços. Só da gerência e do dono (os.gerir), das lojas onde a pessoa gere; quem decide é o banco.
export default async function RelatoriosDaAssistencia({ searchParams }: { searchParams: Promise<{ periodo?: ValorDeParametro; loja?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const pedido = textoDoParametro(parametros.periodo);
  const periodo: Periodo = ehPeriodo(pedido) ? pedido : "mes";
  const lojaPedida = textoDoParametro(parametros.loja);
  const unidade = ehUuid(lojaPedida) ? lojaPedida : null;
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { inicio, fim } = intervaloDoPeriodo(periodo, hoje);
  const sessao = await obterSessao({ exigirLoja: true });
  const leitura = await lerRelatorio(sessao.supabase, inicio, fim, unidade);
  if (leitura.estado === "sem_permissao") {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Os relatórios da assistência são da gerência e do dono (das lojas onde gerem).</Aviso></MoldeReal>;
  }
  const endereco = (p: Periodo) => `/assistencia/relatorios?periodo=${p}${unidade ? `&loja=${unidade}` : ""}`;

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <Link href="/assistencia" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Assistência</Link>
      <TituloPagina titulo="Relatórios da assistência"
        subtitulo={`De ${dataBr(inicio)} a ${dataBr(fim)}: o que entrou, o que foi cobrado no PDV e o que saiu sem venda.`} />
      <div className="nao-imprimir mt-4 flex flex-wrap items-end gap-3">
        <FiltroSegmentado rotulo="Período" opcoes={(Object.keys(PERIODOS) as Periodo[]).map((p) => ({ href: endereco(p), rotulo: PERIODOS[p], ativo: p === periodo }))} />
        {leitura.estado === "ok" && leitura.dados.lojas.length > 1 && (
          <Form action="/assistencia/relatorios" prefetch={false} className="flex items-end gap-2">
            <input type="hidden" name="periodo" value={periodo} />
            <label className="text-sm font-medium">Loja
              <select key={unidade ?? ""} name="loja" defaultValue={unidade ?? ""} className={campo}>
                <option value="">Todas as lojas</option>
                {leitura.dados.lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </label>
            <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Carregando…">Ver</Botao>
          </Form>
        )}
      </div>
      {leitura.estado === "ok"
        ? <ConteudoDoRelatorio r={leitura.dados} />
        : <Cartao className="mt-4" titulo="Relatório"><EstadoDoPainel estado={leitura.estado} fonte="relatorio_assistencia" tentarDeNovo={endereco(periodo)} /></Cartao>}
    </MoldeReal>
  );
}

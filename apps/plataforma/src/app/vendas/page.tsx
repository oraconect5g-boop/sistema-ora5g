import { Coins, Receipt, RotateCcw, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, BotaoLink, Cartao, EstadoVazio, FiltroSegmentado, FormBusca, Indicador, Selo, TituloPagina } from "../../componentes/ui";
import { permite } from "../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { centavosDoBanco } from "../../lib/dinheiro";
import { brl, numero } from "../../lib/formato";
import { nomesDoRanking } from "../../lib/inicio/consulta";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { FILTROS_DA_LISTA, inicioDoPeriodo, NOMES_DA_NOTA, PERIODOS, resumoDasVendas, situacaoDaVenda, type FiltroDaLista, type Periodo } from "../../lib/vendas/lista";
import { Pendencias } from "./Pendencias";

export const metadata: Metadata = { title: "Vendas" };
export const dynamic = "force-dynamic";

const LIMITE = 100;
const LIMITE_DO_RESUMO = 5000;
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Vendas reais da loja do turno (revisão de 10/11/2026). O vendedor vê as próprias; quem tem
// venda.ver_unidade (a gerência) ou venda.ver_todas (a rede: o dono e o administrador) vê a loja inteira (o RLS decide de
// novo). Sem custo nem margem nesta tela.
export default async function Vendas({ searchParams }: { searchParams: Promise<{ periodo?: ValorDeParametro; situacao?: ValorDeParametro; numero?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const periodo: Periodo = chaveDoCatalogo(PERIODOS, parametros.periodo) ?? "hoje";
  const filtro: FiltroDaLista = chaveDoCatalogo(FILTROS_DA_LISTA, parametros.situacao) ?? "todas";
  const numeroBuscado = (textoDoParametro(parametros.numero) ?? "").replace(/\D/g, "").slice(0, 9);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;

  // J2-b (19/11): quem vê a rede (venda.ver_todas, sem venda.ver_unidade, como o administrador) recebia "Minhas vendas",
  // vazia, embora o menu mostre Vendas e o banco entregue as vendas da loja.
  const daLoja = permite(sessao, "venda.ver_unidade") || permite(sessao, "venda.ver_todas");
  const desde = inicioDoPeriodo(periodo);
  // Venda do período: concluída no período ou, sem conclusão, criada nele.
  const doPeriodo = `concluida_em.gte.${desde},and(concluida_em.is.null,criado_em.gte.${desde})`;
  const base = () => {
    const consulta = supabase.from("vendas").select("id, numero, situacao, vendedor_id, total_centavos, devolvido_centavos, criado_em, concluida_em, cliente_nome")
      .eq("unidade_id", unidade).or(doPeriodo);
    return daLoja ? consulta : consulta.eq("vendedor_id", usuario.id);
  };
  const situacoes = FILTROS_DA_LISTA[filtro].situacoes;
  const filtrada = situacoes ? base().in("situacao", [...situacoes]) : base();
  const [lista, todasDoPeriodo] = await Promise.all([
    (numeroBuscado ? filtrada.eq("numero", Number(numeroBuscado)) : filtrada).order("numero", { ascending: false }).limit(LIMITE),
    base().limit(LIMITE_DO_RESUMO),
  ]);
  if (lista.error || todasDoPeriodo.error) throw new FalhaDoServico("vendas");
  const resumo = resumoDasVendas(todasDoPeriodo.data);
  const contagem = (f: FiltroDaLista) => {
    const s = FILTROS_DA_LISTA[f].situacoes;
    return s ? todasDoPeriodo.data.filter((v) => (s as readonly string[]).includes(v.situacao)).length : todasDoPeriodo.data.length;
  };

  const vendaIds = lista.data.map((v) => v.id);
  const vendedorIds = [...new Set(lista.data.map((v) => v.vendedor_id))].filter((id) => id !== usuario.id);
  // O nome de quem vendeu (J2-b, 19/11): o perfil de outra pessoa só se lê com usuarios.gerir (o dono e o administrador),
  // e a gerência via "Outro vendedor" em todas as vendas. Com ranking.ver, os nomes vêm de public.ranking_nomes, como no
  // Início (só de quem tem venda concluída nas lojas em que a pessoa vê o ranking). Na mesma rodada das outras leituras; a
  // falha dela não derruba a lista (fica "Outro vendedor").
  const comRanking = daLoja && vendedorIds.length > 0 && permite(sessao, "ranking.ver");
  const [notas, pessoas, doRanking] = await Promise.all([
    vendaIds.length ? supabase.from("notas_pedidos").select("venda_id, situacao").in("venda_id", vendaIds).neq("situacao", "cancelada") : Promise.resolve({ data: [], error: null }),
    vendedorIds.length ? supabase.from("perfis_usuario").select("id, nome").in("id", vendedorIds) : Promise.resolve({ data: [], error: null }),
    comRanking ? nomesDoRanking(supabase, vendedorIds) : Promise.resolve(null),
  ]);
  if (notas.error || pessoas.error) throw new FalhaDoServico("vendas_detalhes");
  const notaDa = (id: string) => notas.data.find((n) => n.venda_id === id)?.situacao;
  const nomesDoRankingLidos = doRanking?.estado === "ok" ? doRanking.dados : new Map<string, string>();
  const vendedorDa = (id: string) => (id === usuario.id ? "Você" : pessoas.data.find((p) => p.id === id)?.nome ?? nomesDoRankingLidos.get(id) ?? "Outro vendedor");

  const href = (mudanca: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const valores = { periodo: periodo === "hoje" ? undefined : periodo, situacao: filtro === "todas" ? undefined : filtro, numero: numeroBuscado || undefined, ...mudanca };
    for (const [k, v] of Object.entries(valores)) if (v) p.set(k, v);
    const texto = p.toString();
    return `/vendas${texto ? `?${texto}` : ""}`;
  };

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <TituloPagina
        sobretitulo={situacao.unidade_nome}
        titulo={daLoja ? "Vendas da loja" : "Minhas vendas"}
        subtitulo={daLoja ? "Todos os vendedores desta loja. Abra a venda para ver o comprovante, pedir nota, devolver ou trocar." : "Só as suas vendas nesta loja. Abra a venda para ver o comprovante, pedir nota ou acompanhar a devolução."}
        acao={permite(sessao, "venda.registrar") ? <BotaoLink href="/vender" tamanho="sm">Nova venda</BotaoLink> : undefined}
      />
      <Pendencias sessao={sessao} unidade={unidade} />
      <FiltroSegmentado rotulo="Período" opcoes={(Object.keys(PERIODOS) as Periodo[]).map((p) => ({ href: href({ periodo: p === "hoje" ? undefined : p }), rotulo: PERIODOS[p].rotulo, ativo: p === periodo }))} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Vendido (concluídas)" valor={brl(resumo.vendido)} icone={Coins} />
        <Indicador rotulo="Vendas concluídas" valor={numero(resumo.concluidas)} icone={ShoppingBag} />
        <Indicador rotulo="Devolvido" valor={brl(resumo.devolvido)} icone={RotateCcw} detalhe={`Líquido ${brl(resumo.liquido)}`} />
        <Indicador rotulo="Em aberto · canceladas" valor={`${numero(resumo.abertas)} · ${numero(resumo.canceladas)}`} icone={Receipt} />
      </div>
      {todasDoPeriodo.data.length === LIMITE_DO_RESUMO && <Aviso tom="aviso">O resumo considera as primeiras {LIMITE_DO_RESUMO} vendas do período: escolha um período menor.</Aviso>}

      <Cartao corpo="p-0">
        <div className="flex flex-col gap-3 border-b border-borda p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <FiltroSegmentado rotulo="Situação da venda" opcoes={(Object.keys(FILTROS_DA_LISTA) as FiltroDaLista[]).map((f) => ({ href: href({ situacao: f === "todas" ? undefined : f }), rotulo: FILTROS_DA_LISTA[f].rotulo, ativo: f === filtro, contagem: contagem(f) }))} />
          <FormBusca acao="/vendas" nome="numero" valor={numeroBuscado} rotulo="Buscar pelo número da venda" dica="Número da venda" ocultos={{ periodo: periodo === "hoje" ? undefined : periodo, situacao: filtro === "todas" ? undefined : filtro }} />
        </div>
        {lista.data.length === 0 ? (
          <div className="p-4 sm:p-5"><EstadoVazio titulo="Nenhuma venda encontrada" icone={Receipt}>Tente outro período ou outro filtro.</EstadoVazio></div>
        ) : (
          <ul className="divide-y divide-borda">
            {lista.data.map((v) => {
              const s = situacaoDaVenda(v.situacao);
              const nota = notaDa(v.id);
              const devolvido = centavosDoBanco(v.devolvido_centavos ?? 0);
              return (
                <li key={v.id}>
                  <Link href={`/vendas/${v.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50/80 sm:px-5">
                    <span className="min-w-0 text-sm">
                      <span className="numeros font-semibold">Nº {v.numero}</span>
                      <span className="block truncate text-xs text-suave">{quando(v.concluida_em ?? v.criado_em)}{daLoja ? ` · ${vendedorDa(v.vendedor_id)}` : ""}{v.cliente_nome ? ` · ${v.cliente_nome}` : ""}</span>
                    </span>
                    <span className="numeros text-right text-sm font-semibold">{v.total_centavos === null ? "—" : brl(centavosDoBanco(v.total_centavos))}</span>
                    <span className="col-span-2 flex flex-wrap gap-1">
                      <Selo tom={s.tom} ponto>{s.nome}</Selo>
                      {devolvido > 0 && <Selo tom="aviso">devolvido {brl(devolvido)}</Selo>}
                      {nota && <Selo tom={nota === "emitida" ? "sucesso" : "info"}>{NOMES_DA_NOTA[nota] ?? nota}</Selo>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {lista.data.length === LIMITE && <p className="border-t border-borda px-5 py-3 text-xs text-suave">Mostrando as {LIMITE} mais recentes. Use os filtros ou o número da venda.</p>}
      </Cartao>
    </MoldeReal>
  );
}

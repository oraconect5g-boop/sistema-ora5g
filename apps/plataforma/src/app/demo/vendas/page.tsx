import { nomeDoPagamento, textoDasParcelas } from "@ora5g/dominio";
import { Coins, Hourglass, Receipt, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";

import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, EstadoVazio, FiltroSegmentado, FormBusca, Indicador, Selo, TituloPagina, type Tom } from "../../../componentes/ui";
import { resumoDaLoja, vendasVisiveis, vendedoresVisiveis } from "../../../demo/consultas";
import { NOMES_NOTA, NOMES_SITUACAO, nomeDaLoja, nomeDaPessoa, resumoDeVendas, type SituacaoNota, type SituacaoVenda, type VendaDemo } from "../../../demo/dados";
import { REDE, vePorVendedor } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import { brl, brlCompacto, numero, percentual } from "../../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";

export const metadata: Metadata = { title: "Vendas" };

const TOM_SITUACAO: Record<SituacaoVenda, Tom> = { concluida: "sucesso", aguardando_aprovacao: "aviso", pagamento_pendente: "info", cancelamento_solicitado: "aviso", cancelada: "neutro" };
const TOM_NOTA: Record<SituacaoNota, Tom> = { emitida: "sucesso", solicitada: "aviso", nao_solicitada: "neutro" };

const FILTROS = {
  todas: { rotulo: "Todas", teste: () => true },
  concluidas: { rotulo: "Concluídas", teste: (v: VendaDemo) => v.situacao === "concluida" },
  pendentes: { rotulo: "Pendentes", teste: (v: VendaDemo) => v.situacao === "aguardando_aprovacao" || v.situacao === "pagamento_pendente" || v.situacao === "cancelamento_solicitado" || v.nota === "solicitada" },
  canceladas: { rotulo: "Canceladas", teste: (v: VendaDemo) => v.situacao === "cancelada" },
} as const;
type Filtro = keyof typeof FILTROS;

const LIMITE = 60;

export default async function Vendas({ searchParams }: { searchParams: Promise<{ situacao?: ValorDeParametro; vendedor?: ValorDeParametro; busca?: ValorDeParametro }> }) {
  const contexto = await acessoDaPagina("vendas");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Vendas" />;
  const parametros = await searchParams;
  // Só texto simples e chave própria do catálogo; lista (parâmetro repetido) vale como ausente (varredura do #16).
  const filtro: Filtro = chaveDoCatalogo(FILTROS, parametros.situacao) ?? "todas";
  const gestao = vePorVendedor(contexto.perfil);
  const vendedores = gestao ? vendedoresVisiveis(contexto) : [];
  const vendedorPedido = textoDoParametro(parametros.vendedor);
  const vendedorFiltro = gestao && vendedores.some((v) => v.id === vendedorPedido) ? vendedorPedido : undefined;
  const busca = (textoDoParametro(parametros.busca) ?? "").trim().toLowerCase().slice(0, 40);

  const todas = vendasVisiveis(contexto);
  const doVendedor = vendedorFiltro ? todas.filter((v) => v.vendedor === vendedorFiltro) : todas;
  const buscadas = busca ? doVendedor.filter((v) => `${v.numero} ${v.cliente ?? ""} ${v.itens.map((i) => i.nome).join(" ")}`.toLowerCase().includes(busca)) : doVendedor;
  const visiveis = buscadas.filter(FILTROS[filtro].teste).slice().reverse();
  const resumo = resumoDeVendas(doVendedor);
  const pendentes = doVendedor.filter(FILTROS.pendentes.teste).length;

  const href = (mudanca: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const valores = { situacao: filtro === "todas" ? undefined : filtro, vendedor: vendedorFiltro, busca: busca || undefined, ...mudanca };
    for (const [k, v] of Object.entries(valores)) if (v) p.set(k, v);
    const texto = p.toString();
    return `/demo/vendas${texto ? `?${texto}` : ""}`;
  };

  const rede = contexto.loja === REDE;
  const lojaDoVendedor = !gestao ? resumoDaLoja(contexto.loja) : null;

  return (
    <>
      <TituloPagina
        sobretitulo={rede ? "Rede inteira" : nomeDaLoja(contexto.loja)}
        titulo={gestao ? "Vendas de hoje" : "Minhas vendas de hoje"}
        subtitulo={gestao ? "Todos os vendedores do seu escopo, com situação da venda e da nota" : "Só as suas vendas nesta loja. As de outras lojas aparecem em Metas."}
        acao={<ExportarCsv nomeArquivo="vendas" colunas={["Venda", "Hora", "Loja", "Vendedor", "Cliente", "Itens", "Pagamento", "Total (R$)", "Situação", "Nota"]} linhas={visiveis.map((v) => [v.numero, v.hora, nomeDaLoja(v.loja), nomeDaPessoa(v.vendedor), v.cliente ?? "", v.itens.map((i) => i.nome).join(" + "), v.pagamentos.map((p) => `${nomeDoPagamento(p)}${textoDasParcelas(p.meio, p.parcelas)}`).join(" + "), (v.total / 100).toFixed(2).replace(".", ","), NOMES_SITUACAO[v.situacao], NOMES_NOTA[v.nota]])} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo={gestao ? "Faturamento" : "Meu faturamento aqui"} valor={brlCompacto(resumo.faturamento)} icone={Coins} />
        <Indicador rotulo="Vendas concluídas" valor={numero(resumo.vendas)} icone={ShoppingBag} />
        <Indicador rotulo="Ticket médio" valor={brl(resumo.vendas > 0 ? resumo.faturamento / resumo.vendas : 0)} icone={Receipt} />
        <Indicador rotulo="Pendências" valor={numero(pendentes)} icone={Hourglass} detalhe="Aprovação, pagamento ou nota" tom={pendentes > 0 ? "atencao" : "bom"} />
      </div>

      {lojaDoVendedor && (
        <Aviso tom="marca" className="mt-4" titulo={`Resumo de ${nomeDaLoja(contexto.loja)}: ${brl(lojaDoVendedor.faturamento)} hoje (${percentual(lojaDoVendedor.meta > 0 ? lojaDoVendedor.faturamento / lojaDoVendedor.meta : 0)} da meta)`}>
          Você vê o total da loja, mas não as vendas dos colegas (ADR-002). Gerente e dono veem todos os vendedores.
        </Aviso>
      )}

      <Cartao className="mt-4" corpo="p-0">
        <div className="flex flex-col gap-3 border-b border-borda p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <FiltroSegmentado rotulo="Situação da venda" opcoes={(Object.keys(FILTROS) as Filtro[]).map((f) => ({ href: href({ situacao: f === "todas" ? undefined : f }), rotulo: FILTROS[f].rotulo, ativo: f === filtro, contagem: buscadas.filter(FILTROS[f].teste).length }))} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {gestao && (
              <form action="/demo/vendas" method="get" className="flex gap-2">
                {filtro !== "todas" && <input type="hidden" name="situacao" value={filtro} />}
                {busca && <input type="hidden" name="busca" value={busca} />}
                <label className="sr-only" htmlFor="filtro-vendedor">Vendedor</label>
                <select id="filtro-vendedor" name="vendedor" defaultValue={vendedorFiltro ?? ""} className="min-h-10 max-w-[14rem] rounded-botao border border-borda bg-white px-3 text-sm">
                  <option value="">Todos os vendedores ({vendedores.length})</option>
                  {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
                <button type="submit" className="min-h-10 rounded-botao border border-borda bg-white px-3 text-sm font-semibold hover:bg-slate-50">Filtrar</button>
              </form>
            )}
            <FormBusca acao="/demo/vendas" valor={busca} rotulo="Buscar venda" dica="Número, cliente ou produto" ocultos={{ situacao: filtro === "todas" ? undefined : filtro, vendedor: vendedorFiltro }} />
          </div>
        </div>

        {visiveis.length === 0 ? (
          <div className="p-4 sm:p-5"><EstadoVazio titulo="Nenhuma venda encontrada" icone={Receipt}>Tente outro filtro ou limpe a busca.</EstadoVazio></div>
        ) : (
          <ul className="divide-y divide-borda">
            {visiveis.slice(0, LIMITE).map((v) => (
              <li key={v.numero}>
                <details className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50/80 sm:px-5 lg:grid-cols-[7rem_minmax(0,1fr)_10rem_9rem_12rem]">
                    <span className="numeros text-sm font-semibold">{v.numero}<span className="block text-xs font-normal text-suave">{v.hora}{rede ? ` · ${nomeDaLoja(v.loja)}` : ""}</span></span>
                    <span className="min-w-0 text-sm max-lg:order-3 max-lg:col-span-2">
                      <span className="block truncate">{v.itens.map((i) => (i.quantidade > 1 ? `${i.quantidade}× ${i.nome}` : i.nome)).join(" + ")}</span>
                      <span className="block truncate text-xs text-suave">{gestao ? `${nomeDaPessoa(v.vendedor)} · ` : ""}{v.cliente ?? "Cliente não identificado"}</span>
                    </span>
                    <span className="hidden truncate text-xs text-suave lg:block">{v.pagamentos.map((p) => nomeDoPagamento(p)).join(" + ") || "—"}</span>
                    <span className="numeros text-right text-sm font-semibold lg:text-left">{brl(v.total)}</span>
                    <span className="flex flex-wrap gap-1 max-lg:order-4 max-lg:col-span-2">
                      <Selo tom={TOM_SITUACAO[v.situacao]} ponto>{NOMES_SITUACAO[v.situacao]}</Selo>
                      {v.nota !== "nao_solicitada" && <Selo tom={TOM_NOTA[v.nota]}>{NOMES_NOTA[v.nota]}</Selo>}
                    </span>
                  </summary>
                  <div className="grid gap-4 bg-slate-50/70 px-4 py-3 text-sm sm:px-5 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">Itens</p>
                      <ul className="space-y-1">
                        {v.itens.map((i, k) => (
                          <li key={k} className="flex justify-between gap-3">
                            <span className="min-w-0">{i.quantidade > 1 ? `${i.quantidade}× ` : ""}{i.nome}{i.situacaoTelecom && i.situacaoTelecom !== "confirmada" ? <span className="text-suave"> · {i.situacaoTelecom === "pendente" ? "aguardando operadora" : "falhou na operadora"}</span> : null}{i.desconto > 0 && <span className="text-suave"> · desconto {brl(i.desconto)}</span>}</span>
                            <span className="numeros shrink-0">{brl(i.precoUnitario * i.quantidade - i.desconto)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">Pagamento</p>
                      <ul className="space-y-1">
                        {v.pagamentos.map((p, k) => (
                          <li key={k} className="flex justify-between gap-3"><span>{nomeDoPagamento(p)}{p.entrada !== undefined ? ` (entrada ${brl(p.entrada)})` : ""}</span><span className="numeros">{brl(p.valor)}{textoDasParcelas(p.meio, p.parcelas)}</span></li>
                        ))}
                      </ul>
                      {v.pedido && <p className="mt-2 text-xs text-suave">Pedido: {v.pedido.motivo} · há {v.pedido.esperaMinutos} min</p>}
                      {contexto.perfil !== "vendedor" && <p className="mt-2 text-xs text-suave">Margem bruta: {brl(v.total - v.custo)} ({percentual(v.total > 0 ? (v.total - v.custo) / v.total : 0)})</p>}
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        {visiveis.length > LIMITE && <p className="border-t border-borda px-5 py-3 text-xs text-suave">Mostrando as {LIMITE} mais recentes de {visiveis.length}. Use os filtros ou a busca para encontrar uma venda.</p>}
      </Cartao>
    </>
  );
}

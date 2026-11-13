import { BadgePercent, HandCoins, Package, PiggyBank, ReceiptText, ShoppingBag, Store, Ticket, Undo2, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { LojaDoFiltro } from "../lib/financeiro/escopo";
import { variacaoFinanceira, type Janela, type ResumoFinanceiro } from "../lib/financeiro/painel";
import { brl, brlCompacto, brlComSinal, brlEixo, numero, percentual, percentualComSinal } from "../lib/formato";
import { categoriasDoMix, comparacaoDasVendas, lojasDoPainel, mixPorGrupo, numerosDasVendas, partesRecebidas, serieDeVendas, type Leitura, type TextosDoRecorte, type VendasDoBanco } from "../lib/inicio/painel";
import { numerosDaMargem, situacaoDaMargem, type MargemDoBanco } from "../lib/margem/painel";
import { BarraSegmentada, BarrasHorizontais, Linhas, TabelaDoGrafico, type SerieLinha } from "./graficos";
import { Aviso, Cartao, EstadoVazio, Indicador, ListaDados, SeloVariacao, type Variacao } from "./ui";

// Painéis de vendas que o Início (G1) e os Relatórios (G2) mostram do mesmo jeito: os indicadores do
// período, vendas no tempo, recebimentos por meio, mix e desempenho das lojas. Só apresentação: cada
// tela lê os dados (lib/inicio/consulta, lib/relatorios/consulta) e entrega aqui a leitura já com o
// estado dela; o recorte de tempo chega pelos textos (TextosDoRecorte). Cada painel mantém o título e
// o espaço em qualquer estado (MATRIZ_DEMO_REAL.md, seção 4): com dados, sem movimentação (zero só
// aqui), sem histórico comparável, fonte indisponível, falha de consulta (nunca zero) e sem permissão.

export const LIGACAO = "text-sm font-semibold text-acao hover:underline";

/**
 * A meta do dia na linha das vendas (Relatórios, G4c): o valor de cada dia (nulo no dia sem meta) e o
 * aviso do que ficou de fora; ou o estado da leitura das metas, que nunca vira zero.
 */
export type MetaDoGrafico = { estado: "ok"; porDia: (chave: string) => number | null; aviso: string | null } | { estado: "indisponivel" | "falha" };
const INDICADOR = "w-[78%] shrink-0 snap-start sm:w-auto";
const CARROSSEL = "sem-barra -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0";
export const NUMERO_PRINCIPAL = "numeros text-[28px] font-bold leading-tight";
export const NOTA = "text-sm text-suave";

export const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
const maiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);
/** De quantos em quantos pontos o eixo do tempo ganha rótulo. */
export const cadaRotulo = (pontos: number) => (pontos > 16 ? 3 : pontos > 8 ? 2 : 1);
const semTicket = (ticket: number | null) => (ticket === null ? "—" : brl(ticket));

export const SEM_LEITURA = { indisponivel: "Indisponível neste ambiente", falha: "Não foi possível ler agora" } as const;
const FONTE = {
  vendas: "a leitura agregada das vendas (migration vendas_painel)",
  financeiro: "a leitura agregada do financeiro (migration financeiro_painel)",
  nomes: "a leitura dos nomes do ranking (migration vendas_painel)",
  margem: "a leitura da margem bruta (migration margem_painel)",
  estoque: "a leitura agregada do estoque (migration estoque_painel)",
  connect: "a leitura da produção do Ora Connect (migration connect_painel)",
  metas: "a leitura das metas (migration metas)",
} as const;

/** O conteúdo de um painel que não tem número para mostrar: o motivo aparece, zero nunca. */
export function EstadoDoPainel({ estado, motivo, fonte, tentarDeNovo }: { estado: "indisponivel" | "falha" | "sem_permissao"; motivo?: string; fonte?: keyof typeof FONTE; tentarDeNovo?: string }) {
  if (estado === "sem_permissao") return <Aviso tom="neutro" titulo="Sem permissão">{motivo}</Aviso>;
  if (estado === "indisponivel") {
    return (
      <Aviso tom="aviso" titulo={SEM_LEITURA.indisponivel}>
        O banco deste ambiente ainda não tem {fonte ? FONTE[fonte] : "esta leitura"}. Nenhum número é mostrado até ela ser instalada.
      </Aviso>
    );
  }
  return (
    <Aviso tom="perigo" titulo={SEM_LEITURA.falha}>
      Nenhum número é mostrado: falha de leitura não vira zero.
      {tentarDeNovo && <>{" "}<Link href={tentarDeNovo} prefetch={false} className="font-semibold underline">Tentar de novo</Link></>}
    </Aviso>
  );
}

// ---------------------------------------------------------------------------------------------
// Indicadores do período
// ---------------------------------------------------------------------------------------------
export type ItemDoResumo = { rotulo: string; icone: LucideIcon; valor: string; detalhe: string; variacao?: Variacao; tom?: "neutro" | "atencao" };
export const CABECAS = {
  vendas: { rotulo: "Vendas realizadas", icone: ShoppingBag },
  ticket: { rotulo: "Ticket médio", icone: Ticket },
  descontos: { rotulo: "Descontos concedidos", icone: BadgePercent },
  desfeito: { rotulo: "Devoluções e cancelamentos", icone: Undo2 },
  margem: { rotulo: "Margem bruta", icone: PiggyBank },
  recebido: { rotulo: "Recebido na loja (registro)", icone: HandCoins },
  gaveta: { rotulo: "Movimentação dos caixas (dinheiro)", icone: Wallet },
} as const;

export function indicadoresDeVendas({ vendas, anterior, textos, doVendedor = false }: { vendas: Leitura<VendasDoBanco>; anterior: Leitura<VendasDoBanco>; textos: TextosDoRecorte; doVendedor?: boolean }): ItemDoResumo[] {
  const cabecaDeVendas = doVendedor ? { ...CABECAS.vendas, rotulo: "Minhas vendas" } : CABECAS.vendas;
  if (vendas.estado !== "ok") {
    const detalhe = SEM_LEITURA[vendas.estado];
    return [cabecaDeVendas, CABECAS.ticket, CABECAS.descontos, CABECAS.desfeito].map((c) => ({ ...c, valor: "—", detalhe, tom: "atencao" as const }));
  }
  const n = numerosDasVendas(vendas.dados);
  const comparacao = comparacaoDasVendas(anterior);
  const na = comparacao === "ok" && anterior.estado === "ok" ? numerosDasVendas(anterior.dados) : null;
  // Percentual só com base: período anterior lido, com vendas, e valor anterior maior que zero.
  const variacao = (agora: number | null, antes: number | null | undefined, bomQuandoSobe = true): Variacao | undefined => {
    if (agora === null || antes === null || antes === undefined) return undefined;
    const fracao = variacaoFinanceira(agora, antes);
    return fracao === null ? undefined : { fracao, referencia: `vs. ${textos.comparacao}`, bomQuandoSobe };
  };
  const semBase = comparacao === "sem_historico" ? " · sem histórico comparável" : comparacao === "nao_lida" ? " · sem comparação agora" : "";
  return [
    { ...cabecaDeVendas, valor: numero(n.vendas), variacao: variacao(n.vendas, na?.vendas), detalhe: `${n.vendas > 0 ? `${brlCompacto(n.vendido)} vendidos` : "Nenhuma venda concluída no período"}${semBase}` },
    { ...CABECAS.ticket, valor: n.ticket === null ? "Sem vendas" : brl(n.ticket), variacao: variacao(n.ticket, na?.ticket), detalhe: "Vendido ÷ vendas concluídas" },
    {
      ...CABECAS.descontos, valor: brl(n.descontos), variacao: variacao(n.descontos, na?.descontos, false),
      detalhe: n.fracaoDeDesconto === null ? "Sem vendas no período" : `${percentual(n.fracaoDeDesconto)} do valor de tabela · ${plural(n.vendasComDesconto, "venda com desconto", "vendas com desconto")}`,
    },
    { ...CABECAS.desfeito, valor: brl(n.desfeito), variacao: variacao(n.desfeito, na?.desfeito, false), detalhe: `${plural(n.devolucoes, "devolução", "devoluções")} · ${plural(n.cancelamentos, "cancelamento", "cancelamentos")}` },
  ];
}

/** "Recebido na loja": o mesmo número do /financeiro. É registro de pagamento, não dinheiro liquidado. */
export function indicadorDoRecebido(financeiro: Leitura<ResumoFinanceiro>): ItemDoResumo {
  if (financeiro.estado !== "ok") return { ...CABECAS.recebido, valor: "—", detalhe: SEM_LEITURA[financeiro.estado], tom: "atencao" };
  return { ...CABECAS.recebido, valor: brlCompacto(financeiro.dados.recebido), detalhe: "Pagamentos confirmados, troco descontado. Não é liquidação" };
}

/** O que ficou fora da conta da margem: itens sem custo gravado e lojas em que quem pede não vê o custo. */
export const foraDaMargem = (m: MargemDoBanco): string[] => [
  ...(m.totais.itensSemCusto > 0 ? [`${plural(m.totais.itensSemCusto, "item sem custo", "itens sem custo")} fora da conta`] : []),
  ...(m.lojasFora > 0 ? [`${plural(m.lojasFora, "loja", "lojas")} fora (custo não visível para você)`] : []),
];

/**
 * Margem bruta do período (M1), com o percentual sobre o vendido com custo (M3) e o que ficou fora
 * da conta. Quem não tem custo.ver não recebe número nenhum; sem custo gravado a margem é
 * desconhecida, e isso não aparece como zero. Sem comparação com o período anterior.
 */
export function indicadorDaMargem(margem: Leitura<MargemDoBanco> | "sem_permissao"): ItemDoResumo {
  if (margem === "sem_permissao") return { ...CABECAS.margem, valor: "—", detalhe: "Só quem vê o custo dos produtos acompanha a margem" };
  if (margem.estado !== "ok") return { ...CABECAS.margem, valor: "—", detalhe: SEM_LEITURA[margem.estado], tom: "atencao" };
  const m = margem.dados;
  const situacao = situacaoDaMargem(m);
  if (situacao === "sem_vendas") return { ...CABECAS.margem, valor: brl(0), detalhe: "Nenhuma venda, devolução ou cancelamento no período" };
  if (situacao === "lojas_fora") return { ...CABECAS.margem, valor: "—", detalhe: "O movimento do período foi só em loja em que você não vê o custo" };
  if (situacao === "sem_custo") return { ...CABECAS.margem, valor: "Sem custo", detalhe: "Nenhum item do período tinha custo gravado: a margem é desconhecida, não zero", tom: "atencao" };
  const n = numerosDaMargem(m.totais);
  const fora = foraDaMargem(m);
  return {
    ...CABECAS.margem, valor: brlComSinal(n.margem), tom: fora.length > 0 ? "atencao" : "neutro",
    detalhe: [n.fracao === null ? "Sem base para percentual" : `${percentualComSinal(n.fracao)} do vendido com custo`, ...fora].join(" · "),
  };
}

/**
 * Os blocos do resumo: carrossel no celular e grade a partir do tablet. Seis blocos fecham em três
 * colunas; quatro e sete, em quatro (com sete, o primeiro ocupa duas colunas e nenhuma linha sobra).
 */
export function Indicadores({ itens }: { itens: readonly ItemDoResumo[] }) {
  const emTres = itens.length % 3 === 0;
  const primeiroLargo = !emTres && itens.length % 4 === 3;
  return (
    <section aria-label="Resumo do período" className={`${CARROSSEL} ${emTres ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
      {itens.map((i, indice) => (
        <Indicador key={i.rotulo} className={`${INDICADOR}${primeiroLargo && indice === 0 ? " sm:col-span-2" : ""}`} rotulo={i.rotulo} valor={i.valor} icone={i.icone} variacao={i.variacao} detalhe={i.detalhe} tom={i.tom} />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Vendas no tempo, com o período anterior equivalente
// ---------------------------------------------------------------------------------------------
export function PainelDeVendas({ vendas, anterior, janelas, textos, aqui, acao, doVendedor = false, meta = null }: {
  vendas: Leitura<VendasDoBanco>; anterior: Leitura<VendasDoBanco>;
  janelas: { atual: Janela; anterior: Janela; porHora: boolean };
  textos: TextosDoRecorte;
  /** O endereço desta mesma tela, para o "Tentar de novo". */
  aqui: string;
  acao: ReactNode;
  doVendedor?: boolean;
  /** A meta do dia (só nos Relatórios, dia a dia); null: a tela não mostra meta. */
  meta?: MetaDoGrafico | null;
}) {
  const cartao = {
    titulo: doVendedor ? "Minhas vendas" : "Vendas",
    subtitulo: `${janelas.porHora ? "Por hora" : "Por dia"} · vendas concluídas, pela data da conclusão`,
    acao, className: "xl:col-span-2",
  };
  if (vendas.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={vendas.estado} fonte="vendas" tentarDeNovo={aqui} /></Cartao>;

  const n = numerosDasVendas(vendas.dados);
  const comparacao = comparacaoDasVendas(anterior);
  const antes = comparacao === "ok" && anterior.estado === "ok" ? anterior.dados : null;
  const na = antes ? numerosDasVendas(antes) : null;
  const sobreAntes = comparacao === "nao_lida" ? "O período anterior não pôde ser lido agora: sem comparação."
    : na ? `${maiuscula(textos.antes)}: ${brl(na.vendido)} em ${plural(na.vendas, "venda", "vendas")}.`
    : `Sem histórico comparável: nenhuma venda ${textos.antes}.`;

  if (n.vendas === 0) {
    return (
      <Cartao {...cartao}>
        <EstadoVazio titulo="Nenhuma venda concluída no período" icone={ShoppingBag}>
          A leitura está funcionando; só não houve venda concluída {textos.quando}.
        </EstadoVazio>
        <p className={`mt-3 ${NOTA}`}>{sobreAntes}</p>
        {n.desfeito > 0 && <p className={`mt-1 ${NOTA}`}>Houve {brl(n.desfeito)} em devoluções e cancelamentos de vendas anteriores, registrados neste período.</p>}
      </Cartao>
    );
  }

  const fracao = na ? variacaoFinanceira(n.vendido, na.vendido) : null;
  const serie = serieDeVendas(vendas.dados, antes, janelas);
  // A meta do dia (G4c): dia sem meta fica sem valor, e a linha se interrompe ali.
  const metas = meta?.estado === "ok" && !janelas.porHora ? serie.map((p) => meta.porDia(p.chave)) : null;
  const comMeta = (metas ?? []).filter((v): v is number => v !== null);
  const series: SerieLinha[] = [
    { nome: textos.series.atual, serie: 1, area: true, ponto: "maximo", valores: serie.map((p) => p.vendido) },
    // O período anterior só entra no gráfico quando há o que comparar (tracejado, ponto a ponto).
    ...(antes ? [{ nome: textos.series.anterior, serie: "comparacao" as const, tracejada: true, ponto: "nenhum" as const, valores: serie.map((p) => p.vendidoAntes) }] : []),
    ...(metas && comMeta.length > 0 ? [{ nome: "Meta do dia", serie: "meta" as const, tracejada: true, ponto: "nenhum" as const, valores: metas }] : []),
  ];
  const somaDaMeta = comMeta.reduce((soma, v) => soma + v, 0);
  const aviso = meta?.estado === "ok" && meta.aviso ? ` ${meta.aviso}` : "";
  const sobreAMeta = !meta || janelas.porHora ? null
    : meta.estado === "indisponivel" ? "A meta do dia está indisponível neste ambiente: falta a leitura das metas no banco."
    : meta.estado === "falha" ? "A meta do dia não pôde ser lida agora: o gráfico segue sem ela."
    : comMeta.length === 0 ? `Sem meta do vendido líquido nestes dias.${aviso}`
    : comMeta.length < serie.length ? `Meta do dia: a meta do mês do vendido líquido dividida pelos dias do mês. Parte do período está sem meta.${aviso}`
    : `Meta do dia: a meta do mês do vendido líquido dividida pelos dias do mês. No período, ela soma ${brl(somaDaMeta)}, e o vendido líquido está em ${percentual(n.liquido / somaDaMeta)} dela.${aviso}`;
  const unidade = janelas.porHora ? "Hora" : "Dia";
  const colunas = !antes ? [unidade, "Vendas", "Vendido"]
    : janelas.porHora ? ["Hora", "Vendas hoje", "Vendido hoje", "Vendas ontem", "Vendido ontem"]
    : ["Dia", "Vendas", "Vendido", "Dia anterior equivalente", "Vendas no dia anterior", "Vendido no dia anterior"];
  const comColunaDaMeta = metas !== null && comMeta.length > 0;
  const linhas = serie.map((p, i) => {
    const atual = [p.rotulo, numero(p.vendas), brl(p.vendido)];
    const daMeta = comColunaDaMeta ? [metas[i] === null || metas[i] === undefined ? "—" : brl(metas[i])] : [];
    if (!antes) return [...atual, ...daMeta];
    return janelas.porHora ? [...atual, numero(p.vendasAntes), brl(p.vendidoAntes)] : [...atual, p.rotuloAnterior ?? "—", numero(p.vendasAntes), brl(p.vendidoAntes), ...daMeta];
  });

  return (
    <Cartao {...cartao}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className={NUMERO_PRINCIPAL}>{brl(n.vendido)}</p>
          <p className={NOTA}>{plural(n.vendas, "venda", "vendas")} · {brl(n.liquido)} depois de devoluções e cancelamentos</p>
        </div>
        {fracao !== null && <SeloVariacao variacao={{ fracao, referencia: `vs. ${textos.comparacao}` }} />}
      </div>
      <p className={`mt-1 ${NOTA}`}>{sobreAntes}</p>
      <div className="mt-4">
        <Linhas suave series={series} rotulosX={serie.map((p) => p.rotulo)} formatar={brl} formatarEixo={brlEixo} formatarPonto={brlCompacto} cadaRotulo={cadaRotulo(serie.length)} />
      </div>
      {sobreAMeta && <p className={`mt-3 ${NOTA}`}>{sobreAMeta}</p>}
      <TabelaDoGrafico colunas={comColunaDaMeta ? [...colunas, "Meta do dia"] : colunas} linhas={linhas} />
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// Recebimentos por meio (os mesmos números do /financeiro)
// ---------------------------------------------------------------------------------------------
export function PainelDeRecebimentos({ financeiro, aqui, acao }: { financeiro: Leitura<ResumoFinanceiro>; aqui: string; acao: ReactNode }) {
  const cartao = { titulo: "Recebimentos por meio", subtitulo: "Registro na loja, troco descontado. Não é dinheiro liquidado", acao };
  if (financeiro.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={financeiro.estado} fonte="financeiro" tentarDeNovo={aqui} /></Cartao>;

  const f = financeiro.dados;
  const partes = partesRecebidas(f.meios);
  const complementos = [
    ...(f.entradasDeFinanciamento > 0 ? [["Entradas de financiamento (já somadas no meio em que foram pagas)", brl(f.entradasDeFinanciamento)] as const] : []),
    ...f.financiado.map((x) => [`${x.nome}: a receber`, brl(x.valor)] as const),
    ...(f.valeUsado > 0 ? [["Vale-troca usado (crédito, não é dinheiro)", brl(f.valeUsado)] as const] : []),
  ];
  return (
    <Cartao {...cartao}>
      {partes.length === 0 ? (
        <EstadoVazio titulo="Nenhum pagamento confirmado no período" icone={ReceiptText}>A leitura está funcionando; só não houve pagamento confirmado.</EstadoVazio>
      ) : (
        <>
          <p className={NUMERO_PRINCIPAL}>{brl(f.recebido)}</p>
          <p className={`mb-4 ${NOTA}`}>Total registrado no período</p>
          <BarraSegmentada rotulo="Recebido" formatar={brl} partes={partes.map((p) => ({ nome: p.nome, valor: p.valor, serie: p.serie }))} />
          <TabelaDoGrafico colunas={["Meio", "Recebido", "Pagamentos", "Entradas de financiamento"]} linhas={partes.map((p) => [p.nomeInteiro, brl(p.valor), numero(p.quantidade), brl(p.entradas)])} />
        </>
      )}
      {complementos.length > 0 && <ListaDados className="mt-4 border-t border-borda pt-3" itens={complementos} />}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// Mix: grupos (partes do todo) e categorias do cadastro
// ---------------------------------------------------------------------------------------------
const COLUNAS_DO_MIX = ["Itens", "Vendido", "Itens devolvidos ou cancelados", "Devolvido e cancelado"] as const;

export function PainelDoMix({ vendas, aqui, doVendedor = false, className = "xl:col-span-2" }: {
  vendas: Leitura<VendasDoBanco>; aqui: string; doVendedor?: boolean;
  /** Largura do cartão na grade de quem vê a loja ou a rede (o do vendedor ocupa uma coluna). */
  className?: string;
}) {
  const cartao = doVendedor
    ? { titulo: "Minha produção", subtitulo: "Itens que você vendeu, por grupo" }
    : { titulo: "Mix de vendas", subtitulo: "Vendido por grupo e por categoria do produto", className };
  if (vendas.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={vendas.estado} fonte="vendas" tentarDeNovo={aqui} /></Cartao>;

  const grupos = mixPorGrupo(vendas.dados.tipos);
  const total = grupos.reduce((s, g) => ({ itens: s.itens + g.itens, vendido: s.vendido + g.vendido, itensDesfeitos: s.itensDesfeitos + g.itensDesfeitos, desfeito: s.desfeito + g.desfeito }), { itens: 0, vendido: 0, itensDesfeitos: 0, desfeito: 0 });
  const temFato = total.itens > 0 || total.vendido > 0 || total.itensDesfeitos > 0 || total.desfeito > 0;
  const { barras, todas } = categoriasDoMix(vendas.dados.categorias);
  const medidas = (m: { itens: number; vendido: number; itensDesfeitos: number; desfeito: number }) => [numero(m.itens), brl(m.vendido), numero(m.itensDesfeitos), brl(m.desfeito)];
  const comParte = doVendedor ? total.itens > 0 : total.vendido > 0;

  return (
    <Cartao {...cartao}>
      {comParte ? (
        doVendedor ? (
          <>
            <p className={`mb-4 ${NOTA}`}>{plural(total.itens, "item vendido", "itens vendidos")} no período</p>
            <BarraSegmentada rotulo="Itens" formatar={numero} partes={grupos.map((g) => ({ nome: g.nome, valor: g.itens, serie: g.serie }))} />
          </>
        ) : (
          <BarraSegmentada rotulo="Vendido" formatar={brl} partes={grupos.map((g) => ({ nome: g.nome, valor: g.vendido, serie: g.serie }))} />
        )
      ) : (
        <EstadoVazio titulo="Nenhum item vendido no período" icone={Package}>A leitura está funcionando; só não houve item em venda concluída.</EstadoVazio>
      )}
      {temFato && <TabelaDoGrafico titulo="Ver grupos em tabela" colunas={["Grupo", ...COLUNAS_DO_MIX]} linhas={[...grupos.map((g) => [g.nome, ...medidas(g)]), ["Total", ...medidas(total)]]} />}
      {!doVendedor && barras.length > 0 && (
        <div className="mt-5 border-t border-borda pt-4">
          <h3 className="mb-3 text-sm font-semibold">Por categoria</h3>
          <BarrasHorizontais nomeSerie="Vendido" formatar={brl} dados={barras.map((c) => ({ rotulo: c.nome, valor: c.vendido, detalhe: plural(c.itens, "item", "itens") }))} />
        </div>
      )}
      {!doVendedor && todas.length > 0 && (
        <>
          <TabelaDoGrafico titulo="Ver categorias em tabela" colunas={["Categoria", ...COLUNAS_DO_MIX]} linhas={todas.map((c) => [c.nome, ...medidas(c)])} />
          <p className="mt-3 text-xs text-suave">A categoria é a atual do cadastro do produto, não um retrato do dia da venda.</p>
        </>
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// Lojas (e as colunas de desempenho, que o ranking de vendedores do Início também usa)
// ---------------------------------------------------------------------------------------------
export const COLUNAS_DO_DESEMPENHO = ["Vendas", "Vendido", "Devolvido e cancelado", "Líquido", "Ticket médio"] as const;
type Desempenho = { vendas: number; vendido: number; desfeito: number; liquido: number; ticket: number | null };
export const desempenho = (d: Desempenho) => [numero(d.vendas), brl(d.vendido), brl(d.desfeito), brl(d.liquido), semTicket(d.ticket)];
export const temFatos = (d: Desempenho) => d.vendas > 0 || d.vendido > 0 || d.desfeito > 0;

export function PainelDasLojas({ vendas, cadastro, turno, aqui, enderecoDaLoja, doVendedor = false }: {
  vendas: Leitura<VendasDoBanco>; cadastro: readonly LojaDoFiltro[]; turno: LojaDoFiltro; aqui: string;
  /** O endereço desta mesma tela no recorte de uma loja (só quem vê a rede chega a usar). */
  enderecoDaLoja: (loja: string) => string;
  doVendedor?: boolean;
}) {
  const cartao = doVendedor
    ? { titulo: "Onde vendi", subtitulo: "As suas vendas, por loja em que foram feitas" }
    : { titulo: "Desempenho das lojas", subtitulo: "Vendido por loja em que a venda foi feita" };
  if (vendas.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={vendas.estado} fonte="vendas" tentarDeNovo={aqui} /></Cartao>;

  // Rede: toda loja do cadastro aparece, mesmo sem venda (a leitura deu certo e não achou fato).
  const lojas = lojasDoPainel(vendas.dados.lojas, doVendedor ? [] : cadastro);
  // Só quem vê a rede abre o recorte de outra loja; loja fora do cadastro lido fica sem ligação.
  const comLigacao = new Set(doVendedor ? [] : [turno.id, ...cadastro.map((l) => l.id)]);
  return (
    <Cartao {...cartao}>
      {lojas.some((l) => l.vendido > 0) ? (
        <BarrasHorizontais nomeSerie="Vendido" formatar={brl} dados={lojas.map((l) => ({ rotulo: l.nome, valor: l.vendido, detalhe: plural(l.vendas, "venda", "vendas") }))} />
      ) : (
        <EstadoVazio titulo="Nenhuma venda concluída no período" icone={Store}>A leitura está funcionando; nenhuma loja concluiu venda.</EstadoVazio>
      )}
      {lojas.some(temFatos) && (
        <TabelaDoGrafico
          colunas={["Loja", ...COLUNAS_DO_DESEMPENHO]}
          linhas={lojas.map((l) => [comLigacao.has(l.id) ? <Link key={l.id} href={enderecoDaLoja(l.id)} className="font-semibold text-acao hover:underline">{l.nome}</Link> : l.nome, ...desempenho(l)])}
        />
      )}
    </Cartao>
  );
}

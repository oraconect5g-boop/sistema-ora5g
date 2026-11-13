import { BadgePercent, HandCoins, Package, ReceiptText, ShoppingBag, Store, Ticket, Undo2, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BarraSegmentada, BarrasHorizontais, Linhas, TabelaDoGrafico, type SerieLinha } from "../../componentes/graficos";
import { Aviso, Cartao, EstadoVazio, FiltroSegmentado, Indicador, ListaDados, SeloVariacao, type Variacao } from "../../componentes/ui";
import type { LojaDoFiltro } from "../../lib/financeiro/escopo";
import { ORDEM_DOS_PERIODOS, PERIODOS_FINANCEIROS, variacaoFinanceira, type PeriodoFinanceiro, type ResumoFinanceiro } from "../../lib/financeiro/painel";
import { brl, brlCompacto, brlEixo, numero, percentual } from "../../lib/formato";
import type { PaineisComDados, PaineisDoInicio } from "../../lib/inicio/consulta";
import { categoriasDoMix, comparacaoDasVendas, enderecoDoFinanceiro, enderecoDoInicio, lojasDoPainel, mixPorGrupo, NOMES_DAS_SERIES, numerosDasVendas, partesRecebidas, serieDeVendas, vendedoresDoPainel, type Leitura } from "../../lib/inicio/painel";

// Apresentação dos painéis do Início (G1), separada da leitura: recebe o que lib/inicio/consulta leu,
// já com o estado de cada fonte. Sem acesso a dados aqui. Cada painel mantém o título e o espaço em
// qualquer estado (MATRIZ_DEMO_REAL.md, seção 4): com dados, sem movimentação (zero só aqui), sem
// histórico comparável, fonte indisponível, falha de consulta (nunca zero) e sem permissão.

const LIGACAO = "text-sm font-semibold text-acao hover:underline";
const INDICADOR = "w-[78%] shrink-0 snap-start sm:w-auto";
const CARROSSEL = "sem-barra -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0";
const NUMERO_PRINCIPAL = "numeros text-[28px] font-bold leading-tight";
const NOTA = "text-sm text-suave";

const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
const maiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);
const cadaRotulo = (pontos: number) => (pontos > 16 ? 3 : pontos > 8 ? 2 : 1);
const semTicket = (ticket: number | null) => (ticket === null ? "—" : brl(ticket));

const SEM_LEITURA = { indisponivel: "Indisponível neste ambiente", falha: "Não foi possível ler agora" } as const;
const FONTE = {
  vendas: "a leitura agregada das vendas (migration vendas_painel)",
  financeiro: "a leitura agregada do financeiro (migration financeiro_painel)",
  nomes: "a leitura dos nomes do ranking (migration vendas_painel)",
} as const;
const ANTES: Record<PeriodoFinanceiro, string> = { hoje: "ontem até esta hora", "7": "nos 7 dias anteriores", "30": "nos 30 dias anteriores" };

/** O conteúdo de um painel que não tem número para mostrar: o motivo aparece, zero nunca. */
function EstadoDoPainel({ estado, motivo, fonte, tentarDeNovo }: { estado: "indisponivel" | "falha" | "sem_permissao"; motivo?: string; fonte?: keyof typeof FONTE; tentarDeNovo?: string }) {
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
type ItemDoResumo = { rotulo: string; icone: LucideIcon; valor: string; detalhe: string; variacao?: Variacao; tom?: "neutro" | "atencao" };
const CABECAS = {
  vendas: { rotulo: "Vendas realizadas", icone: ShoppingBag },
  ticket: { rotulo: "Ticket médio", icone: Ticket },
  descontos: { rotulo: "Descontos concedidos", icone: BadgePercent },
  desfeito: { rotulo: "Devoluções e cancelamentos", icone: Undo2 },
  recebido: { rotulo: "Recebido na loja (registro)", icone: HandCoins },
  gaveta: { rotulo: "Movimentação dos caixas (dinheiro)", icone: Wallet },
} as const;

function indicadoresDeVendas({ vendas, anterior, periodo, visao }: PaineisComDados): ItemDoResumo[] {
  const cabecaDeVendas = visao === "vendedor" ? { ...CABECAS.vendas, rotulo: "Minhas vendas" } : CABECAS.vendas;
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
    return fracao === null ? undefined : { fracao, referencia: `vs. ${PERIODOS_FINANCEIROS[periodo].comparacao}`, bomQuandoSobe };
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

function indicadoresDoFinanceiro(financeiro: Leitura<ResumoFinanceiro>, conferenteDeCaixa: boolean): ItemDoResumo[] {
  // A permissão vem antes do estado da leitura: sem caixa.conferir a gaveta da loja não é mostrada
  // (o banco só devolveria os caixas da própria pessoa, e a soma pareceria a da loja).
  const semGaveta: ItemDoResumo = { ...CABECAS.gaveta, valor: "—", detalhe: "Só quem confere caixas acompanha a gaveta" };
  if (financeiro.estado !== "ok") {
    const semLeitura = { valor: "—", detalhe: SEM_LEITURA[financeiro.estado], tom: "atencao" as const };
    return [{ ...CABECAS.recebido, ...semLeitura }, conferenteDeCaixa ? { ...CABECAS.gaveta, ...semLeitura } : semGaveta];
  }
  const f = financeiro.dados;
  return [
    { ...CABECAS.recebido, valor: brlCompacto(f.recebido), detalhe: "Pagamentos confirmados, troco descontado. Não é liquidação" },
    conferenteDeCaixa
      ? { ...CABECAS.gaveta, valor: brl(f.saldoDaGaveta), detalhe: `Entradas menos saídas das gavetas no período · ${plural(f.caixas.abertosAgora, "caixa aberto agora", "caixas abertos agora")}` }
      : semGaveta,
  ];
}

function Indicadores({ paineis, conferenteDeCaixa }: { paineis: PaineisComDados; conferenteDeCaixa: boolean }) {
  const itens = [...indicadoresDeVendas(paineis), ...(paineis.financeiro ? indicadoresDoFinanceiro(paineis.financeiro, conferenteDeCaixa) : [])];
  return (
    <section aria-label="Resumo do período" className={`${CARROSSEL} ${itens.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {itens.map((i) => <Indicador key={i.rotulo} className={INDICADOR} rotulo={i.rotulo} valor={i.valor} icone={i.icone} variacao={i.variacao} detalhe={i.detalhe} tom={i.tom} />)}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Vendas no tempo, com o período anterior equivalente
// ---------------------------------------------------------------------------------------------
function PainelDeVendas({ paineis, aqui, acao }: { paineis: PaineisComDados; aqui: string; acao: ReactNode }) {
  const { vendas, anterior, periodo, janelas, visao } = paineis;
  const cartao = {
    titulo: visao === "vendedor" ? "Minhas vendas" : "Vendas",
    subtitulo: `${janelas.porHora ? "Por hora" : "Por dia"} · vendas concluídas, pela data da conclusão`,
    acao, className: "xl:col-span-2",
  };
  if (vendas.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={vendas.estado} fonte="vendas" tentarDeNovo={aqui} /></Cartao>;

  const n = numerosDasVendas(vendas.dados);
  const comparacao = comparacaoDasVendas(anterior);
  const antes = comparacao === "ok" && anterior.estado === "ok" ? anterior.dados : null;
  const na = antes ? numerosDasVendas(antes) : null;
  const sobreAntes = comparacao === "nao_lida" ? "O período anterior não pôde ser lido agora: sem comparação."
    : na ? `${maiuscula(ANTES[periodo])}: ${brl(na.vendido)} em ${plural(na.vendas, "venda", "vendas")}.`
    : `Sem histórico comparável: nenhuma venda ${ANTES[periodo]}.`;

  if (n.vendas === 0) {
    return (
      <Cartao {...cartao}>
        <EstadoVazio titulo="Nenhuma venda concluída no período" icone={ShoppingBag}>
          A leitura está funcionando; só não houve venda concluída {periodo === "hoje" ? "hoje" : "no período"}.
        </EstadoVazio>
        <p className={`mt-3 ${NOTA}`}>{sobreAntes}</p>
        {n.desfeito > 0 && <p className={`mt-1 ${NOTA}`}>Houve {brl(n.desfeito)} em devoluções e cancelamentos de vendas anteriores, registrados neste período.</p>}
      </Cartao>
    );
  }

  const fracao = na ? variacaoFinanceira(n.vendido, na.vendido) : null;
  const serie = serieDeVendas(vendas.dados, antes, janelas);
  const nomes = NOMES_DAS_SERIES[periodo];
  const series: SerieLinha[] = [
    { nome: nomes.atual, serie: 1, area: true, ponto: "maximo", valores: serie.map((p) => p.vendido) },
    // O período anterior só entra no gráfico quando há o que comparar (tracejado, ponto a ponto).
    ...(antes ? [{ nome: nomes.anterior, serie: "comparacao" as const, tracejada: true, ponto: "nenhum" as const, valores: serie.map((p) => p.vendidoAntes) }] : []),
  ];
  const unidade = janelas.porHora ? "Hora" : "Dia";
  const colunas = !antes ? [unidade, "Vendas", "Vendido"]
    : janelas.porHora ? ["Hora", "Vendas hoje", "Vendido hoje", "Vendas ontem", "Vendido ontem"]
    : ["Dia", "Vendas", "Vendido", "Dia anterior equivalente", "Vendas no dia anterior", "Vendido no dia anterior"];
  const linhas = serie.map((p) => {
    const atual = [p.rotulo, numero(p.vendas), brl(p.vendido)];
    if (!antes) return atual;
    return janelas.porHora ? [...atual, numero(p.vendasAntes), brl(p.vendidoAntes)] : [...atual, p.rotuloAnterior ?? "—", numero(p.vendasAntes), brl(p.vendidoAntes)];
  });

  return (
    <Cartao {...cartao}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className={NUMERO_PRINCIPAL}>{brl(n.vendido)}</p>
          <p className={NOTA}>{plural(n.vendas, "venda", "vendas")} · {brl(n.liquido)} depois de devoluções e cancelamentos</p>
        </div>
        {fracao !== null && <SeloVariacao variacao={{ fracao, referencia: `vs. ${PERIODOS_FINANCEIROS[periodo].comparacao}` }} />}
      </div>
      <p className={`mt-1 ${NOTA}`}>{sobreAntes}</p>
      <div className="mt-4">
        <Linhas suave series={series} rotulosX={serie.map((p) => p.rotulo)} formatar={brl} formatarEixo={brlEixo} formatarPonto={brlCompacto} cadaRotulo={cadaRotulo(serie.length)} />
      </div>
      <TabelaDoGrafico colunas={colunas} linhas={linhas} />
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// Recebimentos por meio (os mesmos números do /financeiro)
// ---------------------------------------------------------------------------------------------
function PainelDeRecebimentos({ financeiro, aqui, acao }: { financeiro: Leitura<ResumoFinanceiro>; aqui: string; acao: ReactNode }) {
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

function PainelDoMix({ paineis, aqui }: { paineis: PaineisComDados; aqui: string }) {
  const { vendas, visao } = paineis;
  const doVendedor = visao === "vendedor";
  const cartao = doVendedor
    ? { titulo: "Minha produção", subtitulo: "Itens que você vendeu, por grupo" }
    : { titulo: "Mix de vendas", subtitulo: "Vendido por grupo e por categoria do produto", className: "xl:col-span-2" };
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
// Lojas e vendedores
// ---------------------------------------------------------------------------------------------
const COLUNAS_DO_DESEMPENHO = ["Vendas", "Vendido", "Devolvido e cancelado", "Líquido", "Ticket médio"] as const;
type Desempenho = { vendas: number; vendido: number; desfeito: number; liquido: number; ticket: number | null };
const desempenho = (d: Desempenho) => [numero(d.vendas), brl(d.vendido), brl(d.desfeito), brl(d.liquido), semTicket(d.ticket)];
const temFatos = (d: Desempenho) => d.vendas > 0 || d.vendido > 0 || d.desfeito > 0;

function PainelDasLojas({ paineis, turno, aqui }: { paineis: PaineisComDados; turno: LojaDoFiltro; aqui: string }) {
  const { vendas, cadastro, periodo, visao } = paineis;
  const doVendedor = visao === "vendedor";
  const cartao = doVendedor
    ? { titulo: "Onde vendi", subtitulo: "As suas vendas, por loja em que foram feitas" }
    : { titulo: "Desempenho das lojas", subtitulo: "Vendido por loja em que a venda foi feita" };
  if (vendas.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={vendas.estado} fonte="vendas" tentarDeNovo={aqui} /></Cartao>;

  // Rede: toda loja do cadastro aparece, mesmo sem venda (a leitura deu certo e não achou fato).
  const lojas = lojasDoPainel(vendas.dados.lojas, doVendedor ? [] : cadastro);
  // Só quem vê a rede abre o Início de outra loja; loja fora do cadastro lido fica sem ligação.
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
          linhas={lojas.map((l) => [comLigacao.has(l.id) ? <Link key={l.id} href={enderecoDoInicio(periodo, l.id)} className="font-semibold text-acao hover:underline">{l.nome}</Link> : l.nome, ...desempenho(l)])}
        />
      )}
    </Cartao>
  );
}

function PainelDeVendedores({ paineis, usuario, aqui }: { paineis: PaineisComDados; usuario: string; aqui: string }) {
  const { vendas, nomes, visao, escopo } = paineis;
  const daRedeInteira = visao === "rede" && escopo.unidade === null;
  const limite = daRedeInteira ? 10 : 12;
  const cartao = { titulo: daRedeInteira ? "Melhores vendedores" : "Equipe", subtitulo: "Vendido por vendedor de origem. Não é comissão" };
  if (nomes === "sem_permissao") {
    return <Cartao {...cartao}><EstadoDoPainel estado="sem_permissao" motivo="Você não tem a permissão de ver o ranking de vendedores nesta loja." /></Cartao>;
  }
  if (vendas.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={vendas.estado} fonte="vendas" tentarDeNovo={aqui} /></Cartao>;
  // Sem os nomes não há ranking: nenhum número é mostrado (nada de lista de "não identificados").
  if (nomes === null || nomes.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={nomes?.estado ?? "falha"} fonte="nomes" tentarDeNovo={aqui} /></Cartao>;

  const vendedores = vendedoresDoPainel(vendas.dados.vendedores, nomes.dados, usuario);
  const comVenda = vendedores.filter((v) => v.vendido > 0);
  return (
    <Cartao {...cartao}>
      {comVenda.length > 0 ? (
        <>
          <BarrasHorizontais duasColunas={daRedeInteira} nomeSerie="Vendido" formatar={brl} dados={comVenda.slice(0, limite).map((v) => ({ rotulo: v.nome, valor: v.vendido, detalhe: plural(v.vendas, "venda", "vendas") }))} />
          {comVenda.length > limite && <p className="mt-3 text-xs text-suave">O gráfico mostra os {limite} primeiros; a tabela traz todos os {numero(vendedores.length)}.</p>}
        </>
      ) : (
        <EstadoVazio titulo="Nenhuma venda concluída no período" icone={Users}>A leitura está funcionando; ninguém concluiu venda neste recorte.</EstadoVazio>
      )}
      {vendedores.some(temFatos) && <TabelaDoGrafico colunas={["Vendedor", ...COLUNAS_DO_DESEMPENHO]} linhas={vendedores.map((v) => [v.nome, ...desempenho(v)])} />}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// A seção inteira, na visão de quem pede
// ---------------------------------------------------------------------------------------------
export function ConteudoInicio({ paineis, usuario, turno, conferenteDeCaixa }: { paineis: PaineisDoInicio; usuario: string; turno: LojaDoFiltro; conferenteDeCaixa: boolean }) {
  if (paineis.visao === "nenhuma") {
    return (
      <Cartao titulo="Vendas">
        <EstadoDoPainel estado="sem_permissao" motivo="Você não tem permissão para acompanhar vendas nesta loja." />
      </Cartao>
    );
  }
  const { visao, periodo, escopo, filtroDeLojas, vendas, financeiro } = paineis;
  const daRede = visao === "rede";
  const doVendedor = visao === "vendedor";
  const redeInteira = daRede && escopo.unidade === null;
  // Só quem vê a rede leva a loja no endereço; os demais ficam na loja do turno.
  const lojaDoEndereco = daRede ? escopo.unidade : null;
  const aqui = enderecoDoInicio(periodo, lojaDoEndereco);
  const recorte = PERIODOS_FINANCEIROS[periodo].rotulo;

  return (
    <section aria-labelledby="titulo-dos-paineis" className="space-y-4">
      <header className="flex flex-col gap-3">
        <div>
          <h2 id="titulo-dos-paineis" className="text-lg font-bold tracking-tight">{doVendedor ? "Meus resultados" : "Acompanhamento das vendas"}</h2>
          <p className={NOTA}>
            {doVendedor ? `Só as suas vendas (você como vendedor de origem), nas lojas em que você trabalha · ${recorte}` : `${escopo.nome} · ${recorte}`}
          </p>
        </div>
        <FiltroSegmentado rotulo="Período" opcoes={ORDEM_DOS_PERIODOS.map((p) => ({ href: enderecoDoInicio(p, lojaDoEndereco), rotulo: PERIODOS_FINANCEIROS[p].rotulo, ativo: p === periodo }))} />
        {filtroDeLojas.length > 0 && (
          <FiltroSegmentado rotulo="Loja" opcoes={filtroDeLojas.map((l) => ({ href: enderecoDoInicio(periodo, l.id === "rede" ? null : l.id), rotulo: l.nome, ativo: l.id === escopo.chave }))} />
        )}
      </header>

      <Indicadores paineis={paineis} conferenteDeCaixa={conferenteDeCaixa} />

      {doVendedor ? (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <PainelDeVendas paineis={paineis} aqui={aqui} acao={<Link href="/vendas" className={LIGACAO}>Ver minhas vendas</Link>} />
            <PainelDoMix paineis={paineis} aqui={aqui} />
          </div>
          {vendas.estado === "ok" && vendas.dados.lojas.length > 1 && <PainelDasLojas paineis={paineis} turno={turno} aqui={aqui} />}
          {/* Decisão pendente P3: nomes dos colegas ou só a própria posição. Até lá, nada da loja aqui. */}
          <Cartao titulo="Resumo da loja e ranking">
            <EstadoDoPainel estado="sem_permissao" motivo="O resumo da loja e o ranking com os colegas ainda não estão liberados para vendedores: dependem de uma decisão do proprietário. Por enquanto, você acompanha só as suas vendas." />
          </Cartao>
        </>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <PainelDeVendas paineis={paineis} aqui={aqui} acao={<Link href={enderecoDoFinanceiro(periodo, escopo, turno.id, daRede)} className={LIGACAO}>Conferir no financeiro</Link>} />
            {financeiro && <PainelDeRecebimentos financeiro={financeiro} aqui={aqui} acao={<Link href={enderecoDoFinanceiro(periodo, escopo, turno.id, daRede, "pagamentos")} className={LIGACAO}>Ver pagamentos</Link>} />}
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <PainelDoMix paineis={paineis} aqui={aqui} />
            {redeInteira ? <PainelDasLojas paineis={paineis} turno={turno} aqui={aqui} /> : <PainelDeVendedores paineis={paineis} usuario={usuario} aqui={aqui} />}
          </div>
          {redeInteira && <PainelDeVendedores paineis={paineis} usuario={usuario} aqui={aqui} />}
        </>
      )}
    </section>
  );
}

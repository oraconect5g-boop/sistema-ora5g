// Consultas dos Relatórios (lote G2a). Vendas e recebimentos são as mesmas leituras do Início
// (lib/inicio/consulta); a margem vem de lib/margem/consulta e só é pedida para quem tem custo.ver:
// sem a permissão, o banco nem é perguntado. Cada leitura devolve o próprio estado ("ok",
// "indisponivel" ou "falha"); falha nunca vira zero e não derruba a página. O que cada pessoa lê é
// decidido no banco (RLS e tem_permissao); aqui só se escolhe quais perguntas fazer.
import type { obterSessao } from "../acesso/sessao";
import { consultarProducao } from "../connect/consulta-producao";
import type { ProducaoDoBanco } from "../connect/producao";
import type { Escopo, LojaDoFiltro } from "../financeiro/escopo";
import type { ResumoFinanceiro } from "../financeiro/painel";
import { POR_PAGINA } from "../financeiro/registros";
import { consultarFinanceiro, consultarVendas, lojasQueVendem, nomesDoRanking } from "../inicio/consulta";
import { escopoDoInicio, lojasDoFiltro, type Leitura, type VendasDoBanco } from "../inicio/painel";
import { consultarReservasDoSite, type PainelDasReservas } from "../loja/painel-das-reservas";
import { consultarItensDaMargem, consultarMargem, consultarMargemPorVendedor } from "../margem/consulta";
import { consultarMetasDasLojas } from "../metas/consulta";
import { mesesDaJanela, type MetasDasLojas } from "../metas/painel";
import type { Janela } from "../financeiro/painel";
import type { ItensDaMargem, MargemDoBanco, MargemPorVendedor } from "../margem/painel";
import { janelasDoRelatorio, type PeriodoDoRelatorio } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FALHA = { estado: "falha" } as const;

/**
 * De qual loja é o relatório. Quem vê a rede começa pela rede inteira e pode escolher uma loja do
 * cadastro; os demais ficam na loja do turno, qualquer que seja o endereço pedido. null: a lista de
 * lojas não pôde ser lida, e sem ela não dá para conferir a loja pedida.
 */
export async function escopoDosRelatorios(supabase: Cliente, loja: string | undefined, turno: LojaDoFiltro, daRede: boolean): Promise<{ escopo: Escopo; cadastro: LojaDoFiltro[] } | null> {
  const cadastro = daRede ? await lojasQueVendem(supabase, "relatorios") : [];
  return cadastro ? { escopo: escopoDoInicio(loja, cadastro, turno, daRede), cadastro } : null;
}

export type Relatorios = {
  periodo: PeriodoDoRelatorio;
  escopo: Escopo;
  daRede: boolean;
  janelas: ReturnType<typeof janelasDoRelatorio>;
  /** Opções do filtro de loja; vazio para quem não escolhe loja. */
  filtroDeLojas: LojaDoFiltro[];
  /** Lojas do cadastro que a pessoa lê: entram com zero no desempenho da rede quando não venderam. */
  cadastro: LojaDoFiltro[];
  vendas: Leitura<VendasDoBanco>;
  /** A mesma janela, deslocada em dias inteiros. */
  anterior: Leitura<VendasDoBanco>;
  financeiro: Leitura<ResumoFinanceiro>;
  /** "sem_permissao": quem pede não tem custo.ver, e o banco não foi perguntado. */
  margem: Leitura<MargemDoBanco> | "sem_permissao";
  /** Uma página do detalhe da margem, por item. */
  itens: Leitura<ItensDaMargem> | "sem_permissao";
  /**
   * PERF-003b: a margem por vendedor de origem e os nomes (ranking_nomes). "sem_permissao": sem custo.ver, e o banco
   * não foi perguntado; null: o banco ainda não tem a função (o bloco não aparece).
   */
  vendedores: Leitura<{ margem: MargemPorVendedor; nomes: ReadonlyMap<string, string> }> | "sem_permissao" | null;
  /** Chips vendidos e operações do Ora Connect confirmadas (lote G4a). */
  producao: Leitura<ProducaoDoBanco>;
  /** As metas das lojas em cada mês que o período toca (G4c), para a meta do dia. null: quem pede não acompanha metas. */
  metas: Leitura<MetasDasLojas[]> | null;
  /** MKT-a: as reservas do site do período por origem e campanha, e as vendas que vieram delas, com os nomes de quem vendeu. */
  reservasDoSite: Leitura<PainelDasReservas & { nomes: ReadonlyMap<string, string> }>;
  pagina: number;
};

export type PedidoDosRelatorios = {
  periodo: PeriodoDoRelatorio;
  /** Parâmetro ?loja do endereço (só vale para quem vê a rede). */
  loja: string | undefined;
  turno: LojaDoFiltro;
  /** Tem venda.ver_todas. */
  daRede: boolean;
  /** Tem custo.ver na loja do turno. */
  custo: boolean;
  /** Acompanha as metas (metas.gerir ou metas.ver_unidade): a meta do dia aparece na linha das vendas. */
  metas: boolean;
  /** Página do detalhe da margem. */
  pagina: number;
  agora?: Date;
};

/** Lê tudo o que a tela dos Relatórios mostra, no recorte pedido. */
export async function lerRelatorios(supabase: Cliente, pedido: PedidoDosRelatorios): Promise<Relatorios> {
  const { periodo, turno, daRede, pagina } = pedido;
  const janelas = janelasDoRelatorio(periodo, pedido.agora);
  const margemSemPedir = pedido.custo ? FALHA : "sem_permissao";
  const lido = await escopoDosRelatorios(supabase, pedido.loja, turno, daRede);
  if (!lido) {
    // Sem a lista de lojas não dá para conferir a loja pedida no endereço: nenhum número é mostrado.
    return {
      periodo, daRede, janelas, pagina, escopo: escopoDoInicio(pedido.loja, [], turno, daRede), filtroDeLojas: [], cadastro: [],
      // A margem por vendedor (PERF-003b) é um bloco que some sem a função no banco: sem pergunta, não aparece.
      vendas: FALHA, anterior: FALHA, financeiro: FALHA, margem: margemSemPedir, itens: margemSemPedir, vendedores: pedido.custo ? null : "sem_permissao", producao: FALHA, metas: pedido.metas ? FALHA : null, reservasDoSite: FALHA,
    };
  }
  const { escopo, cadastro } = lido;
  const filtro = { unidade: escopo.unidade, vendedor: null };
  const [vendas, anterior, financeiro, margem, itens, vendedores, producao, metas, reservasDoSite] = await Promise.all([
    consultarVendas(supabase, janelas.atual, filtro, false),
    consultarVendas(supabase, janelas.anterior, filtro, false),
    consultarFinanceiro(supabase, janelas.atual, escopo.unidade),
    pedido.custo ? consultarMargem(supabase, janelas.atual, escopo.unidade) : "sem_permissao" as const,
    pedido.custo ? consultarItensDaMargem(supabase, janelas.atual, escopo.unidade, { limite: POR_PAGINA, apos: (pagina - 1) * POR_PAGINA }) : "sem_permissao" as const,
    pedido.custo ? margemDosVendedores(supabase, janelas.atual, escopo.unidade) : "sem_permissao" as const,
    consultarProducao(supabase, janelas.atual, filtro),
    pedido.metas ? metasDoPeriodo(supabase, janelas.atual, escopo.unidade) : null,
    consultarReservasDoSite(supabase, janelas.atual, escopo.unidade),
  ]);
  return { periodo, daRede, janelas, pagina, escopo, cadastro, filtroDeLojas: daRede ? lojasDoFiltro(cadastro, turno) : [], vendas, anterior, financeiro, margem, itens, vendedores, producao, metas, reservasDoSite };
}

/** PERF-003b: a margem por vendedor e, depois, os nomes. Nome que não se leu é falha do bloco inteiro (nunca meia tabela). */
async function margemDosVendedores(supabase: Cliente, janela: Janela, unidade: string | null): Promise<Relatorios["vendedores"]> {
  const margem = await consultarMargemPorVendedor(supabase, janela, unidade);
  if (margem === null || margem.estado !== "ok") return margem;
  const nomes = await nomesDoRanking(supabase, margem.dados.vendedores.map((v) => v.vendedor));
  return nomes.estado === "ok" ? { estado: "ok", dados: { margem: margem.dados, nomes: nomes.dados } } : FALHA;
}

/** As metas de cada mês que a janela toca (um ou dois): todas lidas, ou o pior estado (falha antes de indisponível). */
async function metasDoPeriodo(supabase: Cliente, janela: Janela, unidade: string | null): Promise<Leitura<MetasDasLojas[]>> {
  const lidas = await Promise.all(mesesDaJanela(janela).map((mes) => consultarMetasDasLojas(supabase, mes, unidade)));
  if (lidas.some((l) => l.estado === "falha")) return FALHA;
  if (lidas.some((l) => l.estado === "indisponivel")) return { estado: "indisponivel" };
  return { estado: "ok", dados: lidas.flatMap((l) => (l.estado === "ok" ? [l.dados] : [])) };
}

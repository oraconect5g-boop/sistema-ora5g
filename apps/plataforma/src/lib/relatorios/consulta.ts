// Consultas dos Relatórios (lote G2a). Vendas e recebimentos são as mesmas leituras do Início
// (lib/inicio/consulta); a margem vem de lib/margem/consulta e só é pedida para quem tem custo.ver:
// sem a permissão, o banco nem é perguntado. Cada leitura devolve o próprio estado ("ok",
// "indisponivel" ou "falha"); falha nunca vira zero e não derruba a página. O que cada pessoa lê é
// decidido no banco (RLS e tem_permissao); aqui só se escolhe quais perguntas fazer.
import { FalhaDoServico, type obterSessao } from "../acesso/sessao";
import type { Escopo, LojaDoFiltro } from "../financeiro/escopo";
import type { ResumoFinanceiro } from "../financeiro/painel";
import { POR_PAGINA } from "../financeiro/registros";
import { consultarFinanceiro, consultarVendas, lojasQueVendem } from "../inicio/consulta";
import { escopoDoInicio, lojasDoFiltro, type Leitura, type VendasDoBanco } from "../inicio/painel";
import { consultarItensDaMargem, consultarMargem } from "../margem/consulta";
import type { ItensDaMargem, MargemDoBanco } from "../margem/painel";
import { janelasDoRelatorio, type PeriodoDoRelatorio } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FALHA = { estado: "falha" } as const;

/**
 * custo.ver na loja do turno: decide se a margem aparece na tela e no arquivo. Sem resposta do banco
 * não há como decidir: a página para. O banco confere de novo, loja a loja, dentro de margem_painel.
 */
export async function podeVerCusto(supabase: Cliente, unidade: string): Promise<boolean> {
  const r = await supabase.rpc("tem_permissao", { p_permissao: "custo.ver", p_unidade: unidade });
  if (r.error) throw new FalhaDoServico("relatorios_permissoes");
  return r.data === true;
}

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
      vendas: FALHA, anterior: FALHA, financeiro: FALHA, margem: margemSemPedir, itens: margemSemPedir,
    };
  }
  const { escopo, cadastro } = lido;
  const filtro = { unidade: escopo.unidade, vendedor: null };
  const [vendas, anterior, financeiro, margem, itens] = await Promise.all([
    consultarVendas(supabase, janelas.atual, filtro, false),
    consultarVendas(supabase, janelas.anterior, filtro, false),
    consultarFinanceiro(supabase, janelas.atual, escopo.unidade),
    pedido.custo ? consultarMargem(supabase, janelas.atual, escopo.unidade) : "sem_permissao" as const,
    pedido.custo ? consultarItensDaMargem(supabase, janelas.atual, escopo.unidade, { limite: POR_PAGINA, apos: (pagina - 1) * POR_PAGINA }) : "sem_permissao" as const,
  ]);
  return { periodo, daRede, janelas, pagina, escopo, cadastro, filtroDeLojas: daRede ? lojasDoFiltro(cadastro, turno) : [], vendas, anterior, financeiro, margem, itens };
}

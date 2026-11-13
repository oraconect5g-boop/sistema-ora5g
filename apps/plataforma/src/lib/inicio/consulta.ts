// Consultas dos painéis do Início (lote G1). Cada leitura devolve o próprio estado: "ok",
// "indisponivel" (o banco do ambiente ainda não tem a função) ou "falha" (a consulta não respondeu ou
// veio em forma inesperada). Falha nunca vira zero e não derruba a página: as pendências e os atalhos
// do Início continuam. O que cada perfil lê é decidido no banco (RLS e tem_permissao); a visão daqui
// só escolhe quais perguntas fazer. Os registros de erro levam só o código, nunca valor nem nome.
import { FalhaDoServico, type obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { consultarPainel } from "../financeiro/consulta";
import type { Escopo, LojaDoFiltro } from "../financeiro/escopo";
import { janelasDoPeriodo, RespostaInesperada, resumoDoPainel, type Janela, type PeriodoFinanceiro, type ResumoFinanceiro } from "../financeiro/painel";
import { escopoDoInicio, lerVendas, lojasDoFiltro, type Leitura, type VendasDoBanco, type Visao } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
const FALHA = { estado: "falha" } as const;
const INDISPONIVEL = { estado: "indisponivel" } as const;

/**
 * As duas permissões que só o Início pergunta (não fazem parte do menu): ver o ranking de vendedores
 * e ver as próprias vendas. Sem resposta do banco não há como decidir a visão: a página para.
 */
export async function permissoesDoInicio(supabase: Cliente, unidade: string): Promise<{ ranking: boolean; propria: boolean }> {
  const [ranking, propria] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "ranking.ver", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "venda.ver_propria", p_unidade: unidade }),
  ]);
  if (ranking.error || propria.error) throw new FalhaDoServico("inicio_permissoes");
  return { ranking: ranking.data === true, propria: propria.data === true };
}

/** Vendas do período inteiro, somadas no banco (public.vendas_painel, com o RLS de quem pede). */
export async function consultarVendas(supabase: Cliente, janela: Janela, filtro: { unidade: string | null; vendedor: string | null }, porHora: boolean): Promise<Leitura<VendasDoBanco>> {
  const r = await supabase.rpc("vendas_painel", {
    p_inicio: janela.inicio.toISOString(), p_fim: janela.fim.toISOString(), p_por_hora: porHora,
    ...(filtro.unidade ? { p_unidade: filtro.unidade } : {}),
    ...(filtro.vendedor ? { p_vendedor: filtro.vendedor } : {}),
  });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return INDISPONIVEL;
    console.error("inicio: falha ao consultar vendas_painel", { codigo: r.error.code || null });
    return FALHA;
  }
  try {
    return { estado: "ok", dados: lerVendas(r.data) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("inicio: resposta inesperada de vendas_painel");
    return FALHA;
  }
}

/** Recebimentos e gaveta do período: a mesma leitura e o mesmo cálculo do /financeiro. */
export async function consultarFinanceiro(supabase: Cliente, janela: Janela, unidade: string | null): Promise<Leitura<ResumoFinanceiro>> {
  try {
    const painel = await consultarPainel(supabase, janela, unidade, false);
    return painel === "indisponivel" ? INDISPONIVEL : { estado: "ok", dados: resumoDoPainel(painel) };
  } catch (erro) {
    const motivo = erro instanceof FalhaDoServico ? "consulta" : erro instanceof RespostaInesperada || erro instanceof ValorForaDoLimite ? "resposta" : null;
    if (!motivo) throw erro;
    console.error("inicio: falha ao ler financeiro_painel", { motivo });
    return FALHA;
  }
}

/** Nome de quem aparece no ranking (public.ranking_nomes: só responde a quem tem ranking.ver na loja da venda). */
export async function nomesDoRanking(supabase: Cliente, vendedores: readonly string[]): Promise<Leitura<Map<string, string>>> {
  if (vendedores.length === 0) return { estado: "ok", dados: new Map() };
  const r = await supabase.rpc("ranking_nomes", { p_vendedores: [...vendedores] });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return INDISPONIVEL;
    console.error("inicio: falha ao consultar ranking_nomes", { codigo: r.error.code || null });
    return FALHA;
  }
  const linhas: unknown = r.data;
  if (!Array.isArray(linhas)) {
    console.error("inicio: resposta inesperada de ranking_nomes");
    return FALHA;
  }
  const nomes = new Map<string, string>();
  for (const l of linhas as { id?: unknown; nome?: unknown }[]) {
    if (typeof l?.id === "string" && typeof l.nome === "string" && l.nome !== "") nomes.set(l.id, l.nome);
  }
  return { estado: "ok", dados: nomes };
}

export type PaineisComDados = {
  visao: Exclude<Visao, "nenhuma">;
  periodo: PeriodoFinanceiro;
  escopo: Escopo;
  janelas: ReturnType<typeof janelasDoPeriodo>;
  /** Opções do filtro de loja; vazio para quem não escolhe loja. */
  filtroDeLojas: LojaDoFiltro[];
  /** Lojas do cadastro que a pessoa lê: entram com zero no desempenho da rede quando não venderam. */
  cadastro: LojaDoFiltro[];
  vendas: Leitura<VendasDoBanco>;
  /** A mesma janela, deslocada em dias inteiros, com o mesmo grão (hora ou dia). */
  anterior: Leitura<VendasDoBanco>;
  /** null: a visão do vendedor não lê recebimentos nem gaveta. */
  financeiro: Leitura<ResumoFinanceiro> | null;
  /** null: não se aplica (visão do vendedor, ou as vendas não foram lidas). */
  nomes: Leitura<Map<string, string>> | "sem_permissao" | null;
};
export type PaineisDoInicio = { visao: "nenhuma" } | PaineisComDados;

export type PedidoDosPaineis = {
  visao: Visao;
  periodo: PeriodoFinanceiro;
  /** Parâmetro ?loja do endereço (só vale para quem vê a rede). */
  loja: string | undefined;
  turno: LojaDoFiltro;
  usuario: string;
  /** Tem ranking.ver na loja do turno. */
  ranking: boolean;
  agora?: Date;
};

/**
 * Lê tudo o que os painéis do Início mostram, na visão de quem pede:
 *   rede      vendas da rede (ou da loja escolhida), recebimentos e ranking;
 *   loja      o mesmo, só da loja do turno;
 *   vendedor  só as próprias vendas (p_vendedor), sem recebimentos, gaveta nem colegas;
 *   nenhuma   não pergunta nada ao banco.
 */
export async function lerPaineisDoInicio(supabase: Cliente, pedido: PedidoDosPaineis): Promise<PaineisDoInicio> {
  const { visao, periodo, turno } = pedido;
  if (visao === "nenhuma") return { visao };
  const janelas = janelasDoPeriodo(periodo, pedido.agora);
  const daRede = visao === "rede";

  let cadastro: LojaDoFiltro[] = [];
  let cadastroLido = true;
  if (daRede) {
    const r = await supabase.from("unidades").select("id, nome, tipo").in("tipo", ["loja_fisica", "online"]).order("nome");
    if (r.error) {
      console.error("inicio: falha ao consultar as lojas", { codigo: r.error.code || null });
      cadastroLido = false;
    } else {
      cadastro = r.data.map((l) => ({ id: l.id, nome: l.nome }));
    }
  }
  const escopo = escopoDoInicio(pedido.loja, cadastro, turno, daRede);
  const base = { visao, periodo, escopo, janelas, cadastro, filtroDeLojas: daRede && cadastroLido ? lojasDoFiltro(cadastro, turno) : [] };
  // Sem a lista de lojas não dá para conferir a loja pedida no endereço: nenhum número é mostrado.
  if (!cadastroLido) return { ...base, vendas: FALHA, anterior: FALHA, financeiro: FALHA, nomes: null };

  const filtro = visao === "vendedor" ? { unidade: null, vendedor: pedido.usuario } : { unidade: escopo.unidade, vendedor: null };
  const [vendas, anterior, financeiro] = await Promise.all([
    consultarVendas(supabase, janelas.atual, filtro, janelas.porHora),
    consultarVendas(supabase, janelas.anterior, filtro, janelas.porHora),
    visao === "vendedor" ? null : consultarFinanceiro(supabase, janelas.atual, escopo.unidade),
  ]);
  // A permissão vem antes do estado da leitura: quem não tem ranking.ver lê "sem permissão" mesmo
  // quando as vendas falharam, e o banco nem é perguntado pelos nomes.
  const nomes = visao === "vendedor" ? null
    : !pedido.ranking ? "sem_permissao"
    : vendas.estado !== "ok" ? null
    : await nomesDoRanking(supabase, vendas.dados.vendedores.map((v) => v.vendedorId));
  return { ...base, vendas, anterior, financeiro, nomes };
}

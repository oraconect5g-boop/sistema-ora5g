// Consultas da margem bruta (lote G2): public.margem_painel e public.margem_itens, as duas com o RLS
// e o custo.ver de quem pede (security invoker). Cada leitura devolve o próprio estado: "ok",
// "indisponivel" (o banco do ambiente ainda não tem a função) ou "falha" (a consulta não respondeu ou
// veio em forma inesperada). Falha nunca vira zero. Os registros de erro levam só o código, nunca
// valor, custo nem nome.
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada, type Janela } from "../financeiro/painel";
import { LIMITE_DA_EXPORTACAO } from "../financeiro/registros";
import type { Leitura } from "../leitura-do-banco";
import { lerItensDaMargem, lerMargem, lerMargemPorVendedor, type ItemDaMargem, type ItensDaMargem, type MargemDoBanco, type MargemPorVendedor } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
const FALHA = { estado: "falha" } as const;
const INDISPONIVEL = { estado: "indisponivel" } as const;
/** Itens por pedido na exportação: o máximo que public.margem_itens aceita de uma vez. */
const LOTE = 1000;

const periodo = (janela: Janela, unidade: string | null) => ({
  p_inicio: janela.inicio.toISOString(), p_fim: janela.fim.toISOString(), ...(unidade ? { p_unidade: unidade } : {}),
});

function conferir<T>(funcao: string, dado: unknown, ler: (dado: unknown) => T): Leitura<T> {
  try {
    return { estado: "ok", dados: ler(dado) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error(`margem: resposta inesperada de ${funcao}`);
    return FALHA;
  }
}

/** Margem do período inteiro, no total e por dia, somada no banco. Só as lojas em que quem pede vê custo. */
export async function consultarMargem(supabase: Cliente, janela: Janela, unidade: string | null): Promise<Leitura<MargemDoBanco>> {
  const r = await supabase.rpc("margem_painel", periodo(janela, unidade));
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return INDISPONIVEL;
    console.error("margem: falha ao consultar margem_painel", { codigo: r.error.code || null });
    return FALHA;
  }
  return conferir("margem_painel", r.data, lerMargem);
}

/**
 * PERF-003b: a margem por vendedor de origem (public.margem_por_vendedor, as mesmas regras da margem_painel). Banco
 * sem a função (a migration ainda não foi aplicada): nulo, e o bloco não aparece. Outra falha é falha, nunca zero.
 */
export async function consultarMargemPorVendedor(supabase: Cliente, janela: Janela, unidade: string | null): Promise<Leitura<MargemPorVendedor> | null> {
  const r = await supabase.rpc("margem_por_vendedor", periodo(janela, unidade));
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return null;
    console.error("margem: falha ao consultar margem_por_vendedor", { codigo: r.error.code || null });
    return FALHA;
  }
  return conferir("margem_por_vendedor", r.data, lerMargemPorVendedor);
}

/** Uma página do detalhe: os itens das vendas concluídas no período, da mais recente para a mais antiga. */
export async function consultarItensDaMargem(supabase: Cliente, janela: Janela, unidade: string | null, pagina: { limite: number; apos: number }): Promise<Leitura<ItensDaMargem>> {
  const r = await supabase.rpc("margem_itens", { ...periodo(janela, unidade), p_limite: pagina.limite, p_apos: pagina.apos });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return INDISPONIVEL;
    console.error("margem: falha ao consultar margem_itens", { codigo: r.error.code || null });
    return FALHA;
  }
  return conferir("margem_itens", r.data, lerItensDaMargem);
}

/**
 * O detalhe inteiro, para a exportação: pedido lote a lote, até LIMITE_DA_EXPORTACAO itens (`cortado`
 * avisa que havia mais). A janela tem fim fixo, então a ordem não muda entre um lote e o seguinte.
 * Se um lote falha, a leitura inteira falha: arquivo pela metade passaria por arquivo completo.
 */
export async function todosOsItensDaMargem(supabase: Cliente, janela: Janela, unidade: string | null): Promise<Leitura<{ itens: ItemDaMargem[]; cortado: boolean }>> {
  const itens: ItemDaMargem[] = [];
  for (let apos = 0; apos < LIMITE_DA_EXPORTACAO; apos += LOTE) {
    const lote = await consultarItensDaMargem(supabase, janela, unidade, { limite: Math.min(LOTE, LIMITE_DA_EXPORTACAO - apos), apos });
    if (lote.estado !== "ok") return lote;
    itens.push(...lote.dados.itens);
    if (itens.length >= lote.dados.total) return { estado: "ok", dados: { itens, cortado: false } };
    // Página vazia antes de chegar ao total: o banco mudou no meio da leitura. Melhor falhar do que repetir o pedido sem fim.
    if (lote.dados.itens.length === 0) return FALHA;
  }
  return { estado: "ok", dados: { itens, cortado: true } };
}

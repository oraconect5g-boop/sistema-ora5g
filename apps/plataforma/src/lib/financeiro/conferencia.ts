// A conferência do período (lote FIN-001a; ORA-FIN-001; a ordem recomendada da auditoria do Codex de 21/11/2026, item 6):
// public.financeiro_conferencia diz, venda a venda, se as vendas concluídas no período fecham com os pagamentos, com o
// livro do caixa e com o livro do estoque. Aqui fica só a leitura estrita da resposta e o que a tela diz dela; a conta é
// do banco. O banco sem a função (antes da migration) não tem o cartão; falha de leitura nunca vira "fecha".
import type { obterSessao } from "../acesso/sessao";
import { contagem, ehObjeto, inteiro, lista, objeto, texto, type Leitura, type Linha } from "../leitura-do-banco";
import { RespostaInesperada, type Janela } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type VendaDaConferencia = { id: string; numero: number };
/** Um lado da conferência: a diferença somada, quantas vendas não fecham e até 20 delas, para abrir. */
export type ParteDaConferencia = { diferenca: number; vendasComDiferenca: number; exemplos: VendaDaConferencia[] };
export type Conferencia = {
  /** As vendas concluídas no período (as canceladas depois continuam na conta: o pagamento delas é o "desfeito"). */
  vendas: number;
  vendido: number;
  pagamentos: ParteDaConferencia & { recebidoNaLoja: number; financiado: number; valeTroca: number; desfeitos: number };
  caixa: ParteDaConferencia & { esperado: number; noLivro: number };
  estoque: ParteDaConferencia & { unidades: number; noLivro: number };
};

function parte(l: Linha): ParteDaConferencia {
  return {
    diferenca: inteiro(l, "diferenca"),
    vendasComDiferenca: contagem(l, "vendas_com_diferenca"),
    exemplos: lista(l, "exemplos").map((e) => ({ id: texto(e, "id"), numero: contagem(e, "numero") })),
  };
}

/** Converte a resposta de public.financeiro_conferencia. Forma inesperada é erro (a tela diz que não conferiu). */
export function lerConferencia(dado: unknown): Conferencia {
  if (!ehObjeto(dado)) throw new RespostaInesperada("financeiro_conferencia");
  const pagamentos = objeto(dado, "pagamentos");
  const caixa = objeto(dado, "caixa");
  const estoque = objeto(dado, "estoque");
  return {
    vendas: contagem(dado, "vendas"),
    vendido: inteiro(dado, "vendido"),
    pagamentos: {
      ...parte(pagamentos), recebidoNaLoja: inteiro(pagamentos, "recebido_na_loja"), financiado: inteiro(pagamentos, "financiado"),
      valeTroca: inteiro(pagamentos, "vale_troca"), desfeitos: inteiro(pagamentos, "desfeitos"),
    },
    caixa: { ...parte(caixa), esperado: inteiro(caixa, "esperado"), noLivro: inteiro(caixa, "no_livro") },
    estoque: { ...parte(estoque), unidades: contagem(estoque, "unidades"), noLivro: contagem(estoque, "no_livro") },
  };
}

/** Um lado fecha quando nenhuma venda difere. A soma sozinha não basta: duas diferenças opostas dariam zero. */
export const parteFecha = (p: ParteDaConferencia) => p.vendasComDiferenca === 0 && p.diferenca === 0;
/** A conta do período fecha quando os três lados fecham. */
export const conferenciaFecha = (c: Conferencia) => parteFecha(c.pagamentos) && parteFecha(c.caixa) && parteFecha(c.estoque);
/** Quantas vendas não fecham em pelo menos um lado é no mínimo o maior dos três (a mesma venda pode falhar em mais de um). */
export const vendasQueNaoFecham = (c: Conferencia) => Math.max(c.pagamentos.vendasComDiferenca, c.caixa.vendasComDiferenca, c.estoque.vendasComDiferenca);

const SEM_FUNCAO = new Set(["PGRST202", "42883"]);

/**
 * A conferência do período, da loja (ou da rede, sem a loja). Nulo: o banco ainda não tem a função (o cartão não aparece).
 * Falha: não deu para conferir agora (o cartão diz isso; nunca "fecha").
 */
export async function consultarConferencia(supabase: Cliente, janela: Janela, unidade: string | null): Promise<Leitura<Conferencia> | null> {
  const r = await supabase.rpc("financeiro_conferencia", { p_inicio: janela.inicio.toISOString(), p_fim: janela.fim.toISOString(), ...(unidade ? { p_unidade: unidade } : {}) });
  if (r.error) {
    if (SEM_FUNCAO.has(r.error.code)) return null;
    console.error("financeiro: falha ao ler a conferência do período", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerConferencia(r.data) };
  } catch (e) {
    console.error("financeiro: resposta inesperada da conferência do período", { campo: e instanceof RespostaInesperada ? e.message : null });
    return { estado: "falha" };
  }
}

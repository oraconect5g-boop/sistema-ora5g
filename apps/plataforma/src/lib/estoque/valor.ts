// Valor do estoque a custo (lote G3b: ORA-REPORT-007, o resto; E8 da matriz). Leitura estrita de
// public.estoque_valor_em_custo: o banco decide quem vê (custo.ver e estoque.consultar) e soma tudo
// (packages/banco/src/estoque-valor.test.ts); aqui só se confere a resposta: conta que não fecha é falha, nunca zero.
// Sem a função no banco (migration ainda não aplicada) ou sem permissão: o bloco não aparece.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, lista, objeto, texto as t, textoOuNulo, type Leitura, type Linha } from "../leitura-do-banco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type LocalDoValor = {
  unidade: string; nome: string; vende: boolean; valor: number; itensComCusto: number; itensSemCusto: number; valorChegando: number; chegandoSemCusto: number;
};
export type ValorDoEstoque = {
  unidade: string | null; valor: number; itensComCusto: number; itensSemCusto: number; variacoesSemCusto: number; valorChegando: number;
  chegandoSemCusto: number; valorForaDaVenda: number; itensForaDaVendaSemCusto: number; porLocal: LocalDoValor[];
};

const falha = (campo: string): never => { throw new RespostaInesperada(campo); };
const booleano = (l: Linha, campo: string) => { const v = l[campo]; return typeof v === "boolean" ? v : falha(campo); };

/** Converte a resposta do banco. O resumo tem de ser a soma dos locais (os que vendem e os que não vendem, à parte),
 *  inclusive o que ficou fora por falta de custo (no estoque, chegando e fora da venda). */
export function lerValorDoEstoqueDoBanco(dado: unknown): ValorDoEstoque {
  if (!ehObjeto(dado)) return falha("estoque_valor_em_custo");
  const unidade = textoOuNulo(dado, "unidade");
  if (unidade !== null && !ehUuid(unidade)) falha("unidade");
  const r = objeto(dado, "resumo");
  const resumo = {
    valor: n(r, "valor"), itensComCusto: n(r, "itens_com_custo"), itensSemCusto: n(r, "itens_sem_custo"), variacoesSemCusto: n(r, "variacoes_sem_custo"),
    valorChegando: n(r, "valor_chegando"), chegandoSemCusto: n(r, "chegando_sem_custo"), valorForaDaVenda: n(r, "valor_fora_da_venda"),
    itensForaDaVendaSemCusto: n(r, "itens_fora_da_venda_sem_custo"),
  };
  const porLocal = lista(dado, "por_local").map((l): LocalDoValor => {
    const id = t(l, "unidade");
    if (!ehUuid(id) || (unidade !== null && id !== unidade)) falha("por_local");
    return { unidade: id, nome: t(l, "nome"), vende: booleano(l, "vende"), valor: n(l, "valor"), itensComCusto: n(l, "itens_com_custo"), itensSemCusto: n(l, "itens_sem_custo"),
      valorChegando: n(l, "valor_chegando"), chegandoSemCusto: n(l, "chegando_sem_custo") };
  });
  const soma = (campo: "valor" | "itensComCusto" | "itensSemCusto" | "valorChegando" | "chegandoSemCusto", vende: boolean) =>
    porLocal.filter((l) => l.vende === vende).reduce((s, l) => s + l[campo], 0);
  const fecha = Object.values(resumo).every((v) => v >= 0) && porLocal.every((l) => l.valor >= 0 && l.itensComCusto >= 0 && l.itensSemCusto >= 0 && l.valorChegando >= 0 && l.chegandoSemCusto >= 0)
    && resumo.valor === soma("valor", true) && resumo.itensComCusto === soma("itensComCusto", true) && resumo.itensSemCusto === soma("itensSemCusto", true)
    && resumo.valorChegando === soma("valorChegando", true) && resumo.chegandoSemCusto === soma("chegandoSemCusto", true)
    && resumo.valorForaDaVenda === soma("valor", false) && resumo.itensForaDaVendaSemCusto === soma("itensSemCusto", false)
    && (resumo.itensSemCusto === 0) === (resumo.variacoesSemCusto === 0) && resumo.variacoesSemCusto <= resumo.itensSemCusto;
  if (!fecha) falha("resumo");
  return { unidade, ...resumo, porLocal };
}

const SEM_FUNCAO = new Set(["PGRST202", "42883"]);

/** Lê como a pessoa logada. Sem permissão ou sem a função no banco: nulo (o bloco some). Falha: o próprio estado. */
export async function lerValorDoEstoque(supabase: Cliente, unidade: string | null): Promise<Leitura<ValorDoEstoque> | null> {
  const r = await supabase.rpc("estoque_valor_em_custo", { p_unidade: unidade as string });
  if (r.error) {
    if (r.error.code === "42501" || SEM_FUNCAO.has(r.error.code)) return null;
    console.error("estoque: falha ao ler o valor a custo", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerValorDoEstoqueDoBanco(r.data) };
  } catch (e) {
    console.error("estoque: resposta inesperada do valor a custo", { campo: e instanceof RespostaInesperada ? e.message : null });
    return { estado: "falha" };
  }
}

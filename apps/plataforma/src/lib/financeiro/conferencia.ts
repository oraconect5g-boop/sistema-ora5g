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

// ---------------------------------------------------------------------------------------------
// O que foi desfeito no período (lote FIN-001b): public.financeiro_conferencia_do_desfeito confere, fato a fato, os
// cancelamentos de venda concluída e as devoluções: o valor tem destino, o dinheiro devolvido está no livro do caixa e
// o que voltou está no livro do estoque.
// ---------------------------------------------------------------------------------------------
export type Desfeito = {
  cancelamentos: number;
  cancelado: number;
  devolucoes: number;
  devolvido: number;
  /** Para onde foi o valor: o dinheiro do caixa, o estorno por fora (Pix, cartão e financeira) e o vale-troca. */
  destino: ParteDaConferencia & { emDinheiro: number; porFora: number; aConfirmar: number; valeTroca: number };
  caixa: ParteDaConferencia & { esperado: number; noLivro: number };
  /** As unidades desfeitas: as que voltaram (e estão no livro), as que esperam a conferência do retorno e as que não voltaram. */
  estoque: ParteDaConferencia & { unidades: number; voltaram: number; esperando: number; naoVoltaram: number; noLivro: number };
};

/** Converte a resposta de public.financeiro_conferencia_do_desfeito. Forma inesperada é erro (a tela diz que não conferiu). */
export function lerDesfeito(dado: unknown): Desfeito {
  if (!ehObjeto(dado)) throw new RespostaInesperada("financeiro_conferencia_do_desfeito");
  const destino = objeto(dado, "destino");
  const caixa = objeto(dado, "caixa");
  const estoque = objeto(dado, "estoque");
  return {
    cancelamentos: contagem(dado, "cancelamentos"),
    cancelado: inteiro(dado, "cancelado"),
    devolucoes: contagem(dado, "devolucoes"),
    devolvido: inteiro(dado, "devolvido"),
    destino: {
      ...parte(destino), emDinheiro: inteiro(destino, "em_dinheiro"), porFora: inteiro(destino, "por_fora"), aConfirmar: inteiro(destino, "a_confirmar"),
      valeTroca: inteiro(destino, "vale_troca"),
    },
    caixa: { ...parte(caixa), esperado: inteiro(caixa, "esperado"), noLivro: inteiro(caixa, "no_livro") },
    estoque: {
      ...parte(estoque), unidades: contagem(estoque, "unidades"), voltaram: contagem(estoque, "voltaram"), esperando: contagem(estoque, "esperando"),
      naoVoltaram: contagem(estoque, "nao_voltaram"), noLivro: contagem(estoque, "no_livro"),
    },
  };
}

/** Quantos fatos foram desfeitos no período e quanto valem (os cancelamentos e as devoluções, somados). */
export const fatosDesfeitos = (d: Desfeito) => d.cancelamentos + d.devolucoes;
export const valorDesfeito = (d: Desfeito) => d.cancelado + d.devolvido;
/** O desfeito fecha quando os três lados fecham (a unidade que espera a conferência ou que não voltou não é diferença). */
export const desfeitoFecha = (d: Desfeito) => parteFecha(d.destino) && parteFecha(d.caixa) && parteFecha(d.estoque);
export const vendasDoDesfeitoQueNaoFecham = (d: Desfeito) => Math.max(d.destino.vendasComDiferenca, d.caixa.vendasComDiferenca, d.estoque.vendasComDiferenca);

const SEM_FUNCAO = new Set(["PGRST202", "42883"]);

/** Uma das duas conferências: nulo sem a função no banco; falha quando não deu para ler ou a resposta veio fora da forma. */
async function consultar<T>(
  supabase: Cliente, funcao: "financeiro_conferencia" | "financeiro_conferencia_do_desfeito", nome: string, ler: (dado: unknown) => T, janela: Janela, unidade: string | null,
): Promise<Leitura<T> | null> {
  const r = await supabase.rpc(funcao, { p_inicio: janela.inicio.toISOString(), p_fim: janela.fim.toISOString(), ...(unidade ? { p_unidade: unidade } : {}) });
  if (r.error) {
    if (SEM_FUNCAO.has(r.error.code)) return null;
    console.error(`financeiro: falha ao ler ${nome}`, { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: ler(r.data) };
  } catch (e) {
    console.error(`financeiro: resposta inesperada d${nome}`, { campo: e instanceof RespostaInesperada ? e.message : null });
    return { estado: "falha" };
  }
}

/**
 * A conferência do período, da loja (ou da rede, sem a loja). Nulo: o banco ainda não tem a função (o cartão não aparece).
 * Falha: não deu para conferir agora (o cartão diz isso; nunca "fecha").
 */
export const consultarConferencia = (supabase: Cliente, janela: Janela, unidade: string | null) =>
  consultar(supabase, "financeiro_conferencia", "a conferência do período", lerConferencia, janela, unidade);

/**
 * A conferência do que foi desfeito no período, do mesmo jeito. Nulo: o banco ainda não tem a função (o cartão fica só
 * com a conta das vendas e diz que o desfeito ainda não é conferido).
 */
export const consultarDesfeito = (supabase: Cliente, janela: Janela, unidade: string | null) =>
  consultar(supabase, "financeiro_conferencia_do_desfeito", "a conferência do que foi desfeito", lerDesfeito, janela, unidade);

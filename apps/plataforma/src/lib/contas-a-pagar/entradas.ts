// A conta a pagar ligada à entrada de mercadoria (lote FIN-004a: ORA-FIN-004). Leituras à parte e pelo RLS de quem pede
// (as contas: conta_pagar.gerir; as entradas: estoque.consultar na loja): num banco sem a migration (a coluna
// contas_a_pagar.entrada_id ainda não existe), nada disto aparece e as telas seguem como antes. Outra falha é falha: a
// tela diz que não leu, em vez de mostrar a conta como se não tivesse entrada.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { centavosDoBanco, ValorForaDoLimite } from "../dinheiro";
import { lerEmPaginas, lerPorIds } from "../leitura-completa";
import type { Leitura } from "../leitura-do-banco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const COLUNA_AUSENTE = new Set(["42703", "PGRST204"]);
const FALHA = { estado: "falha" } as const;

/** As compras dos últimos tantos dias que podem ser ligadas; e no máximo quantas (as mais novas). */
export const DIAS_DAS_ENTRADAS = 90;
export const MAXIMO_DE_ENTRADAS = 200;

export type EntradaDaConta = {
  id: string; numero: number; unidadeId: string; fornecedorId: string | null; documento: string | null; estornada: boolean; criadaEm: string;
};
export type LigacoesDasContas = {
  /** conta → entrada, das contas da lista. */
  ligadas: ReadonlyMap<string, string>;
  /** As entradas ligadas e as compras registradas recentes, cada uma uma vez. */
  entradas: EntradaDaConta[];
};
const COLUNAS_DA_ENTRADA = "id, numero, unidade_id, fornecedor_id, documento, situacao, tipo, criado_em";

class Inesperada extends Error {}
function entrada(l: Record<string, unknown>): EntradaDaConta {
  const ok = ehUuid(l.id) && typeof l.numero === "number" && Number.isSafeInteger(l.numero) && l.numero > 0 && ehUuid(l.unidade_id)
    && (l.fornecedor_id === null || ehUuid(l.fornecedor_id)) && (l.documento === null || typeof l.documento === "string")
    && (l.situacao === "registrada" || l.situacao === "estornada") && typeof l.criado_em === "string" && !Number.isNaN(Date.parse(l.criado_em));
  if (!ok) throw new Inesperada("entrada");
  return {
    id: l.id as string, numero: l.numero as number, unidadeId: l.unidade_id as string, fornecedorId: l.fornecedor_id as string | null,
    documento: l.documento as string | null, estornada: l.situacao === "estornada", criadaEm: l.criado_em as string,
  };
}

/**
 * As entradas ligadas às contas da lista e as compras registradas dos últimos DIAS_DAS_ENTRADAS dias (até MAXIMO, as
 * mais novas), que a lista oferece para ligar. Nulo: o banco ainda não tem a coluna.
 */
export async function lerLigacoes(supabase: Cliente, contas: readonly string[], agora: Date = new Date()): Promise<Leitura<LigacoesDasContas> | null> {
  const ligadas = await lerPorIds(contas, (lote, de, ate) => supabase.from("contas_a_pagar").select("id, entrada_id")
    .in("id", lote).not("entrada_id", "is", null).order("id").range(de, ate));
  if (!ligadas.ok) {
    if (COLUNA_AUSENTE.has(ligadas.erro.code ?? "")) return null;
    console.error("contas a pagar: falha ao ler as entradas ligadas", { codigo: ligadas.erro.code || null });
    return FALHA;
  }
  const desde = new Date(agora.getTime() - DIAS_DAS_ENTRADAS * 86_400_000).toISOString();
  const [porId, recentes] = await Promise.all([
    lerPorIds(ligadas.linhas.map((l) => l.entrada_id as string), (lote, de, ate) => supabase.from("entradas_estoque").select(COLUNAS_DA_ENTRADA)
      .in("id", lote).order("id").range(de, ate)),
    lerEmPaginas((de, ate) => supabase.from("entradas_estoque").select(COLUNAS_DA_ENTRADA).eq("tipo", "compra").eq("situacao", "registrada")
      .gte("criado_em", desde).order("numero", { ascending: false }).order("id").range(de, ate), MAXIMO_DE_ENTRADAS),
  ]);
  if (!porId.ok || !recentes.ok) {
    console.error("contas a pagar: falha ao ler as entradas de mercadoria", { codigo: (!porId.ok ? porId.erro.code : !recentes.ok ? recentes.erro.code : null) || null });
    return FALHA;
  }
  try {
    const mapa = new Map<string, string>();
    for (const l of ligadas.linhas) {
      if (!ehUuid(l.id) || !ehUuid(l.entrada_id)) throw new Inesperada("ligada");
      mapa.set(l.id, l.entrada_id);
    }
    const todas = new Map<string, EntradaDaConta>();
    for (const l of [...porId.linhas, ...recentes.linhas]) {
      const e = entrada(l as Record<string, unknown>);
      todas.set(e.id, e);
    }
    return { estado: "ok", dados: { ligadas: mapa, entradas: [...todas.values()].sort((a, b) => b.numero - a.numero) } };
  } catch (erro) {
    if (!(erro instanceof Inesperada)) throw erro;
    console.error("contas a pagar: entrada em forma inesperada");
    return FALHA;
  }
}

/** A entrada pedida no endereço para lançar a conta dela (FIN-004a); nula se não existe, não é visível ou o banco não tem a coluna. */
export async function lerEntradaParaLancar(supabase: Cliente, id: string): Promise<EntradaDaConta | null> {
  if (!ehUuid(id)) return null;
  const r = await supabase.from("entradas_estoque").select(COLUNAS_DA_ENTRADA).eq("id", id).eq("tipo", "compra").eq("situacao", "registrada").maybeSingle();
  if (r.error || !r.data) {
    if (r.error) console.error("contas a pagar: falha ao ler a entrada para lançar", { codigo: r.error.code || null });
    return null;
  }
  try {
    return entrada(r.data as Record<string, unknown>);
  } catch {
    console.error("contas a pagar: entrada em forma inesperada");
    return null;
  }
}

/** O lançamento de cada entrada (FIN-004a), para a tela de entradas: quantas parcelas, quanto e quantas já pagas. */
export type ContaDaEntrada = { parcelas: number; valor: number; pagas: number; canceladas: number };
/**
 * As contas ligadas às entradas mostradas, somadas por entrada; nulo: o banco ainda não tem a coluna. Quem não gere as
 * contas da loja (sem conta_pagar.gerir) recebe a lista vazia pelo RLS: a tela então não mostra nada sobre as contas.
 */
export async function lerContasDasEntradas(supabase: Cliente, entradas: readonly string[]): Promise<Leitura<ReadonlyMap<string, ContaDaEntrada>> | null> {
  const r = await lerPorIds(entradas, (lote, de, ate) => supabase.from("contas_a_pagar").select("id, entrada_id, situacao, valor_centavos")
    .in("entrada_id", lote).order("id").range(de, ate));
  if (!r.ok) {
    if (COLUNA_AUSENTE.has(r.erro.code ?? "")) return null;
    console.error("entrada: falha ao ler as contas a pagar das entradas", { codigo: r.erro.code || null });
    return FALHA;
  }
  try {
    const porEntrada = new Map<string, ContaDaEntrada>();
    for (const l of r.linhas) {
      if (!ehUuid(l.entrada_id) || !["aberta", "paga", "cancelada"].includes(String(l.situacao))) throw new Inesperada("conta");
      const atual = porEntrada.get(l.entrada_id) ?? { parcelas: 0, valor: 0, pagas: 0, canceladas: 0 };
      const cancelada = l.situacao === "cancelada";
      porEntrada.set(l.entrada_id, {
        parcelas: atual.parcelas + (cancelada ? 0 : 1), valor: atual.valor + (cancelada ? 0 : centavosDoBanco(l.valor_centavos)),
        pagas: atual.pagas + (l.situacao === "paga" ? 1 : 0), canceladas: atual.canceladas + (cancelada ? 1 : 0),
      });
    }
    return { estado: "ok", dados: porEntrada };
  } catch (erro) {
    if (!(erro instanceof Inesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("entrada: conta a pagar em forma inesperada");
    return FALHA;
  }
}

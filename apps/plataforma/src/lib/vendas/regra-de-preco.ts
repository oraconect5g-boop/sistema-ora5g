// A regra de preço de cada item da venda (lote L6b: ORA-POS-014, em parte). Desde o L6b o banco grava
// em venda_itens.preco_id QUAL linha de public.precos deu o valor do item (a campanha, o preço da loja
// ou o da rede); aqui está a leitura dessas linhas e a frase que a tela mostra. A linha de preço não é
// apagada, então a regra continua legível depois que a campanha acaba. A regra é lida À PARTE dos
// itens: num banco ainda sem a migration do L6b (coluna ausente), a venda e o PDV seguem como antes e a
// regra só não aparece; falha de leitura não derruba a venda (o item diz que a regra não foi lida).
import type { obterSessao } from "../acesso/sessao";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type LinhaDePreco = { id: string; origem: string; unidade_id: string | null; motivo: string | null; fim: string | null };
export type RegraDoItem = { texto: string; campanha: boolean };

const ateQuando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** A frase da regra de um item: campanha (da loja ou da rede, com o nome e até quando), preço da loja ou da rede. */
export function regraDoItem(precoId: string | null | undefined, linhas: ReadonlyMap<string, LinhaDePreco> | null): RegraDoItem {
  if (!precoId) return { texto: "Regra de preço não registrada (item de antes de 13/11/2026)", campanha: false };
  const linha = linhas?.get(precoId);
  if (!linha) return { texto: "Regra de preço não lida agora", campanha: false };
  const escopo = linha.unidade_id ? "da loja" : "da rede";
  if (linha.origem === "campanha") {
    return { texto: `Campanha ${escopo}: ${linha.motivo?.trim() || "sem nome"}${linha.fim ? ` (até ${ateQuando(linha.fim)})` : ""}`, campanha: true };
  }
  return { texto: `Preço ${escopo}`, campanha: false };
}

/** As linhas de preço dos itens, numa leitura só. null: a leitura falhou (registro só com o código). */
export async function lerLinhasDePreco(supabase: Cliente, ids: readonly (string | null)[]): Promise<Map<string, LinhaDePreco> | null> {
  const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unicos.length === 0) return new Map();
  const r = await supabase.from("precos").select("id, origem, unidade_id, motivo, fim").in("id", unicos);
  if (r.error) {
    console.error("vendas: falha ao ler as regras de preço dos itens", { codigo: r.error.code || null });
    return null;
  }
  return new Map(r.data.map((l) => [l.id, l] as const));
}

export type RegrasDosItens = { estado: "ok"; porItem: ReadonlyMap<string, RegraDoItem> } | { estado: "indisponivel" } | { estado: "falha" };
// Coluna que o banco ainda não tem: 42703 do PostgreSQL ou PGRST204 do cache de esquema do PostgREST.
const COLUNA_AUSENTE = new Set(["42703", "PGRST204"]);
const NAO_LIDA: RegraDoItem = { texto: "Regra de preço não lida agora", campanha: false };

/** A regra de cada item de uma venda: lê preco_id dos itens e as linhas de preço, à parte da venda. */
export async function regrasDosItens(supabase: Cliente, venda: string): Promise<RegrasDosItens> {
  const itens = await supabase.from("venda_itens").select("id, preco_id").eq("venda_id", venda);
  if (itens.error) {
    if (COLUNA_AUSENTE.has(itens.error.code)) return { estado: "indisponivel" };
    console.error("vendas: falha ao ler a regra de preço dos itens", { codigo: itens.error.code || null });
    return { estado: "falha" };
  }
  const linhas = await lerLinhasDePreco(supabase, itens.data.map((i) => i.preco_id));
  if (linhas === null) return { estado: "falha" };
  return { estado: "ok", porItem: new Map(itens.data.map((i) => [i.id, regraDoItem(i.preco_id, linhas)] as const)) };
}

/** A regra de um item na tela; null quando o banco ainda não grava a regra (nada a dizer, a venda segue igual). */
export function regraNaTela(regras: RegrasDosItens, item: string): RegraDoItem | null {
  if (regras.estado === "indisponivel") return null;
  if (regras.estado === "falha") return NAO_LIDA;
  return regras.porItem.get(item) ?? NAO_LIDA;
}

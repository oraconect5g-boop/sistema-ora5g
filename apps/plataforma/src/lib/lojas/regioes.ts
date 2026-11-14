// Regiões da rede (lote ORG-009: ORA-ORG-009; FIN-008 e PERF-009 em parte). A região agrupa lojas para somar
// vendas e metas; NÃO dá acesso: as telas só somam as lojas que a pessoa já vê (o banco decide pelo vínculo).
// Regras do banco em packages/banco/src/regioes.test.ts. Leitura estrita; num banco sem a tabela (migration
// ainda não aplicada), a leitura devolve nulo e nenhuma tela mostra região.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { ticketMedio } from "../inicio/painel";
import { lerEmPaginas } from "../leitura-completa";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type Regiao = { id: string; nome: string; ativa: boolean };
export type MapaDeRegioes = { regioes: Regiao[]; daLoja: ReadonlyMap<string, string> };

/** A tabela ou a coluna ainda não existem no banco (PostgREST ou PostgreSQL). */
const SEM_REGIOES = new Set(["PGRST205", "PGRST204", "42P01", "42703"]);

export class RegiaoInesperada extends Error {}

export function lerRegiaoDoBanco(linha: unknown): Regiao {
  const l = (linha ?? {}) as Record<string, unknown>;
  if (!ehUuid(l.id) || typeof l.nome !== "string" || l.nome.trim().length < 2 || typeof l.ativa !== "boolean") throw new RegiaoInesperada("regioes");
  return { id: l.id, nome: l.nome, ativa: l.ativa };
}

/**
 * As regiões da rede e a região de cada loja que a pessoa vê. Nulo: o banco ainda não tem as regiões.
 * Erro de leitura ou linha fora do formato: lança (a tela mostra a falha, nunca "sem região").
 */
export async function lerRegioes(supabase: Cliente): Promise<MapaDeRegioes | null> {
  const [regioes, lojas] = await Promise.all([
    lerEmPaginas((de, ate) => supabase.from("regioes").select("id, nome, ativa").order("nome").order("id").range(de, ate), 1_000),
    lerEmPaginas((de, ate) => supabase.from("unidades").select("id, regiao_id").order("id").range(de, ate), 1_000),
  ]);
  for (const r of [regioes, lojas]) {
    if (!r.ok) {
      if (SEM_REGIOES.has(r.erro.code ?? "")) return null;
      throw new RegiaoInesperada(`leitura: ${r.erro.code ?? "sem código"}`);
    }
    if (r.mais) throw new RegiaoInesperada("leitura cortada");
  }
  if (!regioes.ok || !lojas.ok) return null;
  const lista = regioes.linhas.map(lerRegiaoDoBanco);
  const ids = new Set(lista.map((r) => r.id));
  const daLoja = new Map<string, string>();
  for (const linha of lojas.linhas as Record<string, unknown>[]) {
    const { id, regiao_id: regiao } = linha;
    if (!ehUuid(id) || (regiao !== null && !ehUuid(regiao))) throw new RegiaoInesperada("unidades");
    // A loja aponta para uma região da rede que a pessoa lê; se não, é falha (nunca "sem região" calado).
    if (regiao !== null) {
      if (!ids.has(regiao)) throw new RegiaoInesperada("região da loja fora da lista");
      daLoja.set(id, regiao);
    }
  }
  return { regioes: lista, daLoja };
}

export type GrupoDaRegiao<T> = { id: string | null; nome: string; itens: T[] };

/**
 * Agrupa por região o que já é por loja (vendas, metas). Só quando alguma das lojas tem região: senão, nulo
 * (a tela não mostra o bloco). Loja sem região vai para "Sem região", no fim; as regiões em ordem de nome.
 */
export function agruparPorRegiao<T>(itens: readonly T[], lojaDe: (item: T) => string, mapa: MapaDeRegioes | null): GrupoDaRegiao<T>[] | null {
  if (!mapa || !itens.some((i) => mapa.daLoja.has(lojaDe(i)))) return null;
  const nomes = new Map(mapa.regioes.map((r) => [r.id, r.nome] as const));
  const grupos = new Map<string | null, T[]>();
  for (const item of itens) {
    const regiao = mapa.daLoja.get(lojaDe(item)) ?? null;
    grupos.set(regiao, [...(grupos.get(regiao) ?? []), item]);
  }
  return [...grupos.entries()]
    .map(([id, lista]) => ({ id, nome: id === null ? "Sem região" : nomes.get(id) ?? "Região não identificada", itens: lista }))
    .sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) || a.nome.localeCompare(b.nome, "pt-BR"));
}

export type DesempenhoDaRegiao = { id: string | null; nome: string; lojas: number; vendas: number; vendido: number; desfeito: number; liquido: number; ticket: number | null };

/** A soma das lojas de cada região (o ticket é recalculado da soma, nunca a média dos tickets). */
export function desempenhoPorRegiao(
  lojas: readonly { id: string; vendas: number; vendido: number; desfeito: number; liquido: number }[], mapa: MapaDeRegioes | null,
): DesempenhoDaRegiao[] | null {
  const grupos = agruparPorRegiao(lojas, (l) => l.id, mapa);
  if (!grupos) return null;
  return grupos.map((g) => {
    const soma = g.itens.reduce((s, l) => ({ vendas: s.vendas + l.vendas, vendido: s.vendido + l.vendido, desfeito: s.desfeito + l.desfeito, liquido: s.liquido + l.liquido }),
      { vendas: 0, vendido: 0, desfeito: 0, liquido: 0 });
    return { id: g.id, nome: g.nome, lojas: g.itens.length, ...soma, ticket: ticketMedio(soma.vendido, soma.vendas) };
  });
}

/** Para os painéis: o mapa, nulo (banco sem regiões) ou "falha" (a tela avisa; a tabela por loja continua certa). */
export type RegioesDoPainel = MapaDeRegioes | null | "falha";
export async function lerRegioesDoPainel(supabase: Cliente): Promise<RegioesDoPainel> {
  try {
    return await lerRegioes(supabase);
  } catch (e) {
    console.error("regiões: falha ao ler", { motivo: e instanceof RegiaoInesperada ? e.message : null });
    return "falha";
  }
}

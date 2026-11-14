// Códigos de outros canais por variação (lote CAT-009: ORA-CAT-009). O código de fora (o da Rein, o do site, o do
// anúncio num marketplace) só aponta para a variação: o ID interno continua sendo a chave de tudo. O banco decide quem
// liga e desliga (catalogo.gerir) e que um código ativo de um canal fica numa só variação
// (packages/banco/src/codigos-de-outros-canais.test.ts); aqui só se lê, com leitura estrita.
// Num banco sem a tabela (migration ainda não aplicada), a leitura devolve nulo e a tela não mostra o bloco.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { lerPorIds } from "../leitura-completa";
import { motivoDoCadastro, type ErroDoCadastro } from "./cadastro";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

/** A lista fechada do banco (canal novo é migration). DEC-U13: Mercado Livre, Shopee e TikTok Shop. */
export const CANAIS = { rein: "Rein", site: "Site", mercado_livre: "Mercado Livre", shopee: "Shopee", tiktok_shop: "TikTok Shop" } as const;
export type Canal = keyof typeof CANAIS;
export const ehCanal = (v: unknown): v is Canal => typeof v === "string" && Object.hasOwn(CANAIS, v);

export type CodigoDoCanal = { id: string; variante: string; canal: Canal; codigo: string; skuNoCanal: string | null };

/** A tabela ainda não existe no banco (PostgREST ou PostgreSQL). */
export const SEM_TABELA = new Set(["PGRST205", "42P01"]);

export class CodigoInesperado extends Error {}

/** Converte uma linha do banco; qualquer campo fora do formato é falha de leitura (nunca vira código vazio). */
export function lerCodigoDoBanco(linha: unknown): CodigoDoCanal {
  const l = (linha ?? {}) as Record<string, unknown>;
  const { id, variante_id: variante, canal, codigo, sku_no_canal: sku } = l;
  if (!ehUuid(id) || !ehUuid(variante) || !ehCanal(canal) || typeof codigo !== "string" || codigo.length === 0
      || (sku !== null && typeof sku !== "string")) {
    throw new CodigoInesperado("variante_codigos_externos");
  }
  return { id, variante, canal, codigo, skuNoCanal: sku };
}

/**
 * Os códigos ativos das variações pedidas, agrupados por variação (na ordem dos canais e do código).
 * Nulo: o banco ainda não tem a tabela. Erro de leitura ou linha fora do formato: lança (a tela mostra a falha).
 */
export async function lerCodigosDasVariantes(supabase: Cliente, variantes: readonly string[]): Promise<Map<string, CodigoDoCanal[]> | null> {
  const porVariante = new Map<string, CodigoDoCanal[]>();
  if (variantes.length === 0) return porVariante;
  const lidos = await lerPorIds(variantes, (lote, de, ate) => supabase.from("variante_codigos_externos")
    .select("id, variante_id, canal, codigo, sku_no_canal").in("variante_id", lote).is("desligado_em", null).order("id").range(de, ate));
  if (!lidos.ok) {
    if (SEM_TABELA.has(lidos.erro.code ?? "")) return null;
    throw new CodigoInesperado(`leitura: ${lidos.erro.code ?? "sem código"}`);
  }
  if (lidos.mais) throw new CodigoInesperado("leitura cortada");
  const ordem = Object.keys(CANAIS);
  const codigos = lidos.linhas.map(lerCodigoDoBanco)
    .sort((a, b) => ordem.indexOf(a.canal) - ordem.indexOf(b.canal) || a.codigo.localeCompare(b.codigo, "pt-BR") || a.id.localeCompare(b.id));
  for (const c of codigos) porVariante.set(c.variante, [...(porVariante.get(c.variante) ?? []), c]);
  return porVariante;
}

/** O que a tela diz de um código: "Rein 12345" ou "Mercado Livre MLB111 (SKU GALAXY-A15)". */
export const rotuloDoCodigo = (c: CodigoDoCanal) => `${CANAIS[c.canal]} ${c.codigo}${c.skuNoCanal ? ` (SKU ${c.skuNoCanal})` : ""}`;

export type DadosDoCodigo = { variante: string; canal: Canal; codigo: string; skuNoCanal: string | null; motivo: string };

/** O formulário de ligar um código (o banco confere de novo e decide o resto). */
export function validarCodigoDoCanal(c: Record<string, unknown>): { ok: true; dados: DadosDoCodigo } | { ok: false; erro: ErroDoCadastro } {
  if (!ehUuid(c.variante)) return { ok: false, erro: "dados" };
  if (!ehCanal(c.canal)) return { ok: false, erro: "canal" };
  const codigo = typeof c.codigo === "string" ? c.codigo.trim() : "";
  if (codigo.length < 1 || codigo.length > 80 || /[\s\p{Cc}]/u.test(codigo)) return { ok: false, erro: "codigo_canal" };
  const sku = typeof c.sku_no_canal === "string" ? c.sku_no_canal.trim().replace(/\s+/g, " ") : "";
  if (sku.length > 80 || /\p{Cc}/u.test(sku)) return { ok: false, erro: "sku_no_canal" };
  const motivo = motivoDoCadastro(c.motivo);
  if (!motivo) return { ok: false, erro: "motivo" };
  return { ok: true, dados: { variante: c.variante, canal: c.canal, codigo, skuNoCanal: sku || null, motivo } };
}

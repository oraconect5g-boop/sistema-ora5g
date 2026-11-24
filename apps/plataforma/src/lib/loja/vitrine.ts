// A vitrine da loja online (lote ONLINE-a: ORA-ONLINE-001; ADR-009): o que o visitante vê sem login. Quem decide o que
// aparece é o banco (public.loja_vitrine e public.loja_produto: só o que o dono marcou para o site, ativo, aparelhos e
// acessórios, com o preço do balcão e se há estoque). Aqui: qual empresa o site mostra, os formatos e as fotos.

/** A empresa que este site mostra (LOJA_ONLINE_ORGANIZACAO, lida no servidor). Sem ela, a loja online fica desligada. */
export function organizacaoDaLoja(ambiente: Record<string, string | undefined> = process.env): string | null {
  const valor = ambiente["LOJA_ONLINE_ORGANIZACAO"]?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(valor) ? valor : null;
}

export type ProdutoDaVitrine = {
  id: string; nome: string; marca: string | null; categoria: string; preco_a_partir_centavos: number; disponivel: boolean; foto: string | null;
};
export type Vitrine = {
  categorias: { id: string; nome: string }[]; produtos: ProdutoDaVitrine[];
  /** ONLINE-f: o total do que a busca e a categoria filtram, a página devolvida e quantas há (de 60 em 60). */
  total?: number; pagina?: number; paginas?: number;
};
export const POR_PAGINA_NA_VITRINE = 60;
/** ONLINE-f: a página pedida (?pagina=), de 1 a 1.000; outra coisa é a primeira (o banco ajusta a que passar do fim). */
export function paginaDaVitrine(valor: unknown): number {
  if (typeof valor !== "string" || !/^\d{1,4}$/.test(valor.trim())) return 1;
  const n = Number(valor.trim());
  return n >= 1 && n <= 1000 ? n : 1;
}
/** ONLINE-f: as páginas pelo que o banco disse; sem as chaves (o banco de antes da migration), uma página só. */
export function paginasDaVitrine(v: Vitrine): { total: number; pagina: number; paginas: number } {
  const inteiro = (x: unknown) => (Number.isSafeInteger(x) && (x as number) >= 0 ? x as number : null);
  const total = inteiro(v.total) ?? v.produtos.length;
  const paginas = inteiro(v.paginas) ?? (total > 0 ? 1 : 0);
  return { total, pagina: Math.max(1, Math.min(inteiro(v.pagina) ?? 1, Math.max(paginas, 1))), paginas };
}
export type Disponibilidade = "disponivel" | "ultimas_unidades" | "sem_estoque";
export type LojaDaOferta = { id: string; nome: string; cidade: string | null; endereco: string | null; preco_centavos: number; disponibilidade: Disponibilidade };
export type DetalheDoProduto = {
  id: string; nome: string; modelo: string | null; descricao: string | null; marca: string | null; categoria: string;
  fotos: { caminho: string; variante: string | null; largura: number; altura: number }[];
  variantes: { id: string; nome: string; cor: string | null; capacidade: string | null; lojas: LojaDaOferta[] }[];
};

export const DISPONIBILIDADES: Record<Disponibilidade, { nome: string; tom: "sucesso" | "aviso" | "neutro" }> = {
  disponivel: { nome: "Disponível", tom: "sucesso" },
  ultimas_unidades: { nome: "Últimas unidades", tom: "aviso" },
  sem_estoque: { nome: "Sem estoque agora", tom: "neutro" },
};
export const ehDisponibilidade = (v: unknown): v is Disponibilidade => typeof v === "string" && Object.hasOwn(DISPONIBILIDADES, v);

/** A busca do visitante: até 60 letras, sem espaços sobrando; vazia vira nula. */
export function buscaDaVitrine(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const busca = valor.replace(/\s+/g, " ").trim().slice(0, 60);
  return busca || null;
}
export const ehUuidDaVitrine = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

type ClienteDeFotos = { storage: { from: (bucket: string) => { createSignedUrls: (caminhos: string[], segundos: number) => Promise<{ data: { path: string | null; signedUrl: string | null; error: string | null }[] | null; error: unknown }> } } };
/** Os links temporários (1 hora) das fotos do site. O armazenamento só assina as fotos vigentes de produto do site. */
export async function linksDasFotos(cliente: ClienteDeFotos, caminhos: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(caminhos.filter((c): c is string => Boolean(c)))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await cliente.storage.from("produtos").createSignedUrls(unicos, 3600);
  if (error || !data) return new Map();
  return new Map(data.flatMap((l) => (l.path && !l.error && l.signedUrl ? [[l.path, l.signedUrl] as const] : [])));
}

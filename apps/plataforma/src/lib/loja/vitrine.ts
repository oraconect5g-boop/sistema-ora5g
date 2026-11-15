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
export type Vitrine = { categorias: { id: string; nome: string }[]; produtos: ProdutoDaVitrine[] };
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

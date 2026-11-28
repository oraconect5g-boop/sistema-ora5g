// AUD-f (auditoria de e7f55b2), item 3: as listas oficiais da Nogle (os planos, as cidades, os DDDs, as operadoras) lidas
// por tipo, em páginas de 1.000 (o máximo de uma leitura da API) e em ordem estável (o nome, depois o código). Antes, todas
// vinham numa leitura só, com limite de 3.000 que a API corta em 1.000: com muitas cidades, um plano ou um DDD válido podia
// ficar de fora da tela sem aviso. A leitura que falha é falha (a tela não mostra uma lista pela metade como se fosse inteira).
import type { obterSessao } from "../acesso/sessao";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
export type ReferenciaDaNogle = { tipo: string; codigo: string; nome: string; uf: string | null; valor_centavos: number | null };

const POR_LEITURA = 1_000;
/** Um teto de segurança (20 mil itens por tipo): as listas oficiais têm bem menos. */
const MAXIMO_DE_LEITURAS = 20;

async function umTipo(supabase: Cliente, tipo: string): Promise<ReferenciaDaNogle[] | null> {
  const todas: ReferenciaDaNogle[] = [];
  for (let pagina = 0; pagina < MAXIMO_DE_LEITURAS; pagina++) {
    const r = await supabase.from("connect_referencias").select("tipo, codigo, nome, uf, valor_centavos").eq("tipo", tipo).eq("ativo", true)
      .order("nome").order("codigo").range(pagina * POR_LEITURA, (pagina + 1) * POR_LEITURA - 1);
    if (r.error) return null;
    const lidas = r.data as ReferenciaDaNogle[];
    todas.push(...lidas.filter((x) => x.tipo === tipo));
    if (lidas.length < POR_LEITURA) return todas;
  }
  return null;
}

/** As listas dos tipos pedidos (cada uma inteira) ou null, se alguma leitura falhou. */
export async function lerReferenciasDaNogle<T extends string>(supabase: Cliente, tipos: readonly T[]): Promise<Record<T, ReferenciaDaNogle[]> | null> {
  const listas = await Promise.all(tipos.map((t) => umTipo(supabase, t)));
  if (listas.some((l) => l === null)) return null;
  return Object.fromEntries(tipos.map((t, i) => [t, listas[i] ?? []])) as Record<T, ReferenciaDaNogle[]>;
}

// L12c (ORA-OS-006): o conserto da OS no carrinho e no comprovante: a OS de cada item que a cobra (número e situação).
// Lido à parte: num banco sem a migration entrega_da_os (sem a coluna) ou numa falha de leitura, a venda continua
// aparecendo, só sem o número da OS.
import type { obterSessao } from "../acesso/sessao";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
export type OsDoItem = { os: string; numero: number | null; situacao: string | null };

export async function osDosItens(supabase: Cliente, venda: string): Promise<Map<string, OsDoItem>> {
  const mapa = new Map<string, OsDoItem>();
  const itens = await supabase.from("venda_itens").select("id, os_id").eq("venda_id", venda).not("os_id", "is", null);
  if (itens.error || !itens.data?.length) return mapa;
  const ids = [...new Set(itens.data.flatMap((i) => (i.os_id ? [i.os_id] : [])))];
  const ordens = await supabase.from("ordens_servico").select("id, numero, situacao").in("id", ids);
  for (const i of itens.data) {
    if (!i.os_id) continue;
    const ordem = ordens.error ? undefined : ordens.data.find((o) => o.id === i.os_id);
    mapa.set(i.id, { os: i.os_id, numero: ordem?.numero ?? null, situacao: ordem?.situacao ?? null });
  }
  return mapa;
}

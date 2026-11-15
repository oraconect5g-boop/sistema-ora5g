// O cliente do Supabase no navegador, carregado só na hora do uso (lote QUAL-010b: ORA-QUAL-010). O pacote tem cerca de
// 67 KB comprimidos: importado no topo do componente, ia na primeira visita das telas que enviam foto ou cadastram o
// celular, mesmo para quem só olha a tela. Aqui ele vem quando a pessoa envia a foto ou mexe no celular.
import type { Database } from "./tipos-banco";

export async function clienteDoNavegador(url: string, chavePublica: string) {
  const { createBrowserClient } = await import("@supabase/ssr");
  return createBrowserClient<Database>(url, chavePublica);
}

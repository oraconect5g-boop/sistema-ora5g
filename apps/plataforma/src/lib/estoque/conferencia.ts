// Conferência física do dia (ORA-INV-004), corrigida em 14/11/2026 (#80, REV-DIR-003): a tela lia só os
// 500 primeiros aparelhos e chips da loja e somava essa amostra, então uma loja com 501 itens e o último
// pendente aparecia como "Tudo conferido". Agora o total, os conferidos e os pendentes são contagens feitas no
// banco sobre todo o conjunto que a pessoa pode ver (o RLS vale em cada contagem) e só a lista dos pendentes
// vem por página, com ordem estável. Sem número confiável, a tela não declara a conferência terminada.

export const POR_PAGINA_DA_CONFERENCIA = 100;

/** Pendente hoje: nunca conferido ou conferido antes do início do dia (São Paulo). Filtro `or` do PostgREST. */
export function filtroDosPendentes(desde: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/.test(desde)) throw new Error("início do dia inválido");
  return `conferido_em.is.null,conferido_em.lt."${desde}"`;
}

export type NumerosDaConferencia = { total: number; conferidos: number; pendentes: number };

/** As três contagens do banco; qualquer uma ausente (sem número) torna o resumo desconhecido, nunca zero. */
export function numerosDaConferencia(total: number | null, conferidos: number | null, pendentes: number | null): NumerosDaConferencia | null {
  if (total === null || conferidos === null || pendentes === null) return null;
  return { total, conferidos, pendentes };
}

export function paginasDaConferencia(pendentes: number): number {
  return Math.max(1, Math.ceil(pendentes / POR_PAGINA_DA_CONFERENCIA));
}

/** Página pedida no endereço (1 quando ausente ou inválida); a tela limita ao total de páginas. */
export function paginaDoEndereco(valor: string | null | undefined): number {
  return valor && /^\d{1,5}$/.test(valor) && Number(valor) >= 1 ? Number(valor) : 1;
}

/** Subtítulo do cartão dos pendentes: só diz "Tudo conferido" com o número do banco em zero e estoque presente. */
export function resumoDosPendentes(numeros: NumerosDaConferencia | null, pagina: number): string {
  if (!numeros) return "Não deu para contar agora";
  if (numeros.total === 0) return "Nenhum aparelho ou chip no estoque desta loja";
  if (numeros.pendentes === 0) return "Tudo conferido";
  const paginas = paginasDaConferencia(numeros.pendentes);
  if (paginas === 1) return `${numeros.pendentes} item(ns)`;
  const inicio = (pagina - 1) * POR_PAGINA_DA_CONFERENCIA + 1;
  const fim = Math.min(pagina * POR_PAGINA_DA_CONFERENCIA, numeros.pendentes);
  return `${numeros.pendentes} item(ns) · mostrando ${inicio} a ${fim}`;
}

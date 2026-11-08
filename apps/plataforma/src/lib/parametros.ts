// Parâmetros do endereço (searchParams do Next) vêm de fora: podem faltar, chegar repetidos
// (?a=1&a=2 vira lista) e trazer qualquer texto, inclusive nomes herdados de todo objeto
// JavaScript ("__proto__", "constructor", "toString"...). O tipo declarado na página não
// garante nada disso em tempo de execução (REV-017 / #16).
export type ValorDeParametro = string | string[] | undefined;

/** Só texto simples; lista (parâmetro repetido) conta como ausente. */
export function textoDoParametro(valor: ValorDeParametro): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

/** Chave PRÓPRIA do catálogo; nome herdado, lista ou valor desconhecido dão undefined. */
export function chaveDoCatalogo<T extends object>(catalogo: T, valor: ValorDeParametro): keyof T | undefined {
  const texto = textoDoParametro(valor);
  return texto !== undefined && Object.hasOwn(catalogo, texto) ? (texto as keyof T) : undefined;
}

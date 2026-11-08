// Formatação de linha, chip e documento nas telas da Ora Connect (dados fictícios da demonstração).

/** "41900000101" → "(41) 9 0000-0101". */
export function formatarLinha(numero: string): string {
  const d = numero.replace(/\D/g, "");
  if (d.length !== 11) return numero;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

/** Só o final da linha: "(41) 9 ••••-0101". */
export const mascararLinha = (numero: string) => {
  const d = numero.replace(/\D/g, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) 9 ••••-${d.slice(7)}` : numero;
};

/** CPF mostrado só com os dois últimos dígitos (LGPD). */
export const mascararDocumento = (documento: string) => {
  const d = documento.replace(/\D/g, "");
  return d.length === 11 ? `•••.•••.•••-${d.slice(-2)}` : d.length === 14 ? `••.•••.•••/••••-${d.slice(-2)}` : "—";
};

export const soDigitos = (texto: string) => texto.replace(/\D/g, "");

/** Data dd/mm/aaaa a partir de "dias atrás" (negativo = no futuro), no fuso de São Paulo. */
export function dataRelativa(agora: Date, diasAtras: number): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(agora.getTime() - diasAtras * 86_400_000));
}

export const classeCampo = "min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-[15px] outline-none transition focus:border-acao focus:ring-2 focus:ring-acao/20";

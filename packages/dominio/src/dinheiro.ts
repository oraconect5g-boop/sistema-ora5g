// Dinheiro sempre em CENTAVOS inteiros: nunca ponto flutuante (ETAPA_0_BASE_CONSOLIDADA §3).
// No banco: numeric(14,2). Aqui: inteiro de centavos.

export type Centavos = number;

export function centavos(valor: number): Centavos {
  if (!Number.isSafeInteger(valor)) throw new RangeError("Valor em centavos precisa ser inteiro");
  return valor;
}

// "1.299,90" | "1299,90" | "1299.90" | "1299" -> 129990
export function lerReais(texto: string): Centavos {
  const limpo = texto.trim().replace(/^R\$\s*/, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(limpo)) {
    throw new RangeError("Valor em reais inválido");
  }
  const normalizado = limpo.includes(",") ? limpo.replaceAll(".", "").replace(",", ".") : limpo;
  const [inteiro = "0", fracao = ""] = normalizado.split(".");
  return Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
}

const formatoBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarBRL(valor: Centavos): string {
  return formatoBRL.format(valor / 100).replace(/ /g, " ");
}

// Percentual em pontos-base para evitar frações: 10% = 1000 pb.
export type PontosBase = number;

export const pb = (percentual: number): PontosBase => Math.round(percentual * 100);

// Aplica percentual arredondando para baixo (a favor da empresa ao limitar desconto).
export function aplicarPercentual(valor: Centavos, percentual: PontosBase): Centavos {
  return Math.floor((valor * percentual) / 10_000);
}

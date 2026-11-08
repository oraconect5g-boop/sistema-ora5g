// Dinheiro vindo do banco (auditoria do Codex §7.2): o PostgreSQL guarda centavos em bigint, que
// pode passar do inteiro seguro do JavaScript. Valor fora do inteiro seguro é RECUSADO (erro),
// nunca arredondado em silêncio. Preços reais ficam muito abaixo desse limite (R$ 90 trilhões).
export class ValorForaDoLimite extends Error {
  constructor() {
    super("Valor em centavos fora do limite seguro");
    this.name = "ValorForaDoLimite";
  }
}

export function centavosDoBanco(valor: unknown): number {
  const numero = typeof valor === "string" && /^-?\d+$/.test(valor) ? Number(valor) : valor;
  if (typeof numero !== "number" || !Number.isSafeInteger(numero)) throw new ValorForaDoLimite();
  return numero;
}

// Mesma regra para contagens que vêm do banco (quantidade em estoque, reservado).
export const inteiroDoBanco = centavosDoBanco;

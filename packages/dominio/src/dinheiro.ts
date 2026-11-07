// Dinheiro sempre em CENTAVOS inteiros: nunca ponto flutuante (ETAPA_0_BASE_CONSOLIDADA §3).
// No banco: numeric(14,2). Aqui: inteiro de centavos, sempre dentro do limite seguro do JavaScript.
// Toda função pública valida a entrada em tempo de execução (REV-008): tipos do TypeScript não
// protegem contra NaN, frações ou números grandes demais vindos da tela ou da rede.

export type Centavos = number;

// Converte e valida: inteiro seguro e não negativo. Lança RangeError com o nome do campo.
export function exigirCentavos(valor: unknown, campo = "valor"): Centavos {
  if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor < 0) {
    throw new RangeError(`${campo}: precisa ser um número inteiro de centavos, não negativo`);
  }
  return valor;
}

export const centavos = (valor: number): Centavos => exigirCentavos(valor);

const seguro = (resultado: number, operacao: string): Centavos => {
  if (!Number.isSafeInteger(resultado)) throw new RangeError(`${operacao}: valor grande demais`);
  return resultado;
};

export function somarCentavos(...valores: Centavos[]): Centavos {
  let total = 0;
  for (const v of valores) total = seguro(total + exigirCentavos(v), "soma");
  return total;
}

export function multiplicarCentavos(valor: Centavos, quantidade: number): Centavos {
  if (!Number.isSafeInteger(quantidade) || quantidade < 0) throw new RangeError("quantidade inválida");
  return seguro(exigirCentavos(valor) * quantidade, "multiplicação");
}

// Formatos aceitos (REV-007):
//   "1.299,90" "1299,90" "0,05"     vírgula decimal, com ou sem ponto de milhar
//   "1.000" "1.000.000"             ponto de milhar sem centavos
//   "1299.90" "1299.9" "1299"       ponto decimal (formato técnico) ou só reais
export function lerReais(texto: string): Centavos {
  const limpo = texto.trim().replace(/^R\$\s*/, "");
  let inteiro: string;
  let fracao = "";
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(limpo) || /^\d+,\d{1,2}$/.test(limpo)) {
    [inteiro = "", fracao = ""] = limpo.replaceAll(".", "").split(",");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    inteiro = limpo.replaceAll(".", "");
  } else if (/^\d+(\.\d{1,2})?$/.test(limpo)) {
    [inteiro = "", fracao = ""] = limpo.split(".");
  } else {
    throw new RangeError("Valor em reais inválido");
  }
  if (inteiro.replace(/^0+(?=\d)/, "").length > 13) throw new RangeError("Valor em reais grande demais");
  return seguro(Number(inteiro) * 100 + Number(fracao.padEnd(2, "0")), "leitura");
}

const formatoBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarBRL(valor: Centavos): string {
  if (!Number.isSafeInteger(valor)) throw new RangeError("valor inválido para formatar");
  return formatoBRL.format(valor / 100).replace(/ /g, " ");
}

// Percentual em pontos-base para evitar frações: 10% = 1000 pb. Limite: 0% a 100%.
export type PontosBase = number;

export const pb = (percentual: number): PontosBase => exigirPontosBase(Math.round(percentual * 100));

export function exigirPontosBase(valor: unknown, campo = "percentual"): PontosBase {
  if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor < 0 || valor > 10_000) {
    throw new RangeError(`${campo}: precisa estar entre 0% e 100%`);
  }
  return valor;
}

// Aplica percentual arredondando para baixo (a favor da empresa ao limitar desconto).
export function aplicarPercentual(valor: Centavos, percentual: PontosBase): Centavos {
  const produto = seguro(exigirCentavos(valor) * exigirPontosBase(percentual), "percentual");
  return Math.floor(produto / 10_000);
}

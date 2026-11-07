import { aplicarPercentual, exigirCentavos, exigirPontosBase, type Centavos, type PontosBase } from "./dinheiro";

// Desconto por margem (DEC-U41, ETAPA_0_DECISOES §2B):
// o vendedor pode dar até o MENOR entre (a) o teto da categoria e (b) o desconto que
// mantém a margem mínima depois da taxa do meio de pagamento. Acima disso, pede aprovação.
// Os parâmetros (teto, margem mínima, taxas) AINDA NÃO FORAM DEFINIDOS pelo proprietário:
// devem vir de configuração versionada, nunca fixados no código.

export type PoliticaDesconto = {
  tetoCategoria: PontosBase; // ex.: 1000 = 10% à vista
  margemMinima: PontosBase; // margem mínima sobre o preço líquido
};

export type EntradaDesconto = {
  preco: Centavos;
  custo: Centavos;
  taxaMeioPagamento: PontosBase; // taxa da maquininha/financeira que consome margem
  politica: PoliticaDesconto;
};

export type ResultadoDesconto = {
  maximoSemAprovacao: Centavos;
  motivoDoLimite: "teto_da_categoria" | "margem_minima" | "sem_margem";
};

// REV-008 (resíduo): divisões em inteiros exatos (BigInt só aqui dentro; entradas e saídas
// continuam number). Em valores altos, custo × 10000 passa de 2^53 e a divisão em ponto
// flutuante arredondava ANTES do Math.ceil/Math.floor: o limite saía 1 centavo maior.
// Para dividendo >= 0 e divisor > 0:
const dividirParaCima = (dividendo: bigint, divisor: bigint) => (dividendo + divisor - 1n) / divisor;
// Para divisor > 0. A divisão de BigInt corta em direção ao zero; com dividendo negativo, desce mais um.
const dividirParaBaixo = (dividendo: bigint, divisor: bigint) =>
  dividendo / divisor - (dividendo < 0n && dividendo % divisor !== 0n ? 1n : 0n);

// Margem após desconto e taxa: ((P-D)(1-t) - C) / (P-D) >= m  =>  P-D >= C / (1-t-m)
export function limiteDeDesconto({ preco, custo, taxaMeioPagamento, politica }: EntradaDesconto): ResultadoDesconto {
  exigirCentavos(preco, "preço");
  exigirCentavos(custo, "custo");
  exigirPontosBase(taxaMeioPagamento, "taxa do meio de pagamento");
  exigirPontosBase(politica.tetoCategoria, "teto da categoria");
  exigirPontosBase(politica.margemMinima, "margem mínima");
  const fatorLiquido = 10_000 - taxaMeioPagamento - politica.margemMinima;
  const teto = aplicarPercentual(preco, politica.tetoCategoria);
  if (fatorLiquido <= 0) return { maximoSemAprovacao: 0, motivoDoLimite: "sem_margem" };

  const precoMinimo = dividirParaCima(BigInt(custo) * 10_000n, BigInt(fatorLiquido));
  // Cabe em number sem perda: 0 < preço − preço mínimo <= preço, que é inteiro seguro.
  const pelaMargem = precoMinimo < BigInt(preco) ? Number(BigInt(preco) - precoMinimo) : 0;
  if (pelaMargem === 0 && teto > 0) return { maximoSemAprovacao: 0, motivoDoLimite: "sem_margem" };

  return pelaMargem < teto
    ? { maximoSemAprovacao: pelaMargem, motivoDoLimite: "margem_minima" }
    : { maximoSemAprovacao: teto, motivoDoLimite: "teto_da_categoria" };
}

export type AvaliacaoDesconto = {
  situacao: "sem_desconto" | "dentro_do_limite" | "precisa_aprovacao" | "abaixo_do_custo";
  maximoSemAprovacao: Centavos;
  margemResultante: PontosBase; // pode ser negativa; nunca abaixo de Number.MIN_SAFE_INTEGER
  precoFinal: Centavos;
};

// Margem em pontos-base, arredondada para baixo, em inteiros exatos. Abaixo de
// Number.MIN_SAFE_INTEGER (custo bilionário com preço final de centavos) fica nesse piso,
// para nenhum número inseguro sair do domínio.
function margemEmPontosBase(lucro: Centavos, precoFinal: Centavos): PontosBase {
  if (precoFinal === 0) return -10_000;
  const margem = dividirParaBaixo(BigInt(lucro) * 10_000n, BigInt(precoFinal));
  return margem < BigInt(Number.MIN_SAFE_INTEGER) ? Number.MIN_SAFE_INTEGER : Number(margem);
}

export function avaliarDesconto(entrada: EntradaDesconto, desconto: Centavos): AvaliacaoDesconto {
  if (!Number.isSafeInteger(desconto) || desconto < 0 || desconto > entrada.preco) {
    throw new RangeError("Desconto inválido");
  }
  const { maximoSemAprovacao } = limiteDeDesconto(entrada);
  const precoFinal = entrada.preco - desconto;
  const taxa = aplicarPercentual(precoFinal, entrada.taxaMeioPagamento);
  const lucro = precoFinal - taxa - entrada.custo;
  const margemResultante = margemEmPontosBase(lucro, precoFinal);

  const situacao =
    desconto === 0
      ? "sem_desconto"
      : lucro < 0
        ? "abaixo_do_custo"
        : desconto <= maximoSemAprovacao
          ? "dentro_do_limite"
          : "precisa_aprovacao";
  return { situacao, maximoSemAprovacao, margemResultante, precoFinal };
}

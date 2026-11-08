// REV-019 / #18: acessório vendido por quantidade nunca passa do saldo da loja da sessão.
// Na demonstração o saldo vem das fixtures; no sistema real o servidor confere de novo e reserva
// dentro da transação (ADR-003), porque a tela sozinha não impede duas vendas ao mesmo tempo.

/** Erro a mostrar no item do carrinho, ou null quando a quantidade cabe no estoque. */
export function conferirQuantidade(quantidade: number, saldo: number): string | null {
  if (!Number.isInteger(quantidade) || quantidade < 1) return "Quantidade inválida";
  if (!Number.isInteger(saldo) || saldo <= 0) return "Sem estoque deste acessório nesta loja";
  if (quantidade > saldo) return `Só ${saldo === 1 ? "há 1 unidade" : `há ${saldo} unidades`} em estoque nesta loja`;
  return null;
}

/** O botão de aumentar só fica ativo enquanto houver saldo para mais uma unidade. */
export const podeAumentar = (quantidade: number, saldo: number) => Number.isInteger(saldo) && quantidade < saldo;

/** Aviso ao tentar adicionar de novo um acessório que já está no carrinho com todo o saldo. */
export function avisoDeLimite(nome: string, saldo: number): string {
  if (saldo <= 0) return `${nome}: sem estoque nesta loja.`;
  return `${nome}: o carrinho já tem todo o estoque desta loja (${saldo === 1 ? "1 unidade" : `${saldo} unidades`}).`;
}

import { gerador, semente } from "./aleatorio";
import { imeiDeTeste, PRODUTOS } from "./catalogo";
import { LOJAS } from "./organizacao";

// ⚠️ Estoque FICTÍCIO. IMEIs com dígito verificador válido, mas inventados (prefixo de teste).

export type SituacaoUnidade = "Disponível" | "Conferido" | "Reservado" | "Em trânsito" | "Vendido";

export type UnidadeEstoque = {
  imei: string;
  sku: string;
  loja: string;
  situacao: SituacaoUnidade;
  origem: string;
  diasEmEstoque: number;
};

const APARELHOS = PRODUTOS.filter((p) => p.tipo === "aparelho");

export const UNIDADES_ESTOQUE: readonly UnidadeEstoque[] = (() => {
  const g = gerador(semente("estoque-imei"));
  const lista: UnidadeEstoque[] = [];
  let n = 1;
  for (const loja of LOJAS) {
    for (const aparelho of APARELHOS) {
      const piloto = loja.codigo === "santa-candida" || loja.codigo === "loja-03";
      const quantos = piloto ? g.entre(2, 3) : g.entre(0, 2);
      for (let i = 0; i < quantos; i++) {
        const sorteio = g.proximo();
        const situacao: SituacaoUnidade = i === 0 && piloto ? "Disponível"
          : sorteio < 0.62 ? "Disponível"
            : sorteio < 0.74 ? "Conferido"
              : sorteio < 0.84 ? "Reservado"
                : sorteio < 0.93 ? "Em trânsito" : "Vendido";
        lista.push({
          imei: imeiDeTeste(n++),
          sku: aparelho.sku,
          loja: loja.codigo,
          situacao,
          origem: situacao === "Em trânsito" ? "Transferência entre lojas" : g.chance(0.75) ? "CSV da Rein (prévia)" : "Nota de compra",
          diasEmEstoque: g.entre(1, aparelho.sku === "APA-0004" ? 120 : 75),
        });
      }
    }
  }
  return lista;
})();

export const VENDAVEL: readonly SituacaoUnidade[] = ["Disponível", "Conferido"];

/** Movimentos de um IMEI (livro só de inserção: entrada, conferência, reserva, venda, transferência). */
export function movimentosDoImei(unidade: UnidadeEstoque) {
  const g = gerador(semente(unidade.imei));
  const movimentos: { quando: string; acao: string; quem: string }[] = [
    { quando: `há ${unidade.diasEmEstoque} dias`, acao: `Entrada por ${unidade.origem === "Nota de compra" ? "nota de compra" : "importação do CSV da Rein"}`, quem: "Admin do sistema" },
  ];
  if (unidade.situacao !== "Disponível") movimentos.push({ quando: `há ${Math.max(1, unidade.diasEmEstoque - g.entre(1, 5))} dias`, acao: "Conferido na contagem física", quem: "Marcos Lima" });
  if (unidade.situacao === "Em trânsito") movimentos.push({ quando: "hoje, 08:15", acao: "Saiu em transferência para outra loja", quem: "Marcos Lima" });
  if (unidade.situacao === "Reservado") movimentos.push({ quando: `hoje, ${String(g.entre(9, 15)).padStart(2, "0")}:${String(g.entre(0, 59)).padStart(2, "0")}`, acao: "Reservado em uma venda em andamento (expira se não concluir)", quem: "Vendedor da loja" });
  if (unidade.situacao === "Vendido") movimentos.push({ quando: `há ${g.entre(1, 6)} dias`, acao: "Vendido e baixado do estoque", quem: "Vendedor da loja" });
  return movimentos;
}

export type SaldoAcessorio = { sku: string; loja: string; quantidade: number };

export const SALDOS_ACESSORIOS: readonly SaldoAcessorio[] = (() => {
  const g = gerador(semente("estoque-acessorios"));
  const itens = PRODUTOS.filter((p) => p.tipo === "acessorio" || p.tipo === "chip");
  return LOJAS.flatMap((loja) =>
    itens.map((p) => ({
      sku: p.sku,
      loja: loja.codigo,
      quantidade: loja.codigo === "santa-candida" && p.sku === "ACE-0004" ? 3 : p.tipo === "chip" ? g.entre(40, 140) : g.entre(2, 60),
    })),
  );
})();

export const TRANSFERENCIAS = [
  { codigo: "TR-0042", origem: "loja-03", destino: "santa-candida", itens: "1 Moto G85 · 10 capas", situacao: "Em trânsito", criada: "hoje, 08:15", quem: "Marcos Lima" },
  { codigo: "TR-0041", origem: "santa-candida", destino: "loja-07", itens: "2 Redmi Note 14", situacao: "Aguardando envio", criada: "ontem, 18:40", quem: "Marcos Lima" },
  { codigo: "TR-0040", origem: "loja-05", destino: "loja-02", itens: "1 iPhone 15 · 5 películas", situacao: "Recebida", criada: "ontem, 11:02", quem: "Ricardo Andrade" },
  { codigo: "TR-0039", origem: "loja-09", destino: "loja-11", itens: "3 carregadores 20 W", situacao: "Recebida", criada: "há 3 dias", quem: "Ricardo Andrade" },
] as const;

export const nomeDoProduto = (sku: string) => PRODUTOS.find((p) => p.sku === sku)?.nome ?? sku;

// Planilhas do estoque (lote FIN-009b: ORA-FIN-009, exportação nas demais telas reais). Regras puras: o que cada
// planilha mostra, a partir do que a rota leu (app/estoque/exportar/route.ts). Sem acesso a dados e sem custo (a
// tela do estoque não mostra custo; o valor a custo é o cartão do G3b, só para quem vê o custo).
//
//   Saldo por produto: uma linha por produto em cada local (o saldo do livro, como a lista "Saldo da loja"), com o
//   físico, o reservado (venda e transferência), o disponível para vender (físico − reservado, só nos locais que
//   vendem, como no painel) e o mínimo da variação.
//   Aparelhos e chips: cada item com IMEI ou ICCID que está no estoque, com a situação, a condição, quando foi
//   cadastrado e a última conferência.
import { formatoPedido, type Celula, type FormatoDaPlanilha, type SecaoCsv } from "../csv";
import { CONDICOES } from "./entrada";
import { nomeDe, NOMES_DAS_SITUACOES } from "./regras";

export const LIMITE_DA_PLANILHA_DO_ESTOQUE = 20_000;

export const PARTES_DA_PLANILHA = {
  saldo: { titulo: "Saldo por produto", arquivo: "saldo" },
  itens: { titulo: "Aparelhos e chips", arquivo: "aparelhos-e-chips" },
} as const;
export type ParteDaPlanilha = keyof typeof PARTES_DA_PLANILHA;
export const parteDaPlanilha = (valor: string | null | undefined): ParteDaPlanilha => (valor === "itens" ? "itens" : "saldo");

export type { FormatoDaPlanilha };
/** Planilha nova (FIN-009b): o Excel é o padrão. */
export const formatoDaPlanilha = (valor: string | null | undefined): FormatoDaPlanilha => formatoPedido(valor, "xlsx");

/** O endereço da planilha: sem `loja`, o recorte padrão (a loja do turno). */
export function enderecoDaPlanilha(parte: ParteDaPlanilha, formato: FormatoDaPlanilha, loja?: string | null): string {
  const busca = new URLSearchParams();
  if (parte !== "saldo") busca.set("parte", parte);
  if (formato !== "xlsx") busca.set("formato", formato);
  if (loja) busca.set("loja", loja);
  return busca.size ? `/estoque/exportar?${busca}` : "/estoque/exportar";
}

export type LocalDaPlanilha = { id: string; nome: string; vende: boolean };
export type VarianteDaPlanilha = { id: string; nome: string; sku: string; estoqueMinimo: number; produtoId: string };
export type ProdutoDaPlanilha = { nome: string; marca: string | null; categoria: string };
export type SaldoDaPlanilha = { unidadeId: string; varianteId: string; quantidade: number; reservado: number };
export type ItemDaPlanilha = {
  id: string; unidadeId: string; varianteId: string; imei: string | null; imei2: string | null; iccid: string | null; numeroSerie: string | null;
  situacao: string; condicao: string; criadoEm: string; conferidoEm: string | null;
};

/** Os nomes que a rota leu. Faltar um nome é falha de leitura da rota, nunca célula em branco. */
export type NomesDaPlanilha = {
  local: (id: string) => LocalDaPlanilha;
  variante: (id: string) => VarianteDaPlanilha;
  produto: (id: string) => ProdutoDaPlanilha;
};

const nomeDoLocal = (l: LocalDaPlanilha) => (l.vende ? l.nome : `${l.nome} (não vende)`);
const contagem = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR");
const aviso = (cortada: number | null, oQue: string): SecaoCsv[] =>
  cortada === null ? [] : [{ linhas: [[`Atenção: a planilha vai até ${cortada.toLocaleString("pt-BR")} ${oQue}; escolha um local para ver o resto.`]] }];

export function planilhaDoSaldo(saldos: readonly SaldoDaPlanilha[], nomes: NomesDaPlanilha, onde: string, gerado: string, cortada: number | null): SecaoCsv[] {
  const linhas = saldos.map((s) => ({ s, local: nomes.local(s.unidadeId), variante: nomes.variante(s.varianteId) }))
    .map((x) => ({ ...x, produto: nomes.produto(x.variante.produtoId) }))
    .sort((a, b) => porNome(a.local.nome, b.local.nome) || porNome(a.variante.nome, b.variante.nome) || porNome(a.variante.sku, b.variante.sku)
      || a.s.unidadeId.localeCompare(b.s.unidadeId) || a.s.varianteId.localeCompare(b.s.varianteId));
  return [
    {
      linhas: [
        ["Estoque", PARTES_DA_PLANILHA.saldo.titulo, onde],
        ["Gerado em", gerado, contagem(linhas.length, "linha", "linhas")],
        ["Disponível para vender = físico − reservado (venda e transferência), só nos locais que vendem. Abaixo do mínimo: o disponível menor que o mínimo da variação."],
      ],
    },
    {
      colunas: ["Local", "SKU", "Variação", "Produto", "Marca", "Categoria", "Físico", "Reservado", "Disponível para vender", "Mínimo", "Abaixo do mínimo"],
      linhas: linhas.map(({ s, local, variante, produto }): Celula[] => {
        const disponivel = local.vende ? s.quantidade - s.reservado : 0;
        return [
          nomeDoLocal(local), variante.sku, variante.nome, produto.nome, produto.marca, produto.categoria,
          s.quantidade, s.reservado, disponivel, variante.estoqueMinimo, local.vende && disponivel < variante.estoqueMinimo ? "Sim" : "",
        ];
      }),
    },
    ...aviso(cortada, "linhas"),
  ];
}

const condicao = (codigo: string) => (Object.hasOwn(CONDICOES, codigo) ? CONDICOES[codigo as keyof typeof CONDICOES] : codigo);

export function planilhaDosItens(itens: readonly ItemDaPlanilha[], nomes: NomesDaPlanilha, onde: string, gerado: string, cortada: number | null): SecaoCsv[] {
  const linhas = itens.map((i) => ({ i, local: nomes.local(i.unidadeId), variante: nomes.variante(i.varianteId) }))
    .sort((a, b) => porNome(a.local.nome, b.local.nome) || porNome(a.variante.nome, b.variante.nome)
      || (a.i.imei ?? a.i.iccid ?? "").localeCompare(b.i.imei ?? b.i.iccid ?? "") || a.i.id.localeCompare(b.i.id));
  return [
    {
      linhas: [
        ["Estoque", PARTES_DA_PLANILHA.itens.titulo, onde],
        ["Gerado em", gerado, contagem(linhas.length, "item", "itens")],
        ["Aparelhos e chips no estoque, com IMEI ou ICCID. Reservado: numa venda ainda não concluída."],
      ],
    },
    {
      colunas: ["Local", "SKU", "Variação", "IMEI", "IMEI 2", "ICCID", "Número de série", "Situação", "Condição", "Cadastrado em", "Conferido em"],
      linhas: linhas.map(({ i, local, variante }): Celula[] => [
        nomeDoLocal(local), variante.sku, variante.nome, i.imei, i.imei2, i.iccid, i.numeroSerie,
        nomeDe(NOMES_DAS_SITUACOES, i.situacao) ?? i.situacao, condicao(i.condicao), { instante: i.criadoEm }, i.conferidoEm ? { instante: i.conferidoEm } : null,
      ]),
    },
    ...aviso(cortada, "itens"),
  ];
}

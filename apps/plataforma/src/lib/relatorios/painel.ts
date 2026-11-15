// Relatórios (lote G2a): os recortes de tempo, os endereços, as séries por dia e as tabelas da
// exportação. Contrato dos números: docs/alinhamento/MATRIZ_DEMO_REAL.md, seções 3 (vendas) e 3.5
// (margem). Aqui não há acesso a dados (as consultas ficam em ./consulta) e nada aqui decide quem vê
// custo: a margem só chega a este arquivo depois de o banco conferir custo.ver, loja a loja.
import { nomeCurtoDoTipo } from "../catalogo/cadastro";
import { fracaoCsv, type Celula } from "../csv";
import { chavesDaJanela, janelasDeDias, rotuloDaChave, type Janela, type PeriodoFinanceiro } from "../financeiro/painel";
import { endereco, ticketMedio, type TextosDoRecorte, type VendasDoBanco } from "../inicio/painel";
import { numerosDaMargem, situacaoDaMargem, vendedoresDaMargem, type ItemDaMargem, type MargemDoBanco, type MargemPorVendedor } from "../margem/painel";
import { situacaoDaVenda } from "../vendas/lista";

// ---------------------------------------------------------------------------------------------
// Recorte de tempo: 7, 14 ou 30 dias, sempre dia a dia e contra a janela anterior de mesmo tamanho
// ---------------------------------------------------------------------------------------------
export const PERIODOS_DOS_RELATORIOS = {
  "7": { rotulo: "7 dias", dias: 7 },
  "14": { rotulo: "14 dias", dias: 14 },
  "30": { rotulo: "30 dias", dias: 30 },
} as const;
export type PeriodoDoRelatorio = keyof typeof PERIODOS_DOS_RELATORIOS;
export const ORDEM_DOS_RELATORIOS: readonly PeriodoDoRelatorio[] = ["7", "14", "30"];
/** O padrão é 14 dias (o mesmo da demonstração); valor que a tela não conhece cai nele. */
export const periodoDoRelatorio = (valor: unknown): PeriodoDoRelatorio => (valor === "7" || valor === "30" ? valor : "14");

/** As janelas do relatório: os últimos N dias até agora e os N anteriores, na mesma hora do dia. */
export const janelasDoRelatorio = (periodo: PeriodoDoRelatorio, agora: Date = new Date()) =>
  ({ ...janelasDeDias(PERIODOS_DOS_RELATORIOS[periodo].dias, agora), porHora: false });

/** Os textos dos painéis de vendas (os mesmos do Início) no recorte do relatório. */
export function textosDoRelatorio(periodo: PeriodoDoRelatorio): TextosDoRecorte {
  const { dias } = PERIODOS_DOS_RELATORIOS[periodo];
  return {
    series: { atual: `Estes ${dias} dias`, anterior: `${dias} dias anteriores` },
    antes: `nos ${dias} dias anteriores`, comparacao: `os ${dias} dias anteriores`, quando: "no período",
  };
}

/**
 * O /financeiro tem hoje, 7 e 30 dias. O relatório de 14 dias abre lá o de 30, o menor recorte que
 * cobre os 14; a ligação diz qual período vai abrir.
 */
export const PERIODO_NO_FINANCEIRO: Record<PeriodoDoRelatorio, PeriodoFinanceiro> = { "7": "7", "14": "30", "30": "30" };

// ---------------------------------------------------------------------------------------------
// Endereços: o padrão (14 dias; rede inteira ou loja do turno; primeira página) fica fora
// ---------------------------------------------------------------------------------------------
const periodoNoEndereco = (periodo: PeriodoDoRelatorio) => (periodo === "14" ? null : periodo);

export const enderecoDosRelatorios = (periodo: PeriodoDoRelatorio, loja: string | null, pagina = 1): string =>
  endereco("/relatorios", { periodo: periodoNoEndereco(periodo), loja, pagina: pagina > 1 ? String(pagina) : null });

/** O que vai no arquivo: uma linha por dia (o padrão) ou o detalhe da margem, uma linha por item. */
export type VisaoDaExportacao = "dias" | "itens" | "vendedores";
export const visaoDaExportacao = (valor: unknown): VisaoDaExportacao => (valor === "itens" || valor === "vendedores" ? valor : "dias");
export const enderecoDaExportacao = (periodo: PeriodoDoRelatorio, loja: string | null, ver: VisaoDaExportacao): string =>
  endereco("/relatorios/exportar", { periodo: periodoNoEndereco(periodo), loja, ver: ver === "dias" ? null : ver });

/** Página pedida no endereço, entre 1 e 10.000; qualquer outra coisa é a primeira. */
export const paginaDoRelatorio = (valor: string | undefined): number => Math.max(1, Math.min(10_000, Number.parseInt(valor ?? "1", 10) || 1));

// ---------------------------------------------------------------------------------------------
// Vendas por dia: todos os dias da janela, com zero onde não houve fato
// ---------------------------------------------------------------------------------------------
export type DiaDeVendas = {
  chave: string; rotulo: string;
  vendas: number; vendido: number; subtotal: number; descontos: number;
  cancelamentos: number; cancelado: number; devolucoes: number; devolvido: number;
  /** Cancelado + devolvido, cada um no dia em que aconteceu. */
  desfeito: number;
  /** Vendido − desfeito do dia. Pode ficar abaixo de zero (devolução de venda de outro dia). */
  liquido: number;
  /** V5 do dia. Dia sem venda não tem ticket: o gráfico mostra intervalo, não zero. */
  ticket: number | null;
  /** V6 do dia: descontos ÷ valor de tabela das vendas do dia. */
  fracaoDeDesconto: number | null;
};

const SEM_VENDAS = { vendas: 0, vendido: 0, subtotal: 0, descontos: 0, cancelamentos: 0, cancelado: 0, devolucoes: 0, devolvido: 0 };

export function diasDeVendas(v: VendasDoBanco, janela: Janela): DiaDeVendas[] {
  const fatos = new Map(v.periodos.map((p) => [p.periodo, p] as const));
  return chavesDaJanela(janela, false).map((chave) => {
    const { vendas, vendido, subtotal, descontos, cancelamentos, cancelado, devolucoes, devolvido } = fatos.get(chave) ?? SEM_VENDAS;
    return {
      chave, rotulo: rotuloDaChave(chave), vendas, vendido, subtotal, descontos, cancelamentos, cancelado, devolucoes, devolvido,
      desfeito: cancelado + devolvido, liquido: vendido - cancelado - devolvido,
      ticket: ticketMedio(vendido, vendas), fracaoDeDesconto: subtotal > 0 ? descontos / subtotal : null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Margem por dia
// ---------------------------------------------------------------------------------------------
export type DiaDeMargem = {
  chave: string; rotulo: string;
  /**
   * M1 do dia. Dia sem fato nenhum (nas lojas em que quem pede vê o custo): zero. Dia com fato em
   * que nenhum item tinha custo gravado: nulo, porque a margem é desconhecida, não zero.
   */
  margem: number | null;
  /** Vendido com custo que continuou vendido, e o custo dele: base − custo = margem. */
  base: number; custo: number;
  /** M3 e M2 do dia; nulos sem base positiva e sem venda. */
  fracao: number | null; cobertura: number | null;
  itensSemCusto: number; vendidoSemCusto: number;
};

export function diasDeMargem(m: MargemDoBanco, janela: Janela): DiaDeMargem[] {
  const fatos = new Map(m.periodos.map((p) => [p.periodo, p] as const));
  return chavesDaJanela(janela, false).map((chave) => {
    const f = fatos.get(chave);
    const dia = { chave, rotulo: rotuloDaChave(chave) };
    if (!f) return { ...dia, margem: 0, base: 0, custo: 0, fracao: null, cobertura: null, itensSemCusto: 0, vendidoSemCusto: 0 };
    const n = numerosDaMargem(f);
    return { ...dia, margem: n.temCusto ? n.margem : null, base: n.base, custo: n.custoLiquido, fracao: n.fracao, cobertura: n.cobertura, itensSemCusto: f.itensSemCusto, vendidoSemCusto: f.vendidoSemCusto };
  });
}

// ---------------------------------------------------------------------------------------------
// Exportação: os mesmos números da tela. FIN-009c: cada célula leva o tipo (lib/csv, Celula): o CSV escreve reais
// com vírgula decimal e o percentual com uma casa; o Excel guarda número, data e percentual de verdade. O total e os
// avisos vêm à parte (`rodape`), abaixo da tabela: no Excel, ficam fora do filtro e não se misturam aos dias.
// ---------------------------------------------------------------------------------------------
type Tabela = { colunas: string[]; linhas: Celula[][]; rodape: Celula[][] };

const reais = (centavos: number): Celula => ({ centavos });
const opcional = (centavos: number | null): Celula => (centavos === null ? null : { centavos });
const percentual = (fracao: number | null): Celula => (fracao === null ? null : { fracao });
/** Fração como percentual com uma casa ("32,4"); sem base, célula vazia. */
export const percentualCsv = (fracao: number | null) => (fracao === null ? "" : fracaoCsv(fracao));

const COLUNAS_DE_VENDAS = ["Dia", "Vendas", "Vendido (R$)", "Ticket médio (R$)", "Valor de tabela (R$)", "Descontos (R$)", "Cancelamentos", "Cancelado (R$)", "Devoluções", "Devolvido (R$)", "Líquido (R$)"];
const COLUNAS_DE_MARGEM = ["Margem bruta (R$)", "Vendido com custo, líquido (R$)", "Custo (R$)", "Margem (%)", "Cobertura do custo (%)", "Itens sem custo", "Vendido sem custo (R$)"];

const celulasDeVendas = (d: Omit<DiaDeVendas, "chave" | "rotulo" | "desfeito" | "fracaoDeDesconto">): Celula[] => [
  d.vendas, reais(d.vendido), opcional(d.ticket), reais(d.subtotal), reais(d.descontos),
  d.cancelamentos, reais(d.cancelado), d.devolucoes, reais(d.devolvido), reais(d.liquido),
];
const celulasDeMargem = (d: Omit<DiaDeMargem, "chave" | "rotulo">): Celula[] => [
  opcional(d.margem), reais(d.base), reais(d.custo), percentual(d.fracao), percentual(d.cobertura), d.itensSemCusto, reais(d.vendidoSemCusto),
];
/** A margem do período: zero quando não houve fato nenhum; vazia (desconhecida) quando houve e nenhum item tinha custo gravado. */
const totalDaMargem = (m: MargemDoBanco) => {
  const p = m.totais;
  const n = numerosDaMargem(p);
  return celulasDeMargem({ margem: situacaoDaMargem(m) === "sem_custo" ? null : n.margem, base: n.base, custo: n.custoLiquido, fracao: n.fracao, cobertura: n.cobertura, itensSemCusto: p.itensSemCusto, vendidoSemCusto: p.vendidoSemCusto });
};

/**
 * Uma linha por dia e, no rodapé, a linha "Total", que repete os totais do banco (não é a soma das linhas
 * refeita aqui). As colunas de margem só entram quando `margem` vem (quem não tem custo.ver recebe o
 * arquivo sem elas) e há loja com movimento em que quem pede vê o custo. A margem considera só essas
 * lojas: se alguma ficou fora, a última linha avisa, para o zero de um dia não passar por margem zero.
 */
export function tabelaDosDias(vendas: VendasDoBanco, margem: MargemDoBanco | null, janela: Janela): Tabela {
  const dias = diasDeVendas(vendas, janela);
  const semLojaVisivel = margem !== null && situacaoDaMargem(margem) === "lojas_fora";
  const comMargem = margem !== null && !semLojaVisivel ? margem : null;
  const margens = comMargem ? diasDeMargem(comMargem, janela) : null;
  const t = vendas.totais;
  const total = celulasDeVendas({ ...t, liquido: t.vendido - t.cancelado - t.devolvido, ticket: ticketMedio(t.vendido, t.vendas) });
  const linhas: Celula[][] = dias.map((d, i) => [{ dia: d.chave }, ...celulasDeVendas(d), ...(margens?.[i] ? celulasDeMargem(margens[i]) : [])]);
  const rodape: Celula[][] = [["Total", ...total, ...(comMargem ? totalDaMargem(comMargem) : [])]];
  if (semLojaVisivel) {
    rodape.push(["Atenção: arquivo sem as colunas de margem, porque o movimento do período foi só em loja em que você não vê o custo."]);
  } else if (comMargem && comMargem.lojasFora > 0) {
    rodape.push([`Atenção: a margem considera só as lojas em que você vê o custo; ${comMargem.lojasFora === 1 ? "1 loja com movimento ficou fora" : `${comMargem.lojasFora} lojas com movimento ficaram fora`}.`]);
  }
  return { colunas: comMargem ? [...COLUNAS_DE_VENDAS, ...COLUNAS_DE_MARGEM] : COLUNAS_DE_VENDAS, linhas, rodape };
}

/**
 * PERF-003b: a margem por vendedor de origem, uma linha por vendedor (o nome do ranking), da maior margem para a menor.
 * Vendedor que só vendeu itens sem custo gravado fica com a margem vazia (desconhecida, não zero). As lojas em que
 * quem pede não vê o custo ficam fora, e o rodapé diz quantas.
 */
export function tabelaDosVendedores(m: MargemPorVendedor, nomes: ReadonlyMap<string, string>): Tabela {
  return {
    colunas: ["Vendedor", ...COLUNAS_DE_MARGEM],
    linhas: vendedoresDaMargem(m, nomes).map((l): Celula[] => [
      l.nome, ...celulasDeMargem({
        margem: l.temCusto ? l.margem : null, base: l.base, custo: l.custoLiquido, fracao: l.fracao, cobertura: l.cobertura,
        itensSemCusto: l.parcelas.itensSemCusto, vendidoSemCusto: l.parcelas.vendidoSemCusto,
      }),
    ]),
    rodape: m.lojasFora > 0
      ? [[`Atenção: a margem considera só as lojas em que você vê o custo; ${m.lojasFora === 1 ? "1 loja com movimento ficou fora" : `${m.lojasFora} lojas com movimento ficaram fora`}.`]]
      : [],
  };
}

/** O detalhe da margem: uma linha por item das vendas concluídas no período. Item sem custo gravado fica com custo e margem vazios. */
export function tabelaDosItens(itens: readonly ItemDaMargem[]): Tabela {
  return {
    colunas: ["Venda", "Concluída em", "Loja", "Situação da venda", "Tipo", "Produto", "SKU", "Quantidade", "Preço unitário (R$)", "Desconto (R$)", "Valor (R$)", "Custo unitário (R$)", "Margem bruta (R$)", "Unidades devolvidas"],
    linhas: itens.map((i): Celula[] => [
      i.numero, { instante: i.concluidaEm }, i.unidade ?? "", situacaoDaVenda(i.situacao).nome, nomeCurtoDoTipo(i.tipo), i.variante ?? "", i.sku ?? "",
      i.quantidade, reais(i.precoUnitario), reais(i.desconto), reais(i.valor), opcional(i.custoUnitario), opcional(i.margem), i.devolvidos,
    ]),
    rodape: [],
  };
}

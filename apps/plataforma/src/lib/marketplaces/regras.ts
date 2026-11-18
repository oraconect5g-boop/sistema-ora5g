// Regras da tela dos marketplaces (lote MKTPL-a: ORA-MKTPL-003, ORA-MKTPL-005 e ORA-MKTPL-008; ADR-018): as mensagens, o
// erro do banco → chave do catálogo, a leitura estrita do painel e o período. O banco decide de novo.
import { RespostaInesperada } from "../financeiro/painel";
import type { FalhaDaPlanilha } from "../importacao/csv";
import { contagem, ehObjeto, inteiro, lista, textoOuNulo, type Linha } from "../leitura-do-banco";
import { CAMPOS_DO_MARKETPLACE, CANAIS_DOS_MARKETPLACES, type CampoDoMarketplace, type CanalDoMarketplace } from "./leitura";

export const ERROS_DOS_MARKETPLACES = {
  arquivo: "Escolha o relatório de vendas exportado do painel do canal: CSV ou Excel (.xlsx).",
  vazio: "O arquivo está vazio (no Excel, as linhas precisam estar na primeira aba).",
  grande: "Arquivo grande demais: até 5 MB por envio. Exporte um período menor.",
  linhas: "O arquivo leva até 20.000 linhas: exporte um período menor.",
  colunas: "Arquivo com mais de 100 colunas: tire as colunas que não serão usadas.",
  celula: "Alguma célula passa de 10.000 caracteres: confira o arquivo.",
  aspas: "Há aspas abertas sem fechar no arquivo: confira e salve de novo como CSV.",
  cabecalho: "A primeira linha preenchida precisa ter o nome de cada coluna, sem repetir e sem coluna em branco.",
  xlsx: "Não deu para ler esta planilha do Excel: abra no Excel, salve de novo como .xlsx (ou como CSV) e envie outra vez.",
  xls: "Planilha do Excel antiga (.xls) ou protegida por senha: no Excel, tire a senha e salve como .xlsx ou CSV.",
  navegador: "Este navegador não abre planilha do Excel: atualize o navegador ou salve a planilha como CSV.",
  canal: "Escolha o canal do arquivo: Mercado Livre, Shopee ou TikTok Shop.",
  modo: "Diga como os valores do pedido vêm no arquivo.",
  mapeamento: "Diga qual coluna é o número do pedido, a data e o valor do item ou o preço (cada coluna só pode ser usada uma vez).",
  nenhuma: "Nenhum pedido com número e data no arquivo. Confira as colunas escolhidas.",
  linha: "Há linha que não deu para ler. Confira a coluna escolhida e o arquivo.",
  periodo: "Escolha um período de até 400 dias, com o fim depois do início.",
  permissao: "Os pedidos dos marketplaces são do dono (a mesma permissão do resultado do mês).",
  instante: "Outra importação mexeu nos mesmos pedidos no mesmo instante: tente de novo.",
  dados: "Dados inválidos: confira e tente de novo.",
  falha: "Não deu para concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDosMarketplaces = keyof typeof ERROS_DOS_MARKETPLACES;

export const erroDaPlanilhaNosMarketplaces = (motivo: FalhaDaPlanilha): ErroDosMarketplaces => motivo;

export function erroDosMarketplaces(erro: { code?: string; message?: string } | null | undefined): ErroDosMarketplaces {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501" || codigo === "P0002") return "permissao";
  if (codigo === "23505" || codigo === "40001" || codigo === "40P01") return "instante";
  if (codigo !== "22023") return "falha";
  if (m.includes("20.000")) return "linhas";
  if (m.includes("período")) return "periodo";
  return "dados";
}

const NA_FRASE: Record<CampoDoMarketplace | "itens", string> = {
  pedido: "o número do pedido (sem espaço, até 80 letras)", data: "a data (dia/mês/ano)", situacao: "a situação", codigo: "o código do anúncio (até 80 letras)",
  titulo: "o título", quantidade: "a quantidade (de 1 a 100.000)", valor: "o valor do item (em reais)", preco: "o preço (em reais)",
  tarifas: "as tarifas (em reais)", frete: "o frete (em reais)", reembolsos: "os reembolsos (em reais)", liquido: "o líquido (em reais)",
  data_repasse: "a data do repasse (dia/mês/ano)", itens: "o pedido inteiro (mais de 500 itens)",
};
/** A linha que não deu para ler, em texto para a tela. No modo "repetidos", o valor que muda entre as linhas do pedido também. */
export function textoDoProblemaDoMarketplace(linha: unknown, campo: unknown, texto: unknown): string | null {
  if (typeof linha !== "string" || !/^\d{1,6}$/.test(linha) || typeof campo !== "string" || !(Object.hasOwn(CAMPOS_DO_MARKETPLACE, campo) || campo === "itens")) return null;
  const lido = typeof texto === "string" ? texto.slice(0, 40) : "";
  return `Linha ${linha} do arquivo: não deu para ler ${NA_FRASE[campo as CampoDoMarketplace | "itens"]}${lido === "" ? "" : ` "${lido}"`}. Confira a coluna escolhida, o arquivo e como os valores do pedido vêm nele.`;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = (v: unknown): v is string => typeof v === "string" && DATA.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const diasEntre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);
const menosDias = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
/** O período do endereço: datas do calendário, até 400 dias; senão, os últimos 30 dias até hoje. */
export function periodoDosMarketplaces(inicio: unknown, fim: unknown, hoje: string): { inicio: string; fim: string } {
  if (diaValido(inicio) && diaValido(fim) && diasEntre(inicio, fim) >= 0 && diasEntre(inicio, fim) <= 400) return { inicio, fim };
  return { inicio: menosDias(hoje, 29), fim: hoje };
}

// ---------------------------------------------------------------------------------------------
// O painel (public.marketplace_painel), lido com rigor: forma inesperada é falha, nunca zero
// ---------------------------------------------------------------------------------------------
export type CanalDoPainel = {
  canal: CanalDoMarketplace; pedidos: number; unidades: number; bruto: number; reembolsos: number; tarifas: number; frete: number; liquido: number;
  liquidosEstimados: number; custo: number; lucro: number; pedidosSemCusto: number;
};
export type AnuncioDoPainel = { canal: CanalDoMarketplace; codigo: string; titulo: string | null; produto: string | null; unidades: number; bruto: number; liquido: number; custo: number | null; lucro: number | null };
export type PedidoDoPainel = {
  canal: CanalDoMarketplace; idExterno: string; data: string; situacao: string | null; bruto: number; tarifas: number; frete: number; reembolsos: number;
  liquido: number; liquidoEstimado: boolean; dataRepasse: string | null; unidades: number; custo: number | null; lucro: number | null; itensSemCusto: number;
};
export type PainelDosMarketplaces = { canais: CanalDoPainel[]; anuncios: AnuncioDoPainel[]; pedidos: PedidoDoPainel[]; pedidosNoPeriodo: number; itensSemProduto: number };

const canalDe = (l: Linha): CanalDoMarketplace => {
  const c = l.canal;
  if (typeof c === "string" && Object.hasOwn(CANAIS_DOS_MARKETPLACES, c)) return c as CanalDoMarketplace;
  throw new RespostaInesperada("canal");
};
const inteiroOuNulo = (l: Linha, chave: string) => (l[chave] === null || l[chave] === undefined ? null : inteiro(l, chave));
const dia = (l: Linha, chave: string) => {
  const v = textoOuNulo(l, chave);
  if (v !== null && !DATA.test(v)) throw new RespostaInesperada(chave);
  return v;
};

export function lerPainelDosMarketplaces(dado: unknown): PainelDosMarketplaces {
  if (!ehObjeto(dado)) throw new RespostaInesperada("marketplace_painel");
  const canais = lista(dado, "canais").map((l) => {
    const c: CanalDoPainel = {
      canal: canalDe(l), pedidos: contagem(l, "pedidos"), unidades: contagem(l, "unidades"), bruto: contagem(l, "bruto"), reembolsos: contagem(l, "reembolsos"),
      tarifas: contagem(l, "tarifas"), frete: contagem(l, "frete"), liquido: inteiro(l, "liquido"), liquidosEstimados: contagem(l, "liquidos_estimados"),
      custo: contagem(l, "custo"), lucro: inteiro(l, "lucro"), pedidosSemCusto: contagem(l, "pedidos_sem_custo"),
    };
    if (c.liquidosEstimados > c.pedidos || c.pedidosSemCusto > c.pedidos) throw new RespostaInesperada("contagens");
    return c;
  });
  const anuncios = lista(dado, "anuncios").map((l) => ({
    canal: canalDe(l), codigo: textoOuNulo(l, "codigo") ?? "—", titulo: textoOuNulo(l, "titulo"), produto: textoOuNulo(l, "produto"),
    unidades: contagem(l, "unidades"), bruto: contagem(l, "bruto"), liquido: inteiro(l, "liquido"), custo: inteiroOuNulo(l, "custo"), lucro: inteiroOuNulo(l, "lucro"),
  }));
  const pedidos = lista(dado, "pedidos").map((l) => {
    const data = dia(l, "data");
    if (data === null) throw new RespostaInesperada("data");
    const estimado = l.liquido_estimado;
    if (typeof estimado !== "boolean") throw new RespostaInesperada("liquido_estimado");
    const idExterno = textoOuNulo(l, "id_externo");
    if (idExterno === null || idExterno === "") throw new RespostaInesperada("id_externo");
    return {
      canal: canalDe(l), idExterno, data, situacao: textoOuNulo(l, "situacao"), bruto: contagem(l, "bruto"), tarifas: contagem(l, "tarifas"), frete: contagem(l, "frete"),
      reembolsos: contagem(l, "reembolsos"), liquido: inteiro(l, "liquido"), liquidoEstimado: estimado, dataRepasse: dia(l, "data_repasse"), unidades: contagem(l, "unidades"),
      custo: inteiroOuNulo(l, "custo"), lucro: inteiroOuNulo(l, "lucro"), itensSemCusto: contagem(l, "itens_sem_custo"),
    };
  });
  return { canais, anuncios, pedidos, pedidosNoPeriodo: contagem(dado, "pedidos_no_periodo"), itensSemProduto: contagem(dado, "itens_sem_produto") };
}

/** A margem sobre o bruto, quando o bruto não é zero e o lucro existe. */
export const margemSobreOBruto = (lucro: number | null, bruto: number) => (lucro === null || bruto === 0 ? null : lucro / bruto);

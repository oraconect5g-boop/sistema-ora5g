// Regras da tela dos anúncios (lote META-a: ORA-META-001 por arquivo, ORA-META-003, ORA-META-004 e ORA-META-006; ADR-017):
// as mensagens, o erro do banco → chave do catálogo, a leitura estrita do painel e as fórmulas. O banco decide de novo.
import type { FalhaDaPlanilha } from "../importacao/csv";
import { CAMPOS_DOS_ANUNCIOS, type CampoDosAnuncios } from "./leitura";

export const ERROS_DOS_ANUNCIOS = {
  arquivo: "Escolha o relatório exportado do Gerenciador de Anúncios: CSV ou Excel (.xlsx).",
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
  mapeamento: "Diga qual coluna é o dia, a campanha e o valor usado (cada coluna só pode ser usada uma vez).",
  nenhuma: "Nenhuma linha com dia e campanha no arquivo. Confira as colunas escolhidas.",
  linha: "Há linha que não deu para ler. Confira a coluna escolhida e o arquivo.",
  por_dia: "O arquivo não vem por dia: no Gerenciador de Anúncios, exporte com o detalhamento por dia (Detalhamento → Por tempo → Dia).",
  periodo: "Escolha um período de até 400 dias, com o fim depois do início.",
  permissao: "O custo dos anúncios é do dono (a mesma permissão do resultado do mês).",
  instante: "Outra importação mexeu nos mesmos dias no mesmo instante: tente de novo.",
  dados: "Dados inválidos: confira e tente de novo.",
  falha: "Não deu para concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDosAnuncios = keyof typeof ERROS_DOS_ANUNCIOS;

export const erroDaPlanilhaNosAnuncios = (motivo: FalhaDaPlanilha): ErroDosAnuncios => motivo;

export function erroDosAnuncios(erro: { code?: string; message?: string } | null | undefined): ErroDosAnuncios {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501" || codigo === "P0002") return "permissao";
  if (codigo === "23505" || codigo === "40001" || codigo === "40P01") return "instante";
  if (codigo !== "22023") return "falha";
  if (m.includes("20.000")) return "linhas";
  if (m.includes("período")) return "periodo";
  return "dados";
}

const NA_FRASE: Record<CampoDosAnuncios | "por_dia", string> = {
  dia: "o dia (dia/mês/ano)", fim: "o fim do período (dia/mês/ano)", campanha: "a campanha (até 200 letras)", gasto: "o valor usado (em reais)",
  impressoes: "as impressões (número inteiro)", cliques: "os cliques (número inteiro)", resultados: "os resultados (número inteiro)",
  por_dia: "um dia só (o arquivo precisa vir por dia)",
};
/** A linha que não deu para ler, em texto para a tela. */
export function textoDoProblemaDosAnuncios(linha: unknown, campo: unknown, texto: unknown): string | null {
  if (typeof linha !== "string" || !/^\d{1,6}$/.test(linha) || typeof campo !== "string" || !(Object.hasOwn(CAMPOS_DOS_ANUNCIOS, campo) || campo === "por_dia")) return null;
  const lido = typeof texto === "string" ? texto.slice(0, 40) : "";
  if (campo === "por_dia") return `Linha ${linha} do arquivo: o período "${lido}" não é ${NA_FRASE.por_dia}. ${ERROS_DOS_ANUNCIOS.por_dia}`;
  return `Linha ${linha} do arquivo: não deu para ler ${NA_FRASE[campo as CampoDosAnuncios]}${lido === "" ? "" : ` "${lido}"`}. Confira a coluna escolhida e o arquivo.`;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = (v: unknown): v is string => typeof v === "string" && DATA.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const diasEntre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);
const menosDias = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** O período do endereço: datas do calendário, o fim no início ou depois, até 400 dias; senão, os últimos 30 dias até hoje. */
export function periodoDosAnuncios(inicio: unknown, fim: unknown, hoje: string): { inicio: string; fim: string } {
  if (diaValido(inicio) && diaValido(fim) && diasEntre(inicio, fim) >= 0 && diasEntre(inicio, fim) <= 400) return { inicio, fim };
  return { inicio: menosDias(hoje, 29), fim: hoje };
}

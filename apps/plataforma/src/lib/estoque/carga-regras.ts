// As regras da tela da carga do estoque inicial por loja (lote REIN-b; ADR-021): as mensagens, o erro do banco → chave do
// catálogo, a data de corte do formulário e a leitura estrita dos totais e das linhas. O banco decide de novo.
// REIN-c (F18-03): as resoluções da linha com o físico maior que o disponível.
import type { FalhaDaPlanilha } from "../importacao/csv";

export const ERROS_DA_CARGA = {
  arquivo: "Escolha o relatório de produtos: Excel (.xlsx) ou CSV.",
  vazio: "O arquivo está vazio (no Excel, as linhas precisam estar na primeira aba).",
  grande: "Arquivo grande demais: até 5 MB por envio.",
  linhas: "O arquivo passa de 10.000 linhas, ou uma loja passa de 3.000 produtos: divida o arquivo.",
  colunas: "Arquivo com mais de 100 colunas: tire as colunas que não serão usadas.",
  celula: "Alguma célula passa de 10.000 caracteres: confira o arquivo.",
  aspas: "Há aspas abertas sem fechar no arquivo: confira e salve de novo como CSV.",
  cabecalho: "A primeira linha preenchida precisa ter o nome de cada coluna, sem repetir e sem coluna em branco.",
  xlsx: "Não deu para ler esta planilha do Excel: abra no Excel, salve de novo como .xlsx (ou como CSV) e envie outra vez.",
  xls: "Planilha do Excel antiga (.xls) ou protegida por senha: no Excel, tire a senha e salve como .xlsx ou CSV.",
  navegador: "Este navegador não abre planilha do Excel: atualize o navegador ou salve a planilha como CSV.",
  mapeamento: "Diga qual coluna é o código do produto e, de pelo menos uma loja, a coluna do físico (cada coluna só pode ser usada uma vez; o disponível vai junto com o físico).",
  corte: "Diga a data e a hora da posição do arquivo (a data de corte): antes de agora e no máximo 400 dias atrás.",
  nenhuma: "Nenhuma loja tem quantidade no arquivo com as colunas escolhidas.",
  loja: "A carga é para uma loja, um depósito ou o DEFEITOS ativos desta rede.",
  aplicado: "Este arquivo já foi aplicado nesta loja.",
  propria: "Quem gerou a prévia não aplica: peça a outra pessoa com a aprovação (o dono).",
  outra_aplicada: "A loja já tem uma carga aplicada: desfaça a outra antes de aplicar esta.",
  situacao: "Esta carga não está mais na situação de antes (alguém aplicou, descartou ou desfez): veja abaixo.",
  pendente: "Há linhas com o físico maior que o disponível sem resolução: resolva cada uma em \"Físico maior que o disponível\" antes de aplicar.",
  resolucao: "Escolha o que fazer com a diferença: lançar só o disponível, lançar o físico (conferido na loja) ou deixar de fora.",
  sem_diferenca: "Esta linha não tem diferença a resolver, ou não há mais linha sem resolução.",
  fisico_em_bloco: "O físico se lança linha a linha, depois de conferir na loja que a diferença está livre.",
  inativo: "Um produto foi inativado depois da prévia: gere a prévia de novo.",
  motivo: "Diga o motivo (de 3 a 200 letras).",
  permissao: "A carga do estoque inicial é de quem importa (o administrador) e de quem aprova (o dono).",
  dados: "Dados inválidos: confira e tente de novo.",
  falha: "Não deu para concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDaCarga = keyof typeof ERROS_DA_CARGA;

export const erroDaPlanilhaNaCarga = (motivo: FalhaDaPlanilha): ErroDaCarga => motivo;

export function erroDaCarga(erro: { code?: string; message?: string } | null | undefined): ErroDaCarga {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501") return "permissao";
  if (codigo === "OR023") return "aplicado";
  if (codigo === "OR024") return "propria";
  if (codigo === "OR041") return "outra_aplicada";
  if (codigo === "OR042") return "pendente";
  if (codigo !== "22023") return "falha";
  if (m.includes("data de corte")) return "corte";
  if (m.includes("3.000")) return "linhas";
  if (m.includes("loja, um depósito")) return "loja";
  if (m.includes("inativado")) return "inativo";
  if (m.includes("motivo")) return "motivo";
  if (m.includes("só a prévia") || m.includes("só a carga")) return "situacao";
  if (m.includes("resolução desconhecida")) return "resolucao";
  if (m.includes("diferença a resolver") || m.includes("diferença sem resolução")) return "sem_diferenca";
  if (m.includes("linha a linha")) return "fisico_em_bloco";
  return "dados";
}

/** "2026-11-10T13:20" (o campo do formulário, no horário de Brasília) → o instante com o fuso; outra forma é nula. */
export function corteDoFormulario(valor: unknown): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const instante = new Date(`${valor}:00-03:00`);
  if (Number.isNaN(instante.getTime()) || instante.toISOString().slice(0, 10) < "2020-01-01") return null;
  return `${valor}:00-03:00`;
}

export const ACOES_DA_LINHA = ["entrar", "serializado", "conferir", "sem_produto", "nada"] as const;
export type AcaoDaLinha = (typeof ACOES_DA_LINHA)[number];
export const ROTULOS_DAS_ACOES: Record<AcaoDaLinha, string> = {
  entrar: "Entram no estoque", serializado: "Aparelhos e chips (entram com o IMEI)", conferir: "A conferir", sem_produto: "Fora do catálogo", nada: "Sem quantidade",
};
export const acaoDaLinha = (v: unknown): AcaoDaLinha => (typeof v === "string" && (ACOES_DA_LINHA as readonly string[]).includes(v) ? v as AcaoDaLinha : "conferir");

export type TotaisDaCarga = {
  linhas: number; entrar: number; unidadesEntrar: number; serializado: number; unidadesSerializado: number;
  semProduto: number; conferir: number; nada: number; foraDoDisponivel: number; aResolver: number; resolvidas: number;
  desfeitas: number | null; ficaram: number | null;
};
const contagem = (o: Record<string, unknown>, k: string) => {
  const v = o[k];
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0;
};
/** Os totais gravados na carga (o banco os escreve; o que faltar conta zero, nunca número inventado). */
export function totaisDaCarga(v: unknown): TotaisDaCarga {
  const o = v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const talvez = (k: string) => (typeof o[k] === "number" ? contagem(o, k) : null);
  return {
    linhas: contagem(o, "linhas"), entrar: contagem(o, "entrar"), unidadesEntrar: contagem(o, "unidades_entrar"), serializado: contagem(o, "serializado"),
    unidadesSerializado: contagem(o, "unidades_serializado"), semProduto: contagem(o, "sem_produto"), conferir: contagem(o, "conferir"), nada: contagem(o, "nada"),
    foraDoDisponivel: contagem(o, "fora_do_disponivel"), aResolver: contagem(o, "a_resolver"), resolvidas: contagem(o, "resolvidas"),
    desfeitas: talvez("desfeitas"), ficaram: talvez("ficaram"),
  };
}

// REIN-c (F18-03): o que fazer com a linha do acessório que tem o físico maior que o disponível na data de corte. A
// diferença pode estar reservada, a caminho ou com erro na origem: nada se presume, e quem importa ou aprova decide.
export const RESOLUCOES = ["disponivel", "fisico", "fora"] as const;
export type Resolucao = (typeof RESOLUCOES)[number];
export const ROTULOS_DAS_RESOLUCOES: Record<Resolucao, { titulo: string; detalhe: string }> = {
  disponivel: { titulo: "Lançar só o disponível", detalhe: "a diferença fica fora do estoque até a contagem (pelo inventário)" },
  fisico: { titulo: "Lançar o físico", detalhe: "conferido na loja: a diferença está lá e livre para vender" },
  fora: { titulo: "Deixar a linha de fora", detalhe: "nada entra desta linha; conte e lance depois, pelo inventário" },
};
export const ehResolucao = (v: unknown): v is Resolucao => typeof v === "string" && (RESOLUCOES as readonly string[]).includes(v);
/** Só as decisões que não liberam o que pode estar comprometido valem para todas as linhas de uma vez. */
export const RESOLUCOES_EM_BLOCO = ["disponivel", "fora"] as const satisfies readonly Resolucao[];

export const SITUACOES_DA_CARGA: Record<string, string> = { previa: "prévia", aplicada: "aplicada", descartada: "descartada", desfeita: "desfeita" };

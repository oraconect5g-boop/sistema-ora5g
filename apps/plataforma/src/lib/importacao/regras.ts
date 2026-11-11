// Regras da tela de importação (lote L3c: ORA-CAT-002): mensagens, leitura do formulário de envio e
// erro do banco → chave do catálogo (a tela nunca repete o texto do banco).
import { CAMPOS_DO_CATALOGO, NOMES_DOS_CAMPOS, TIPOS_ACEITOS, lerMapeamento, type Mapeamento, type TipoAceito } from "./catalogo";
import type { FalhaDoCsv } from "./csv";

export const ERROS_DA_IMPORTACAO = {
  arquivo: "Escolha um arquivo CSV (planilha salva como CSV).",
  vazio: "O arquivo está vazio.",
  grande: "Arquivo grande demais: até 5 MB por envio. Divida a planilha em partes.",
  linhas: "Arquivo com mais de 2.000 linhas: divida a planilha em partes de até 2.000 (cada parte é uma importação).",
  colunas: "Arquivo com mais de 60 colunas: tire as colunas que não serão usadas.",
  celula: "Alguma célula passa de 500 caracteres: confira o arquivo.",
  aspas: "Há aspas abertas sem fechar no arquivo: confira e salve de novo como CSV.",
  cabecalho: "A primeira linha precisa ter o nome de cada coluna, sem repetir e sem coluna em branco.",
  mapeamento: "Diga qual coluna é o SKU e qual é o nome (cada coluna só pode ser usada uma vez).",
  padrao: "Escolha o tipo e a categoria para as linhas que não trouxerem esses dados.",
  ja_aplicado: "Este arquivo já foi aplicado antes. Para mudar algo, gere um arquivo novo.",
  mesma_pessoa: "Quem gerou a prévia não aprova: outra pessoa (com permissão de aprovar) confere e aplica.",
  com_erro: "A prévia tem linhas com erro: corrija a planilha e gere outra prévia.",
  agendado: "Uma das variações tem mudança de preço agendada: cancele o agendamento antes de importar.",
  encerrada: "Esta importação já foi encerrada.",
  sku_novo: "Um SKU do arquivo foi cadastrado depois da prévia: gere outra prévia.",
  instante: "Outro preço mudou no mesmo instante: tente de novo.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  permissao: "Sem permissão para esta importação.",
  dados: "Dados inválidos: gere a prévia de novo.",
  falha: "Não deu para concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDaImportacao = keyof typeof ERROS_DA_IMPORTACAO;

export function erroDoBancoNaImportacao(erro: { code?: string; message?: string } | null | undefined): ErroDaImportacao {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "OR023") return "ja_aplicado";
  if (codigo === "OR024") return "mesma_pessoa";
  if (codigo === "OR022") return "agendado";
  if (codigo === "40001") return "instante";
  if (codigo === "23505") return "sku_novo";
  if (codigo === "42501" || codigo === "P0002") return "permissao";
  if (codigo === "22023") {
    if (m.includes("informe o motivo")) return "motivo";
    if (m.includes("linhas com erro")) return "com_erro";
    if (m.includes("encerrada") || m.includes("só se")) return "encerrada";
    if (m.includes("2.000")) return "linhas";
    return "dados";
  }
  return "falha";
}

export const erroDoCsvNaImportacao = (motivo: FalhaDoCsv): ErroDaImportacao => motivo;

export type Envio = { arquivo: File; mapa: Mapeamento; padroes: { tipo: TipoAceito; categoria: string } };
/** Formulário de envio: o arquivo, a coluna de cada campo e os padrões (tipo e categoria). */
export function lerEnvio(dados: FormData, colunas: number): { ok: true; envio: Omit<Envio, "arquivo"> } | { ok: false; erro: ErroDaImportacao } {
  const mapa = lerMapeamento((n) => dados.get(n), colunas);
  if (!mapa) return { ok: false, erro: "mapeamento" };
  const tipo = dados.get("tipo_padrao");
  const categoria = typeof dados.get("categoria_padrao") === "string" ? (dados.get("categoria_padrao") as string).trim().replace(/\s+/g, " ") : "";
  if (typeof tipo !== "string" || !(TIPOS_ACEITOS as readonly string[]).includes(tipo) || categoria.length < 1 || categoria.length > 60) {
    return { ok: false, erro: "padrao" };
  }
  return { ok: true, envio: { mapa, padroes: { tipo: tipo as TipoAceito, categoria } } };
}

/** O que fica gravado do mapeamento: o nome da coluna de cada campo e os padrões (auditoria e repetição). */
export function mapeamentoParaGravar(cabecalho: readonly string[], mapa: Mapeamento, padroes: Envio["padroes"]) {
  const colunas = Object.fromEntries(NOMES_DOS_CAMPOS.filter((c) => mapa[c] !== undefined).map((c) => [c, cabecalho[mapa[c] as number]]));
  return { colunas, padroes };
}

export const ROTULO_DOS_CAMPOS = Object.fromEntries(NOMES_DOS_CAMPOS.map((c) => [c, CAMPOS_DO_CATALOGO[c].rotulo])) as Record<keyof typeof CAMPOS_DO_CATALOGO, string>;

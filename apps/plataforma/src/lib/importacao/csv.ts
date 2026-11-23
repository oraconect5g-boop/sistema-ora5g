// Leitura de planilha CSV para a importação (ORA-CAT-002). Não supõe o formato da Rein (ADR-003 §3,
// pendência B1): lê qualquer CSV com cabeçalho na primeira linha, separado por ponto e vírgula,
// vírgula ou tabulação, com ou sem aspas, em UTF-8 ou Windows-1252 (comum em sistemas brasileiros).
// Limites protegem o servidor: 5 MB, 10.000 linhas de dados, 100 colunas e 10.000 caracteres por célula. Desde o
// REIN-a (17/11), a planilha acima de 2.000 linhas entra em partes de até 2.000 (cada parte cabe no limite de 8 s por
// chamada do banco), e o limite de 500 caracteres vale para cada campo que entra na importação, não para as colunas
// que ficam de fora (a planilha de produtos da Rein tem uma observação com 3.220 caracteres, na célula K955).
//
// Desde o CAT-002b, a planilha do Excel (.xlsx) é lida por lib/importacao/xlsx.ts e chega na mesma forma (a
// Planilha daqui), com os mesmos limites e os mesmos erros; lib/importacao/planilha.ts escolhe o leitor.

// 100 colunas (eram 60 até o CAT-002b): o relatório de produtos da Rein tem 83 (o layout chega com a pendência B1).
export const LIMITES_DA_PLANILHA = { bytes: 5 * 1024 * 1024, linhas: 10_000, colunas: 100, celula: 10_000 } as const;
// O banco aceita até 2.000 linhas por prévia (importacao_catalogo_previa): a planilha maior vira várias prévias.
export const LINHAS_POR_PARTE = 2_000;
// O maior texto de um campo que entra na importação (SKU, nome, marca...): passar disso é erro daquela linha.
export const MAXIMO_DO_CAMPO = 500;
// O banco guarda o número da linha com até 6 algarismos (importacao_catalogo_previa).
export const MAIOR_NUMERO_DE_LINHA = 999_999;

export type Planilha = {
  formato: "csv" | "xlsx";
  cabecalho: string[];
  linhas: string[][];
  /** O número de cada linha de dados no arquivo (no Excel, o da folha): a prévia aponta a linha que a pessoa vê. */
  numeros: number[];
  /** Só no CSV. */
  separador?: ";" | "," | "\t";
  codificacao?: "utf-8" | "windows-1252";
  /** Só no Excel: a aba lida (a primeira visível). */
  aba?: string;
  /**
   * Só no Excel: em cada linha de dados, as colunas cuja célula era NÚMERO na folha (não texto). O leitor escreve o
   * número com ponto decimal ("0.625"); quem lê quantidade ou dinheiro precisa saber a origem, porque no texto da
   * planilha brasileira "1.234" é mil duzentos e trinta e quatro (achado F18-01 da reanálise de 18/11).
   */
  numericas?: number[][];
  /**
   * Só no Excel: em cada linha de dados, as colunas cuja célula estava MARCADA como número na folha, mas escrita fora do
   * padrão do Excel (achado F21-01 da auditoria de 21/11: o relatório da Rein escreve os totais do rodapé como "1.234,00",
   * com a vírgula brasileira, numa célula de número). Essas células valem pelo TEXTO que trazem (não entram em
   * `numericas`: quem lê segue as regras do texto da planilha brasileira), e a origem fica aqui, para a prévia dizer.
   */
  foraDoPadrao?: number[][];
};
export type FalhaDaPlanilha =
  | "vazio" | "grande" | "linhas" | "colunas" | "celula" | "aspas" | "cabecalho"
  // CAT-002b: o Excel danificado ou de outro formato, o .xls antigo (ou com senha) e o navegador sem o descompressor.
  | "xlsx" | "xls" | "navegador";
export class ErroDaPlanilha extends Error {
  constructor(readonly motivo: FalhaDaPlanilha, readonly linha?: number) {
    super(`Planilha inválida: ${motivo}${linha ? ` (linha ${linha})` : ""}`);
    this.name = "ErroDaPlanilha";
  }
}

/** Bytes → texto: UTF-8 quando válido; senão Windows-1252 (Excel e sistemas antigos no Brasil). */
export function decodificar(bytes: Uint8Array): { texto: string; codificacao: NonNullable<Planilha["codificacao"]> } {
  try {
    return { texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""), codificacao: "utf-8" };
  } catch {
    return { texto: new TextDecoder("windows-1252").decode(bytes), codificacao: "windows-1252" };
  }
}

/** O separador é o que mais aparece fora de aspas na primeira linha (o cabeçalho). */
function separadorDo(primeira: string): NonNullable<Planilha["separador"]> {
  const conta = { ";": 0, ",": 0, "\t": 0 };
  let dentro = false;
  for (const c of primeira) {
    if (c === '"') dentro = !dentro;
    else if (!dentro && c in conta) conta[c as keyof typeof conta] += 1;
  }
  const [melhor] = (Object.entries(conta) as [NonNullable<Planilha["separador"]>, number][]).sort((a, b) => b[1] - a[1]);
  return melhor && melhor[1] > 0 ? melhor[0] : ";";
}

/** O cabeçalho precisa do nome de cada coluna, sem coluna em branco e sem repetir (sem diferença de maiúsculas). */
export function conferirCabecalho(cabecalho: readonly string[]) {
  if (cabecalho.some((c) => c === "") || new Set(cabecalho.map((c) => c.toLowerCase())).size !== cabecalho.length) {
    throw new ErroDaPlanilha("cabecalho");
  }
}

/** Lê o CSV inteiro (RFC 4180: aspas dobradas, quebra de linha dentro de aspas). */
export function lerCsv(bytes: Uint8Array): Planilha {
  if (bytes.byteLength === 0) throw new ErroDaPlanilha("vazio");
  if (bytes.byteLength > LIMITES_DA_PLANILHA.bytes) throw new ErroDaPlanilha("grande");
  const { texto, codificacao } = decodificar(bytes);
  const normalizado = texto.replace(/\r\n?/g, "\n");
  const fimDaPrimeira = normalizado.indexOf("\n");
  const separador = separadorDo(fimDaPrimeira < 0 ? normalizado : normalizado.slice(0, fimDaPrimeira));

  const registros: string[][] = [];
  const inicios: number[] = []; // a linha do arquivo em que cada registro começa (linha vazia não conta registro)
  let campo = "";
  let registro: string[] = [];
  let dentro = false;
  let linha = 1;
  let inicio = 1;
  const fecharCampo = () => {
    if (campo.length > LIMITES_DA_PLANILHA.celula) throw new ErroDaPlanilha("celula", linha);
    registro.push(campo.trim());
    campo = "";
    if (registro.length > LIMITES_DA_PLANILHA.colunas) throw new ErroDaPlanilha("colunas", linha);
  };
  const fecharRegistro = () => {
    fecharCampo();
    if (registro.some((c) => c !== "")) {
      registros.push(registro);
      inicios.push(inicio);
      if (registros.length > LIMITES_DA_PLANILHA.linhas + 1) throw new ErroDaPlanilha("linhas");
    }
    registro = [];
  };
  for (let i = 0; i < normalizado.length; i++) {
    const c = normalizado[i] as string;
    if (dentro) {
      if (c === '"') {
        if (normalizado[i + 1] === '"') { campo += '"'; i += 1; } else dentro = false;
      } else {
        if (c === "\n") linha += 1;
        campo += c;
      }
    } else if (c === '"' && campo.trim() === "") {
      dentro = true;
      campo = "";
    } else if (c === separador) {
      fecharCampo();
    } else if (c === "\n") {
      fecharRegistro();
      linha += 1;
      inicio = linha;
    } else {
      campo += c;
    }
  }
  if (dentro) throw new ErroDaPlanilha("aspas", linha);
  if (campo !== "" || registro.length > 0) fecharRegistro();

  const [cabecalho, ...linhas] = registros;
  if (!cabecalho) throw new ErroDaPlanilha("vazio");
  conferirCabecalho(cabecalho);
  const numeros = inicios.slice(1);
  if (numeros.some((n) => n > MAIOR_NUMERO_DE_LINHA)) throw new ErroDaPlanilha("linhas");
  return { formato: "csv", separador, codificacao, cabecalho, linhas, numeros };
}

/** Texto para comparar nomes de coluna e valores: minúsculo, sem acento, espaços simples. */
export const semAcento = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Só o cabeçalho (para a tela mostrar as colunas antes do envio): lê até a primeira quebra de linha fora de aspas. */
export function lerCabecalho(bytes: Uint8Array): { separador: NonNullable<Planilha["separador"]>; colunas: string[] } {
  const { texto } = decodificar(bytes.subarray(0, 64 * 1024));
  let dentro = false;
  let fim = texto.length;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') dentro = !dentro;
    else if (!dentro && (c === "\n" || c === "\r")) { fim = i; break; }
  }
  const primeira = texto.slice(0, fim);
  const planilha = lerCsv(new TextEncoder().encode(`${primeira}\n`));
  return { separador: planilha.separador ?? ";", colunas: planilha.cabecalho };
}

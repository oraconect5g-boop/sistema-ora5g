// Leitura de planilha CSV para a importação (ORA-CAT-002). Não supõe o formato da Rein (ADR-003 §3,
// pendência B1): lê qualquer CSV com cabeçalho na primeira linha, separado por ponto e vírgula,
// vírgula ou tabulação, com ou sem aspas, em UTF-8 ou Windows-1252 (comum em sistemas brasileiros).
// Limites protegem o servidor: 5 MB, 2.000 linhas de dados (cada arquivo cabe no limite de 8 s por
// chamada do banco; planilha maior vai em partes), 60 colunas e 500 caracteres por célula.

export const LIMITES_DO_CSV = { bytes: 5 * 1024 * 1024, linhas: 2_000, colunas: 60, celula: 500 } as const;

export type Planilha = { separador: ";" | "," | "\t"; codificacao: "utf-8" | "windows-1252"; cabecalho: string[]; linhas: string[][] };
export type FalhaDoCsv = "vazio" | "grande" | "linhas" | "colunas" | "celula" | "aspas" | "cabecalho";
export class ErroDoCsv extends Error {
  constructor(readonly motivo: FalhaDoCsv, readonly linha?: number) {
    super(`CSV inválido: ${motivo}${linha ? ` (linha ${linha})` : ""}`);
    this.name = "ErroDoCsv";
  }
}

/** Bytes → texto: UTF-8 quando válido; senão Windows-1252 (Excel e sistemas antigos no Brasil). */
export function decodificar(bytes: Uint8Array): { texto: string; codificacao: Planilha["codificacao"] } {
  try {
    return { texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""), codificacao: "utf-8" };
  } catch {
    return { texto: new TextDecoder("windows-1252").decode(bytes), codificacao: "windows-1252" };
  }
}

/** O separador é o que mais aparece fora de aspas na primeira linha (o cabeçalho). */
function separadorDo(primeira: string): Planilha["separador"] {
  const conta = { ";": 0, ",": 0, "\t": 0 };
  let dentro = false;
  for (const c of primeira) {
    if (c === '"') dentro = !dentro;
    else if (!dentro && c in conta) conta[c as keyof typeof conta] += 1;
  }
  const [melhor] = (Object.entries(conta) as [Planilha["separador"], number][]).sort((a, b) => b[1] - a[1]);
  return melhor && melhor[1] > 0 ? melhor[0] : ";";
}

/** Lê o CSV inteiro (RFC 4180: aspas dobradas, quebra de linha dentro de aspas). */
export function lerCsv(bytes: Uint8Array): Planilha {
  if (bytes.byteLength === 0) throw new ErroDoCsv("vazio");
  if (bytes.byteLength > LIMITES_DO_CSV.bytes) throw new ErroDoCsv("grande");
  const { texto, codificacao } = decodificar(bytes);
  const normalizado = texto.replace(/\r\n?/g, "\n");
  const fimDaPrimeira = normalizado.indexOf("\n");
  const separador = separadorDo(fimDaPrimeira < 0 ? normalizado : normalizado.slice(0, fimDaPrimeira));

  const registros: string[][] = [];
  let campo = "";
  let registro: string[] = [];
  let dentro = false;
  let linha = 1;
  const fecharCampo = () => {
    if (campo.length > LIMITES_DO_CSV.celula) throw new ErroDoCsv("celula", linha);
    registro.push(campo.trim());
    campo = "";
    if (registro.length > LIMITES_DO_CSV.colunas) throw new ErroDoCsv("colunas", linha);
  };
  const fecharRegistro = () => {
    fecharCampo();
    if (registro.some((c) => c !== "")) {
      registros.push(registro);
      if (registros.length > LIMITES_DO_CSV.linhas + 1) throw new ErroDoCsv("linhas");
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
    } else {
      campo += c;
    }
  }
  if (dentro) throw new ErroDoCsv("aspas", linha);
  if (campo !== "" || registro.length > 0) fecharRegistro();

  const [cabecalho, ...linhas] = registros;
  if (!cabecalho) throw new ErroDoCsv("vazio");
  if (cabecalho.some((c) => c === "") || new Set(cabecalho.map((c) => c.toLowerCase())).size !== cabecalho.length) {
    throw new ErroDoCsv("cabecalho");
  }
  return { separador, codificacao, cabecalho, linhas };
}

/** Texto para comparar nomes de coluna e valores: minúsculo, sem acento, espaços simples. */
export const semAcento = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Só o cabeçalho (para a tela mostrar as colunas antes do envio): lê até a primeira quebra de linha fora de aspas. */
export function lerCabecalho(bytes: Uint8Array): { separador: Planilha["separador"]; colunas: string[] } {
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
  return { separador: planilha.separador, colunas: planilha.cabecalho };
}

// Planilha do Excel (XLSX) sem biblioteca (lote FIN-009b: ORA-FIN-009, "XLSX nativo"). Roda no servidor e no navegador
// (FIN-009c): aqui não há nada do Node; quem comprime é quem chama (lib/xlsx-servidor.ts, com o deflate do node:zlib).
// Sem compressão, os arquivos do pacote vão guardados como estão (o ZIP aceita), para as planilhas montadas no navegador.
//
// O CSV abre no Excel, mas o Excel lê número comprido como número: o IMEI (15 dígitos) vira "3,51235E+14" e o ICCID
// (19 ou 20 dígitos) perde os últimos algarismos para sempre quando a planilha é salva. No XLSX cada célula diz o
// próprio tipo: texto fica texto (com zero à esquerda e todos os dígitos), dinheiro e quantidade ficam número (a
// planilha soma) e data fica data (a planilha ordena e filtra). E texto nunca é fórmula: "=1+1" numa célula de
// texto aparece como está, sem a proteção do CSV.
//
// O arquivo é o mínimo que o formato pede (ECMA-376): o pacote ZIP com [Content_Types].xml, as relações, o
// workbook, os estilos e uma folha por aba, com texto direto na célula (inlineStr, sem a tabela de textos
// compartilhados). Cada aba recebe as mesmas seções do CSV (lib/csv: SecaoCsv), uma embaixo da outra com uma
// linha em branco entre elas; o cabeçalho das colunas sai em negrito, e a aba com uma tabela só fica com o
// cabeçalho fixo na rolagem e o filtro do Excel nas colunas.
import type { Celula, SecaoCsv } from "./csv";

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export type Aba = { nome: string; secoes: readonly SecaoCsv[] };
/** Deflate "cru" (sem cabeçalho), o do método 8 do ZIP. */
export type Comprimir = (dados: Uint8Array) => Uint8Array;

// ---------------------------------------------------------------------------------------------
// ZIP (só o necessário: arquivos com deflate ou guardados, sem pastas, sem ZIP64)
// ---------------------------------------------------------------------------------------------
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (o do ZIP): crc32("123456789") = 0xCBF43926. */
export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of dados) c = (TABELA_CRC[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Data e hora fixas (01/01/1980 00:00, o começo do relógio do ZIP): o mesmo conteúdo dá o mesmo arquivo.
const DATA_DO_ZIP = (0 << 9) | (1 << 5) | 1;
const HORA_DO_ZIP = 0;

const UTF8 = new TextEncoder();

function juntar(pedacos: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const tudo = new Uint8Array(pedacos.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of pedacos) {
    tudo.set(p, i);
    i += p.length;
  }
  return tudo;
}

/** O pacote ZIP. Com `comprimir`, cada arquivo vai com deflate (método 8); sem, guardado como está (método 0). */
export function gerarZip(arquivos: readonly { nome: string; dados: Uint8Array }[], comprimir: Comprimir | null): Uint8Array<ArrayBuffer> {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;
  for (const a of arquivos) {
    const nome = UTF8.encode(a.nome);
    const gravado = comprimir ? comprimir(a.dados) : a.dados;
    const metodo = comprimir ? 8 : 0;
    const crc = crc32(a.dados);
    const local = new Uint8Array(30);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true); // versão necessária: 2.0
    l.setUint16(8, metodo, true);
    l.setUint16(10, HORA_DO_ZIP, true);
    l.setUint16(12, DATA_DO_ZIP, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, gravado.length, true);
    l.setUint32(22, a.dados.length, true);
    l.setUint16(26, nome.length, true);
    partes.push(local, nome, gravado);

    const entrada = new Uint8Array(46);
    const e = new DataView(entrada.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(10, metodo, true);
    e.setUint16(12, HORA_DO_ZIP, true);
    e.setUint16(14, DATA_DO_ZIP, true);
    e.setUint32(16, crc, true);
    e.setUint32(20, gravado.length, true);
    e.setUint32(24, a.dados.length, true);
    e.setUint16(28, nome.length, true);
    // comprimento do extra e do comentário, disco, atributos e marcas: zero
    e.setUint32(42, deslocamento, true);
    central.push(entrada, nome);
    deslocamento += local.length + nome.length + gravado.length;
  }
  const tamanhoDoCentral = central.reduce((s, b) => s + b.length, 0);
  if (deslocamento + tamanhoDoCentral > 0xffffffff || arquivos.length > 0xffff) throw new Error("planilha grande demais para o ZIP sem ZIP64");
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, arquivos.length, true);
  f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamanhoDoCentral, true);
  f.setUint32(16, deslocamento, true);
  return juntar([...partes, ...central, fim]);
}

// ---------------------------------------------------------------------------------------------
// Células
// ---------------------------------------------------------------------------------------------
// Caracteres que o XML 1.0 não aceita (controles, menos tabulação e quebras; U+FFFE e U+FFFF) saem do texto.
const FORA_DO_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export const textoXml = (texto: string) =>
  texto.replace(FORA_DO_XML, "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Coluna 0 → "A", 25 → "Z", 26 → "AA". */
export function colunaExcel(indice: number): string {
  let n = indice + 1;
  let nome = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    nome = String.fromCharCode(65 + resto) + nome;
    n = Math.floor((n - 1) / 26);
  }
  return nome;
}

// Estilos (a ordem de cellXfs em styles.xml): 0 normal, 1 negrito, 2 dinheiro, 3 dia, 4 dia e hora, 5 percentual.
const ESTILO = { normal: 0, negrito: 1, dinheiro: 2, dia: 3, instante: 4, percentual: 5 } as const;
const MAXIMO_DA_CELULA = 32_767; // o Excel não guarda mais que isso numa célula

// Dias desde 30/12/1899 (o zero das datas do Excel) até 01/01/1970.
const DIAS_ATE_1970 = 25_569;
const DIA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const PARTES_EM_SAO_PAULO = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** "2026-11-13" → 46339 (o número do dia no Excel). Dia inválido: nulo. */
export function serialDoDia(dia: string): number | null {
  const m = DIA_ISO.exec(dia);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const conferido = new Date(ms);
  if (conferido.getUTCMonth() !== Number(m[2]) - 1 || conferido.getUTCDate() !== Number(m[3])) return null;
  return ms / 86_400_000 + DIAS_ATE_1970;
}

/** Um instante → o número do dia e da hora no relógio de São Paulo (o Excel não guarda fuso). Inválido: nulo. */
export function serialDoInstante(instante: string): number | null {
  const data = new Date(instante);
  if (Number.isNaN(data.getTime())) return null;
  const p = Object.fromEntries(PARTES_EM_SAO_PAULO.formatToParts(data).map((x) => [x.type, x.value]));
  const ms = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((ms / 86_400_000 + DIAS_ATE_1970) * 86_400) / 86_400; // no segundo
}

/** Centavos como número decimal exato ("-1234.56"), sem passar por conta de ponto flutuante. */
const decimalDosCentavos = (centavos: number) => {
  const absoluto = Math.abs(Math.trunc(centavos));
  return `${centavos < 0 ? "-" : ""}${Math.trunc(absoluto / 100)}.${String(absoluto % 100).padStart(2, "0")}`;
};

function celulaXml(referencia: string, celula: Celula, negrito: boolean): string {
  if (celula === null || celula === "") return "";
  const texto = (t: string) => {
    const curto = t.length > MAXIMO_DA_CELULA ? t.slice(0, MAXIMO_DA_CELULA) : t;
    return `<c r="${referencia}"${negrito ? ` s="${ESTILO.negrito}"` : ""} t="inlineStr"><is><t xml:space="preserve">${textoXml(curto)}</t></is></c>`;
  };
  const numero = (valor: string, estilo: number) => `<c r="${referencia}"${estilo ? ` s="${estilo}"` : ""}><v>${valor}</v></c>`;
  if (typeof celula === "string") return texto(celula);
  if (typeof celula === "number") return Number.isFinite(celula) ? numero(String(celula), negrito ? ESTILO.negrito : ESTILO.normal) : "";
  if ("centavos" in celula) return Number.isFinite(celula.centavos) ? numero(decimalDosCentavos(celula.centavos), ESTILO.dinheiro) : "";
  if ("dia" in celula) {
    const serial = serialDoDia(celula.dia);
    return serial === null ? texto(celula.dia) : numero(String(serial), ESTILO.dia);
  }
  if ("fracao" in celula) return Number.isFinite(celula.fracao) ? numero(String(celula.fracao), ESTILO.percentual) : "";
  const serial = serialDoInstante(celula.instante);
  return serial === null ? texto(celula.instante) : numero(String(serial), ESTILO.instante);
}

/** Quantos caracteres a célula ocupa na tela, para a largura da coluna. */
function larguraDaCelula(celula: Celula): number {
  if (celula === null) return 0;
  if (typeof celula === "string") return Math.max(...celula.replace(FORA_DO_XML, "").split("\n").map((l) => l.length));
  if (typeof celula === "number") return String(celula).length;
  if ("centavos" in celula) return decimalDosCentavos(celula.centavos).length + Math.floor(String(Math.abs(Math.trunc(celula.centavos / 100))).length / 3);
  return "dia" in celula ? 10 : "fracao" in celula ? 7 : 16;
}

// ---------------------------------------------------------------------------------------------
// Folha
// ---------------------------------------------------------------------------------------------
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const CABECA_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

type Folha = { xml: string; filtro: string | null };

function folhaXml(aba: Aba): Folha {
  const linhas: string[] = [];
  const larguras: number[] = [];
  const tabelas = aba.secoes.filter((s) => s.colunas).length;
  // A largura sai das tabelas (um título comprido no alto não alarga a primeira coluna); sem tabela, de tudo.
  const medir = (linha: readonly Celula[]) => linha.forEach((c, i) => { larguras[i] = Math.max(larguras[i] ?? 0, larguraDaCelula(c)); });
  let numero = 0;
  let maiorColuna = 0;
  const escrever = (linha: readonly Celula[], negrito: boolean) => {
    numero += 1;
    maiorColuna = Math.max(maiorColuna, linha.length);
    const celulas = linha.map((c, i) => celulaXml(`${colunaExcel(i)}${numero}`, c, negrito)).join("");
    if (celulas) linhas.push(`<row r="${numero}">${celulas}</row>`);
  };
  let t: { cabecalho: number; ultima: number; colunas: number } | null = null;
  for (const [s, secao] of aba.secoes.entries()) {
    if (s > 0) numero += 1; // a linha em branco entre as seções
    if (secao.colunas) {
      escrever(secao.colunas, true);
      const cabecalho = numero;
      for (const l of secao.linhas) escrever(l, false);
      if (tabelas === 1) t = { cabecalho, ultima: numero, colunas: secao.colunas.length };
      medir(secao.colunas);
      secao.linhas.forEach(medir);
    } else {
      for (const l of secao.linhas) escrever(l, false);
      if (tabelas === 0) secao.linhas.forEach(medir);
    }
  }
  const usado = `A1:${colunaExcel(Math.max(maiorColuna, 1) - 1)}${Math.max(numero, 1)}`;
  const vista = t
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${t.cabecalho}" topLeftCell="A${t.cabecalho + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${t.cabecalho + 1}" sqref="A${t.cabecalho + 1}"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const colunas = larguras.length
    ? `<cols>${larguras.map((l, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(8, l + 2))}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const filtro = t ? `A${t.cabecalho}:${colunaExcel(t.colunas - 1)}${t.ultima}` : null;
  const xml = `${CABECA_XML}<worksheet ${NS} ${NS_R}><dimension ref="${usado}"/>${vista}<sheetFormatPr defaultRowHeight="15"/>${colunas}`
    + `<sheetData>${linhas.join("")}</sheetData>${filtro ? `<autoFilter ref="${filtro}"/>` : ""}`
    // Sem o triângulo verde de "número guardado como texto" no SKU, no IMEI e no ICCID: são texto de propósito.
    + `<ignoredErrors><ignoredError sqref="${usado}" numberStoredAsText="1"/></ignoredErrors></worksheet>`;
  return { xml, filtro };
}

/** Nome de aba que o Excel aceita: sem []:*?/\, até 31 caracteres, sem repetir. */
export function nomesDasAbas(nomes: readonly string[]): string[] {
  const usados = new Set<string>();
  return nomes.map((nome, i) => {
    const base = nome.replace(/[[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").replace(/\s+/g, " ").trim().slice(0, 31) || `Planilha ${i + 1}`;
    let escolhido = base;
    for (let n = 2; usados.has(escolhido.toLowerCase()); n++) escolhido = `${base.slice(0, 31 - ` (${n})`.length)} (${n})`;
    usados.add(escolhido.toLowerCase());
    return escolhido;
  });
}

const ESTILOS = `${CABECA_XML}<styleSheet ${NS}>`
  + '<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="167" formatCode="0.0%"/></numFmts>'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

/**
 * O arquivo .xlsx com as abas pedidas (pelo menos uma). No servidor, use gerarXlsx (lib/xlsx-servidor), que comprime;
 * no navegador, `comprimir` nulo (os arquivos vão guardados: a planilha fica maior, mas são poucas linhas).
 */
export function montarXlsx(abas: readonly Aba[], comprimir: Comprimir | null): Uint8Array<ArrayBuffer> {
  if (abas.length === 0) throw new Error("planilha sem aba");
  const nomes = nomesDasAbas(abas.map((a) => a.nome));
  const folhas = abas.map(folhaXml);
  const tipos = `${CABECA_XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + folhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
    + "</Types>";
  const relacoes = `${CABECA_XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  // O filtro do Excel guarda o intervalo também num nome escondido da pasta, como o próprio Excel grava.
  const nomesDefinidos = folhas.map((f, i) => (f.filtro
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${textoXml(`'${(nomes[i] ?? "").replaceAll("'", "''")}'!${f.filtro.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2")}`)}</definedName>`
    : "")).join("");
  const pasta = `${CABECA_XML}<workbook ${NS} ${NS_R}><bookViews><workbookView/></bookViews><sheets>`
    + nomes.map((nome, i) => `<sheet name="${textoXml(nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")
    + `</sheets>${nomesDefinidos ? `<definedNames>${nomesDefinidos}</definedNames>` : ""}</workbook>`;
  const relacoesDaPasta = `${CABECA_XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
    + `<Relationship Id="rId${folhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const utf8 = (texto: string) => UTF8.encode(texto);
  return gerarZip([
    { nome: "[Content_Types].xml", dados: utf8(tipos) },
    { nome: "_rels/.rels", dados: utf8(relacoes) },
    { nome: "xl/workbook.xml", dados: utf8(pasta) },
    { nome: "xl/_rels/workbook.xml.rels", dados: utf8(relacoesDaPasta) },
    { nome: "xl/styles.xml", dados: utf8(ESTILOS) },
    ...folhas.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: utf8(f.xml) })),
  ], comprimir);
}

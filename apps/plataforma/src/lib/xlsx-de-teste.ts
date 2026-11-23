// Só para os testes (lote FIN-009b): abre o .xlsx que lib/xlsx gera e confere o pacote (a soma CRC-32 e o tamanho
// de cada arquivo do ZIP e o XML bem formado). Não é um leitor de planilhas: entende só o que lib/xlsx escreve.
import { deflateRawSync, inflateRawSync } from "node:zlib";

import { crc32, gerarZip } from "./xlsx";

const ENTIDADE_SOLTA = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

/** XML bem formado o bastante para o teste: cada marca fechada na ordem, uma raiz, sem "&" solto nem "<" no texto. */
export function conferirXml(nome: string, xml: string) {
  const s = xml.replace(/^<\?xml[^>]*\?>\s*/, "");
  const marca = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|[^<]+/y;
  const pilha: string[] = [];
  let raizes = 0;
  for (let i = 0; i < s.length; i = marca.lastIndex) {
    marca.lastIndex = i;
    const m = marca.exec(s);
    if (!m) throw new Error(`${nome}: XML inválido perto de "${s.slice(i, i + 60)}"`);
    if (ENTIDADE_SOLTA.test(m[2] === undefined ? m[0] : (m[3] ?? ""))) throw new Error(`${nome}: "&" solto perto de "${m[0].slice(0, 60)}"`);
    if (m[2] === undefined) continue;
    if (pilha.length === 0 && !m[1]) raizes += 1;
    if (m[1]) {
      if (pilha.pop() !== m[2]) throw new Error(`${nome}: </${m[2]}> fora de ordem`);
    } else if (!m[4]) {
      pilha.push(m[2]);
    }
  }
  if (pilha.length) throw new Error(`${nome}: sem fechar: ${pilha.join(", ")}`);
  if (raizes !== 1) throw new Error(`${nome}: ${raizes} raízes`);
}

/** Os arquivos do pacote, pelo nome, já conferidos. */
export function abrirXlsx(arquivo: Uint8Array): Map<string, string> {
  const b = Buffer.from(arquivo);
  const fim = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fim < 0) throw new Error("sem o fim do ZIP");
  const total = b.readUInt16LE(fim + 10);
  let p = b.readUInt32LE(fim + 16);
  if (p + b.readUInt32LE(fim + 12) !== fim) throw new Error("diretório central fora do lugar");
  const partes = new Map<string, string>();
  for (let n = 0; n < total; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error("diretório central inválido");
    const metodo = b.readUInt16LE(p + 10);
    const crc = b.readUInt32LE(p + 16);
    const comprimido = b.readUInt32LE(p + 20);
    const tamanho = b.readUInt32LE(p + 24);
    const comprimentoDoNome = b.readUInt16LE(p + 28);
    const local = b.readUInt32LE(p + 42);
    const nome = b.subarray(p + 46, p + 46 + comprimentoDoNome).toString("utf8");
    if (b.readUInt32LE(local) !== 0x04034b50 || b.readUInt32LE(local + 14) !== crc) throw new Error(`cabeçalho local inválido: ${nome}`);
    const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const bruto = b.subarray(inicio, inicio + comprimido);
    const dados = metodo === 8 ? inflateRawSync(bruto) : bruto;
    if (dados.length !== tamanho || crc32(dados) !== crc) throw new Error(`arquivo corrompido: ${nome}`);
    const texto = dados.toString("utf8");
    conferirXml(nome, texto);
    partes.set(nome, texto);
    p += 46 + comprimentoDoNome + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return partes;
}

const desfazer = (t: string) => t.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
const indiceDaColuna = (letras: string) => [...letras].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1;

/** As linhas de uma folha, pela posição: texto como texto, número como número, célula vazia como nula. */
export function linhasDaFolha(xml: string): (string | number | null)[][] {
  const linhas: (string | number | null)[][] = [];
  for (const [, numero, corpo] of xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)) {
    const linha: (string | number | null)[] = [];
    for (const [, coluna, texto, valor] of (corpo ?? "").matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>)/g)) {
      const i = indiceDaColuna(coluna ?? "A");
      while (linha.length < i) linha.push(null);
      linha[i] = texto !== undefined ? desfazer(texto) : valor !== undefined ? Number(valor) : null;
    }
    const n = Number(numero) - 1;
    while (linhas.length < n) linhas.push([]);
    linhas[n] = linha;
  }
  return linhas;
}

// ---------------------------------------------------------------------------------------------
// AUD-c (F21-01): um .xlsx montado à mão, para o que lib/xlsx não escreve: a célula MARCADA como número (t="n") com um
// conteúdo qualquer, como o "1.234,00" (a vírgula brasileira) do rodapé do relatório da Rein. Só para os testes.
// ---------------------------------------------------------------------------------------------
/** O texto vai em linha (inlineStr); `{ n }` é a célula marcada como número, com o conteúdo como dado; nulo, sem célula. */
export type CelulaDeTeste = string | { n: string } | null;

/** A letra da coluna (0 → A, 26 → AA). */
function letraDaColuna(coluna: number): string {
  let n = coluna + 1;
  let s = "";
  while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const noXml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** O .xlsx com uma aba, a primeira linha como cabeçalho; cada linha da folha é uma lista de células (ver CelulaDeTeste). */
export function xlsxMontadoAMao(linhas: readonly (readonly CelulaDeTeste[])[], aba = "Produtos"): Uint8Array<ArrayBuffer> {
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const NS_REL = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  const TIPO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const dados = linhas.map((celulas, i) => `<row r="${i + 1}">${celulas.map((c, j) => c === null ? ""
    : typeof c === "string" ? `<c r="${letraDaColuna(j)}${i + 1}" t="inlineStr"><is><t>${noXml(c)}</t></is></c>`
    : `<c r="${letraDaColuna(j)}${i + 1}" t="n"><v>${noXml(c.n)}</v></c>`).join("")}</row>`).join("");
  const arquivos: [string, string][] = [
    ["[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ["_rels/.rels", `<?xml version="1.0"?><Relationships ${NS_REL}><Relationship Id="rId1" Type="${TIPO}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0"?><workbook ${NS}><sheets><sheet name="${noXml(aba)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships ${NS_REL}><Relationship Id="rId1" Type="${TIPO}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet ${NS}><dimension ref="A1"/><sheetData>${dados}</sheetData></worksheet>`],
  ];
  return gerarZip(arquivos.map(([nome, xml]) => ({ nome, dados: new TextEncoder().encode(xml) })), (d) => deflateRawSync(d));
}

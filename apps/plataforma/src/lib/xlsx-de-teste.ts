// Só para os testes (lote FIN-009b): abre o .xlsx que lib/xlsx gera e confere o pacote (a soma CRC-32 e o tamanho
// de cada arquivo do ZIP e o XML bem formado). Não é um leitor de planilhas: entende só o que lib/xlsx escreve.
import { inflateRawSync } from "node:zlib";

import { crc32 } from "./xlsx";

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

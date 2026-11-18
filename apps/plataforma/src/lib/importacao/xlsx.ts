// Leitura da planilha do Excel (.xlsx) para a importação (lote CAT-002b: ORA-CAT-002, "importar produtos e preços
// da Rein somente por CSV/XLSX"). Sem biblioteca, como o gerador de planilhas (lib/xlsx.ts): o .xlsx é um pacote ZIP
// com XML dentro (ECMA-376). Daqui sai a mesma Planilha do CSV (lib/importacao/csv.ts), com os mesmos limites e erros,
// e o número de cada linha na folha (a prévia aponta a linha que a pessoa vê no Excel).
//
// Não supõe o formato da Rein (ADR-003 §3, pendência B1): lê a primeira aba visível, com o nome das colunas na
// primeira linha preenchida, e a pessoa diz qual coluna é cada campo, como no CSV.
//
// Cada célula vira o texto que ela guarda: texto fica texto (com zero à esquerda e todos os dígitos); número fica como
// o Excel o mostra no formato Geral, com até 15 algarismos significativos (1299.9; 7891234567895), sem arredondar
// para o formato da célula (o preço com mais de 2 casas aparece como erro na prévia, e não arredondado em silêncio);
// fórmula vale pelo último resultado guardado no arquivo; VERDADEIRO e FALSO; o erro (#N/A) vai como está. Data não é
// campo da importação e fica como o número do dia no Excel.
//
// Aqui não há nada do Node nem do navegador: quem chama passa o "descomprimir" (deflate cru, o do método 8 do ZIP): o
// servidor com o node:zlib (descomprimir-servidor.ts) e o navegador com o DecompressionStream (descomprimir-navegador.ts).
//
// O arquivo vem de fora, então: até 5 MB no envio; cada XML descomprime até 48 MB e nunca além do tamanho declarado no
// ZIP; a soma CRC-32 de cada parte é conferida; ZIP64, criptografia, outros métodos de compressão, DOCTYPE e CDATA são
// recusados; nenhuma entidade é expandida além das cinco do XML e dos códigos numéricos; e o XML é percorrido numa
// passada só, sem expressão que volte atrás no texto (arquivo malicioso não prende o servidor).
import { crc32 } from "../xlsx";
import { conferirCabecalho, ErroDaPlanilha, LIMITES_DA_PLANILHA, MAIOR_NUMERO_DE_LINHA, type Planilha } from "./csv";

/** Deflate cru → bytes, sem passar de `tamanho` (o declarado no ZIP); passou ou falhou: lança. */
export type Descomprimir = (dados: Uint8Array, tamanho: number) => Promise<Uint8Array>;

/** O maior XML descomprimido que se lê (a folha, os textos compartilhados): 2.000 linhas cabem com folga. */
export const LIMITE_DO_XML = 48 * 1024 * 1024;
const MAIOR_MARCA = 16 * 1024; // uma marca do XML (<c r="A1" t="s">) tem poucas dezenas de letras
const MAIOR_LINHA_DO_EXCEL = 1_048_576;
const MAIOR_COLUNA_DO_EXCEL = 16_384;

const quebrada = () => new ErroDaPlanilha("xlsx");

/** O começo de um ZIP ("PK\x03\x04"): o .xlsx. */
export const pareceXlsx = (bytes: Uint8Array) => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** O começo do formato antigo do Office (.xls) — e também do .xlsx protegido por senha, que o Excel guarda nele. */
export const pareceXlsAntigo = (bytes: Uint8Array) => bytes.length >= 8 && OLE.every((b, i) => bytes[i] === b);

// ---------------------------------------------------------------------------------------------
// ZIP: o diretório central (sem ZIP64, sem criptografia; só deflate e guardado)
// ---------------------------------------------------------------------------------------------
type Parte = { metodo: number; crc: number; comprimido: number; tamanho: number; local: number };

class Pacote {
  private readonly dv: DataView;
  /** Nome em minúsculas → parte (o nome das partes não diferencia maiúsculas: ECMA-376, parte 2). */
  private readonly partes = new Map<string, Parte>();

  constructor(private readonly bytes: Uint8Array, private readonly descomprimir: Descomprimir) {
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dv = this.dv;
    // O fim do diretório central: 22 bytes e um comentário de até 65.535, procurado de trás para a frente.
    let fim = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) throw quebrada();
    const naqui = dv.getUint16(fim + 8, true);
    const total = dv.getUint16(fim + 10, true);
    const tamanho = dv.getUint32(fim + 12, true);
    const inicio = dv.getUint32(fim + 16, true);
    // Um disco só, e sem as marcas do ZIP64 (o pacote de até 5 MB nunca precisa delas).
    if (dv.getUint16(fim + 4, true) !== 0 || dv.getUint16(fim + 6, true) !== 0 || naqui !== total || total === 0xffff) throw quebrada();
    if (inicio === 0xffffffff || tamanho === 0xffffffff || inicio + tamanho > fim) throw quebrada();
    let p = inicio;
    for (let n = 0; n < total; n++) {
      if (p + 46 > fim || dv.getUint32(p, true) !== 0x02014b50) throw quebrada();
      const marcas = dv.getUint16(p + 8, true);
      const nome = dv.getUint16(p + 28, true);
      const extra = dv.getUint16(p + 30, true);
      const comentario = dv.getUint16(p + 32, true);
      if (p + 46 + nome + extra + comentario > fim) throw quebrada();
      if (marcas & 0x1) throw quebrada(); // criptografado
      const chave = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nome)).toLowerCase();
      if (this.partes.has(chave)) throw quebrada(); // dois arquivos com o mesmo nome: qual valeria?
      this.partes.set(chave, {
        metodo: dv.getUint16(p + 10, true), crc: dv.getUint32(p + 16, true), comprimido: dv.getUint32(p + 20, true),
        tamanho: dv.getUint32(p + 24, true), local: dv.getUint32(p + 42, true),
      });
      p += 46 + nome + extra + comentario;
    }
  }

  /** O XML de uma parte, conferido (tamanho e CRC-32). Parte que não existe: nulo. */
  async xml(nome: string): Promise<string | null> {
    const parte = this.partes.get(nome.toLowerCase());
    if (!parte) return null;
    const { bytes, dv } = this;
    if (parte.local + 30 > bytes.length || dv.getUint32(parte.local, true) !== 0x04034b50) throw quebrada();
    const dados = parte.local + 30 + dv.getUint16(parte.local + 26, true) + dv.getUint16(parte.local + 28, true);
    if (dados + parte.comprimido > bytes.length) throw quebrada();
    if (parte.tamanho > LIMITE_DO_XML) throw new ErroDaPlanilha("grande");
    const gravado = bytes.subarray(dados, dados + parte.comprimido);
    let saida: Uint8Array;
    if (parte.metodo === 0) {
      if (parte.comprimido !== parte.tamanho) throw quebrada();
      saida = gravado;
    } else if (parte.metodo === 8) {
      try {
        saida = await this.descomprimir(gravado, parte.tamanho);
      } catch (e) {
        if (e instanceof ErroDaPlanilha) throw e;
        throw quebrada();
      }
    } else {
      throw quebrada();
    }
    if (saida.length !== parte.tamanho || crc32(saida) !== parte.crc) throw quebrada();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(saida).replace(/\r\n?/g, "\n");
    } catch {
      throw quebrada();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// XML: uma passada só, marca a marca
// ---------------------------------------------------------------------------------------------
type Visitante = {
  abrir?(nome: string, atributos: string): void;
  fechar?(nome: string): void;
  texto?(texto: string): void;
};
/** Sinal para parar de percorrer (a leitura só do cabeçalho). */
const PARAR = Symbol("parar");

const semPrefixo = (nome: string) => {
  const i = nome.indexOf(":");
  return i < 0 ? nome : nome.slice(i + 1);
};

/** Percorre o XML: cada marca ou trecho de texto uma vez (a expressão só anda para a frente). */
function percorrer(xml: string, visitante: Visitante) {
  const pedaco = /<([^<>]*)>|([^<]+)/y;
  let posicao = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  try {
    while (posicao < xml.length) {
      pedaco.lastIndex = posicao;
      const m = pedaco.exec(xml);
      if (!m) throw quebrada();
      posicao = pedaco.lastIndex;
      const marca = m[1];
      if (marca === undefined) {
        visitante.texto?.(m[2] as string);
        continue;
      }
      if (marca.length > MAIOR_MARCA) throw quebrada();
      const primeira = marca[0];
      if (primeira === "?") continue; // a declaração <?xml ...?>
      if (primeira === "!") {
        if (marca.startsWith("!--") && marca.endsWith("--")) continue; // comentário
        throw quebrada(); // DOCTYPE e CDATA: o Excel não escreve, e DOCTYPE é a porta das entidades
      }
      if (primeira === "/") {
        visitante.fechar?.(semPrefixo(marca.slice(1).trim()));
        continue;
      }
      const vazia = marca.endsWith("/");
      const corpo = vazia ? marca.slice(0, -1) : marca;
      const espaco = corpo.search(/\s/);
      const nome = semPrefixo(espaco < 0 ? corpo : corpo.slice(0, espaco));
      if (nome === "") throw quebrada();
      visitante.abrir?.(nome, espaco < 0 ? "" : corpo.slice(espaco));
      if (vazia) visitante.fechar?.(nome);
    }
  } catch (e) {
    if (e !== PARAR) throw e;
  }
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** O texto do XML: as cinco entidades e os códigos numéricos; depois, o escape _xHHHH_ do Office (_x000D_ → \r). */
export function textoDoXml(bruto: string): string {
  return bruto
    .replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos);/g, (todo, nome: string) => {
      if (nome[0] !== "#") return ENTIDADES[nome] ?? todo;
      const codigo = nome[1] === "x" ? Number.parseInt(nome.slice(2), 16) : Number.parseInt(nome.slice(1), 10);
      return codigo > 0 && codigo <= 0x10ffff && (codigo < 0xd800 || codigo > 0xdfff) ? String.fromCodePoint(codigo) : "";
    })
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/** Os atributos de uma marca, um a um, sempre para a frente (nome="valor" ou nome='valor'). */
function atributos(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const um = /\s*([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
  const resto = /\s*$/y;
  let i = 0;
  while (i < texto.length) {
    resto.lastIndex = i;
    if (resto.test(texto)) break;
    um.lastIndex = i;
    const m = um.exec(texto);
    if (!m) throw quebrada();
    mapa.set(m[1] as string, textoDoXml(m[2] ?? m[3] ?? ""));
    i = um.lastIndex;
  }
  return mapa;
}

// ---------------------------------------------------------------------------------------------
// O livro: as relações, a aba e os textos compartilhados
// ---------------------------------------------------------------------------------------------
type Relacao = { id: string; tipo: string; caminho: string };

/** "xl/workbook.xml" + "worksheets/sheet1.xml" → "xl/worksheets/sheet1.xml"; alvo com "/" vale da raiz do pacote. */
function resolver(base: string, alvo: string): string {
  if (alvo.startsWith("/")) return alvo.slice(1);
  const partes = base.split("/").slice(0, -1);
  for (const p of alvo.split("/")) {
    if (p === "..") partes.pop();
    else if (p !== "." && p !== "") partes.push(p);
  }
  return partes.join("/");
}
/** As relações de uma parte ficam em <pasta>/_rels/<nome>.rels. */
const relacoesDe = (parte: string) => {
  const i = parte.lastIndexOf("/");
  return `${parte.slice(0, i + 1)}_rels/${parte.slice(i + 1)}.rels`;
};

function lerRelacoes(xml: string, base: string): Relacao[] {
  const lista: Relacao[] = [];
  percorrer(xml, {
    abrir(nome, texto) {
      if (nome !== "Relationship") return;
      const a = atributos(texto);
      const id = a.get("Id");
      const tipo = a.get("Type");
      const alvo = a.get("Target");
      if (!id || !tipo || !alvo || a.get("TargetMode") === "External") return;
      lista.push({ id, tipo, caminho: resolver(base, alvo) });
    },
  });
  return lista;
}

function lerAbas(xml: string): { nome: string; visivel: boolean; relacao: string }[] {
  const abas: { nome: string; visivel: boolean; relacao: string }[] = [];
  let dentro = false;
  percorrer(xml, {
    abrir(nome, texto) {
      if (nome === "sheets") dentro = true;
      if (nome !== "sheet" || !dentro) return;
      const a = atributos(texto);
      // A relação vem no atributo id do espaço das relações (r:id; o prefixo pode ser outro).
      const relacao = [...a.entries()].find(([chave]) => chave.endsWith(":id"))?.[1];
      if (relacao) abas.push({ nome: a.get("name") ?? "", visivel: (a.get("state") ?? "visible") === "visible", relacao });
    },
    fechar(nome) {
      if (nome === "sheets") dentro = false;
    },
  });
  return abas;
}

/** Os textos compartilhados: cada <si>, com os pedaços de texto rico juntos e sem a leitura fonética (<rPh>). */
function lerTextos(xml: string): string[] {
  const textos: string[] = [];
  let atual: string | null = null;
  let fonetica = 0;
  let noTexto = false;
  percorrer(xml, {
    abrir(nome) {
      if (nome === "si") atual = "";
      else if (nome === "rPh") fonetica += 1;
      else if (nome === "t" && atual !== null && fonetica === 0) noTexto = true;
    },
    fechar(nome) {
      if (nome === "si" && atual !== null) {
        textos.push(textoDoXml(atual));
        atual = null;
      } else if (nome === "rPh") fonetica = Math.max(0, fonetica - 1);
      else if (nome === "t") noTexto = false;
    },
    texto(t) {
      if (noTexto && atual !== null) atual += t;
    },
  });
  return textos;
}

// ---------------------------------------------------------------------------------------------
// A folha
// ---------------------------------------------------------------------------------------------
/** O número como o Excel o mostra no formato Geral: até 15 algarismos significativos, sem zeros sobrando. */
export function numeroComoNoExcel(bruto: string): string {
  const v = bruto.trim();
  if (/^-?\d{1,15}$/.test(v)) return v.replace(/^(-?)0+(?=\d)/, "$1");
  const n = Number(v);
  if (v === "" || !Number.isFinite(n)) return v;
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const [mantissa = "", expoente] = n.toPrecision(15).split("e");
  const limpa = mantissa.includes(".") ? mantissa.replace(/0+$/, "").replace(/\.$/, "") : mantissa;
  return expoente === undefined ? limpa : `${limpa}E${expoente.startsWith("-") ? "-" : "+"}${expoente.replace(/^[+-]/, "")}`;
}

/** "AB12" → 27 (a coluna, a partir de 0). */
function colunaDaReferencia(referencia: string): number {
  const m = /^([A-Za-z]{1,3})\d*$/.exec(referencia);
  if (!m) throw quebrada();
  let n = 0;
  for (const letra of (m[1] as string).toUpperCase()) n = n * 26 + (letra.charCodeAt(0) - 64);
  return n - 1;
}

function valorDaCelula(tipo: string, valor: string, textoEmLinha: string, textos: readonly string[]): string {
  switch (tipo) {
    case "s": {
      const v = valor.trim();
      if (v === "") return "";
      if (!/^\d{1,9}$/.test(v) || Number(v) >= textos.length) throw quebrada();
      return textos[Number(v)] as string;
    }
    case "inlineStr": return textoDoXml(textoEmLinha);
    case "b": return valor.trim() === "1" ? "VERDADEIRO" : valor.trim() === "0" ? "FALSO" : textoDoXml(valor);
    case "str": case "e": case "d": return textoDoXml(valor);
    default: return numeroComoNoExcel(textoDoXml(valor));
  }
}

type Folha = Pick<Planilha, "cabecalho" | "linhas" | "numeros" | "numericas">;

/** Os tipos de célula que guardam texto (ou verdadeiro e falso); o resto é número, como o Excel o guarda (F18-01). */
const TIPOS_DE_TEXTO = new Set(["s", "inlineStr", "b", "str", "e", "d"]);

function lerFolha(xml: string, textos: readonly string[], soCabecalho: boolean): Folha {
  const lidas: { numero: number; celulas: string[]; numericas: number[] }[] = [];
  let nosDados = false;
  let linha: { numero: number; celulas: string[]; numericas: number[] } | null = null;
  let ultimaLinha = 0;
  let celula: { coluna: number; tipo: string } | null = null;
  let ultimaColuna = -1;
  let destino: "valor" | "texto" | null = null;
  let emLinha = false;
  let fonetica = 0;
  let valor = "";
  let textoEmLinha = "";
  percorrer(xml, {
    abrir(nome, texto) {
      if (nome === "sheetData") { nosDados = true; return; }
      if (!nosDados) return;
      if (nome === "row") {
        const r = atributos(texto).get("r");
        const numero = r === undefined ? ultimaLinha + 1 : /^\d{1,7}$/.test(r) ? Number(r) : Number.NaN;
        // As linhas vêm em ordem, cada uma uma vez (o Excel sempre escreve assim).
        if (!(numero > ultimaLinha) || numero > MAIOR_LINHA_DO_EXCEL) throw quebrada();
        ultimaLinha = numero;
        ultimaColuna = -1;
        linha = { numero, celulas: [], numericas: [] };
        return;
      }
      if (nome === "c" && linha) {
        const a = atributos(texto);
        const r = a.get("r");
        const coluna = r === undefined ? ultimaColuna + 1 : colunaDaReferencia(r);
        // As células vêm em ordem, cada uma uma vez, e dentro das 16.384 colunas do Excel (com ou sem a referência).
        if (coluna <= ultimaColuna || coluna >= MAIOR_COLUNA_DO_EXCEL) throw quebrada();
        ultimaColuna = coluna;
        celula = { coluna, tipo: a.get("t") ?? "n" };
        valor = "";
        textoEmLinha = "";
        emLinha = false;
        fonetica = 0;
        return;
      }
      if (!celula) return;
      if (nome === "v") destino = "valor";
      else if (nome === "is") emLinha = true;
      else if (nome === "rPh") fonetica += 1;
      else if (nome === "t" && emLinha && fonetica === 0) destino = "texto";
    },
    fechar(nome) {
      if (nome === "sheetData") { nosDados = false; return; }
      if (!nosDados) return;
      if (nome === "v" || nome === "t") { destino = null; return; }
      if (nome === "is") { emLinha = false; return; }
      if (nome === "rPh") { fonetica = Math.max(0, fonetica - 1); return; }
      if (nome === "c" && celula && linha) {
        const texto = valorDaCelula(celula.tipo, valor, textoEmLinha, textos).trim();
        if (texto !== "") {
          if (celula.coluna >= LIMITES_DA_PLANILHA.colunas) throw new ErroDaPlanilha("colunas", linha.numero);
          if (texto.length > LIMITES_DA_PLANILHA.celula) throw new ErroDaPlanilha("celula", linha.numero);
          linha.celulas[celula.coluna] = texto;
          if (!TIPOS_DE_TEXTO.has(celula.tipo)) linha.numericas.push(celula.coluna);
        }
        celula = null;
        destino = null;
        return;
      }
      if (nome === "row" && linha) {
        // Linha sem nenhuma célula preenchida (só formatação, por exemplo) não conta, como a linha vazia do CSV.
        if (linha.celulas.length > 0) {
          lidas.push({ numero: linha.numero, celulas: Array.from(linha.celulas, (c) => c ?? ""), numericas: linha.numericas });
          if (lidas.length > LIMITES_DA_PLANILHA.linhas + 1) throw new ErroDaPlanilha("linhas");
          if (soCabecalho) throw PARAR;
        }
        linha = null;
      }
    },
    texto(t) {
      if (destino === "valor") valor += t;
      else if (destino === "texto") textoEmLinha += t;
    },
  });
  const [cabecalho, ...dados] = lidas;
  if (!cabecalho) throw new ErroDaPlanilha("vazio");
  conferirCabecalho(cabecalho.celulas);
  if (dados.some((l) => l.numero > MAIOR_NUMERO_DE_LINHA)) throw new ErroDaPlanilha("linhas");
  return { cabecalho: cabecalho.celulas, linhas: dados.map((l) => l.celulas), numeros: dados.map((l) => l.numero), numericas: dados.map((l) => l.numericas) };
}

// ---------------------------------------------------------------------------------------------
// A planilha
// ---------------------------------------------------------------------------------------------
/**
 * Lê a primeira aba visível do .xlsx. Com `soCabecalho`, para na primeira linha preenchida (a tela mostra as colunas
 * antes do envio). Arquivo que não é .xlsx, danificado ou além dos limites: ErroDaPlanilha.
 */
export async function lerXlsx(bytes: Uint8Array, descomprimir: Descomprimir, opcoes: { soCabecalho?: boolean } = {}): Promise<Planilha> {
  if (bytes.byteLength === 0) throw new ErroDaPlanilha("vazio");
  if (bytes.byteLength > LIMITES_DA_PLANILHA.bytes) throw new ErroDaPlanilha("grande");
  if (pareceXlsAntigo(bytes)) throw new ErroDaPlanilha("xls");
  if (!pareceXlsx(bytes)) throw quebrada();
  const pacote = new Pacote(bytes, descomprimir);
  // O livro é o documento principal do pacote (as relações da raiz); sem elas, o lugar de sempre.
  const raiz = await pacote.xml("_rels/.rels");
  const principal = raiz === null ? undefined : lerRelacoes(raiz, "").find((r) => r.tipo.endsWith("/officeDocument"))?.caminho;
  const livro = principal ?? "xl/workbook.xml";
  const [xmlDoLivro, xmlDasRelacoes] = [await pacote.xml(livro), await pacote.xml(relacoesDe(livro))];
  if (xmlDoLivro === null || xmlDasRelacoes === null) throw quebrada(); // .docx, .ods e outros ZIP não têm livro
  const relacoes = lerRelacoes(xmlDasRelacoes, livro);
  const folhas = new Map(relacoes.filter((r) => r.tipo.endsWith("/worksheet")).map((r) => [r.id, r.caminho]));
  // A primeira aba que a pessoa vê no Excel: a primeira visível que é folha de dados (não gráfico).
  const aba = lerAbas(xmlDoLivro).find((a) => a.visivel && folhas.has(a.relacao));
  if (!aba) throw quebrada();
  const caminhoDosTextos = relacoes.find((r) => r.tipo.endsWith("/sharedStrings"))?.caminho;
  const xmlDosTextos = caminhoDosTextos ? await pacote.xml(caminhoDosTextos) : null;
  const xmlDaFolha = await pacote.xml(folhas.get(aba.relacao) as string);
  if (xmlDaFolha === null) throw quebrada();
  const folha = lerFolha(xmlDaFolha, xmlDosTextos === null ? [] : lerTextos(xmlDosTextos), opcoes.soCabecalho === true);
  return { formato: "xlsx", aba: aba.nome, ...folha };
}

// Leitura da planilha do Excel (lote CAT-002b: ORA-CAT-002). Planilhas FICTÍCIAS montadas no teste (nenhum arquivo
// real da Rein: o formato chega com a pendência B1): pela mão, parte a parte do pacote, e pelo próprio gerador de
// planilhas do sistema (lib/xlsx). Confere o conteúdo de cada tipo de célula, a aba escolhida, o número das linhas, os
// limites da importação e a recusa do arquivo danificado, adulterado ou malicioso, no servidor e no navegador.
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { colunaExcel, gerarZip } from "../xlsx";
import { gerarXlsx } from "../xlsx-servidor";
import { montarLinhas } from "./catalogo";
import { ErroDaPlanilha, LIMITES_DA_PLANILHA } from "./csv";
import { descomprimirNoNavegador } from "./descomprimir-navegador";
import { descomprimirNoServidor } from "./descomprimir-servidor";
import { lerColunasDoArquivo, lerPlanilha } from "./planilha";
import { LIMITE_DO_XML, lerXlsx, numeroComoNoExcel, textoDoXml } from "./xlsx";

const utf8 = (t: string) => new TextEncoder().encode(t);
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const NS_REL = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const TIPO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const RAIZ = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships ${NS_REL}><Relationship Id="rId1" Type="${TIPO}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

type Aba = { nome: string; estado?: string; dados: string };
/** Um .xlsx montado à mão: as abas (o miolo de sheetData de cada uma), os textos compartilhados e partes trocadas (nulo tira). */
function pacote({ abas, textos, partes = {} }: { abas: Aba[]; textos?: string[]; partes?: Record<string, string | null> }) {
  const arquivos: Record<string, string | null> = {
    "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    "_rels/.rels": RAIZ,
    "xl/workbook.xml": `<?xml version="1.0"?>\n<workbook ${NS}><sheets>${abas.map((a, i) => `<sheet name="${a.nome}" sheetId="${i + 1}"${a.estado ? ` state="${a.estado}"` : ""} r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?>\n<Relationships ${NS_REL}>${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${TIPO}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}`
      + `${textos ? `<Relationship Id="rId99" Type="${TIPO}/sharedStrings" Target="sharedStrings.xml"/>` : ""}</Relationships>`,
    ...Object.fromEntries(abas.map((a, i) => [`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0"?>\r\n<worksheet ${NS}><dimension ref="A1"/><sheetData>${a.dados}</sheetData></worksheet>`])),
    ...(textos ? { "xl/sharedStrings.xml": `<?xml version="1.0"?>\n<sst ${NS} count="${textos.length}">${textos.join("")}</sst>` } : {}),
    ...partes,
  };
  const lista = Object.entries(arquivos).filter((e): e is [string, string] => e[1] !== null);
  return gerarZip(lista.map(([nome, xml]) => ({ nome, dados: utf8(xml) })), (d) => deflateRawSync(d));
}
const ler = (bytes: Uint8Array, opcoes: { soCabecalho?: boolean } = {}) => lerXlsx(bytes, descomprimirNoServidor, opcoes);
async function falha(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (e) {
    return e instanceof ErroDaPlanilha ? e.motivo : `outro: ${String(e)}`;
  }
  return null;
}
const linha = (r: number, celulas: string) => `<row r="${r}" spans="1:3">${celulas}</row>`;
const s = (ref: string, i: number) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
const n = (ref: string, v: string) => `<c r="${ref}" s="2"><v>${v}</v></c>`;
const t = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
const CABECALHO = linha(1, t("A1", "SKU") + t("B1", "Nome"));
const simples = (dados = `${CABECALHO}${linha(2, t("A2", "ACE-1") + t("B2", "Capa"))}`) => pacote({ abas: [{ nome: "Plan1", dados }] });

/** O deslocamento do registro do diretório central de uma parte (para adulterar o pacote no teste). */
function noCentral(bytes: Uint8Array, nome: string): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fim = bytes.length - 22;
  let p = dv.getUint32(fim + 16, true);
  for (let i = 0; i < dv.getUint16(fim + 10, true); i++) {
    const tamanho = dv.getUint16(p + 28, true);
    if (new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + tamanho)) === nome) return p;
    p += 46 + tamanho + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  throw new Error(`sem ${nome}`);
}
function adulterar(bytes: Uint8Array, nome: string, mudar: (dv: DataView, p: number) => void) {
  const copia = bytes.slice();
  mudar(new DataView(copia.buffer), noCentral(copia, nome));
  return copia;
}
const FOLHA = "xl/worksheets/sheet1.xml";

afterEach(() => vi.unstubAllGlobals());

describe("planilha do Excel: o conteúdo", () => {
  it("lê a planilha que o próprio sistema gera: texto fica texto (zero à esquerda, IMEI inteiro), dinheiro como o Excel mostra", async () => {
    const bytes = gerarXlsx([{ nome: "Produtos", secoes: [{
      colunas: ["SKU", "Descrição", "Preço", "IMEI"],
      linhas: [["007", "Capa", { centavos: 7_990 }, "351234567890123"], ["APA-1", "Galaxy & A15 <128 GB>", { centavos: 129_990 }, null]],
    }] }]);
    expect(await ler(bytes)).toEqual({
      formato: "xlsx", aba: "Produtos", cabecalho: ["SKU", "Descrição", "Preço", "IMEI"],
      linhas: [["007", "Capa", "79.9", "351234567890123"], ["APA-1", "Galaxy & A15 <128 GB>", "1299.9"]], numeros: [2, 3],
    });
    // E chega à prévia como no CSV: o preço em centavos e o número da linha da folha.
    const linhas = montarLinhas(await ler(bytes), { sku: 0, nome: 1, preco: 2 }, { tipo: "acessorio", categoria: "Acessórios" });
    expect(linhas.map((l) => [l.numero, l.sku, l.preco, l.erros])).toEqual([[2, "007", 7_990, []], [3, "APA-1", 129_990, []]]);
  });

  it("textos compartilhados com texto rico, leitura fonética, entidades e o escape do Office; o número da linha é o da folha", async () => {
    const bytes = pacote({
      textos: [
        "<si><t>SKU</t></si>", "<si><t>Nome</t></si>", "<si><t>Preço</t></si>", "<si><t>A&amp;B-1</t></si>",
        '<si><r><rPr><b/></rPr><t xml:space="preserve">Capa </t></r><r><t>Azul</t></r><rPh sb="0" eb="1"><t>かぱ</t></rPh></si>',
        "<si><t>Cabo_x005F_x0041_ USB&#10;tipo C</t></si>", "<si><t>Y-3</t></si>", "<si/>",
      ],
      abas: [{ nome: "Itens", dados:
        linha(2, '<c r="B2" s="3"/>') // só formatação: não conta
        + linha(3, s("A3", 0) + s("B3", 1) + s("C3", 2))
        + linha(4, s("A4", 3) + s("B4", 4) + n("C4", "79.900000000000006"))
        + linha(5, t("A5", "  X-2  ") + n("C5", "10"))
        + linha(9, s("A9", 6) + s("B9", 5) + s("C9", 7)) }],
    });
    const p = await ler(bytes);
    expect(p.cabecalho).toEqual(["SKU", "Nome", "Preço"]);
    expect(p.linhas).toEqual([["A&B-1", "Capa Azul", "79.9"], ["X-2", "", "10"], ["Y-3", "Cabo_x0041_ USB\ntipo C"]]);
    expect(p.numeros).toEqual([4, 5, 9]);
  });

  it("cada tipo de célula: fórmula pelo último resultado, VERDADEIRO e FALSO, erro, texto de fórmula, data, número grande e pequeno", async () => {
    const valores: [string, string][] = [
      ['<c r="B2"><f>10*2</f><v>20</v></c>', "20"], ['<c r="B3" t="b"><v>1</v></c>', "VERDADEIRO"], ['<c r="B4" t="b"><v>0</v></c>', "FALSO"],
      ['<c r="B5" t="e"><v>#N/A</v></c>', "#N/A"], ['<c r="B6" t="str"><f>A1</f><v>Campo &lt;1&gt;</v></c>', "Campo <1>"],
      ['<c r="B7" t="d"><v>2026-11-15T00:00:00</v></c>', "2026-11-15T00:00:00"], [n("B8", "7891234567895"), "7891234567895"],
      [n("B9", "1.2345678901234567E+19"), "1.23456789012346E+19"], [n("B10", "1E-3"), "0.001"], [n("B11", "-0012.50"), "-12.5"],
    ];
    const dados = linha(1, t("A1", "Campo") + t("B1", "Valor"))
      + valores.map(([c], i) => linha(i + 2, t(`A${i + 2}`, `l${i + 2}`) + c)).join("")
      + linha(12, t("A12", "sem resultado") + '<c r="B12"><f>A1</f></c>');
    const p = await ler(pacote({ abas: [{ nome: "Tipos", dados }] }));
    expect(p.linhas.map((l) => l[1] ?? "")).toEqual([...valores.map(([, v]) => v), ""]);
  });

  it("o número no formato Geral do Excel e o texto do XML", () => {
    expect(["1299.8999999999999", "0007", "-12.50", "351234567890123", "1e-7", "12345678901234567", "abc", ""].map(numeroComoNoExcel))
      .toEqual(["1299.9", "7", "-12.5", "351234567890123", "1E-7", "1.23456789012346E+16", "abc", ""]);
    expect(textoDoXml("&amp;lt; &#x1F600; &#0; &#xD800; &lol; _x000D_ _x005F_x000D_")).toBe("&lt; 😀   &lol; \r _x000D_");
  });

  it("lê a primeira aba que a pessoa vê (a escondida e a de gráfico ficam de fora) e devolve o nome dela", async () => {
    const bytes = pacote({
      abas: [{ nome: "Oculta", estado: "hidden", dados: linha(1, t("A1", "Errada")) }, { nome: "Produtos & Preços", dados: `${CABECALHO}${linha(2, t("A2", "ACE-1"))}` }],
      partes: { "xl/workbook.xml": `<workbook ${NS}><sheets><sheet name="Gráfico" sheetId="9" r:id="rId9"/><sheet name="Oculta" sheetId="1" state="hidden" r:id="rId1"/><sheet name="Produtos &amp; Preços" sheetId="2" r:id="rId2"/></sheets></workbook>` },
    });
    expect(await ler(bytes)).toMatchObject({ aba: "Produtos & Preços", cabecalho: ["SKU", "Nome"], linhas: [["ACE-1"]] });
  });

  it("aceita o que outros programas escrevem: prefixo nas marcas, aspas simples, alvo a partir da raiz, nome em outra caixa e sem as relações da raiz", async () => {
    const folha = "<?xml version='1.0'?><x:worksheet xmlns:x='http://schemas.openxmlformats.org/spreadsheetml/2006/main'><x:sheetData>"
      + "<x:row r='1'><x:c r='A1' t='inlineStr'><x:is><x:t>SKU</x:t></x:is></x:c><x:c r='B1' t='inlineStr'><x:is><x:t>Nome</x:t></x:is></x:c></x:row>"
      + "<x:row><x:c t='inlineStr'><x:is><x:t>ACE-1</x:t></x:is></x:c><x:c t='inlineStr'><x:is><x:t>Capa</x:t></x:is></x:c></x:row>"
      + "</x:sheetData></x:worksheet>";
    const bytes = pacote({
      abas: [{ nome: "Plan1", dados: "" }],
      partes: {
        "_rels/.rels": null,
        [FOLHA]: null,
        "XL/Worksheets/Folha.XML": folha,
        "xl/_rels/workbook.xml.rels": `<Relationships ${NS_REL}><Relationship Id='rId1' Type='${TIPO}/worksheet' Target='/xl/worksheets/folha.xml'/></Relationships>`,
      },
    });
    expect(await ler(bytes)).toMatchObject({ cabecalho: ["SKU", "Nome"], linhas: [["ACE-1", "Capa"]], numeros: [2] });
  });

  it("só o cabeçalho: para na primeira linha preenchida, mesmo com o arquivo além do limite de linhas", async () => {
    const dados = CABECALHO + Array.from({ length: LIMITES_DA_PLANILHA.linhas + 5 }, (_, i) => linha(i + 2, t(`A${i + 2}`, `S${i}`))).join("");
    expect(await falha(ler(pacote({ abas: [{ nome: "Plan1", dados }] })))).toBe("linhas");
    expect(await ler(pacote({ abas: [{ nome: "Plan1", dados }] }), { soCabecalho: true })).toEqual({ formato: "xlsx", aba: "Plan1", cabecalho: ["SKU", "Nome"], linhas: [], numeros: [] });
  });
});

describe("planilha do Excel: os limites da importação", () => {
  it("2.000 linhas passam e a 2.001ª não; 100 colunas passam e a 101ª não (célula só com formatação além delas não conta)", async () => {
    const linhas = (q: number) => CABECALHO + Array.from({ length: q }, (_, i) => linha(i + 2, t(`A${i + 2}`, `S${i}`))).join("");
    expect((await ler(simples(linhas(LIMITES_DA_PLANILHA.linhas)))).linhas).toHaveLength(LIMITES_DA_PLANILHA.linhas);
    expect(await falha(ler(simples(linhas(LIMITES_DA_PLANILHA.linhas + 1))))).toBe("linhas");
    const cem = Array.from({ length: 100 }, (_, i) => t(`${colunaExcel(i)}1`, `c${i}`)).join("");
    expect((await ler(simples(linha(1, `${cem}<c r="XFD1" s="1"/>`)))).cabecalho).toHaveLength(100);
    expect(await falha(ler(simples(linha(1, cem + t(`${colunaExcel(100)}1`, "c100")))))).toBe("colunas");
  });

  it("célula longa demais, cabeçalho com buraco ou repetido, folha vazia e linha além da 999.999", async () => {
    expect(await falha(ler(simples(CABECALHO + linha(2, t("A2", "x".repeat(LIMITES_DA_PLANILHA.celula + 1))))))).toBe("celula");
    expect(await falha(ler(simples(linha(1, t("A1", "SKU") + t("C1", "Nome")))))).toBe("cabecalho");
    expect(await falha(ler(simples(linha(1, t("A1", "SKU") + t("B1", "sku")))))).toBe("cabecalho");
    expect(await falha(ler(simples("")))).toBe("vazio");
    expect(await falha(ler(simples(linha(1, '<c r="A1" s="1"/>'))))).toBe("vazio");
    expect(await falha(ler(simples(CABECALHO + linha(1_000_000, t("A1000000", "ACE-1")))))).toBe("linhas");
  });
});

describe("planilha do Excel: arquivo danificado, adulterado ou malicioso", () => {
  it("vazio, grande demais, .xls antigo (ou com senha), ZIP sem o fim, outro documento do Office e livro sem aba visível", async () => {
    expect(await falha(ler(new Uint8Array()))).toBe("vazio");
    expect(await falha(ler(new Uint8Array(LIMITES_DA_PLANILHA.bytes + 1)))).toBe("grande");
    expect(await falha(ler(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])))).toBe("xls");
    expect(await falha(ler(simples().slice(0, -30)))).toBe("xlsx");
    expect(await falha(ler(utf8("PK\u0003\u0004 não é um ZIP")))).toBe("xlsx");
    const documento = gerarZip([{ nome: "word/document.xml", dados: utf8("<w:document/>") }], (d) => deflateRawSync(d));
    expect(await falha(ler(documento))).toBe("xlsx");
    expect(await falha(ler(pacote({ abas: [{ nome: "Oculta", estado: "veryHidden", dados: CABECALHO }] })))).toBe("xlsx");
  });

  it("soma de conferência errada, tamanho declarado menor (bomba) ou maior que o limite, criptografia e outro método de compressão", async () => {
    const bom = simples();
    expect((await ler(bom)).linhas).toEqual([["ACE-1", "Capa"]]);
    expect(await falha(ler(adulterar(bom, FOLHA, (dv, p) => dv.setUint32(p + 16, dv.getUint32(p + 16, true) ^ 1, true))))).toBe("xlsx");
    expect(await falha(ler(adulterar(bom, FOLHA, (dv, p) => dv.setUint32(p + 24, 10, true))))).toBe("xlsx");
    expect(await falha(ler(adulterar(bom, FOLHA, (dv, p) => dv.setUint32(p + 24, LIMITE_DO_XML + 1, true))))).toBe("grande");
    expect(await falha(ler(adulterar(bom, FOLHA, (dv, p) => dv.setUint16(p + 8, 1, true))))).toBe("xlsx");
    expect(await falha(ler(adulterar(bom, FOLHA, (dv, p) => dv.setUint16(p + 10, 12, true))))).toBe("xlsx");
    const repetido = gerarZip([{ nome: "_rels/.rels", dados: utf8(RAIZ) }, { nome: "_rels/.rels", dados: utf8(RAIZ) }], null);
    expect(await falha(ler(repetido))).toBe("xlsx");
  });

  it("XML fora do que o Excel escreve: DOCTYPE, CDATA, texto compartilhado que não existe e linhas fora de ordem", async () => {
    expect(await falha(ler(pacote({ abas: [{ nome: "P", dados: CABECALHO }], partes: { [FOLHA]: `<!DOCTYPE worksheet><worksheet ${NS}><sheetData>${CABECALHO}</sheetData></worksheet>` } })))).toBe("xlsx");
    expect(await falha(ler(simples(linha(1, '<c r="A1" t="inlineStr"><is><t><![CDATA[SKU]]></t></is></c>'))))).toBe("xlsx");
    expect(await falha(ler(pacote({ textos: ["<si><t>SKU</t></si>"], abas: [{ nome: "P", dados: linha(1, s("A1", 0) + s("B1", 5)) }] })))).toBe("xlsx");
    expect(await falha(ler(simples(linha(5, t("A5", "SKU")) + linha(3, t("A3", "x")))))).toBe("xlsx");
    expect(await falha(ler(simples(linha(1, t("B1", "SKU") + t("A1", "Nome")))))).toBe("xlsx");
  });

  it("XML malicioso não prende a leitura: marcas sem fechar, atributo sem fim e marca enorme terminam rápido", async () => {
    const inicio = Date.now();
    expect(await falha(ler(simples(`<row>${"<v>1".repeat(300_000)}`)))).toBe("vazio");
    expect(await falha(ler(simples(`<row>${"<c><v>1".repeat(300_000)}`)))).toBe("xlsx");
    expect(await falha(ler(simples(`<row r="1"><c ${"a".repeat(15_000)}></c></row>`)))).toBe("xlsx");
    expect(await falha(ler(simples(`<row r="1" ${"x=\"1\" ".repeat(4_000)}></row>`)))).toBe("xlsx");
    expect(await falha(ler(simples(`<row${"<".repeat(1_000_000)}`)))).toBe("xlsx");
    expect(Date.now() - inicio).toBeLessThan(5_000);
  });
});

describe("planilha do Excel: no navegador e na escolha do leitor", () => {
  it("o descompressor do navegador dá o mesmo resultado do servidor e não passa do tamanho declarado", async () => {
    const dados = utf8("<sheetData>".repeat(2_000));
    const comprimido = deflateRawSync(dados);
    expect(await descomprimirNoNavegador(comprimido, dados.length)).toEqual(dados);
    expect(new Uint8Array(await descomprimirNoServidor(comprimido, dados.length))).toEqual(dados);
    expect(await falha(descomprimirNoNavegador(comprimido, dados.length - 1))).toBe("xlsx");
    const bytes = simples();
    expect(await lerXlsx(bytes, descomprimirNoNavegador)).toEqual(await ler(bytes));
  });

  it("navegador sem o descompressor: pede para atualizar ou salvar como CSV", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    expect(await falha(lerXlsx(simples(), descomprimirNoNavegador))).toBe("navegador");
  });

  it("escolhe o leitor pelo começo do arquivo, e não pelo nome: CSV, Excel e o .xls antigo", async () => {
    expect(await lerPlanilha(utf8("SKU;Nome\nACE-1;Capa\n"), descomprimirNoServidor)).toMatchObject({ formato: "csv", linhas: [["ACE-1", "Capa"]], numeros: [2] });
    expect(await lerPlanilha(simples(), descomprimirNoServidor)).toMatchObject({ formato: "xlsx", linhas: [["ACE-1", "Capa"]] });
    expect(await falha(lerPlanilha(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), descomprimirNoServidor))).toBe("xls");
  });

  it("as colunas antes do envio: do CSV, o começo; do Excel, a primeira aba (até 5 MB)", async () => {
    expect(await lerColunasDoArquivo(new Blob(["SKU;Descrição\nACE-1;Capa"]), descomprimirNoServidor)).toEqual({ colunas: ["SKU", "Descrição"], aba: null });
    expect(await lerColunasDoArquivo(new Blob([simples()]), descomprimirNoNavegador)).toEqual({ colunas: ["SKU", "Nome"], aba: "Plan1" });
    const grande = new Blob([simples(), new Uint8Array(LIMITES_DA_PLANILHA.bytes)]);
    expect(await falha(lerColunasDoArquivo(grande, descomprimirNoNavegador))).toBe("grande");
  });
});

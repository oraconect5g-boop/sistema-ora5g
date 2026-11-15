// Planilha do Excel sem biblioteca (lote FIN-009b: ORA-FIN-009, "XLSX nativo"). O pacote é aberto de novo aqui
// (lib/xlsx-de-teste: CRC-32, tamanhos e XML bem formado) e as células são conferidas uma a uma. Dados fictícios.
import * as zlib from "node:zlib";

import { describe, expect, it } from "vitest";

import type { SecaoCsv } from "./csv";
import { colunaExcel, crc32, montarXlsx, nomesDasAbas, serialDoDia, serialDoInstante, textoXml } from "./xlsx";
import { abrirXlsx, conferirXml, linhasDaFolha } from "./xlsx-de-teste";
import { gerarXlsx } from "./xlsx-servidor";

const SECOES: SecaoCsv[] = [
  { linhas: [["Estoque", "Aparelhos e chips", "Santa Cândida & Cia <teste>"], ["Gerado em", "15/11/2026 02:10", "3 itens"]] },
  {
    colunas: ["Local", "SKU", "IMEI", "ICCID", "Valor", "Dia", "Instante", "Quantidade"],
    linhas: [
      ["Santa Cândida", "00123", "351234567890123", "89550100123456789012", { centavos: 123_456 }, { dia: "2026-11-13" }, { instante: "2026-11-13T22:10:00Z" }, 3],
      ["Bacacheri", "=HYPERLINK(\"http://x\")", null, "8955010012345678901", { centavos: -7 }, { dia: "2026-02-30" }, null, 0],
      ["Linha\u0001com controle", "", "011234567890123", null, { centavos: 0 }, null, { instante: "não é data" }, -2.5],
    ],
  },
  { linhas: [["Atenção: a planilha vai até 20.000 itens; escolha um local para ver o resto."]] },
];

describe("planilha do Excel (FIN-009b)", () => {
  it("CRC-32 do ZIP, letras das colunas e o texto do XML", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    const dados = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7919) % 256));
    if ("crc32" in zlib && typeof zlib.crc32 === "function") expect(crc32(dados)).toBe(zlib.crc32(dados));
    expect([0, 25, 26, 51, 52, 701, 702].map(colunaExcel)).toEqual(["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA"]);
    expect(textoXml('a & b < c > "d"\u0000\u0008\u000B\u001F￾ fim\tcom\ttab\n')).toBe("a &amp; b &lt; c &gt; &quot;d&quot; fim\tcom\ttab\n");
  });

  it("datas no número do Excel: o dia como está; o instante no relógio de São Paulo", () => {
    expect(serialDoDia("2026-11-13")).toBe(46_339);
    expect(serialDoDia("1900-03-01")).toBe(61);
    expect(serialDoDia("2026-02-30")).toBeNull();
    expect(serialDoDia("13/11/2026")).toBeNull();
    // 22:10 em UTC = 19:10 em São Paulo
    expect(serialDoInstante("2026-11-13T22:10:00Z")).toBeCloseTo(46_339 + (19 * 60 + 10) / 1440, 9);
    // antes da meia-noite em São Paulo ainda é o dia anterior
    expect(Math.floor(serialDoInstante("2026-11-14T02:59:59Z") as number)).toBe(46_339);
    // horário de verão de 2018 (UTC−2): 12:00 UTC = 10:00 em São Paulo
    expect(serialDoInstante("2018-12-01T12:00:00Z")).toBeCloseTo((serialDoDia("2018-12-01") as number) + 10 / 24, 9);
    expect(serialDoInstante("não é data")).toBeNull();
  });

  it("nomes das abas que o Excel aceita, sem repetir", () => {
    expect(nomesDasAbas(["Saldo: [teste]?", "Aparelhos e chips", "aparelhos e chips", "", "'Aspas'", "x".repeat(40), "x".repeat(40)]))
      .toEqual(["Saldo teste", "Aparelhos e chips", "aparelhos e chips (2)", "Planilha 4", "Aspas", "x".repeat(31), `${"x".repeat(27)} (2)`]);
  });

  it("o pacote abre, cada célula tem o tipo certo e o texto nunca vira fórmula nem perde dígito", () => {
    const partes = abrirXlsx(gerarXlsx([{ nome: "Aparelhos e chips", secoes: SECOES }, { nome: "Outra: aba", secoes: [{ linhas: [["só texto"]] }] }]));
    expect([...partes.keys()]).toEqual([
      "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml",
    ]);
    expect(partes.get("[Content_Types].xml")).toContain('<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
    const pasta = partes.get("xl/workbook.xml") ?? "";
    expect(pasta).toContain('<sheet name="Aparelhos e chips" sheetId="1" r:id="rId1"/><sheet name="Outra aba" sheetId="2" r:id="rId2"/>');
    // o filtro só na aba com uma tabela, com o nome escondido que o Excel grava
    expect(pasta).toContain(`<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Aparelhos e chips'!$A$4:$H$7</definedName>`);
    expect(partes.get("xl/_rels/workbook.xml.rels")).toContain('<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>');

    const folha = partes.get("xl/worksheets/sheet1.xml") ?? "";
    expect(linhasDaFolha(folha)).toEqual([
      ["Estoque", "Aparelhos e chips", "Santa Cândida & Cia <teste>"],
      ["Gerado em", "15/11/2026 02:10", "3 itens"],
      [],
      ["Local", "SKU", "IMEI", "ICCID", "Valor", "Dia", "Instante", "Quantidade"],
      ["Santa Cândida", "00123", "351234567890123", "89550100123456789012", 1234.56, 46_339, expect.closeTo(46_339.798_611, 5), 3],
      ["Bacacheri", "=HYPERLINK(\"http://x\")", null, "8955010012345678901", -0.07, "2026-02-30", null, 0],
      ["Linhacom controle", null, "011234567890123", null, 0, null, "não é data", -2.5],
      [],
      ["Atenção: a planilha vai até 20.000 itens; escolha um local para ver o resto."],
    ]);
    // IMEI, ICCID, SKU com zero à esquerda e o que parece fórmula: texto (inlineStr), nunca <f> nem número
    expect(folha).toContain('<c r="C5" t="inlineStr"><is><t xml:space="preserve">351234567890123</t></is></c>');
    expect(folha).toContain('<c r="B6" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://x&quot;)</t></is></c>');
    expect(folha).not.toContain("<f>");
    // dinheiro, dia e instante com o formato; cabeçalho em negrito; quantidade sem estilo
    expect(folha).toContain('<c r="E5" s="2"><v>1234.56</v></c>');
    expect(folha).toContain('<c r="E6" s="2"><v>-0.07</v></c>');
    expect(folha).toContain('<c r="F5" s="3"><v>46339</v></c>');
    expect(folha).toMatch(/<c r="G5" s="4"><v>46339\.79861\d*<\/v><\/c>/);
    expect(folha).toContain('<c r="A4" s="1" t="inlineStr">');
    expect(folha).toContain('<c r="H5"><v>3</v></c>');
    // cabeçalho fixo na rolagem e filtro nas colunas da tabela (o aviso do fim fica fora)
    expect(folha).toContain('<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>');
    expect(folha).toContain('<autoFilter ref="A4:H7"/>');
    expect(folha).toContain('<dimension ref="A1:H9"/>');
    // a largura vem da tabela, não do título comprido do alto
    expect(folha).toContain('<col min="1" max="1" width="19" customWidth="1"/>');

    const outra = partes.get("xl/worksheets/sheet2.xml") ?? "";
    expect(linhasDaFolha(outra)).toEqual([["só texto"]]);
    expect(outra).not.toContain("<autoFilter");
    expect(outra).not.toContain("<pane");
  });

  it("FIN-009d: com duas tabelas, o filtro e o cabeçalho fixo vão para a marcada; sem marca, para nenhuma", () => {
    const duas = (filtro: boolean) => abrirXlsx(gerarXlsx([{ nome: "Equipe", secoes: [
      { linhas: [["Equipe e acessos"]] },
      { colunas: ["Pessoa", "Função"], linhas: [["Ana", "Dono"], ["Bia", "Gerente"]], filtro },
      { colunas: ["Convite para", "Situação"], linhas: [["Duda", "não enviado"]] },
    ] }])).get("xl/worksheets/sheet1.xml") ?? "";
    expect(duas(true)).toContain('<autoFilter ref="A3:B5"/>');
    expect(duas(true)).toContain('<pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/>');
    expect(duas(false)).not.toContain("<autoFilter");
    expect(duas(false)).not.toContain("<pane");
  });

  it("o mesmo conteúdo dá o mesmo arquivo; sem aba não há planilha", () => {
    expect(Buffer.compare(gerarXlsx([{ nome: "A", secoes: SECOES }]), gerarXlsx([{ nome: "A", secoes: SECOES }]))).toBe(0);
    expect(() => gerarXlsx([])).toThrow("planilha sem aba");
  });

  it("FIN-009c: no navegador, sem compressão, o pacote é o mesmo, só maior (os arquivos vão guardados)", () => {
    const guardado = montarXlsx([{ nome: "Aparelhos e chips", secoes: SECOES }], null);
    const comprimido = gerarXlsx([{ nome: "Aparelhos e chips", secoes: SECOES }]);
    expect(guardado.length).toBeGreaterThan(comprimido.length);
    // método 0 (guardado) no cabeçalho local do primeiro arquivo; 8 (deflate) no do servidor
    expect(new DataView(guardado.buffer).getUint16(8, true)).toBe(0);
    expect(new DataView(comprimido.buffer, comprimido.byteOffset).getUint16(8, true)).toBe(8);
    const partes = abrirXlsx(guardado);
    expect(partes).toEqual(abrirXlsx(comprimido));
    expect(linhasDaFolha(partes.get("xl/worksheets/sheet1.xml") ?? "")[4]?.slice(0, 4)).toEqual(["Santa Cândida", "00123", "351234567890123", "89550100123456789012"]);
  });

  it("o conferidor do teste recusa XML quebrado", () => {
    expect(() => conferirXml("x", "<a><b></a></b>")).toThrow("fora de ordem");
    expect(() => conferirXml("x", "<a>A & B</a>")).toThrow("solto");
    expect(() => conferirXml("x", "<a/><b/>")).toThrow("2 raízes");
    expect(() => conferirXml("x", '<a b="1"><c d="&amp;"/>texto &lt; ok</a>')).not.toThrow();
  });
});

// A leitura do extrato por arquivo (lote EXT-a: ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; ADR-016). Arquivos FICTÍCIOS
// montados no teste: nenhum é o layout de um provedor (PicPay, PagBank ou banco), porque nada é suposto do formato
// deles; a pessoa diz qual coluna é cada campo. O OFX segue o padrão público do formato (OFX 1 em SGML e OFX 2 em XML).
import { describe, expect, it } from "vitest";

import { lerCsv } from "../importacao/csv";
import { descomprimirNoServidor } from "../importacao/descomprimir-servidor";
import { lerPlanilha } from "../importacao/planilha";
import { gerarXlsx } from "../xlsx-servidor";
import {
  ErroDoOfx, lerDataDoExtrato, lerMapaDoExtrato, lerNatureza, lerOfx, lerValorDoExtrato, mapaParaGravar, montarLinhasDoExtrato, pareceOfx,
  sugerirMapaDoExtrato,
} from "./leitura";

const utf8 = (t: string) => new TextEncoder().encode(t);

describe("o valor de cada célula, em centavos com sinal", () => {
  it("o jeito brasileiro: R$, milhar com ponto, vírgula nos centavos, e os sinais de débito", () => {
    const casos: [string, number][] = [
      ["79,00", 7_900], ["R$ 1.234,56", 123_456], ["1234,5", 123_450], ["1.234", 123_400], ["-79,00", -7_900], ["R$ -79,00", -7_900],
      ["-R$ 79,00", -7_900], ["(79,00)", -7_900], ["79,00-", -7_900], ["79,00 D", -7_900], ["79,00D", -7_900], ["79,00 C", 7_900],
      ["−79,00", -7_900], ["1 234,56", 123_456], ["0,015", 2], ["0,014", 1], ["79", 7_900], ["79.9", 7_990], ["1,234.56", 123_456],
      ["+5,00", 500],
    ];
    for (const [texto, centavos] of casos) expect(lerValorDoExtrato(texto, "csv"), texto).toBe(centavos);
  });

  it("do Excel e do OFX, o número com ponto (sem milhar) e a notação científica", () => {
    expect(lerValorDoExtrato("1234.5", "xlsx")).toBe(123_450);
    expect(lerValorDoExtrato("78.21", "xlsx")).toBe(7_821);
    expect(lerValorDoExtrato("1.234", "xlsx")).toBe(123);
    expect(lerValorDoExtrato("-50.00", "ofx")).toBe(-5_000);
    expect(lerValorDoExtrato("-50,00", "ofx")).toBe(-5_000);
    expect(lerValorDoExtrato("1.5E-3", "xlsx")).toBe(0);
    expect(lerValorDoExtrato("R$ 1.234,56", "xlsx")).toBe(123_456);
  });

  it("recusa o que não é valor e o que passa do limite do banco", () => {
    for (const texto of ["", "abc", "79,00%", "1.2.3", "0.123", "1,23,45", "--5", "12/11", "1e400"]) {
      expect(() => lerValorDoExtrato(texto, "csv"), texto).toThrow(RangeError);
    }
    expect(() => lerValorDoExtrato("1000000001,00", "csv")).toThrow(RangeError);
    expect(lerValorDoExtrato("1000000000,00", "csv")).toBe(100_000_000_000);
  });
});

describe("a data de cada célula", () => {
  it("dia/mês/ano com ou sem a hora, o ano com dois algarismos e a data ISO", () => {
    const casos: [string, string][] = [
      ["17/11/2026", "2026-11-17"], ["7/1/2026", "2026-01-07"], ["17/11/26", "2026-11-17"], ["17-11-2026", "2026-11-17"], ["17.11.2026", "2026-11-17"],
      ["17/11/2026 14:35", "2026-11-17"], ["17/11/2026 14:35:22", "2026-11-17"], ["2026-11-17", "2026-11-17"], ["2026-11-17T14:35:22-03:00", "2026-11-17"],
      ["2026-11-17 14:35", "2026-11-17"],
    ];
    for (const [texto, data] of casos) expect(lerDataDoExtrato(texto, "csv"), texto).toBe(data);
  });

  it("do Excel, o número da data; do OFX, AAAAMMDD com a hora e o fuso", () => {
    expect(lerDataDoExtrato("46343", "xlsx")).toBe("2026-11-17");
    expect(lerDataDoExtrato("46343.6", "xlsx")).toBe("2026-11-17");
    expect(lerDataDoExtrato("20261117", "ofx")).toBe("2026-11-17");
    expect(lerDataDoExtrato("20261117120000[-3:BRT]", "ofx")).toBe("2026-11-17");
    expect(lerDataDoExtrato("20261117120000.000[-03:EST]", "ofx")).toBe("2026-11-17");
  });

  it("recusa o que não é data do calendário entre 2000 e 2100", () => {
    for (const texto of ["", "32/11/2026", "30/02/2026", "17/13/2026", "1999-12-31", "hoje", "46343", "2026/11/17"]) {
      expect(() => lerDataDoExtrato(texto, "csv"), texto).toThrow(RangeError);
    }
    expect(() => lerDataDoExtrato("20261117", "csv")).toThrow(RangeError);
    expect(() => lerDataDoExtrato("99999", "xlsx")).toThrow(RangeError);
  });

  it("a coluna de crédito ou débito", () => {
    expect(["C", "c", "Crédito", "CRED", "Entrada", "+"].map(lerNatureza)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(["D", "Débito", "DEB.", "Saída", "-"].map(lerNatureza)).toEqual([-1, -1, -1, -1, -1]);
    expect(() => lerNatureza("talvez")).toThrow(RangeError);
  });
});

describe("as colunas", () => {
  it("sugere pelo nome da coluna (sem acento, sem diferença de maiúsculas), sem usar a mesma coluna duas vezes", () => {
    const cabecalho = ["Data da Venda", "NSU", "Valor Bruto", "Taxa", "Valor Líquido", "Data de Pagamento", "Terminal", "Descrição", "Outra"];
    expect(sugerirMapaDoExtrato(cabecalho)).toEqual({ data: 0, referencia: 1, valor: 2, taxa: 3, liquido: 4, data_liquidacao: 5, terminal: 6, descricao: 7 });
    expect(sugerirMapaDoExtrato(["Data", "Histórico", "Valor", "D/C"])).toEqual({ data: 0, descricao: 1, valor: 2, natureza: 3 });
  });

  it("o formulário: data e valor obrigatórios, coluna existente e uma vez só", () => {
    const de = (campos: Record<string, string>) => (nome: string) => campos[nome] ?? null;
    expect(lerMapaDoExtrato(de({ coluna_data: "0", coluna_valor: "2", coluna_referencia: "1" }), 3)).toEqual({ data: 0, valor: 2, referencia: 1 });
    expect(lerMapaDoExtrato(de({ coluna_data: "0" }), 3)).toBeNull();
    expect(lerMapaDoExtrato(de({ coluna_data: "0", coluna_valor: "0" }), 3)).toBeNull();
    expect(lerMapaDoExtrato(de({ coluna_data: "0", coluna_valor: "3" }), 3)).toBeNull();
    expect(lerMapaDoExtrato(de({ coluna_data: "0", coluna_valor: "x" }), 3)).toBeNull();
    expect(mapaParaGravar(["Data", "NSU", "Valor"], { data: 0, valor: 2, referencia: 1 })).toEqual({ colunas: { data: "Data", valor: "Valor", referencia: "NSU" } });
  });
});

describe("as linhas do extrato (CSV e Excel)", () => {
  const csv = [
    "Data;NSU;Valor bruto;Taxa;Valor líquido;Data de pagamento;Terminal;Descrição",
    "17/11/2026;123456;R$ 79,00;-1,58;77,42;18/11/2026;PP-01;Venda crédito à vista",
    "17/11/2026;123457;1.299,90;;;;;Pix",
    "17/11/2026;;-79,00;;;;;Chargeback",
    "Saldo do dia;;;;;;;",
    ";;1.299,90;;;;;Total",
    "17/11/2026;;0,00;;;;;Ajuste zerado",
    "18/11/2026;99;;;;;;Sem valor",
  ].join("\r\n");

  it("monta cada linha com o número da linha do arquivo; ficam de fora saldo, total, zero e sem valor", () => {
    const planilha = lerCsv(utf8(csv));
    const mapa = sugerirMapaDoExtrato(planilha.cabecalho);
    expect(montarLinhasDoExtrato(planilha, mapa)).toEqual({
      linhas: [
        { numero: 2, data: "2026-11-17", valor: 7_900, taxa: 158, liquido: 7_742, data_liquidacao: "2026-11-18", referencia: "123456", terminal: "PP-01", descricao: "Venda crédito à vista" },
        { numero: 3, data: "2026-11-17", valor: 129_990, referencia: "123457", descricao: "Pix" },
        { numero: 4, data: "2026-11-17", valor: -7_900, descricao: "Chargeback" },
      ],
      deFora: 4,
      problemas: [],
    });
  });

  it("a linha de saldo fica de fora mesmo com valor; crédito e débito pela coluna própria; o líquido acompanha o sinal", () => {
    const planilha = lerCsv(utf8("Data;Histórico;Valor;D/C;Líquido\n17/11/2026;SALDO ANTERIOR;1.000,00;C;\n17/11/2026;Tarifa;12,50;D;12,50\n17/11/2026;Pix recebido;-39,90;C;\n"));
    expect(montarLinhasDoExtrato(planilha, { data: 0, descricao: 1, valor: 2, natureza: 3, liquido: 4 }).linhas).toEqual([
      { numero: 3, data: "2026-11-17", valor: -1_250, liquido: -1_250, descricao: "Tarifa" },
      { numero: 4, data: "2026-11-17", valor: 3_990, descricao: "Pix recebido" },
    ]);
  });

  it("a linha que não deu para ler volta com o número e o campo; a referência longa demais também", () => {
    const planilha = lerCsv(utf8(`Data;Valor;NSU;Terminal\n32/11/2026;79,00;1;\n17/11/2026;setenta;2;\n17/11/2026;1,00;${"9".repeat(81)};\n17/11/2026;1,00;3;${"T".repeat(41)}\n`));
    const { linhas, problemas } = montarLinhasDoExtrato(planilha, { data: 0, valor: 1, referencia: 2, terminal: 3 });
    expect(linhas).toEqual([]);
    expect(problemas).toEqual([
      { numero: 2, campo: "data", texto: "32/11/2026" }, { numero: 3, campo: "valor", texto: "setenta" },
      { numero: 4, campo: "referencia", texto: "9".repeat(40) }, { numero: 5, campo: "terminal", texto: "T".repeat(40) },
    ]);
  });

  it("do Excel: a data de verdade (número da data) e o dinheiro como número", async () => {
    const bytes = gerarXlsx([{ nome: "Vendas", secoes: [{
      colunas: ["Data", "Valor", "Taxa", "Código"],
      linhas: [[{ dia: "2026-11-17" }, { centavos: 7_900 }, { centavos: 158 }, "000123"], [{ dia: "2026-11-18" }, { centavos: -3_990 }, null, null]],
    }] }]);
    const planilha = await lerPlanilha(bytes, descomprimirNoServidor);
    expect(montarLinhasDoExtrato(planilha, { data: 0, valor: 1, taxa: 2, referencia: 3 }).linhas).toEqual([
      { numero: 2, data: "2026-11-17", valor: 7_900, taxa: 158, referencia: "000123" },
      { numero: 3, data: "2026-11-18", valor: -3_990 },
    ]);
  });
});

describe("o OFX dos bancos", () => {
  const ofx1 = [
    "OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "COMPRESSION:NONE", "OLDFILEUID:NONE",
    "NEWFILEUID:NONE", "", "<OFX>", "<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL", "<BANKTRANLIST>", "<DTSTART>20261101", "<DTEND>20261130",
    "<STMTTRN>", "<TRNTYPE>CREDIT", "<DTPOSTED>20261117120000[-3:BRT]", "<TRNAMT>79.00", "<FITID>E2E0001", "<MEMO>PIX RECEBIDO &amp; CIA", "</STMTTRN>",
    "<STMTTRN>", "<TRNTYPE>DEBIT", "<DTPOSTED>20261117", "<TRNAMT>-12,50", "<FITID>TAR01", "<NAME>TARIFA", "</STMTTRN>",
    "<STMTTRN>", "<TRNTYPE>OTHER", "<DTPOSTED>20261118", "<TRNAMT>0.00", "<FITID>Z", "</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\r\n");

  it("OFX 1 (SGML): a data, o valor com sinal, a referência e a descrição; o lançamento zerado fica de fora", () => {
    expect(pareceOfx(utf8(ofx1))).toBe(true);
    expect(lerOfx(utf8(ofx1))).toEqual({
      linhas: [
        { numero: 1, data: "2026-11-17", valor: 7_900, referencia: "E2E0001", descricao: "PIX RECEBIDO & CIA" },
        { numero: 2, data: "2026-11-17", valor: -1_250, referencia: "TAR01", descricao: "TARIFA" },
      ],
      deFora: 1,
      problemas: [],
    });
  });

  it("OFX 2 (XML), com a data que não deu para ler apontada", () => {
    const ofx2 = '<?xml version="1.0" encoding="UTF-8"?>\n<?OFX OFXHEADER="200" VERSION="220"?>\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>'
      + "<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261117</DTPOSTED><TRNAMT>1299.90</TRNAMT><FITID>X1</FITID><MEMO>Pix João</MEMO></STMTTRN>"
      + "<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>2026111</DTPOSTED><TRNAMT>1.00</TRNAMT><FITID>X2</FITID></STMTTRN>"
      + "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>";
    expect(pareceOfx(utf8(ofx2))).toBe(true);
    expect(lerOfx(utf8(ofx2))).toEqual({
      linhas: [{ numero: 1, data: "2026-11-17", valor: 129_990, referencia: "X1", descricao: "Pix João" }],
      deFora: 0,
      problemas: [{ numero: 2, campo: "data", texto: "2026111" }],
    });
  });

  it("arquivo que não é OFX, ou OFX sem lançamento", () => {
    expect(pareceOfx(utf8("Data;Valor\n17/11/2026;1,00"))).toBe(false);
    expect(pareceOfx(utf8("<html><body>OFX</body></html>"))).toBe(false);
    expect(() => lerOfx(utf8("OFXHEADER:100\r\n\r\n<OFX></OFX>"))).toThrow(ErroDoOfx);
  });
});

// Provas da auditoria do Codex de 21/11 (docs/analises/auditoria-integral-2026-11-21/evidencias/, PR #105), achado F21-01:
// o relatório de produtos da Rein escreve os totais do rodapé (a linha 2.273 do arquivo de 10/11) como "1.234,00", com a
// vírgula brasileira, em células MARCADAS como número no Excel (t="n"). O leitor não entendia o número, e o rodapé não era
// reconhecido: a importação via 2.272 linhas em vez de 2.271 produtos.
//
// A primeira prova é a do Codex, copiada sem mudar a expectativa (falhava no commit c1b8e60 e passa com o lote AUD-c). As
// outras são o contrato inteiro da correção, com arquivos SINTÉTICOS montados aqui (nenhum arquivo real: o original é
// privado e roda em auditoria-planilha-real.test.ts, só com ARQUIVO_ESTOQUE_AUDITORIA):
//   * a planilha no formato da Rein: 83 colunas, 2.271 produtos, o rodapé com 18 totais escritos com vírgula, de fora, e
//     as partes de 2.000 e 271;
//   * o número do Excel continua valendo pelo que é: 0.625 é fração e 1.234 é um vírgula duzentos e trinta e quatro
//     (F18-01); só a célula que NÃO é número do Excel vale pelo texto, com a origem registrada;
//   * o último produto incompleto, com o EAN, não some como rodapé (F18-02), também no formato novo;
//   * o rodapé cuja soma não confere não sai sozinho: fica como candidato, à vista na prévia;
//   * a célula fora do padrão numa linha de produto vale pelo texto (dinheiro sem arredondar), e a prévia sabe dizer onde.
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { linhasDaCarga } from "../estoque/carga";
import { gerarZip } from "../xlsx";
import { xlsxMontadoAMao, type CelulaDeTeste } from "../xlsx-de-teste";
import {
  candidatoARodape, celulaForaDoPadrao, celulaNumerica, celulasForaDoPadrao, dividirEmPartes, linhaDeTotal, montarLinhas, numeroDaCelula, rodapeDaPlanilha,
  sugerirMapeamento,
} from "./catalogo";
import { descomprimirNoServidor } from "./descomprimir-servidor";
import { lerXlsx } from "./xlsx";

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

// Formato defeituoso presente na exportação da Rein: t=n com vírgula decimal.
// Os valores abaixo são fictícios. O objetivo é reconhecer o rodapé sem perder um produto.
it('F21-01: total BR em célula XLSX t=n deve ser reconhecido sem alterar ponto decimal válido',async()=>{
 const bytes=pacote({abas:[{nome:'Produtos',dados:
 '<row r="1"><c r="A1" t="inlineStr"><is><t>Código</t></is></c><c r="B1" t="inlineStr"><is><t>Descrição</t></is></c><c r="C1" t="inlineStr"><is><t>Qtd</t></is></c><c r="D1" t="inlineStr"><is><t>Custo</t></is></c></row>'+
 '<row r="2"><c r="A2" t="inlineStr"><is><t>SINTETICO</t></is></c><c r="B2" t="inlineStr"><is><t>Capa</t></is></c><c r="C2" t="n"><v>1234</v></c><c r="D2" t="n"><v>2468</v></c></row>'+
 '<row r="3"><c r="C3" t="n"><v>1.234,00</v></c><c r="D3" t="n"><v>2.468,00</v></c></row>'}]});
 const planilha=await lerXlsx(bytes,descomprimirNoServidor);
 expect(linhaDeTotal(planilha,{sku:0,nome:1})).toBe(1);
});

// ---------------------------------------------------------------------------------------------
// O contrato da correção (lote AUD-c)
// ---------------------------------------------------------------------------------------------
type Celula = CelulaDeTeste;
/** A planilha montada à mão (lib/xlsx-de-teste): `{ n }` é a célula MARCADA como número, com o conteúdo como dado. */
const ler = (linhas: readonly (readonly Celula[])[]) => lerXlsx(xlsxMontadoAMao(linhas), descomprimirNoServidor);
/** Um número no formato da exportação: milhar com ponto e duas casas com vírgula ("1.234,00"). */
const comoNaExportacao = (centavos: number) => `${Math.trunc(centavos / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${String(centavos % 100).padStart(2, "0")}`;

describe("F21-01: o rodapé da Rein escrito com vírgula em células de número (AUD-c)", () => {
  it("a planilha no formato da Rein: 83 colunas, 2.271 produtos, o rodapé com 18 totais de fora e as partes de 2.000 e 271", async () => {
    const LOJAS = ["SANTA FELICIDADE", "ÁGUA VERDE", "COLÔNIA", "ALMIRANTE TAMANDARÉ", "DEFEITOS", "DUBAI", "COLOMBO", "MUFFATO SANTA", "BUTIATUVINHA", "VENTANIA", "BALNEARIO", "SANTA CANDIDA"];
    const QTD = 38;   // as colunas 38 a 49: "Qtd. Disponivel <loja>"
    const CUSTO = 50; // as colunas 50 a 61: "Custo do Estoque <loja>"
    // Como no diagnóstico do arquivo de 10/11: o rodapé traz as 12 quantidades e 6 dos custos, os 18 com vírgula.
    const CUSTOS_NO_RODAPE = [51, 52, 54, 55, 57, 58];
    const cabecalho: Celula[] = Array.from({ length: 83 }, (_, i) => `Coluna ${i + 1}`);
    cabecalho[0] = "Código"; cabecalho[3] = "Descrição"; cabecalho[9] = "Marca";
    LOJAS.forEach((loja, i) => { cabecalho[QTD + i] = `Qtd. Disponivel ${loja}`; cabecalho[CUSTO + i] = `Custo do Estoque ${loja}`; });
    const somaQtd = new Array<number>(12).fill(0);
    const somaCusto = new Array<number>(12).fill(0);
    const linhas: Celula[][] = [cabecalho];
    for (let p = 1; p <= 2271; p += 1) {
      const linha: Celula[] = new Array<Celula>(83).fill(null);
      linha[0] = `P${String(p).padStart(5, "0")}`; linha[3] = `Produto fictício ${p}`; linha[9] = "Marca fictícia";
      for (let l = 0; l < 12; l += 1) {
        const quantidade = (p * (l + 3)) % 7;           // inteiro, como o Excel guarda
        const custo = ((p * 37 + l * 11) % 5000) + 125; // em centavos; no arquivo, com ponto decimal ("12.5")
        somaQtd[l] = (somaQtd[l] as number) + quantidade;
        somaCusto[l] = (somaCusto[l] as number) + custo;
        linha[QTD + l] = { n: String(quantidade) };
        linha[CUSTO + l] = { n: String(custo / 100) };
      }
      linhas.push(linha);
    }
    const rodape: Celula[] = new Array<Celula>(83).fill(null);
    for (let l = 0; l < 12; l += 1) rodape[QTD + l] = { n: comoNaExportacao((somaQtd[l] as number) * 100) };
    for (const coluna of CUSTOS_NO_RODAPE) rodape[coluna] = { n: comoNaExportacao(somaCusto[coluna - CUSTO] as number) };
    linhas.push(rodape);

    const p = await ler(linhas);
    // As mesmas expectativas da prova com o arquivo original (auditoria-planilha-real.test.ts).
    const mapa = sugerirMapeamento(p.cabecalho);
    expect(mapa).toMatchObject({ sku: 0, nome: 3, marca: 9 });
    const total = linhaDeTotal(p, mapa);
    const produtos = p.linhas.filter((_, i) => i !== total);
    expect(p.cabecalho).toHaveLength(83);
    expect(produtos).toHaveLength(2271);
    expect(total).toBe(2271);
    expect(p.numeros[total as number]).toBe(2273);
    expect(dividirEmPartes(produtos).map((x) => x.length)).toEqual([2000, 271]);
    // O rodapé comprovado pelas somas, com a leitura dita no motivo; nenhum produto de fora.
    expect(rodapeDaPlanilha(p, mapa)?.motivo).toBe(
      "rodapé de totais no fim da planilha (sem código e sem nome, só números em 18 colunas, 18 delas escritas com vírgula numa célula de número e lidas como estão; em 18 delas o número é a soma das linhas de cima)");
    expect(candidatoARodape(p, mapa)).toBeNull();
    expect(p.foraDoPadrao?.[2271]).toEqual([...Array.from({ length: 12 }, (_, i) => QTD + i), ...CUSTOS_NO_RODAPE]);
    expect(celulasForaDoPadrao(p, total)).toBeNull();
    // Os produtos seguem como números do Excel: a quantidade e o custo com ponto decimal.
    expect(celulaNumerica(p, 0, QTD)).toBe(true);
    expect(numeroDaCelula(p, 0, CUSTO)).toBe(1.62);
    expect(produtos.at(-1)?.[0]).toBe("P02271");
  }, 30_000);

  it("o número do Excel vale pelo que é (0.625 é fração; 1.234 é um vírgula duzentos e trinta e quatro); só o que não é número do Excel vale pelo texto", async () => {
    const p = await ler([
      ["Código", "Descrição", "A", "B", "C", "D", "E", "F"],
      ["ACE-1", "Cabo de teste", { n: "0.625" }, { n: "1.234" }, { n: "1.234,00" }, { n: "0,625" }, { n: "1234" }, { n: "1.5E+3" }],
    ]);
    expect(p.linhas[0]).toEqual(["ACE-1", "Cabo de teste", "0.625", "1.234", "1.234,00", "0,625", "1234", "1500"]);
    expect(p.numericas?.[0]).toEqual([2, 3, 6, 7]);
    expect(p.foraDoPadrao?.[0]).toEqual([4, 5]);
    expect([2, 3, 4, 5, 6, 7].map((c) => numeroDaCelula(p, 0, c))).toEqual([0.625, 1.234, 1234, 0.625, 1234, 1500]);
    expect([4, 5].map((c) => celulaForaDoPadrao(p, 0, c))).toEqual([true, true]);
    expect(celulaForaDoPadrao(p, 0, 2)).toBe(false);
    // Na carga do estoque, a fração nunca vira inteiro: nem a do Excel (F18-01), nem a escrita com vírgula.
    const carga = linhasDaCarga(p, { sku: 0, nome: 1, lojas: { excel: { fisico: 2, disponivel: 6 }, virgula: { fisico: 5, disponivel: 6 }, milhar: { fisico: 4, disponivel: 6 } } });
    expect(carga.porLoja.excel?.[0]).toMatchObject({ fisico: null, problema: 'Quantidade que não é número inteiro: "0.625"' });
    expect(carga.porLoja.virgula?.[0]).toMatchObject({ fisico: null, problema: 'Quantidade que não é número inteiro: "0,625"' });
    expect(carga.porLoja.milhar?.[0]).toMatchObject({ fisico: 1234, disponivel: 1234 });
  });

  it("o último produto incompleto, com o EAN e o preço escrito com vírgula, não some como rodapé (F18-02)", async () => {
    const p = await ler([
      ["Código", "Descrição", "EAN", "Preço"],
      ["ACE-1", "Cabo de teste", "7890000000001", { n: "10" }],
      [null, null, "7890000000002", { n: "49,00" }],
    ]);
    const mapa = { sku: 0, nome: 1, codigo_barras: 2, preco: 3 };
    expect(rodapeDaPlanilha(p, mapa)).toBeNull();
    expect(linhaDeTotal(p, mapa)).toBeNull();
    // Só números nas duas células, mas com o EAN: fica na prévia, com o aviso, e só sai por decisão de quem envia.
    expect(candidatoARodape(p, { sku: 0, nome: 1, codigo_barras: 2, preco: 3 })?.motivo).toContain("com código de barras preenchido");
    const linhas = montarLinhas(p, mapa, { tipo: "acessorio", categoria: "Acessórios" });
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toMatchObject({ numero: 3, sku: null, nome: null, codigo_barras: "7890000000002", preco: 4900 });
  });

  it("o rodapé escrito com vírgula cuja soma não confere não sai sozinho: fica como candidato, à vista na prévia", async () => {
    const p = await ler([
      ["Código", "Descrição", "Qtd", "Custo"],
      ["ACE-1", "Cabo de teste", { n: "10" }, { n: "20.5" }],
      ["ACE-2", "Capa de teste", { n: "5" }, { n: "30" }],
      [null, null, { n: "16,00" }, { n: "50,00" }],
    ]);
    expect(rodapeDaPlanilha(p, { sku: 0, nome: 1 })).toBeNull();
    expect(candidatoARodape(p, { sku: 0, nome: 1 })).toEqual({ posicao: 2, motivo:
      "a última linha pode ser um rodapé ou um item sem cadastro (sem código e sem nome, só números em 2 colunas, 2 delas escritas com vírgula numa célula de número e lidas como estão, e nenhum deles é a soma das linhas de cima)" });
    // Com as somas certas (15 e 50,50), o mesmo rodapé é comprovado.
    const certo = await ler([
      ["Código", "Descrição", "Qtd", "Custo"],
      ["ACE-1", "Cabo de teste", { n: "10" }, { n: "20.5" }],
      ["ACE-2", "Capa de teste", { n: "5" }, { n: "30" }],
      [null, null, { n: "15,00" }, { n: "50,50" }],
    ]);
    expect(linhaDeTotal(certo, { sku: 0, nome: 1 })).toBe(2);
  });

  it("numa linha de produto, a célula fora do padrão vale pelo texto (dinheiro sem arredondar), e a prévia sabe dizer onde", async () => {
    const p = await ler([
      ["Código", "Descrição", "Preço", "Custo"],
      ["ACE-1", "Cabo de teste", { n: "1.234,56" }, { n: "617.28" }],
      ["ACE-2", "Capa de teste", { n: "79.9" }, { n: "12,345" }],
      ["ACE-3", "Película de teste", { n: "29.9" }, { n: "10" }],
    ]);
    const linhas = montarLinhas(p, { sku: 0, nome: 1, preco: 2, custo: 3 }, { tipo: "acessorio", categoria: "Acessórios" });
    expect(linhas[0]).toMatchObject({ preco: 123_456, custo: 61_728, erros: [] });
    // Três casas depois da vírgula não é dinheiro: a linha fica com o erro, e nada é arredondado.
    expect(linhas[1]).toMatchObject({ preco: 7_990, custo: null, erros: ['Custo inválido: "12,345"'] });
    expect(linhas[2]).toMatchObject({ preco: 2_990, custo: 1_000, erros: [] });
    expect(celulasForaDoPadrao(p)).toEqual({ celulas: 2, linhas: [2, 3] });
    expect(celulasForaDoPadrao(p, 1)).toEqual({ celulas: 1, linhas: [2] });
  });
});

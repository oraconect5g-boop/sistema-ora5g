// Leitura da planilha do Excel (lote CAT-002b: ORA-CAT-002). Planilhas FICTÍCIAS montadas no teste (nenhum arquivo
// real da Rein: o formato chega com a pendência B1): pela mão, parte a parte do pacote, e pelo próprio gerador de
// planilhas do sistema (lib/xlsx). Confere o conteúdo de cada tipo de célula, a aba escolhida, o número das linhas, os
// limites da importação e a recusa do arquivo danificado, adulterado ou malicioso, no servidor e no navegador.
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { colunaExcel, gerarZip } from "../xlsx";
import { gerarXlsx } from "../xlsx-servidor";
import { linhaDeTotal, montarLinhas } from "./catalogo";
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

// O extrato da maquininha ou do banco por arquivo (lote EXT-a: ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; ADR-016).
// Nada é suposto do formato de um provedor (PicPay, PagBank, bancos): no CSV e no Excel, a pessoa diz qual coluna é cada
// campo, com sugestão pelo nome da coluna; o OFX, o formato padrão dos extratos de banco, já traz os campos com nome.
// Aqui só se montam as linhas no formato do banco de dados, que valida tudo de novo (public.extrato_importar).
import { decodificar, semAcento, type Planilha } from "../importacao/csv";

/** O banco aceita de 1 a 5.000 linhas por extrato. */
export const LINHAS_DO_EXTRATO = 5_000;
/** O maior valor de uma linha, em centavos (o mesmo limite do banco: R$ 1 bilhão). */
const MAIOR_VALOR = 100_000_000_000;

export const CAMPOS_DO_EXTRATO = {
  data: {
    rotulo: "Data da venda ou do lançamento", obrigatorio: true,
    sugestoes: ["data", "data da venda", "data venda", "data da transacao", "data transacao", "data do movimento", "data movimento", "data lancamento",
      "data de lancamento", "data do lancamento", "data da operacao", "data/hora", "data e hora", "data hora", "dt", "dia"],
  },
  valor: {
    rotulo: "Valor bruto (R$)", obrigatorio: true,
    sugestoes: ["valor", "valor bruto", "bruto", "valor da venda", "valor venda", "valor da transacao", "valor transacao", "valor (r$)", "valor r$",
      "valor do lancamento", "valor lancamento", "montante", "quantia"],
  },
  natureza: {
    rotulo: "Crédito ou débito (coluna com C ou D)", obrigatorio: false,
    sugestoes: ["natureza", "c/d", "d/c", "cd", "dc", "credito/debito", "debito/credito", "credito ou debito", "tipo de lancamento", "sinal"],
  },
  taxa: {
    rotulo: "Taxa (R$)", obrigatorio: false,
    sugestoes: ["taxa", "taxas", "tarifa", "valor da taxa", "valor taxa", "taxa (r$)", "valor da tarifa", "mdr", "desconto", "custo da transacao"],
  },
  liquido: {
    rotulo: "Valor líquido (R$)", obrigatorio: false,
    sugestoes: ["valor liquido", "liquido", "valor liquido (r$)", "valor a receber", "valor recebido", "liquido a receber", "valor creditado"],
  },
  data_liquidacao: {
    rotulo: "Data do repasse (quando o dinheiro cai)", obrigatorio: false,
    sugestoes: ["data de pagamento", "data do pagamento", "data pagamento", "data de recebimento", "data do recebimento", "data do repasse",
      "data repasse", "previsao de pagamento", "previsao de recebimento", "data prevista", "data de liquidacao", "data da liquidacao",
      "data do credito", "data de credito"],
  },
  referencia: {
    rotulo: "Referência (NSU, código da transação ou E2E do Pix)", obrigatorio: false,
    sugestoes: ["nsu", "referencia", "codigo", "codigo da transacao", "id da transacao", "id transacao", "id", "autorizacao", "codigo de autorizacao",
      "cod. autorizacao", "e2e", "end to end", "id da transacao pix", "documento", "numero do documento", "doc"],
  },
  terminal: {
    rotulo: "Maquininha (número do terminal)", obrigatorio: false,
    sugestoes: ["terminal", "numero do terminal", "n. terminal", "maquininha", "maquina", "serial", "numero de serie", "pos", "id do terminal"],
  },
  descricao: {
    rotulo: "Descrição", obrigatorio: false,
    sugestoes: ["descricao", "historico", "lancamento", "tipo", "tipo de transacao", "produto", "bandeira", "forma de pagamento", "meio de pagamento",
      "detalhes", "observacao", "memo"],
  },
} as const;
export type CampoDoExtrato = keyof typeof CAMPOS_DO_EXTRATO;
export const NOMES_DOS_CAMPOS_DO_EXTRATO = Object.keys(CAMPOS_DO_EXTRATO) as CampoDoExtrato[];
/** Campo → índice da coluna no arquivo (ou ausente). */
export type MapaDoExtrato = Partial<Record<CampoDoExtrato, number>>;

/** Sugestão pelo nome da coluna (só ajuda a preencher; quem importa confirma cada campo). */
export function sugerirMapaDoExtrato(cabecalho: readonly string[]): MapaDoExtrato {
  const usados = new Set<number>();
  const mapa: MapaDoExtrato = {};
  for (const campo of NOMES_DOS_CAMPOS_DO_EXTRATO) {
    const sugestoes = CAMPOS_DO_EXTRATO[campo].sugestoes as readonly string[];
    const indice = cabecalho.findIndex((c, i) => !usados.has(i) && sugestoes.includes(semAcento(c)));
    if (indice >= 0) {
      mapa[campo] = indice;
      usados.add(indice);
    }
  }
  return mapa;
}

/** Mapeamento lido do formulário: cada campo aponta uma coluna existente, sem repetir coluna; data e valor obrigatórios. */
export function lerMapaDoExtrato(campo: (nome: string) => unknown, colunas: number): MapaDoExtrato | null {
  const mapa: MapaDoExtrato = {};
  const usados = new Set<number>();
  for (const nome of NOMES_DOS_CAMPOS_DO_EXTRATO) {
    const valor = campo(`coluna_${nome}`);
    if (valor === null || valor === undefined || valor === "") continue;
    if (typeof valor !== "string" || !/^\d{1,3}$/.test(valor)) return null;
    const indice = Number(valor);
    if (indice >= colunas || usados.has(indice)) return null;
    usados.add(indice);
    mapa[nome] = indice;
  }
  return mapa.data === undefined || mapa.valor === undefined ? null : mapa;
}

/** O que fica gravado do mapeamento: o nome da coluna de cada campo (para repetir a importação do mesmo jeito). */
export const mapaParaGravar = (cabecalho: readonly string[], mapa: MapaDoExtrato) =>
  ({ colunas: Object.fromEntries(NOMES_DOS_CAMPOS_DO_EXTRATO.filter((c) => mapa[c] !== undefined).map((c) => [c, cabecalho[mapa[c] as number] ?? ""])) });

// ---------------------------------------------------------------------------------------------
// Os valores e as datas como aparecem nos arquivos brasileiros
// ---------------------------------------------------------------------------------------------
export type Origem = "csv" | "xlsx" | "ofx";

/** Algarismos de reais (com ou sem fração) → centavos, arredondando a fração além dos centavos (meio para cima). */
function emCentavos(inteiro: string, fracao: string): number {
  const limpo = inteiro.replace(/^0+(?=\d)/, "");
  if (limpo.length > 12) throw new RangeError("grande");
  const centavos = Number(limpo) * 100 + Number(fracao.slice(0, 2).padEnd(2, "0"));
  const arredonda = fracao.length > 2 && Number(fracao[2]) >= 5 ? 1 : 0;
  return centavos + arredonda;
}

/**
 * O valor de uma célula em centavos, com sinal. Aceita "R$ 1.234,56", "1234,56", "1.234", "-79,00", "(79,00)",
 * "79,00-", "79,00 D" (débito) e "79,00 C"; do Excel e do OFX, também o número com ponto ("1234.5", "-50.00").
 * Lança RangeError quando não é um valor.
 */
export function lerValorDoExtrato(texto: string, origem: Origem): number {
  let t = texto.trim().replace(/[  \s]+/g, " ").replace(/−/g, "-");
  let negativo = false;
  const sufixo = / ?([CD])$/i.exec(t);
  if (sufixo && /\d/.test(t.slice(0, sufixo.index))) {
    negativo = sufixo[1]?.toUpperCase() === "D";
    t = t.slice(0, sufixo.index).trim();
  }
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1).trim(); }
  if (t.endsWith("-")) { negativo = !negativo; t = t.slice(0, -1).trim(); }
  t = t.replace(/R\$/gi, "").replace(/ /g, "");
  if (t.startsWith("-")) { negativo = !negativo; t = t.slice(1); }
  else if (t.startsWith("+")) t = t.slice(1);
  let centavos: number;
  if ((origem === "xlsx" || origem === "ofx") && /^\d+(\.\d+)?(E[+-]?\d+)?$/i.test(t) && /E/i.test(t)) {
    // Notação científica do Excel: só para números pequenos ou grandes demais para uma linha de extrato.
    const n = Number(t);
    if (!Number.isFinite(n)) throw new RangeError("valor");
    centavos = Math.round(n * 100);
  } else if (origem !== "csv" && /^\d+(\.\d+)?$/.test(t)) {
    const [inteiro = "", fracao = ""] = t.split(".");
    centavos = emCentavos(inteiro, fracao);
  } else if (origem === "ofx" && /^\d+,\d+$/.test(t)) {
    const [inteiro = "", fracao = ""] = t.split(",");
    centavos = emCentavos(inteiro, fracao);
  } else if (/^\d{1,3}(\.\d{3})*,\d+$/.test(t) || /^\d+,\d+$/.test(t)) {
    const [inteiro = "", fracao = ""] = t.replaceAll(".", "").split(",");
    centavos = emCentavos(inteiro, fracao);
  } else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(t)) {
    // "1,234.56": o número no jeito americano, comum em relatórios exportados em inglês.
    const [inteiro = "", fracao = ""] = t.replaceAll(",", "").split(".");
    centavos = emCentavos(inteiro, fracao);
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
    centavos = emCentavos(t.replaceAll(".", ""), "");
  } else if (/^\d+(\.\d{1,2})?$/.test(t)) {
    const [inteiro = "", fracao = ""] = t.split(".");
    centavos = emCentavos(inteiro, fracao);
  } else {
    throw new RangeError("valor");
  }
  if (!Number.isSafeInteger(centavos) || centavos > MAIOR_VALOR) throw new RangeError("grande");
  return negativo ? -centavos : centavos;
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");
function dataIso(ano: number, mes: number, dia: number): string {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (ano < 2000 || ano > 2100 || d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) throw new RangeError("data");
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

/**
 * A data de uma célula, como AAAA-MM-DD. Aceita "17/11/2026", "17/11/26", "17-11-2026", "17.11.2026", "2026-11-17", com
 * ou sem a hora depois; do Excel, o número da data (dias desde 30/12/1899); do OFX, "20261117" com ou sem a hora e o
 * fuso ("20261117120000[-3:BRT]"). Lança RangeError quando não é uma data do calendário entre 2000 e 2100.
 */
export function lerDataDoExtrato(texto: string, origem: Origem): string {
  const t = texto.trim();
  if (origem === "xlsx" && /^\d{5}(\.\d+)?$/.test(t)) {
    const dias = Math.floor(Number(t));
    const d = new Date(Date.UTC(1899, 11, 30) + dias * 86_400_000);
    return dataIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:[\sT,].*)?$/.exec(t);
  if (m) {
    const ano = Number(m[3]);
    return dataIso((m[3] as string).length === 2 ? 2000 + ano : ano, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[\sT].*)?$/.exec(t);
  if (m) return dataIso(Number(m[1]), Number(m[2]), Number(m[3]));
  if (origem === "ofx") {
    m = /^(\d{4})(\d{2})(\d{2})(?:\d{0,6}(?:\.\d{1,3})?)?(?:\[[^\]]*\])?$/.exec(t);
    if (m) return dataIso(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  throw new RangeError("data");
}

/** A coluna de crédito ou débito: +1 para C, crédito, entrada; -1 para D, débito, saída. Lança RangeError no resto. */
export function lerNatureza(texto: string): 1 | -1 {
  const t = semAcento(texto).replace(/[.\s]/g, "");
  if (["c", "cr", "cred", "credito", "entrada", "e", "+"].includes(t)) return 1;
  if (["d", "db", "deb", "debito", "saida", "s", "-"].includes(t)) return -1;
  throw new RangeError("natureza");
}

// ---------------------------------------------------------------------------------------------
// As linhas
// ---------------------------------------------------------------------------------------------
export type LinhaDoExtrato = {
  numero: number;
  data: string;
  valor: number;
  taxa?: number;
  liquido?: number;
  data_liquidacao?: string;
  referencia?: string;
  terminal?: string;
  descricao?: string;
};
export type ProblemaDaLinha = { numero: number; campo: CampoDoExtrato; texto: string };
export type LinhasDoExtrato = { linhas: LinhaDoExtrato[]; deFora: number; problemas: ProblemaDaLinha[] };

const MAXIMOS = { referencia: 80, terminal: 40, descricao: 200 } as const;
const espacos = (t: string) => t.replace(/\s+/g, " ").trim();
/** Linha de saldo (saldo anterior, saldo do dia): não é lançamento. */
const ehSaldo = (descricao: string | undefined) => descricao !== undefined && /^saldo\b/.test(semAcento(descricao));

/**
 * Monta as linhas do extrato a partir da planilha (CSV ou Excel) e do mapeamento. Ficam de fora, contadas, as linhas sem
 * data ou sem valor (total, cabeçalho repetido), as de saldo e as de valor zero. As que não deu para ler voltam em
 * `problemas`, com a linha do arquivo e o campo, para a tela apontar.
 */
export function montarLinhasDoExtrato(planilha: Planilha, mapa: MapaDoExtrato): LinhasDoExtrato {
  const linhas: LinhaDoExtrato[] = [];
  const problemas: ProblemaDaLinha[] = [];
  let deFora = 0;
  planilha.linhas.forEach((celulas, i) => {
    const numero = planilha.numeros[i] ?? i + 2;
    const celula = (campo: CampoDoExtrato) => {
      const indice = mapa[campo];
      return indice === undefined ? "" : espacos(celulas[indice] ?? "");
    };
    const dataTexto = celula("data");
    const valorTexto = celula("valor");
    const descricao = celula("descricao") || undefined;
    if (dataTexto === "" || valorTexto === "" || ehSaldo(descricao)) {
      deFora += 1;
      return;
    }
    const antes = problemas.length;
    const ler = <T>(campo: CampoDoExtrato, texto: string, leitor: (t: string) => T): T | undefined => {
      try {
        return leitor(texto);
      } catch {
        problemas.push({ numero, campo, texto: texto.slice(0, 40) });
        return undefined;
      }
    };
    const data = ler("data", dataTexto, (t) => lerDataDoExtrato(t, planilha.formato));
    let valor = ler("valor", valorTexto, (t) => lerValorDoExtrato(t, planilha.formato));
    const naturezaTexto = celula("natureza");
    if (valor !== undefined && naturezaTexto !== "") {
      const sinal = ler("natureza", naturezaTexto, lerNatureza);
      if (sinal !== undefined) valor = Math.abs(valor) * sinal;
    }
    const opcional = (campo: CampoDoExtrato, leitor: (t: string) => number | string) => {
      const texto = celula(campo);
      return texto === "" ? undefined : ler(campo, texto, leitor);
    };
    const taxa = opcional("taxa", (t) => Math.abs(lerValorDoExtrato(t, planilha.formato))) as number | undefined;
    const liquido = opcional("liquido", (t) => lerValorDoExtrato(t, planilha.formato)) as number | undefined;
    const dataLiquidacao = opcional("data_liquidacao", (t) => lerDataDoExtrato(t, planilha.formato)) as string | undefined;
    const texto = (campo: "referencia" | "terminal") => opcional(campo, (t) => {
      if (t.length > MAXIMOS[campo]) throw new RangeError("longo");
      return t;
    }) as string | undefined;
    const referencia = texto("referencia");
    const terminal = texto("terminal");
    if (problemas.length > antes || data === undefined || valor === undefined) return;
    if (valor === 0) {
      deFora += 1;
      return;
    }
    const linha: LinhaDoExtrato = { numero, data, valor };
    if (taxa !== undefined) linha.taxa = taxa;
    // O líquido acompanha o sinal do valor: no débito (estorno, chargeback), os dois são negativos.
    if (liquido !== undefined) linha.liquido = Math.sign(valor) * Math.abs(liquido);
    if (dataLiquidacao !== undefined) linha.data_liquidacao = dataLiquidacao;
    if (referencia !== undefined) linha.referencia = referencia;
    if (terminal !== undefined) linha.terminal = terminal;
    if (descricao !== undefined) linha.descricao = descricao.slice(0, MAXIMOS.descricao).trim();
    linhas.push(linha);
  });
  return { linhas, deFora, problemas };
}

// ---------------------------------------------------------------------------------------------
// O OFX dos bancos
// ---------------------------------------------------------------------------------------------
/** O começo do arquivo é de um OFX? (o cabeçalho "OFXHEADER" do OFX 1, ou a etiqueta <OFX> do OFX 2). */
export function pareceOfx(inicio: Uint8Array): boolean {
  const texto = new TextDecoder("latin1").decode(inicio.subarray(0, 4096));
  return /^\s*(?:﻿)?OFXHEADER\s*:/i.test(texto) || /<\?OFX\b/i.test(texto) || /^\s*(?:﻿)?(?:<\?xml[^>]*>\s*)?<OFX>/i.test(texto);
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const semEntidades = (t: string) => t.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTIDADES[e] ?? "");

export class ErroDoOfx extends Error {
  constructor(readonly motivo: "ofx" | "linhas") {
    super(`OFX inválido: ${motivo}`);
    this.name = "ErroDoOfx";
  }
}

/**
 * Os lançamentos (STMTTRN) de um OFX, no SGML do OFX 1 (sem etiqueta de fecho nos campos) ou no XML do OFX 2: a data
 * (DTPOSTED), o valor com sinal (TRNAMT), a referência (FITID, ou o número do documento) e a descrição (MEMO ou NAME).
 * O número da linha é a ordem do lançamento no arquivo. Lança ErroDoOfx sem lançamento algum ou com mais de 5.000.
 */
export function lerOfx(bytes: Uint8Array): LinhasDoExtrato {
  const { texto } = decodificar(bytes);
  const blocos = [...texto.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].map((m) => m[1] ?? "");
  if (blocos.length === 0) throw new ErroDoOfx("ofx");
  if (blocos.length > LINHAS_DO_EXTRATO * 2) throw new ErroDoOfx("linhas");
  const linhas: LinhaDoExtrato[] = [];
  const problemas: ProblemaDaLinha[] = [];
  let deFora = 0;
  blocos.forEach((bloco, i) => {
    const numero = i + 1;
    const campo = (nome: string) => espacos(semEntidades(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i").exec(bloco)?.[1] ?? ""));
    const dataTexto = campo("DTPOSTED");
    const valorTexto = campo("TRNAMT");
    let data: string | undefined;
    let valor: number | undefined;
    try { data = lerDataDoExtrato(dataTexto, "ofx"); } catch { problemas.push({ numero, campo: "data", texto: dataTexto.slice(0, 40) }); }
    try { valor = lerValorDoExtrato(valorTexto, "ofx"); } catch { problemas.push({ numero, campo: "valor", texto: valorTexto.slice(0, 40) }); }
    if (data === undefined || valor === undefined) return;
    if (valor === 0) {
      deFora += 1;
      return;
    }
    const linha: LinhaDoExtrato = { numero, data, valor };
    const referencia = (campo("FITID") || campo("CHECKNUM") || campo("REFNUM")).slice(0, MAXIMOS.referencia).trim();
    if (referencia !== "") linha.referencia = referencia;
    const descricao = (campo("MEMO") || campo("NAME")).slice(0, MAXIMOS.descricao).trim();
    if (descricao !== "") linha.descricao = descricao;
    linhas.push(linha);
  });
  return { linhas, deFora, problemas };
}

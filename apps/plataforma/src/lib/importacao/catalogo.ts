// Importação do catálogo por planilha (ORA-CAT-002). A pessoa diz qual coluna é cada campo (o formato
// da Rein não é suposto: ADR-003 §3, pendência B1); aqui só se montam as linhas no formato do banco,
// que valida tudo de novo, compara com o catálogo e guarda a prévia para aprovação.
import { lerReais } from "@ora5g/dominio";

import { LINHAS_POR_PARTE, MAXIMO_DO_CAMPO, semAcento, type Planilha } from "./csv";

export const CAMPOS_DO_CATALOGO = {
  sku: { rotulo: "SKU (código do item)", obrigatorio: true, sugestoes: ["sku", "codigo", "cod", "codigo do produto", "referencia", "ref"] },
  nome: { rotulo: "Nome completo do item", obrigatorio: true, sugestoes: ["nome", "descricao", "descricao do produto", "produto", "item"] },
  produto: { rotulo: "Produto (modelo que agrupa cores e capacidades)", obrigatorio: false, sugestoes: ["modelo", "produto pai", "grupo do produto"] },
  tipo: { rotulo: "Tipo (aparelho, acessório, chip ou serviço)", obrigatorio: false, sugestoes: ["tipo", "tipo do produto"] },
  categoria: { rotulo: "Categoria", obrigatorio: false, sugestoes: ["categoria", "grupo", "departamento", "secao", "familia"] },
  marca: { rotulo: "Marca", obrigatorio: false, sugestoes: ["marca", "fabricante"] },
  codigo_barras: { rotulo: "Código de barras (EAN)", obrigatorio: false, sugestoes: ["ean", "codigo de barras", "codigo barras", "cod barras", "gtin", "codbarras"] },
  cor: { rotulo: "Cor", obrigatorio: false, sugestoes: ["cor"] },
  capacidade: { rotulo: "Capacidade", obrigatorio: false, sugestoes: ["capacidade", "memoria", "armazenamento"] },
  preco: { rotulo: "Preço de venda (R$)", obrigatorio: false, sugestoes: ["preco", "preco de venda", "preco venda", "valor", "valor de venda", "pv"] },
  custo: { rotulo: "Custo (R$)", obrigatorio: false, sugestoes: ["custo", "preco de custo", "valor de custo", "custo unitario", "custo unit. (r$)"] },
} as const;
export type CampoDoCatalogo = keyof typeof CAMPOS_DO_CATALOGO;
export const NOMES_DOS_CAMPOS = Object.keys(CAMPOS_DO_CATALOGO) as CampoDoCatalogo[];

export const TIPOS_ACEITOS = ["aparelho", "acessorio", "chip", "ativacao", "portabilidade", "recarga", "servico"] as const;
export type TipoAceito = (typeof TIPOS_ACEITOS)[number];

/** Campo → índice da coluna no arquivo (ou ausente). */
export type Mapeamento = Partial<Record<CampoDoCatalogo, number>>;

/**
 * O que vale para a linha que não traz o dado: o tipo e a categoria. E, desde o REIN-d, o tipo de cada categoria do
 * arquivo (pelo nome dela): no relatório da Rein não há coluna de tipo, e a família "CELULARES" é aparelho (com IMEI),
 * enquanto as outras são acessório.
 */
export type PadroesDaImportacao = { tipo: TipoAceito; categoria: string; tiposPorCategoria?: Readonly<Record<string, TipoAceito>> };

/**
 * As categorias que o arquivo traz na coluna dada, da mais frequente para a menos: o nome como está escrito (o da primeira
 * linha em que aparece) e em quantas linhas. Nomes que só diferem no acento ou nas maiúsculas contam juntos. A linha
 * `exceto` (o rodapé) fica de fora.
 */
export function categoriasDoArquivo(planilha: Planilha, coluna: number, exceto: number | null = null): { nome: string; linhas: number }[] {
  const porChave = new Map<string, { nome: string; linhas: number }>();
  planilha.linhas.forEach((linha, i) => {
    const nome = (linha[coluna] ?? "").trim().replace(/\s+/g, " ");
    if (i === exceto || nome === "") return;
    const chave = semAcento(nome);
    const achada = porChave.get(chave);
    if (achada) achada.linhas += 1;
    else porChave.set(chave, { nome, linhas: 1 });
  });
  return [...porChave.values()].sort((a, b) => b.linhas - a.linhas || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** O tipo que o nome da categoria sugere (só ajuda a preencher; quem importa confirma): celulares são aparelho; chips, chip. */
export function tipoSugeridoDaCategoria(nome: string): TipoAceito | null {
  const n = semAcento(nome);
  if (/^(celular|celulares|smartphone|smartphones|aparelho|aparelhos|aparelhos celulares|telefone|telefones)$/.test(n)) return "aparelho";
  if (/^(chip|chips)$/.test(n)) return "chip";
  return null;
}

/**
 * Sugestão pelo nome da coluna (só ajuda a preencher; quem importa confirma cada campo). Os nomes do relatório de produtos
 * da Rein (lote REIN-d, com o arquivo original): "Codigo" (o SKU: 4 dígitos, sempre preenchido e único), "Produto",
 * "Familia" (a categoria), "Marca", "Codigo Barras" e "Custo Unit. (R$)". O preço NÃO é sugerido: o relatório traz três
 * tabelas ("Preco Original (R$) TABELA NORMAL", "MERCADO LIVRE" e "NOVA TABELA"), e qual vale na loja é escolha de quem importa.
 */
export function sugerirMapeamento(cabecalho: readonly string[]): Mapeamento {
  const usados = new Set<number>();
  const mapa: Mapeamento = {};
  for (const campo of NOMES_DOS_CAMPOS) {
    const indice = cabecalho.findIndex((c, i) => !usados.has(i) && (CAMPOS_DO_CATALOGO[campo].sugestoes as readonly string[]).includes(semAcento(c)));
    if (indice >= 0) {
      mapa[campo] = indice;
      usados.add(indice);
    }
  }
  return mapa;
}

const SEM_GTIN = /^semgtin$/i;
/** O código de barras que o banco aceita: de 8 a 14 dígitos. */
const CODIGO_DE_BARRAS = /^\d{8,14}$/;

/**
 * O código de barras como o banco espera (de 8 a 14 dígitos, sem espaço). REIN-d, com o arquivo original:
 *  - "SEM GTIN" é o texto que a nota fiscal usa para o produto sem código de barras: vale como vazio;
 *  - o que não tem de 8 a 14 dígitos (no relatório, números de 15 dígitos, o tamanho de um IMEI, em alguns celulares)
 *    fica em branco, e a prévia diz quantos e em que linhas (codigosDeBarrasEmBranco): o produto entra sem o código
 *    de barras, em vez de a planilha inteira parar por causa dele.
 */
function codigoDeBarras(celula: string | null): string | null {
  if (celula === null) return null;
  const limpo = celula.replace(/\s/g, "");
  return CODIGO_DE_BARRAS.test(limpo) ? limpo : null;
}

export type LinhaDoCatalogo = {
  numero: number;
  sku: string | null; nome: string | null; produto: string | null; tipo: string | null; categoria: string | null; marca: string | null;
  codigo_barras: string | null; cor: string | null; capacidade: string | null; preco: number | null; custo: number | null;
  erros: string[];
};

/** Monta as linhas no formato do banco. Erros de leitura (dinheiro, tipo) vão junto, para a prévia mostrar. */
export function montarLinhas(planilha: Planilha, mapa: Mapeamento, padroes: PadroesDaImportacao): LinhaDoCatalogo[] {
  // REIN-d: o tipo de cada categoria, pela chave sem acento e sem diferença de maiúsculas.
  const tipoDaCategoria = new Map(Object.entries(padroes.tiposPorCategoria ?? {}).map(([nome, tipo]) => [semAcento(nome), tipo]));
  const pontoDecimal = {
    preco: mapa.preco !== undefined && pontoDecimalProvado(planilha, mapa.preco),
    custo: mapa.custo !== undefined && pontoDecimalProvado(planilha, mapa.custo),
  };
  return planilha.linhas.map((linha, i) => {
    const erros: string[] = [];
    // O campo que passa do limite não vai ao banco: a linha fica com o erro, à vista na prévia (REIN-a).
    const celula = (linha: readonly string[], campo: CampoDoCatalogo) => {
      const indice = mapa[campo];
      const valor = indice === undefined ? "" : (linha[indice] ?? "").trim();
      if (valor.length > MAXIMO_DO_CAMPO) {
        const aviso = `${CAMPOS_DO_CATALOGO[campo].rotulo}: passa de ${MAXIMO_DO_CAMPO} caracteres (tem ${valor.length})`;
        if (!erros.includes(aviso)) erros.push(aviso);
        return null;
      }
      return valor === "" ? null : valor;
    };
    const dinheiro = (campo: "preco" | "custo") => {
      const texto = celula(linha, campo);
      if (texto === null) return null;
      const rotulo = campo === "preco" ? "Preço" : "Custo";
      try {
        // F18-01: o número do Excel vale pelo que é (o ponto é decimal); o texto segue a planilha brasileira (lerReais).
        // REIN-d: o valor que veio como número do Excel com mais de duas casas (no relatório da Rein, o custo médio, como
        // 31,1823, e o preço calculado, como 368,9999) é arredondado ao centavo mais próximo, e a prévia diz quantos foram
        // e em que linhas (valoresArredondados). O valor com cara de milhar ("1.299") numa coluna que não prova o ponto
        // decimal não é arredondado: segue o erro, para a pessoa conferir.
        const numerica = celulaNumerica(planilha, i, mapa[campo] as number);
        const c = !numerica ? lerReais(texto)
          : valorArredondavel(texto, pontoDecimal[campo]) ? Math.round(Number(texto) * 100)
          : centavosDoNumero(Number(texto));
        if (c > 100_000_000) throw new RangeError("grande");
        return c;
      } catch (e) {
        erros.push(e instanceof RangeError && e.message === "casas"
          ? `${rotulo} com mais de duas casas decimais: "${texto.slice(0, 30)}" (confira na planilha; nada é arredondado)`
          : `${rotulo} inválido: "${texto.slice(0, 30)}"`);
        return null;
      }
    };
    const tipoLido = celula(linha, "tipo");
    const categoriaLida = celula(linha, "categoria");
    // O tipo da linha: o da coluna do tipo, se o arquivo tem; senão, o da categoria dela (REIN-d); senão, o padrão.
    let tipo: string | null = (categoriaLida === null ? undefined : tipoDaCategoria.get(semAcento(categoriaLida))) ?? padroes.tipo;
    if (tipoLido !== null) {
      const t = semAcento(tipoLido);
      if ((TIPOS_ACEITOS as readonly string[]).includes(t)) tipo = t;
      else {
        erros.push(`Tipo desconhecido: "${tipoLido.slice(0, 30)}" (use aparelho, acessório, chip, ativação, portabilidade, recarga ou serviço)`);
        tipo = null;
      }
    }
    const nome = celula(linha, "nome");
    return {
      // A linha do arquivo (no Excel, a da folha; CAT-002b): a prévia aponta a linha que a pessoa vê.
      numero: planilha.numeros[i] ?? i + 2,
      sku: celula(linha, "sku"),
      nome,
      produto: celula(linha, "produto") ?? nome,
      tipo,
      categoria: categoriaLida ?? padroes.categoria,
      marca: celula(linha, "marca"),
      codigo_barras: codigoDeBarras(celula(linha, "codigo_barras")),
      cor: celula(linha, "cor"),
      capacidade: celula(linha, "capacidade"),
      preco: dinheiro("preco"),
      custo: dinheiro("custo"),
      erros,
    };
  });
}

/** Mapeamento lido do formulário: cada campo aponta um índice de coluna existente, sem repetir coluna. */
export function lerMapeamento(campo: (nome: string) => unknown, colunas: number): Mapeamento | null {
  const mapa: Mapeamento = {};
  const usados = new Set<number>();
  for (const nome of NOMES_DOS_CAMPOS) {
    const valor = campo(`coluna_${nome}`);
    if (valor === null || valor === undefined || valor === "") continue;
    if (typeof valor !== "string" || !/^\d{1,2}$/.test(valor)) return null;
    const indice = Number(valor);
    if (indice >= colunas || usados.has(indice)) return null;
    usados.add(indice);
    mapa[nome] = indice;
  }
  return mapa.sku === undefined || mapa.nome === undefined ? null : mapa;
}

// ---------------------------------------------------------------------------------------------
// O número de uma célula pela origem (achado F18-01 da reanálise do Codex de 18/11)
// ---------------------------------------------------------------------------------------------
/** A célula veio como NÚMERO do Excel (e não como texto)? Aí o ponto é decimal, nunca separador de milhar. */
export const celulaNumerica = (planilha: Planilha, linha: number, coluna: number) => planilha.numericas?.[linha]?.includes(coluna) === true;

/**
 * A célula estava MARCADA como número na folha, mas escrita fora do padrão do Excel (F21-01 da auditoria de 21/11: os
 * totais do rodapé da Rein, "1.234,00")? Ela vale pelo texto que traz, e a prévia diz que foi lida assim.
 */
export const celulaForaDoPadrao = (planilha: Planilha, linha: number, coluna: number) => planilha.foraDoPadrao?.[linha]?.includes(coluna) === true;

/**
 * As células fora do padrão da planilha (ver celulaForaDoPadrao), sem contar a linha `exceto` (o rodapé, que tem o
 * próprio motivo): quantas são e o número, na planilha, de cada linha que tem alguma (as 20 primeiras).
 */
export function celulasForaDoPadrao(planilha: Planilha, exceto: number | null = null): { celulas: number; linhas: number[] } | null {
  let celulas = 0;
  const linhas: number[] = [];
  (planilha.foraDoPadrao ?? []).forEach((colunas, i) => {
    if (i === exceto || colunas.length === 0) return;
    celulas += colunas.length;
    if (linhas.length < 20) linhas.push(planilha.numeros[i] ?? i + 2);
  });
  return celulas === 0 ? null : { celulas, linhas };
}

/**
 * O número de uma célula, pela origem: a célula numérica do Excel é o próprio número (o leitor a escreve com ponto
 * decimal: "0.625" é zero vírgula seiscentos e vinte e cinco, e "1.234" é um vírgula duzentos e trinta e quatro); o texto
 * segue numeroDoRodape (a planilha brasileira, a inglesa e a notação do Excel), e também a célula de número escrita fora
 * do padrão do Excel, que não é "numérica" (F21-01: "1.234,00" é mil duzentos e trinta e quatro). Vazio ou não número: nulo.
 */
export function numeroDaCelula(planilha: Planilha, linha: number, coluna: number): number | null {
  const texto = (planilha.linhas[linha]?.[coluna] ?? "").trim();
  if (texto === "") return null;
  if (celulaNumerica(planilha, linha, coluna)) {
    const n = Number(texto);
    return Number.isFinite(n) ? n : null;
  }
  return numeroDoRodape(texto);
}

/** Os centavos de um valor em reais que veio como número do Excel: até duas casas; mais casas, negativo ou não número é erro. */
function centavosDoNumero(n: number): number {
  if (!Number.isFinite(n) || n < 0) throw new RangeError("invalido");
  const c = n * 100;
  const inteiro = Math.round(c);
  if (Math.abs(c - inteiro) > 1e-6) throw new RangeError("casas");
  return inteiro;
}

// ---------------------------------------------------------------------------------------------
// O valor com mais de duas casas e o código de barras fora do padrão (lote REIN-d, com o arquivo original da Rein)
// ---------------------------------------------------------------------------------------------
/** Um número com mais de duas casas decimais (o que não cabe em centavos sem arredondar)? */
const temMaisDeDuasCasas = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;
/** A cara de milhar: de um a três dígitos, o ponto e exatamente três dígitos ("1.299", "321.937"). */
const FORMA_DE_MILHAR = /^[1-9]\d{0,2}\.\d{3}$/;

/**
 * A coluna prova que o ponto é decimal: alguma célula numérica do Excel com ponto que não tem cara de milhar ("12.5",
 * "0.578", "31.1823"). O relatório da Rein escreve o custo assim. Sem essa prova, um "1.299" numa célula de número fica
 * como estava: um real e trinta com três casas, que a pessoa confere (F18-01).
 */
function pontoDecimalProvado(planilha: Planilha, coluna: number): boolean {
  return planilha.linhas.some((linha, i) => {
    if (!celulaNumerica(planilha, i, coluna)) return false;
    const t = (linha[coluna] ?? "").trim();
    return /^\d+\.\d+$/.test(t) && !FORMA_DE_MILHAR.test(t);
  });
}

/**
 * O valor (número do Excel) com mais de duas casas que é arredondado ao centavo mais próximo: o custo médio e o preço
 * calculado, como "31.1823", "0.578" e "368.9999"; e o que tem cara de milhar ("321.937"), só na coluna que prova o
 * ponto decimal.
 */
function valorArredondavel(texto: string, pontoDecimal: boolean): boolean {
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0 && temMaisDeDuasCasas(n) && (pontoDecimal || !FORMA_DE_MILHAR.test(texto));
}

/** Quantas células e o número, na planilha, das linhas (as 20 primeiras) de um ajuste da leitura que a prévia mostra. */
export type AjusteDaLeitura = { celulas: number; linhas: number[] };

/**
 * Os valores arredondados ao centavo (ver valorArredondavel) na coluna do custo ou do preço, sem contar a linha
 * `exceto` (o rodapé). A prévia mostra isso: nada é arredondado calado. Sem a coluna ou sem nenhum, nulo.
 */
export function valoresArredondados(planilha: Planilha, mapa: Mapeamento, campo: "preco" | "custo", exceto: number | null = null): AjusteDaLeitura | null {
  const coluna = mapa[campo];
  if (coluna === undefined) return null;
  const pontoDecimal = pontoDecimalProvado(planilha, coluna);
  let celulas = 0;
  const linhas: number[] = [];
  planilha.linhas.forEach((linha, i) => {
    if (i === exceto || !celulaNumerica(planilha, i, coluna) || !valorArredondavel((linha[coluna] ?? "").trim(), pontoDecimal)) return;
    celulas += 1;
    if (linhas.length < 20) linhas.push(planilha.numeros[i] ?? i + 2);
  });
  return celulas === 0 ? null : { celulas, linhas };
}

/**
 * Os códigos de barras fora do padrão (ver codigoDeBarras), que ficaram em branco, sem contar a linha `exceto`: quantos
 * são e em que linhas. No relatório da Rein, são números de 15 dígitos (o tamanho de um IMEI) no campo do código de
 * barras de alguns celulares. "SEM GTIN" não conta: é o produto sem código de barras.
 */
export function codigosDeBarrasEmBranco(planilha: Planilha, mapa: Mapeamento, exceto: number | null = null): AjusteDaLeitura | null {
  const coluna = mapa.codigo_barras;
  if (coluna === undefined) return null;
  let celulas = 0;
  const linhas: number[] = [];
  planilha.linhas.forEach((linha, i) => {
    const limpo = (linha[coluna] ?? "").replace(/\s/g, "");
    if (i === exceto || limpo === "" || SEM_GTIN.test(limpo) || CODIGO_DE_BARRAS.test(limpo)) return;
    celulas += 1;
    if (linhas.length < 20) linhas.push(planilha.numeros[i] ?? i + 2);
  });
  return celulas === 0 ? null : { celulas, linhas };
}

// ---------------------------------------------------------------------------------------------
// A planilha inteira da Rein (lote REIN-a; plano de 16/11, Onda 1, item 3): a linha de total no fim e as partes.
// ---------------------------------------------------------------------------------------------
const COMECA_COM_TOTAL = /^\s*total\b/i;

/**
 * Um número do rodapé: inteiro ou decimal, com sinal, separador de milhar, "R$" ou a notação do Excel (1.5E+20). Devolve
 * o valor, ou nulo quando a célula não é número. "1.234,56" e "1234.56" valem o mesmo; "1.234" (com um ponto e três
 * casas) é mil duzentos e trinta e quatro, como na planilha brasileira.
 */
export function numeroDoRodape(celula: string): number | null {
  // O \s do JavaScript já pega o espaço sem quebra (U+00A0), que o Excel usa como separador de milhar.
  const t = celula.trim().replace(/^([-+]?)R\$\s?/, "$1").replace(/\s/g, "");
  if (/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t) && !/^[-+]?\d{1,3}\.\d{3}$/.test(t)) return Number(t);
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^[-+]?\d+,\d+$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ""));
  return null;
}

/** A linha que fica de fora da importação, com o motivo que a prévia mostra. */
export type LinhaDeFora = { posicao: number; motivo: string };

/** Os campos que identificam o item: num rodapé de totais nenhum vem preenchido (o preço e o custo podem ser somas). */
const CAMPOS_DE_IDENTIDADE: readonly CampoDoCatalogo[] = ["produto", "tipo", "categoria", "marca", "codigo_barras", "cor", "capacidade"];

/**
 * A última linha da planilha, quando não tem SKU nem nome (ou tem "Total" no nome), em duas classes (achados F01 de 17/11
 * e F18-02 de 18/11):
 *  - **comprovado:** alguma célula começa por "Total" (o rótulo), ou as células preenchidas são todas números, pelo menos
 *    duas, nenhum campo de identificação (EAN, marca, categoria...) preenchido, e os números são somas das linhas de
 *    cima: em pelo menos uma coluna, a soma da própria coluna; ou, em pelo menos duas, a soma de OUTRA coluna (lote
 *    REIN-d: o relatório de produtos da Rein termina assim, com os totais DESLOCADOS: na linha 2.273 do arquivo de 10/11,
 *    o total do "Custo do Estoque" de cada loja está debaixo da "Qtd. Disponivel" da mesma loja, e o do "Valor de
 *    Mercado", debaixo de um "Custo do Estoque"). Fica de fora da importação, com o motivo.
 *  - **candidato:** só números, mas sem soma que confira (ou com uma só, de outra coluna, que é pouco para provar) ou com
 *    um campo de identificação preenchido (a linha incompleta com o EAN e o preço do F18-02). Não some: vai à prévia como
 *    está (o banco a marca, pela falta do SKU e do nome), e a prévia avisa; só sai por decisão de quem envia, registrada
 *    (ver o envio da importação).
 * A linha com algum texto, com um número só, ou no meio da planilha, vai à prévia como está: nada some calado.
 */
function avaliarUltimaLinha(planilha: Planilha, mapa: Mapeamento): (LinhaDeFora & { tipo: "comprovado" | "candidato" }) | null {
  const posicao = planilha.linhas.length - 1;
  const linha = planilha.linhas[posicao];
  if (!linha || mapa.sku === undefined || mapa.nome === undefined) return null;
  const sku = (linha[mapa.sku] ?? "").trim();
  const nome = (linha[mapa.nome] ?? "").trim();
  if (sku !== "" || (nome !== "" && !COMECA_COM_TOTAL.test(nome))) return null;
  if (linha.some((celula) => COMECA_COM_TOTAL.test(celula))) return { tipo: "comprovado", posicao, motivo: "linha de total no fim da planilha" };
  const preenchidas = linha.map((celula, coluna) => ({ coluna, texto: celula.trim() })).filter((c) => c.texto !== "");
  if (preenchidas.length < 2) return null;
  const numeros = preenchidas.map((c) => ({ coluna: c.coluna, valor: numeroDaCelula(planilha, posicao, c.coluna) }));
  if (numeros.some((n) => n.valor === null)) return null;
  // A conferência: o número da última linha é a soma das linhas de cima (com os centavos). A soma de cada coluna é
  // calculada uma vez; a coluna com alguma célula que não é número não tem soma.
  const somas = new Map<number, { soma: number; celulas: number } | null>();
  const somaDeCima = (coluna: number) => {
    if (!somas.has(coluna)) {
      let soma = 0;
      let celulas = 0;
      let valida = true;
      for (let i = 0; i < posicao && valida; i += 1) {
        if ((planilha.linhas[i]?.[coluna] ?? "").trim() === "") continue;
        const n = numeroDaCelula(planilha, i, coluna);
        if (n === null) valida = false;
        else {
          soma += n;
          celulas += 1;
        }
      }
      somas.set(coluna, valida ? { soma, celulas } : null);
    }
    return somas.get(coluna) ?? null;
  };
  const igual = (soma: number, valor: number) => Math.abs(soma - valor) < 0.005;
  // Na própria coluna (a coluna vazia em cima soma zero, como sempre foi).
  const naPropria = new Set(numeros.filter((n) => {
    const s = somaDeCima(n.coluna);
    return s !== null && igual(s.soma, n.valor as number);
  }).map((n) => n.coluna));
  const conferem = naPropria.size;
  // REIN-d: em OUTRA coluna (o relatório da Rein escreve os totais deslocados). Só vale o número diferente de zero que é
  // a soma de uma coluna com pelo menos duas células; e uma coincidência só não prova: são precisas duas.
  const largura = Math.max(planilha.cabecalho.length, linha.length);
  const emOutra = numeros.filter((n) => {
    if (naPropria.has(n.coluna) || n.valor === 0) return false;
    for (let coluna = 0; coluna < largura; coluna += 1) {
      if (coluna === n.coluna) continue;
      const s = somaDeCima(coluna);
      if (s !== null && s.celulas >= 2 && igual(s.soma, n.valor as number)) return true;
    }
    return false;
  }).length;
  const identidade = CAMPOS_DE_IDENTIDADE.filter((campo) => mapa[campo] !== undefined && (linha[mapa[campo] as number] ?? "").trim() !== "");
  // F21-01: os números do rodapé que vieram escritos fora do padrão do Excel (a vírgula brasileira numa célula de número)
  // foram lidos como estão escritos; o motivo diz quantos, para a prévia não esconder a leitura.
  const escritos = numeros.filter((n) => celulaForaDoPadrao(planilha, posicao, n.coluna)).length;
  const descricao = `sem código e sem nome, só números em ${numeros.length} colunas${escritos > 0
    ? `, ${escritos} ${escritos === 1 ? "delas escrita" : "delas escritas"} com vírgula numa célula de número e ${escritos === 1 ? "lida" : "lidas"} como ${escritos === 1 ? "está" : "estão"}` : ""}`;
  if ((conferem > 0 || emOutra >= 2) && identidade.length === 0) {
    const provas = [
      ...(conferem > 0 ? [`em ${conferem} delas o número é a soma das linhas de cima`] : []),
      ...(emOutra > 0 ? [`em ${emOutra} delas o número é a soma de outra coluna (o relatório escreve os totais deslocados)`] : []),
    ];
    return { tipo: "comprovado", posicao, motivo: `rodapé de totais no fim da planilha (${descricao}; ${provas.join("; ")})` };
  }
  const porque = identidade.length > 0
    ? `com ${identidade.map((c) => CAMPOS_DO_CATALOGO[c].rotulo.replace(/ \(.*\)$/, "").toLowerCase()).join(", ")} preenchido`
    : emOutra === 1
      ? "e só um deles é a soma de uma coluna, e de outra coluna: é pouco para provar"
      : "e nenhum deles é a soma das linhas de cima";
  return { tipo: "candidato", posicao, motivo: `a última linha pode ser um rodapé ou um item sem cadastro (${descricao}, ${porque})` };
}

/** O rodapé COMPROVADO no fim da planilha, que fica de fora da importação (ver avaliarUltimaLinha), ou nulo. */
export function rodapeDaPlanilha(planilha: Planilha, mapa: Mapeamento): LinhaDeFora | null {
  const v = avaliarUltimaLinha(planilha, mapa);
  return v?.tipo === "comprovado" ? { posicao: v.posicao, motivo: v.motivo } : null;
}

/** A última linha CANDIDATA a rodapé, que vai à prévia e só sai por decisão registrada de quem envia, ou nulo. */
export function candidatoARodape(planilha: Planilha, mapa: Mapeamento): LinhaDeFora | null {
  const v = avaliarUltimaLinha(planilha, mapa);
  return v?.tipo === "candidato" ? { posicao: v.posicao, motivo: v.motivo } : null;
}

/** A posição do rodapé no fim da planilha (ver rodapeDaPlanilha), ou nulo. */
export function linhaDeTotal(planilha: Planilha, mapa: Mapeamento): number | null {
  return rodapeDaPlanilha(planilha, mapa)?.posicao ?? null;
}

/** As partes da importação: até 2.000 linhas cada, na ordem do arquivo (uma prévia por parte). */
export function dividirEmPartes<T>(linhas: readonly T[], tamanho: number = LINHAS_POR_PARTE): T[][] {
  const partes: T[][] = [];
  for (let i = 0; i < linhas.length; i += tamanho) partes.push(linhas.slice(i, i + tamanho));
  return partes;
}

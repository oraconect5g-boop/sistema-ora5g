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
  categoria: { rotulo: "Categoria", obrigatorio: false, sugestoes: ["categoria", "grupo", "departamento", "secao"] },
  marca: { rotulo: "Marca", obrigatorio: false, sugestoes: ["marca", "fabricante"] },
  codigo_barras: { rotulo: "Código de barras (EAN)", obrigatorio: false, sugestoes: ["ean", "codigo de barras", "cod barras", "gtin", "codbarras"] },
  cor: { rotulo: "Cor", obrigatorio: false, sugestoes: ["cor"] },
  capacidade: { rotulo: "Capacidade", obrigatorio: false, sugestoes: ["capacidade", "memoria", "armazenamento"] },
  preco: { rotulo: "Preço de venda (R$)", obrigatorio: false, sugestoes: ["preco", "preco de venda", "preco venda", "valor", "valor de venda", "pv"] },
  custo: { rotulo: "Custo (R$)", obrigatorio: false, sugestoes: ["custo", "preco de custo", "valor de custo", "custo unitario"] },
} as const;
export type CampoDoCatalogo = keyof typeof CAMPOS_DO_CATALOGO;
export const NOMES_DOS_CAMPOS = Object.keys(CAMPOS_DO_CATALOGO) as CampoDoCatalogo[];

export const TIPOS_ACEITOS = ["aparelho", "acessorio", "chip", "ativacao", "portabilidade", "recarga", "servico"] as const;
export type TipoAceito = (typeof TIPOS_ACEITOS)[number];

/** Campo → índice da coluna no arquivo (ou ausente). */
export type Mapeamento = Partial<Record<CampoDoCatalogo, number>>;

/** Sugestão pelo nome da coluna (só ajuda a preencher; quem importa confirma cada campo). */
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

export type LinhaDoCatalogo = {
  numero: number;
  sku: string | null; nome: string | null; produto: string | null; tipo: string | null; categoria: string | null; marca: string | null;
  codigo_barras: string | null; cor: string | null; capacidade: string | null; preco: number | null; custo: number | null;
  erros: string[];
};

/** Monta as linhas no formato do banco. Erros de leitura (dinheiro, tipo) vão junto, para a prévia mostrar. */
export function montarLinhas(planilha: Planilha, mapa: Mapeamento, padroes: { tipo: TipoAceito; categoria: string }): LinhaDoCatalogo[] {
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
        const c = celulaNumerica(planilha, i, mapa[campo] as number) ? centavosDoNumero(Number(texto)) : lerReais(texto);
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
    let tipo: string | null = padroes.tipo;
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
      categoria: celula(linha, "categoria") ?? padroes.categoria,
      marca: celula(linha, "marca"),
      codigo_barras: celula(linha, "codigo_barras")?.replace(/\s/g, "") ?? null,
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
 *    duas, nenhum campo de identificação (EAN, marca, categoria...) preenchido, e em pelo menos uma coluna o número é a
 *    soma das linhas de cima. O relatório de produtos da Rein termina assim (a linha 2.273 do arquivo de 10/11). Fica de
 *    fora da importação, com o motivo.
 *  - **candidato:** só números, mas sem soma que confira ou com um campo de identificação preenchido (a linha incompleta
 *    com o EAN e o preço do F18-02). Não some: vai à prévia como está (o banco a marca, pela falta do SKU e do nome), e a
 *    prévia avisa; só sai por decisão de quem envia, registrada (ver o envio da importação).
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
  // A conferência: a coluna em que o número da última linha é a soma das linhas de cima (com os centavos).
  const somaConfere = (coluna: number, valor: number) => {
    let soma = 0;
    for (let i = 0; i < posicao; i += 1) {
      if ((planilha.linhas[i]?.[coluna] ?? "").trim() === "") continue;
      const n = numeroDaCelula(planilha, i, coluna);
      if (n === null) return false;
      soma += n;
    }
    return Math.abs(soma - valor) < 0.005;
  };
  const conferem = numeros.filter((n) => somaConfere(n.coluna, n.valor as number)).length;
  const identidade = CAMPOS_DE_IDENTIDADE.filter((campo) => mapa[campo] !== undefined && (linha[mapa[campo] as number] ?? "").trim() !== "");
  // F21-01: os números do rodapé que vieram escritos fora do padrão do Excel (a vírgula brasileira numa célula de número)
  // foram lidos como estão escritos; o motivo diz quantos, para a prévia não esconder a leitura.
  const escritos = numeros.filter((n) => celulaForaDoPadrao(planilha, posicao, n.coluna)).length;
  const descricao = `sem código e sem nome, só números em ${numeros.length} colunas${escritos > 0
    ? `, ${escritos} ${escritos === 1 ? "delas escrita" : "delas escritas"} com vírgula numa célula de número e ${escritos === 1 ? "lida" : "lidas"} como ${escritos === 1 ? "está" : "estão"}` : ""}`;
  if (conferem > 0 && identidade.length === 0) {
    return { tipo: "comprovado", posicao, motivo: `rodapé de totais no fim da planilha (${descricao}; em ${conferem} delas o número é a soma das linhas de cima)` };
  }
  const porque = identidade.length > 0
    ? `com ${identidade.map((c) => CAMPOS_DO_CATALOGO[c].rotulo.replace(/ \(.*\)$/, "").toLowerCase()).join(", ")} preenchido`
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

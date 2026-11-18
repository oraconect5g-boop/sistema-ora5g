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
      try {
        const c = lerReais(texto);
        if (c > 100_000_000) throw new RangeError("grande");
        return c;
      } catch {
        erros.push(`${campo === "preco" ? "Preço" : "Custo"} inválido: "${texto.slice(0, 30)}"`);
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

/**
 * O rodapé no fim da planilha, que não é produto: mandá-lo ao banco travaria a prévia inteira (linha com erro). Só a
 * ÚLTIMA linha, e só sem SKU e sem nome (ou com "Total" no nome), em dois casos:
 *  - alguma célula começa por "Total" (o rodapé com rótulo);
 *  - as células preenchidas são todas números, pelo menos duas (o rodapé de totais sem rótulo). O relatório de produtos
 *    da Rein termina assim: a linha 2.273 do arquivo de 10/11, que a auditoria do Codex de 17/11 achou entrando como
 *    produto (achado F01). O motivo diz em quantas colunas o número é igual à soma das linhas de cima.
 * A linha do meio sem código continua sendo erro, e a última com algum texto também (pode ser produto com defeito): nada
 * some calado. Devolve a posição e o motivo, ou nulo.
 */
export function rodapeDaPlanilha(planilha: Planilha, mapa: Mapeamento): LinhaDeFora | null {
  const posicao = planilha.linhas.length - 1;
  const linha = planilha.linhas[posicao];
  if (!linha || mapa.sku === undefined || mapa.nome === undefined) return null;
  const sku = (linha[mapa.sku] ?? "").trim();
  const nome = (linha[mapa.nome] ?? "").trim();
  if (sku !== "" || (nome !== "" && !COMECA_COM_TOTAL.test(nome))) return null;
  if (linha.some((celula) => COMECA_COM_TOTAL.test(celula))) return { posicao, motivo: "linha de total no fim da planilha" };
  const preenchidas = linha.map((celula, coluna) => ({ coluna, texto: celula.trim() })).filter((c) => c.texto !== "");
  if (preenchidas.length < 2) return null;
  const numeros = preenchidas.map((c) => ({ coluna: c.coluna, valor: numeroDoRodape(c.texto) }));
  if (numeros.some((n) => n.valor === null)) return null;
  // A conferência que a prévia mostra: a coluna em que o rodapé é a soma das linhas de cima (com os centavos).
  const somaConfere = (coluna: number, valor: number) => {
    let soma = 0;
    for (const l of planilha.linhas.slice(0, posicao)) {
      const texto = (l[coluna] ?? "").trim();
      if (texto === "") continue;
      const n = numeroDoRodape(texto);
      if (n === null) return false;
      soma += n;
    }
    return Math.abs(soma - valor) < 0.005;
  };
  const conferem = numeros.filter((n) => somaConfere(n.coluna, n.valor as number)).length;
  return {
    posicao,
    motivo: `rodapé de totais no fim da planilha (sem código e sem nome, só números em ${numeros.length} colunas${
      conferem > 0 ? `; em ${conferem} delas o número é a soma das linhas de cima` : ""})`,
  };
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

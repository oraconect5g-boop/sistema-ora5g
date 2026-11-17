// O custo dos anúncios por arquivo (lote META-a: ORA-META-001 por arquivo, ORA-META-003, ORA-META-004 e ORA-META-006;
// ADR-017). O relatório exportado do Gerenciador de Anúncios da Meta, com o detalhamento por dia. Nada é suposto do formato
// do arquivo: a pessoa diz qual coluna é cada campo, com sugestão pelo nome da coluna (em português e em inglês, as duas
// línguas do Gerenciador). Aqui só se montam as linhas no formato do banco, que valida tudo de novo (anuncios_importar).
import { semAcento, type Planilha } from "../importacao/csv";
import { lerDataDoExtrato, lerValorDoExtrato } from "../extratos/leitura";

/** O banco aceita até 20.000 linhas por arquivo (por exemplo, 30 dias × 600 anúncios). */
export const LINHAS_DO_ARQUIVO_DE_ANUNCIOS = 20_000;

export const CAMPOS_DOS_ANUNCIOS = {
  dia: {
    rotulo: "Dia", obrigatorio: true,
    sugestoes: ["dia", "day", "data", "date", "inicio dos relatorios", "reporting starts", "inicio do relatorio"],
  },
  fim: {
    rotulo: "Fim do período (para conferir que o arquivo é por dia)", obrigatorio: false,
    sugestoes: ["termino dos relatorios", "reporting ends", "fim dos relatorios", "termino do relatorio"],
  },
  campanha: {
    rotulo: "Nome da campanha", obrigatorio: true,
    sugestoes: ["nome da campanha", "campaign name", "campanha", "campaign"],
  },
  gasto: {
    rotulo: "Valor usado (R$)", obrigatorio: true,
    sugestoes: ["valor usado (brl)", "valor usado", "amount spent (brl)", "amount spent", "gasto", "investimento", "custo", "valor gasto"],
  },
  impressoes: {
    rotulo: "Impressões", obrigatorio: false,
    sugestoes: ["impressoes", "impressions"],
  },
  cliques: {
    rotulo: "Cliques no link", obrigatorio: false,
    sugestoes: ["cliques no link", "link clicks", "cliques", "clicks", "cliques (todos)", "clicks (all)"],
  },
  resultados: {
    rotulo: "Resultados (o que a campanha busca: mensagens, cadastros…)", obrigatorio: false,
    sugestoes: ["resultados", "results", "leads", "conversas por mensagem iniciadas", "messaging conversations started"],
  },
} as const;
export type CampoDosAnuncios = keyof typeof CAMPOS_DOS_ANUNCIOS;
export const NOMES_DOS_CAMPOS_DOS_ANUNCIOS = Object.keys(CAMPOS_DOS_ANUNCIOS) as CampoDosAnuncios[];
export type MapaDosAnuncios = Partial<Record<CampoDosAnuncios, number>>;

/** Sugestão pelo nome da coluna (só ajuda a preencher; quem importa confirma cada campo). */
export function sugerirMapaDosAnuncios(cabecalho: readonly string[]): MapaDosAnuncios {
  const usados = new Set<number>();
  const mapa: MapaDosAnuncios = {};
  for (const campo of NOMES_DOS_CAMPOS_DOS_ANUNCIOS) {
    const sugestoes = CAMPOS_DOS_ANUNCIOS[campo].sugestoes as readonly string[];
    // A ordem das sugestões vale: "dia" antes de "início dos relatórios", "cliques no link" antes de "cliques".
    for (const sugestao of sugestoes) {
      const indice = cabecalho.findIndex((c, i) => !usados.has(i) && semAcento(c) === sugestao);
      if (indice >= 0) {
        mapa[campo] = indice;
        usados.add(indice);
        break;
      }
    }
  }
  return mapa;
}

/** Mapeamento lido do formulário: cada campo aponta uma coluna existente, sem repetir; dia, campanha e gasto obrigatórios. */
export function lerMapaDosAnuncios(campo: (nome: string) => unknown, colunas: number): MapaDosAnuncios | null {
  const mapa: MapaDosAnuncios = {};
  const usados = new Set<number>();
  for (const nome of NOMES_DOS_CAMPOS_DOS_ANUNCIOS) {
    const valor = campo(`coluna_${nome}`);
    if (valor === null || valor === undefined || valor === "") continue;
    if (typeof valor !== "string" || !/^\d{1,3}$/.test(valor)) return null;
    const indice = Number(valor);
    if (indice >= colunas || usados.has(indice)) return null;
    usados.add(indice);
    mapa[nome] = indice;
  }
  return mapa.dia === undefined || mapa.campanha === undefined || mapa.gasto === undefined ? null : mapa;
}

export const mapaDosAnunciosParaGravar = (cabecalho: readonly string[], mapa: MapaDosAnuncios) =>
  ({ colunas: Object.fromEntries(NOMES_DOS_CAMPOS_DOS_ANUNCIOS.filter((c) => mapa[c] !== undefined).map((c) => [c, cabecalho[mapa[c] as number] ?? ""])) });

/** Uma contagem (impressões, cliques, resultados): o número inteiro, com ou sem separador de milhar. */
export function lerContagem(texto: string): number {
  const t = texto.trim().replace(/[  ]/g, " ");
  let n: number;
  if (/^\d+$/.test(t)) n = Number(t);
  else if (/^\d{1,3}([., ]\d{3})+$/.test(t)) n = Number(t.replace(/[., ]/g, ""));
  else if (/^\d+\.0+$/.test(t)) n = Number(t.split(".")[0]);
  else throw new RangeError("contagem");
  if (!Number.isSafeInteger(n) || n > 1_000_000_000_000) throw new RangeError("contagem");
  return n;
}

export type LinhaDosAnuncios = { numero: number; dia: string; campanha: string; gasto: number; impressoes?: number; cliques?: number; resultados?: number };
export type ProblemaDosAnuncios = { numero: number; campo: CampoDosAnuncios | "por_dia"; texto: string };
export type LinhasDosAnuncios = { linhas: LinhaDosAnuncios[]; deFora: number; problemas: ProblemaDosAnuncios[] };

const espacos = (t: string) => t.replace(/\s+/g, " ").trim();
/** A linha de total do Gerenciador (sem campanha, ou "Total"/"Resultados gerais") fica de fora. */
const ehTotal = (campanha: string) => campanha === "" || /^(total|resultados gerais|overall results)\b/.test(semAcento(campanha));

/**
 * Monta as linhas do arquivo de custo. Ficam de fora, contadas, a linha de total e a linha sem dia. A que não deu para
 * ler volta em `problemas`, com a linha do arquivo e o campo; a linha cujo fim do período não é o mesmo dia também (o
 * arquivo precisa vir com o detalhamento por dia: um gasto de um mês inteiro não pode cair num dia só).
 */
export function montarLinhasDosAnuncios(planilha: Planilha, mapa: MapaDosAnuncios): LinhasDosAnuncios {
  const linhas: LinhaDosAnuncios[] = [];
  const problemas: ProblemaDosAnuncios[] = [];
  let deFora = 0;
  planilha.linhas.forEach((celulas, i) => {
    const numero = planilha.numeros[i] ?? i + 2;
    const celula = (campo: CampoDosAnuncios) => {
      const indice = mapa[campo];
      return indice === undefined ? "" : espacos(celulas[indice] ?? "");
    };
    const campanha = celula("campanha");
    const diaTexto = celula("dia");
    if (ehTotal(campanha) || diaTexto === "") {
      deFora += 1;
      return;
    }
    const antes = problemas.length;
    const ler = <T>(campo: CampoDosAnuncios, texto: string, leitor: (t: string) => T): T | undefined => {
      try {
        return leitor(texto);
      } catch {
        problemas.push({ numero, campo, texto: texto.slice(0, 40) });
        return undefined;
      }
    };
    const dia = ler("dia", diaTexto, (t) => lerDataDoExtrato(t, planilha.formato));
    const fimTexto = celula("fim");
    if (dia !== undefined && fimTexto !== "") {
      const fim = ler("fim", fimTexto, (t) => lerDataDoExtrato(t, planilha.formato));
      if (fim !== undefined && fim !== dia) problemas.push({ numero, campo: "por_dia", texto: `${diaTexto} a ${fimTexto}`.slice(0, 40) });
    }
    if (campanha.length > 200) problemas.push({ numero, campo: "campanha", texto: campanha.slice(0, 40) });
    const gastoTexto = celula("gasto");
    const gasto = gastoTexto === "" ? 0 : ler("gasto", gastoTexto, (t) => {
      const c = lerValorDoExtrato(t, planilha.formato);
      if (c < 0) throw new RangeError("negativo");
      return c;
    });
    const contagem = (campo: "impressoes" | "cliques" | "resultados") => {
      const texto = celula(campo);
      return texto === "" ? undefined : ler(campo, texto, lerContagem);
    };
    const impressoes = contagem("impressoes");
    const cliques = contagem("cliques");
    const resultados = contagem("resultados");
    if (problemas.length > antes || dia === undefined || gasto === undefined) return;
    const linha: LinhaDosAnuncios = { numero, dia, campanha, gasto };
    if (impressoes !== undefined) linha.impressoes = impressoes;
    if (cliques !== undefined) linha.cliques = cliques;
    if (resultados !== undefined) linha.resultados = resultados;
    linhas.push(linha);
  });
  return { linhas, deFora, problemas };
}

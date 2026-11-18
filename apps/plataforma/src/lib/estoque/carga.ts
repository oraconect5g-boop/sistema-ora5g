// O estoque inicial de cada loja pelo relatório de produtos da Rein (lote REIN-b; ADR-021; auditoria do Codex de 17/11,
// "Primeiro lote"). O relatório traz, por produto, a quantidade de cada local, com o físico e o disponível em colunas
// separadas. Nada do formato da Rein é suposto: a pessoa confirma a coluna do código do produto e, de cada loja, a coluna
// do físico e a do disponível; a sugestão vem do nome da loja no cabeçalho. Aqui só se montam as linhas de cada loja no
// formato do banco (public.estoque_carga_previa), que classifica e confere tudo de novo.
import { numeroDoRodape, rodapeDaPlanilha, sugerirMapeamento, type LinhaDeFora } from "../importacao/catalogo";
import { semAcento, type Planilha } from "../importacao/csv";

/** O banco aceita até 3.000 linhas por loja numa carga (o relatório de 10/11 tem 2.271 produtos). */
export const LINHAS_POR_LOJA = 3_000;

export type LojaDaCarga = { id: string; nome: string };
/** As colunas de uma loja: o físico (obrigatório) e o disponível (opcional), pelo índice da coluna. */
export type ColunasDaLoja = { fisico: number; disponivel?: number };
export type MapaDaCarga = { sku: number; nome?: number; lojas: Record<string, ColunasDaLoja> };
export type LinhaDaCarga = { numero: number; sku: string; fisico: number | null; disponivel: number | null; problema?: string };

const PALAVRAS_DO_DISPONIVEL = /\b(disponivel|disp)\b/;
const PALAVRAS_DE_QUANTIDADE = /\b(qtd|qtde|quant|quantidade|estoque|saldo|fisico)\b/;

/**
 * A sugestão das colunas: o código e o nome do produto pela regra da importação do catálogo; e, de cada loja, as colunas
 * cujo nome traz o nome da loja inteiro (sem acento e sem diferença de maiúsculas): a que fala em "disponível" é o
 * disponível; a outra (quantidade, estoque ou só o nome da loja), o físico. Na dúvida (duas colunas candidatas ao mesmo
 * papel), não sugere: a pessoa escolhe.
 */
export function sugerirMapaDaCarga(cabecalho: readonly string[], lojas: readonly LojaDaCarga[]): { sku?: number; nome?: number; lojas: Record<string, Partial<ColunasDaLoja>> } {
  const base = sugerirMapeamento(cabecalho);
  const limpo = (t: string) => semAcento(t).replace(/[^a-z0-9]+/g, " ").trim();
  const normal = cabecalho.map((c) => ` ${limpo(c)} `);
  const nomes = lojas.map((l) => ({ id: l.id, nome: limpo(l.nome) })).filter((l) => l.nome.length >= 3);
  // Cada coluna fica com a loja de nome mais longo que ela traz: "Santa Cândida (teste) Qtd." é da loja de teste, não da
  // "Santa Cândida". Empate entre lojas diferentes: a coluna não é sugerida.
  const donoDaColuna = normal.map((c) => {
    const casam = nomes.filter((l) => c.includes(` ${l.nome} `));
    const maior = Math.max(0, ...casam.map((l) => l.nome.length));
    const melhores = casam.filter((l) => l.nome.length === maior);
    return melhores.length === 1 ? melhores[0]?.id : undefined;
  });
  const sugestao: Record<string, Partial<ColunasDaLoja>> = {};
  for (const loja of nomes) {
    const nome = loja.nome;
    const daLoja = normal.map((c, i) => ({ c, i })).filter(({ i }) => donoDaColuna[i] === loja.id);
    const disponiveis = daLoja.filter(({ c }) => PALAVRAS_DO_DISPONIVEL.test(c));
    const fisicos = daLoja.filter(({ c }) => !PALAVRAS_DO_DISPONIVEL.test(c) && (PALAVRAS_DE_QUANTIDADE.test(c) || c.trim() === nome));
    const colunas: Partial<ColunasDaLoja> = {};
    if (fisicos.length === 1) colunas.fisico = fisicos[0]?.i;
    if (disponiveis.length === 1) colunas.disponivel = disponiveis[0]?.i;
    if (colunas.fisico !== undefined || colunas.disponivel !== undefined) sugestao[loja.id] = colunas;
  }
  return { ...(base.sku !== undefined ? { sku: base.sku } : {}), ...(base.nome !== undefined ? { nome: base.nome } : {}), lojas: sugestao };
}

/**
 * O mapeamento lido do formulário: a coluna do código (obrigatória), a do nome (opcional, ajuda a achar o rodapé) e, de
 * cada loja conhecida, o físico e o disponível. Coluna que não existe, a mesma coluna em dois papéis e o disponível sem o
 * físico são recusados; sem nenhuma loja, também.
 */
export function lerMapaDaCarga(campo: (nome: string) => unknown, colunas: number, lojas: readonly LojaDaCarga[]): MapaDaCarga | null {
  const usados = new Set<number>();
  const ler = (nome: string): number | null | undefined => {
    const valor = campo(nome);
    if (valor === null || valor === undefined || valor === "") return undefined;
    if (typeof valor !== "string" || !/^\d{1,3}$/.test(valor)) return null;
    const indice = Number(valor);
    if (indice >= colunas || usados.has(indice)) return null;
    usados.add(indice);
    return indice;
  };
  const sku = ler("coluna_sku");
  if (sku === undefined || sku === null) return null;
  const nome = ler("coluna_nome");
  if (nome === null) return null;
  const mapa: MapaDaCarga = { sku, ...(nome !== undefined ? { nome } : {}), lojas: {} };
  for (const loja of lojas) {
    const fisico = ler(`fisico_${loja.id}`);
    const disponivel = ler(`disponivel_${loja.id}`);
    if (fisico === null || disponivel === null) return null;
    if (fisico === undefined) {
      if (disponivel !== undefined) return null;
      continue;
    }
    mapa.lojas[loja.id] = { fisico, ...(disponivel !== undefined ? { disponivel } : {}) };
  }
  return Object.keys(mapa.lojas).length > 0 ? mapa : null;
}

/** O que a carga grava do mapeamento: o nome de cada coluna escolhida (para conferir depois). */
export function mapaDaCargaParaGravar(cabecalho: readonly string[], mapa: MapaDaCarga, unidade: string): { [chave: string]: string } {
  const loja = mapa.lojas[unidade];
  const nome = (i: number | undefined) => (i === undefined ? "" : (cabecalho[i] ?? ""));
  return {
    sku: nome(mapa.sku),
    ...(mapa.nome !== undefined ? { nome: nome(mapa.nome) } : {}),
    fisico: nome(loja?.fisico),
    ...(loja?.disponivel !== undefined ? { disponivel: nome(loja.disponivel) } : {}),
  };
}

/** A quantidade de uma célula: número inteiro (com separador de milhar, o "12.0" do Excel); vazio é nulo. */
export function quantidadeDaCelula(texto: string): { valor: number | null } | { problema: string } {
  const t = texto.trim();
  if (t === "") return { valor: null };
  const n = numeroDoRodape(t);
  if (n === null || !Number.isInteger(n) || Math.abs(n) > 9_999_999) return { problema: `Quantidade que não é número inteiro: "${t.slice(0, 30)}"` };
  return { valor: n };
}

/**
 * As linhas de cada loja. O rodapé de totais no fim fica de fora (a regra da importação do catálogo, achado F01); a
 * linha em que a loja tem o físico e o disponível vazios ou zero não vai (nada a fazer naquela loja). A quantidade que
 * não é número inteiro vai com o problema escrito, para a prévia mostrar.
 */
export function linhasDaCarga(planilha: Planilha, mapa: MapaDaCarga): { porLoja: Record<string, LinhaDaCarga[]>; deFora: LinhaDeFora | null } {
  const deFora = rodapeDaPlanilha(planilha, { sku: mapa.sku, nome: mapa.nome ?? mapa.sku });
  const porLoja: Record<string, LinhaDaCarga[]> = Object.fromEntries(Object.keys(mapa.lojas).map((id) => [id, [] as LinhaDaCarga[]]));
  planilha.linhas.forEach((celulas, i) => {
    if (deFora !== null && i === deFora.posicao) return;
    const numero = planilha.numeros[i] ?? i + 2;
    const sku = (celulas[mapa.sku] ?? "").trim().replace(/\s+/g, " ");
    for (const [loja, colunas] of Object.entries(mapa.lojas)) {
      const fisico = quantidadeDaCelula(celulas[colunas.fisico] ?? "");
      const disponivel = colunas.disponivel === undefined ? { valor: null } : quantidadeDaCelula(celulas[colunas.disponivel] ?? "");
      const valorF = "valor" in fisico ? fisico.valor : null;
      const valorD = "valor" in disponivel ? disponivel.valor : null;
      const problema = "problema" in fisico ? fisico.problema : "problema" in disponivel ? disponivel.problema : undefined;
      if (problema === undefined && (valorF ?? 0) === 0 && (valorD ?? 0) === 0) continue;
      porLoja[loja]?.push({ numero, sku: sku.slice(0, 60), fisico: valorF, disponivel: valorD, ...(problema ? { problema } : {}) });
    }
  });
  return { porLoja, deFora };
}

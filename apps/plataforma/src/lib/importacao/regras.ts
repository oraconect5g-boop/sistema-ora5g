// Regras da tela de importação (lotes L3c e R2: ORA-CAT-002, ORA-CAT-010): mensagens, leitura do
// formulário de envio, filtro e página da conferência e erro do banco → chave do catálogo (a tela nunca repete
// o texto do banco).
import { CAMPOS_DO_CATALOGO, NOMES_DOS_CAMPOS, TIPOS_ACEITOS, lerMapeamento, type Mapeamento, type PadroesDaImportacao, type TipoAceito } from "./catalogo";
import { semAcento, type FalhaDaPlanilha } from "./csv";

export const ERROS_DA_IMPORTACAO = {
  arquivo: "Escolha a planilha: um arquivo do Excel (.xlsx) ou CSV.",
  vazio: "O arquivo está vazio (no Excel, os itens precisam estar na primeira aba).",
  grande: "Arquivo grande demais: até 5 MB por envio. Divida a planilha em partes.",
  linhas: "Arquivo com mais de 10.000 linhas: divida a planilha em arquivos menores.",
  colunas: "Arquivo com mais de 100 colunas: tire as colunas que não serão usadas.",
  celula: "Alguma célula passa de 10.000 caracteres: confira o arquivo.",
  aspas: "Há aspas abertas sem fechar no arquivo: confira e salve de novo como CSV.",
  cabecalho: "A primeira linha preenchida precisa ter o nome de cada coluna, sem repetir e sem coluna em branco.",
  xlsx: "Não deu para ler esta planilha do Excel: abra no Excel, salve de novo como .xlsx (ou como CSV) e envie outra vez.",
  xls: "Planilha do Excel antiga (.xls) ou protegida por senha: no Excel, tire a senha e salve como .xlsx ou CSV.",
  navegador: "Este navegador não abre planilha do Excel: atualize o navegador ou salve a planilha como CSV.",
  mapeamento: "Diga qual coluna é o SKU e qual é o nome (cada coluna só pode ser usada uma vez).",
  padrao: "Escolha o tipo e a categoria para as linhas que não trouxerem esses dados.",
  tipos: "Não deu para ler o tipo de cada categoria. Escolha o arquivo de novo e confira os tipos.",
  ja_aplicado: "Este arquivo já foi aplicado antes. Para mudar algo, gere um arquivo novo.",
  mesma_pessoa: "Quem gerou a prévia não aprova: outra pessoa (com permissão de aprovar) confere e aplica.",
  com_erro: "A prévia tem linhas com erro: corrija a planilha e gere outra prévia.",
  agendado: "Uma das variações tem mudança de preço agendada: cancele o agendamento e tente de novo.",
  encerrada: "Esta importação já foi encerrada.",
  situacao: "Esta importação mudou de situação e a ação não vale mais. Veja abaixo como ela está agora.",
  instante: "O cadastro mudou no mesmo instante: tente de novo. A prévia é comparada outra vez antes de qualquer mudança.",
  desatualizada: "O cadastro mudou depois da conferência e nada foi aplicado. A prévia abaixo já está comparada de novo: confira e aplique outra vez.",
  conferencia: "Não deu para saber qual comparação foi conferida e nada foi aplicado. Confira a prévia abaixo e aplique outra vez.",
  nomes: "A planilha traz categorias e marcas diferentes demais para uma importação só. Divida a planilha em partes e gere uma prévia para cada uma.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  permissao: "Sem permissão para esta importação.",
  dados: "Dados inválidos: gere a prévia de novo.",
  falha: "Não deu para concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDaImportacao = keyof typeof ERROS_DA_IMPORTACAO;

export function erroDoBancoNaImportacao(erro: { code?: string; message?: string } | null | undefined): ErroDaImportacao {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "OR023") return "ja_aplicado";
  if (codigo === "OR024") return "mesma_pessoa";
  if (codigo === "OR022") return "agendado";
  // O cadastro mudou enquanto a chamada rodava: preço ou linha conferida que mudou (40001), impasse entre duas
  // gravações (40P01) ou SKU, nome ou código de barras que nasceu no meio (23505). Nada foi gravado; a nova
  // tentativa compara a prévia outra vez e devolve para a conferência o que tiver mudado.
  if (codigo === "40001" || codigo === "40P01" || codigo === "23505") return "instante";
  if (codigo === "42501" || codigo === "P0002") return "permissao";
  if (codigo === "22023") {
    if (m.includes("informe o motivo")) return "motivo";
    if (m.includes("linhas com erro")) return "com_erro";
    if (m.includes("comparação conferida")) return "conferencia";
    if (m.includes("encerrada")) return "encerrada";
    // "Só se desfaz importação aplicada" e "Só se descarta prévia": outra pessoa agiu antes; a tela recarregada mostra.
    if (m.includes("só se")) return "situacao";
    if (m.includes("divida a planilha")) return "nomes";
    if (m.includes("2.000")) return "linhas";
    return "dados";
  }
  return "falha";
}

/** Cada recusa da leitura da planilha (CSV ou Excel) tem a sua mensagem no catálogo. */
export const erroDaPlanilhaNaImportacao = (motivo: FalhaDaPlanilha): ErroDaImportacao => motivo;

export type Envio = { arquivo: File; mapa: Mapeamento; padroes: PadroesDaImportacao };

/** Até quantas categorias podem ter o tipo escolhido num envio (o relatório da Rein de 10/11 tem 28 famílias). */
export const MAXIMO_DE_TIPOS_POR_CATEGORIA = 200;

/**
 * REIN-d: o tipo de cada categoria, como a tela manda (o campo `tipos_por_categoria`, um objeto JSON "categoria" → tipo).
 * Vazio ou ausente: nenhum. Nulo: o campo veio em formato que não se entende (nada é adivinhado). A categoria com o tipo
 * igual ao padrão não precisa ficar; duas escritas da mesma categoria (acento, maiúsculas) com tipos diferentes são recusadas.
 */
export function lerTiposPorCategoria(campo: unknown, padrao: TipoAceito): Record<string, TipoAceito> | null {
  if (campo === null || campo === undefined || campo === "") return {};
  if (typeof campo !== "string" || campo.length > 40_000) return null;
  let lido: unknown;
  try {
    lido = JSON.parse(campo);
  } catch {
    return null;
  }
  if (typeof lido !== "object" || lido === null || Array.isArray(lido)) return null;
  const entradas = Object.entries(lido as Record<string, unknown>);
  if (entradas.length > MAXIMO_DE_TIPOS_POR_CATEGORIA) return null;
  const porChave = new Map<string, { nome: string; tipo: TipoAceito }>();
  for (const [bruto, tipo] of entradas) {
    const nome = bruto.trim().replace(/\s+/g, " ");
    if (nome.length < 1 || nome.length > 120 || typeof tipo !== "string" || !(TIPOS_ACEITOS as readonly string[]).includes(tipo)) return null;
    const chave = semAcento(nome);
    const anterior = porChave.get(chave);
    if (anterior && anterior.tipo !== tipo) return null;
    if (!anterior) porChave.set(chave, { nome, tipo: tipo as TipoAceito });
  }
  // Em ordem, para o mesmo conjunto de escolhas gravar sempre o mesmo mapeamento (a prévia repetida é reconhecida por ele).
  return Object.fromEntries([...porChave.values()].filter((c) => c.tipo !== padrao).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((c) => [c.nome, c.tipo]));
}

/** Formulário de envio: o arquivo, a coluna de cada campo, os padrões (tipo e categoria) e o tipo de cada categoria. */
export function lerEnvio(dados: FormData, colunas: number): { ok: true; envio: Omit<Envio, "arquivo"> } | { ok: false; erro: ErroDaImportacao } {
  const mapa = lerMapeamento((n) => dados.get(n), colunas);
  if (!mapa) return { ok: false, erro: "mapeamento" };
  const tipo = dados.get("tipo_padrao");
  const categoria = typeof dados.get("categoria_padrao") === "string" ? (dados.get("categoria_padrao") as string).trim().replace(/\s+/g, " ") : "";
  if (typeof tipo !== "string" || !(TIPOS_ACEITOS as readonly string[]).includes(tipo) || categoria.length < 1 || categoria.length > 60) {
    return { ok: false, erro: "padrao" };
  }
  // O tipo por categoria só vale com a coluna da categoria escolhida: sem ela, não há categoria para olhar.
  const tipos = mapa.categoria === undefined ? {} : lerTiposPorCategoria(dados.get("tipos_por_categoria"), tipo as TipoAceito);
  if (tipos === null) return { ok: false, erro: "tipos" };
  return { ok: true, envio: { mapa, padroes: { tipo: tipo as TipoAceito, categoria, ...(Object.keys(tipos).length > 0 ? { tiposPorCategoria: tipos } : {}) } } };
}

/**
 * O que fica gravado do mapeamento: o nome da coluna de cada campo, os padrões e, se houver, o tipo de cada categoria
 * (auditoria e repetição: o mesmo arquivo com outra escolha de tipos é outra prévia).
 */
export function mapeamentoParaGravar(cabecalho: readonly string[], mapa: Mapeamento, padroes: Envio["padroes"]) {
  const colunas = Object.fromEntries(NOMES_DOS_CAMPOS.filter((c) => mapa[c] !== undefined).map((c) => [c, cabecalho[mapa[c] as number]]));
  const tipos = padroes.tiposPorCategoria ?? {};
  return { colunas, padroes: { tipo: padroes.tipo, categoria: padroes.categoria }, ...(Object.keys(tipos).length > 0 ? { tipos_por_categoria: { ...tipos } } : {}) };
}

export const ROTULO_DOS_CAMPOS = Object.fromEntries(NOMES_DOS_CAMPOS.map((c) => [c, CAMPOS_DO_CATALOGO[c].rotulo])) as Record<keyof typeof CAMPOS_DO_CATALOGO, string>;
// Object.hasOwn: nome que só existe por herança do objeto ("constructor", "toString") não vira rótulo nem motivo.
const proprio = (mapa: Record<string, string>, chave: string) => (Object.hasOwn(mapa, chave) ? mapa[chave] : undefined);
/** Rótulo do campo para a tela; nome desconhecido aparece como veio do banco. */
export const rotuloDoCampo = (campo: string): string => proprio(ROTULO_DOS_CAMPOS, campo) ?? campo;

// Conferência da prévia (R2: REV-NOV-008, ORA-CAT-002). A tela lê as linhas por página, com filtro por ação: o arquivo
// inteiro pode ser conferido, e não só as primeiras linhas.
export const LINHAS_POR_PAGINA = 100;
export const FILTROS_DA_CONFERENCIA = {
  mudancas: "Com mudança ou erro",
  criar: "Novos",
  atualizar: "Mudam",
  sem_mudanca: "Iguais",
  erro: "Com erro",
  todas: "Todas",
} as const;
export type FiltroDaConferencia = keyof typeof FILTROS_DA_CONFERENCIA;

/** Quantas linhas o filtro mostra, pelos totais gravados junto com a comparação. */
export function linhasDoFiltro(totais: Record<string, unknown> | null | undefined, filtro: FiltroDaConferencia): number {
  const n = (chave: string) => {
    const v = Number(totais?.[chave] ?? 0);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  };
  if (filtro === "todas") return n("linhas");
  if (filtro === "mudancas") return n("criar") + n("atualizar") + n("erro");
  return n(filtro);
}

/** A página pedida no endereço, presa ao que existe: da primeira à última do filtro. */
export function paginaDaConferencia(pedida: unknown, linhas: number): { pagina: number; paginas: number; de: number } {
  const paginas = Math.max(1, Math.ceil(linhas / LINHAS_POR_PAGINA));
  const n = typeof pedida === "string" && /^\d{1,6}$/.test(pedida) ? Number(pedida) : 1;
  const pagina = Math.min(Math.max(n, 1), paginas);
  return { pagina, paginas, de: (pagina - 1) * LINHAS_POR_PAGINA };
}

// O que o desfazer deixou como estava, e por quê (o banco grava o motivo por campo em importacao_linhas.desfeito).
const MOTIVOS_DO_QUE_FICOU: Record<string, string> = {
  em_uso: "já foi usada (estoque, reserva, venda ou IMEI)",
  alterada_depois: "foi alterada depois da importação",
  alterado_depois: "mudou depois da importação",
  codigo_em_uso: "o código de antes já está em outra variação",
  sem_custo_anterior: "não havia custo antes da importação",
  sem_identidade: "importação antiga, sem registro do que ela gravou",
};
export type Desfeito = { situacao?: unknown; revertidos?: unknown; mantidos?: unknown };
/** Resultado do desfazer de uma linha, em texto: o que voltou e o que ficou, com o motivo. */
export function resumoDoDesfeito(desfeito: Desfeito | null | undefined): { situacao: "desfeita" | "parcial" | "mantida"; voltou: string[]; ficou: string[] } | null {
  if (!desfeito || typeof desfeito !== "object") return null;
  const situacao = desfeito.situacao === "desfeita" || desfeito.situacao === "parcial" || desfeito.situacao === "mantida" ? desfeito.situacao : null;
  if (!situacao) return null;
  const rotulo = (c: string) => (c === "variacao" ? "a variação" : rotuloDoCampo(c));
  const voltou = Array.isArray(desfeito.revertidos) ? desfeito.revertidos.filter((c): c is string => typeof c === "string").map((c) => (c === "variacao" ? "a variação saiu de circulação" : rotulo(c))) : [];
  const mantidos = desfeito.mantidos && typeof desfeito.mantidos === "object" && !Array.isArray(desfeito.mantidos) ? Object.entries(desfeito.mantidos as Record<string, unknown>) : [];
  const ficou = mantidos.map(([c, motivo]) => `${rotulo(c)}: ${proprio(MOTIVOS_DO_QUE_FICOU, String(motivo)) ?? "foi mantido"}`);
  return { situacao, voltou, ficou };
}

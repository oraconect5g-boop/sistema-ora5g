// Regras das telas dos extratos (lote EXT-a: ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; ADR-016): as mensagens, a leitura
// do formulário de envio e o erro do banco → chave do catálogo (a tela nunca repete o texto do banco). O banco decide de
// novo; aqui só se evita ir até ele com o que já se sabe errado.
import { MEIOS } from "@ora5g/dominio";

import type { FalhaDaPlanilha } from "../importacao/csv";
import { CAMPOS_DO_EXTRATO, type CampoDoExtrato } from "./leitura";

/** Os meios que se conciliam com o extrato (os mesmos de privado.meio_liquidavel). */
export const MEIOS_DO_EXTRATO = ["pix_picpay", "cartao_picpay", "cartao_pagseguro", "pix_direto"] as const;
export type MeioDoExtrato = (typeof MEIOS_DO_EXTRATO)[number];
export const NOME_DO_MEIO: Record<MeioDoExtrato, string> = Object.fromEntries(MEIOS_DO_EXTRATO.map((m) => [m, MEIOS[m].nome])) as Record<MeioDoExtrato, string>;

export const TIPOS_DE_EXTRATO = { maquininha: "Da maquininha (PicPay, PagBank)", banco: "Do banco (conta da loja ou da rede)" } as const;
export type TipoDeExtrato = keyof typeof TIPOS_DE_EXTRATO;

export const ERROS_DOS_EXTRATOS = {
  arquivo: "Escolha o arquivo do extrato: CSV, Excel (.xlsx) ou OFX do banco.",
  vazio: "O arquivo está vazio (no Excel, os lançamentos precisam estar na primeira aba).",
  grande: "Arquivo grande demais: até 5 MB por envio. Baixe o extrato de um período menor.",
  linhas: "O extrato leva até 5.000 lançamentos: baixe o extrato de um período menor.",
  colunas: "Arquivo com mais de 100 colunas: tire as colunas que não serão usadas.",
  celula: "Alguma célula passa de 10.000 caracteres: confira o arquivo.",
  aspas: "Há aspas abertas sem fechar no arquivo: confira e salve de novo como CSV.",
  cabecalho: "A primeira linha preenchida precisa ter o nome de cada coluna, sem repetir e sem coluna em branco.",
  xlsx: "Não deu para ler esta planilha do Excel: abra no Excel, salve de novo como .xlsx (ou como CSV) e envie outra vez.",
  xls: "Planilha do Excel antiga (.xls) ou protegida por senha: no Excel, tire a senha e salve como .xlsx ou CSV.",
  navegador: "Este navegador não abre planilha do Excel: atualize o navegador ou salve a planilha como CSV.",
  ofx: "Este arquivo OFX não tem lançamentos. Baixe de novo o extrato no site do banco.",
  mapeamento: "Diga qual coluna é a data e qual é o valor (cada coluna só pode ser usada uma vez).",
  tipo: "Escolha se o extrato é da maquininha ou do banco.",
  fonte: "Diga de onde é o extrato (de 2 a 80 letras), por exemplo \"PicPay da Santa Cândida\".",
  meios: "Marque os meios de pagamento que o extrato traz: Pix ou cartão.",
  onde: "Escolha se o extrato é da loja do turno ou da rede.",
  nenhuma: "Nenhum lançamento com data e valor no arquivo. Confira as colunas escolhidas.",
  linha: "Há lançamento que não deu para ler. Confira a coluna escolhida e o arquivo.",
  outro_lugar: "Este arquivo já foi importado em outra loja ou na rede.",
  rede: "Só quem concilia pela rede inteira importa o extrato da rede.",
  decidida: "Esta linha do extrato já foi decidida: desfaça antes.",
  de_repasse: "Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes, em Repasses dos marketplaces.",
  valor: "O valor da linha não é o do pagamento.",
  meio: "Este pagamento não é de um meio deste extrato.",
  outra_linha: "Este pagamento já está conciliado com outra linha de extrato.",
  futuro: "O dinheiro desta linha ainda não caiu: concilie no dia do repasse.",
  liquido: "O líquido da linha passa do valor do pagamento: confira a taxa e o líquido no arquivo.",
  ja_conciliado: "Este pagamento já foi conciliado à mão, com outros dados: desfaça na Conciliação antes.",
  instante: "Outra pessoa mexeu neste extrato no mesmo instante: veja como ficou e tente de novo.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  permissao: "Sem permissão para conciliar pagamentos aqui.",
  nao_encontrado: "Extrato não encontrado (ou não é de uma loja sua).",
  dados: "Dados inválidos: confira e tente de novo.",
  falha: "Não deu para concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDosExtratos = keyof typeof ERROS_DOS_EXTRATOS;

/** Cada recusa da leitura da planilha (CSV ou Excel) tem a sua mensagem no catálogo. */
export const erroDaPlanilhaNoExtrato = (motivo: FalhaDaPlanilha): ErroDosExtratos => motivo;

export function erroDosExtratos(erro: { code?: string; message?: string } | null | undefined): ErroDosExtratos {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501" || codigo === "P0002") return "permissao";
  if (codigo === "OR030") return "ja_conciliado";
  // AUD-c (F21-02): a linha do extrato tem um uso só; a de um repasse não concilia venda, não sai da conta nem se desfaz por aqui.
  if (codigo === "OR046") return "de_repasse";
  if (codigo === "23505" || codigo === "40001" || codigo === "40P01") return "instante";
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDosExtratos][] = [
    ["outro lugar", "outro_lugar"], ["já foi decidida", "decidida"], ["desfaça antes", "decidida"], ["valor da linha", "valor"],
    ["meio deste extrato", "meio"], ["outra linha", "outra_linha"], ["ainda não caiu", "futuro"], ["valor líquido", "liquido"],
    ["informe o motivo", "motivo"], ["escolha os meios", "meios"], ["5.000", "linhas"],
  ];
  return regras.find(([t]) => m.includes(t))?.[1] ?? "dados";
}

// O nome de cada campo na frase do problema, com a dica do que se espera dele.
const NA_FRASE: Record<CampoDoExtrato, string> = {
  data: "a data (dia/mês/ano)", valor: "o valor (em reais)", natureza: "o crédito ou débito (C ou D)", taxa: "a taxa (em reais, sem %)",
  liquido: "o valor líquido (em reais)", data_liquidacao: "a data do repasse (dia/mês/ano)", referencia: "a referência (até 80 letras)",
  terminal: "a maquininha (até 40 letras)", descricao: "a descrição",
};

/** A linha que não deu para ler, em texto para a tela: Linha 12 do arquivo: não deu para ler a data (dia/mês/ano) "32/13/2026". */
export function textoDoProblema(linha: unknown, campo: unknown, texto: unknown): string | null {
  if (typeof linha !== "string" || !/^\d{1,6}$/.test(linha) || typeof campo !== "string" || !Object.hasOwn(CAMPOS_DO_EXTRATO, campo)) return null;
  const lido = typeof texto === "string" ? texto.slice(0, 40) : "";
  return `Linha ${linha} do arquivo: não deu para ler ${NA_FRASE[campo as CampoDoExtrato]}${lido === "" ? "" : ` "${lido}"`}. Confira a coluna escolhida e o arquivo.`;
}

type Formulario = { get: (nome: string) => unknown; getAll: (nome: string) => unknown[] };
const texto = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export type EnvioDoExtrato = { onde: "loja" | "rede"; tipo: TipoDeExtrato; fonte: string; meios: MeioDoExtrato[] };
/** O formulário de envio, além do arquivo e das colunas: onde (loja do turno ou rede), o tipo, a fonte e os meios. */
export function lerEnvioDoExtrato(dados: Formulario): { ok: true; envio: EnvioDoExtrato } | { ok: false; erro: ErroDosExtratos } {
  const onde = texto(dados.get("onde"));
  if (onde !== "loja" && onde !== "rede") return { ok: false, erro: "onde" };
  const tipo = texto(dados.get("tipo"));
  if (!Object.hasOwn(TIPOS_DE_EXTRATO, tipo)) return { ok: false, erro: "tipo" };
  const fonte = texto(dados.get("fonte"));
  if (fonte.length < 2 || fonte.length > 80) return { ok: false, erro: "fonte" };
  const meios = [...new Set(dados.getAll("meios").map(texto))];
  if (meios.length === 0 || !meios.every((m) => (MEIOS_DO_EXTRATO as readonly string[]).includes(m))) return { ok: false, erro: "meios" };
  return { ok: true, envio: { onde, tipo: tipo as TipoDeExtrato, fonte, meios: meios as MeioDoExtrato[] } };
}

// A tela do extrato: as linhas por situação e por página.
export const LINHAS_POR_PAGINA_DO_EXTRATO = 100;
export const FILTROS_DO_EXTRATO = { pendente: "Pendentes", conciliada: "Conciliadas", repasse: "De repasse", ignorada: "Fora da conta", todas: "Todas" } as const;
export type FiltroDoExtrato = keyof typeof FILTROS_DO_EXTRATO;
export const filtroDoExtrato = (pedido: unknown): FiltroDoExtrato =>
  typeof pedido === "string" && Object.hasOwn(FILTROS_DO_EXTRATO, pedido) ? (pedido as FiltroDoExtrato) : "pendente";

/** A página pedida no endereço, presa ao que existe: da primeira à última do filtro. */
export function paginaDoExtrato(pedida: unknown, linhas: number): { pagina: number; paginas: number; de: number } {
  const paginas = Math.max(1, Math.ceil(linhas / LINHAS_POR_PAGINA_DO_EXTRATO));
  const n = typeof pedida === "string" && /^\d{1,6}$/.test(pedida) ? Number(pedida) : 1;
  const pagina = Math.min(Math.max(n, 1), paginas);
  return { pagina, paginas, de: (pagina - 1) * LINHAS_POR_PAGINA_DO_EXTRATO };
}

/**
 * O resumo do extrato (public.extrato_resumo), lido com rigor: forma inesperada vira nulo, e a tela mostra a falha.
 * `repasses` (AUD-c) são as linhas que são o recebimento de um repasse de marketplace; o banco de antes da migration não
 * manda a chave (lá essas linhas contavam como pendentes), e isso é lido como zero, não como falha.
 */
export type ResumoDoExtrato = {
  creditos: number; creditos_centavos: number; debitos: number; debitos_centavos: number; taxas_centavos: number;
  liquido_centavos: number; a_cair_centavos: number; pendentes: number; conciliadas: number; ignoradas: number; repasses: number;
};
const CHAVES_DO_RESUMO: (keyof ResumoDoExtrato)[] = [
  "creditos", "creditos_centavos", "debitos", "debitos_centavos", "taxas_centavos", "liquido_centavos", "a_cair_centavos", "pendentes", "conciliadas", "ignoradas", "repasses",
];
const inteiro = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v);
export function lerResumoDoExtrato(dado: unknown): ResumoDoExtrato | null {
  if (!dado || typeof dado !== "object" || Array.isArray(dado)) return null;
  const r: Record<string, unknown> = { repasses: 0, ...(dado as Record<string, unknown>) };
  if (!CHAVES_DO_RESUMO.every((c) => inteiro(r[c]))) return null;
  return Object.fromEntries(CHAVES_DO_RESUMO.map((c) => [c, r[c]])) as ResumoDoExtrato;
}

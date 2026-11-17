// Leitura estrita das respostas das funções de painel do banco (vendas_painel, margem_painel,
// margem_itens). A resposta chega como JSON sem tipo: cada campo é conferido aqui, e forma inesperada
// é erro (a tela mostra falha de leitura), nunca zero nem texto vazio.
import { centavosDoBanco } from "./dinheiro";
import { RespostaInesperada } from "./financeiro/painel";

/** Resultado de uma leitura. Falha e fonte ausente têm estado próprio: nunca viram zero. */
export type Leitura<T> = { estado: "ok"; dados: T } | { estado: "indisponivel" } | { estado: "falha" };

export type Linha = Record<string, unknown>;

export const ehObjeto = (v: unknown): v is Linha => typeof v === "object" && v !== null && !Array.isArray(v);

/** O objeto de um campo (por exemplo, "totais"). */
export const objeto = (dado: Linha, campo: string): Linha => {
  const v = dado[campo];
  if (!ehObjeto(v)) throw new RespostaInesperada(campo);
  return v;
};

/** A lista de objetos de um campo. */
export const lista = (dado: Linha, campo: string): Linha[] => {
  const v = dado[campo];
  if (!Array.isArray(v) || !v.every(ehObjeto)) throw new RespostaInesperada(campo);
  return v;
};

/** Inteiro (centavos ou contagem). Número ausente é erro, não zero: centavosDoBanco recusa undefined, nulo e fração. */
export const inteiro = (l: Linha, campo: string) => centavosDoBanco(l[campo]);

/** Inteiro que o banco pode mandar nulo (o custo de um item sem custo gravado). Campo ausente continua sendo erro. */
export const inteiroOuNulo = (l: Linha, campo: string) => (l[campo] === null ? null : centavosDoBanco(l[campo]));

/** Contagem que chega como número do JSON (itens, pendências, quantidade): inteiro, nunca negativo, nunca texto. */
export const contagem = (l: Linha, campo: string) => {
  const v = l[campo];
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new RespostaInesperada(campo);
  return v;
};

/** Sim ou não. Ausente, nulo ou texto ("true") é erro. */
export const booleano = (l: Linha, campo: string) => {
  const v = l[campo];
  if (typeof v !== "boolean") throw new RespostaInesperada(campo);
  return v;
};

/** Texto obrigatório e não vazio. */
export const texto = (l: Linha, campo: string) => {
  const v = l[campo];
  if (typeof v !== "string" || v === "") throw new RespostaInesperada(campo);
  return v;
};

/** Texto que o banco pode mandar nulo (nome que quem pede não lê mais). Campo ausente continua sendo erro. */
export const textoOuNulo = (l: Linha, campo: string) => {
  const v = l[campo];
  if (v === null) return null;
  if (typeof v !== "string") throw new RespostaInesperada(campo);
  return v;
};

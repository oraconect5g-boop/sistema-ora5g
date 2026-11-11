// Preços pela tela (lote L3b: ORA-CAT-004, ORA-CAT-007). Confere o formulário antes de chamar o banco,
// que confere tudo de novo (permissão preco.alterar, agendamento único, campanha sem sobreposição) e
// grava a auditoria com o motivo. O passado não muda: só se cancela o que ainda não começou.
import { lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";
import { horaDeSaoPauloParaIso } from "../lojas/regras";

export const CANAIS = { loja: "Na loja", online: "Online" } as const;
export type Canal = keyof typeof CANAIS;
export const ehCanal = (v: unknown): v is Canal => typeof v === "string" && Object.hasOwn(CANAIS, v);

export const ERROS_DE_PRECO = {
  dados: "Dados inválidos: confira os campos.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  valor: "Preço inválido: use reais com vírgula (ex.: 1.299,90), até R$ 1.000.000,00.",
  canal: "Escolha o canal (na loja ou online).",
  inicio: "O início precisa ser agora ou uma data futura: o passado não é reescrito.",
  fim: "A campanha precisa de fim depois do início, com no máximo um ano.",
  agendada: "Já há mudança de preço agendada para esta loja e canal: cancele antes de agendar outra.",
  sobreposta: "Já existe campanha nesse período para esta loja e canal: cancele ou encerre antes.",
  ja_valeu: "Este preço já valeu: para mudar, defina um preço novo.",
  instante: "Outro preço começou no mesmo instante: tente de novo.",
  permissao: "Sem permissão para alterar este preço (só quem altera preços na rede ou na loja).",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDePreco = keyof typeof ERROS_DE_PRECO;

export function erroDePreco(erro: { code?: string; message?: string } | null | undefined): ErroDePreco {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "OR022") return "agendada";
  if (codigo === "OR021") return "sobreposta";
  if (codigo === "40001") return "instante";
  if (codigo === "42501" || codigo === "P0002") return "permissao";
  if (codigo === "22023") {
    const regras: [string, ErroDePreco][] = [
      ["informe o motivo", "motivo"], ["canal", "canal"], ["preço inválido", "valor"], ["já valeu", "ja_valeu"],
      ["passado", "inicio"], ["fim", "fim"], ["um ano", "fim"],
    ];
    return regras.find(([trecho]) => m.includes(trecho))?.[1] ?? "dados";
  }
  return "falha";
}

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroDePreco };
const falha = <T>(erro: ErroDePreco): Resultado<T> => ({ ok: false, erro });
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const motivoDoPreco = (v: unknown) => {
  const t = texto(v).replace(/\s+/g, " ");
  return t.length >= 3 && t.length <= 200 ? t : null;
};
/** Reais digitados → centavos (até R$ 1.000.000,00); inválido → null. */
export function centavosDoFormulario(v: unknown): number | null {
  try {
    const c = lerReais(texto(v));
    return c >= 0 && c <= 100_000_000 ? c : null;
  } catch {
    return null;
  }
}
/** "agora" → null; "data" → instante de São Paulo no futuro; inválido → undefined. */
function inicioDoFormulario(quando: unknown, data: unknown, agora: Date): string | null | undefined {
  if (quando !== "data") return null;
  const iso = horaDeSaoPauloParaIso(texto(data));
  return iso && new Date(iso).getTime() > agora.getTime() ? iso : undefined;
}

type Alcance = { variante: string; unidade: string | null; canal: Canal };
function lerAlcance(campo: (n: string) => unknown): Alcance | null {
  const variante = campo("variante");
  const unidade = campo("unidade");
  if (!ehUuid(variante) || !ehCanal(campo("canal"))) return null;
  if (unidade !== "rede" && !ehUuid(unidade)) return null;
  return { variante, unidade: unidade === "rede" ? null : (unidade as string), canal: campo("canal") as Canal };
}

export type NovoPreco = Alcance & { valor: number; inicio: string | null; motivo: string };
export function validarPreco(campo: (n: string) => unknown, agora: Date = new Date()): Resultado<NovoPreco> {
  const alcance = lerAlcance(campo);
  if (!alcance) return ehCanal(campo("canal")) ? falha("dados") : falha("canal");
  const valor = centavosDoFormulario(campo("valor"));
  if (valor === null) return falha("valor");
  const inicio = inicioDoFormulario(campo("quando"), campo("inicio"), agora);
  if (inicio === undefined) return falha("inicio");
  const motivo = motivoDoPreco(campo("motivo"));
  if (!motivo) return falha("motivo");
  return { ok: true, dados: { ...alcance, valor, inicio, motivo } };
}

export type NovaCampanha = Alcance & { valor: number; inicio: string | null; fim: string; motivo: string };
export function validarCampanha(campo: (n: string) => unknown, agora: Date = new Date()): Resultado<NovaCampanha> {
  const alcance = lerAlcance(campo);
  if (!alcance) return ehCanal(campo("canal")) ? falha("dados") : falha("canal");
  const valor = centavosDoFormulario(campo("valor"));
  if (valor === null) return falha("valor");
  const inicio = inicioDoFormulario(campo("quando"), campo("inicio"), agora);
  if (inicio === undefined) return falha("inicio");
  const fim = horaDeSaoPauloParaIso(texto(campo("fim")));
  const comeco = inicio ? new Date(inicio).getTime() : agora.getTime();
  if (!fim || new Date(fim).getTime() <= comeco || new Date(fim).getTime() > comeco + 366 * 86_400_000) return falha("fim");
  const motivo = motivoDoPreco(campo("motivo"));
  if (!motivo) return falha("motivo");
  return { ok: true, dados: { ...alcance, valor, inicio, fim, motivo } };
}

export function validarCancelamento(campo: (n: string) => unknown): Resultado<{ preco: string; variante: string; motivo: string }> {
  const preco = campo("preco");
  const variante = campo("variante");
  if (!ehUuid(preco) || !ehUuid(variante)) return falha("dados");
  const motivo = motivoDoPreco(campo("motivo"));
  if (!motivo) return falha("motivo");
  return { ok: true, dados: { preco, variante, motivo } };
}

// ---------------------------------------------------------------------------------------------
// Apresentação do histórico
// ---------------------------------------------------------------------------------------------
export type LinhaDePreco = {
  id: string; unidade_id: string | null; canal: string; valor_centavos: number; inicio: string; fim: string | null; origem: string;
  cancelado_em: string | null;
};
export type SituacaoDoPreco = "vigente" | "agendado" | "encerrado" | "cancelado";
/** Situação de uma linha agora: cancelado, agendado (não começou), vigente ou encerrado. */
export function situacaoDoPreco(l: Pick<LinhaDePreco, "inicio" | "fim" | "cancelado_em">, agora: Date = new Date()): SituacaoDoPreco {
  if (l.cancelado_em) return "cancelado";
  if (new Date(l.inicio).getTime() > agora.getTime()) return "agendado";
  if (l.fim && new Date(l.fim).getTime() <= agora.getTime()) return "encerrado";
  return "vigente";
}
/** O que ainda dá para desfazer: cancelar o que não começou ou encerrar a campanha em curso. */
export function acaoPossivel(l: Pick<LinhaDePreco, "inicio" | "fim" | "cancelado_em" | "origem">, agora: Date = new Date()): "cancelar" | "encerrar" | null {
  const s = situacaoDoPreco(l, agora);
  if (s === "agendado") return "cancelar";
  if (s === "vigente" && l.origem === "campanha") return "encerrar";
  return null;
}

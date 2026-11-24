// O débito do extrato e o estorno da venda (lote PAY-011a: ORA-PAY-011, "gerir chargebacks, estornos, antecipação e
// ajustes; efeito financeiro e comissão não duplicado"; ADR-016, adendo de 24/11). O débito que a maquininha ou o banco
// tirou é a prova do estorno da venda, e cada débito prova um estorno só. Aqui: a leitura das sugestões do banco
// (public.extrato_sugestoes_de_estorno), o que a pessoa pode fazer com cada uma, e, para a tela da venda, o débito que
// comprova cada estorno. O banco decide de novo em cada gravação; a tela só não oferece o que já se sabe recusado.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { tabelaAusente } from "../caixa/saidas";
import type { Bloco } from "../clientes/historico";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type SugestaoDeEstorno = {
  linha_id: string; estorno_id: string; estorno_numero: number; venda_id: string; venda_numero: number; meio: string; valor_centavos: number;
  /** O estorno ainda espera a confirmação ("pendente") ou já foi confirmado à mão, com o comprovante ("confirmado"). */
  situacao: "pendente" | "confirmado";
  solicitado_em: string; confirmado_em: string | null; comprovante: string | null; loja: string;
  /** O estorno veio de uma devolução (parte da venda), e não do cancelamento da venda inteira. */
  de_devolucao: boolean;
  /** A referência da linha é o comprovante com que o estorno foi confirmado. */
  pela_referencia: boolean;
  /** Quem pergunta é da gerência da loja da venda (venda.cancelar), que é quem confirma estorno. */
  pode_confirmar: boolean;
  /** A loja da venda é a loja do turno de quem pergunta (confirmar estorno é na loja da venda). */
  na_loja_do_turno: boolean;
};

const inteiro = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const texto = (v: unknown): v is string => typeof v === "string" && v !== "";
const textoOuNulo = (v: unknown): v is string | null => v === null || typeof v === "string";

/** As sugestões lidas com rigor: uma linha fora da forma esperada derruba a leitura (nulo), em vez de virar meia sugestão. */
export function lerSugestoesDeEstorno(dado: unknown): SugestaoDeEstorno[] | null {
  if (dado === null || dado === undefined) return [];
  if (!Array.isArray(dado)) return null;
  const lidas: SugestaoDeEstorno[] = [];
  for (const bruto of dado as unknown[]) {
    if (!bruto || typeof bruto !== "object") return null;
    const s = bruto as Record<string, unknown>;
    if (!ehUuid(s.linha_id) || !ehUuid(s.estorno_id) || !ehUuid(s.venda_id) || !inteiro(s.estorno_numero) || !inteiro(s.venda_numero)
      || !inteiro(s.valor_centavos) || s.valor_centavos <= 0 || !texto(s.meio) || !texto(s.loja) || !texto(s.solicitado_em)
      || (s.situacao !== "pendente" && s.situacao !== "confirmado") || !textoOuNulo(s.confirmado_em) || !textoOuNulo(s.comprovante)
      || typeof s.de_devolucao !== "boolean" || typeof s.pela_referencia !== "boolean" || typeof s.pode_confirmar !== "boolean"
      || typeof s.na_loja_do_turno !== "boolean") return null;
    lidas.push({
      linha_id: s.linha_id, estorno_id: s.estorno_id, estorno_numero: s.estorno_numero, venda_id: s.venda_id, venda_numero: s.venda_numero, meio: s.meio,
      valor_centavos: s.valor_centavos, situacao: s.situacao, solicitado_em: s.solicitado_em, confirmado_em: s.confirmado_em, comprovante: s.comprovante,
      loja: s.loja, de_devolucao: s.de_devolucao, pela_referencia: s.pela_referencia, pode_confirmar: s.pode_confirmar, na_loja_do_turno: s.na_loja_do_turno,
    });
  }
  return lidas;
}

/**
 * O que a pessoa pode fazer com a sugestão:
 * - "guardar": o estorno já foi confirmado à mão; o débito só fica como a prova dele (essa ligação se desfaz, com o motivo);
 * - "confirmar": o estorno espera, e quem pergunta é da gerência, na loja da venda: o débito confirma o estorno (não se desfaz);
 * - "gerencia": o estorno espera, mas confirmar é da gerência da loja da venda;
 * - "outra_loja": o estorno espera, e a pessoa pode confirmar, mas precisa estar na loja da venda.
 */
export type AcaoDaSugestao = "guardar" | "confirmar" | "gerencia" | "outra_loja";
export function acaoDaSugestao(s: Pick<SugestaoDeEstorno, "situacao" | "pode_confirmar" | "na_loja_do_turno">): AcaoDaSugestao {
  if (s.situacao === "confirmado") return "guardar";
  if (!s.pode_confirmar) return "gerencia";
  return s.na_loja_do_turno ? "confirmar" : "outra_loja";
}

/** O débito do extrato que comprova um estorno, para a tela da venda. */
export type DebitoDoEstorno = {
  estornoId: string; extratoId: string; extratoNumero: number; fonte: string; linha: number;
  /** O dia do débito no extrato (AAAA-MM-DD). */
  data: string;
  /** Quem ligou disse que foi contestação do cliente no banco. */
  chargeback: boolean;
  /** Foi o débito que confirmou o estorno (e não só a prova de um estorno já confirmado). */
  confirmou: boolean;
};

const COLUNA_AUSENTE = ["42703", "PGRST204"];

/**
 * O débito que comprova cada estorno dado, um por estorno (a regra do banco). Lido pelo RLS de quem pergunta: só quem
 * concilia na loja vê as linhas do extrato; para os outros a leitura volta vazia, e a tela da venda não mostra a anotação.
 * Sem estorno nenhum, nada é lido. Banco de antes da migration: "indisponivel". Falha aparece como falha.
 */
export async function lerDebitosDosEstornos(supabase: Cliente, estornos: readonly string[]): Promise<Bloco<DebitoDoEstorno>> {
  if (estornos.length === 0) return { estado: "ok", itens: [] };
  const lido = await supabase.from("extrato_linhas")
    .select("estorno_id, numero, data, chargeback, confirmou_o_estorno, extrato:extratos(id, numero, fonte)").in("estorno_id", [...estornos]).order("numero");
  if (lido.error) {
    if (tabelaAusente(lido.error) || COLUNA_AUSENTE.includes(lido.error.code ?? "")) return { estado: "indisponivel" };
    console.error("extratos: falha ao ler o débito que comprova o estorno", { codigo: lido.error.code ?? null });
    return { estado: "falha" };
  }
  const itens: DebitoDoEstorno[] = [];
  for (const l of lido.data ?? []) {
    const extrato = l.extrato as { id: string; numero: number; fonte: string } | null;
    // A linha sem o extrato legível (o que o RLS não deixaria acontecer) não vira anotação pela metade.
    if (!ehUuid(l.estorno_id) || !extrato || !ehUuid(extrato.id)) continue;
    itens.push({
      estornoId: l.estorno_id, extratoId: extrato.id, extratoNumero: extrato.numero, fonte: extrato.fonte, linha: l.numero, data: l.data,
      chargeback: l.chargeback === true, confirmou: l.confirmou_o_estorno === true,
    });
  }
  return { estado: "ok", itens };
}

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** A frase da tela da venda: "débito do extrato nº 7 (PicPay da loja), linha 12, de 20/11/2026". */
export function fraseDoDebito(d: DebitoDoEstorno): string {
  return `débito do extrato nº ${d.extratoNumero} (${d.fonte}), linha ${d.linha}, de ${dataCurta(d.data)}`;
}

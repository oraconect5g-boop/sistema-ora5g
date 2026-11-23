// A tela de Transferências numa ida ao banco (lote VEL-g: ORA-QUAL-010 e ORA-INV-007; ADR-010, "O que veio no VEL-g").
// public.transferencias_tela traz numa resposta as transferências que saem ou chegam na loja do turno (até o limite), os
// produtos delas (com o tipo), as lojas, os aparelhos separados, as remessas, o saldo de agora de cada lado e os aparelhos
// livres para os pedidos que a loja tem a separar, com o RLS de quem pede (security invoker). Antes, eram 6 a 7 idas em 3
// rodadas (de 0,57 a 0,66 s no banco, medido em 19/11 com os gerentes de teste). O banco sem a função usa as leituras de antes.
import type { obterSessao } from "../acesso/sessao";
import { FalhaDoServico } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import { booleano, ehObjeto, inteiro, inteiroOuNulo, lista, texto, textoOuNulo, type Linha } from "../leitura-do-banco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
/** Quantas transferências a tela mostra (as mais novas). */
export const LIMITE_DA_LISTA = 50;

export type TransferenciaDaTela = {
  id: string; numero: number; origem_id: string; destino_id: string; variante_id: string; quantidade: number; motivo: string;
  situacao: string; solicitado_por: string; quantidade_recebida: number | null; observacao: string | null; remessa_id: string | null;
  /** TRF-d: quando tudo o que faltou no recebimento teve destino; nulo enquanto houver o que resolver (ou sem divergência). */
  divergencia_resolvida_em: string | null;
};
/** TRF-d: o destino de uma parte do que faltou no recebimento (no aparelho e no chip, um registro por IMEI/ICCID). */
export type ResolucaoDaTransferencia = {
  transferencia_id: string; decisao: string; quantidade: number; item_serializado_id: string | null; motivo: string; criado_em: string;
};
export type ProdutoDaTransferencia = { id: string; nome: string; sku: string; tipo: string | null };
export type LojaDaTransferencia = { id: string; nome: string; tipo: string };
export type ItemDaTransferencia = { transferencia_id: string; item_serializado_id: string; recebido: boolean | null };
export type RemessaDaTransferencia = { id: string; numero: number; origem_id: string };
export type SaldoDaTransferencia = { unidade_id: string; variante_id: string; quantidade: number; reservado: number };
export type AparelhoLivre = { id: string; variante_id: string; imei: string | null; iccid: string | null };
export type TelaDasTransferencias = {
  /** As mais novas primeiro, até o limite. */
  transferencias: TransferenciaDaTela[];
  variantes: ProdutoDaTransferencia[];
  unidades: LojaDaTransferencia[];
  itens: ItemDaTransferencia[];
  remessas: RemessaDaTransferencia[];
  saldos: SaldoDaTransferencia[];
  /** Os aparelhos e chips livres na loja do turno, só dos produtos que ela tem a separar. */
  disponiveis: AparelhoLivre[];
  /** TRF-d: as resoluções do que faltou, na ordem em que foram feitas. O banco sem a migration do TRF-d não as traz. */
  resolucoes: ResolucaoDaTransferencia[];
};

const booleanoOuNulo = (l: Linha, campo: string) => (l[campo] === null ? null : booleano(l, campo));

/** Converte a resposta de public.transferencias_tela. Forma inesperada é erro (a tela mostra falha, não vazio). */
export function lerTelaDasTransferencias(dado: unknown): TelaDasTransferencias {
  if (!ehObjeto(dado)) throw new RespostaInesperada("transferencias_tela");
  return {
    transferencias: lista(dado, "transferencias").map((l) => ({
      id: texto(l, "id"), numero: inteiro(l, "numero"), origem_id: texto(l, "origem_id"), destino_id: texto(l, "destino_id"),
      variante_id: texto(l, "variante_id"), quantidade: inteiro(l, "quantidade"), motivo: texto(l, "motivo"), situacao: texto(l, "situacao"),
      solicitado_por: texto(l, "solicitado_por"), quantidade_recebida: inteiroOuNulo(l, "quantidade_recebida"),
      observacao: textoOuNulo(l, "observacao"), remessa_id: textoOuNulo(l, "remessa_id"),
      // O banco sem a migration do TRF-d não traz o campo: sem ele, a divergência conta como não resolvida.
      divergencia_resolvida_em: "divergencia_resolvida_em" in l ? textoOuNulo(l, "divergencia_resolvida_em") : null,
    })),
    variantes: lista(dado, "variantes").map((l) => ({ id: texto(l, "id"), nome: texto(l, "nome"), sku: texto(l, "sku"), tipo: textoOuNulo(l, "tipo") })),
    unidades: lista(dado, "unidades").map((l) => ({ id: texto(l, "id"), nome: texto(l, "nome"), tipo: texto(l, "tipo") })),
    itens: lista(dado, "itens").map((l) => ({
      transferencia_id: texto(l, "transferencia_id"), item_serializado_id: texto(l, "item_serializado_id"), recebido: booleanoOuNulo(l, "recebido"),
    })),
    remessas: lista(dado, "remessas").map((l) => ({ id: texto(l, "id"), numero: inteiro(l, "numero"), origem_id: texto(l, "origem_id") })),
    saldos: lista(dado, "saldos").map((l) => ({
      unidade_id: texto(l, "unidade_id"), variante_id: texto(l, "variante_id"), quantidade: inteiro(l, "quantidade"), reservado: inteiro(l, "reservado"),
    })),
    disponiveis: lista(dado, "disponiveis").map((l) => ({
      id: texto(l, "id"), variante_id: texto(l, "variante_id"), imei: textoOuNulo(l, "imei"), iccid: textoOuNulo(l, "iccid"),
    })),
    resolucoes: "resolucoes" in dado ? lista(dado, "resolucoes").map((l) => ({
      transferencia_id: texto(l, "transferencia_id"), decisao: texto(l, "decisao"), quantidade: inteiro(l, "quantidade"),
      item_serializado_id: textoOuNulo(l, "item_serializado_id"), motivo: texto(l, "motivo"), criado_em: texto(l, "criado_em"),
    })) : [],
  };
}

/** A tela de Transferências da loja do turno. Uma ida ao banco; sem a função (a migration do VEL-g), as leituras de antes. */
export async function consultarTelaDasTransferencias(supabase: Cliente, unidade: string): Promise<TelaDasTransferencias> {
  const r = await supabase.rpc("transferencias_tela", { p_limite: LIMITE_DA_LISTA });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return leiturasDeAntes(supabase, unidade);
    throw new FalhaDoServico("transferencias_tela");
  }
  try {
    return lerTelaDasTransferencias(r.data);
  } catch (erro) {
    if (erro instanceof RespostaInesperada || erro instanceof ValorForaDoLimite) throw new FalhaDoServico("transferencias_tela");
    throw erro;
  }
}

const serializado = (tipo: string | null) => tipo === "aparelho" || tipo === "chip";

// As leituras de antes do VEL-g (ADR-007; TRF-a e TRF-b): a lista, depois os detalhes ao mesmo tempo e, com aparelho a
// separar, os livres. Lido pelo RLS (as lojas envolvidas).
async function leiturasDeAntes(supabase: Cliente, unidade: string): Promise<TelaDasTransferencias> {
  const lidas = await supabase.from("transferencias").select("id, numero, origem_id, destino_id, variante_id, quantidade, motivo, situacao, solicitado_por, quantidade_recebida, observacao, solicitado_em, remessa_id")
    .or(`origem_id.eq.${unidade},destino_id.eq.${unidade}`).order("numero", { ascending: false }).limit(LIMITE_DA_LISTA);
  if (lidas.error) throw new FalhaDoServico("transferencias");
  const transferencias: TransferenciaDaTela[] = lidas.data.map((t) => ({
    id: t.id, numero: Number(t.numero), origem_id: t.origem_id, destino_id: t.destino_id, variante_id: t.variante_id, quantidade: t.quantidade,
    motivo: t.motivo, situacao: t.situacao, solicitado_por: t.solicitado_por, quantidade_recebida: t.quantidade_recebida, observacao: t.observacao,
    remessa_id: t.remessa_id, divergencia_resolvida_em: null,
  }));
  const varianteIds = [...new Set(transferencias.map((t) => t.variante_id))];
  const unidadeIds = [...new Set(transferencias.flatMap((t) => [t.origem_id, t.destino_id]))];
  // As remessas (TRF-a) das transferências da lista: o número e a origem, para agrupar e enviar de uma vez.
  const remessaIds = [...new Set(transferencias.flatMap((t) => (t.remessa_id ? [t.remessa_id] : [])))];
  // TRF-b: o saldo de agora de cada lado (o que a pessoa vê pela RLS), para mostrar o físico, o reservado e o disponível.
  const [variantes, unidades, itens, remessas, saldos] = await Promise.all([
    varianteIds.length ? supabase.from("variantes").select("id, nome, sku, produtos(tipo)").in("id", varianteIds) : Promise.resolve({ data: [], error: null }),
    unidadeIds.length ? supabase.from("unidades").select("id, nome, tipo").in("id", unidadeIds) : Promise.resolve({ data: [], error: null }),
    transferencias.length ? supabase.from("transferencia_itens").select("transferencia_id, item_serializado_id, recebido").in("transferencia_id", transferencias.map((t) => t.id))
      : Promise.resolve({ data: [], error: null }),
    remessaIds.length ? supabase.from("transferencia_remessas").select("id, numero, origem_id").in("id", remessaIds) : Promise.resolve({ data: [], error: null }),
    varianteIds.length ? supabase.from("estoque_saldos").select("unidade_id, variante_id, quantidade, reservado").in("unidade_id", unidadeIds).in("variante_id", varianteIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (variantes.error || unidades.error || itens.error || remessas.error || saldos.error) throw new FalhaDoServico("transferencias_detalhes");
  const produtos: ProdutoDaTransferencia[] = variantes.data.map((v) => ({ id: v.id, nome: v.nome, sku: v.sku, tipo: v.produtos?.tipo ?? null }));
  // IMEI/ICCID disponíveis na loja do turno para separar os pedidos de aparelho e chip.
  const aSeparar = [...new Set(transferencias.filter((t) => t.situacao === "solicitada" && t.origem_id === unidade
    && serializado(produtos.find((v) => v.id === t.variante_id)?.tipo ?? null)).map((t) => t.variante_id))];
  const disponiveis = aSeparar.length
    ? await supabase.from("itens_serializados").select("id, variante_id, imei, iccid").eq("unidade_id", unidade).eq("em_estoque", true).eq("situacao", "disponivel")
      .in("variante_id", aSeparar).limit(100)
    : { data: [], error: null };
  if (disponiveis.error) throw new FalhaDoServico("transferencias_itens");
  return {
    transferencias, variantes: produtos, unidades: unidades.data, itens: itens.data,
    remessas: remessas.data.map((r) => ({ id: r.id, numero: Number(r.numero), origem_id: r.origem_id })),
    saldos: saldos.data.map((s) => ({ unidade_id: s.unidade_id, variante_id: s.variante_id, quantidade: Number(s.quantidade), reservado: Number(s.reservado) })),
    disponiveis: disponiveis.data,
    // O banco sem a função da tela (anterior ao VEL-g) também não tem as resoluções (TRF-d).
    resolucoes: [],
  };
}

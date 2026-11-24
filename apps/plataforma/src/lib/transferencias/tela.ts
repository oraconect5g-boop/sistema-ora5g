// A tela de Transferências numa ida ao banco (lote VEL-g: ORA-QUAL-010 e ORA-INV-007; ADR-010, "O que veio no VEL-g").
// public.transferencias_tela traz numa resposta as transferências que saem ou chegam na loja do turno (até o limite), os
// produtos delas (com o tipo), as lojas, os aparelhos separados, as remessas, o saldo de agora de cada lado e os aparelhos
// livres para os pedidos que a loja tem a separar, com o RLS de quem pede (security invoker). Antes, eram 6 a 7 idas em 3
// rodadas (de 0,57 a 0,66 s no banco, medido em 19/11 com os gerentes de teste). O banco sem a função usa as leituras de antes.
// TRF-f (o achado F24-01 do Codex, 24/11): a lista são as em andamento (que pedem ação de alguém) e o histórico, cada parte
// com as suas páginas, e a busca pelo número; antes, as 50 mais novas de tudo escondiam a pedida antiga atrás das canceladas.
import type { obterSessao } from "../acesso/sessao";
import { FalhaDoServico } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import { booleano, ehObjeto, inteiro, inteiroOuNulo, lista, texto, textoOuNulo, type Linha } from "../leitura-do-banco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
/** Quantas transferências cada parte da tela mostra por página (as mais novas primeiro). */
export const LIMITE_DA_LISTA = 50;
/** TRF-f: a página das em andamento, a do histórico e o número procurado (o que a tela pede ao banco). */
export type PedidoDaTela = { paginaAbertas?: number; pagina?: number; numero?: number | null };
/** TRF-f: em andamento é o que ainda pede ação de alguém (a mesma regra do banco). */
export const EM_ANDAMENTO = new Set(["solicitada", "separada", "enviada"]);

export type TransferenciaDaTela = {
  id: string; numero: number; origem_id: string; destino_id: string; variante_id: string; quantidade: number; motivo: string;
  situacao: string; solicitado_por: string; quantidade_recebida: number | null; observacao: string | null; remessa_id: string | null;
  /** TRF-d: quando tudo o que faltou no recebimento teve destino; nulo enquanto houver o que resolver (ou sem divergência). */
  divergencia_resolvida_em: string | null;
  /** TRF-f: ainda pede ação de alguém (solicitada, separada, enviada, ou recebida com divergência sem destino). */
  aberta: boolean;
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
  /** As em andamento da página pedida e depois o histórico da página pedida, cada parte com as mais novas primeiro (ou, na
   *  busca pelo número, só a procurada). */
  transferencias: TransferenciaDaTela[];
  /** TRF-f: quantas há em andamento e no histórico, e a página de cada parte (a pedida, já dentro do que existe). */
  contas: { abertas: number; historico: number; paginaAbertas: number; paginasAbertas: number; pagina: number; paginas: number };
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
/** Em andamento pela regra do banco, para a resposta de antes do TRF-f (sem o campo): sem a data de resolução, a recebida
 *  com divergência conta como em andamento. */
const abertaPelaSituacao = (situacao: string, resolvidaEm: string | null) =>
  EM_ANDAMENTO.has(situacao) || (situacao === "recebida_com_divergencia" && resolvidaEm === null);

/** Converte a resposta de public.transferencias_tela. Forma inesperada é erro (a tela mostra falha, não vazio). */
export function lerTelaDasTransferencias(dado: unknown): TelaDasTransferencias {
  if (!ehObjeto(dado)) throw new RespostaInesperada("transferencias_tela");
  const transferencias = lista(dado, "transferencias").map((l) => ({
      id: texto(l, "id"), numero: inteiro(l, "numero"), origem_id: texto(l, "origem_id"), destino_id: texto(l, "destino_id"),
      variante_id: texto(l, "variante_id"), quantidade: inteiro(l, "quantidade"), motivo: texto(l, "motivo"), situacao: texto(l, "situacao"),
      solicitado_por: texto(l, "solicitado_por"), quantidade_recebida: inteiroOuNulo(l, "quantidade_recebida"),
      observacao: textoOuNulo(l, "observacao"), remessa_id: textoOuNulo(l, "remessa_id"),
      // O banco sem a migration do TRF-d não traz o campo: sem ele, a divergência conta como não resolvida.
      divergencia_resolvida_em: "divergencia_resolvida_em" in l ? textoOuNulo(l, "divergencia_resolvida_em") : null,
      // TRF-f: o banco diz se está em andamento; o de antes (sem o campo), pela mesma regra.
      aberta: "aberta" in l ? booleano(l, "aberta")
        : abertaPelaSituacao(texto(l, "situacao"), "divergencia_resolvida_em" in l ? textoOuNulo(l, "divergencia_resolvida_em") : null),
    }));
  // TRF-f: as contas e as páginas; o banco de antes (sem elas) mostra tudo numa página só.
  const contas = "abertas" in dado
    ? { abertas: inteiro(dado, "abertas"), historico: inteiro(dado, "historico"), paginaAbertas: inteiro(dado, "pagina_abertas"),
        paginasAbertas: inteiro(dado, "paginas_abertas"), pagina: inteiro(dado, "pagina"), paginas: inteiro(dado, "paginas") }
    : contasDaLista(transferencias);
  return {
    transferencias,
    contas,
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

const contasDaLista = (lista: TransferenciaDaTela[]) => {
  const abertas = lista.filter((t) => t.aberta).length;
  return { abertas, historico: lista.length - abertas, paginaAbertas: 1, paginasAbertas: 1, pagina: 1, paginas: 1 };
};

/** A tela de Transferências da loja do turno. Uma ida ao banco; sem a função (a migration do VEL-g), as leituras de antes. */
export async function consultarTelaDasTransferencias(supabase: Cliente, unidade: string, pedido: PedidoDaTela = {}): Promise<TelaDasTransferencias> {
  const r = await supabase.rpc("transferencias_tela", {
    p_limite: LIMITE_DA_LISTA, p_pagina: pedido.pagina ?? 1, p_pagina_abertas: pedido.paginaAbertas ?? 1, p_numero: pedido.numero ?? undefined,
  });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return leiturasDeAntes(supabase, unidade, pedido);
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
// separar, os livres. Lido pelo RLS (as lojas envolvidas). TRF-f: as em andamento e o histórico em leituras separadas (a
// pedida antiga não some atrás das canceladas), uma página de cada; o banco de antes do TRF-d não resolve divergência, então
// a recebida com divergência conta como em andamento.
async function leiturasDeAntes(supabase: Cliente, unidade: string, pedido: PedidoDaTela = {}): Promise<TelaDasTransferencias> {
  const COLUNAS = "id, numero, origem_id, destino_id, variante_id, quantidade, motivo, situacao, solicitado_por, quantidade_recebida, observacao, solicitado_em, remessa_id";
  const ABERTAS_DE_ANTES = "(solicitada,separada,enviada,recebida_com_divergencia)";
  const daLoja = () => supabase.from("transferencias").select(COLUNAS).or(`origem_id.eq.${unidade},destino_id.eq.${unidade}`);
  const [abertas, historico] = pedido.numero
    ? [await daLoja().eq("numero", pedido.numero).limit(1), { data: [], error: null }]
    : await Promise.all([
      daLoja().filter("situacao", "in", ABERTAS_DE_ANTES).order("numero", { ascending: false }).limit(LIMITE_DA_LISTA),
      daLoja().not("situacao", "in", ABERTAS_DE_ANTES).order("numero", { ascending: false }).limit(LIMITE_DA_LISTA),
    ]);
  if (abertas.error || historico.error) throw new FalhaDoServico("transferencias");
  const transferencias: TransferenciaDaTela[] = [...abertas.data, ...historico.data].map((t) => ({
    id: t.id, numero: Number(t.numero), origem_id: t.origem_id, destino_id: t.destino_id, variante_id: t.variante_id, quantidade: t.quantidade,
    motivo: t.motivo, situacao: t.situacao, solicitado_por: t.solicitado_por, quantidade_recebida: t.quantidade_recebida, observacao: t.observacao,
    remessa_id: t.remessa_id, divergencia_resolvida_em: null, aberta: abertaPelaSituacao(t.situacao, null),
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
    transferencias, contas: contasDaLista(transferencias), variantes: produtos, unidades: unidades.data, itens: itens.data,
    remessas: remessas.data.map((r) => ({ id: r.id, numero: Number(r.numero), origem_id: r.origem_id })),
    saldos: saldos.data.map((s) => ({ unidade_id: s.unidade_id, variante_id: s.variante_id, quantidade: Number(s.quantidade), reservado: Number(s.reservado) })),
    disponiveis: disponiveis.data,
    // O banco sem a função da tela (anterior ao VEL-g) também não tem as resoluções (TRF-d).
    resolucoes: [],
  };
}

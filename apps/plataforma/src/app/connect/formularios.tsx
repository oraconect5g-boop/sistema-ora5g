import type { TipoOperacao } from "@ora5g/dominio/nogle";

import { FalhaDoServico, type obterSessao } from "../../lib/acesso/sessao";
import { lerReferenciasDaNogle } from "../../lib/connect/referencias";
import { inicioDaJanela, planoDoServico } from "../../lib/connect/regras";
import { centavosDoBanco } from "../../lib/dinheiro";
import { brl } from "../../lib/formato";
import type { OpcaoDePago } from "./campos";

// Lote CONNECT-m (25/11/2026): o que os formulários das abas Ativar chip, Recarga e Portabilidade leem do banco (no
// servidor), com as regras reais: o plano e os códigos vêm das listas oficiais da Nogle, o serviço pago no caixa é o item da
// venda concluída (ainda livre) e o pagamento à Nogle é o Pix da Nogle ou a carteira (a D-062). As peças da tela ficam em
// campos.tsx (CONNECT-n: o assistente de ativação, no navegador, usa as mesmas).

type Sessao = Awaited<ReturnType<typeof obterSessao>>;
/** Situações em que a operação ainda usa o serviço pago no caixa ou o chip (o mesmo pago vale uma operação só). */
const VIVAS = ["registrada", "enviando", "aguardando_operadora", "resultado_desconhecido", "confirmada", "erro_operadora"];

/** O que o formulário de um tipo de operação precisa: se ele está liberado, as listas da Nogle e os serviços pagos livres. */
export async function lerFormulario(sessao: Sessao, tipo: TipoOperacao) {
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  // AUD-f: as listas oficiais por tipo e inteiras (páginas de 1.000: a leitura única de antes cortava em 1.000 itens, e uma
  // lista grande podia esconder outra); os serviços pagos dos últimos 7 dias, os mais novos primeiro (até 200); e quais deles já
  // têm operação viva, pelos próprios serviços (não pelas 200 operações mais recentes da loja).
  const [habilitacoes, referencias, pagos] = await Promise.all([
    supabase.from("connect_habilitacoes").select("tipo, habilitada"),
    lerReferenciasDaNogle(supabase, ["plano", "cidade", "ddd", "operadora"]),
    // CONNECT-f: o nome da variação é o do plano (REC-<plano>, ATV-<plano>): a pessoa vê qual plano foi pago.
    supabase.from("venda_itens").select("id, tipo, preco_unitario_centavos, quantidade, desconto_centavos, variantes(nome, sku), vendas!inner(numero, situacao, unidade_id, concluida_em)")
      .eq("tipo", tipo).eq("vendas.situacao", "concluida").eq("vendas.unidade_id", unidade).gte("vendas.concluida_em", inicioDaJanela(7))
      .order("criado_em", { ascending: false }).order("id", { ascending: false }).limit(200),
  ]);
  if (habilitacoes.error || !referencias || pagos.error) throw new FalhaDoServico("connect_formulario");
  const usados = pagos.data.length > 0
    ? await supabase.from("connect_operacoes").select("venda_item_id, situacao").eq("unidade_id", unidade).in("venda_item_id", pagos.data.map((p) => p.id))
    : { data: [], error: null };
  if (usados.error) throw new FalhaDoServico("connect_formulario");
  const ocupados = new Set(usados.data.filter((o) => VIVAS.includes(o.situacao)).map((o) => o.venda_item_id));
  return {
    liberada: habilitacoes.data.some((h) => h.tipo === tipo && h.habilitada),
    lista: (t: string) => (Object.hasOwn(referencias, t) ? referencias[t as keyof typeof referencias] : []),
    // AUD-f: cada serviço pago com o plano dele (o código do produto), para a tela oferecer só os do plano escolhido.
    pagosLivres: pagos.data.filter((p) => !ocupados.has(p.id)).map((p): OpcaoDePago => ({
      id: p.id,
      plano: planoDoServico(tipo, p.variantes?.sku),
      rotulo: `Venda nº ${p.vendas.numero}${p.variantes?.nome ? ` · ${p.variantes.nome}` : ""} · ${brl(centavosDoBanco(p.preco_unitario_centavos) * p.quantidade - centavosDoBanco(p.desconto_centavos))}`,
    })),
  };
}

/**
 * CONNECT-n: os chips vendidos nesta loja nos últimos 7 dias (o ICCID do item da venda concluída), para o assistente de
 * ativação mostrar à mão: sem as que já têm operação que a pessoa vê. O banco confere tudo de novo no registro (o chip vendido,
 * OR011; a operação em andamento ou feita para o mesmo chip, OR013).
 */
export async function lerChipsParaAtivar(sessao: Sessao) {
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  // AUD-f: os chips com operação viva, pelos próprios ICCIDs vendidos (não pelas 500 operações mais recentes da loja).
  const vendidos = await supabase.from("venda_itens").select("id, itens_serializados!inner(iccid), vendas!inner(numero, situacao, unidade_id, concluida_em)")
    .not("itens_serializados.iccid", "is", null).eq("vendas.situacao", "concluida").eq("vendas.unidade_id", unidade)
    .gte("vendas.concluida_em", inicioDaJanela(7)).order("criado_em", { ascending: false }).order("id", { ascending: false }).limit(100);
  if (vendidos.error) throw new FalhaDoServico("connect_chips_para_ativar");
  const iccids = [...new Set(vendidos.data.flatMap((v) => (v.itens_serializados.iccid ? [v.itens_serializados.iccid] : [])))];
  const usados = iccids.length > 0
    ? await supabase.from("connect_operacoes").select("iccid, situacao").in("iccid", iccids)
    : { data: [], error: null };
  if (usados.error) throw new FalhaDoServico("connect_chips_para_ativar");
  const comOperacao = new Set(usados.data.filter((o) => VIVAS.includes(o.situacao)).map((o) => o.iccid));
  const vistos = new Set<string>();
  return vendidos.data
    .flatMap((v) => {
      const iccid = v.itens_serializados.iccid;
      if (!iccid || comOperacao.has(iccid) || vistos.has(iccid)) return [];
      vistos.add(iccid);
      return [{ iccid, venda: v.vendas.numero, vendidoEm: v.vendas.concluida_em ?? "" }];
    })
    .sort((a, b) => b.vendidoEm.localeCompare(a.vendidoEm))
    .slice(0, 12)
    .map(({ iccid, venda }) => ({ iccid, venda }));
}

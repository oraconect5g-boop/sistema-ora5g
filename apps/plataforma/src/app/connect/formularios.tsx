import type { TipoOperacao } from "@ora5g/dominio/nogle";

import { FalhaDoServico, type obterSessao } from "../../lib/acesso/sessao";
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
  const [habilitacoes, referencias, usados, pagos] = await Promise.all([
    supabase.from("connect_habilitacoes").select("tipo, habilitada"),
    supabase.from("connect_referencias").select("tipo, codigo, nome, uf, valor_centavos").eq("ativo", true).order("nome").limit(3000),
    supabase.from("connect_operacoes").select("venda_item_id, situacao").eq("unidade_id", unidade).not("venda_item_id", "is", null)
      .order("criado_em", { ascending: false }).limit(200),
    // CONNECT-f: o nome da variação é o do plano (REC-<plano>, ATV-<plano>): a pessoa vê qual plano foi pago.
    supabase.from("venda_itens").select("id, tipo, preco_unitario_centavos, quantidade, desconto_centavos, variantes(nome, sku), vendas!inner(numero, situacao, unidade_id, concluida_em)")
      .eq("tipo", tipo).eq("vendas.situacao", "concluida").eq("vendas.unidade_id", unidade).gte("vendas.concluida_em", inicioDaJanela(7)).limit(50),
  ]);
  if (habilitacoes.error || referencias.error || usados.error || pagos.error) throw new FalhaDoServico("connect_formulario");
  const ocupados = new Set(usados.data.filter((o) => VIVAS.includes(o.situacao)).map((o) => o.venda_item_id));
  return {
    liberada: habilitacoes.data.some((h) => h.tipo === tipo && h.habilitada),
    lista: (t: string) => referencias.data.filter((r) => r.tipo === t),
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
  const [vendidos, usados] = await Promise.all([
    supabase.from("venda_itens").select("id, itens_serializados!inner(iccid), vendas!inner(numero, situacao, unidade_id, concluida_em)")
      .not("itens_serializados.iccid", "is", null).eq("vendas.situacao", "concluida").eq("vendas.unidade_id", unidade)
      .gte("vendas.concluida_em", inicioDaJanela(7)).limit(100),
    supabase.from("connect_operacoes").select("iccid, situacao").eq("unidade_id", unidade).not("iccid", "is", null)
      .order("criado_em", { ascending: false }).limit(500),
  ]);
  if (vendidos.error || usados.error) throw new FalhaDoServico("connect_chips_para_ativar");
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

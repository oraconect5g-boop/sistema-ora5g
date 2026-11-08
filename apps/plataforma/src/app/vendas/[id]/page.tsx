import { CheckCircle2, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MEIOS } from "@ora5g/dominio";

import { Marca } from "../../../componentes/Marca";
import { Aviso, Botao, Cartao, Selo } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { centavosDoBanco } from "../../../lib/dinheiro";
import { brl } from "../../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { ERROS_DA_VENDA } from "../../../lib/vendas/regras";
import { cancelarVenda } from "../../vender/acoes";

export const metadata: Metadata = { title: "Comprovante da venda" };
export const dynamic = "force-dynamic";

const nomeDoMeio = (m: string) => (Object.hasOwn(MEIOS, m) ? MEIOS[m as keyof typeof MEIOS].nome : m);
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";

// Comprovante digital (as lojas não têm impressora, DEC-U22). Lido pelo RLS: o vendedor vê as
// próprias vendas; a gerência vê as da loja. A gerência cancela com estorno (ADR-004).
export default async function Comprovante({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ concluida?: ValorDeParametro; cancelada?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DA_VENDA, parametros.erro);
  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  const venda = await supabase.from("vendas").select("id, numero, situacao, unidade_id, vendedor_id, cliente_nome, total_centavos, subtotal_centavos, desconto_centavos, troco_centavos, recebido_centavos, a_receber_centavos, concluida_em, cancelada_em, motivo_cancelamento").eq("id", id).maybeSingle();
  if (venda.error) throw new FalhaDoServico("venda");
  if (!venda.data) notFound();
  const [itens, pagamentos, loja, vendedor, podeCancelar] = await Promise.all([
    supabase.from("venda_itens").select("id, variante_id, item_serializado_id, quantidade, preco_unitario_centavos, desconto_centavos").eq("venda_id", id).order("criado_em"),
    supabase.from("venda_pagamentos").select("ordem, meio, valor_centavos, entrada_centavos, comprovante, situacao").eq("venda_id", id).order("ordem"),
    supabase.from("unidades").select("nome, cnpj").eq("id", venda.data.unidade_id).maybeSingle(),
    supabase.from("perfis_usuario").select("nome").eq("id", venda.data.vendedor_id).maybeSingle(),
    supabase.rpc("tem_permissao", { p_permissao: "venda.cancelar", p_unidade: venda.data.unidade_id }),
  ]);
  if (itens.error || pagamentos.error || loja.error || vendedor.error || podeCancelar.error) throw new FalhaDoServico("comprovante");
  const variantes = itens.data.length ? await supabase.from("variantes").select("id, sku, nome").in("id", itens.data.map((i) => i.variante_id)) : { data: [], error: null };
  const serializados = itens.data.some((i) => i.item_serializado_id) ? await supabase.from("itens_serializados").select("id, imei, iccid").in("id", itens.data.flatMap((i) => (i.item_serializado_id ? [i.item_serializado_id] : []))) : { data: [], error: null };
  if (variantes.error || serializados.error) throw new FalhaDoServico("comprovante_itens");
  const v = venda.data;
  const quando = v.concluida_em ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(v.concluida_em)) : null;
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <div className="flex items-center justify-between gap-3"><Marca tamanho="text-2xl" /><nav className="flex gap-3 text-sm font-semibold text-acao"><Link href="/vender">Vender</Link><Link href="/inicio">Início</Link></nav></div>
      {textoDoParametro(parametros.concluida) === "1" && v.situacao === "concluida" && <Aviso tom="sucesso" titulo="Venda concluída"><CheckCircle2 aria-hidden className="inline size-4" /> Estoque baixado e pagamento registrado no seu caixa.</Aviso>}
      {textoDoParametro(parametros.cancelada) === "1" && <Aviso tom="info">Venda cancelada com estorno.</Aviso>}
      {erro && <Aviso tom="perigo">{ERROS_DA_VENDA[erro]}</Aviso>}
      <Cartao titulo={`Venda nº ${v.numero}`} subtitulo={`${loja.data?.nome ?? situacao.unidade_nome}${quando ? ` · ${quando}` : ""}`} icone={Receipt}>
        <p className="text-sm">Vendedor: {vendedor.data?.nome ?? "—"}{v.cliente_nome ? ` · Cliente: ${v.cliente_nome}` : ""}</p>
        <p className="mt-1">{v.situacao === "concluida" ? <Selo tom="sucesso" ponto>concluída</Selo> : v.situacao === "cancelada" ? <Selo tom="perigo" ponto>cancelada</Selo> : <Selo tom="aviso" ponto>em aberto</Selo>}</p>
        {v.situacao === "cancelada" && v.motivo_cancelamento && <p className="mt-1 text-xs text-suave">Motivo: {v.motivo_cancelamento}</p>}
        <ul className="mt-3 divide-y divide-borda text-sm">
          {itens.data.map((i) => {
            const variante = variantes.data.find((x) => x.id === i.variante_id);
            const serial = serializados.data.find((s) => s.id === i.item_serializado_id);
            const linha = centavosDoBanco(i.preco_unitario_centavos) * i.quantidade - centavosDoBanco(i.desconto_centavos);
            return (
              <li key={i.id} className="flex justify-between gap-2 py-2">
                <span>{variante?.nome}<span className="numeros block text-xs text-suave">{variante?.sku}{serial ? ` · ${serial.imei ? "IMEI" : "ICCID"} ${serial.imei ?? serial.iccid}` : ""} · {i.quantidade} un.</span></span>
                <span className="numeros font-semibold">{brl(linha)}</span>
              </li>
            );
          })}
        </ul>
        <dl className="numeros mt-2 grid grid-cols-2 gap-1 border-t border-borda pt-2 text-sm">
          <dt>Subtotal</dt><dd className="text-right">{brl(centavosDoBanco(v.subtotal_centavos ?? 0))}</dd>
          <dt>Descontos</dt><dd className="text-right">− {brl(centavosDoBanco(v.desconto_centavos ?? 0))}</dd>
          <dt className="font-semibold">Total</dt><dd className="text-right font-bold">{brl(centavosDoBanco(v.total_centavos ?? 0))}</dd>
          {centavosDoBanco(v.troco_centavos ?? 0) > 0 && <><dt>Troco</dt><dd className="text-right">{brl(centavosDoBanco(v.troco_centavos ?? 0))}</dd></>}
          {centavosDoBanco(v.a_receber_centavos ?? 0) > 0 && <><dt>A receber da financeira</dt><dd className="text-right">{brl(centavosDoBanco(v.a_receber_centavos ?? 0))}</dd></>}
        </dl>
        <ul className="mt-2 space-y-1 text-xs">
          {pagamentos.data.map((p) => (
            <li key={p.ordem} className="numeros">{nomeDoMeio(p.meio)}: {brl(centavosDoBanco(p.valor_centavos))}{centavosDoBanco(p.entrada_centavos) > 0 ? ` (entrada ${brl(centavosDoBanco(p.entrada_centavos))})` : ""}{p.comprovante ? ` · comprovante ${p.comprovante}` : ""}{p.situacao === "estornado" ? " · estornado" : ""}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-suave">Comprovante interno, sem valor fiscal. A nota fiscal segue o fluxo combinado com o contador.</p>
      </Cartao>
      {v.situacao === "concluida" && podeCancelar.data && (
        <details className="text-sm"><summary className="cursor-pointer font-semibold text-perigo">Cancelar esta venda (estorno)</summary>
          <form action={cancelarVenda} className="mt-2 space-y-2">
            <input type="hidden" name="venda" value={v.id} /><input type="hidden" name="voltar" value="comprovante" />
            <label className="block text-xs font-medium">Motivo (fica na auditoria)<input name="motivo" required minLength={3} className={campo} /></label>
            <p className="text-xs text-suave">O aparelho volta ao estoque; o dinheiro sai do SEU caixa aberto; cartão e Pix ficam marcados para estorno na maquininha ou no banco.</p>
            <Botao type="submit" tamanho="sm" variante="perigo">Cancelar com estorno</Botao>
          </form>
        </details>
      )}
    </main>
  );
}

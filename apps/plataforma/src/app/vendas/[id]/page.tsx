import { randomUUID } from "node:crypto";

import { CheckCircle2, FileText, PackageCheck, Receipt, RotateCcw, Undo2, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MEIOS } from "@ora5g/dominio";
import { chaveEmGrupos, MODELOS_DE_NOTA, SITUACOES_DA_NOTA, type SituacaoDaNota } from "@ora5g/dominio/fiscal";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { centavosDoBanco } from "../../../lib/dinheiro";
import { brl } from "../../../lib/formato";
import { ERROS_DAS_NOTAS } from "../../../lib/notas/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { CONDICOES_DE_RETORNO, ERROS_DA_VENDA } from "../../../lib/vendas/regras";
import { vincularClienteNaVenda } from "../../clientes/acoes";
import { BuscaDeCliente } from "../../clientes/BuscaDeCliente";
import { corrigirNota, pedirNota } from "../../notas/acoes";
import { cancelarVenda, conferirRetorno, confirmarEstorno, devolverItens } from "../../vender/acoes";

export const metadata: Metadata = { title: "Comprovante da venda" };
export const dynamic = "force-dynamic";

const nomeDoMeio = (m: string) => (Object.hasOwn(MEIOS, m) ? MEIOS[m as keyof typeof MEIOS].nome : m);
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const FISICOS = new Set(["aparelho", "chip", "acessorio"]);

// Comprovante digital (as lojas não têm impressora, DEC-U22). Lido pelo RLS: o vendedor vê as
// próprias vendas; a gerência vê as da loja. A gerência cancela com estorno (ADR-004).
export default async function Comprovante({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ concluida?: ValorDeParametro; cancelada?: ValorDeParametro; erro?: ValorDeParametro; nota?: ValorDeParametro; erro_nota?: ValorDeParametro; devolvida?: ValorDeParametro; vale?: ValorDeParametro; estorno?: ValorDeParametro; retorno?: ValorDeParametro; cliente?: ValorDeParametro }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DA_VENDA, parametros.erro);
  const erroNota = chaveDoCatalogo(ERROS_DAS_NOTAS, parametros.erro_nota);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const venda = await supabase.from("vendas").select("id, numero, situacao, unidade_id, vendedor_id, cliente_nome, cliente_id, total_centavos, subtotal_centavos, desconto_centavos, troco_centavos, recebido_centavos, a_receber_centavos, devolvido_centavos, concluida_em, cancelada_em, motivo_cancelamento").eq("id", id).maybeSingle();
  if (venda.error) throw new FalhaDoServico("venda");
  if (!venda.data) notFound();
  const [itens, pagamentos, loja, vendedor, podeCancelar, podePedirNota, aprovaNota, nota, devolucoes, notasDeDevolucao, estornos, retornos, buscaCliente] = await Promise.all([
    supabase.from("venda_itens").select("id, variante_id, item_serializado_id, tipo, quantidade, preco_unitario_centavos, desconto_centavos").eq("venda_id", id).order("criado_em"),
    supabase.from("venda_pagamentos").select("ordem, meio, valor_centavos, entrada_centavos, comprovante, situacao").eq("venda_id", id).order("ordem"),
    supabase.from("unidades").select("nome, cnpj").eq("id", venda.data.unidade_id).maybeSingle(),
    supabase.from("perfis_usuario").select("nome").eq("id", venda.data.vendedor_id).maybeSingle(),
    supabase.rpc("tem_permissao", { p_permissao: "venda.cancelar", p_unidade: venda.data.unidade_id }),
    supabase.rpc("tem_permissao", { p_permissao: "nota.solicitar", p_unidade: venda.data.unidade_id }),
    supabase.rpc("tem_permissao", { p_permissao: "nota.aprovar", p_unidade: venda.data.unidade_id }),
    supabase.from("notas_pedidos").select("id, situacao, solicitado_por, destinatario_nome, destinatario_mascarado, observacao, chave_acesso, modelo, serie, numero_documento")
      .eq("venda_id", id).eq("tipo", "venda").neq("situacao", "cancelada").maybeSingle(),
    supabase.from("venda_devolucoes").select("id, numero, valor_centavos, motivo, criado_em, venda_devolucao_itens(venda_item_id, quantidade, valor_centavos, condicao), venda_devolucao_reembolsos(meio, valor_centavos), vales_troca(numero, saldo_centavos)")
      .eq("venda_id", id).order("criado_em"),
    supabase.from("notas_pedidos").select("devolucao_id, situacao").eq("venda_id", id).eq("tipo", "devolucao"),
    // Estorno de Pix, cartão e financeira a confirmar com o comprovante (#50) e retorno físico a conferir (#51).
    supabase.from("estornos_externos").select("id, numero, meio, valor_centavos, situacao, devolucao_id, comprovante, confirmado_em").eq("venda_id", id).order("numero"),
    supabase.from("venda_retornos").select("id, venda_item_id, quantidade, situacao, condicao, observacao").eq("venda_id", id).order("solicitado_em"),
    // Cliente da rede (L5a): quem busca cliente na loja do turno vê a ficha e liga a venda a um cadastro.
    supabase.rpc("tem_permissao", { p_permissao: "cliente.buscar", p_unidade: situacao.unidade_id as string }),
  ]);
  if (itens.error || pagamentos.error || loja.error || vendedor.error || podeCancelar.error || podePedirNota.error || aprovaNota.error || nota.error || devolucoes.error || notasDeDevolucao.error || estornos.error || retornos.error || buscaCliente.error) throw new FalhaDoServico("comprovante");
  const variantes = itens.data.length ? await supabase.from("variantes").select("id, sku, nome").in("id", itens.data.map((i) => i.variante_id)) : { data: [], error: null };
  const serializados = itens.data.some((i) => i.item_serializado_id) ? await supabase.from("itens_serializados").select("id, imei, iccid").in("id", itens.data.flatMap((i) => (i.item_serializado_id ? [i.item_serializado_id] : []))) : { data: [], error: null };
  if (variantes.error || serializados.error) throw new FalhaDoServico("comprovante_itens");
  const v = venda.data;
  // Devolução (adendo do ADR-004): o que resta de cada item e os meios em que dá para reembolsar.
  const devolvido = new Map<string, number>();
  for (const d of devolucoes.data) for (const i of d.venda_devolucao_itens) devolvido.set(i.venda_item_id, (devolvido.get(i.venda_item_id) ?? 0) + i.quantidade);
  const restantes = itens.data.map((i) => ({ ...i, restante: i.quantidade - (devolvido.get(i.id) ?? 0) })).filter((i) => i.restante > 0);
  const financiada = pagamentos.data.some((p) => p.situacao === "confirmado" && Object.hasOwn(MEIOS, p.meio) && MEIOS[p.meio as keyof typeof MEIOS].financeira);
  const meiosDeReembolso = [...new Set(pagamentos.data.filter((p) => p.situacao === "confirmado" && p.meio !== "vale_troca").map((p) => p.meio)), "vale_troca"];
  const nomeDoItem = (itemId: string) => variantes.data.find((x) => x.id === itens.data.find((i) => i.id === itemId)?.variante_id)?.nome ?? "Item";
  const quando = v.concluida_em ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(v.concluida_em)) : null;
  return (
    <MoldeReal sessao={sessao} largura="max-w-lg">
      {textoDoParametro(parametros.concluida) === "1" && v.situacao === "concluida" && <Aviso tom="sucesso" titulo="Venda concluída"><CheckCircle2 aria-hidden className="inline size-4" /> Estoque baixado e pagamento registrado no seu caixa.</Aviso>}
      {textoDoParametro(parametros.cancelada) === "1" && <Aviso tom="info">Venda cancelada. O dinheiro saiu do seu caixa; cartão, Pix e financeira ficam como estorno a confirmar com o comprovante; os itens só voltam ao estoque quando forem recebidos e conferidos.</Aviso>}
      {textoDoParametro(parametros.estorno) === "confirmado" && <Aviso tom="sucesso">Estorno confirmado com o comprovante.</Aviso>}
      {textoDoParametro(parametros.retorno) === "recebido" && <Aviso tom="sucesso">Item conferido e de volta ao estoque.</Aviso>}
      {textoDoParametro(parametros.retorno) === "nao_recebido" && <Aviso tom="info">Retorno fechado sem estoque: o item não voltou.</Aviso>}
      {erro && <Aviso tom="perigo">{ERROS_DA_VENDA[erro]}</Aviso>}
      {erroNota && <Aviso tom="perigo">{ERROS_DAS_NOTAS[erroNota]}</Aviso>}
      {textoDoParametro(parametros.devolvida) && <Aviso tom="sucesso">Devolução nº {textoDoParametro(parametros.devolvida)} registrada: estoque e caixa atualizados.{textoDoParametro(parametros.vale) ? ` Vale-troca nº ${textoDoParametro(parametros.vale)} criado: informe esse número no pagamento da nova venda.` : ""}</Aviso>}
      {textoDoParametro(parametros.nota) === "pedida" && <Aviso tom="sucesso">Nota pedida: aparece na fila do dono e do gerente.</Aviso>}
      {textoDoParametro(parametros.nota) === "corrigida" && <Aviso tom="sucesso">Correção enviada: o pedido voltou para a fila.</Aviso>}
      <Cartao titulo={`Venda nº ${v.numero}`} subtitulo={`${loja.data?.nome ?? situacao.unidade_nome}${quando ? ` · ${quando}` : ""}`} icone={Receipt}>
        <p className="text-sm">Vendedor: {vendedor.data?.nome ?? "—"}{v.cliente_nome ? ` · Cliente: ${v.cliente_nome}` : ""}
          {v.cliente_id && buscaCliente.data && <> · <Link href={`/clientes/${v.cliente_id}`} className="font-semibold text-acao">ficha do cliente</Link></>}</p>
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
          {centavosDoBanco(v.devolvido_centavos) > 0 && <><dt>Devolvido</dt><dd className="text-right">− {brl(centavosDoBanco(v.devolvido_centavos))}</dd></>}
        </dl>
        <ul className="mt-2 space-y-1 text-xs">
          {pagamentos.data.map((p) => (
            <li key={p.ordem} className="numeros">{nomeDoMeio(p.meio)}: {brl(centavosDoBanco(p.valor_centavos))}{centavosDoBanco(p.entrada_centavos) > 0 ? ` (entrada ${brl(centavosDoBanco(p.entrada_centavos))})` : ""}{p.comprovante ? ` · comprovante ${p.comprovante}` : ""}{p.situacao === "estornado" ? " · estornado" : p.situacao === "estorno_pendente" ? " · estorno a confirmar" : ""}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-suave">Comprovante interno, sem valor fiscal. A nota fiscal é pedida abaixo e segue o fluxo combinado com o contador.</p>
      </Cartao>
      {textoDoParametro(parametros.cliente) === "1" && <Aviso tom="sucesso">Cliente da venda atualizado; o motivo ficou na auditoria.</Aviso>}
      {v.situacao === "concluida" && buscaCliente.data && (
        <details className="rounded-xl border border-borda bg-white px-3 py-2">
          <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao"><UserRound aria-hidden className="size-4" /> {v.cliente_id ? "Trocar ou tirar o cliente da venda" : "Ligar a venda a um cliente da rede"}</summary>
          <form action={vincularClienteNaVenda} className="mt-2 space-y-2">
            <input type="hidden" name="venda" value={v.id} />
            <BuscaDeCliente modo="escolher" />
            {v.cliente_id && <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="tirar" value="sim" className="size-4 accent-acao" /> Tirar o cliente desta venda</label>}
            <label className="block text-sm font-medium">Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={200} placeholder="Cliente esqueceu o CPF na hora" className={campo} /></label>
            <Botao type="submit" tamanho="sm">Gravar</Botao>
          </form>
        </details>
      )}
      {v.situacao === "concluida" && (nota.data || podePedirNota.data) && (
        <Cartao titulo="Nota fiscal" icone={FileText}>
          {nota.data ? (
            <div className="space-y-2 text-sm">
              <p><Selo tom={nota.data.situacao === "emitida" ? "sucesso" : nota.data.situacao === "correcao_solicitada" ? "aviso" : "info"} ponto>
                {Object.hasOwn(SITUACOES_DA_NOTA, nota.data.situacao) ? SITUACOES_DA_NOTA[nota.data.situacao as SituacaoDaNota] : nota.data.situacao}</Selo></p>
              {(nota.data.destinatario_nome || nota.data.destinatario_mascarado) && <p className="text-xs text-suave">Na nota: {[nota.data.destinatario_nome, nota.data.destinatario_mascarado].filter(Boolean).join(" · ")}</p>}
              {nota.data.observacao && <p className="text-xs">Observação: {nota.data.observacao}</p>}
              {nota.data.situacao === "emitida" && (
                <p className="numeros break-all text-xs">{MODELOS_DE_NOTA[nota.data.modelo ?? ""] ?? `Modelo ${nota.data.modelo}`} nº {nota.data.numero_documento} · série {nota.data.serie}<br />{chaveEmGrupos(nota.data.chave_acesso ?? "")}</p>
              )}
              {nota.data.situacao === "correcao_solicitada" && (nota.data.solicitado_por === usuario.id || aprovaNota.data) && (
                <form action={corrigirNota} className="grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="pedido" value={nota.data.id} /><input type="hidden" name="venda" value={v.id} />
                  <label className="text-xs font-medium">Nome na nota (opcional)<input name="nome" maxLength={120} className={campo} /></label>
                  <label className="text-xs font-medium">CPF ou CNPJ (opcional)<input name="documento" inputMode="numeric" autoComplete="off" className={campo} /></label>
                  <div><Botao type="submit" tamanho="sm">Enviar correção</Botao></div>
                </form>
              )}
            </div>
          ) : (
            <form action={pedirNota} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="venda" value={v.id} /><input type="hidden" name="chave" value={randomUUID()} />
              <label className="text-xs font-medium">Nome na nota (opcional)<input name="nome" maxLength={120} className={campo} /></label>
              <label className="text-xs font-medium">CPF ou CNPJ na nota (opcional)<input name="documento" inputMode="numeric" autoComplete="off" className={campo} /></label>
              <p className="text-xs text-suave sm:col-span-2">O pedido vai para a fila do dono e do gerente; o CPF fica guardado só até a emissão.</p>
              <div><Botao type="submit" tamanho="sm">Pedir nota fiscal</Botao></div>
            </form>
          )}
        </Cartao>
      )}
      {devolucoes.data.length > 0 && (
        <Cartao titulo="Devoluções" icone={Undo2}>
          <ul className="divide-y divide-borda text-sm">
            {devolucoes.data.map((d) => {
              const notaDaDevolucao = notasDeDevolucao.data.find((n) => n.devolucao_id === d.id);
              const vale = d.vales_troca;
              return (
                <li key={d.id} className="space-y-1 py-2">
                  <p className="flex justify-between gap-2 font-semibold"><span>Nº {d.numero} · {d.motivo}</span><span className="numeros">{brl(centavosDoBanco(d.valor_centavos))}</span></p>
                  <p className="text-xs text-suave">{d.venda_devolucao_itens.map((i) => `${nomeDoItem(i.venda_item_id)} × ${i.quantidade}${i.condicao ? ` (${CONDICOES_DE_RETORNO[i.condicao as keyof typeof CONDICOES_DE_RETORNO] ?? i.condicao})` : ""}`).join(" · ")}</p>
                  <p className="numeros text-xs">{d.venda_devolucao_reembolsos.map((r) => `${nomeDoMeio(r.meio)} ${brl(centavosDoBanco(r.valor_centavos))}`).join(" · ")}</p>
                  {vale && <p className="text-xs">Vale-troca nº <strong>{vale.numero}</strong> · saldo {brl(centavosDoBanco(vale.saldo_centavos))}</p>}
                  {notaDaDevolucao && <p className="text-xs text-suave">Nota de devolução: {Object.hasOwn(SITUACOES_DA_NOTA, notaDaDevolucao.situacao) ? SITUACOES_DA_NOTA[notaDaDevolucao.situacao as SituacaoDaNota] : notaDaDevolucao.situacao}</p>}
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}
      {estornos.data.length > 0 && (
        <Cartao titulo="Estornos de cartão, Pix e financeira" subtitulo="Só ficam confirmados com o código do comprovante do estorno." icone={RotateCcw}>
          <ul className="divide-y divide-borda text-sm">
            {estornos.data.map((e) => (
              <li key={e.id} className="space-y-2 py-2">
                <p className="flex justify-between gap-2"><span>{nomeDoMeio(e.meio)}{e.devolucao_id ? " · devolução" : " · cancelamento"}</span><span className="numeros font-semibold">{brl(centavosDoBanco(e.valor_centavos))}</span></p>
                {e.situacao === "confirmado"
                  ? <p className="text-xs"><Selo tom="sucesso" ponto>confirmado</Selo> comprovante {e.comprovante}</p>
                  : podeCancelar.data
                    ? (
                      <form action={confirmarEstorno} className="grid gap-2 sm:grid-cols-2">
                        <input type="hidden" name="venda" value={v.id} /><input type="hidden" name="estorno" value={e.id} />
                        <label className="text-xs font-medium">Comprovante do estorno<input name="comprovante" required minLength={4} maxLength={60} autoComplete="off" className={campo} /></label>
                        <label className="text-xs font-medium">Observação (opcional)<input name="observacao" maxLength={500} className={campo} /></label>
                        <div><Botao type="submit" tamanho="sm" variante="secundario">Confirmar estorno</Botao></div>
                      </form>
                    )
                    : <p className="text-xs"><Selo tom="aviso" ponto>a confirmar</Selo></p>}
              </li>
            ))}
          </ul>
        </Cartao>
      )}
      {retornos.data.length > 0 && (
        <Cartao titulo="Itens a receber de volta" subtitulo="O item só volta ao estoque conferido: IMEI/ICCID e condição." icone={PackageCheck}>
          <ul className="divide-y divide-borda text-sm">
            {retornos.data.map((r) => {
              const itemVendido = itens.data.find((i) => i.id === r.venda_item_id);
              const serial = serializados.data.find((x) => x.id === itemVendido?.item_serializado_id);
              return (
                <li key={r.id} className="space-y-2 py-2">
                  <p>{nomeDoItem(r.venda_item_id)} × {r.quantidade}{serial ? <span className="numeros block text-xs text-suave">{serial.imei ? "IMEI" : "ICCID"} {serial.imei ?? serial.iccid}</span> : null}</p>
                  {r.situacao === "recebido" && <p className="text-xs"><Selo tom="sucesso" ponto>recebido</Selo> {CONDICOES_DE_RETORNO[r.condicao as keyof typeof CONDICOES_DE_RETORNO] ?? r.condicao}</p>}
                  {r.situacao === "nao_recebido" && <p className="text-xs"><Selo tom="perigo" ponto>não voltou</Selo> {r.observacao}</p>}
                  {r.situacao === "pendente" && (podeCancelar.data ? (
                    <form action={conferirRetorno} className="grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="venda" value={v.id} /><input type="hidden" name="retorno" value={r.id} />
                      <label className="text-xs font-medium">O item voltou?<select name="recebido" defaultValue="sim" className={campo}><option value="sim">Sim, está na loja</option><option value="nao">Não voltou</option></select></label>
                      <label className="text-xs font-medium">Condição<select name="condicao" defaultValue="" className={campo}>
                        <option value="" disabled>escolha a condição</option>
                        {Object.entries(CONDICOES_DE_RETORNO).map(([codigo, nome]) => <option key={codigo} value={codigo}>{nome}</option>)}
                      </select></label>
                      {serial && <label className="text-xs font-medium sm:col-span-2">IMEI/ICCID conferido no item<input name="identificador" inputMode="numeric" autoComplete="off" className={campo} /></label>}
                      <label className="text-xs font-medium sm:col-span-2">Observação (obrigatória se não voltou)<input name="observacao" maxLength={500} className={campo} /></label>
                      <div><Botao type="submit" tamanho="sm" variante="secundario">Registrar conferência</Botao></div>
                    </form>
                  ) : <p className="text-xs"><Selo tom="aviso" ponto>aguardando conferência</Selo></p>)}
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}
      {v.situacao === "concluida" && podeCancelar.data && restantes.length > 0 && !financiada && (
        <details className="rounded-cartao border border-borda bg-white p-4 text-sm"><summary className="cursor-pointer font-semibold">Devolver ou trocar itens</summary>
          <form action={devolverItens} className="mt-3 space-y-3">
            <input type="hidden" name="venda" value={v.id} /><input type="hidden" name="chave" value={randomUUID()} />
            <ul className="space-y-2">
              {restantes.map((i) => (
                <li key={i.id} className="grid gap-2 sm:grid-cols-3">
                  <span className="self-center">{nomeDoItem(i.id)}<span className="block text-xs text-suave">resta {i.restante}</span></span>
                  <label className="text-xs font-medium">Devolver<input name={`devolver_${i.id}`} type="number" min={0} max={i.restante} defaultValue={0} className={campo} /></label>
                  {FISICOS.has(i.tipo) && (
                    <label className="text-xs font-medium">Condição (obrigatória)<select name={`condicao_${i.id}`} defaultValue="" className={campo}>
                      <option value="" disabled>escolha a condição</option>
                      {Object.entries(CONDICOES_DE_RETORNO).map(([codigo, nome]) => <option key={codigo} value={codigo}>{nome}</option>)}
                    </select></label>
                  )}
                  {i.item_serializado_id && (
                    <label className="text-xs font-medium sm:col-span-3">IMEI/ICCID do item devolvido (confira no aparelho ou no chip)
                      <input name={`identificador_${i.id}`} inputMode="numeric" autoComplete="off" className={campo} /></label>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-suave">O valor devolvido é o preço do item menos a parte do desconto. Reembolse nos meios que a venda usou (até o que cada um pagou) ou em vale-troca para uma nova venda. Dinheiro sai do SEU caixa; cartão e Pix ficam como estorno a confirmar com o comprovante.</p>
            {[1, 2, 3].map((n) => (
              <div key={n} className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium">Reembolso {n}<select name={`reembolso_${n}_meio`} className={campo} defaultValue={n === 1 ? "dinheiro" : "vale_troca"}>
                  {meiosDeReembolso.map((m) => <option key={m} value={m}>{nomeDoMeio(m)}</option>)}
                </select></label>
                <label className="text-xs font-medium">Valor (R$)<input name={`reembolso_${n}_valor`} inputMode="decimal" className={campo} /></label>
              </div>
            ))}
            <label className="block text-xs font-medium">Motivo (fica na auditoria)<input name="motivo" required minLength={3} className={campo} /></label>
            <Botao type="submit" tamanho="sm" variante="secundario">Registrar devolução</Botao>
          </form>
        </details>
      )}
      {v.situacao === "concluida" && podeCancelar.data && devolucoes.data.length === 0 && (
        <details className="text-sm"><summary className="cursor-pointer font-semibold text-perigo">Cancelar esta venda (estorno)</summary>
          <form action={cancelarVenda} className="mt-2 space-y-2">
            <input type="hidden" name="venda" value={v.id} /><input type="hidden" name="voltar" value="comprovante" />
            <label className="block text-xs font-medium">Motivo (fica na auditoria)<input name="motivo" required minLength={3} className={campo} /></label>
            <p className="text-xs text-suave">O dinheiro sai do SEU caixa aberto (o recebido, sem o troco). Cartão, Pix e financeira ficam como estorno a confirmar com o comprovante. Aparelho, chip e acessório só voltam ao estoque quando forem recebidos e conferidos aqui.</p>
            <Botao type="submit" tamanho="sm" variante="perigo">Cancelar com estorno</Botao>
          </form>
        </details>
      )}
    </MoldeReal>
  );
}

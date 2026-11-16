import { randomUUID } from "node:crypto";

import { ScanLine, ShoppingCart, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MEIOS } from "@ora5g/dominio";

import { BotaoConfirmar } from "../../componentes/BotaoConfirmar";
import { LerCodigo } from "../../componentes/LerCodigo";
import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { centavosDoBanco } from "../../lib/dinheiro";
import { brl } from "../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { avisoDaReservaAtendida } from "../../lib/loja/reserva";
import { soltarReservasDoSiteVencidas } from "../../lib/loja/reservas-vencidas";
import { buscarNoCatalogo, filtroDoIdentificador, identificadorDigitado, termoDaBusca } from "../../lib/catalogo/busca";
import { osDosItens, type OsDoItem } from "../../lib/vendas/os-dos-itens";
import { ERROS_DA_VENDA } from "../../lib/vendas/regras";
import { FotoAmpliavel } from "../catalogo/FotoAmpliavel";
import { BuscaDeCliente } from "../clientes/BuscaDeCliente";
import { abrirCaixa, adicionarItem, aplicarDesconto, cancelarVenda, concluirVenda, novaVenda, pedirAprovacao, removerItem } from "./acoes";
import { regraNaTela, regrasDosItens } from "../../lib/vendas/regra-de-preco";

export const metadata: Metadata = { title: "Vender" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const FISICOS = new Set(["aparelho", "chip", "acessorio"]);
const final = (texto: string | null) => (texto ? `•••• ${texto.slice(-6)}` : "");
const MEIOS_DA_LOJA = (Object.keys(MEIOS) as (keyof typeof MEIOS)[]).filter((m) => m !== "link_pagamento");

// PDV real (ADR-004): loja do turno, caixa aberto, carrinho com reserva, desconto com aprovação,
// pagamento misto e conclusão no banco. O navegador nunca recebe custo nem calcula o total final.
export default async function Vender({ searchParams }: { searchParams: Promise<{ q?: ValorDeParametro; erro?: ValorDeParametro; desconto?: ValorDeParametro; cancelada?: ValorDeParametro; os?: ValorDeParametro; reserva?: ValorDeParametro; anunciado?: ValorDeParametro; atual?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DA_VENDA, parametros.erro);
  const busca = termoDaBusca(textoDoParametro(parametros.q)).slice(0, 40);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;

  const [pode, aprova, caixa, venda, buscaCliente, maquininhas] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "venda.registrar", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "desconto.aprovar", p_unidade: unidade }),
    supabase.from("caixas").select("id, aberto_em").eq("operador_id", usuario.id).eq("unidade_id", unidade).eq("situacao", "aberto").maybeSingle(),
    supabase.from("vendas").select("id, numero, situacao").eq("vendedor_id", usuario.id).eq("unidade_id", unidade)
      .in("situacao", ["rascunho", "aguardando_aprovacao"]).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("tem_permissao", { p_permissao: "cliente.buscar", p_unidade: unidade }),
    // Maquininhas ativas da loja (L7a): quem paga por maquininha escolhe qual foi usada.
    supabase.from("terminais").select("id, provedor, apelido, identificador").eq("unidade_id", unidade).eq("ativo", true).order("apelido"),
    // ONLINE-b: o aparelho de uma reserva do site vencida volta livre antes de a tela ler o estoque (mais abaixo).
    soltarReservasDoSiteVencidas(supabase),
  ]);
  if (pode.error || aprova.error || caixa.error || venda.error || buscaCliente.error || maquininhas.error) throw new FalhaDoServico("vender");

  if (!pode.data) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Seu papel não registra vendas nesta loja.</Aviso></MoldeReal>;
  }

  // Carrinho
  const itens = venda.data
    ? await supabase.from("venda_itens").select("id, variante_id, item_serializado_id, tipo, quantidade, preco_unitario_centavos, desconto_centavos").eq("venda_id", venda.data.id).order("criado_em")
    : { data: [], error: null };
  if (itens.error) throw new FalhaDoServico("venda_itens");
  // A regra de preço de cada item (L6b), lida à parte: no carrinho só aparece quando é campanha. Banco sem
  // a migration ou falha de leitura não atrapalham a venda.
  const regras = venda.data && itens.data.length > 0 ? await regrasDosItens(supabase, venda.data.id) : ({ estado: "indisponivel" } as const);
  // O conserto da OS no carrinho (L12c): o número da OS, lido à parte (sem a migration, o item aparece pelo nome).
  const daOs = venda.data && itens.data.some((i) => i.tipo === "servico") ? await osDosItens(supabase, venda.data.id) : new Map<string, OsDoItem>();
  // Busca igual à do catálogo e do estoque (lib/catalogo/busca.ts): pelo nome do produto, nome da
  // variação ou SKU, ou direto pelo IMEI, segundo IMEI ou ICCID do item desta loja.
  const numero = busca ? identificadorDigitado(busca) : null;
  const porNumero = numero
    ? await supabase.from("itens_serializados").select("id, variante_id, imei, iccid, situacao").or(filtroDoIdentificador(numero)).eq("unidade_id", unidade).limit(1)
    : { data: [], error: null };
  const achados = busca && !numero ? await buscarNoCatalogo(supabase, busca, { limite: 40 }) : null;
  const porNome = achados?.variantes.length
    ? await supabase.from("variantes").select("id, sku, nome, produto_id").in("id", achados.variantes).order("sku").limit(8)
    : { data: [], error: null };
  if (porNumero.error || porNome.error) throw new FalhaDoServico("busca");

  const idsVariantes = [...new Set([...itens.data.map((i) => i.variante_id), ...porNome.data.map((v) => v.id), ...porNumero.data.map((i) => i.variante_id)])];
  const [variantes, saldos, disponiveis, aprovacoes, serializados] = await Promise.all([
    idsVariantes.length ? supabase.from("variantes").select("id, sku, nome, produto_id, produtos(nome, tipo)").in("id", idsVariantes) : Promise.resolve({ data: [], error: null }),
    idsVariantes.length ? supabase.from("estoque_saldos").select("variante_id, quantidade, reservado").eq("unidade_id", unidade).in("variante_id", idsVariantes) : Promise.resolve({ data: [], error: null }),
    porNome.data.length ? supabase.from("itens_serializados").select("id, variante_id, imei, iccid").eq("unidade_id", unidade).eq("situacao", "disponivel").eq("em_estoque", true).in("variante_id", porNome.data.map((v) => v.id)).limit(40) : Promise.resolve({ data: [], error: null }),
    venda.data ? supabase.from("aprovacoes_desconto").select("item_id, situacao, expira_em").eq("venda_id", venda.data.id).order("solicitado_em", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    itens.data.some((i) => i.item_serializado_id) ? supabase.from("itens_serializados").select("id, imei, iccid").in("id", itens.data.flatMap((i) => (i.item_serializado_id ? [i.item_serializado_id] : []))) : Promise.resolve({ data: [], error: null }),
  ]);
  if (variantes.error || saldos.error || disponiveis.error || aprovacoes.error || serializados.error) throw new FalhaDoServico("vender_detalhes");
  const resultados = [...porNome.data.map((v) => v.id), ...porNumero.data.map((i) => i.variante_id)];
  const precos = new Map(await Promise.all(resultados.map(async (id) => {
    const r = await supabase.rpc("preco_vigente", { p_variante: id, p_unidade: unidade });
    return [id, r.error || r.data === null ? null : centavosDoBanco(r.data)] as const;
  })));
  const produtoIds = [...new Set((variantes.data ?? []).map((v) => v.produto_id))];
  const fotos = produtoIds.length ? await supabase.from("fotos_produto").select("produto_id, variante_id, caminho, ilustracao").in("produto_id", produtoIds).is("substituida_em", null) : { data: [], error: null };
  if (fotos.error) throw new FalhaDoServico("fotos");
  const assinadas = fotos.data.length ? await supabase.storage.from("produtos").createSignedUrls(fotos.data.map((f) => f.caminho), 3600) : { data: [], error: null };
  const urlDe = new Map((assinadas.data ?? []).map((a) => [a.path, a.error ? null : a.signedUrl]));

  const variante = (id: string) => (variantes.data ?? []).find((v) => v.id === id);
  const fotoDaVariante = (id: string) => {
    const v = variante(id);
    const f = fotos.data.find((x) => x.variante_id === id) ?? fotos.data.find((x) => x.produto_id === v?.produto_id && x.variante_id === null);
    return { url: f ? (urlDe.get(f.caminho) ?? null) : null, ilustracao: f?.ilustracao ?? false };
  };
  const tipoDe = (id: string) => (variante(id)?.produtos as { tipo?: string } | null)?.tipo ?? "";
  const livre = (id: string) => {
    const s = (saldos.data ?? []).find((x) => x.variante_id === id);
    return s ? centavosDoBanco(s.quantidade) - centavosDoBanco(s.reservado) : 0;
  };
  const subtotal = itens.data.reduce((t, i) => t + centavosDoBanco(i.preco_unitario_centavos) * i.quantidade, 0);
  const descontos = itens.data.reduce((t, i) => t + centavosDoBanco(i.desconto_centavos), 0);
  const statusDoItem = (id: string) => (aprovacoes.data ?? []).find((a) => a.item_id === id)?.situacao;

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Vender" />
      {erro && <Aviso tom="perigo">{ERROS_DA_VENDA[erro]}</Aviso>}
      {textoDoParametro(parametros.desconto) === "pedir" && <Aviso tom="aviso">Esse desconto passa do limite: peça a aprovação do gerente ou do dono.</Aviso>}
      {textoDoParametro(parametros.cancelada) === "1" && <Aviso tom="info">Venda cancelada. Os itens voltaram para o estoque da loja.</Aviso>}
      {/* ONLINE-b: a reserva do site atendida abre a venda com a unidade reservada; a oferta anunciada obriga. */}
      {textoDoParametro(parametros.reserva) === "atendida" && (() => {
        const aviso = avisoDaReservaAtendida(textoDoParametro(parametros.anunciado), textoDoParametro(parametros.atual));
        return <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>;
      })()}
      {textoDoParametro(parametros.os) === "no_carrinho" && <Aviso tom="sucesso">O conserto da OS entrou no carrinho pelo valor do orçamento aprovado. Conclua a venda; depois registre a entrega na OS.</Aviso>}

      {!caixa.data && (
        <Cartao titulo="Abra o seu caixa" subtitulo="Sem caixa aberto, a venda não é concluída." icone={Wallet}>
          <form action={abrirCaixa} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <label className="text-sm font-medium">Fundo de troco (R$)<input name="fundo" inputMode="decimal" required defaultValue="0,00" className={campo} /></label>
            <Botao type="submit">Abrir caixa</Botao>
          </form>
        </Cartao>
      )}

      {!venda.data ? (
        <form action={novaVenda}><input type="hidden" name="chave" value={randomUUID()} /><Botao type="submit" tamanho="lg" className="w-full"><ShoppingCart aria-hidden className="size-5" /> Nova venda</Botao></form>
      ) : (
        <>
          <Cartao titulo={`Venda nº ${venda.data.numero}`} subtitulo={venda.data.situacao === "aguardando_aprovacao" ? "Aguardando aprovação de desconto" : "Em andamento"} icone={ShoppingCart}>
            <form className="flex flex-wrap items-end gap-2" role="search">
              <label className="min-w-0 flex-1 text-sm font-medium">Produto, marca, SKU, código de barras ou IMEI/ICCID<input id="busca-pdv" name="q" defaultValue={busca} className={campo} autoComplete="off" placeholder="Ex.: galaxy, APA-0002 ou o final do IMEI" /></label>
              <LerCodigo alvo="busca-pdv" />
              <button type="submit" className="min-h-11 rounded-botao bg-acao px-4 text-sm font-semibold text-white"><ScanLine aria-hidden className="inline size-4" /> Buscar</button>
            </form>
            {busca && resultados.length === 0 && <p className="mt-3 text-sm text-suave">Nada encontrado nesta loja.</p>}
            <ul className="mt-3 space-y-3">
              {[...new Set(resultados)].map((id) => {
                const v = variante(id);
                if (!v) return null;
                const tipo = tipoDe(id);
                const preco = precos.get(id);
                const foto = fotoDaVariante(id);
                const itensDoNumero = porNumero.data.filter((i) => i.variante_id === id);
                const itensLivres = itensDoNumero.length ? itensDoNumero.filter((i) => i.situacao === "disponivel") : (disponiveis.data ?? []).filter((i) => i.variante_id === id).slice(0, 6);
                return (
                  <li key={id} className="flex gap-3 rounded-xl border border-borda p-3">
                    <FotoAmpliavel url={foto.url} rotulo={`${v.nome} (${v.sku})`} ilustracao={foto.ilustracao} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold">{v.nome}</p>
                      <p className="numeros text-xs text-suave">{v.sku} · {preco === null || preco === undefined ? "sem preço nesta loja" : brl(preco)}{FISICOS.has(tipo) ? ` · ${livre(id)} livre(s) aqui` : ""}</p>
                      {preco !== null && preco !== undefined && (tipo === "aparelho" || tipo === "chip" ? (
                        itensLivres.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {itensLivres.map((i) => (
                              <form key={i.id} action={adicionarItem}>
                                <input type="hidden" name="venda" value={venda.data?.id} /><input type="hidden" name="variante" value={id} /><input type="hidden" name="item" value={i.id} /><input type="hidden" name="chave" value={randomUUID()} />
                                <Botao type="submit" tamanho="sm" variante="secundario" className="numeros">{tipo === "chip" ? "ICCID" : "IMEI"} {final(i.imei ?? i.iccid)}</Botao>
                              </form>
                            ))}
                          </div>
                        ) : <p className="mt-1 text-xs text-aviso">Nenhum disponível nesta loja.</p>
                      ) : (
                        <form action={adicionarItem} className="mt-2 flex items-end gap-2">
                          <input type="hidden" name="venda" value={venda.data?.id} /><input type="hidden" name="variante" value={id} /><input type="hidden" name="chave" value={randomUUID()} />
                          <label className="text-xs font-medium">Qtd.<input name="quantidade" type="number" min={1} max={99} defaultValue={1} className={`${campo} w-20`} /></label>
                          <Botao type="submit" tamanho="sm">Adicionar</Botao>
                        </form>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Cartao>

          <Cartao titulo="Carrinho">
            {itens.data.length === 0 ? <p className="text-sm text-suave">Busque um produto para começar.</p> : (
              <ul className="divide-y divide-borda">
                {itens.data.map((i) => {
                  const v = variante(i.variante_id);
                  const serial = (serializados.data ?? []).find((s) => s.id === i.item_serializado_id);
                  const linha = centavosDoBanco(i.preco_unitario_centavos) * i.quantidade;
                  const desconto = centavosDoBanco(i.desconto_centavos);
                  const aprovacao = statusDoItem(i.id);
                  const regra = regraNaTela(regras, i.id);
                  const os = daOs.get(i.id);
                  return (
                    <li key={i.id} className="space-y-2 py-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <span><strong>{os ? `Conserto da OS nº ${os.numero ?? "—"}` : (v?.nome ?? "Item")}</strong>
                          {os && <span className="block text-xs text-suave">valor do orçamento aprovado · <Link href={`/assistencia/${os.os}`} className="font-semibold text-acao">ver a OS</Link></span>}<span className="numeros block text-xs text-suave">{v?.sku} {serial ? `· ${final(serial.imei ?? serial.iccid)}` : ""} · {i.quantidade} × {brl(centavosDoBanco(i.preco_unitario_centavos))}</span>
                          {regra?.campanha && <span className="block text-xs font-semibold text-acao">{regra.texto}</span>}</span>
                        <span className="numeros text-right font-semibold">{brl(linha - desconto)}{desconto > 0 && <span className="block text-xs font-normal text-suave">desconto {brl(desconto)}</span>}</span>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <form action={aplicarDesconto} className="flex items-end gap-2">
                          <input type="hidden" name="item" value={i.id} />
                          <label className="text-xs font-medium">Desconto (R$)<input name="desconto" inputMode="decimal" required defaultValue={(desconto / 100).toFixed(2).replace(".", ",")} className={`${campo} w-28`} /></label>
                          <Botao type="submit" tamanho="sm" variante="secundario">Aplicar</Botao>
                        </form>
                        <form action={removerItem}><input type="hidden" name="item" value={i.id} /><Botao type="submit" tamanho="sm" variante="fantasma">Tirar</Botao></form>
                        {aprovacao === "pendente" && <Selo tom="aviso" ponto>aprovação pendente</Selo>}
                        {aprovacao === "aprovada" && <Selo tom="sucesso" ponto>desconto aprovado</Selo>}
                        {aprovacao === "negada" && <Selo tom="perigo" ponto>desconto negado</Selo>}
                      </div>
                      {desconto > 0 && aprovacao !== "pendente" && aprovacao !== "aprovada" && (
                        <details><summary className="cursor-pointer text-xs font-semibold text-acao">Pedir aprovação deste desconto</summary>
                          <form action={pedirAprovacao} className="mt-2 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="item" value={i.id} />
                            <label className="min-w-0 flex-1 text-xs font-medium">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
                            <Botao type="submit" tamanho="sm">Pedir</Botao>
                          </form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <dl className="numeros mt-3 grid grid-cols-2 gap-1 border-t border-borda pt-3 text-sm">
              <dt>Subtotal</dt><dd className="text-right">{brl(subtotal)}</dd>
              <dt>Descontos</dt><dd className="text-right">− {brl(descontos)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right text-lg font-bold">{brl(subtotal - descontos)}</dd>
            </dl>
          </Cartao>

          {itens.data.length > 0 && (
            <Cartao titulo="Pagamento" subtitulo="Cartão e Pix: informe o código do comprovante. Vale-troca: o número do vale no mesmo campo. Financiamento: valor financiado e a entrada; entrada por Pix ou cartão leva o comprovante dela no mesmo campo. Troco só sai de pagamento em dinheiro.">
              <form action={concluirVenda} className="space-y-3">
                <input type="hidden" name="venda" value={venda.data.id} /><input type="hidden" name="chave" value={randomUUID()} />
                {[1, 2, 3].map((n) => (
                  <fieldset key={n} className="grid gap-2 rounded-xl border border-borda p-2 sm:grid-cols-3">
                    <legend className="px-1 text-xs font-semibold">Pagamento {n}{n > 1 ? " (opcional)" : ""}</legend>
                    <label className="text-xs font-medium">Meio<select name={`pagamento_${n}_meio`} className={campo} defaultValue="dinheiro">{MEIOS_DA_LOJA.map((m) => <option key={m} value={m}>{MEIOS[m].nome}</option>)}</select></label>
                    <label className="text-xs font-medium">Valor (R$)<input name={`pagamento_${n}_valor`} inputMode="decimal" defaultValue={n === 1 ? ((subtotal - descontos) / 100).toFixed(2).replace(".", ",") : ""} className={campo} /></label>
                    <label className="text-xs font-medium">Comprovante ou nº do vale<input name={`pagamento_${n}_comprovante`} className={campo} autoComplete="off" /></label>
                    {maquininhas.data.length > 0 && (
                      <label className="text-xs font-medium">Maquininha (cartão e Pix na maquininha)<select name={`pagamento_${n}_terminal`} defaultValue="" className={campo}>
                        <option value="">nenhuma</option>
                        {maquininhas.data.map((m) => <option key={m.id} value={m.id}>{m.apelido} · {m.provedor === "picpay" ? "PicPay" : "PagBank"} {m.identificador}</option>)}
                      </select></label>
                    )}
                    <label className="text-xs font-medium">Entrada (financiamento)<input name={`pagamento_${n}_entrada`} inputMode="decimal" className={campo} /></label>
                    <label className="text-xs font-medium">Meio da entrada<select name={`pagamento_${n}_meio_entrada`} className={campo} defaultValue="dinheiro">{MEIOS_DA_LOJA.filter((m) => !MEIOS[m].financeira && m !== "vale_troca").map((m) => <option key={m} value={m}>{MEIOS[m].nome}</option>)}</select></label>
                  </fieldset>
                ))}
                {buscaCliente.data && (
                  <div className="space-y-1 rounded-xl border border-borda p-2">
                    <p className="px-1 text-xs font-semibold">Cliente da rede (opcional): CPF ou telefone completos</p>
                    <BuscaDeCliente modo="escolher" />
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium">Nome do cliente (opcional)<input name="cliente_nome" className={campo} /></label>
                  <label className="text-xs font-medium">E-mail do cliente (obrigatório na PayJoy)<input name="cliente_email" type="email" className={campo} /></label>
                </div>
                <BotaoConfirmar className="w-full" enquanto="Confirmando a venda no sistema…" disabled={!caixa.data || venda.data.situacao === "aguardando_aprovacao"}>Concluir venda</BotaoConfirmar>
                {!caixa.data && <p className="text-xs text-aviso">Abra o caixa para concluir.</p>}
              </form>
            </Cartao>
          )}

          <details className="text-sm"><summary className="cursor-pointer font-semibold text-perigo">Cancelar esta venda</summary>
            <form action={cancelarVenda} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="venda" value={venda.data.id} />
              <label className="min-w-0 flex-1 text-xs font-medium">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
              <Botao type="submit" tamanho="sm" variante="perigo">Cancelar venda</Botao>
            </form>
          </details>
        </>
      )}
    </MoldeReal>
  );
}

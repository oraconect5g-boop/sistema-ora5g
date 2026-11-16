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
import { consultarTelaDoPdv } from "../../lib/vendas/pdv-tela";
import { ERROS_DA_VENDA } from "../../lib/vendas/regras";
import { FotoAmpliavel } from "../catalogo/FotoAmpliavel";
import { BuscaDeCliente } from "../clientes/BuscaDeCliente";
import { abrirCaixa, adicionarItem, aplicarDesconto, cancelarVenda, concluirVenda, novaVenda, pedirAprovacao, removerItem } from "./acoes";

export const metadata: Metadata = { title: "Vender" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const FISICOS = new Set(["aparelho", "chip", "acessorio"]);
const final = (texto: string | null) => (texto ? `•••• ${texto.slice(-6)}` : "");
const MEIOS_DA_LOJA = (Object.keys(MEIOS) as (keyof typeof MEIOS)[]).filter((m) => m !== "link_pagamento");

// PDV real (ADR-004): loja do turno, caixa aberto, carrinho com reserva, desconto com aprovação,
// pagamento misto e conclusão no banco. O navegador nunca recebe custo nem calcula o total final.
// VEL-a (ORA-QUAL-010, ORA-POS-002): a tela abre com duas idas ao banco: a sessão, que já traz as permissões
// (public.molde_da_sessao), e a tela inteira (public.pdv_tela: caixa, venda, carrinho e maquininhas). Antes eram até
// nove idas seguidas. Só a busca de produto faz mais idas, e só quando há venda aberta e algo digitado.
export default async function Vender({ searchParams }: { searchParams: Promise<{ q?: ValorDeParametro; erro?: ValorDeParametro; desconto?: ValorDeParametro; cancelada?: ValorDeParametro; os?: ValorDeParametro; reserva?: ValorDeParametro; anunciado?: ValorDeParametro; atual?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DA_VENDA, parametros.erro);
  const busca = termoDaBusca(textoDoParametro(parametros.q)).slice(0, 40);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  // As permissões vieram com a sessão, conferidas pelo banco na loja do turno: a tela não pergunta de novo. Cada
  // ação (abrir caixa, pôr item, concluir) continua conferida pelo banco na hora.
  const { permissoes } = sessao.molde;

  if (!permissoes.has("venda.registrar")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Seu papel não registra vendas nesta loja.</Aviso></MoldeReal>;
  }

  // Busca igual à do catálogo e do estoque (lib/catalogo/busca.ts): pelo nome do produto, nome da
  // variação ou SKU, ou direto pelo IMEI, segundo IMEI ou ICCID do item desta loja.
  const numero = busca ? identificadorDigitado(busca) : null;
  // 1ª ida: a tela inteira numa leitura (lib/vendas/pdv-tela.ts). Junto, o que não depende dela: soltar as reservas
  // do site vencidas (ONLINE-b: o aparelho volta livre antes de a tela ler o estoque, mais abaixo) e achar no
  // catálogo o que foi digitado (a busca do catálogo olha o que está em estoque, que a reserva não muda).
  const [tela, , achados] = await Promise.all([
    consultarTelaDoPdv(supabase),
    soltarReservasDoSiteVencidas(supabase),
    busca && !numero ? buscarNoCatalogo(supabase, busca, { limite: 40 }) : Promise.resolve(null),
  ]);
  const { caixa, venda, itens, terminais } = tela;

  // A busca só aparece dentro da venda aberta: sem venda, não há resultado a mostrar nem o que ler.
  const procurar = venda !== null && busca !== "";
  // 2ª ida, só com busca (depois de soltar as reservas, porque lê a situação do aparelho): o aparelho ou o chip do
  // número digitado, já com a variação dele, ou as variações que o catálogo achou.
  const porNumero = procurar && numero
    ? await supabase.from("itens_serializados").select("id, variante_id, imei, iccid, situacao, variantes(id, sku, nome, produto_id, produtos(nome, tipo))").or(filtroDoIdentificador(numero)).eq("unidade_id", unidade).limit(1)
    : { data: [], error: null };
  const porNome = procurar && achados?.variantes.length
    ? await supabase.from("variantes").select("id, sku, nome, produto_id, produtos(nome, tipo)").in("id", achados.variantes).order("sku").limit(8)
    : { data: [], error: null };
  if (porNumero.error || porNome.error) throw new FalhaDoServico("busca");

  // As variações dos resultados (a do aparelho achado pelo número vem nula quando quem pede não a lê).
  const variantes = [...porNome.data, ...porNumero.data.flatMap((i) => (i.variantes ? [i.variantes] : []))];
  const resultados = [...porNome.data.map((v) => v.id), ...porNumero.data.map((i) => i.variante_id)];
  const produtoIds = [...new Set(variantes.map((v) => v.produto_id))];
  // 3ª ida, só com resultado: o saldo livre, os aparelhos disponíveis, as fotos e o preço vigente, em paralelo.
  const [saldos, disponiveis, fotos, precosLidos] = await Promise.all([
    resultados.length ? supabase.from("estoque_saldos").select("variante_id, quantidade, reservado").eq("unidade_id", unidade).in("variante_id", resultados) : Promise.resolve({ data: [], error: null }),
    porNome.data.length ? supabase.from("itens_serializados").select("id, variante_id, imei, iccid").eq("unidade_id", unidade).eq("situacao", "disponivel").eq("em_estoque", true).in("variante_id", porNome.data.map((v) => v.id)).limit(40) : Promise.resolve({ data: [], error: null }),
    produtoIds.length ? supabase.from("fotos_produto").select("produto_id, variante_id, caminho, ilustracao").in("produto_id", produtoIds).is("substituida_em", null) : Promise.resolve({ data: [], error: null }),
    Promise.all(resultados.map(async (id) => {
      const r = await supabase.rpc("preco_vigente", { p_variante: id, p_unidade: unidade });
      return [id, r.error || r.data === null ? null : centavosDoBanco(r.data)] as const;
    })),
  ]);
  if (saldos.error || disponiveis.error) throw new FalhaDoServico("vender_detalhes");
  if (fotos.error) throw new FalhaDoServico("fotos");
  const precos = new Map(precosLidos);
  // 4ª ida, só com foto: o endereço assinado de cada foto (o depósito das fotos é fechado).
  const assinadas = fotos.data.length ? await supabase.storage.from("produtos").createSignedUrls(fotos.data.map((f) => f.caminho), 3600) : { data: [], error: null };
  const urlDe = new Map((assinadas.data ?? []).map((a) => [a.path, a.error ? null : a.signedUrl]));

  const variante = (id: string) => variantes.find((v) => v.id === id);
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
  // O carrinho veio inteiro da leitura única, com os valores já conferidos (lib/vendas/pdv-tela.ts).
  const subtotal = itens.reduce((t, i) => t + i.preco_unitario_centavos * i.quantidade, 0);
  const descontos = itens.reduce((t, i) => t + i.desconto_centavos, 0);

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

      {!caixa && (
        <Cartao titulo="Abra o seu caixa" subtitulo="Sem caixa aberto, a venda não é concluída." icone={Wallet}>
          <form action={abrirCaixa} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <label className="text-sm font-medium">Fundo de troco (R$)<input name="fundo" inputMode="decimal" required defaultValue="0,00" className={campo} /></label>
            <Botao type="submit">Abrir caixa</Botao>
          </form>
        </Cartao>
      )}

      {!venda ? (
        <form action={novaVenda}><input type="hidden" name="chave" value={randomUUID()} /><Botao type="submit" tamanho="lg" className="w-full"><ShoppingCart aria-hidden className="size-5" /> Nova venda</Botao></form>
      ) : (
        <>
          <Cartao titulo={`Venda nº ${venda.numero}`} subtitulo={venda.situacao === "aguardando_aprovacao" ? "Aguardando aprovação de desconto" : "Em andamento"} icone={ShoppingCart}>
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
                                <input type="hidden" name="venda" value={venda.id} /><input type="hidden" name="variante" value={id} /><input type="hidden" name="item" value={i.id} /><input type="hidden" name="chave" value={randomUUID()} />
                                <Botao type="submit" tamanho="sm" variante="secundario" className="numeros">{tipo === "chip" ? "ICCID" : "IMEI"} {final(i.imei ?? i.iccid)}</Botao>
                              </form>
                            ))}
                          </div>
                        ) : <p className="mt-1 text-xs text-aviso">Nenhum disponível nesta loja.</p>
                      ) : (
                        <form action={adicionarItem} className="mt-2 flex items-end gap-2">
                          <input type="hidden" name="venda" value={venda.id} /><input type="hidden" name="variante" value={id} /><input type="hidden" name="chave" value={randomUUID()} />
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
            {itens.length === 0 ? <p className="text-sm text-suave">Busque um produto para começar.</p> : (
              <ul className="divide-y divide-borda">
                {itens.map((i) => {
                  // Tudo do item veio na leitura única: o nome e o SKU, o número do aparelho, a regra de preço (L6b: só a
                  // campanha aparece), o conserto da OS (L12c) e a situação do pedido de desconto.
                  const { variante: v, serial, regra, os, aprovacao } = i;
                  const linha = i.preco_unitario_centavos * i.quantidade;
                  const desconto = i.desconto_centavos;
                  return (
                    <li key={i.id} className="space-y-2 py-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <span><strong>{os ? `Conserto da OS nº ${os.numero ?? "—"}` : (v?.nome ?? "Item")}</strong>
                          {os && <span className="block text-xs text-suave">valor do orçamento aprovado · <Link href={`/assistencia/${os.os}`} className="font-semibold text-acao">ver a OS</Link></span>}<span className="numeros block text-xs text-suave">{v?.sku} {serial ? `· ${final(serial.imei ?? serial.iccid)}` : ""} · {i.quantidade} × {brl(i.preco_unitario_centavos)}</span>
                          {regra.campanha && <span className="block text-xs font-semibold text-acao">{regra.texto}</span>}</span>
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

          {itens.length > 0 && (
            <Cartao titulo="Pagamento" subtitulo="Cartão e Pix: informe o código do comprovante. Vale-troca: o número do vale no mesmo campo. Financiamento: valor financiado e a entrada; entrada por Pix ou cartão leva o comprovante dela no mesmo campo. Troco só sai de pagamento em dinheiro.">
              <form action={concluirVenda} className="space-y-3">
                <input type="hidden" name="venda" value={venda.id} /><input type="hidden" name="chave" value={randomUUID()} />
                {[1, 2, 3].map((n) => (
                  <fieldset key={n} className="grid gap-2 rounded-xl border border-borda p-2 sm:grid-cols-3">
                    <legend className="px-1 text-xs font-semibold">Pagamento {n}{n > 1 ? " (opcional)" : ""}</legend>
                    <label className="text-xs font-medium">Meio<select name={`pagamento_${n}_meio`} className={campo} defaultValue="dinheiro">{MEIOS_DA_LOJA.map((m) => <option key={m} value={m}>{MEIOS[m].nome}</option>)}</select></label>
                    <label className="text-xs font-medium">Valor (R$)<input name={`pagamento_${n}_valor`} inputMode="decimal" defaultValue={n === 1 ? ((subtotal - descontos) / 100).toFixed(2).replace(".", ",") : ""} className={campo} /></label>
                    <label className="text-xs font-medium">Comprovante ou nº do vale<input name={`pagamento_${n}_comprovante`} className={campo} autoComplete="off" /></label>
                    {terminais.length > 0 && (
                      <label className="text-xs font-medium">Maquininha (cartão e Pix na maquininha)<select name={`pagamento_${n}_terminal`} defaultValue="" className={campo}>
                        <option value="">nenhuma</option>
                        {terminais.map((m) => <option key={m.id} value={m.id}>{m.apelido} · {m.provedor === "picpay" ? "PicPay" : "PagBank"} {m.identificador}</option>)}
                      </select></label>
                    )}
                    <label className="text-xs font-medium">Entrada (financiamento)<input name={`pagamento_${n}_entrada`} inputMode="decimal" className={campo} /></label>
                    <label className="text-xs font-medium">Meio da entrada<select name={`pagamento_${n}_meio_entrada`} className={campo} defaultValue="dinheiro">{MEIOS_DA_LOJA.filter((m) => !MEIOS[m].financeira && m !== "vale_troca").map((m) => <option key={m} value={m}>{MEIOS[m].nome}</option>)}</select></label>
                  </fieldset>
                ))}
                {permissoes.has("cliente.buscar") && (
                  <div className="space-y-1 rounded-xl border border-borda p-2">
                    <p className="px-1 text-xs font-semibold">Cliente da rede (opcional): CPF ou telefone completos</p>
                    <BuscaDeCliente modo="escolher" />
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium">Nome do cliente (opcional)<input name="cliente_nome" className={campo} /></label>
                  <label className="text-xs font-medium">E-mail do cliente (opcional)<input name="cliente_email" type="email" className={campo} /></label>
                </div>
                <BotaoConfirmar className="w-full" enquanto="Confirmando a venda no sistema…" disabled={!caixa || venda.situacao === "aguardando_aprovacao"}>Concluir venda</BotaoConfirmar>
                {!caixa && <p className="text-xs text-aviso">Abra o caixa para concluir.</p>}
              </form>
            </Cartao>
          )}

          <details className="text-sm"><summary className="cursor-pointer font-semibold text-perigo">Cancelar esta venda</summary>
            <form action={cancelarVenda} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="venda" value={venda.id} />
              <label className="min-w-0 flex-1 text-xs font-medium">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
              <Botao type="submit" tamanho="sm" variante="perigo">Cancelar venda</Botao>
            </form>
          </details>
        </>
      )}
    </MoldeReal>
  );
}

import { randomUUID } from "node:crypto";

import { QrCode, ScanLine, ShoppingCart, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { MEIOS, MEIOS_SO_DO_BANCO } from "@ora5g/dominio";

import { AtualizarEnquantoEspera } from "../../componentes/AtualizarEnquantoEspera";
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
import { horaDe, lerPixDaVenda, pixEspera, SITUACOES_DO_PIX, somasDoPix } from "../../lib/vendas/pix-asaas";
import type { OpcaoDeMeio } from "../../lib/vendas/formas-de-pagamento";
import { ERROS_DA_VENDA, MAXIMO_DE_PARCELAS, PROVEDOR_DO_MEIO, ehMeioDaEntrada } from "../../lib/vendas/regras";
import { FotoAmpliavel } from "../catalogo/FotoAmpliavel";
import { BuscaDeCliente } from "../clientes/BuscaDeCliente";
import { abrirCaixa, adicionarItem, aplicarDesconto, cancelarPixAsaas, cancelarVenda, concluirVenda, novaVenda, pedirAprovacao, pedirPixAsaas, removerItem } from "./acoes";
import { FormasDePagamento } from "./FormasDePagamento";

export const metadata: Metadata = { title: "Vender" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const FISICOS = new Set(["aparelho", "chip", "acessorio"]);
const final = (texto: string | null) => (texto ? `•••• ${texto.slice(-6)}` : "");
// O link de pagamento não existe no PDV: "a compra online é que tem link de pagamento" (o proprietário, 18/11). PAY-015a: o
// Pix pela Asaas também não se declara: o banco põe a linha de cada QR pago (o cartão "Pix pela Asaas", abaixo do carrinho).
const MEIOS_DA_LOJA = (Object.keys(MEIOS) as (keyof typeof MEIOS)[]).filter((m) => !MEIOS_SO_DO_BANCO.includes(m));
// PDV-c: as formas que o botão "Adicionar forma de pagamento" oferece, com o que cada uma pede.
const OPCOES_DE_PAGAMENTO: OpcaoDeMeio[] = MEIOS_DA_LOJA.map((m) => ({
  meio: m, nome: MEIOS[m].nome, financeira: MEIOS[m].financeira, comprovante: MEIOS[m].comprovante, maximoDeParcelas: MAXIMO_DE_PARCELAS[m] ?? null,
  provedor: PROVEDOR_DO_MEIO[m] ?? null, aceitaTroco: MEIOS[m].aceitaTroco, podeSerEntrada: ehMeioDaEntrada(m),
}));

// PDV real (ADR-004): loja do turno, caixa aberto, carrinho com reserva, desconto com aprovação,
// pagamento misto e conclusão no banco. O navegador nunca recebe custo nem calcula o total final.
// VEL-a (ORA-QUAL-010, ORA-POS-002): a tela abre com duas idas ao banco: a sessão, que já traz as permissões
// (public.molde_da_sessao), e a tela inteira (public.pdv_tela: caixa, venda, carrinho e maquininhas). Antes eram até
// nove idas seguidas. Só a busca de produto faz mais idas, e só quando há venda aberta e algo digitado.
export default async function Vender({ searchParams }: { searchParams: Promise<{ q?: ValorDeParametro; erro?: ValorDeParametro; desconto?: ValorDeParametro; cancelada?: ValorDeParametro; os?: ValorDeParametro; reserva?: ValorDeParametro; anunciado?: ValorDeParametro; atual?: ValorDeParametro; pedido?: ValorDeParametro; pago?: ValorDeParametro }> }) {
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
  // PAY-015a: junto, o Pix pela Asaas da venda aberta (o banco acha a mesma venda da tela: a mais nova da pessoa na loja).
  const [tela, , achados, pixLido] = await Promise.all([
    consultarTelaDoPdv(supabase),
    soltarReservasDoSiteVencidas(supabase),
    busca && !numero ? buscarNoCatalogo(supabase, busca, { limite: 40 }) : Promise.resolve(null),
    (async () => await supabase.rpc("caixa_pix_da_venda", {}))(),
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
  // Sem a leitura do Pix, o caixa segue sem ele (a conclusão no banco põe o pago de qualquer jeito); a venda lida tem de ser a
  // da tela (no meio, outra pode ter sido aberta).
  const pixIndisponivel = venda !== null && Boolean(pixLido.error);
  const lidoDoPix = pixLido.error ? null : lerPixDaVenda(pixLido.data);
  const pixDaVenda = lidoDoPix && venda && lidoDoPix.venda === venda.id ? lidoDoPix : { ligado: lidoDoPix?.ligado ?? false, venda: null, pix: [] };

  // As variações dos resultados (a do aparelho achado pelo número vem nula quando quem pede não a lê).
  const variantes = [...porNome.data, ...porNumero.data.flatMap((i) => (i.variantes ? [i.variantes] : []))];
  const resultados = [...porNome.data.map((v) => v.id), ...porNumero.data.map((i) => i.variante_id)];
  const produtoIds = [...new Set(variantes.map((v) => v.produto_id))];
  // 3ª ida, só com resultado: o saldo livre, os aparelhos disponíveis, as fotos e o preço vigente, em paralelo. O preço de
  // todos os resultados vem num pedido só (VEL-b: public.precos_vigentes, a mesma regra de preco_vigente); a variação sem
  // preço nesta loja não volta.
  const [saldos, disponiveis, fotos, precosLidos] = await Promise.all([
    resultados.length ? supabase.from("estoque_saldos").select("variante_id, quantidade, reservado").eq("unidade_id", unidade).in("variante_id", resultados) : Promise.resolve({ data: [], error: null }),
    porNome.data.length ? supabase.from("itens_serializados").select("id, variante_id, imei, iccid").eq("unidade_id", unidade).eq("situacao", "disponivel").eq("em_estoque", true).in("variante_id", porNome.data.map((v) => v.id)).limit(40) : Promise.resolve({ data: [], error: null }),
    produtoIds.length ? supabase.from("fotos_produto").select("produto_id, variante_id, caminho, ilustracao").in("produto_id", produtoIds).is("substituida_em", null) : Promise.resolve({ data: [], error: null }),
    resultados.length ? supabase.rpc("precos_vigentes", { p_variantes: resultados, p_unidade: unidade }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (saldos.error || disponiveis.error) throw new FalhaDoServico("vender_detalhes");
  if (fotos.error) throw new FalhaDoServico("fotos");
  // Sem os preços, a página de erro: "sem preço nesta loja" para todos seria falso.
  if (precosLidos.error) throw new FalhaDoServico("precos");
  const precos = new Map<string, number | null>((precosLidos.data ?? []).map((p) => [p.variante_id, centavosDoBanco(p.preco_centavos)]));
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
  // PDV-c: o que a PayJoy e a Aiva podem financiar (os celulares, com o desconto); o resto é pago à parte. PAY-014b: o
  // celular já pago pelo site não entra.
  const valorDosCelulares = itens.filter((i) => i.tipo === "aparelho" && !i.pago_pelo_site).reduce((t, i) => t + i.preco_unitario_centavos * i.quantidade - i.desconto_centavos, 0);
  // PAY-014b: o que o pedido do site desta venda já pagou; o caixa cobra só o resto (o banco grava a linha do pago).
  const pagoPeloSite = venda?.pago_pelo_site_centavos ?? 0;
  // PAY-015a: o que o Pix pela Asaas já pagou (entra sozinho) e se algum QR ainda espera (o banco não conclui com ele).
  const pix = somasDoPix(pixDaVenda.pix);
  const pixPendente = pixDaVenda.pix.some(pixEspera);
  const aCobrar = Math.max(subtotal - descontos - pagoPeloSite - pix.pago, 0);
  const faltaParaOPix = Math.max(aCobrar - pix.esperando, 0);

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Vender" />
      {erro && <Aviso tom="perigo">{ERROS_DA_VENDA[erro]}</Aviso>}
      {textoDoParametro(parametros.desconto) === "pedir" && <Aviso tom="aviso">Esse desconto passa do limite: peça a aprovação do gerente ou do dono.</Aviso>}
      {textoDoParametro(parametros.cancelada) === "1" && <Aviso tom="info">Venda cancelada. Os itens voltaram para o estoque da loja.</Aviso>}
      {/* ONLINE-b: a reserva do site atendida abre a venda com a unidade reservada; a oferta anunciada obriga. */}
      {textoDoParametro(parametros.reserva) === "atendida" && (() => {
        const aviso = avisoDaReservaAtendida(textoDoParametro(parametros.anunciado), textoDoParametro(parametros.atual), textoDoParametro(parametros.pedido) === "sim",
          textoDoParametro(parametros.pago) === "sim");
        return <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>;
      })()}
      {textoDoParametro(parametros.os) === "no_carrinho" && <Aviso tom="sucesso">O conserto da OS entrou no carrinho pelo valor do orçamento aprovado. Conclua a venda; depois registre a entrega na OS.</Aviso>}

      {!caixa && (
        <Cartao titulo="Abra o seu caixa" subtitulo="Sem caixa aberto, a venda não é concluída." icone={Wallet}>
          <form action={abrirCaixa} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <label className="text-sm font-medium">Fundo de troco (R$)<input name="fundo" inputMode="decimal" required defaultValue="0,00" className={campo} /></label>
            <Botao type="submit" enquanto="Abrindo o caixa…">Abrir caixa</Botao>
          </form>
        </Cartao>
      )}

      {!venda ? (
        <form action={novaVenda}><input type="hidden" name="chave" value={randomUUID()} /><Botao type="submit" tamanho="lg" className="w-full" enquanto="Abrindo a venda…"><ShoppingCart aria-hidden className="size-5" /> Nova venda</Botao></form>
      ) : (
        <>
          <Cartao titulo={`Venda nº ${venda.numero}`} subtitulo={venda.situacao === "aguardando_aprovacao" ? "Aguardando aprovação de desconto" : "Em andamento"} icone={ShoppingCart}>
            {/* A busca troca só o endereço (?q=) sem recarregar a página (next/form): o carrinho fica na tela enquanto os
                resultados chegam e o botão avisa que está buscando. A chave do campo devolve a ele o termo que o servidor
                usou: depois de pôr um item a tela volta sem busca e o campo volta vazio, pronto para o próximo produto. */}
            <Form action="/vender" prefetch={false} className="flex flex-wrap items-end gap-2" role="search">
              <label className="min-w-0 flex-1 text-sm font-medium">Produto, marca, SKU, código de barras ou IMEI/ICCID<input key={busca} id="busca-pdv" name="q" defaultValue={busca} className={campo} autoComplete="off" placeholder="Ex.: galaxy, APA-0002 ou o final do IMEI" /></label>
              <LerCodigo alvo="busca-pdv" />
              <Botao type="submit" enquanto="Buscando…"><ScanLine aria-hidden className="size-4" /> Buscar</Botao>
            </Form>
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
                                <Botao type="submit" tamanho="sm" variante="secundario" className="numeros" enquanto="Adicionando…">{tipo === "chip" ? "ICCID" : "IMEI"} {final(i.imei ?? i.iccid)}</Botao>
                              </form>
                            ))}
                          </div>
                        ) : <p className="mt-1 text-xs text-aviso">Nenhum disponível nesta loja.</p>
                      ) : (
                        <form action={adicionarItem} className="mt-2 flex items-end gap-2">
                          <input type="hidden" name="venda" value={venda.id} /><input type="hidden" name="variante" value={id} /><input type="hidden" name="chave" value={randomUUID()} />
                          <label className="text-xs font-medium">Qtd.<input name="quantidade" type="number" min={1} max={99} defaultValue={1} className={`${campo} w-20`} /></label>
                          <Botao type="submit" tamanho="sm" enquanto="Adicionando…">Adicionar</Botao>
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
                          {regra.campanha && <span className="block text-xs font-semibold text-acao">{regra.texto}</span>}
                          {i.pago_pelo_site && <span className="mt-1 block"><Selo tom="sucesso" ponto>pago pelo site</Selo></span>}</span>
                        <span className="numeros text-right font-semibold">{brl(linha - desconto)}{desconto > 0 && <span className="block text-xs font-normal text-suave">desconto {brl(desconto)}</span>}</span>
                      </div>
                      {i.pago_pelo_site ? (
                        <p className="text-xs text-suave">Pago pelo site: sai pelo preço pago, sem desconto, e não sai da venda.</p>
                      ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <form action={aplicarDesconto} className="flex items-end gap-2">
                          <input type="hidden" name="item" value={i.id} />
                          <label className="text-xs font-medium">Desconto (R$)<input name="desconto" inputMode="decimal" required defaultValue={(desconto / 100).toFixed(2).replace(".", ",")} className={`${campo} w-28`} /></label>
                          <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Aplicando…">Aplicar</Botao>
                        </form>
                        <form action={removerItem}><input type="hidden" name="item" value={i.id} /><Botao type="submit" tamanho="sm" variante="fantasma" enquanto="Tirando…">Tirar</Botao></form>
                        {aprovacao === "pendente" && <Selo tom="aviso" ponto>aprovação pendente</Selo>}
                        {aprovacao === "aprovada" && <Selo tom="sucesso" ponto>desconto aprovado</Selo>}
                        {aprovacao === "negada" && <Selo tom="perigo" ponto>desconto negado</Selo>}
                      </div>
                      )}
                      {desconto > 0 && aprovacao !== "pendente" && aprovacao !== "aprovada" && (
                        <details><summary className="cursor-pointer text-xs font-semibold text-acao">Pedir aprovação deste desconto</summary>
                          <form action={pedirAprovacao} className="mt-2 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="item" value={i.id} />
                            <label className="min-w-0 flex-1 text-xs font-medium">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
                            <Botao type="submit" tamanho="sm" enquanto="Pedindo…">Pedir</Botao>
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
              {pagoPeloSite > 0 && <><dt className="text-sucesso">Pago pelo site</dt><dd className="text-right text-sucesso">− {brl(pagoPeloSite)}</dd></>}
              {pix.pago > 0 && <><dt className="text-sucesso">Pago no Pix pela Asaas</dt><dd className="text-right text-sucesso">− {brl(pix.pago)}</dd></>}
              {pagoPeloSite + pix.pago > 0 && <><dt className="font-semibold">A cobrar</dt><dd className="text-right font-semibold">{brl(aCobrar)}</dd></>}
            </dl>
          </Cartao>

          {/* PAY-015a (a D-062: "pagamento oficial da loja será a asaas"): o QR Code do Pix gerado pelo sistema. O worker cria o QR
              na Asaas e confere o pagamento a cada poucos segundos; a tela se atualiza sozinha enquanto um QR espera. */}
          {itens.length > 0 && (pixDaVenda.ligado || pixDaVenda.pix.length > 0 || pixIndisponivel) && (
            <Cartao titulo="Pix pela Asaas" icone={QrCode} subtitulo="O QR Code aparece aqui com o valor; o cliente paga no app do banco e o pago entra sozinho na venda, sem comprovante digitado.">
              {pixIndisponivel && <Aviso tom="aviso">Não deu para ler o Pix da Asaas agora. Recarregue a tela em instantes.</Aviso>}
              {pixPendente && <AtualizarEnquantoEspera aviso="Esperando o Pix…" />}
              {pixDaVenda.pix.length > 0 && (
                <ul className="space-y-3" aria-label="Pix desta venda">
                  {pixDaVenda.pix.map((p) => {
                    const s = SITUACOES_DO_PIX[p.situacao];
                    return (
                      <li key={p.id} className="rounded-xl border border-borda p-3 text-sm">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="numeros font-semibold">{brl(p.valor_centavos)}</span>
                          <Selo tom={s.tom} ponto>{s.rotulo}</Selo>
                          {p.situacao === "pago" && horaDe(p.pago_em) && <span className="text-xs text-suave">às {horaDe(p.pago_em)}</span>}
                        </p>
                        {p.situacao === "aguardando" && p.imagem && p.copia_e_cola && (
                          <div className="mt-2 flex flex-wrap items-start gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element -- o QR Code que a Asaas gerou (PNG em base64), só enquanto espera */}
                            <img src={`data:image/png;base64,${p.imagem}`} alt={`QR Code do Pix de ${brl(p.valor_centavos)}`} className="size-52 rounded-lg border border-borda bg-white p-1" />
                            <div className="min-w-0 flex-1 space-y-2">
                              <p className="text-xs text-suave">O cliente lê o QR Code no app do banco{horaDe(p.expira_em) ? ` (vale até ${horaDe(p.expira_em)})` : ""}. Ou copia o código:</p>
                              <textarea readOnly defaultValue={p.copia_e_cola} aria-label="Pix copia e cola" className="numeros h-20 w-full rounded-botao border border-borda bg-white p-2 text-xs" />
                            </div>
                          </div>
                        )}
                        {p.situacao === "criando" && <p className="mt-1 text-xs text-suave">O servidor está gerando o QR Code na Asaas: ele aparece aqui em alguns segundos.</p>}
                        {p.situacao === "falhou" && p.ultima_falha && <p className="mt-1 text-xs">{p.ultima_falha}</p>}
                        {p.divergencia && <p className="mt-1 text-xs text-perigo">{p.divergencia}</p>}
                        {(p.situacao === "criando" || p.situacao === "aguardando") && (
                          <form action={cancelarPixAsaas} className="mt-2">
                            <input type="hidden" name="pix" value={p.id} />
                            <Botao type="submit" tamanho="sm" variante="fantasma" enquanto="Cancelando…">Cancelar este QR Code</Botao>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {pixDaVenda.ligado ? faltaParaOPix > 0 && (
                <form action={pedirPixAsaas} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="venda" value={venda.id} /><input type="hidden" name="chave" value={randomUUID()} />
                  <label className="text-sm font-medium">Valor no Pix (R$)<input name="valor" inputMode="decimal" required defaultValue={(faltaParaOPix / 100).toFixed(2).replace(".", ",")} className={`${campo} w-36`} /></label>
                  <Botao type="submit" enquanto="Pedindo o QR Code…"><QrCode aria-hidden className="size-4" /> Gerar QR Code do Pix</Botao>
                </form>
              ) : !pixIndisponivel && (
                <p className="mt-2 text-xs text-suave">O Pix pela Asaas está desligado agora (o servidor confere a conta da Asaas a cada minuto). Use o Pix direto ou a maquininha.</p>
              )}
            </Cartao>
          )}

          {itens.length > 0 && (
            <Cartao titulo="Pagamento" subtitulo="Toque em “Adicionar forma de pagamento” para cada forma que o cliente usar. PayJoy e Aiva: o valor financiado (só o do celular) e as parcelas; a entrada é outra forma, marcada como entrada. Cartão: as parcelas e o comprovante. Troco só sai do dinheiro.">
              <form action={concluirVenda} className="space-y-3">
                <input type="hidden" name="venda" value={venda.id} /><input type="hidden" name="chave" value={randomUUID()} />
                <FormasDePagamento total={aCobrar} pagoPeloSite={pagoPeloSite} pagoNoPix={pix.pago} valorDosCelulares={valorDosCelulares} opcoes={OPCOES_DE_PAGAMENTO}
                  terminais={terminais.map((m) => ({ id: m.id, provedor: m.provedor === "picpay" ? "picpay" as const : "pagbank" as const, rotulo: `${m.apelido} · ${m.provedor === "picpay" ? "PicPay" : "PagBank"} ${m.identificador}` }))} />
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
                <BotaoConfirmar className="w-full" enquanto="Confirmando a venda no sistema…" disabled={!caixa || venda.situacao === "aguardando_aprovacao" || pixPendente}>Concluir venda</BotaoConfirmar>
                {!caixa && <p className="text-xs text-aviso">Abra o caixa para concluir.</p>}
                {pixPendente && <p className="text-xs text-aviso">Há um Pix pela Asaas esperando: espere o pagamento ou cancele o QR Code para concluir.</p>}
              </form>
            </Cartao>
          )}

          {pagoPeloSite > 0 || pix.pago > 0 ? (
            <p className="text-xs text-suave">{`${pagoPeloSite > 0 ? "Pedido pago pelo site" : "Venda com Pix pela Asaas pago"}: esta venda não se cancela por aqui. Se o cliente desistir, o estorno é pelo painel da Asaas; depois do estorno, a venda pode ser cancelada.`}</p>
          ) : (
          <details className="text-sm"><summary className="cursor-pointer font-semibold text-perigo">Cancelar esta venda</summary>
            <form action={cancelarVenda} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="venda" value={venda.id} />
              <label className="min-w-0 flex-1 text-xs font-medium">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
              <Botao type="submit" tamanho="sm" variante="perigo" enquanto="Cancelando…">Cancelar venda</Botao>
            </form>
          </details>
          )}
        </>
      )}
    </MoldeReal>
  );
}

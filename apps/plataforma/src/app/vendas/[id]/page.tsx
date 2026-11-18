import { randomUUID } from "node:crypto";

import { CheckCircle2, FileText, PackageCheck, Paperclip, Receipt, RotateCcw, Undo2, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MEIOS } from "@ora5g/dominio";
import { chaveEmGrupos, MODELOS_DE_NOTA, SITUACOES_DA_NOTA, type SituacaoDaNota } from "@ora5g/dominio/fiscal";

import { FormularioDeArquivo } from "../../../componentes/FormularioDeArquivo";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { centavosDoBanco } from "../../../lib/dinheiro";
import { brl } from "../../../lib/formato";
import { dataEHoraDoEnvio, ERROS_DAS_NOTAS, SITUACOES_DO_ENVIO } from "../../../lib/notas/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { ERROS_DOS_ANEXOS, tamanhoDoAnexo, TIPOS_DE_ANEXO } from "../../../lib/vendas/anexos";
import { osDosItens, type OsDoItem } from "../../../lib/vendas/os-dos-itens";
import { CONDICOES_DE_RETORNO, ERROS_DA_VENDA } from "../../../lib/vendas/regras";
import { vincularClienteNaVenda } from "../../clientes/acoes";
import { BuscaDeCliente } from "../../clientes/BuscaDeCliente";
import { conferirEnvioDesconhecido, confirmarDestinatarioDaNota, corrigirChaveDaNota, corrigirNota, enviarNotaPeloWhatsApp, pedirNota, registrarCancelamentoNoFisco } from "../../notas/acoes";
import { cancelarVenda, conferirRetorno, confirmarEstorno, devolverItens, retirarAnexo } from "../../vender/acoes";
import { regraNaTela, regrasDosItens } from "../../../lib/vendas/regra-de-preco";
import { CartasDeCorrecao } from "./CartasDeCorrecao";

export const metadata: Metadata = { title: "Comprovante da venda" };
export const dynamic = "force-dynamic";

const nomeDoMeio = (m: string) => (Object.hasOwn(MEIOS, m) ? MEIOS[m as keyof typeof MEIOS].nome : m);
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const FISICOS = new Set(["aparelho", "chip", "acessorio"]);

// Comprovante digital (as lojas não têm impressora, DEC-U22). Lido pelo RLS: o vendedor vê as
// próprias vendas; a gerência vê as da loja. A gerência cancela com estorno (ADR-004).
export default async function Comprovante({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ concluida?: ValorDeParametro; cancelada?: ValorDeParametro; erro?: ValorDeParametro; nota?: ValorDeParametro; erro_nota?: ValorDeParametro; devolvida?: ValorDeParametro; vale?: ValorDeParametro; estorno?: ValorDeParametro; retorno?: ValorDeParametro; cliente?: ValorDeParametro; anexo?: ValorDeParametro; erro_anexo?: ValorDeParametro }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DA_VENDA, parametros.erro);
  const erroNota = chaveDoCatalogo(ERROS_DAS_NOTAS, parametros.erro_nota);
  const erroAnexo = chaveDoCatalogo(ERROS_DOS_ANEXOS, parametros.erro_anexo);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const venda = await supabase.from("vendas").select("id, numero, situacao, unidade_id, vendedor_id, cliente_nome, cliente_id, total_centavos, subtotal_centavos, desconto_centavos, troco_centavos, recebido_centavos, a_receber_centavos, devolvido_centavos, concluida_em, cancelada_em, motivo_cancelamento").eq("id", id).maybeSingle();
  if (venda.error) throw new FalhaDoServico("venda");
  if (!venda.data) notFound();
  const [itens, pagamentos, loja, vendedor, podeCancelar, podePedirNota, aprovaNota, nota, devolucoes, notasDeDevolucao, estornos, retornos] = await Promise.all([
    supabase.from("venda_itens").select("id, variante_id, item_serializado_id, tipo, quantidade, preco_unitario_centavos, desconto_centavos").eq("venda_id", id).order("criado_em"),
    supabase.from("venda_pagamentos").select("ordem, meio, valor_centavos, entrada_centavos, comprovante, situacao").eq("venda_id", id).order("ordem"),
    supabase.from("unidades").select("nome, cnpj").eq("id", venda.data.unidade_id).maybeSingle(),
    supabase.from("perfis_usuario").select("nome").eq("id", venda.data.vendedor_id).maybeSingle(),
    supabase.rpc("tem_permissao", { p_permissao: "venda.cancelar", p_unidade: venda.data.unidade_id }),
    supabase.rpc("tem_permissao", { p_permissao: "nota.solicitar", p_unidade: venda.data.unidade_id }),
    supabase.rpc("tem_permissao", { p_permissao: "nota.aprovar", p_unidade: venda.data.unidade_id }),
    supabase.from("notas_pedidos").select("id, situacao, solicitado_por, destinatario_nome, destinatario_mascarado, observacao, chave_acesso, modelo, serie, numero_documento, cliente_id")
      .eq("venda_id", id).eq("tipo", "venda").neq("situacao", "cancelada").maybeSingle(),
    supabase.from("venda_devolucoes").select("id, numero, valor_centavos, motivo, criado_em, venda_devolucao_itens(venda_item_id, quantidade, valor_centavos, condicao), venda_devolucao_reembolsos(meio, valor_centavos), vales_troca(numero, saldo_centavos)")
      .eq("venda_id", id).order("criado_em"),
    supabase.from("notas_pedidos").select("devolucao_id, situacao").eq("venda_id", id).eq("tipo", "devolucao"),
    // Estorno de Pix, cartão e financeira a confirmar com o comprovante (#50) e retorno físico a conferir (#51).
    supabase.from("estornos_externos").select("id, numero, meio, valor_centavos, situacao, devolucao_id, comprovante, confirmado_em").eq("venda_id", id).order("numero"),
    supabase.from("venda_retornos").select("id, venda_item_id, quantidade, situacao, condicao, observacao").eq("venda_id", id).order("solicitado_em"),
  ]);
  // Cliente da rede (L5a): quem busca cliente na loja do turno vê a ficha e liga a venda a um cadastro (vem no molde).
  const buscaCliente = permite(sessao, "cliente.buscar");
  if (itens.error || pagamentos.error || loja.error || vendedor.error || podeCancelar.error || podePedirNota.error || aprovaNota.error || nota.error || devolucoes.error || notasDeDevolucao.error || estornos.error || retornos.error) throw new FalhaDoServico("comprovante");
  const variantes = itens.data.length ? await supabase.from("variantes").select("id, sku, nome").in("id", itens.data.map((i) => i.variante_id)) : { data: [], error: null };
  const serializados = itens.data.some((i) => i.item_serializado_id) ? await supabase.from("itens_serializados").select("id, imei, iccid").in("id", itens.data.flatMap((i) => (i.item_serializado_id ? [i.item_serializado_id] : []))) : { data: [], error: null };
  if (variantes.error || serializados.error) throw new FalhaDoServico("comprovante_itens");
  // L10a (FISC-005): o PDF e o XML da nota emitida e o protocolo, lidos à parte. Banco sem a migration (sem a
  // tabela ou a coluna) ou falha de leitura não derrubam a venda: o bloco só não aparece.
  const notaEmitida = nota.data?.situacao === "emitida" ? nota.data : null;
  const [documentosDaNota, protocoloDaNota, origemDaNota] = notaEmitida
    ? await Promise.all([
      supabase.from("notas_documentos").select("id, tipo, caminho, bytes, enviado_em").eq("pedido_id", notaEmitida.id).is("substituido_em", null).order("tipo"),
      supabase.from("notas_pedidos").select("protocolo").eq("id", notaEmitida.id).maybeSingle(),
      // INTEG-c (#101): de onde vem a identidade do cliente da nota, também à parte.
      supabase.from("notas_pedidos").select("cliente_origem").eq("id", notaEmitida.id).maybeSingle(),
    ])
    : [null, null, null];
  const documentosLidos = documentosDaNota && !documentosDaNota.error ? documentosDaNota.data : null;
  const linksDosDocumentos = documentosLidos && documentosLidos.length
    ? await supabase.storage.from("notas").createSignedUrls(documentosLidos.map((d) => d.caminho), 600)
    : { data: [], error: null };
  const linkDe = new Map((linksDosDocumentos.data ?? []).map((l) => [l.path, l.error ? null : l.signedUrl]));
  const protocolo = protocoloDaNota && !protocoloDaNota.error ? (protocoloDaNota.data as { protocolo?: string | null } | null)?.protocolo ?? null : null;
  // Sem a coluna (banco sem a migration do INTEG-c) ou falha de leitura, vale a regra do INTEG-a; quem decide é o banco.
  const identidadeComprovada = !origemDaNota || origemDaNota.error ? true : Boolean((origemDaNota.data as { cliente_origem?: string | null } | null)?.cliente_origem);
  // K1c (#76): os envios da nota pelo WhatsApp, lidos à parte (banco sem a migration: o bloco do envio não aparece).
  const enviosDaNota = notaEmitida
    ? await supabase.from("whatsapp_envios").select("id, numero, situacao, destino_mascarado, motivo, erro, pedido_em, atualizado_em")
      .eq("pedido_id", notaEmitida.id).order("pedido_em", { ascending: false }).limit(10)
    : null;
  const envios = enviosDaNota && !enviosDaNota.error ? enviosDaNota.data : null;
  const ultimoEnvio = envios?.[0] ?? null;
  const temPdf = Boolean(documentosLidos?.some((d) => d.tipo === "pdf"));
  // FISC-009b (FISC-009): as cartas de correção da NF-e emitida (só a NF-e, modelo 55, tem carta), lidas à parte. Banco
  // sem a migration (sem a tabela) ou falha de leitura: a lista e o formulário não aparecem; a venda segue.
  const cartasDaNota = notaEmitida?.modelo === "55"
    ? await supabase.from("notas_cartas_de_correcao").select("id, numero, protocolo, correcao, registrada_em").eq("pedido_id", notaEmitida.id).order("numero")
    : null;
  const cartas = cartasDaNota && !cartasDaNota.error ? cartasDaNota.data : null;
  // A regra de preço de cada item (L6b): campanha, preço da loja ou da rede, lida à parte. Banco sem a
  // migration ou falha de leitura não derrubam a venda.
  const regras = await regrasDosItens(supabase, id);
  // O conserto da OS cobrado nesta venda (L12c), lido à parte do mesmo jeito.
  const daOs = itens.data.some((i) => i.tipo === "servico") ? await osDosItens(supabase, id) : new Map<string, OsDoItem>();
  const osAEntregar = [...daOs.values()].filter((o) => o.situacao === "aberta");
  // L10c (FISC-009): as notas desta venda canceladas no fisco, lidas à parte. Banco sem a migration (sem as colunas):
  // o histórico e os formulários do cancelamento e da correção da chave não aparecem; a venda segue.
  const canceladasDoBanco = venda.data.situacao === "concluida" || venda.data.situacao === "cancelada"
    ? await supabase.from("notas_pedidos").select("id, modelo, serie, numero_documento, cancelada_no_fisco_em, protocolo_cancelamento")
      .eq("venda_id", id).eq("tipo", "venda").eq("situacao", "cancelada")
    : null;
  const comCancelamentoNoFisco = Boolean(canceladasDoBanco && !canceladasDoBanco.error);
  const canceladasNoFisco = (canceladasDoBanco && !canceladasDoBanco.error ? canceladasDoBanco.data : [])
    .flatMap((c) => (c.cancelada_no_fisco_em ? [{ ...c, cancelada_no_fisco_em: c.cancelada_no_fisco_em }] : []))
    .sort((a, b) => a.cancelada_no_fisco_em.localeCompare(b.cancelada_no_fisco_em));
  // Documentos da venda (L5d), lidos à parte: num banco sem a migration (sem a tabela), o bloco não aparece.
  const anexosLidos = venda.data.situacao === "concluida" || venda.data.situacao === "cancelada"
    ? await supabase.from("venda_anexos").select("id, tipo, descricao, caminho, formato, bytes, enviado_em, retirado_em, motivo_retirada").eq("venda_id", id).order("enviado_em")
    : null;
  const anexos = anexosLidos && !anexosLidos.error ? anexosLidos.data : null;
  const linksDosAnexos = anexos && anexos.some((a) => !a.retirado_em)
    ? await supabase.storage.from("anexos").createSignedUrls(anexos.filter((a) => !a.retirado_em).map((a) => a.caminho), 600)
    : { data: [], error: null };
  const linkDoAnexo = (caminho: string) => (linksDosAnexos.error ? null : linksDosAnexos.data?.find((l) => l.path === caminho && !l.error)?.signedUrl ?? null);
  const dataHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  const v = venda.data;
  // Devolução (adendo do ADR-004): o que resta de cada item e os meios em que dá para reembolsar.
  const devolvido = new Map<string, number>();
  for (const d of devolucoes.data) for (const i of d.venda_devolucao_itens) devolvido.set(i.venda_item_id, (devolvido.get(i.venda_item_id) ?? 0) + i.quantidade);
  const restantes = itens.data.map((i) => ({ ...i, restante: i.quantidade - (devolvido.get(i.id) ?? 0) })).filter((i) => i.restante > 0);
  const financiada = pagamentos.data.some((p) => p.situacao === "confirmado" && Object.hasOwn(MEIOS, p.meio) && MEIOS[p.meio as keyof typeof MEIOS].financeira);
  const meiosDeReembolso = [...new Set(pagamentos.data.filter((p) => p.situacao === "confirmado" && p.meio !== "vale_troca").map((p) => p.meio)), "vale_troca"];
  const nomeDoItem = (itemId: string) => variantes.data.find((x) => x.id === itens.data.find((i) => i.id === itemId)?.variante_id)?.nome ?? "Item";
  const quando = v.concluida_em ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(v.concluida_em)) : null;
  // L10c: o histórico das notas desta venda canceladas no fisco (no bloco da nota e, na venda cancelada, sozinho).
  const historicoDoFisco = canceladasNoFisco.length > 0 ? (
    <ul className="space-y-1 text-xs text-suave">
      {canceladasNoFisco.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1"><Selo tom="neutro">Cancelada no fisco</Selo>
          <span className="numeros">{MODELOS_DE_NOTA[c.modelo ?? ""] ?? `Modelo ${c.modelo}`} nº {c.numero_documento} · série {c.serie} · em {dataEHoraDoEnvio(c.cancelada_no_fisco_em)} · protocolo {c.protocolo_cancelamento}</span></li>
      ))}
    </ul>
  ) : null;
  return (
    <MoldeReal sessao={sessao} largura="max-w-lg">
      {textoDoParametro(parametros.concluida) === "1" && v.situacao === "concluida" && <Aviso tom="sucesso" titulo="Venda concluída"><CheckCircle2 aria-hidden className="inline size-4" /> Estoque baixado e pagamento registrado no seu caixa.</Aviso>}
      {textoDoParametro(parametros.cancelada) === "1" && <Aviso tom="info">Venda cancelada. O dinheiro saiu do seu caixa; cartão, Pix e financeira ficam como estorno a confirmar com o comprovante; os itens só voltam ao estoque quando forem recebidos e conferidos.</Aviso>}
      {textoDoParametro(parametros.estorno) === "confirmado" && <Aviso tom="sucesso">Estorno confirmado com o comprovante.</Aviso>}
      {textoDoParametro(parametros.retorno) === "recebido" && <Aviso tom="sucesso">Item conferido e de volta ao estoque.</Aviso>}
      {textoDoParametro(parametros.retorno) === "nao_recebido" && <Aviso tom="info">Retorno fechado sem estoque: o item não voltou.</Aviso>}
      {erro && <Aviso tom="perigo">{ERROS_DA_VENDA[erro]}</Aviso>}
      {v.situacao === "concluida" && osAEntregar.map((o) => (
        <Aviso key={o.os} tom="info" titulo={`Conserto da OS nº ${o.numero ?? "—"} cobrado`}>
          Falta registrar a entrega ao cliente: <Link href={`/assistencia/${o.os}`} className="font-semibold underline">abrir a OS</Link>.
        </Aviso>
      ))}
      {erroNota && (
        <Aviso tom="perigo">
          {ERROS_DAS_NOTAS[erroNota]}
          {/* K1b (#76): completa-se o MESMO cadastro do cliente e pede-se a nota de novo. */}
          {(erroNota === "cliente_sem_endereco" || erroNota === "cliente_sem_documento") && v.cliente_id && (
            <> <Link href={`/clientes/${v.cliente_id}`} className="font-semibold underline">Completar o cadastro do cliente</Link></>
          )}
        </Aviso>
      )}
      {textoDoParametro(parametros.devolvida) && <Aviso tom="sucesso">Devolução nº {textoDoParametro(parametros.devolvida)} registrada: estoque e caixa atualizados.{textoDoParametro(parametros.vale) ? ` Vale-troca nº ${textoDoParametro(parametros.vale)} criado: informe esse número no pagamento da nova venda.` : ""}</Aviso>}
      {textoDoParametro(parametros.nota) === "pedida" && <Aviso tom="sucesso">Nota pedida: aparece na fila do dono e do gerente.</Aviso>}
      {textoDoParametro(parametros.nota) === "corrigida" && <Aviso tom="sucesso">Correção enviada: o pedido voltou para a fila.</Aviso>}
      {textoDoParametro(parametros.nota)?.startsWith("documento_") && <Aviso tom="sucesso">Documento da nota guardado em privado; ele fica disponível para a loja e para o envio ao cliente.</Aviso>}
      {textoDoParametro(parametros.nota) === "whatsapp" && <Aviso tom="sucesso">Envio pedido: a nota está na fila do WhatsApp oficial. O estado abaixo muda só com a resposta do WhatsApp.</Aviso>}
      {erroAnexo && <Aviso tom="perigo">{ERROS_DOS_ANEXOS[erroAnexo]}</Aviso>}
      {textoDoParametro(parametros.anexo) === "guardado" && <Aviso tom="sucesso">Documento guardado em privado: quem lê esta venda abre pelo link.</Aviso>}
      {textoDoParametro(parametros.anexo) === "retirado" && <Aviso tom="sucesso">Documento retirado; o registro e o motivo ficaram.</Aviso>}
      {textoDoParametro(parametros.anexo) === "sem_mudanca" && <Aviso tom="info">Nada mudou: o documento já tinha sido retirado.</Aviso>}
      {textoDoParametro(parametros.nota) === "destinatario_conferido" && <Aviso tom="sucesso">Destinatário conferido e confirmado: a nota pode ir pelo WhatsApp. A conferência ficou na auditoria.</Aviso>}
      {textoDoParametro(parametros.nota) === "whatsapp_conferido" && <Aviso tom="sucesso">Conferência registrada: o envio ficou como &quot;não chegou&quot; e a nota pode ser reenviada.</Aviso>}
      {textoDoParametro(parametros.nota) === "cancelada_no_fisco" && <Aviso tom="sucesso">Cancelamento da nota registrado: agora a venda pode ser cancelada ou pedir outra nota.</Aviso>}
      {textoDoParametro(parametros.nota) === "chave_corrigida" && <Aviso tom="sucesso">Chave da nota corrigida; a anterior ficou no histórico da nota.</Aviso>}
      {textoDoParametro(parametros.nota) === "carta_registrada" && <Aviso tom="sucesso">Carta de correção registrada no bloco “Nota fiscal”: a mais recente substitui as anteriores.</Aviso>}
      {textoDoParametro(parametros.nota) === "carta_repetida" && <Aviso tom="info">Nada mudou: esta carta de correção já estava registrada.</Aviso>}
      <Cartao titulo={`Venda nº ${v.numero}`} subtitulo={`${loja.data?.nome ?? situacao.unidade_nome}${quando ? ` · ${quando}` : ""}`} icone={Receipt}>
        <p className="text-sm">Vendedor: {vendedor.data?.nome ?? "—"}{v.cliente_nome ? ` · Cliente: ${v.cliente_nome}` : ""}
          {v.cliente_id && buscaCliente && <> · <Link href={`/clientes/${v.cliente_id}`} className="font-semibold text-acao">ficha do cliente</Link></>}</p>
        <p className="mt-1">{v.situacao === "concluida" ? <Selo tom="sucesso" ponto>concluída</Selo> : v.situacao === "cancelada" ? <Selo tom="perigo" ponto>cancelada</Selo> : <Selo tom="aviso" ponto>em aberto</Selo>}</p>
        {v.situacao === "cancelada" && v.motivo_cancelamento && <p className="mt-1 text-xs text-suave">Motivo: {v.motivo_cancelamento}</p>}
        <ul className="mt-3 divide-y divide-borda text-sm">
          {itens.data.map((i) => {
            const variante = variantes.data.find((x) => x.id === i.variante_id);
            const serial = serializados.data.find((s) => s.id === i.item_serializado_id);
            const linha = centavosDoBanco(i.preco_unitario_centavos) * i.quantidade - centavosDoBanco(i.desconto_centavos);
            const regra = regraNaTela(regras, i.id);
            const os = daOs.get(i.id);
            return (
              <li key={i.id} className="flex justify-between gap-2 py-2">
                <span>{os ? <Link href={`/assistencia/${os.os}`} className="font-semibold text-acao">{`Conserto da OS nº ${os.numero ?? "—"}`}</Link> : variante?.nome}<span className="numeros block text-xs text-suave">{variante?.sku}{serial ? ` · ${serial.imei ? "IMEI" : "ICCID"} ${serial.imei ?? serial.iccid}` : ""} · {i.quantidade} un.</span>
                  {regra && <span className={`block text-xs ${regra.campanha ? "font-semibold text-acao" : "text-suave"}`}>{regra.texto}</span>}</span>
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
      {v.situacao === "concluida" && buscaCliente && (
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
      {v.situacao === "concluida" && (nota.data || podePedirNota.data || historicoDoFisco) && (
        <Cartao titulo="Nota fiscal" icone={FileText}>
          {historicoDoFisco && <div className="mb-3">{historicoDoFisco}</div>}
          {nota.data ? (
            <div className="space-y-2 text-sm">
              <p><Selo tom={nota.data.situacao === "emitida" ? "sucesso" : nota.data.situacao === "correcao_solicitada" ? "aviso" : "info"} ponto>
                {Object.hasOwn(SITUACOES_DA_NOTA, nota.data.situacao) ? SITUACOES_DA_NOTA[nota.data.situacao as SituacaoDaNota] : nota.data.situacao}</Selo></p>
              {(nota.data.destinatario_nome || nota.data.destinatario_mascarado) && <p className="text-xs text-suave">Na nota: {[nota.data.destinatario_nome, nota.data.destinatario_mascarado].filter(Boolean).join(" · ")}</p>}
              {nota.data.observacao && <p className="text-xs">Observação: {nota.data.observacao}</p>}
              {nota.data.situacao === "emitida" && (
                <p className="numeros break-all text-xs">{MODELOS_DE_NOTA[nota.data.modelo ?? ""] ?? `Modelo ${nota.data.modelo}`} nº {nota.data.numero_documento} · série {nota.data.serie}<br />{chaveEmGrupos(nota.data.chave_acesso ?? "")}{protocolo ? ` · protocolo ${protocolo}` : ""}</p>
              )}
              {notaEmitida && documentosLidos && (
                <div className="space-y-2 rounded-lg border border-borda p-2">
                  <p className="text-xs font-semibold">Documentos da nota</p>
                  {documentosLidos.length === 0 ? <p className="text-xs text-suave">Nenhum documento guardado ainda: o PDF (DANFE) e o XML ficam aqui, em privado, para a loja e para o envio ao cliente.</p> : (
                    <ul className="space-y-1 text-xs">
                      {documentosLidos.map((d) => (
                        <li key={d.id}>{linkDe.get(d.caminho)
                          ? <a href={linkDe.get(d.caminho) ?? undefined} className="font-semibold text-acao" target="_blank" rel="noreferrer">{d.tipo === "pdf" ? "PDF (DANFE)" : "XML"}</a>
                          : <span>{d.tipo === "pdf" ? "PDF (DANFE)" : "XML"}</span>}
                          {` · ${Math.max(1, Math.round(d.bytes / 1024))} KB`}</li>
                      ))}
                    </ul>
                  )}
                  {envios && (
                    <div className="space-y-2 border-t border-borda pt-2">
                      <p className="text-xs font-semibold">Envio ao cliente pelo WhatsApp</p>
                      <p className="text-xs text-suave">A mensagem sai pelo WhatsApp oficial da loja quando ele estiver ligado (ainda não está: falta a habilitação na Meta). Até lá o pedido fica na fila e nada aparece como enviado.</p>
                      {envios.length > 0 && (
                        <ul className="space-y-1 text-xs">
                          {envios.map((e) => (
                            <li key={e.id} className="flex flex-wrap items-center gap-2">
                              <Selo tom={e.situacao === "entregue" || e.situacao === "lido" ? "sucesso" : e.situacao === "falhou" || e.situacao === "desconhecido" ? "aviso" : "info"} ponto>{SITUACOES_DO_ENVIO[e.situacao] ?? e.situacao}</Selo>
                              <span className="numeros text-suave">{`${e.destino_mascarado} · pedido em ${dataEHoraDoEnvio(e.pedido_em)}${e.motivo ? ` · reenvio: ${e.motivo}` : ""}${e.erro ? ` · ${e.erro}` : ""}`}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {ultimoEnvio?.situacao === "desconhecido" && aprovaNota.data && (
                        <form action={conferirEnvioDesconhecido} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="envio" value={ultimoEnvio.id} /><input type="hidden" name="venda" value={v.id} />
                          <label className="text-xs font-medium">Conferido com o cliente: não chegou (motivo)<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                          <Botao type="submit" tamanho="sm" variante="secundario">Registrar a conferência</Botao>
                        </form>
                      )}
                      {/* INTEG-a (#88): a nota vai só ao cliente que estava na venda quando ela foi pedida. */}
                      {v.cliente_id && nota.data.cliente_id === v.cliente_id && temPdf && identidadeComprovada && (!ultimoEnvio || !["na_fila", "enviando", "desconhecido"].includes(ultimoEnvio.situacao)) && (
                        <form action={enviarNotaPeloWhatsApp} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="pedido" value={notaEmitida.id} /><input type="hidden" name="venda" value={v.id} /><input type="hidden" name="chave" value={randomUUID()} />
                          {ultimoEnvio && <label className="text-xs font-medium">Motivo do reenvio<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>}
                          <Botao type="submit" tamanho="sm">{ultimoEnvio ? "Reenviar pelo WhatsApp" : "Enviar a nota pelo WhatsApp"}</Botao>
                        </form>
                      )}
                      {/* INTEG-c (#101): a nota antiga sem a identidade do destinatário comprovada: quem aprova confere o PDF e confirma. */}
                      {v.cliente_id && nota.data.cliente_id === v.cliente_id && temPdf && !identidadeComprovada && (aprovaNota.data ? (
                        <form action={confirmarDestinatarioDaNota} className="space-y-2">
                          <p className="text-xs text-suave">{`A identidade do destinatário desta nota não está comprovada: ela foi emitida antes da conferência de identidade. Abra o PDF e confira se o destinatário é ${v.cliente_nome ?? "o cliente da venda"}. Se for outra pessoa, não confirme: a nota não vai pelo WhatsApp.`}</p>
                          <input type="hidden" name="pedido" value={notaEmitida.id} /><input type="hidden" name="venda" value={v.id} />
                          <label className="text-xs font-medium">Como você conferiu (fica na auditoria)<input name="motivo" required minLength={10} maxLength={200} className={campo} /></label>
                          <Botao type="submit" tamanho="sm" variante="secundario">{`Confirmar: a nota é de ${v.cliente_nome ?? "cliente da venda"}`}</Botao>
                        </form>
                      ) : <p className="text-xs text-suave">A identidade do destinatário desta nota não está comprovada: a gerência confere o PDF antes do envio.</p>)}
                      {!v.cliente_id && <p className="text-xs text-suave">Para enviar pelo WhatsApp, a nota precisa ter sido pedida com o cliente da rede ligado à venda.</p>}
                      {v.cliente_id && nota.data.cliente_id !== v.cliente_id && <p className="text-xs text-suave">{nota.data.cliente_id ? "O cliente da venda mudou depois do pedido da nota: ela está no nome de outro cliente e não vai pelo WhatsApp." : "A nota foi pedida sem o cliente da rede: ela não vai pelo WhatsApp."}</p>}
                      {v.cliente_id && !temPdf && <p className="text-xs text-suave">Para enviar pelo WhatsApp, guarde antes o PDF da nota.</p>}
                    </div>
                  )}
                  {aprovaNota.data && (
                    <FormularioDeArquivo action={`/notas/${notaEmitida.id}/documentos`} className="grid gap-2 sm:grid-cols-3">
                      <label className="text-xs font-medium sm:col-span-2">PDF ou XML da nota (até 5 MB)<input name="arquivo" type="file" required accept=".pdf,.xml,application/pdf,application/xml,text/xml" className={`${campo} py-2`} /></label>
                      <label className="text-xs font-medium">Protocolo (opcional, 15 dígitos)<input name="protocolo" inputMode="numeric" maxLength={20} defaultValue={protocolo ?? ""} className={campo} /></label>
                      <div><Botao type="submit" tamanho="sm" variante="secundario" enquanto="Enviando o arquivo…">Guardar documento</Botao></div>
                    </FormularioDeArquivo>
                  )}
                </div>
              )}
              {notaEmitida && aprovaNota.data && comCancelamentoNoFisco && (
                <div className="space-y-2">
                  <details className="rounded-lg border border-borda p-2 text-xs">
                    <summary className="cursor-pointer font-semibold text-acao">Cancelou a nota no portal do fisco? Registre o cancelamento</summary>
                    <form action={registrarCancelamentoNoFisco} className="mt-2 grid gap-2 sm:grid-cols-3">
                      <input type="hidden" name="pedido" value={notaEmitida.id} /><input type="hidden" name="venda" value={v.id} />
                      <label className="font-medium">Protocolo do cancelamento (15 dígitos)<input name="protocolo" required inputMode="numeric" autoComplete="off" maxLength={20} className={campo} /></label>
                      <label className="font-medium sm:col-span-2">Justificativa, a mesma do evento (de 15 a 255 letras)<input name="justificativa" required minLength={15} maxLength={255} className={campo} /></label>
                      <p className="text-suave sm:col-span-3">O prazo para cancelar é do fisco (depende do modelo da nota e do estado). Depois do registro, a venda pode ser cancelada ou pedir outra nota.</p>
                      <div><Botao type="submit" tamanho="sm" variante="secundario">Registrar o cancelamento</Botao></div>
                    </form>
                  </details>
                  {documentosLidos && !documentosLidos.some((d) => d.tipo === "xml") && (
                    <details className="rounded-lg border border-borda p-2 text-xs">
                      <summary className="cursor-pointer font-semibold text-acao">A chave registrada está errada? Corrija</summary>
                      <form action={corrigirChaveDaNota} className="mt-2 grid gap-2 sm:grid-cols-3">
                        <input type="hidden" name="pedido" value={notaEmitida.id} /><input type="hidden" name="venda" value={v.id} />
                        <label className="font-medium sm:col-span-2">Chave de acesso certa (44 dígitos)<input name="chave_acesso" required inputMode="numeric" autoComplete="off" className={campo} /></label>
                        <label className="font-medium">Motivo (de 10 a 300 letras)<input name="motivo" required minLength={10} maxLength={300} className={campo} /></label>
                        <p className="text-suave sm:col-span-3">Só enquanto o XML da nota não foi guardado (com ele, a chave é a do XML). A chave anterior fica no histórico e o protocolo entra de novo com o XML.</p>
                        <div><Botao type="submit" tamanho="sm" variante="secundario">Corrigir a chave</Botao></div>
                      </form>
                    </details>
                  )}
                </div>
              )}
              {notaEmitida && cartas && <CartasDeCorrecao cartas={cartas} pedido={notaEmitida.id} venda={v.id} podeRegistrar={Boolean(aprovaNota.data)} />}
              {nota.data.situacao === "correcao_solicitada" && (nota.data.solicitado_por === usuario.id || aprovaNota.data) && (
                <form action={corrigirNota} className="grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="pedido" value={nota.data.id} /><input type="hidden" name="venda" value={v.id} />
                  <label className="text-xs font-medium">Nome na nota (opcional)<input name="nome" maxLength={120} className={campo} /></label>
                  <label className="text-xs font-medium">CPF ou CNPJ (opcional)<input name="documento" inputMode="numeric" autoComplete="off" className={campo} /></label>
                  <div><Botao type="submit" tamanho="sm">Enviar correção</Botao></div>
                </form>
              )}
              {/* INTEG-a (#87): a nota no nome do cliente se corrige com o cadastro atualizado dele (o CPF não se digita). */}
              {nota.data.situacao === "correcao_solicitada" && (nota.data.solicitado_por === usuario.id || aprovaNota.data) && v.cliente_id && (
                <form action={corrigirNota} className="flex flex-wrap items-center gap-2 text-xs text-suave">
                  <input type="hidden" name="pedido" value={nota.data.id} /><input type="hidden" name="venda" value={v.id} />
                  <input type="hidden" name="usar_cadastro" value="sim" /><input type="hidden" name="cliente" value={v.cliente_id} />
                  <span>Nota no nome do cliente? Corrija o cadastro dele e</span>
                  <Botao type="submit" tamanho="sm" variante="secundario">Usar o cadastro atualizado</Botao>
                </form>
              )}
            </div>
          ) : podePedirNota.data ? (
            <form action={pedirNota} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="venda" value={v.id} /><input type="hidden" name="chave" value={randomUUID()} />
              {v.cliente_id && buscaCliente && (
                <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2"><input type="hidden" name="cliente" value={v.cliente_id} />
                  <input type="checkbox" name="usar_cliente" value="sim" defaultChecked className="size-4 accent-acao" /> No nome do cliente da venda (o sistema copia nome, CPF/CNPJ e endereço do cadastro)</label>
              )}
              <label className="text-xs font-medium">Nome na nota (opcional)<input name="nome" maxLength={120} className={campo} /></label>
              <label className="text-xs font-medium">CPF ou CNPJ na nota (opcional)<input name="documento" inputMode="numeric" autoComplete="off" className={campo} /></label>
              <p className="text-xs text-suave sm:col-span-2">O pedido vai para a fila do dono e do gerente; o CPF e o endereço ficam guardados só até a emissão.</p>
              <div><Botao type="submit" tamanho="sm">Pedir nota fiscal</Botao></div>
            </form>
          ) : null}
        </Cartao>
      )}
      {v.situacao === "cancelada" && historicoDoFisco && <Cartao titulo="Nota fiscal" icone={FileText}>{historicoDoFisco}</Cartao>}
      {anexos && (
        <Cartao titulo="Documentos da venda" icone={Paperclip}
          subtitulo="Contrato do financiamento, termo de garantia, contrato da linha e comprovantes, guardados em privado; nada se apaga">
          {anexos.length === 0 && <p className="text-sm text-suave">Nenhum documento guardado.</p>}
          {anexos.length > 0 && (
            <ul className="divide-y divide-borda text-sm">
              {anexos.map((a) => {
                const nome = TIPOS_DE_ANEXO[a.tipo as keyof typeof TIPOS_DE_ANEXO] ?? a.tipo;
                const link = a.retirado_em ? null : linkDoAnexo(a.caminho);
                return (
                  <li key={a.id} className="space-y-1 py-2">
                    <p className="flex flex-wrap items-center gap-2">
                      {link ? <a href={link} target="_blank" rel="noreferrer" className="font-semibold text-acao">{nome}</a>
                        : <span className={a.retirado_em ? "text-suave line-through" : "font-semibold"}>{nome}</span>}
                      <span className="numeros text-xs text-suave">{`${a.formato.toUpperCase()} · ${tamanhoDoAnexo(a.bytes)} · ${dataHora(a.enviado_em)}`}</span>
                      {a.retirado_em && <Selo tom="neutro">retirado</Selo>}
                    </p>
                    {a.descricao && <p className="text-xs text-suave">{a.descricao}</p>}
                    {a.retirado_em && <p className="text-xs text-suave">{`Retirado em ${dataHora(a.retirado_em)}: ${a.motivo_retirada ?? ""}`}</p>}
                    {podeCancelar.data && !a.retirado_em && (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-acao">Retirar (documento errado)</summary>
                        <form action={retirarAnexo} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="venda" value={v.id} />
                          <input type="hidden" name="anexo" value={a.id} />
                          <label className="min-w-0 flex-1 text-xs font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                          <Botao type="submit" tamanho="sm" variante="secundario">Retirar</Botao>
                        </form>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <FormularioDeArquivo action={`/vendas/${v.id}/anexos`} className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium">Tipo do documento
              <select name="tipo" required className={campo}>
                {Object.entries(TIPOS_DE_ANEXO).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium">Descrição <span className="font-normal text-suave">(obrigatória em &quot;Outro documento&quot;)</span><input name="descricao" maxLength={120} className={campo} /></label>
            <label className="text-xs font-medium sm:col-span-2">Arquivo: PDF ou foto, até 5 MB
              <input type="file" name="arquivo" required accept="application/pdf,image/jpeg,image/png,image/webp" className={`${campo} py-2`} />
            </label>
            <div><Botao type="submit" tamanho="sm" enquanto="Enviando o arquivo…">Guardar o documento</Botao></div>
          </FormularioDeArquivo>
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

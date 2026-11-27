import { ArrowLeft, ClipboardList, ReceiptText, ShieldCheck, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MoldeReal } from "../../../../componentes/MoldeReal";
import { Aviso, Cartao, TituloPagina } from "../../../../componentes/ui";
import { ehUuid } from "../../../../lib/acesso/regras";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { formatarRevelado } from "../../../../lib/clientes/regras";
import { ValorForaDoLimite } from "../../../../lib/dinheiro";
import { RespostaInesperada } from "../../../../lib/financeiro/painel";
import { agora, brl } from "../../../../lib/formato";
import { lerDadosParaEmitir, type DadosParaEmitir } from "../../../../lib/notas/dados-para-emitir";
import { cnpjDoEmitente, fraseSemDetalhe, lerFatosParaEmitir, textoParaCopiar, type FatosParaEmitir } from "../../../../lib/notas/fatos-para-emitir";
import { ERROS_DAS_NOTAS, erroDasNotas } from "../../../../lib/notas/regras";

export const metadata: Metadata = { title: "Dados para emitir a nota" };
export const dynamic = "force-dynamic";

const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

type Supabase = Awaited<ReturnType<typeof obterSessao>>["supabase"];

// NF-e 55 no fluxo interno (NFE55-a, pedido do proprietário de 27/11/2026; revisão do mesmo dia): a loja que emite e os
// fatos da venda na MESMA tela, pela leitura normalizada do comprovante. Só leitura, com a sessão de quem abre (o RLS de
// cada tabela decide), das mesmas tabelas que o comprovante já lê; nada novo no banco. Qualquer falha aqui vira um aviso e
// não esconde o destinatário: sem os fatos, nada vai para o texto de copiar.
async function lerFatos(supabase: Supabase, pedido: { venda_id: string; unidade_id: string }): Promise<FatosParaEmitir | null> {
  const [venda, itens, pagamentos, devolucoes, estornos, loja] = await Promise.all([
    supabase.from("vendas").select("numero, situacao, concluida_em, subtotal_centavos, desconto_centavos, total_centavos, troco_centavos, a_receber_centavos, devolvido_centavos")
      .eq("id", pedido.venda_id).maybeSingle(),
    supabase.from("venda_itens").select("variante_id, tipo, quantidade, preco_unitario_centavos, desconto_centavos").eq("venda_id", pedido.venda_id).order("criado_em"),
    supabase.from("venda_pagamentos").select("ordem, meio, valor_centavos, entrada_centavos, comprovante, situacao, parcelas, entrada_do_financiamento, bandeira_cartao, modalidade_cartao, acrescimo_cliente_centavos")
      .eq("venda_id", pedido.venda_id).order("ordem"),
    // Se houve devolução ou estorno, o texto não leva os itens nem os valores: basta saber se existe um.
    supabase.from("venda_devolucoes").select("id").eq("venda_id", pedido.venda_id).limit(1),
    supabase.from("estornos_externos").select("id").eq("venda_id", pedido.venda_id).limit(1),
    supabase.from("unidades").select("nome, cnpj, cidade, uf, unidade_emissora_id").eq("id", pedido.unidade_id).maybeSingle(),
  ]);
  if (venda.error || itens.error || pagamentos.error || devolucoes.error || estornos.error || loja.error || !venda.data || !loja.data) return null;
  // A loja sem CNPJ emite pela emissora dela: a mesma regra com que o banco confere a chave (notas_registrar_emissao).
  const emissora = loja.data.cnpj ? null : loja.data.unidade_emissora_id;
  const [variantes, daEmissora, configuracao] = await Promise.all([
    itens.data.length ? supabase.from("variantes").select("id, sku, nome").in("id", itens.data.map((i) => i.variante_id)) : Promise.resolve({ data: [], error: null }),
    emissora ? supabase.from("unidades").select("nome, cnpj, cidade, uf, unidade_emissora_id").eq("id", emissora).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("unidade_configuracoes").select("cep, logradouro, numero, complemento, bairro, inscricao_estadual, inscricao_municipal")
      .eq("unidade_id", emissora ?? pedido.unidade_id).lte("vigente_desde", agora().toISOString())
      .order("vigente_desde", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (variantes.error || daEmissora.error || configuracao.error) return null;
  try {
    return lerFatosParaEmitir({
      venda: venda.data, itens: itens.data, variantes: variantes.data, pagamentos: pagamentos.data, devolucoes: devolucoes.data, estornos: estornos.data,
      loja: loja.data, emissora: daEmissora.data, configuracao: configuracao.data,
    });
  } catch (erro) {
    if (erro instanceof RespostaInesperada || erro instanceof ValorForaDoLimite) return null;
    throw erro;
  }
}

// Lote K1b (#76): quem aprova a nota na loja vê, enquanto ela espera a emissão, o nome, o CPF/CNPJ e o endereço
// guardados no pedido, para digitar no emissor (o sistema ainda não emite: ADR-006). O banco confere a loja e a
// permissão e registra cada abertura na auditoria, sem os valores; nada vai para o endereço da página.
export default async function DadosParaEmitirANota({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const sessao = await obterSessao({ exigirLoja: true });
  const [r, pedido] = await Promise.all([
    sessao.supabase.rpc("notas_dados_para_emitir", { p_pedido: id }),
    sessao.supabase.from("notas_pedidos").select("venda_id, unidade_id").eq("id", id).maybeSingle(),
  ]);
  if (r.error?.code === "P0002") notFound();
  let dados: DadosParaEmitir | null = null;
  let aviso: string | null = null;
  if (r.error) {
    aviso = FUNCAO_AUSENTE.has(r.error.code) ? "Indisponível neste ambiente: o banco ainda não tem os dados para emitir." : ERROS_DAS_NOTAS[erroDasNotas(r.error)];
  } else {
    try {
      dados = lerDadosParaEmitir(r.data);
    } catch (erro) {
      if (!(erro instanceof RespostaInesperada)) throw erro;
      aviso = ERROS_DAS_NOTAS.falha;
    }
  }
  // Os fatos só depois de o banco liberar os dados para emitir (a permissão, a loja e a auditoria da abertura).
  const fatos = dados && !pedido.error && pedido.data ? await lerFatos(sessao.supabase, pedido.data) : null;
  const documento = dados?.documento ? `${dados.documento.length === 14 ? "CNPJ" : "CPF"} ${formatarRevelado("documento", dados.documento)}` : null;
  const comprovante = pedido.data ? `/vendas/${pedido.data.venda_id}` : null;

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/notas" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Notas fiscais</Link>
      <TituloPagina titulo={dados ? `Dados para emitir · pedido nº ${dados.numero}` : "Dados para emitir"} subtitulo="Digite no emissor exatamente o que está aqui. Abrir esta tela fica na auditoria." />
      {aviso && <Aviso tom="aviso" className="mt-4">{aviso}</Aviso>}
      {dados && (
        <Cartao className="mt-4" titulo="Destinatário" icone={ShieldCheck}
          subtitulo={dados.dadosDe ? `Do cadastro do cliente como estava em ${quando(dados.dadosDe)} (corrigir o cadastro depois não muda este pedido).` : undefined}>
          {dados.documento === null ? (
            <p className="text-sm">Nota sem cliente identificado{dados.nome ? ` (nome informado: ${dados.nome})` : ""}: emita sem destinatário, conforme a orientação do contador.</p>
          ) : (
            <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-suave">Nome</dt><dd className="font-medium">{dados.nome ?? "—"}</dd>
              <dt className="text-suave">{dados.documento.length === 14 ? "CNPJ" : "CPF"}</dt><dd className="numeros font-medium">{formatarRevelado("documento", dados.documento)}</dd>
              <dt className="text-suave">Endereço</dt><dd>{dados.endereco ? formatarRevelado("endereco", dados.endereco) : "não guardado (pedido anterior à regra do endereço ou documento digitado na venda)"}</dd>
            </dl>
          )}
        </Cartao>
      )}
      {dados && !fatos && <Aviso tom="aviso" className="mt-4">Não deu para ler agora a venda e a loja deste pedido: confira os itens no comprovante da venda.</Aviso>}
      {dados && fatos && (
        <>
          <Cartao className="mt-4" titulo="Quem emite" icone={Store}
            subtitulo={fatos.emitente.porOutraLoja ? "A loja da venda não tem CNPJ: emite pelo da loja emissora dela." : "A loja da venda, como está no cadastro em Lojas."}>
            <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-suave">Loja</dt><dd className="font-medium">{fatos.emitente.nome}</dd>
              <dt className="text-suave">CNPJ</dt><dd className="numeros font-medium">{cnpjDoEmitente(fatos.emitente)}</dd>
              <dt className="text-suave">Inscrição estadual</dt><dd className="numeros">{fatos.emitente.inscricaoEstadual ?? "não configurada"}</dd>
              {fatos.emitente.inscricaoMunicipal && <><dt className="text-suave">Inscrição municipal</dt><dd className="numeros">{fatos.emitente.inscricaoMunicipal}</dd></>}
              <dt className="text-suave">Endereço</dt><dd>{fatos.emitente.endereco ?? "não configurado"}</dd>
            </dl>
          </Cartao>
          <Cartao className="mt-4" titulo={`Venda nº ${fatos.venda.numero}`} icone={ReceiptText}
            subtitulo={`Como no comprovante${fatos.venda.concluidaEm ? ` (concluída em ${quando(fatos.venda.concluidaEm)})` : ""}.`}>
            {fatos.semDetalhe.length > 0 && (
              <Aviso tom="aviso" className="mb-2">O texto para copiar não leva os itens e os valores: {fraseSemDetalhe(fatos)}. Confira no comprovante e com o contador antes de emitir.</Aviso>
            )}
            <ul className="divide-y divide-borda text-sm">
              {fatos.itens.map((i, n) => (
                <li key={`${n}-${i.sku}`} className="flex justify-between gap-2 py-2">
                  <span>{i.descricao}<span className="numeros block text-xs text-suave">{`${i.sku} · ${i.quantidade} × ${brl(i.unitario)}${i.desconto ? ` − desconto ${brl(i.desconto)}` : ""}`}</span></span>
                  <span className="numeros font-semibold">{brl(i.total)}</span>
                </li>
              ))}
            </ul>
            {/* Os totais e os pagamentos como o comprovante mostra (lib/vendas/comprovante.ts): o dinheiro é o entregue; o troco está aqui. */}
            <dl className="numeros mt-2 grid grid-cols-2 gap-1 border-t border-borda pt-2 text-sm">
              <dt>Subtotal</dt><dd className="text-right">{brl(fatos.totais.subtotal)}</dd>
              <dt>Descontos</dt><dd className="text-right">− {brl(fatos.totais.desconto)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right font-bold">{brl(fatos.totais.total)}</dd>
              {fatos.totais.troco > 0 && <><dt>Troco</dt><dd className="text-right">{brl(fatos.totais.troco)}</dd></>}
              {fatos.totais.aReceber > 0 && <><dt>A receber da financeira</dt><dd className="text-right">{brl(fatos.totais.aReceber)}</dd></>}
              {fatos.totais.devolvido > 0 && <><dt>Devolvido</dt><dd className="text-right">− {brl(fatos.totais.devolvido)}</dd></>}
            </dl>
            <ul className="mt-2 space-y-1 text-xs">{fatos.pagamentos.map((linha, n) => <li key={`${n}-${linha}`} className="numeros">{linha}</li>)}</ul>
            <p className="mt-3 text-xs text-suave">
              Os pagamentos não vão no texto para copiar: a forma de pagamento na nota, o troco e o financiamento são do contador e do emissor.
              NCM, CFOP e tributos também não estão no cadastro dos produtos, nem o modelo da nota (NF-e 55 ou NFC-e 65), que é do contador.
              {comprovante && <> <Link href={comprovante} className="font-semibold text-acao">Abrir o comprovante da venda</Link></>}
            </p>
          </Cartao>
          <Cartao className="mt-4" titulo="Tudo para copiar" icone={ClipboardList} subtitulo="Toque no quadro, selecione tudo e copie para o emissor. Depois de emitir, registre a chave na fila de Notas.">
            <textarea readOnly rows={10} aria-label="Dados da nota para copiar" className="numeros w-full rounded-botao border border-borda bg-white p-2 text-xs"
              defaultValue={textoParaCopiar(fatos, dados.numero, { nome: dados.nome, documento, endereco: dados.endereco ? formatarRevelado("endereco", dados.endereco) : null })} />
          </Cartao>
        </>
      )}
    </MoldeReal>
  );
}

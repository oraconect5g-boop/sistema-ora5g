import { AlarmClock, FileCheck2, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { chaveEmGrupos, MODELOS_DE_NOTA, SITUACOES_DA_NOTA, tempoNaFila, type SituacaoDaNota } from "@ora5g/dominio/fiscal";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { centavosDoBanco } from "../../lib/dinheiro";
import { brl } from "../../lib/formato";
import { ERROS_DAS_NOTAS, haQuanto } from "../../lib/notas/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../lib/parametros";
import { cancelarPedidoDeNota, decidirNota, definirPrazo, registrarEmissao } from "./acoes";

export const metadata: Metadata = { title: "Notas fiscais" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const OK = {
  aprovada: "Nota aprovada. Emita no portal e registre a chave de acesso aqui.",
  correcao: "Correção pedida a quem fez a venda.",
  emitida: "Emissão registrada com a chave de acesso.",
  cancelada: "Pedido de nota cancelado.",
  prazo: "Prazo da fila registrado (com a fonte na auditoria).",
} as const;
const ehSituacao = (s: string): s is SituacaoDaNota => Object.hasOwn(SITUACOES_DA_NOTA, s);

// Fila de notas da loja do turno (ADR-006) para quem aprova (dono e gerente). Sem emissor contratado
// (A4), a emissão é feita no portal de sempre e registrada aqui pela chave de acesso.
export default async function Notas({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; ok?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DAS_NOTAS, parametros.erro);
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const [aprova, gereLojas, politica, abertos, emitidos] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "nota.aprovar", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "unidades.gerir", p_unidade: unidade }),
    supabase.from("fiscal_politicas").select("alerta_minutos, fonte").maybeSingle(),
    supabase.from("notas_pedidos").select("id, numero, venda_id, tipo, situacao, venda_concluida_em, destinatario_nome, destinatario_mascarado, observacao")
      .eq("unidade_id", unidade).in("situacao", ["aguardando_aprovacao", "correcao_solicitada", "aprovada"]).order("venda_concluida_em").limit(50),
    supabase.from("notas_pedidos").select("id, numero, venda_id, chave_acesso, modelo, serie, numero_documento, emitida_em")
      .eq("unidade_id", unidade).eq("situacao", "emitida").order("emitida_em", { ascending: false }).limit(20),
  ]);
  if (aprova.error || gereLojas.error || politica.error || abertos.error || emitidos.error) throw new FalhaDoServico("notas");
  if (!aprova.data) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">A fila de notas é do dono e do gerente da loja.</Aviso></MoldeReal>;
  }
  const vendas = abertos.data.length
    ? await supabase.from("vendas").select("id, numero, total_centavos").in("id", abertos.data.map((p) => p.venda_id))
    : { data: [], error: null };
  if (vendas.error) throw new FalhaDoServico("notas_vendas");
  const alerta = politica.data?.alerta_minutos ?? null;
  const agora = new Date();
  const fila = abertos.data.map((p) => ({ ...p, ...tempoNaFila(p.venda_concluida_em, agora, alerta), venda: vendas.data.find((v) => v.id === p.venda_id) }));
  const atrasadas = fila.filter((p) => p.atrasada).length;

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Notas fiscais" />
      {erro && <Aviso tom="perigo">{ERROS_DAS_NOTAS[erro]}</Aviso>}
      {ok && <Aviso tom="sucesso">{OK[ok]}</Aviso>}
      <Aviso tom="info">O sistema ainda não emite nota (emissor fiscal a contratar com o contador). Emita no portal de sempre e registre a chave de acesso aqui: a aprovação nunca segura a emissão.</Aviso>
      {alerta === null
        ? <p className="text-sm text-suave"><AlarmClock aria-hidden className="mr-1 inline size-4" />Sem prazo de alerta registrado: a fila mostra só há quanto tempo cada venda foi feita (o prazo legal vem do contador).</p>
        : <p className="text-sm"><AlarmClock aria-hidden className="mr-1 inline size-4" />Alerta depois de {alerta} min da venda · fonte: {politica.data?.fonte}</p>}
      {atrasadas > 0 && <Aviso tom="perigo" titulo={`${atrasadas} nota(s) passaram do prazo de alerta`}>Emita primeiro as mais antigas.</Aviso>}

      <Cartao titulo="Fila" subtitulo={`${fila.length} pedido(s), da venda mais antiga para a mais nova`} icone={FileText}>
        {fila.length === 0 ? <p className="text-sm text-suave">Nenhuma nota pendente nesta loja.</p> : (
          <ul className="divide-y divide-borda">
            {fila.map((p) => (
              <li key={p.id} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/vendas/${p.venda_id}`} className="font-semibold text-acao">{p.tipo === "devolucao" ? "Nota de devolução · venda" : "Venda"} nº {p.venda?.numero ?? "—"}{p.tipo === "devolucao" ? "" : ` · ${brl(centavosDoBanco(p.venda?.total_centavos ?? 0))}`}</Link>
                  <span className="flex items-center gap-2">
                    <Selo tom={p.atrasada ? "perigo" : "neutro"}>{haQuanto(p.minutos)}</Selo>
                    <Selo tom={p.situacao === "aprovada" ? "sucesso" : p.situacao === "correcao_solicitada" ? "aviso" : "info"} ponto>{ehSituacao(p.situacao) ? SITUACOES_DA_NOTA[p.situacao] : p.situacao}</Selo>
                  </span>
                </div>
                {(p.destinatario_nome || p.destinatario_mascarado) && <p className="text-xs text-suave">Na nota: {[p.destinatario_nome, p.destinatario_mascarado].filter(Boolean).join(" · ")}</p>}
                {p.observacao && <p className="text-xs text-suave">Observação: {p.observacao}</p>}
                {p.situacao === "aguardando_aprovacao" && (
                  <form action={decidirNota} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="pedido" value={p.id} />
                    <Botao type="submit" name="decisao" value="aprovar" tamanho="sm">Aprovar</Botao>
                    <label className="text-xs font-medium">O que corrigir<input name="observacao" className={campo} /></label>
                    <Botao type="submit" name="decisao" value="corrigir" tamanho="sm" variante="secundario">Pedir correção</Botao>
                  </form>
                )}
                <form action={registrarEmissao} className="grid gap-2 sm:grid-cols-3">
                  <input type="hidden" name="pedido" value={p.id} />
                  <label className="text-xs font-medium sm:col-span-2">Chave de acesso (44 dígitos)<input name="chave_acesso" required inputMode="numeric" autoComplete="off" className={campo} /></label>
                  <div className="self-end"><Botao type="submit" tamanho="sm" variante="secundario"><FileCheck2 aria-hidden className="size-4" /> Registrar emissão</Botao></div>
                </form>
                <details className="text-xs"><summary className="cursor-pointer text-suave">Cancelar pedido</summary>
                  <form action={cancelarPedidoDeNota} className="mt-1 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="pedido" value={p.id} />
                    <label className="font-medium">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
                    <Botao type="submit" tamanho="sm" variante="fantasma">Cancelar</Botao>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Emitidas" subtitulo="As 20 mais recentes desta loja" icone={FileCheck2}>
        {emitidos.data.length === 0 ? <p className="text-sm text-suave">Nenhuma emissão registrada.</p> : (
          <ul className="divide-y divide-borda text-sm">
            {emitidos.data.map((n) => (
              <li key={n.id} className="py-2">
                <Link href={`/vendas/${n.venda_id}`} className="font-semibold text-acao">{MODELOS_DE_NOTA[n.modelo ?? ""] ?? `Modelo ${n.modelo}`} nº {n.numero_documento} · série {n.serie}</Link>
                <p className="numeros break-all text-xs text-suave">{chaveEmGrupos(n.chave_acesso ?? "")}</p>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {gereLojas.data && (
        <Cartao titulo="Prazo de alerta da fila" subtitulo="Use o prazo que o contador orientar; a fonte fica na auditoria" icone={AlarmClock}>
          <form action={definirPrazo} className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm font-medium">Minutos desde a venda (vazio = sem alerta)<input name="alerta_minutos" inputMode="numeric" defaultValue={alerta ?? ""} className={campo} /></label>
            <label className="text-sm font-medium sm:col-span-2">Fonte (ex.: e-mail do contador de 10/11)<input name="fonte" required minLength={10} className={campo} /></label>
            <div><Botao type="submit" variante="secundario">Registrar prazo</Botao></div>
          </form>
        </Cartao>
      )}
    </MoldeReal>
  );
}

import { randomUUID } from "node:crypto";

import { ArrowRightLeft } from "lucide-react";
import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { ERROS_DA_TRANSFERENCIA, nomeDaSituacao } from "../../lib/transferencias/regras";
import { encerrarTransferencia, enviarTransferencia, receberTransferencia, separarTransferencia } from "./acoes";

export const metadata: Metadata = { title: "Transferências entre lojas" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const ABERTAS = new Set(["solicitada", "separada", "enviada"]);
const OK: Record<string, string> = {
  pedida: "Pedido registrado: aparece para a loja de origem.", separada: "Separado: os itens ficaram reservados na origem.",
  enviada: "Enviado: saiu do estoque da origem e está em trânsito.", recebida: "Recebido e conferido.",
  recusada: "Pedido recusado.", cancelada: "Pedido cancelado; a reserva foi liberada.",
};

// Pedidos internos de transferência (ADR-007, #60): os que saem e os que chegam na loja do turno.
// Lido pelo RLS (lojas envolvidas); cada passo é uma função do banco.
export default async function Transferencias({ searchParams }: { searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DA_TRANSFERENCIA, parametros.erro);
  const ok = textoDoParametro(parametros.ok);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const [lista, transfere, ajusta] = await Promise.all([
    supabase.from("transferencias").select("id, numero, origem_id, destino_id, variante_id, quantidade, motivo, situacao, solicitado_por, quantidade_recebida, observacao, solicitado_em")
      .or(`origem_id.eq.${unidade},destino_id.eq.${unidade}`).order("numero", { ascending: false }).limit(50),
    supabase.rpc("tem_permissao", { p_permissao: "estoque.transferir", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "estoque.ajustar", p_unidade: unidade }),
  ]);
  if (lista.error || transfere.error || ajusta.error) throw new FalhaDoServico("transferencias");
  const varianteIds = [...new Set(lista.data.map((t) => t.variante_id))];
  const unidadeIds = [...new Set(lista.data.flatMap((t) => [t.origem_id, t.destino_id]))];
  const [variantes, unidades, itensDasTransferencias] = await Promise.all([
    varianteIds.length ? supabase.from("variantes").select("id, nome, sku, produtos(tipo)").in("id", varianteIds) : Promise.resolve({ data: [], error: null }),
    unidadeIds.length ? supabase.from("unidades").select("id, nome, tipo").in("id", unidadeIds) : Promise.resolve({ data: [], error: null }),
    lista.data.length ? supabase.from("transferencia_itens").select("transferencia_id, item_serializado_id, recebido").in("transferencia_id", lista.data.map((t) => t.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  if (variantes.error || unidades.error || itensDasTransferencias.error) throw new FalhaDoServico("transferencias_detalhes");
  const variante = (id: string) => variantes.data.find((v) => v.id === id);
  const serializado = (id: string) => { const t = variante(id)?.produtos?.tipo; return t === "aparelho" || t === "chip"; };
  const local = (id: string) => unidades.data.find((u) => u.id === id);
  // IMEI/ICCID disponíveis na loja do turno para separar os pedidos de aparelho e chip.
  const aSeparar = lista.data.filter((t) => t.situacao === "solicitada" && t.origem_id === unidade && serializado(t.variante_id));
  const disponiveis = aSeparar.length
    ? await supabase.from("itens_serializados").select("id, variante_id, imei, iccid").eq("unidade_id", unidade).eq("em_estoque", true).eq("situacao", "disponivel")
      .in("variante_id", [...new Set(aSeparar.map((t) => t.variante_id))]).limit(100)
    : { data: [], error: null };
  if (disponiveis.error) throw new FalhaDoServico("transferencias_itens");
  const podeNaOrigem = (origem: string) => (local(origem)?.tipo === "excecao" ? ajusta.data : transfere.data) === true;
  const final = (n: string | null) => (n ? `…${n.slice(-6)}` : "");

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Transferências" />
      <p className="text-sm text-suave">Para pedir, abra o produto no estoque e toque em &quot;na rede&quot;. Aqui a loja de origem separa e envia, e a de destino recebe e confere.</p>
      {ok && Object.hasOwn(OK, ok) && <Aviso tom="sucesso">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo">{ERROS_DA_TRANSFERENCIA[erro]}</Aviso>}
      {lista.data.length === 0 && <Aviso tom="info">Nenhuma transferência saindo ou chegando nesta loja.</Aviso>}
      {lista.data.map((t) => {
        const v = variante(t.variante_id);
        const saindo = t.origem_id === unidade;
        const itens = itensDasTransferencias.data.filter((i) => i.transferencia_id === t.id);
        return (
          <Cartao key={t.id} titulo={`Nº ${t.numero} · ${v?.nome ?? "Produto"} × ${t.quantidade}`} subtitulo={`${local(t.origem_id)?.nome ?? "origem"} → ${local(t.destino_id)?.nome ?? "destino"} · ${saindo ? "saindo daqui" : "chegando aqui"}`} icone={ArrowRightLeft}>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Selo tom={t.situacao === "recebida" ? "sucesso" : t.situacao === "recebida_com_divergencia" ? "aviso" : ABERTAS.has(t.situacao) ? "info" : "neutro"} ponto>{nomeDaSituacao(t.situacao)}</Selo>
              {local(t.destino_id)?.tipo === "excecao" && <Selo tom="aviso">para DEFEITOS</Selo>}
              <span className="text-xs text-suave">Motivo: {t.motivo}</span>
            </p>
            {t.quantidade_recebida !== null && t.quantidade_recebida < t.quantidade && <p className="mt-1 text-xs text-aviso">Recebidos {t.quantidade_recebida} de {t.quantidade}: {t.observacao}</p>}
            {itens.length > 0 && <p className="numeros mt-1 text-xs text-suave">{itens.length} IMEI/ICCID separado(s){itens.some((i) => i.recebido === false) ? " · algum não chegou" : ""}</p>}

            {t.situacao === "solicitada" && saindo && podeNaOrigem(t.origem_id) && (
              <form action={separarTransferencia} className="mt-3 space-y-2">
                <input type="hidden" name="transferencia" value={t.id} />
                {serializado(t.variante_id) ? (
                  <fieldset className="space-y-1 text-sm"><legend className="text-xs font-medium">Escolha {t.quantidade} IMEI/ICCID desta loja</legend>
                    {disponiveis.data.filter((d) => d.variante_id === t.variante_id).map((d) => (
                      <label key={d.id} className="numeros flex min-h-11 items-center gap-2"><input type="checkbox" name="item" value={d.id} className="size-5" /> {d.imei ? `IMEI ${d.imei}` : `ICCID ${final(d.iccid)}`}</label>
                    ))}
                    {disponiveis.data.every((d) => d.variante_id !== t.variante_id) && <p className="text-xs text-perigo">Nenhum disponível nesta loja agora.</p>}
                  </fieldset>
                ) : <p className="text-xs text-suave">Separa {t.quantidade} unidade(s) do saldo desta loja (ficam reservadas).</p>}
                <Botao type="submit" tamanho="sm">Separar</Botao>
              </form>
            )}
            {t.situacao === "separada" && saindo && podeNaOrigem(t.origem_id) && (
              <form action={enviarTransferencia} className="mt-3"><input type="hidden" name="transferencia" value={t.id} /><Botao type="submit" tamanho="sm">Enviar (sai do estoque desta loja)</Botao></form>
            )}
            {t.situacao === "enviada" && !saindo && transfere.data && (
              <form action={receberTransferencia} className="mt-3 grid gap-2">
                <input type="hidden" name="transferencia" value={t.id} /><input type="hidden" name="serializado" value={serializado(t.variante_id) ? "sim" : "nao"} />
                {serializado(t.variante_id)
                  ? <label className="text-xs font-medium">IMEI/ICCID lidos nos itens que chegaram (um por linha)<textarea name="identificadores" rows={3} inputMode="numeric" className={`${campo} py-2`} /></label>
                  : <label className="text-xs font-medium">Quantidade contada<input name="quantidade" inputMode="numeric" defaultValue={String(t.quantidade)} required className={campo} /></label>}
                <label className="text-xs font-medium">Observação (obrigatória se faltar item)<input name="observacao" maxLength={500} className={campo} /></label>
                <div><Botao type="submit" tamanho="sm">Receber e conferir</Botao></div>
              </form>
            )}
            {(t.situacao === "solicitada" || t.situacao === "separada") && (t.solicitado_por === usuario.id || (saindo && podeNaOrigem(t.origem_id))) && (
              <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-perigo">{saindo && t.situacao === "solicitada" ? "Recusar ou cancelar" : "Cancelar"}</summary>
                <form action={encerrarTransferencia} className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="transferencia" value={t.id} /><input type="hidden" name="chave" value={randomUUID()} />
                  <label className="text-xs font-medium">O quê<select name="situacao" className={campo} defaultValue="cancelada">
                    <option value="cancelada">Cancelar</option>{saindo && t.situacao === "solicitada" && <option value="recusada">Recusar (origem)</option>}
                  </select></label>
                  <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
                  <div><Botao type="submit" tamanho="sm" variante="perigo">Confirmar</Botao></div>
                </form>
              </details>
            )}
          </Cartao>
        );
      })}
    </MoldeReal>
  );
}

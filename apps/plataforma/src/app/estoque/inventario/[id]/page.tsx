import { ArrowLeft, ClipboardCheck, Send, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MoldeReal } from "../../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../../../componentes/ui";
import { ehUuid } from "../../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../../lib/acesso/sessao";
import { ERROS_DO_INVENTARIO, SITUACOES_DO_INVENTARIO } from "../../../../lib/estoque/inventario";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../../lib/parametros";
import { cancelarInventario, contarItem, decidirInventario, enviarInventario } from "../acoes";

export const metadata: Metadata = { title: "Inventário" };
export const dynamic = "force-dynamic";

const OK = {
  aberto: "Inventário aberto: conte cada item e envie para aprovação.",
  contado: "Contagem gravada.",
  enviado: "Inventário enviado: agora outra pessoa com permissão de ajuste aprova ou recusa.",
  aprovado: "Inventário aprovado: os ajustes entraram no livro do estoque.",
  recusado: "Inventário recusado: o estoque não mudou.",
  cancelado: "Inventário cancelado.",
} as const;
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";

type Item = {
  variante_id: string; tipo: string; sistema_quantidade: number | null; contado_quantidade: number | null; contados: string[] | null;
  contado_em: string | null; ajuste_quantidade: number | null; nao_baixados: string[] | null; encontrados_fora: string[] | null;
  variantes: { sku: string; nome: string } | null;
};
function Motivo({ exemplo }: { exemplo: string }) {
  return <label className="block text-sm font-medium">Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={200} placeholder={exemplo} className={campo} /></label>;
}

// Um inventário: contagem às cegas (a quantidade do sistema só aparece depois do envio, para não
// influenciar quem conta), envio por quem pede o ajuste e decisão por outra pessoa (lote L4b).
export default async function Inventario({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DO_INVENTARIO, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario } = sessao;

  const [inventario, itens] = await Promise.all([
    supabase.from("inventarios").select("id, numero, descricao, situacao, unidade_id, criado_por, enviado_por, criado_em, motivo_envio, motivo_decisao").eq("id", id).maybeSingle(),
    supabase.from("inventario_itens").select("variante_id, tipo, sistema_quantidade, contado_quantidade, contados, contado_em, ajuste_quantidade, nao_baixados, encontrados_fora, variantes(sku, nome)").eq("inventario_id", id),
  ]);
  if (inventario.error || itens.error) throw new FalhaDoServico("inventario");
  if (!inventario.data) notFound();
  const inv = inventario.data;
  const lista = (itens.data as unknown as Item[]).sort((a, b) => (a.variantes?.sku ?? "").localeCompare(b.variantes?.sku ?? ""));
  const [confere, pede, ajusta] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "estoque.conferir", p_unidade: inv.unidade_id }),
    supabase.rpc("tem_permissao", { p_permissao: "estoque.solicitar_ajuste", p_unidade: inv.unidade_id }),
    supabase.rpc("tem_permissao", { p_permissao: "estoque.ajustar", p_unidade: inv.unidade_id }),
  ]);
  if (confere.error || pede.error || ajusta.error) throw new FalhaDoServico("tem_permissao");
  const emContagem = inv.situacao === "em_contagem";
  const mostraSistema = !emContagem;
  const faltam = lista.filter((i) => !i.contado_em).length;
  const souParte = usuario.id === inv.criado_por || usuario.id === inv.enviado_por;
  const s = SITUACOES_DO_INVENTARIO[inv.situacao as keyof typeof SITUACOES_DO_INVENTARIO];

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/estoque/inventario" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Inventários</Link>
      <TituloPagina titulo={`Inventário nº ${inv.numero}`} subtitulo={<span className="flex flex-wrap items-center gap-2">{inv.descricao}<Selo tom={s?.tom ?? "neutro"}>{s?.texto ?? inv.situacao}</Selo></span>} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_INVENTARIO[erro]}</Aviso>}
      {inv.motivo_envio && <p className="mt-2 text-sm text-suave">Enviado com o motivo: {inv.motivo_envio}{inv.motivo_decisao ? ` · Decisão: ${inv.motivo_decisao}` : ""}</p>}

      <Cartao className="mt-4" titulo={emContagem ? `Contagem (${lista.length - faltam} de ${lista.length} itens contados)` : "Resultado da contagem"} icone={ClipboardCheck}>
        <ul className="divide-y divide-borda text-sm">
          {lista.map((i) => {
            const diferenca = i.contado_quantidade !== null && i.sistema_quantidade !== null ? i.contado_quantidade - i.sistema_quantidade : null;
            return (
              <li key={i.variante_id} className="space-y-2 py-3">
                <p className="flex flex-wrap items-center gap-2"><span className="numeros font-semibold">{i.variantes?.sku}</span> {i.variantes?.nome}
                  {i.contado_em ? <Selo tom="sucesso">contado</Selo> : <Selo tom="aviso">falta contar</Selo>}</p>
                {mostraSistema && (
                  <p className="text-xs text-suave">
                    Sistema: {i.sistema_quantidade ?? "—"} · Contado: {i.contado_quantidade ?? "—"}
                    {diferenca !== null && diferenca !== 0 && <strong className={diferenca < 0 ? " text-perigo" : " text-aviso"}> · diferença {diferenca > 0 ? `+${diferenca}` : diferenca}</strong>}
                    {i.ajuste_quantidade !== null && ` · ajuste aplicado ${i.ajuste_quantidade}`}
                    {i.nao_baixados && i.nao_baixados.length > 0 && ` · ${i.nao_baixados.length} não baixado(s) (vendido, reservado ou transferido depois)`}
                    {i.encontrados_fora && i.encontrados_fora.length > 0 && ` · ${i.encontrados_fora.length} lido(s) sem cadastro nesta loja: registrar por entrada, transferência ou devolução`}
                  </p>
                )}
                {emContagem && confere.data && (
                  <form action={contarItem} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="inventario" value={inv.id} /><input type="hidden" name="variante" value={i.variante_id} />
                    {i.tipo === "acessorio" ? (
                      <label className="block text-xs font-medium">Quantidade contada<input name="quantidade" type="number" min={0} max={100000} required defaultValue={i.contado_quantidade ?? ""} className={campo} /></label>
                    ) : (
                      <label className="block text-xs font-medium">{i.tipo === "aparelho" ? "IMEI" : "ICCID"} de cada unidade encontrada (um por linha; vazio se não achou nenhum)
                        <textarea name="identificadores" rows={3} inputMode="numeric" defaultValue={(i.contados ?? []).join("\n")} className={`${campo} py-2 font-mono`} />
                      </label>
                    )}
                    <Botao type="submit" tamanho="sm" variante="secundario" className="self-end">Gravar contagem</Botao>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Cartao>

      <div className="mt-4 flex flex-col gap-2">
        {emContagem && pede.data && (
          <details className="rounded-xl border border-borda bg-white px-3 py-2" open={faltam === 0}>
            <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao"><Send aria-hidden className="size-4" /> Enviar para aprovação</summary>
            <form action={enviarInventario} className="mt-2 space-y-2">
              <input type="hidden" name="inventario" value={inv.id} />
              {faltam > 0 && <p className="text-xs text-aviso">Faltam {faltam} item(ns) para contar.</p>}
              <Motivo exemplo="Contagem de segunda-feira" />
              <Botao type="submit" tamanho="sm" disabled={faltam > 0}>Enviar</Botao>
            </form>
          </details>
        )}
        {inv.situacao === "enviado" && ajusta.data && (souParte
          ? <Aviso tom="info">Você abriu ou enviou este inventário: outra pessoa com permissão de ajuste decide.</Aviso>
          : (
            <details className="rounded-xl border border-borda bg-white px-3 py-2" open>
              <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao"><ShieldCheck aria-hidden className="size-4" /> Decidir</summary>
              <form action={decidirInventario} className="mt-2 space-y-2">
                <input type="hidden" name="inventario" value={inv.id} />
                <fieldset className="flex flex-wrap gap-4 text-sm">
                  <label className="flex min-h-10 items-center gap-2"><input type="radio" name="aprovar" value="sim" required className="size-4 accent-acao" /> Aprovar e ajustar o estoque</label>
                  <label className="flex min-h-10 items-center gap-2"><input type="radio" name="aprovar" value="nao" className="size-4 accent-acao" /> Recusar (recontar)</label>
                </fieldset>
                <Motivo exemplo="Conferido com o gerente" />
                <Botao type="submit" tamanho="sm">Registrar decisão</Botao>
              </form>
            </details>
          ))}
        {(emContagem || inv.situacao === "enviado") && confere.data && (
          <details className="rounded-xl border border-borda bg-white px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-perigo">Cancelar inventário</summary>
            <form action={cancelarInventario} className="mt-2 space-y-2"><input type="hidden" name="inventario" value={inv.id} /><Motivo exemplo="Começar de novo" /><Botao type="submit" tamanho="sm" variante="perigo">Cancelar</Botao></form>
          </details>
        )}
      </div>
    </MoldeReal>
  );
}

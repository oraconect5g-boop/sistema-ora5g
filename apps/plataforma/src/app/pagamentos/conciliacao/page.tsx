import { Landmark, Scale } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MEIOS } from "@ora5g/dominio";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { brl } from "../../../lib/formato";
import { ERROS_DOS_PAGAMENTOS, periodoDaConciliacao, SITUACOES_DO_DINHEIRO, type SituacaoDoDinheiro } from "../../../lib/pagamentos/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { conciliarPagamento, desconciliarPagamento } from "../acoes";

export const metadata: Metadata = { title: "Conciliação" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const OK = { conciliado: "Pagamento conciliado com o extrato.", desfeito: "Conciliação desfeita; o motivo ficou na auditoria." } as const;
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const nomeDoMeio = (m: string) => (Object.hasOwn(MEIOS, m) ? MEIOS[m as keyof typeof MEIOS].nome : m);
type Linha = { id: string; venda_id: string; venda_numero: number; concluida_em: string; meio: string; valor: number; comprovante: string | null; terminal: string | null;
  dinheiro: SituacaoDoDinheiro; liquidado_em: string | null; valor_liquido: number | null; referencia: string | null };

// Conciliação manual (lote L7a: ORA-PAY-003 e ORA-PAY-007). Venda não é dinheiro recebido: os totais separam o
// dinheiro no caixa, o cartão e o Pix a liquidar, o conciliado, o que está com a financeira e os estornos.
// Sem API das maquininhas, nada é liquidado sozinho: quem concilia confere o extrato e informa a referência,
// o valor líquido e a data em que o dinheiro caiu (a taxa é a diferença).
export default async function Conciliacao({ searchParams }: { searchParams: Promise<{ inicio?: ValorDeParametro; fim?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DOS_PAGAMENTOS, parametros.erro);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { inicio, fim } = periodoDaConciliacao(textoDoParametro(parametros.inicio), textoDoParametro(parametros.fim), hoje);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const pode = await supabase.rpc("tem_permissao", { p_permissao: "pagamento.conciliar", p_unidade: situacao.unidade_id as string });
  if (pode.error) throw new FalhaDoServico("tem_permissao");
  if (!pode.data) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Conciliar pagamentos é da gerência da loja.</Aviso></MoldeReal>;
  const resposta = await supabase.rpc("pagamentos_do_periodo", { p_inicio: inicio, p_fim: fim });
  if (resposta.error) throw new FalhaDoServico("pagamentos_do_periodo");
  const { totais, pagamentos } = resposta.data as unknown as { totais: Partial<Record<SituacaoDoDinheiro, { quantidade: number; valor: number; liquido: number | null }>>; pagamentos: Linha[] };
  const ocultos = <><input type="hidden" name="inicio" value={inicio} /><input type="hidden" name="fim" value={fim} /></>;

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Conciliação de pagamentos" subtitulo={`Vendas concluídas de ${dataCurta(inicio)} a ${dataCurta(fim)}. Venda não é dinheiro recebido: confira cada cartão e Pix com o extrato.`} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DOS_PAGAMENTOS[erro]}</Aviso>}
      <form className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium">De<input name="inicio" type="date" defaultValue={inicio} className={campo} /></label>
        <label className="text-xs font-medium">Até<input name="fim" type="date" defaultValue={fim} className={campo} /></label>
        <Botao type="submit" tamanho="sm" variante="secundario">Ver</Botao>
      </form>

      <Cartao className="mt-4" titulo="Onde está o dinheiro" icone={Scale}>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {(Object.keys(SITUACOES_DO_DINHEIRO) as SituacaoDoDinheiro[]).filter((s) => totais[s]).map((s) => {
            const t = totais[s];
            return (
              <li key={s} className="flex items-center justify-between gap-2 rounded-xl border border-borda px-3 py-2">
                <Selo tom={SITUACOES_DO_DINHEIRO[s].tom}>{SITUACOES_DO_DINHEIRO[s].nome}</Selo>
                <span className="numeros text-right">{t?.quantidade} · {brl(t?.valor ?? 0)}{t?.liquido != null ? ` · líquido ${brl(t.liquido)}` : ""}</span>
              </li>
            );
          })}
          {Object.keys(totais).length === 0 && <li className="text-suave">Nenhum pagamento no período.</li>}
        </ul>
      </Cartao>

      <Cartao className="mt-4" titulo="Cartão e Pix do período" icone={Landmark}>
        <ul className="divide-y divide-borda text-sm">
          {pagamentos.map((p) => (
            <li key={p.id} className="space-y-2 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <Link href={`/vendas/${p.venda_id}`} className="font-semibold text-acao">Venda nº {p.venda_numero}</Link>
                <span className="numeros text-xs text-suave">{quando(p.concluida_em)} · {nomeDoMeio(p.meio)} · {brl(p.valor)}{p.comprovante ? ` · comprovante ${p.comprovante}` : ""}{p.terminal ? ` · ${p.terminal}` : ""}</span>
                <Selo tom={SITUACOES_DO_DINHEIRO[p.dinheiro]?.tom ?? "neutro"}>{SITUACOES_DO_DINHEIRO[p.dinheiro]?.nome ?? p.dinheiro}</Selo>
              </p>
              {p.dinheiro === "conciliado" && (
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <p className="numeros text-xs text-suave">Caiu em {p.liquidado_em ? dataCurta(p.liquidado_em) : "—"} · líquido {brl(p.valor_liquido ?? 0)} · taxa {brl(p.valor - (p.valor_liquido ?? 0))} · {p.referencia}</p>
                  <form action={desconciliarPagamento} className="flex flex-wrap items-end gap-2">
                    {ocultos}<input type="hidden" name="pagamento" value={p.id} />
                    <label className="text-xs font-medium">Motivo para desfazer<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                    <Botao type="submit" tamanho="sm" variante="fantasma">Desfazer</Botao>
                  </form>
                </div>
              )}
              {p.dinheiro === "a_liquidar" && (
                <form action={conciliarPagamento} className="grid gap-2 sm:grid-cols-4">
                  {ocultos}<input type="hidden" name="pagamento" value={p.id} />
                  <label className="text-xs font-medium">Referência do extrato<input name="referencia" required minLength={3} maxLength={80} placeholder="NSU ou lote" className={campo} /></label>
                  <label className="text-xs font-medium">Valor líquido (R$)<input name="liquido" required inputMode="decimal" placeholder={(p.valor / 100).toFixed(2).replace(".", ",")} className={campo} /></label>
                  <label className="text-xs font-medium">Caiu em<input name="data" type="date" required max={hoje} className={campo} /></label>
                  <Botao type="submit" tamanho="sm" className="self-end">Conciliar</Botao>
                </form>
              )}
            </li>
          ))}
          {pagamentos.length === 0 && <li className="py-2 text-suave">Nenhum cartão ou Pix no período.</li>}
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

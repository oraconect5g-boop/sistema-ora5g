import { randomUUID } from "node:crypto";

import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";

import { MEIOS } from "@ora5g/dominio";

import { Marca } from "../../componentes/Marca";
import { Aviso, Botao, Cartao, Selo } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { centavosDoBanco } from "../../lib/dinheiro";
import { brl } from "../../lib/formato";
import { chaveDoCatalogo, type ValorDeParametro } from "../../lib/parametros";
import { ERROS_DA_VENDA } from "../../lib/vendas/regras";
import { abrirCaixa } from "../vender/acoes";
import { conferirCaixa, fecharCaixa, movimentarCaixa } from "./acoes";

export const metadata: Metadata = { title: "Caixa" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const OK = { suprimento: "Suprimento lançado.", sangria: "Sangria lançada.", fechado: "Caixa fechado.", conferido: "Caixa conferido." } as const;
const nomeDoMeio = (m: string) => (Object.hasOwn(MEIOS, m) ? MEIOS[m as keyof typeof MEIOS].nome : m);

// Caixa do operador na loja do turno (ADR-004): resumo por meio, suprimento, sangria e fechamento.
// Quem confere caixa (caixa.conferir) vê os caixas fechados da loja para conferir.
export default async function Caixa({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; ok?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DA_VENDA, parametros.erro);
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const { supabase, usuario, situacao } = await obterSessao({ exigirLoja: true });
  const unidade = situacao.unidade_id as string;
  const [aberto, confere] = await Promise.all([
    supabase.from("caixas").select("id, aberto_em, fundo_centavos").eq("operador_id", usuario.id).eq("unidade_id", unidade).eq("situacao", "aberto").maybeSingle(),
    supabase.rpc("tem_permissao", { p_permissao: "caixa.conferir", p_unidade: unidade }),
  ]);
  if (aberto.error || confere.error) throw new FalhaDoServico("caixa");
  const movimentos = aberto.data ? await supabase.from("caixa_movimentos").select("tipo, meio, valor_centavos").eq("caixa_id", aberto.data.id) : { data: [], error: null };
  const fechados = confere.data ? await supabase.from("caixas").select("id, operador_id, fechado_em, esperado_centavos, contado_centavos, diferenca_centavos, observacao_fechamento").eq("unidade_id", unidade).eq("situacao", "fechado").order("fechado_em", { ascending: false }).limit(20) : { data: [], error: null };
  if (movimentos.error || fechados.error) throw new FalhaDoServico("caixa_detalhes");
  const porMeio = new Map<string, number>();
  for (const m of movimentos.data) porMeio.set(m.meio, (porMeio.get(m.meio) ?? 0) + centavosDoBanco(m.valor_centavos));

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="flex items-center justify-between gap-3"><Marca tamanho="text-2xl" /><nav className="flex gap-3 text-sm font-semibold text-acao"><Link href="/vender">Vender</Link><Link href="/inicio">Início</Link></nav></div>
      <h1 className="text-2xl font-bold tracking-tight">Caixa · {situacao.unidade_nome}</h1>
      {erro && <Aviso tom="perigo">{ERROS_DA_VENDA[erro]}</Aviso>}
      {ok && <Aviso tom="sucesso">{OK[ok]}</Aviso>}

      {!aberto.data ? (
        <Cartao titulo="Abrir caixa" icone={Wallet}>
          <form action={abrirCaixa} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="chave" value={randomUUID()} /><input type="hidden" name="voltar" value="/caixa" />
            <label className="text-sm font-medium">Fundo de troco (R$)<input name="fundo" inputMode="decimal" defaultValue="0,00" className={campo} /></label>
            <Botao type="submit">Abrir caixa</Botao>
          </form>
        </Cartao>
      ) : (
        <>
          <Cartao titulo="Meu caixa aberto" icone={Wallet}>
            <dl className="numeros grid grid-cols-2 gap-1 text-sm">
              {[...porMeio].map(([meio, valor]) => <Fragment key={meio}><dt>{nomeDoMeio(meio)}</dt><dd className="text-right">{brl(valor)}</dd></Fragment>)}
              {porMeio.size === 0 && <dt className="text-suave">Sem lançamentos.</dt>}
            </dl>
            <p className="mt-2 text-xs text-suave">&ldquo;Dinheiro&rdquo; é o que deve estar na gaveta (fundo + recebido − troco + suprimento − sangria − estornos).</p>
          </Cartao>
          <Cartao titulo="Suprimento ou sangria">
            <form action={movimentarCaixa} className="grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="chave" value={randomUUID()} />
              <label className="text-xs font-medium">Tipo<select name="tipo" className={campo}><option value="sangria">Sangria (retirada)</option><option value="suprimento">Suprimento (entrada)</option></select></label>
              <label className="text-xs font-medium">Valor (R$)<input name="valor" inputMode="decimal" required className={campo} /></label>
              <label className="text-xs font-medium sm:col-span-2">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
              <Botao type="submit" className="sm:col-span-4">Lançar</Botao>
            </form>
          </Cartao>
          <Cartao titulo="Fechar caixa" subtitulo="Conte o dinheiro da gaveta; diferença precisa de explicação.">
            <form action={fecharCaixa} className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs font-medium">Dinheiro contado (R$)<input name="contado" inputMode="decimal" required className={campo} /></label>
              <label className="text-xs font-medium sm:col-span-2">Observação<input name="observacao" className={campo} /></label>
              <Botao type="submit" variante="secundario" className="sm:col-span-3">Fechar caixa</Botao>
            </form>
          </Cartao>
        </>
      )}

      {confere.data && (
        <Cartao titulo="Caixas fechados para conferir">
          {fechados.data.length === 0 ? <p className="text-sm text-suave">Nenhum caixa fechado esperando conferência.</p> : (
            <ul className="divide-y divide-borda">
              {fechados.data.map((c) => {
                const diferenca = centavosDoBanco(c.diferenca_centavos ?? 0);
                return (
                  <li key={c.id} className="space-y-2 py-3 text-sm">
                    <p className="numeros">Esperado {brl(centavosDoBanco(c.esperado_centavos ?? 0))} · contado {brl(centavosDoBanco(c.contado_centavos ?? 0))} · {diferenca === 0 ? <Selo tom="sucesso" ponto>sem diferença</Selo> : <Selo tom="perigo" ponto>diferença {brl(diferenca)}</Selo>}</p>
                    {c.observacao_fechamento && <p className="text-xs text-suave">Explicação: {c.observacao_fechamento}</p>}
                    {c.operador_id !== usuario.id ? (
                      <form action={conferirCaixa} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="caixa" value={c.id} />
                        <label className="min-w-0 flex-1 text-xs font-medium">Observação<input name="observacao" className={campo} /></label>
                        <Botao type="submit" tamanho="sm">Conferir</Botao>
                      </form>
                    ) : <p className="text-xs text-suave">Seu caixa: outra pessoa confere.</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      )}
    </main>
  );
}

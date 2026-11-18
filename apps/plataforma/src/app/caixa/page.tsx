import { randomUUID } from "node:crypto";

import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Fragment } from "react";

import { MEIOS } from "@ora5g/dominio";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../componentes/ui";
import { permite } from "../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { ERROS_DA_SAIDA, lerNomes, lerSaidas, OK_DA_SAIDA } from "../../lib/caixa/saidas";
import { centavosDoBanco } from "../../lib/dinheiro";
import { brl } from "../../lib/formato";
import { chaveDoCatalogo, type ValorDeParametro } from "../../lib/parametros";
import { ERROS_DA_VENDA } from "../../lib/vendas/regras";
import { abrirCaixa } from "../vender/acoes";
import { conferirCaixa, fecharCaixa, movimentarCaixa } from "./acoes";
import { campo, MinhasSaidas, SaidasParaAutorizar } from "./QuadrosDaSaida";

export const metadata: Metadata = { title: "Caixa" };
export const dynamic = "force-dynamic";

const OK = { suprimento: "Suprimento lançado.", sangria: "Sangria lançada.", fechado: "Caixa fechado.", conferido: "Caixa conferido." } as const;
const nomeDoMeio = (m: string) => (Object.hasOwn(MEIOS, m) ? MEIOS[m as keyof typeof MEIOS].nome : m);

type Parametros = { erro?: ValorDeParametro; ok?: ValorDeParametro; saida?: ValorDeParametro; erro_saida?: ValorDeParametro };

// Caixa do operador na loja do turno (ADR-004): resumo por meio, suprimento, sangria, saída autorizada
// (L7c) e fechamento. Quem confere caixa (caixa.conferir: gerente e dono) autoriza as saídas e vê os
// caixas fechados da loja para conferir. Num banco ainda sem a migration do L7c, os quadros das saídas
// dizem que a função não está disponível e o resto do caixa segue igual.
export default async function Caixa({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DA_VENDA, parametros.erro);
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const okSaida = chaveDoCatalogo(OK_DA_SAIDA, parametros.saida);
  const erroSaida = chaveDoCatalogo(ERROS_DA_SAIDA, parametros.erro_saida);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  // VEL-b: a permissão vem no molde da sessão; o que depende só dela vai na mesma rodada do caixa aberto, e os nomes
  // de quem pediu a saída vão junto com os movimentos. Três rodadas com o molde, em vez de quatro.
  const confere = permite(sessao, "caixa.conferir");
  const [aberto, fechados, paraAutorizar] = await Promise.all([
    supabase.from("caixas").select("id, aberto_em, fundo_centavos").eq("operador_id", usuario.id).eq("unidade_id", unidade).eq("situacao", "aberto").maybeSingle(),
    confere ? supabase.from("caixas").select("id, operador_id, fechado_em, esperado_centavos, contado_centavos, diferenca_centavos, observacao_fechamento").eq("unidade_id", unidade).eq("situacao", "fechado").order("fechado_em", { ascending: false }).limit(20) : { data: [], error: null },
    confere ? lerSaidas(supabase, { pendentesDaLoja: unidade }) : null,
  ]);
  if (aberto.error) throw new FalhaDoServico("caixa");
  if (fechados.error) throw new FalhaDoServico("caixa_detalhes");
  const [movimentos, minhas, nomes] = await Promise.all([
    aberto.data ? supabase.from("caixa_movimentos").select("tipo, meio, valor_centavos").eq("caixa_id", aberto.data.id) : { data: [], error: null },
    aberto.data ? lerSaidas(supabase, { caixa: aberto.data.id }) : null,
    paraAutorizar?.estado === "ok" ? lerNomes(supabase, paraAutorizar.dados.map((s) => s.pedidaPor)) : new Map<string, string>(),
  ]);
  if (movimentos.error) throw new FalhaDoServico("caixa_detalhes");
  const porMeio = new Map<string, number>();
  for (const m of movimentos.data) porMeio.set(m.meio, (porMeio.get(m.meio) ?? 0) + centavosDoBanco(m.valor_centavos));
  const meusPendentes = minhas?.estado === "ok" ? minhas.dados.filter((s) => s.situacao === "pendente").length : 0;
  // Alguém espera no balcão: o quadro de autorizar sobe para o topo.
  const urgente = paraAutorizar?.estado === "ok" && paraAutorizar.dados.some((s) => s.pedidaPor !== usuario.id);
  const quadroDeAutorizar = paraAutorizar && <SaidasParaAutorizar leitura={paraAutorizar} nomes={nomes} usuario={usuario.id} />;

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Caixa" />
      {erro && <Aviso tom="perigo">{ERROS_DA_VENDA[erro]}</Aviso>}
      {ok && <Aviso tom="sucesso">{OK[ok]}</Aviso>}
      {erroSaida && <Aviso tom="perigo">{ERROS_DA_SAIDA[erroSaida]}</Aviso>}
      {okSaida && <Aviso tom="sucesso">{OK_DA_SAIDA[okSaida]}</Aviso>}
      {urgente && quadroDeAutorizar}

      {!aberto.data ? (
        <Cartao titulo="Abrir caixa" icone={Wallet}>
          <form action={abrirCaixa} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="chave" value={randomUUID()} /><input type="hidden" name="voltar" value="/caixa" />
            <label className="text-sm font-medium">Fundo de troco (R$)<input name="fundo" inputMode="decimal" required defaultValue="0,00" className={campo} /></label>
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
            <p className="mt-2 text-xs text-suave">&ldquo;Dinheiro&rdquo; é o que deve estar na gaveta (fundo + recebido − troco + suprimento − sangria − estornos − saídas autorizadas).</p>
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
          {minhas && <MinhasSaidas leitura={minhas} />}
          <Cartao titulo="Fechar caixa" subtitulo="Conte o dinheiro da gaveta; diferença precisa de explicação.">
            {meusPendentes > 0 && (
              <Aviso tom="aviso" className="mb-3">
                {meusPendentes === 1
                  ? "Há 1 pedido de saída aguardando autorização: depois de fechar o caixa, ele não pode mais ser autorizado."
                  : `Há ${meusPendentes} pedidos de saída aguardando autorização: depois de fechar o caixa, eles não podem mais ser autorizados.`}
              </Aviso>
            )}
            <form action={fecharCaixa} className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs font-medium">Dinheiro contado (R$)<input name="contado" inputMode="decimal" required className={campo} /></label>
              <label className="text-xs font-medium sm:col-span-2">Observação<input name="observacao" className={campo} /></label>
              <Botao type="submit" variante="secundario" className="sm:col-span-3">Fechar caixa</Botao>
            </form>
          </Cartao>
        </>
      )}

      {!urgente && quadroDeAutorizar}

      {confere && (
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
    </MoldeReal>
  );
}

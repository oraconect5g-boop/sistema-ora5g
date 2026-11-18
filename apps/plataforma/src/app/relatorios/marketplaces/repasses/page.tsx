import { ArrowLeft, Banknote, Link2, Scale } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { MoldeReal } from "../../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, EstadoVazio, Indicador, Selo, TituloPagina } from "../../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../../lib/acesso/sessao";
import { ValorForaDoLimite } from "../../../../lib/dinheiro";
import { RespostaInesperada } from "../../../../lib/financeiro/painel";
import { brl, brlComSinal, numero } from "../../../../lib/formato";
import { CANAIS_DOS_MARKETPLACES } from "../../../../lib/marketplaces/leitura";
import { periodoDosMarketplaces } from "../../../../lib/marketplaces/regras";
import {
  diferencaDoRepasse, ERROS_DOS_REPASSES, lerPainelDosRepasses, mudouDepoisDeCasar, OK_DOS_REPASSES, type PainelDosRepasses, type Repasse,
} from "../../../../lib/marketplaces/repasses";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../../lib/parametros";
import { casarRepasse, desfazerRepasse } from "./acoes";

export const metadata: Metadata = { title: "Repasses dos marketplaces" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;

/** Os campos escondidos que voltam a página para o mesmo período e dizem qual é o repasse. */
function Ocultos({ r, inicio, fim }: { r: Repasse; inicio: string; fim: string }) {
  return (
    <>
      <input type="hidden" name="canal" value={r.canal} /><input type="hidden" name="data_repasse" value={r.dataRepasse} />
      <input type="hidden" name="inicio" value={inicio} /><input type="hidden" name="fim" value={fim} />
    </>
  );
}

// Os repasses dos marketplaces casados com o extrato do banco (lote REPASSE-a: ORA-MKTPL-005 e ORA-MKTPL-008; ADR-018,
// adendo de 18/11). O repasse é o conjunto dos pedidos do mesmo canal com a mesma data de repasse; o esperado é a soma do
// líquido deles. Casar é dizer qual linha de crédito do extrato do banco é o repasse; a diferença pede o motivo. Só o dono.
export default async function RepassesDosMarketplaces({ searchParams }: {
  searchParams: Promise<Record<"inicio" | "fim" | "ok" | "erro", ValorDeParametro>>;
}) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { permissoes } = sessao.molde;
  if (!permissoes.has("resultado.ver") || !permissoes.has("pagamento.conciliar")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">{ERROS_DOS_REPASSES.permissao}</Aviso></MoldeReal>;
  }
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { inicio, fim } = periodoDosMarketplaces(textoDoParametro(parametros.inicio), textoDoParametro(parametros.fim), hoje);
  const lido = await sessao.supabase.rpc("marketplace_repasses_painel", { p_inicio: inicio, p_fim: fim });
  if (lido.error) throw new FalhaDoServico("marketplace_repasses_painel");
  let painel: PainelDosRepasses;
  try {
    painel = lerPainelDosRepasses(lido.data);
  } catch (e) {
    if (e instanceof RespostaInesperada || e instanceof ValorForaDoLimite) throw new FalhaDoServico("marketplace_repasses_painel");
    throw e;
  }
  const erro = chaveDoCatalogo(ERROS_DOS_REPASSES, parametros.erro);
  const ok = chaveDoCatalogo(OK_DOS_REPASSES, parametros.ok);
  const casados = painel.repasses.filter((r) => r.casado);
  const soltos = painel.repasses.filter((r) => !r.casado);
  const esperado = painel.repasses.reduce((s, r) => s + r.esperado, 0);
  const recebido = casados.reduce((s, r) => s + (r.casado?.recebido ?? 0), 0);
  const diferenca = casados.reduce((s, r) => s + (diferencaDoRepasse(r) ?? 0), 0);

  return (
    <MoldeReal sessao={sessao} largura="max-w-6xl">
      <Link href="/relatorios/marketplaces" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Marketplaces</Link>
      <TituloPagina titulo="Repasses dos marketplaces" subtitulo={`De ${dataCurta(inicio)} a ${dataCurta(fim)}, pela data do repasse: o que cada canal devia pagar e a linha do extrato do banco em que o dinheiro caiu.`} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK_DOS_REPASSES[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DOS_REPASSES[erro]}</Aviso>}

      <Form action="/relatorios/marketplaces/repasses" prefetch={false} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium">De<input key={inicio} name="inicio" type="date" defaultValue={inicio} className={campo} /></label>
        <label className="text-xs font-medium">Até<input key={fim} name="fim" type="date" defaultValue={fim} className={campo} /></label>
        <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Carregando…">Ver</Botao>
      </Form>

      <section aria-label="Resumo dos repasses" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Esperado" icone={Banknote} valor={brl(esperado)} detalhe={plural(painel.repasses.length, "repasse", "repasses")} />
        <Indicador rotulo="Recebido no banco" icone={Banknote} valor={brl(recebido)} detalhe={`${plural(casados.length, "repasse casado", "repasses casados")}`} />
        <Indicador rotulo="Diferença dos casados" icone={Scale} valor={brlComSinal(diferenca)} tom={diferenca !== 0 ? "atencao" : "neutro"} detalhe="o recebido menos o esperado" />
        <Indicador rotulo="Sem linha no extrato" icone={Link2} valor={numero(soltos.length)} tom={soltos.length > 0 ? "atencao" : "neutro"}
          detalhe={painel.semDataDeRepasse > 0 ? `e ${plural(painel.semDataDeRepasse, "pedido", "pedidos")} do período sem data de repasse` : "todos os pedidos com data de repasse"} />
      </section>

      <Cartao className="mt-4" titulo="Repasses" subtitulo="Os mais recentes primeiro. O esperado é a soma do líquido dos pedidos do repasse." icone={Banknote}>
        {painel.repasses.length === 0 ? (
          <EstadoVazio titulo="Nenhum repasse no período" icone={Banknote}>Os repasses vêm da data de repasse dos pedidos importados dos canais. Importe o relatório de vendas de cada canal em Marketplaces.</EstadoVazio>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {painel.repasses.map((r) => {
              const dif = diferencaDoRepasse(r);
              return (
                <li key={`${r.canal}-${r.dataRepasse}`} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-semibold">{`${CANAIS_DOS_MARKETPLACES[r.canal]} · repasse de ${dataCurta(r.dataRepasse)}`}</span>
                      <span className="block text-xs text-suave">{`${plural(r.pedidos, "pedido", "pedidos")} · esperado ${brl(r.esperado)}${r.estimados > 0 ? ` (${plural(r.estimados, "líquido estimado", "líquidos estimados")})` : ""}`}</span>
                    </span>
                    {r.casado ? (
                      <Selo tom={dif === 0 ? "sucesso" : "aviso"}>{dif === 0 ? "casado" : `casado, diferença ${brlComSinal(dif ?? 0)}`}</Selo>
                    ) : <Selo tom="aviso">sem linha no extrato</Selo>}
                  </div>
                  {r.casado ? (
                    <div className="mt-2 text-xs text-suave">
                      <p>{`Linha do extrato nº ${r.casado.extrato}, de ${dataCurta(r.casado.data)}: ${brl(r.casado.recebido)} recebidos.`}{r.casado.motivo ? ` Motivo da diferença: ${r.casado.motivo}.` : ""}</p>
                      {mudouDepoisDeCasar(r) && <p className="mt-1 font-semibold text-aviso">{`Os pedidos mudaram depois de casar: ao casar, eram ${plural(r.casado.pedidosAoCasar, "pedido", "pedidos")} e ${brl(r.casado.esperadoAoCasar)}. Confira e, se for o caso, desfaça e case de novo.`}</p>}
                      <details className="mt-2">
                        <summary className="cursor-pointer font-semibold text-acao">Desfazer</summary>
                        <form action={desfazerRepasse} className="mt-2 flex flex-wrap items-end gap-2">
                          <Ocultos r={r} inicio={inicio} fim={fim} />
                          <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                          <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Desfazendo…">Desfazer</Botao>
                        </form>
                      </details>
                    </div>
                  ) : r.sugestoes.length === 0 ? (
                    <p className="mt-2 text-xs text-suave">Nenhuma linha de crédito livre no extrato do banco da rede, do dia do repasse até 5 dias depois. Importe o extrato do banco desses dias.</p>
                  ) : (
                    <form action={casarRepasse} className="mt-2 flex flex-wrap items-end gap-2">
                      <Ocultos r={r} inicio={inicio} fim={fim} />
                      <label className="min-w-0 flex-1 text-xs font-medium">A linha do extrato em que o dinheiro caiu
                        <select name="linha" required className={campo} defaultValue={r.sugestoes[0]?.valor === r.esperado ? r.sugestoes[0]?.linha : ""}>
                          <option value="" disabled>Escolha a linha</option>
                          {r.sugestoes.map((s) => (
                            <option key={s.linha} value={s.linha}>{`Nº ${s.extrato} · ${dataCurta(s.data)} · ${brl(s.valor)}${s.valor === r.esperado ? " (o mesmo valor)" : ` (diferença ${brlComSinal(s.valor - r.esperado)})`}${s.descricao ? ` · ${s.descricao}` : ""}`}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium">Motivo, se o valor for outro<input name="motivo" maxLength={200} className={campo} /></label>
                      <Botao type="submit" tamanho="sm" enquanto="Casando…">Casar</Botao>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </MoldeReal>
  );
}

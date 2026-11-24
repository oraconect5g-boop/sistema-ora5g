import { ArrowLeft, Banknote, Link2, Scale } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, EstadoVazio, Indicador, Selo, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ValorForaDoLimite } from "../../../lib/dinheiro";
import {
  diferencaDoDeposito, ERROS_DOS_DEPOSITOS, lerPainelDosDepositos, MAQUININHAS, mudouDepoisDeCasar, OK_DOS_DEPOSITOS, type Deposito, type PainelDosDepositos,
} from "../../../lib/extratos/depositos";
import { RespostaInesperada } from "../../../lib/financeiro/painel";
import { brl, brlComSinal, numero } from "../../../lib/formato";
import { periodoDosMarketplaces } from "../../../lib/marketplaces/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { casarDeposito, desfazerDeposito } from "./acoes";

export const metadata: Metadata = { title: "Depósitos das maquininhas" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;

/** Os campos escondidos que voltam a página para o mesmo período e dizem qual é o depósito. */
function Ocultos({ d, inicio, fim }: { d: Deposito; inicio: string; fim: string }) {
  return (
    <>
      <input type="hidden" name="maquininha" value={d.maquininha} /><input type="hidden" name="data_liquidacao" value={d.dataLiquidacao} />
      <input type="hidden" name="inicio" value={inicio} /><input type="hidden" name="fim" value={fim} />
    </>
  );
}

// O depósito agrupado da maquininha conferido com o extrato do banco (lote FIN-006a: ORA-FIN-006; ADR-016, adendo de
// 24/11). O depósito é o conjunto dos pagamentos da mesma maquininha com o dinheiro para o mesmo dia (gravado na
// conciliação pelo extrato da maquininha); o esperado é a soma do líquido deles. Casar é dizer qual linha de crédito do
// extrato do banco da rede é o depósito; a diferença pede o motivo. Só quem concilia pela rede inteira (o dono).
export default async function DepositosDasMaquininhas({ searchParams }: {
  searchParams: Promise<Record<"inicio" | "fim" | "ok" | "erro", ValorDeParametro>>;
}) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  if (!sessao.molde.permissoes.has("pagamento.conciliar")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">{ERROS_DOS_DEPOSITOS.permissao}</Aviso></MoldeReal>;
  }
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { inicio, fim } = periodoDosMarketplaces(textoDoParametro(parametros.inicio), textoDoParametro(parametros.fim), hoje);
  const lido = await sessao.supabase.rpc("maquininha_depositos_painel", { p_inicio: inicio, p_fim: fim });
  // A gerência da loja concilia na loja, mas o extrato do banco e os depósitos são da rede inteira: o banco recusa.
  if (lido.error?.code === "42501") {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">{ERROS_DOS_DEPOSITOS.permissao}</Aviso></MoldeReal>;
  }
  if (lido.error) throw new FalhaDoServico("maquininha_depositos_painel");
  let painel: PainelDosDepositos;
  try {
    painel = lerPainelDosDepositos(lido.data);
  } catch (e) {
    if (e instanceof RespostaInesperada || e instanceof ValorForaDoLimite) throw new FalhaDoServico("maquininha_depositos_painel");
    throw e;
  }
  const erro = chaveDoCatalogo(ERROS_DOS_DEPOSITOS, parametros.erro);
  const ok = chaveDoCatalogo(OK_DOS_DEPOSITOS, parametros.ok);
  const casados = painel.depositos.filter((d) => d.casado);
  const soltos = painel.depositos.filter((d) => !d.casado);
  const esperado = painel.depositos.reduce((s, d) => s + d.esperado, 0);
  const recebido = casados.reduce((s, d) => s + (d.casado?.recebido ?? 0), 0);
  const diferenca = casados.reduce((s, d) => s + (diferencaDoDeposito(d) ?? 0), 0);

  return (
    <MoldeReal sessao={sessao} largura="max-w-6xl">
      <Link href="/pagamentos/extratos" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Extratos</Link>
      <TituloPagina titulo="Depósitos das maquininhas"
        subtitulo={`De ${dataCurta(inicio)} a ${dataCurta(fim)}, pelo dia do dinheiro: o que cada maquininha devia depositar (o líquido das vendas já conferidas no extrato dela) e a linha do extrato do banco em que o dinheiro caiu.`} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK_DOS_DEPOSITOS[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DOS_DEPOSITOS[erro]}</Aviso>}

      <Form action="/pagamentos/depositos" prefetch={false} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium">De<input key={inicio} name="inicio" type="date" defaultValue={inicio} className={campo} /></label>
        <label className="text-xs font-medium">Até<input key={fim} name="fim" type="date" defaultValue={fim} className={campo} /></label>
        <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Carregando…">Ver</Botao>
      </Form>

      <section aria-label="Resumo dos depósitos" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Esperado" icone={Banknote} valor={brl(esperado)} detalhe={plural(painel.depositos.length, "depósito", "depósitos")} />
        <Indicador rotulo="Recebido no banco" icone={Banknote} valor={brl(recebido)} detalhe={plural(casados.length, "depósito casado", "depósitos casados")} />
        <Indicador rotulo="Diferença dos casados" icone={Scale} valor={brlComSinal(diferenca)} tom={diferenca !== 0 ? "atencao" : "neutro"} detalhe="o recebido menos o esperado" />
        <Indicador rotulo="Sem linha no extrato" icone={Link2} valor={numero(soltos.length)} tom={soltos.length > 0 ? "atencao" : "neutro"}
          detalhe={painel.semConciliacao.pagamentos > 0
            ? `e ${plural(painel.semConciliacao.pagamentos, "pagamento", "pagamentos")} das maquininhas (${brl(painel.semConciliacao.valor)}) ainda sem conciliação`
            : "todos os pagamentos das maquininhas conciliados"} />
      </section>

      <Cartao className="mt-4" titulo="Depósitos" subtitulo="Os mais recentes primeiro. O esperado é a soma do líquido dos pagamentos conciliados com o dinheiro para o dia." icone={Banknote}>
        {painel.depositos.length === 0 ? (
          <EstadoVazio titulo="Nenhum depósito no período" icone={Banknote}>
            Os depósitos vêm da conciliação das vendas de cartão e Pix pelo extrato da maquininha (o dia em que o dinheiro cai). Concilie em Conciliação, Extratos por arquivo.
          </EstadoVazio>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {painel.depositos.map((d) => {
              const dif = diferencaDoDeposito(d);
              return (
                <li key={`${d.maquininha}-${d.dataLiquidacao}`} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-semibold">{`${MAQUININHAS[d.maquininha].nome} · dinheiro de ${dataCurta(d.dataLiquidacao)}`}</span>
                      <span className="block text-xs text-suave">{`${plural(d.pagamentos, "pagamento", "pagamentos")} · vendido ${brl(d.bruto)} · esperado ${brl(d.esperado)} (${MAQUININHAS[d.maquininha].meios})`}</span>
                    </span>
                    {d.casado ? (
                      <Selo tom={dif === 0 ? "sucesso" : "aviso"}>{dif === 0 ? "casado" : `casado, diferença ${brlComSinal(dif ?? 0)}`}</Selo>
                    ) : <Selo tom="aviso">sem linha no extrato</Selo>}
                  </div>
                  {d.casado ? (
                    <div className="mt-2 text-xs text-suave">
                      <p>{`Linha do extrato nº ${d.casado.extrato}, de ${dataCurta(d.casado.data)}: ${brl(d.casado.recebido)} recebidos.`}{d.casado.motivo ? ` Motivo da diferença: ${d.casado.motivo}.` : ""}</p>
                      {mudouDepoisDeCasar(d) && <p className="mt-1 font-semibold text-aviso">{`Os pagamentos mudaram depois de casar: ao casar, eram ${plural(d.casado.pagamentosAoCasar, "pagamento", "pagamentos")} e ${brl(d.casado.esperadoAoCasar)}. Confira e, se for o caso, desfaça e case de novo.`}</p>}
                      <details className="mt-2">
                        <summary className="cursor-pointer font-semibold text-acao">Desfazer</summary>
                        <form action={desfazerDeposito} className="mt-2 flex flex-wrap items-end gap-2">
                          <Ocultos d={d} inicio={inicio} fim={fim} />
                          <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                          <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Desfazendo…">Desfazer</Botao>
                        </form>
                      </details>
                    </div>
                  ) : d.sugestoes.length === 0 ? (
                    <p className="mt-2 text-xs text-suave">Nenhuma linha de crédito livre no extrato do banco da rede, do dia do dinheiro até 3 dias depois. Importe o extrato do banco desses dias (em Extratos, &quot;Da rede&quot;).</p>
                  ) : (
                    <form action={casarDeposito} className="mt-2 flex flex-wrap items-end gap-2">
                      <Ocultos d={d} inicio={inicio} fim={fim} />
                      <label className="min-w-0 flex-1 text-xs font-medium">A linha do extrato em que o dinheiro caiu
                        <select name="linha" required className={campo} defaultValue={d.sugestoes[0]?.valor === d.esperado ? d.sugestoes[0]?.linha : ""}>
                          <option value="" disabled>Escolha a linha</option>
                          {d.sugestoes.map((s) => (
                            <option key={s.linha} value={s.linha}>{`Nº ${s.extrato} · ${dataCurta(s.data)} · ${brl(s.valor)}${s.valor === d.esperado ? " (o mesmo valor)" : ` (diferença ${brlComSinal(s.valor - d.esperado)})`}${s.descricao ? ` · ${s.descricao}` : ""}`}</option>
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

import { randomUUID } from "node:crypto";

import { HandCoins, Landmark } from "lucide-react";
import Link from "next/link";

import { EstadoDoPainel, NOTA } from "../../../componentes/paineis-de-vendas";
import { Botao, Cartao, EstadoVazio, Selo } from "../../../componentes/ui";
import { brl, numero } from "../../../lib/formato";
import type { Leitura } from "../../../lib/leitura-do-banco";
import { cobrancaARetomar, situacaoDoRepasse, type RepassesAtrasados } from "../../../lib/pagamentos/atrasados";
import { FINANCEIRAS, idadeDaConta, type FinanceirasAReceber } from "../../../lib/pagamentos/financeiras";
import { corrigirRecebimento, desfazerRecebimento, desfazerRepasseParcial, receberDaFinanceira } from "../acoes";
import { CobrancasDaConta, PainelDosAtrasados } from "./RepassesAtrasados";

// Valores a receber das financeiras (lote L7b). Só apresentação: a lista chega lida por
// lib/pagamentos/financeiras, com o estado da leitura (falha nunca vira zero). Os formulários chamam
// as ações, que chamam as funções do banco como a pessoa logada.

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(iso));
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function ConteudoFinanceiras({ leitura, hoje, atrasados = null, daRede = null }: {
  leitura: Leitura<FinanceirasAReceber>; hoje: string;
  /** FIN-007a: o que está atrasado e as cobranças (nulo: o banco ainda não tem a função; a tela segue como antes). */
  atrasados?: Leitura<RepassesAtrasados> | null;
  /** FIN-007a: o mesmo resumo da rede inteira, só para quem define o prazo. */
  daRede?: Leitura<RepassesAtrasados> | null;
}) {
  // O vencimento e as cobranças de cada conta em aberto, pela conta.
  const emAberto = new Map((atrasados?.estado === "ok" ? atrasados.dados.contas : []).map((c) => [c.id, c]));
  // O "hoje" do vencimento é o do banco (o dia de São Paulo em que a lista foi lida), o mesmo que decidiu o atraso.
  const hojeDoBanco = atrasados?.estado === "ok" ? atrasados.dados.hoje : hoje;
  return (
    <>
      {atrasados && <PainelDosAtrasados leitura={atrasados} daRede={daRede} />}
      {leitura.estado !== "ok" ? (
        <Cartao className="mt-4" titulo="Por financeira" icone={HandCoins}>
          <EstadoDoPainel estado={leitura.estado} fonte="financeiras" tentarDeNovo="/pagamentos/financeiras" />
        </Cartao>
      ) : leitura.dados.contas.length === 0 ? (
        <Cartao className="mt-4" titulo="Por financeira" icone={HandCoins}>
          <EstadoVazio titulo="Nada a receber das financeiras" icone={HandCoins}>
            A leitura está funcionando; nenhuma venda financiada em aberto nesta loja e nenhum repasse registrado nos últimos 60 dias.
          </EstadoVazio>
        </Cartao>
      ) : (
        <>
          <Cartao className="mt-4" titulo="Por financeira" subtitulo="Em aberto agora; contratos liquidados e taxa observada nas liquidações dos últimos 60 dias" icone={HandCoins}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {leitura.dados.porDevedor.map((d) => (
                <li key={d.devedor} className="rounded-xl border border-borda px-4 py-3 text-sm">
                  <p className="font-semibold">{FINANCEIRAS[d.devedor]}</p>
                  <p className="numeros mt-1 text-xl font-bold tracking-tight">{brl(d.valorAberto)}</p>
                  <p className={NOTA}>
                    {d.abertas === 0 ? "nada em aberto" : `${numero(d.abertas)} ${d.abertas === 1 ? "venda em aberto" : "vendas em aberto"} · a mais antiga ${idadeDaConta(d.maisAntigaDias ?? 0).rotulo}`}
                  </p>
                  {d.recebidas > 0 && (
                    <p className={`mt-1 ${NOTA}`}>{`Recebido em 60 dias: ${brl(d.valorRecebido)} (${numero(d.recebidas)} ${d.recebidas === 1 ? "venda" : "vendas"}) · taxa observada ${brl(d.taxaObservada)}`}</p>
                  )}
                </li>
              ))}
            </ul>
          </Cartao>

          <Cartao className="mt-4" titulo="Contas" subtitulo="Abertas, liquidadas nos últimos 60 dias e canceladas com repasse parcial" icone={Landmark}>
            <ul className="divide-y divide-borda text-sm">
              {leitura.dados.contas.map((c) => {
                const idade = idadeDaConta(c.dias);
                const repasse = c.situacao === "aberta" ? emAberto.get(c.id) : undefined;
                const prazo = repasse ? situacaoDoRepasse(repasse, hojeDoBanco) : null;
                // FIN-007b: o dia combinado na última cobrança para voltar ao assunto, quando já chegou.
                const retomar = repasse ? cobrancaARetomar(repasse, hojeDoBanco) : null;
                return (
                  <li key={c.id} className="space-y-2 py-3">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/vendas/${c.vendaId}`} className="font-semibold text-acao">Venda nº {c.vendaNumero}</Link>
                      <span className="numeros text-xs text-suave">{`${quando(c.concluidaEm)} · ${FINANCEIRAS[c.devedor]} · bruto ${brl(c.valor)}`}</span>
                      {c.situacao === "aberta" ? <Selo tom={idade.tom}>{idade.rotulo}</Selo> : c.situacao === "recebida" ? <Selo tom="sucesso" ponto>recebida</Selo> : <Selo tom="aviso">conta cancelada</Selo>}
                      {prazo && <Selo tom={prazo.tom}>{prazo.rotulo}</Selo>}
                      {/* Curto, para caber inteiro no celular: o dia combinado, sem o ano (a data inteira está no histórico da conta). */}
                      {retomar && <Selo tom="aviso">{retomar === hojeDoBanco ? "retomar a cobrança hoje" : `retomar a cobrança (desde ${retomar.slice(8, 10)}/${retomar.slice(5, 7)})`}</Selo>}
                      {c.vendaCancelada && <Selo tom="aviso">venda cancelada</Selo>}
                    </p>
                    {!!c.repassesParciais?.length && (
                      <div className="space-y-2">
                        <p className="numeros text-xs text-suave">Recebido em parciais: {brl(c.parcial ?? 0)}{c.situacao === "aberta" && <> · saldo em aberto: {brl(c.saldo ?? c.valor)}</>}</p>
                        {c.situacao === "cancelada" && <p className="text-xs text-aviso">A venda foi cancelada depois de um repasse. O dinheiro registrado não volta sozinho; combine o acerto com a financeira.</p>}
                        <ul className="space-y-2">
                          {c.repassesParciais.map((r) => (
                            <li key={r.id} className="rounded-lg border border-borda px-3 py-2 text-xs">
                              <p className="numeros text-suave">{dataCurta(r.data)} · {brl(r.valor)} · {r.referencia}</p>
                              {c.situacao !== "recebida" && <details className="mt-2">
                                <summary className="cursor-pointer font-semibold text-acao">Desfazer repasse parcial lançado por engano</summary>
                                <form action={desfazerRepasseParcial} className="mt-2 flex flex-wrap items-end gap-2">
                                  <input type="hidden" name="conta" value={c.id} />
                                  <input type="hidden" name="repasse" value={r.id} />
                                  <label className="font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                                  <Botao type="submit" tamanho="sm" variante="fantasma">Desfazer parcial</Botao>
                                </form>
                              </details>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {c.situacao === "recebida" ? (
                      <div className="space-y-2">
                        <p className="numeros text-xs text-suave">{`Caiu em ${c.recebidoEm ? dataCurta(c.recebidoEm) : "—"} · ${c.finalRegistrado ? "repasse final" : "recebido"} ${brl((c.valorRecebido ?? 0) - (c.parcial ?? 0))} · taxa ${brl(c.valor - (c.valorRecebido ?? 0))} · ${c.referencia ?? ""}`}</p>
                        {c.vendaCancelada && (
                          <p className="rounded-lg bg-aviso/10 px-3 py-2 text-xs text-aviso">
                            A venda foi cancelada depois do repasse: combine com a {FINANCEIRAS[c.devedor]} a devolução ou o desconto desse valor (o protocolo do cancelamento do contrato fica no estorno a confirmar da venda). Desfaça só se o repasse não caiu de verdade: a conta fica cancelada e não volta a ser cobrada.
                          </p>
                        )}
                        <div className="flex flex-wrap items-end justify-between gap-2">
                          <details className="min-w-0 flex-1">
                            <summary className="cursor-pointer text-xs font-semibold text-acao">{c.finalRegistrado ? "Corrigir referência ou data" : "Corrigir o repasse (referência, valor ou data)"}</summary>
                            <form action={corrigirRecebimento} className="mt-2 grid gap-2 sm:grid-cols-5">
                              <input type="hidden" name="conta" value={c.id} />
                              <label className="text-xs font-medium">Referência<input name="referencia" required minLength={3} maxLength={80} defaultValue={c.referencia ?? ""} className={campo} /></label>
                              <label className="text-xs font-medium">{c.finalRegistrado ? "Total recebido (R$)" : "Valor que caiu (R$)"}<input name="recebido" required readOnly={c.finalRegistrado} inputMode="decimal" defaultValue={((c.valorRecebido ?? 0) / 100).toFixed(2).replace(".", ",")} className={campo} /></label>
                              <label className="text-xs font-medium">Caiu em<input name="data" type="date" required max={hoje} defaultValue={c.recebidoEm ?? ""} className={campo} /></label>
                              <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                              <Botao type="submit" tamanho="sm" variante="secundario" className="self-end">Corrigir</Botao>
                            </form>
                          </details>
                          <form action={desfazerRecebimento} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="conta" value={c.id} />
                            {c.finalId && <input type="hidden" name="repasse" value={c.finalId} />}
                            {c.vendaCancelada && <input type="hidden" name="cancelada" value="sim" />}
                            <label className="text-xs font-medium">{c.vendaCancelada ? "Motivo (o repasse não caiu)" : "Motivo para desfazer"}<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                            <Botao type="submit" tamanho="sm" variante="fantasma">Desfazer</Botao>
                          </form>
                        </div>
                      </div>
                    ) : c.situacao === "aberta" && c.saldo !== undefined ? (
                      <form action={receberDaFinanceira} className="grid gap-2 sm:grid-cols-4">
                        <input type="hidden" name="chave" value={randomUUID()} />
                        <label className="text-xs font-medium">O que consta no extrato?
                          <select name="tipo" required defaultValue="" className={campo}>
                            <option value="" disabled>Selecione</option>
                            <option value="parcial">Repasse parcial</option>
                            <option value="final">Liquidação final</option>
                          </select>
                        </label>
                        <input type="hidden" name="conta" value={c.id} />
                        <label className="text-xs font-medium">Referência do repasse<input name="referencia" required minLength={3} maxLength={80} placeholder="Código ou lote" className={campo} /></label>
                        <label className="text-xs font-medium">Valor que caiu (R$)<input name="recebido" required inputMode="decimal" placeholder={(c.saldo / 100).toFixed(2).replace(".", ",")} className={campo} /></label>
                        <label className="text-xs font-medium">Caiu em<input name="data" type="date" required max={hoje} className={campo} /></label>
                        <label className="text-xs font-medium">Tarifa comprovada (só na liquidação)<input name="tarifa" inputMode="decimal" placeholder="0,00 se não houve tarifa" className={campo} /></label>
                        <p className="text-xs text-suave sm:col-span-3">Saldo: {brl(c.saldo)}. No parcial, deixe a tarifa em branco. Na liquidação, preencha a tarifa do extrato: repasse + tarifa devem fechar o saldo.</p>
                        <Botao type="submit" tamanho="sm" className="self-end">Registrar repasse</Botao>
                      </form>
                    ) : c.situacao === "aberta" ? <p className="text-xs text-aviso">Registro pausado até a atualização da versão do financeiro.</p> : null}
                    {repasse && <CobrancasDaConta conta={repasse} hoje={hojeDoBanco} chave={randomUUID()} />}
                  </li>
                );
              })}
            </ul>
          </Cartao>
    </>
  )}
    </>
  );
}

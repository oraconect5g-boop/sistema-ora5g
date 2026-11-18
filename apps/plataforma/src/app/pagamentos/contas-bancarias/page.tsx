import { ArrowLeft, Landmark, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, EstadoVazio, Indicador, Selo, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ValorForaDoLimite } from "../../../lib/dinheiro";
import { hojeEmSaoPaulo } from "../../../lib/contas-a-pagar/regras";
import {
  ERROS_DAS_CONTAS, lerContasBancarias, OK_DAS_CONTAS, textoDaConta, type ContaBancaria,
} from "../../../lib/contas-bancarias/regras";
import { RespostaInesperada } from "../../../lib/financeiro/painel";
import { brl, numero } from "../../../lib/formato";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { atualizarConta, criarConta, extratoDaConta } from "./acoes";

export const metadata: Metadata = { title: "Contas bancárias" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const rotulo = "block text-sm font-medium";
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** "1.234,56" para o campo (o saldo com sinal). */
const reaisNoCampo = (centavos: number) => `${centavos < 0 ? "-" : ""}${brl(Math.abs(centavos)).replace(/^R\$\s?/, "")}`;
type ExtratoDoBanco = { id: string; numero: number; fonte: string; periodo_inicio: string; periodo_fim: string; conta_id: string | null };

// As contas bancárias de cada empresa (lote CONTAS-a: ORA-FIN-006, a parte multiempresa). O saldo é o do extrato: o saldo
// inicial (no fim do dia informado) mais as linhas dos extratos do banco ligados à conta depois desse dia. Quem concilia
// pela rede inteira (o dono) cadastra a conta e liga os extratos; o banco confere de novo e grava a auditoria.
export default async function ContasBancarias({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; ok?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  if (!sessao.molde.permissoes.has("pagamento.conciliar")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">As contas bancárias são de quem concilia os pagamentos.</Aviso></MoldeReal>;
  }
  const erro = chaveDoCatalogo(ERROS_DAS_CONTAS, parametros.erro);
  const ok = chaveDoCatalogo(OK_DAS_CONTAS, parametros.ok);
  const { supabase } = sessao;
  const [saldos, empresas, extratos] = await Promise.all([
    supabase.rpc("contas_bancarias_saldos"),
    supabase.from("empresas").select("id, razao_social, nome_fantasia").eq("status", "ativa").order("razao_social"),
    supabase.from("extratos").select("id, numero, fonte, periodo_inicio, periodo_fim, conta_id").eq("tipo", "banco").order("periodo_inicio", { ascending: false }).limit(200),
  ]);
  if (saldos.error || empresas.error || extratos.error) throw new FalhaDoServico("contas_bancarias");
  let contas: ContaBancaria[];
  try {
    contas = lerContasBancarias(saldos.data);
  } catch (e) {
    if (e instanceof RespostaInesperada || e instanceof ValorForaDoLimite) throw new FalhaDoServico("contas_bancarias_saldos");
    throw e;
  }
  const doBanco = extratos.data as ExtratoDoBanco[];
  const semConta = doBanco.filter((e) => e.conta_id === null);
  const hoje = hojeEmSaoPaulo();
  const ativas = contas.filter((c) => c.ativa);
  const total = ativas.reduce((s, c) => s + c.saldo, 0);
  const nomeDaEmpresa = (e: { razao_social: string; nome_fantasia: string | null }) => e.nome_fantasia ?? e.razao_social;

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <Link href="/pagamentos/extratos" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Extratos</Link>
      <TituloPagina titulo="Contas bancárias" subtitulo="O saldo de cada conta pelo extrato do banco: o saldo inicial mais as linhas dos extratos ligados a ela. Venda não é dinheiro na conta." />
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DAS_CONTAS[erro]}</Aviso>}
      {ok && <Aviso tom="sucesso" className="mt-4">{OK_DAS_CONTAS[ok]}</Aviso>}
      {semConta.length > 0 && contas.some((c) => c.ativa) && (
        <Aviso tom="aviso" className="mt-4">{`${numero(semConta.length)} ${semConta.length === 1 ? "extrato do banco ainda não está" : "extratos do banco ainda não estão"} em nenhuma conta: ligue cada um à conta dele, abaixo, para o saldo andar.`}</Aviso>
      )}

      {contas.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Indicador rotulo="Saldo das contas ativas" icone={Wallet} valor={brl(total)} tom={total < 0 ? "ruim" : "neutro"} detalhe="cada uma até o dia do último extrato dela" />
          <Indicador rotulo="Contas ativas" icone={Landmark} valor={numero(ativas.length)} detalhe={`de ${numero(contas.length)} cadastradas`} />
          <Indicador rotulo="Extratos sem conta" icone={Landmark} valor={numero(semConta.length)} tom={semConta.length > 0 ? "atencao" : "neutro"} detalhe="do banco, ainda fora do saldo" />
        </div>
      )}

      {contas.length === 0 ? (
        <Cartao className="mt-4" titulo="Nenhuma conta cadastrada" icone={Landmark}>
          <EstadoVazio titulo="Cadastre a primeira conta" icone={Landmark}>
            Informe o saldo da conta num dia (o que o banco mostra no fim daquele dia). Depois, ligue a ela os extratos do banco que você importou.
          </EstadoVazio>
        </Cartao>
      ) : contas.map((c) => {
        const daConta = doBanco.filter((e) => e.conta_id === c.id);
        return (
          <Cartao key={c.id} id={`conta-${c.id}`} className="mt-4" icone={Landmark}
            titulo={<span className="flex flex-wrap items-center gap-2">{c.apelido}{!c.ativa && <Selo tom="neutro">inativa</Selo>}</span>}
            subtitulo={`${c.empresa} · ${textoDaConta(c)}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Indicador rotulo="Saldo pelo extrato" icone={Wallet} valor={brl(c.saldo)} tom={c.saldo < 0 ? "ruim" : "neutro"} detalhe={`até ${dataCurta(c.saldoEm)}`} />
              <Indicador rotulo="Entrou" icone={Wallet} valor={brl(c.entradas)} detalhe={`depois de ${dataCurta(c.saldoInicialEm)}`} />
              <Indicador rotulo="Saiu" icone={Wallet} valor={brl(c.saidas)} detalhe={`saldo inicial ${brl(c.saldoInicial)} em ${dataCurta(c.saldoInicialEm)}`} />
            </div>
            <h3 className="mt-4 text-sm font-semibold">{c.extratos === 0 ? "Nenhum extrato ligado ainda" : `Extratos ligados (${numero(c.extratos)})`}</h3>
            {daConta.length > 0 && (
              <ul className="mt-1 divide-y divide-borda text-sm">
                {daConta.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/pagamentos/extratos/${e.id}`} className="font-semibold text-acao">{`Extrato nº ${e.numero} · ${e.fonte} · de ${dataCurta(e.periodo_inicio)} a ${dataCurta(e.periodo_fim)}`}</Link>
                    <details className="w-full sm:w-auto">
                      <summary className="cursor-pointer text-xs font-semibold text-suave">Tirar da conta</summary>
                      <form action={extratoDaConta} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="extrato" value={e.id} /><input type="hidden" name="conta_bancaria" value={c.id} /><input type="hidden" name="tirar" value="sim" />
                        <label className={rotulo}>Motivo<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                        <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Tirando…">Tirar</Botao>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            {c.ativa && semConta.length > 0 && (
              <form action={extratoDaConta} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="conta_bancaria" value={c.id} />
                <label className={`${rotulo} min-w-0 flex-1`}>Ligar um extrato do banco
                  <select name="extrato" required className={campo} defaultValue="">
                    <option value="" disabled>Escolha o extrato</option>
                    {semConta.map((e) => <option key={e.id} value={e.id}>{`Nº ${e.numero} · ${e.fonte} · de ${dataCurta(e.periodo_inicio)} a ${dataCurta(e.periodo_fim)}`}</option>)}
                  </select>
                </label>
                <Botao type="submit" tamanho="sm" enquanto="Ligando…">Ligar</Botao>
              </form>
            )}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-acao">Mudar os dados da conta</summary>
              <form action={atualizarConta} className="mt-2 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="conta_bancaria" value={c.id} />
                <label className={rotulo}>Apelido<input name="apelido" required defaultValue={c.apelido} maxLength={60} className={campo} /></label>
                <label className={rotulo}>Banco<input name="banco" required defaultValue={c.banco} maxLength={60} className={campo} /></label>
                <label className={rotulo}>Agência (opcional)<input name="agencia" defaultValue={c.agencia ?? ""} inputMode="numeric" className={campo} /></label>
                <label className={rotulo}>Conta (opcional)<input name="conta" defaultValue={c.conta ?? ""} inputMode="numeric" className={campo} /></label>
                <label className={rotulo}>Saldo inicial (R$)<input name="saldo_inicial" required defaultValue={reaisNoCampo(c.saldoInicial)} inputMode="decimal" className={campo} /></label>
                <label className={rotulo}>No fim do dia<input name="saldo_em" type="date" required max={hoje} defaultValue={c.saldoInicialEm} className={campo} /></label>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="ativa" value="sim" defaultChecked={c.ativa} className="size-4" />A conta continua ativa</label>
                <label className={rotulo}>Motivo da mudança<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                <Botao type="submit" className="sm:col-span-2 sm:justify-self-start" enquanto="Salvando…">Salvar a mudança</Botao>
              </form>
            </details>
          </Cartao>
        );
      })}

      <Cartao className="mt-4" titulo="Nova conta" subtitulo="O saldo inicial é o que o banco mostra no fim do dia escolhido. As linhas dos extratos depois desse dia somam." icone={Plus}>
        {empresas.data.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma empresa ativa na rede.</p>
        ) : (
          <form action={criarConta} className="grid gap-3 sm:grid-cols-2">
            <label className={rotulo}>Empresa
              <select name="empresa" required className={campo} defaultValue={empresas.data.length === 1 ? empresas.data[0]?.id : ""}>
                {empresas.data.length > 1 && <option value="" disabled>Escolha a empresa</option>}
                {empresas.data.map((e) => <option key={e.id} value={e.id}>{nomeDaEmpresa(e)}</option>)}
              </select>
            </label>
            <label className={rotulo}>Apelido<input name="apelido" required maxLength={60} placeholder="Itaú principal" className={campo} /></label>
            <label className={rotulo}>Banco<input name="banco" required maxLength={60} placeholder="Itaú" className={campo} /></label>
            <label className={rotulo}>Agência (opcional)<input name="agencia" inputMode="numeric" placeholder="1234-5" className={campo} /></label>
            <label className={rotulo}>Conta (opcional)<input name="conta" inputMode="numeric" placeholder="12345-6" className={campo} /></label>
            <label className={rotulo}>Saldo inicial (R$)<input name="saldo_inicial" required inputMode="decimal" placeholder="1.234,56" className={campo} /></label>
            <label className={rotulo}>No fim do dia<input name="saldo_em" type="date" required max={hoje} defaultValue={hoje} className={campo} /></label>
            <Botao type="submit" className="sm:col-span-2 sm:justify-self-start" enquanto="Cadastrando…">Cadastrar a conta</Botao>
          </form>
        )}
      </Cartao>
    </MoldeReal>
  );
}

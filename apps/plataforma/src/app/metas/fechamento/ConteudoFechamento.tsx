import { BadgeCheck, ClipboardCheck, Gift, MessageSquareWarning, ReceiptText, Store } from "lucide-react";
import Link from "next/link";

import { BotaoConfirmar } from "../../../componentes/BotaoConfirmar";
import { Aviso, Avatar, Cartao, Celula, EstadoVazio, Indicador, Selo, Tabela, type Tom } from "../../../componentes/ui";
import { dataEHora, totaisNoCampo, type Contestacao, type Fechamento, type FechamentoDaLoja, type LinhaDoFechamento } from "../../../lib/bonus/fechamento";
import type { BonusDoMes, BonusDoVendedor } from "../../../lib/bonus/regras";
import { brl, numero } from "../../../lib/formato";
import { MEDIDAS, nomeDoMes, ORDEM_DAS_MEDIDAS, type Medida } from "../../../lib/metas/painel";
import { RegrasDoMes, semQuebra, textoCurtoDaMedida } from "../ConteudoBonus";
import { aprovarFechamento, enviarFechamento } from "./acoes";

// As partes da tela do fechamento do bônus (lote L9b; decisão do proprietário de 13/11/2026, D-014). Só
// apresentação: a página lê e confere; o banco decide de novo ao enviar e ao aprovar. Sem JavaScript no
// navegador: contestar e pagar outro valor abrem os campos com o próprio controle (peer do Tailwind).

const campo = "mt-1 w-full rounded-botao border border-borda bg-white px-3 py-2 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const chip = "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-borda bg-white px-3.5 text-sm font-semibold text-texto hover:border-borda-forte";
const quando = dataEHora;

export type Pessoas = ReadonlyMap<string, string>;
const nomeDe = (pessoas: Pessoas, id: string) => pessoas.get(id) ?? "Pessoa sem nome";
const medidasDa = (apuracao: BonusDoMes): Medida[] => ORDEM_DAS_MEDIDAS.filter((m) => apuracao.regras[m] !== undefined);
/** Quem mais recebe primeiro; no empate, pelo nome. */
const emOrdem = <T extends { vendedorId: string }>(linhas: readonly T[], total: (l: T) => number, pessoas: Pessoas) =>
  [...linhas].sort((a, b) => total(b) - total(a) || nomeDe(pessoas, a.vendedorId).localeCompare(nomeDe(pessoas, b.vendedorId), "pt-BR"));

/** A situação do fechamento de uma loja, em palavras e tom. */
export function situacaoDaLoja(f: Pick<FechamentoDaLoja, "situacao"> | null, souDono: boolean): { rotulo: string; tom: Tom } {
  if (f === null) return { rotulo: "Não enviado", tom: "neutro" };
  if (f.situacao === "enviado") return { rotulo: souDono ? "Aguardando a sua aprovação" : "Aguardando o dono", tom: "aviso" };
  return { rotulo: "Aprovado", tom: "sucesso" };
}

/** O dono: a situação de cada loja no mês, com o caminho para cada uma. */
export function LojasDoMes({ lojas, fechamentos, atual, mes, enderecoDaLoja }: {
  lojas: readonly { id: string; nome: string }[];
  fechamentos: readonly FechamentoDaLoja[];
  atual: string;
  mes: string;
  enderecoDaLoja: (loja: string) => string;
}) {
  const porLoja = new Map(fechamentos.map((f) => [f.unidadeId, f]));
  const pendentes = fechamentos.filter((f) => f.situacao === "enviado").length;
  return (
    <Cartao className="mb-4" titulo={`As lojas em ${nomeDoMes(mes)}`} icone={Store}
      subtitulo={pendentes === 0 ? "Nenhum fechamento aguardando a sua aprovação neste mês." : `${numero(pendentes)} ${pendentes === 1 ? "fechamento aguarda" : "fechamentos aguardam"} a sua aprovação.`}>
      <ul className="divide-y divide-borda">
        {lojas.map((l) => {
          const f = porLoja.get(l.id) ?? null;
          const s = situacaoDaLoja(f, true);
          return (
            <li key={l.id}>
              <Link href={enderecoDaLoja(l.id)} aria-current={l.id === atual ? "true" : undefined}
                className={`flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 hover:bg-slate-50 ${l.id === atual ? "bg-slate-50" : ""}`}>
                <span className="min-w-0 flex-1 truncate font-semibold">{l.nome}</span>
                <Selo tom={s.tom} ponto>{s.rotulo}</Selo>
                {f && <span className="numeros w-28 text-right text-sm font-semibold">{brl(f.totalAprovado ?? f.totalCalculado)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </Cartao>
  );
}

/** Uma linha do fechamento: quem é, o valor e, em cada medida, a faixa e o atingido. */
function CabecaDaLinha({ pessoas, vendedor, valor, detalhe }: { pessoas: Pessoas; vendedor: BonusDoVendedor | undefined; valor: number; detalhe?: string }) {
  const nome = nomeDe(pessoas, vendedor?.vendedorId ?? "");
  return (
    <div className="flex items-center gap-2.5">
      <Avatar nome={nome} tamanho="size-8 text-xs" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{nome}</span>
        {detalhe && <span className="block text-xs text-suave">{detalhe}</span>}
      </span>
      <span className="numeros shrink-0 text-lg font-bold">{brl(valor)}</span>
    </div>
  );
}
function MedidasDaLinha({ apuracao, vendedor }: { apuracao: BonusDoMes; vendedor: BonusDoVendedor | undefined }) {
  return (
    <ul className="mt-1.5 space-y-0.5 pl-[2.625rem] text-sm">
      {medidasDa(apuracao).map((m) => <li key={m}><span className="text-suave">{`${MEDIDAS[m].curto}:`}</span> {textoCurtoDaMedida(m, vendedor?.medidas[m], true)}</li>)}
    </ul>
  );
}
function LinkDoExtrato({ href }: { href: string }) {
  return (
    <Link href={href} className="ml-[2.625rem] mt-1 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-acao">
      <ReceiptText aria-hidden className="size-4" /> Ver o extrato
    </Link>
  );
}
function TextoDaContestacao({ c }: { c: Contestacao }) {
  return (
    <div className="ml-[2.625rem] mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <p className="flex items-start gap-1.5 font-semibold"><MessageSquareWarning aria-hidden className="mt-0.5 size-4 shrink-0" /> Contestada pela gerência</p>
      <p className="mt-0.5">{c.motivo}</p>
      {c.decisao !== null && (
        <p className="mt-1 text-amber-900">
          {c.decisao === "mantido" ? "O dono manteve o valor calculado" : "O dono pagou outro valor"}
          {c.resposta ? `: ${c.resposta}` : "."}
        </p>
      )}
    </div>
  );
}
function Resumo({ apuracao, total, rotuloDoTotal, detalheDoTotal }: { apuracao: BonusDoMes; total: number; rotuloDoTotal: string; detalheDoTotal: string }) {
  const comBonus = apuracao.vendedores.filter((v) => v.total > 0).length;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="grid gap-3 sm:grid-cols-2">
        <Indicador rotulo={rotuloDoTotal} valor={semQuebra(brl(total))} detalhe={detalheDoTotal} icone={Gift} />
        <Indicador rotulo="Com bônus" valor={`${numero(comBonus)} de ${numero(apuracao.vendedores.length)}`} detalhe={apuracao.vendedores.length === 1 ? "vendedor" : "vendedores"} />
      </div>
      <div className="rounded-2xl border border-borda bg-white px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-suave">Faixas que valiam no mês</p>
        <RegrasDoMes bonus={apuracao} mes={apuracao.mes} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// 1. Ainda não enviado: a conferência da gerência
// ---------------------------------------------------------------------------------------------
export function ConferenciaDaGerencia({ bonus, pessoas, loja, podeConferir, enderecoDoExtrato }: {
  bonus: BonusDoMes;
  pessoas: Pessoas;
  loja: { id: string; nome: string };
  podeConferir: boolean;
  enderecoDoExtrato: (vendedor: string) => string;
}) {
  const mes = bonus.mes;
  const cartao = {
    titulo: `Conferência de ${nomeDoMes(mes)}`, icone: ClipboardCheck,
    subtitulo: "O mês terminou: confira o bônus de cada vendedor e conteste, com motivo, o que não estiver certo. O dono decide e aprova o pagamento.",
  };
  if (medidasDa(bonus).length === 0) {
    return <Cartao {...cartao}><EstadoVazio titulo={`Nenhuma regra de bônus valia em ${nomeDoMes(mes)}`} icone={Gift}>Sem regra no mês, não há bônus a fechar.</EstadoVazio></Cartao>;
  }
  if (bonus.vendedores.length === 0) {
    return <Cartao {...cartao}><EstadoVazio titulo={`Ninguém teve meta ou venda em ${nomeDoMes(mes)}`} icone={Gift}>O bônus é de quem tem meta individual no mês: não há o que fechar nesta loja.</EstadoVazio></Cartao>;
  }
  const total = bonus.vendedores.reduce((s, v) => s + v.total, 0);
  const linhas = emOrdem(bonus.vendedores, (v) => v.total, pessoas);
  const lista = (
    <ul className="mt-4 divide-y divide-borda">
      {linhas.map((v) => (
        <li key={v.vendedorId} className="py-3">
          <CabecaDaLinha pessoas={pessoas} vendedor={v} valor={v.total} />
          <MedidasDaLinha apuracao={bonus} vendedor={v} />
          <LinkDoExtrato href={enderecoDoExtrato(v.vendedorId)} />
          {podeConferir && (
            <div className="ml-[2.625rem] mt-1">
              <input id={`contestar-${v.vendedorId}`} type="checkbox" name="contestar" value={v.vendedorId} className="peer sr-only" />
              <label htmlFor={`contestar-${v.vendedorId}`}
                className={`${chip} text-suave peer-checked:border-amber-400 peer-checked:bg-amber-50 peer-checked:text-amber-900 peer-focus-visible:ring-2 peer-focus-visible:ring-acao/40`}>
                <MessageSquareWarning aria-hidden className="size-4" /> Contestar esta linha
              </label>
              <label className="mt-2 hidden text-sm font-medium peer-checked:block">
                Motivo da contestação <span className="font-normal text-suave">(o dono vê; o vendedor não)</span>
                <textarea name={`motivo_${v.vendedorId}`} maxLength={300} rows={2} className={campo} placeholder="Ex.: a venda nº 1.234 foi concluída no dia 31 e não entrou" />
              </label>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <Cartao {...cartao} corpo="px-4 pb-4 pt-3 sm:px-5">
      <Resumo apuracao={bonus} total={total} rotuloDoTotal="Bônus calculado" detalheDoTotal="pela conta das faixas" />
      {podeConferir ? (
        <form action={enviarFechamento}>
          <input type="hidden" name="mes" value={mes} />
          <input type="hidden" name="loja" value={loja.id} />
          <input type="hidden" name="totais" value={totaisNoCampo(bonus.vendedores)} />
          {lista}
          <div className="mt-2 flex flex-col gap-3 border-t border-borda pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm text-suave">
              Ao enviar, você confirma as linhas que não contestou. O banco apura o mês de novo e grava; depois disso, só o dono muda um valor, sempre com motivo.
            </p>
            <BotaoConfirmar tamanho="md" enquanto="Enviando…" className="w-full shrink-0 sm:w-auto">Enviar para o dono aprovar</BotaoConfirmar>
          </div>
        </form>
      ) : (
        <>
          {lista}
          <Aviso tom="info" className="mt-2">Aguardando a conferência da gerência da {loja.nome}.</Aviso>
        </>
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// 2. Enviado: o dono decide e aprova (a gerência acompanha)
// ---------------------------------------------------------------------------------------------
export function FechamentoEnviado({ fechamento, linhas, pessoas, loja, quemEnviou, podeAprovar, enderecoDoExtrato }: {
  fechamento: Fechamento;
  linhas: readonly LinhaDoFechamento[];
  pessoas: Pessoas;
  loja: { id: string; nome: string };
  quemEnviou: string;
  podeAprovar: boolean;
  enderecoDoExtrato: (vendedor: string) => string;
}) {
  const a = fechamento.apuracao;
  const porVendedor = new Map(a.vendedores.map((v) => [v.vendedorId, v]));
  const contestadas = linhas.filter((l) => l.contestacao !== null);
  const ordenadas = [...contestadas, ...emOrdem(linhas.filter((l) => l.contestacao === null), (l) => l.totalCalculado, pessoas)];
  const cartao = {
    titulo: podeAprovar ? `Aprovar o bônus de ${nomeDoMes(a.mes)}` : `Bônus de ${nomeDoMes(a.mes)} com o dono`, icone: ClipboardCheck,
    subtitulo: `Enviado em ${quando(fechamento.enviadoEm)} por ${quemEnviou}. ${contestadas.length === 0 ? "Sem contestação." : `${numero(contestadas.length)} ${contestadas.length === 1 ? "linha contestada" : "linhas contestadas"}.`}`,
  };
  const corpoDaLinha = (l: LinhaDoFechamento) => {
    const v = porVendedor.get(l.vendedorId);
    return (
      <>
        <CabecaDaLinha pessoas={pessoas} vendedor={v} valor={l.totalCalculado} detalhe="calculado" />
        <MedidasDaLinha apuracao={a} vendedor={v} />
        <LinkDoExtrato href={enderecoDoExtrato(l.vendedorId)} />
        {l.contestacao && <TextoDaContestacao c={l.contestacao} />}
      </>
    );
  };
  if (!podeAprovar) {
    return (
      <Cartao {...cartao} corpo="px-4 pb-4 pt-3 sm:px-5">
        <Resumo apuracao={a} total={fechamento.totalCalculado} rotuloDoTotal="Bônus calculado" detalheDoTotal="enviado ao dono" />
        <ul className="mt-4 divide-y divide-borda">{ordenadas.map((l) => <li key={l.vendedorId} className="py-3">{corpoDaLinha(l)}</li>)}</ul>
        <Aviso tom="info" className="mt-2">Aguardando a aprovação do dono. Até lá, o valor de cada vendedor continua provisório.</Aviso>
      </Cartao>
    );
  }
  return (
    <Cartao {...cartao} corpo="px-4 pb-4 pt-3 sm:px-5">
      <Resumo apuracao={a} total={fechamento.totalCalculado} rotuloDoTotal="Bônus calculado" detalheDoTotal="antes dos ajustes" />
      <form action={aprovarFechamento}>
        <input type="hidden" name="fechamento" value={fechamento.id} />
        <input type="hidden" name="mes" value={a.mes} />
        <input type="hidden" name="loja" value={loja.id} />
        {linhas.map((l) => <input key={l.vendedorId} type="hidden" name="linhas" value={l.vendedorId} />)}
        {contestadas.map((l) => <input key={l.vendedorId} type="hidden" name="contestadas" value={l.vendedorId} />)}
        <ul className="mt-4 divide-y divide-borda">
          {ordenadas.map((l) => {
            const id = l.vendedorId;
            const nome = nomeDe(pessoas, id);
            return (
              <li key={id} className="py-3">
                {corpoDaLinha(l)}
                {l.contestacao ? (
                  <fieldset className="ml-[2.625rem] mt-2">
                    <legend className="text-sm font-semibold">{`Sua decisão sobre ${nome}`}</legend>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <input id={`manter-${id}`} type="radio" name={`decisao_${id}`} value="manter" required className="peer/manter sr-only" />
                      <label htmlFor={`manter-${id}`} className={`${chip} peer-checked/manter:border-acao peer-checked/manter:bg-acao/10 peer-checked/manter:text-acao peer-focus-visible/manter:ring-2 peer-focus-visible/manter:ring-acao/40`}>
                        {semQuebra(`Manter o calculado (${brl(l.totalCalculado)})`)}
                      </label>
                      <input id={`ajustar-${id}`} type="radio" name={`decisao_${id}`} value="ajustar" className="peer/ajustar sr-only" />
                      <label htmlFor={`ajustar-${id}`} className={`${chip} peer-checked/ajustar:border-acao peer-checked/ajustar:bg-acao/10 peer-checked/ajustar:text-acao peer-focus-visible/ajustar:ring-2 peer-focus-visible/ajustar:ring-acao/40`}>
                        Pagar outro valor
                      </label>
                      <label className="hidden w-full text-sm font-medium peer-checked/ajustar:block sm:w-56">
                        Valor a pagar (R$)
                        <input name={`valor_${id}`} inputMode="decimal" autoComplete="off" placeholder="0,00" className={`${campo} numeros`} />
                      </label>
                    </div>
                    <label className="mt-2 block text-sm font-medium">
                      Motivo <span className="font-normal text-suave">(obrigatório para pagar outro valor, e o vendedor vê; ao manter, é a resposta à gerência)</span>
                      <textarea name={`motivo_${id}`} maxLength={300} rows={2} className={campo} />
                    </label>
                  </fieldset>
                ) : (
                  <div className="ml-[2.625rem] mt-1">
                    <input id={`ajustar-${id}`} type="checkbox" name={`decisao_${id}`} value="ajustar" className="peer sr-only" />
                    <label htmlFor={`ajustar-${id}`} className={`${chip} text-suave peer-checked:border-acao peer-checked:bg-acao/10 peer-checked:text-acao peer-focus-visible:ring-2 peer-focus-visible:ring-acao/40`}>
                      Pagar outro valor
                    </label>
                    <div className="mt-2 hidden gap-2 peer-checked:grid sm:grid-cols-[14rem_minmax(0,1fr)]">
                      <label className="text-sm font-medium">
                        Valor a pagar (R$)
                        <input name={`valor_${id}`} inputMode="decimal" autoComplete="off" placeholder="0,00" className={`${campo} numeros`} />
                      </label>
                      <label className="text-sm font-medium">
                        Motivo <span className="font-normal text-suave">(o vendedor vê)</span>
                        <textarea name={`motivo_${id}`} maxLength={300} rows={2} className={campo} />
                      </label>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex flex-col gap-3 border-t border-borda pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm text-suave">
            Ao aprovar, o valor de cada vendedor fica gravado e não muda mais: o que não for ajustado é pago como calculado. Devolução ou cancelamento que chegar depois desconta no mês em que acontecer.
          </p>
          <BotaoConfirmar tamanho="md" enquanto="Aprovando…" className="w-full shrink-0 sm:w-auto">Aprovar o pagamento</BotaoConfirmar>
        </div>
      </form>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// 3. Aprovado: o que vai para o pagamento
// ---------------------------------------------------------------------------------------------
const observacao = (l: LinhaDoFechamento) => {
  const partes: string[] = [];
  if (l.ajusteMotivo) partes.push(`Pago outro valor: ${l.ajusteMotivo}`);
  if (l.contestacao) {
    partes.push(`Contestada pela gerência: ${l.contestacao.motivo}`);
    if (l.contestacao.decisao === "mantido") partes.push(`O dono manteve o calculado${l.contestacao.resposta ? `: ${l.contestacao.resposta}` : ""}`);
  }
  return partes;
};

export function FechamentoAprovado({ fechamento, linhas, pessoas, quemEnviou, enderecoDoExtrato }: {
  fechamento: Fechamento;
  linhas: readonly LinhaDoFechamento[];
  pessoas: Pessoas;
  quemEnviou: string;
  enderecoDoExtrato: (vendedor: string) => string;
}) {
  const a = fechamento.apuracao;
  const ajustes = linhas.filter((l) => l.ajusteMotivo !== null).length;
  const ordenadas = emOrdem(linhas, (l) => l.totalAprovado ?? 0, pessoas);
  return (
    <Cartao titulo={`Bônus de ${nomeDoMes(a.mes)} aprovado`} icone={BadgeCheck} corpo="px-4 pb-4 pt-3 sm:px-5"
      subtitulo={`Enviado em ${quando(fechamento.enviadoEm)} por ${quemEnviou}; aprovado pelo dono em ${quando(fechamento.aprovadoEm ?? fechamento.enviadoEm)}. O valor de cada vendedor está gravado e não muda mais.`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="A pagar" valor={semQuebra(brl(fechamento.totalAprovado ?? 0))} detalhe="aprovado pelo dono" icone={Gift} tom="bom" />
        <Indicador rotulo="Calculado" valor={semQuebra(brl(fechamento.totalCalculado))} detalhe="pela conta das faixas" />
        <Indicador rotulo="Ajustes" valor={numero(ajustes)} detalhe={ajustes === 1 ? "linha paga com outro valor" : "linhas pagas com outro valor"} />
      </div>
      <ul className="mt-4 divide-y divide-borda sm:hidden">
        {ordenadas.map((l) => (
          <li key={l.vendedorId} className="py-3">
            <CabecaDaLinha pessoas={pessoas} vendedor={a.vendedores.find((v) => v.vendedorId === l.vendedorId)} valor={l.totalAprovado ?? 0}
              detalhe={l.totalAprovado === l.totalCalculado ? "como calculado" : semQuebra(`calculado: ${brl(l.totalCalculado)}`)} />
            {observacao(l).map((o) => <p key={o} className="ml-[2.625rem] mt-1 text-sm text-suave">{o}</p>)}
            <LinkDoExtrato href={enderecoDoExtrato(l.vendedorId)} />
          </li>
        ))}
      </ul>
      <div className="mt-4 hidden sm:block">
        <Tabela colunas={["Vendedor", "Calculado", "Aprovado", "Observação", ""]} legenda={`Bônus aprovado de cada vendedor em ${nomeDoMes(a.mes)}`} minimo="min-w-[44rem]" alinharDireita={[1, 2]}>
          {ordenadas.map((l) => (
            <tr key={l.vendedorId}>
              <Celula>
                <span className="flex items-center gap-2.5">
                  <Avatar nome={nomeDe(pessoas, l.vendedorId)} tamanho="size-8 text-xs" />
                  <span className="min-w-0 truncate font-semibold">{nomeDe(pessoas, l.vendedorId)}</span>
                </span>
              </Celula>
              <Celula className="numeros whitespace-nowrap text-right">{brl(l.totalCalculado)}</Celula>
              <Celula className="numeros whitespace-nowrap text-right font-bold">{brl(l.totalAprovado ?? 0)}</Celula>
              <Celula className="text-sm text-suave">{observacao(l).map((o) => <span key={o} className="block">{o}</span>)}</Celula>
              <Celula className="text-right">
                <Link href={enderecoDoExtrato(l.vendedorId)} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-acao hover:underline">
                  <ReceiptText aria-hidden className="size-4" /> Extrato
                </Link>
              </Celula>
            </tr>
          ))}
        </Tabela>
      </div>
    </Cartao>
  );
}

/** Como o fechamento funciona, em poucas linhas. */
export function ComoOFechamentoFunciona() {
  return (
    <Aviso titulo="Como o fechamento funciona" className="mt-4">
      Depois que o mês termina, a gerência confere o bônus de cada vendedor e pode contestar uma linha, com motivo. O dono decide cada contestação
      (manter o calculado ou pagar outro valor, com motivo que o vendedor vê) e aprova o pagamento. Aprovado, o valor fica gravado e não muda mais:
      devolução ou cancelamento que chegar depois desconta no mês em que acontecer.
    </Aviso>
  );
}

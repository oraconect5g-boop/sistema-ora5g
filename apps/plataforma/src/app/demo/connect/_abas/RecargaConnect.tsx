"use client";

import { CalendarClock, CircleCheck, Link2, RefreshCw, Wallet } from "lucide-react";
import { useState } from "react";

import { Dialogo } from "../../../../componentes/Dialogo";
import { Aviso, Botao, Cartao, ListaDados, Selo } from "../../../../componentes/ui";
import type { PlanoConnect } from "../../../../demo/dados/connect";
import { linhaValida, type MetodoPagamentoNogle } from "../../../../integracoes/nogle/regras";
import { brl } from "../../../../lib/formato";
import { classeCampo, formatarLinha, soDigitos } from "./util";

type Programada = { linha: string; cliente: string; plano: string; valor: number; renovacaoEmDias: number; cadastradaPor: string };
type Pedido = { id: number; numero: string; plano: PlanoConnect; pagamento: MetodoPagamentoNogle; sms: boolean; situacao: "aguardando_pagamento" | "confirmada"; debitoCarteira: number };

// Parte da Contel descontada do saldo da Ora numa recarga pelo saldo. ILUSTRATIVO: a taxa real
// vem da Contel (P9/D-009); não usar como valor aprovado.
const PARTE_CONTEL_ILUSTRATIVA = 0.8;

/** Recarga avulsa (POST /recarga/solicitar), recarga programada por saldo e bloqueio da próxima renovação. */
export function RecargaConnect({ planos, linhas, programadas, podeGerir, saldoCarteira, agora }: {
  planos: readonly PlanoConnect[];
  linhas: readonly string[];
  programadas: readonly Programada[];
  podeGerir: boolean;
  saldoCarteira: number;
  agora: number;
}) {
  const [numero, setNumero] = useState("");
  const [plano, setPlano] = useState(planos[1]?.id ?? planos[0]?.id ?? 0);
  const [pagamento, setPagamento] = useState<MetodoPagamentoNogle>("SALDO");
  const [sms, setSms] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [conferido, setConferido] = useState<string | null>(null);
  const [saldo, setSaldo] = useState(saldoCarteira);
  const [semSaldo, setSemSaldo] = useState(false);
  const [lista, setLista] = useState(programadas.map((p) => ({ ...p, bloqueada: false })));
  const [nova, setNova] = useState<{ numero: string; plano: number; quantidade: string; erro: string } | null>(null);
  const [alterando, setAlterando] = useState<{ linha: string; operacao: "bloqueio" | "desbloqueio"; motivo: string } | null>(null);

  const planoEscolhido = planos.find((p) => p.id === plano);
  const numeroOk = linhaValida(numero);
  const dataRenovacao = (dias: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(agora + dias * 86_400_000));

  // REV-025 (#24): o meio escolhido vale até o fim. SALDO: o cliente paga no caixa da loja e a
  // carteira da Ora na Contel é debitada; LINK: o cliente paga direto à Contel, sem caixa e sem carteira.
  function solicitar() {
    if (!planoEscolhido) return;
    setConferido(null);
    const debitoCarteira = pagamento === "SALDO" ? Math.round(planoEscolhido.valor * PARTE_CONTEL_ILUSTRATIVA) : 0;
    if (debitoCarteira > saldo) {
      setSemSaldo(true);
      return;
    }
    setConfirmando(false);
    setSemSaldo(false);
    if (debitoCarteira > 0) setSaldo((s) => s - debitoCarteira);
    setPedido({ id: 12_000 + Math.floor(Math.random() * 999), numero: soDigitos(numero), plano: planoEscolhido, pagamento, sms, situacao: pagamento === "SALDO" ? "confirmada" : "aguardando_pagamento", debitoCarteira });
  }

  function programar() {
    if (!nova) return;
    if (!linhaValida(nova.numero)) return setNova({ ...nova, erro: "Número com DDD e 11 dígitos." });
    const p = planos.find((x) => x.id === nova.plano);
    if (!p) return;
    setLista([{ linha: soDigitos(nova.numero), cliente: "Cliente da linha", plano: p.plano, valor: p.valor, renovacaoEmDias: 30, cadastradaPor: "você", bloqueada: false }, ...lista]);
    setNova(null);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="min-w-0 space-y-4 xl:col-span-2">
        <Cartao titulo="Recarga do plano" subtitulo="Renova o plano de uma linha da Ora Connect" icone={RefreshCw}>
          {pedido ? (
            <div className="space-y-3" aria-live="polite">
              {pedido.situacao === "confirmada" && pedido.pagamento === "SALDO" ? (
                <Aviso tom="sucesso" titulo={`Recarga ${pedido.id} feita pelo saldo (simulação)`}>{pedido.plano.plano} para {formatarLinha(pedido.numero)}. O cliente paga {brl(pedido.plano.valor)} no caixa da loja; o saldo da Ora na Contel caiu {brl(pedido.debitoCarteira)} (valor ilustrativo).</Aviso>
              ) : pedido.situacao === "confirmada" ? (
                <Aviso tom="sucesso" titulo={`Recarga ${pedido.id} paga pelo link (simulação)`}>{pedido.plano.plano} para {formatarLinha(pedido.numero)}. O cliente pagou {brl(pedido.plano.valor)} direto à Contel pelo link: não entra no caixa da loja e não usa o saldo da Ora.</Aviso>
              ) : (
                <Aviso tom="aviso" titulo={`Recarga ${pedido.id}: aguardando pagamento do link`}>
                  {pedido.sms ? "A Contel enviou o link por SMS para a linha." : "Envie o link ao cliente."} <span className="numeros">https://pagamento.exemplo.invalid/r/{pedido.id}</span>
                  <Botao tamanho="sm" variante="secundario" className="mt-2" onClick={() => setPedido({ ...pedido, situacao: "confirmada" })}>Cliente pagou (simulação)</Botao>
                </Aviso>
              )}
              <div className="flex flex-wrap gap-2">
                <Botao variante="secundario" tamanho="sm" onClick={() => setConferido(pedido.situacao === "confirmada" ? "A recarga aparece no histórico da linha (GET /linhas/historico)." : "Ainda não paga: está em Recargas pedidas (GET /linhas/cobrancasGeradas). Não peça outra.")}>
                  <CircleCheck aria-hidden className="size-4" /> Conferir na operadora
                </Botao>
                <Botao variante="fantasma" tamanho="sm" onClick={() => { setPedido(null); setNumero(""); setConferido(null); }}>Nova recarga</Botao>
              </div>
              {conferido && <p className="text-sm text-suave">{conferido}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium" htmlFor="numero-recarga">Número da linha</label>
              <input id="numero-recarga" value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" placeholder="(41) 9 0000-0000" className={`${classeCampo} numeros mt-1`} />
              <p className="mt-1 text-xs text-suave">Exemplos: {linhas.map((l) => <button key={l} type="button" onClick={() => setNumero(formatarLinha(l))} className="numeros mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-texto hover:bg-slate-200">{formatarLinha(l)}</button>)}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {planos.map((p) => (
                  <button key={p.id} type="button" aria-pressed={plano === p.id} onClick={() => setPlano(p.id)} className={`rounded-xl border p-3 text-left text-sm ${plano === p.id ? "border-acao bg-acao-clara/60" : "border-borda bg-white"}`}>
                    <span className="flex justify-between gap-2"><strong>{p.plano}</strong><span className="numeros font-semibold">{brl(p.valor)}</span></span>
                    <span className="block text-xs text-suave">{p.detalhamento}{p.campanha ? " · campanha" : ""}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {(["SALDO", "LINK"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2"><input type="radio" name="pagamento-recarga" checked={pagamento === m} onChange={() => setPagamento(m)} className="size-4 accent-acao" /> {m === "SALDO" ? "Saldo da Ora (cliente paga na loja)" : "Link de pagamento"}</label>
                ))}
                {pagamento === "LINK" && <label className="flex items-center gap-2"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} className="size-4 accent-acao" /> Mandar o link por SMS</label>}
              </div>
              {!numeroOk && numero.trim() !== "" && <p className="text-sm text-aviso">Número com DDD e 11 dígitos, como (41) 9 0000-0101.</p>}
              <Botao onClick={() => setConfirmando(true)} disabled={!numeroOk}>Solicitar recarga</Botao>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Recargas programadas" subtitulo="Renovam sozinhas pelo saldo da Ora (GET /saldo/programado)" icone={CalendarClock} acao={podeGerir ? <Botao tamanho="sm" variante="secundario" onClick={() => setNova({ numero: "", plano: planos[0]?.id ?? 0, quantidade: "", erro: "" })}>Programar</Botao> : undefined}>
          <ul className="divide-y divide-borda">
            {lista.map((p) => (
              <li key={p.linha} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="numeros block font-medium">{formatarLinha(p.linha)} · {p.plano} · {brl(p.valor)}</span>
                  <span className="block text-xs text-suave">{p.cliente} · próxima em {dataRenovacao(p.renovacaoEmDias)} · cadastrada por {p.cadastradaPor}</span>
                </span>
                <span className="flex items-center gap-2">
                  {p.bloqueada ? <Selo tom="aviso" ponto>Próxima bloqueada</Selo> : <Selo tom="sucesso" ponto>Ativa</Selo>}
                  {podeGerir && <Botao tamanho="sm" variante={p.bloqueada ? "secundario" : "perigo"} onClick={() => setAlterando({ linha: p.linha, operacao: p.bloqueada ? "desbloqueio" : "bloqueio", motivo: "" })}>{p.bloqueada ? "Desbloquear" : "Bloquear próxima"}</Botao>}
                </span>
              </li>
            ))}
          </ul>
          {!podeGerir && <p className="mt-2 text-xs text-suave">Programar e bloquear renovações é com o gerente ou o dono.</p>}
        </Cartao>
      </div>

      <div className="min-w-0 space-y-4">
        <Cartao titulo="Saldo da Ora na Contel" icone={Wallet}>
          <p className="numeros text-2xl font-bold tracking-tight">{brl(saldo)}</p>
          <p className="text-xs text-suave">Pagando pelo saldo, a margem da Ora já fica retida e só a parte da Contel é descontada.</p>
        </Cartao>
        <Aviso tom="info" titulo="Sem pedido duplicado">A Contel não documenta proteção contra pedido repetido. Se a resposta demorar, confira no histórico e nas recargas pedidas antes de pedir outra.</Aviso>
        <Aviso tom="neutro" titulo={<span className="inline-flex items-center gap-1.5"><Link2 aria-hidden className="size-4" /> Link, Pix e boleto</span>}>Os dados do pagamento de uma ativação, recarga ou compra vêm de POST /pagamento.</Aviso>
      </div>

      <Dialogo aberto={confirmando} aoFechar={() => { setConfirmando(false); setSemSaldo(false); }} titulo="Conferir a recarga" descricao="A recarga na operadora não se desfaz pelo sistema." rodape={<><Botao variante="secundario" onClick={() => { setConfirmando(false); setSemSaldo(false); }}>Voltar</Botao><Botao onClick={solicitar}>Solicitar recarga</Botao></>}>
        {planoEscolhido && <ListaDados itens={[["Linha", formatarLinha(soDigitos(numero))], ["Plano", `${planoEscolhido.plano} · ${brl(planoEscolhido.valor)}`], ["Pagamento", pagamento === "SALDO" ? "Saldo da Ora (cliente paga no caixa)" : `Link${sms ? " por SMS" : ""} (cliente paga direto à Contel)`]]} />}
        {semSaldo && <Aviso tom="perigo" className="mt-3">O saldo da Ora na Contel não cobre esta recarga. Use o link de pagamento ou peça ao dono para recarregar a carteira.</Aviso>}
      </Dialogo>

      <Dialogo aberto={nova !== null} aoFechar={() => setNova(null)} titulo="Programar recarga pelo saldo" descricao="A linha renova todo mês pelo saldo da Ora (POST /recarga/saldo/adicionar)." rodape={<><Botao variante="secundario" onClick={() => setNova(null)}>Cancelar</Botao><Botao onClick={programar}>Programar</Botao></>}>
        {nova && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">Número da linha<input value={nova.numero} onChange={(e) => setNova({ ...nova, numero: e.target.value, erro: "" })} inputMode="numeric" className={`${classeCampo} numeros mt-1`} /></label>
            <label className="block text-sm font-medium">Plano<select value={nova.plano} onChange={(e) => setNova({ ...nova, plano: Number(e.target.value) })} className={`${classeCampo} mt-1`}>{planos.map((p) => <option key={p.id} value={p.id}>{p.plano} · {brl(p.valor)}</option>)}</select></label>
            <label className="block text-sm font-medium">Quantas renovações (vazio = sem limite)<input value={nova.quantidade} onChange={(e) => setNova({ ...nova, quantidade: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={`${classeCampo} numeros mt-1`} /></label>
            {nova.erro && <p role="alert" className="text-sm text-perigo">{nova.erro}</p>}
          </div>
        )}
      </Dialogo>

      <Dialogo aberto={alterando !== null} aoFechar={() => setAlterando(null)} titulo={alterando?.operacao === "bloqueio" ? "Bloquear a próxima renovação" : "Desbloquear a renovação"} descricao="POST /recarga/alterarStatusRecargaAutomatica. O motivo aparece nos relatórios." rodape={<><Botao variante="secundario" onClick={() => setAlterando(null)}>Cancelar</Botao><Botao variante={alterando?.operacao === "bloqueio" ? "perigo" : "primario"} disabled={(alterando?.motivo.trim().length ?? 0) < 3} onClick={() => { if (alterando) setLista(lista.map((p) => (p.linha === alterando.linha ? { ...p, bloqueada: alterando.operacao === "bloqueio" } : p))); setAlterando(null); }}>Confirmar</Botao></>}>
        <label className="block text-sm font-medium">Motivo<input value={alterando?.motivo ?? ""} onChange={(e) => alterando && setAlterando({ ...alterando, motivo: e.target.value })} placeholder="Ex.: inadimplência, pedido do cliente" className={`${classeCampo} mt-1`} /></label>
      </Dialogo>
    </div>
  );
}

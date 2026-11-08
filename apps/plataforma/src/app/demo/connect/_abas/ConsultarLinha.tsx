"use client";

import { MessageSquare, Pencil, Phone, Search, ShieldCheck, Signal, Wifi } from "lucide-react";
import { useState } from "react";

import { Dialogo } from "../../../../componentes/Dialogo";
import { Colunas } from "../../../../componentes/graficos";
import { Aviso, Botao, Cartao, EstadoVazio, ListaDados, Selo } from "../../../../componentes/ui";
import type { LinhaConnect } from "../../../../demo/dados/connect";
import { MOTIVOS_CANCELAMENTO, minutosIlimitados } from "../../../../integracoes/nogle/regras";
import { brl, numero } from "../../../../lib/formato";
import { classeCampo, formatarLinha, mascararDocumento, soDigitos } from "./util";

const dataDe = (agora: number, dias: number) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(agora - dias * 86_400_000));

/** Consulta de linha (GET /linhas/detalhes, /saldo, /historico, /consumo, /cobrancasGeradas, /validaTitularidade, /numeroPeloIccid). */
export function ConsultarLinha({ linhas, agora }: { linhas: readonly LinhaConnect[]; agora: number }) {
  const [busca, setBusca] = useState("");
  const [linha, setLinha] = useState<LinhaConnect | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [apelidos, setApelidos] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [titularidade, setTitularidade] = useState<{ documento: string; resultado: "S" | "N" | null }>({ documento: "", resultado: null });

  function consultar(valor = busca) {
    const d = soDigitos(valor);
    const achada = d.length >= 19 ? linhas.find((l) => l.iccid === d) : linhas.find((l) => l.numero === d);
    setLinha(achada ?? null);
    setNaoEncontrada(!achada);
    setTitularidade({ documento: "", resultado: null });
  }

  const apelido = linha ? (apelidos[linha.numero] ?? linha.apelido) : "";
  const consumo = linha?.consumoMbPorDia ?? [];
  const totalMes = consumo.reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4">
      <Cartao titulo="Consultar linha" subtitulo="Pelo número com DDD ou pelo ICCID do chip" icone={Search}>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); consultar(); }}>
          <label className="sr-only" htmlFor="busca-linha">Número da linha ou ICCID</label>
          <input id="busca-linha" value={busca} onChange={(e) => setBusca(e.target.value)} inputMode="numeric" placeholder="(41) 9 0000-0000 ou ICCID" className={`${classeCampo} numeros`} />
          <Botao type="submit">Consultar</Botao>
        </form>
        <p className="mt-2 text-xs text-suave">
          Linhas fictícias:{" "}
          {linhas.map((l) => <button key={l.numero} type="button" onClick={() => { setBusca(formatarLinha(l.numero)); consultar(l.numero); }} className="numeros mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-texto hover:bg-slate-200">{formatarLinha(l.numero)}</button>)}
        </p>
      </Cartao>

      {naoEncontrada && <EstadoVazio titulo="Linha não encontrada" icone={Phone}>A Contel não tem essa linha ou esse ICCID (GET /linhas/verificaExistencia).</EstadoVazio>}

      {linha && (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <Cartao
              className="xl:col-span-2"
              icone={Phone}
              titulo={<span className="numeros">{formatarLinha(linha.numero)}</span>}
              subtitulo={`${apelido || "Sem apelido"} · ${linha.titular} · CPF ${mascararDocumento(linha.documento)}`}
              acao={<Selo tom={linha.status === "ATIVO" ? (linha.bloqueada ? "perigo" : "sucesso") : "neutro"} ponto>{linha.status === "ATIVO" ? (linha.bloqueada ? "Bloqueada" : "Ativa") : "Cancelada"}</Selo>}
            >
              <div className="flex flex-wrap gap-1.5">
                <Selo tom="info">{linha.tipoLinha}</Selo>
                <Selo tom="neutro">Plano {linha.plano}</Selo>
                {linha.esim && <Selo tom="marca">eSIM</Selo>}
                {linha.portin && <Selo tom="marca">Veio por portabilidade</Selo>}
                {linha.recargaAutomatica && <Selo tom="sucesso">Recarga automática: {linha.recargaAutomatica}</Selo>}
              </div>
              {linha.status === "CANCELADO" && linha.motivoCancelamento && (
                <Aviso tom="neutro" className="mt-3" titulo={`Cancelada: ${linha.motivoCancelamento}`}>{MOTIVOS_CANCELAMENTO[linha.motivoCancelamento as keyof typeof MOTIVOS_CANCELAMENTO] ?? "Motivo informado pela operadora."}</Aviso>
              )}
              <ListaDados className="mt-4" itens={[
                ["ICCID", <span key="i" className="numeros">•••• {linha.iccid.slice(-4)}</span>],
                ["Ativada em", dataDe(agora, linha.dataAtivacao)],
                ["Fim do plano", dataDe(agora, -linha.fimPlanoEmDias)],
                ["Perde o número se não recarregar até", dataDe(agora, -(linha.fimPlanoEmDias + 75))],
              ]} />
              <div className="mt-4 flex flex-wrap gap-2">
                <Botao variante="secundario" tamanho="sm" onClick={() => setEditando(apelido)}><Pencil aria-hidden className="size-4" /> Apelido da linha</Botao>
              </div>
            </Cartao>

            <Cartao titulo="Saldo do plano" subtitulo="Atualiza a cada 30 minutos, mais ou menos" icone={Signal}>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Wifi aria-hidden className="size-4 text-acao" /> Internet</span><strong className="numeros">{(linha.saldo.dadosMb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB</strong></li>
                <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Phone aria-hidden className="size-4 text-acao" /> Minutos</span><strong className="numeros">{minutosIlimitados(linha.saldo.minutos) ? "Ilimitados" : numero(linha.saldo.minutos)}</strong></li>
                <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><MessageSquare aria-hidden className="size-4 text-acao" /> SMS</span><strong className="numeros">{numero(linha.saldo.sms)}</strong></li>
              </ul>
            </Cartao>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Cartao className="xl:col-span-2" titulo="Consumo de internet · últimos 30 dias" subtitulo={`Total: ${(totalMes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB (GET /linhas/consumo/dados)`}>
              <Colunas dados={consumo.map((mb, i) => ({ rotulo: dataDe(agora, 29 - i).slice(0, 5), valor: mb, destaque: i === consumo.length - 1 }))} formatar={(v) => `${numero(v)} MB`} formatarEixo={(v) => `${numero(v)} MB`} nomeSerie="Internet" cadaRotulo={5} altura={170} />
            </Cartao>
            <Cartao titulo="Titularidade" subtitulo="Confere se o CPF informado é o do titular" icone={ShieldCheck}>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setTitularidade({ ...titularidade, resultado: soDigitos(titularidade.documento) === linha.documento ? "S" : "N" }); }}>
                <label className="sr-only" htmlFor="doc-titular">CPF do cliente</label>
                <input id="doc-titular" value={titularidade.documento} onChange={(e) => setTitularidade({ documento: e.target.value, resultado: null })} inputMode="numeric" placeholder="CPF" className={`${classeCampo} numeros`} />
                <Botao type="submit" variante="secundario">Conferir</Botao>
              </form>
              <p aria-live="polite" className="mt-2 text-sm">
                {titularidade.resultado === "S" && <Selo tom="sucesso" ponto>É o titular da linha</Selo>}
                {titularidade.resultado === "N" && <Selo tom="perigo" ponto>Não é o titular da linha</Selo>}
              </p>
            </Cartao>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Cartao titulo="Histórico de recargas">
              {linha.historico.length === 0 ? <p className="text-sm text-suave">Nenhuma recarga registrada.</p> : (
                <ul className="divide-y divide-borda text-sm">
                  {linha.historico.map((h) => <li key={h.diasAtras} className="flex justify-between gap-3 py-2"><span>{dataDe(agora, h.diasAtras)} · {h.plano} <span className="text-suave">· {h.forma}</span></span><span className="numeros font-semibold">{brl(h.valor)}</span></li>)}
                </ul>
              )}
            </Cartao>
            <Cartao titulo="Recargas pedidas e ainda não pagas" subtitulo="Links em aberto não obrigam o cliente a pagar">
              {linha.cobrancasAbertas.length === 0 ? <p className="text-sm text-suave">Nenhuma cobrança em aberto.</p> : (
                <ul className="divide-y divide-borda text-sm">
                  {linha.cobrancasAbertas.map((c) => <li key={c.diasAtras} className="flex justify-between gap-3 py-2"><span>{dataDe(agora, c.diasAtras)} · {c.forma}</span><span className="numeros font-semibold">{brl(c.valor)}</span></li>)}
                </ul>
              )}
            </Cartao>
          </div>
        </>
      )}

      <Dialogo
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo="Apelido da linha"
        descricao="Ajuda a identificar a linha (POST /linhas/atualizar). Na demonstração não é gravado."
        rodape={<><Botao variante="secundario" onClick={() => setEditando(null)}>Cancelar</Botao><Botao onClick={() => { if (linha && editando !== null) setApelidos({ ...apelidos, [linha.numero]: editando.trim() }); setEditando(null); }}>Salvar apelido</Botao></>}
      >
        <label className="block text-sm font-medium">Apelido<input value={editando ?? ""} onChange={(e) => setEditando(e.target.value)} maxLength={40} className={`${classeCampo} mt-1`} /></label>
      </Dialogo>
    </div>
  );
}

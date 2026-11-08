"use client";

import { CircleHelp, Lock, LockOpen } from "lucide-react";
import { useState } from "react";

import { Dialogo } from "../../../../componentes/Dialogo";
import { Aviso, Botao, Cartao, Selo } from "../../../../componentes/ui";
import { linhaValida, MOTIVOS_BLOQUEIO, type MotivoBloqueio } from "../../../../integracoes/nogle/regras";
import { classeCampo, formatarLinha, soDigitos } from "./util";

type Registro = { numero: string; acao: "Bloqueada" | "Desbloqueada"; motivo?: MotivoBloqueio; hora: string };

/** Bloqueio e desbloqueio de linha (POST /atendimento/bloqueio e /desbloqueio) e FAQ da Contel. */
export function AtendimentoConnect({ podeBloquear, faq }: { podeBloquear: boolean; faq: readonly { id: number; descricao: string }[] }) {
  const [numero, setNumero] = useState("");
  const [motivo, setMotivo] = useState<MotivoBloqueio>("PERDA");
  const [observacoes, setObservacoes] = useState("");
  const [confirmando, setConfirmando] = useState<"bloqueio" | "desbloqueio" | null>(null);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const numeroOk = linhaValida(numero);

  function executar() {
    if (!confirmando) return;
    const agora = new Date();
    const hora = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
    setRegistros([{ numero: soDigitos(numero), acao: confirmando === "bloqueio" ? "Bloqueada" : "Desbloqueada", motivo: confirmando === "bloqueio" ? motivo : undefined, hora }, ...registros]);
    setConfirmando(null);
    setObservacoes("");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Cartao className="xl:col-span-2" titulo="Bloquear ou desbloquear linha" subtitulo="Perda, roubo, troca de chip, bloqueio de IMEI ou inadimplência. Vale na hora." icone={Lock}>
        {!podeBloquear && <Aviso tom="aviso" className="mb-4" titulo="Só gerente ou dono bloqueiam e desbloqueiam">Em caso de perda ou roubo, chame o gerente da loja na hora. Você pode consultar a linha normalmente.</Aviso>}
        <fieldset disabled={!podeBloquear} className="space-y-3 disabled:opacity-60">
          <label className="block text-sm font-medium">Número da linha<input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" placeholder="(41) 9 0000-0000" className={`${classeCampo} numeros mt-1`} /></label>
          <label className="block text-sm font-medium">Motivo do bloqueio<select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoBloqueio)} className={`${classeCampo} mt-1`}>{MOTIVOS_BLOQUEIO.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="block text-sm font-medium">Observações (opcional)<input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: boletim de ocorrência nº…" className={`${classeCampo} mt-1`} /></label>
          {!numeroOk && numero.trim() !== "" && <p className="text-sm text-aviso">Número com DDD e 11 dígitos.</p>}
          <div className="flex flex-wrap gap-2">
            <Botao variante="perigo" onClick={() => setConfirmando("bloqueio")} disabled={!numeroOk}><Lock aria-hidden className="size-4" /> Bloquear linha</Botao>
            <Botao variante="secundario" onClick={() => setConfirmando("desbloqueio")} disabled={!numeroOk}><LockOpen aria-hidden className="size-4" /> Desbloquear linha</Botao>
          </div>
        </fieldset>
        {registros.length > 0 && (
          <ul aria-live="polite" className="mt-4 divide-y divide-borda rounded-xl border border-borda">
            {registros.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="numeros">{formatarLinha(r.numero)}{r.motivo ? ` · ${r.motivo}` : ""}</span>
                <Selo tom={r.acao === "Bloqueada" ? "perigo" : "sucesso"} ponto>{r.acao} às {r.hora} (simulação)</Selo>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <div className="min-w-0 space-y-4">
        <Cartao titulo="Dúvidas frequentes da Contel" subtitulo="Perguntas e respostas vêm da operadora (GET /faq)" icone={CircleHelp}>
          <ul className="space-y-2 text-sm">
            {faq.map((c) => <li key={c.id} className="flex items-center justify-between rounded-xl bg-fundo px-3 py-2">{c.descricao}<Selo tom="neutro">categoria {c.id}</Selo></li>)}
          </ul>
          <p className="mt-2 text-xs text-suave">Na demonstração não inventamos respostas da operadora: elas aparecem quando a integração for ligada.</p>
        </Cartao>
        <Aviso tom="info" titulo="Troca de chip">A documentação cita a troca de chip (o número passa para um chip virgem), mas não traz a rota para pedir. Perguntar à Contel.</Aviso>
      </div>

      <Dialogo
        aberto={confirmando !== null}
        aoFechar={() => setConfirmando(null)}
        titulo={confirmando === "bloqueio" ? `Bloquear ${formatarLinha(soDigitos(numero))}?` : `Desbloquear ${formatarLinha(soDigitos(numero))}?`}
        descricao={confirmando === "bloqueio" ? `Motivo: ${motivo}. Internet, ligações e SMS param na hora. Fica registrado na auditoria.` : "A linha volta a funcionar na hora, se tiver saldo. Fica registrado na auditoria."}
        rodape={<><Botao variante="secundario" onClick={() => setConfirmando(null)}>Cancelar</Botao><Botao variante={confirmando === "bloqueio" ? "perigo" : "primario"} onClick={executar}>{confirmando === "bloqueio" ? "Confirmar bloqueio" : "Confirmar desbloqueio"}</Botao></>}
      >
        <p className="text-xs text-suave">Demonstração: nada é enviado à operadora.</p>
      </Dialogo>
    </div>
  );
}

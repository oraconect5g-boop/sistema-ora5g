"use client";

import { ArrowRightLeft, MessageSquare, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Aviso, Botao, Cartao, Etapas, Selo, type Tom } from "../../../../componentes/ui";
import { linhaValida, STATUS_PORTABILIDADE, type StatusPortabilidade } from "../../../../integracoes/nogle/regras";
import { classeCampo, formatarLinha, soDigitos } from "./util";

type Portabilidade = { linha: string; doador: string; operadora: string; status: StatusPortabilidade; cadastroDiasAtras: number };

const TOM: Record<StatusPortabilidade, Tom> = { "Aguardando confirmação": "aviso", "Portabilidade em andamento": "info", Sucesso: "sucesso", "Portabilidade negada": "perigo" };
const ETAPAS = ["Pedido", "Aceite por SMS", "Em andamento (3 dias úteis)", "Concluída"];
const etapaDe = (s: StatusPortabilidade) => (s === "Aguardando confirmação" ? 1 : s === "Portabilidade em andamento" ? 2 : 4);

/** Portabilidade (POST /portabilidade/solicitar, GET /status, POST /reenviarsms, GET /operadorasDisponiveis, relatório). */
export function PortabilidadeConnect({ operadoras, portabilidades }: { operadoras: readonly { id: number; descricao: string }[]; portabilidades: readonly Portabilidade[] }) {
  const [form, setForm] = useState({ linha: "", doador: "", operadora: operadoras[0]?.id ?? 0, erro: "" });
  const [lista, setLista] = useState<Portabilidade[]>([...portabilidades]);
  const [aviso, setAviso] = useState("");
  const [filtro, setFiltro] = useState<StatusPortabilidade | "Todas">("Todas");

  function solicitar() {
    if (!linhaValida(form.linha)) return setForm({ ...form, erro: "Número da linha Ora Connect com DDD (11 dígitos)." });
    if (!linhaValida(form.doador)) return setForm({ ...form, erro: "Número que vai ser trazido, com DDD (11 dígitos)." });
    if (soDigitos(form.linha) === soDigitos(form.doador)) return setForm({ ...form, erro: "Os dois números precisam ser diferentes." });
    const operadora = operadoras.find((o) => o.id === form.operadora)?.descricao ?? "";
    setLista([{ linha: soDigitos(form.linha), doador: soDigitos(form.doador), operadora, status: "Aguardando confirmação", cadastroDiasAtras: 0 }, ...lista]);
    setAviso(`Portabilidade pedida: ${formatarLinha(soDigitos(form.doador))} (${operadora}). O cliente recebe um SMS no número antigo para aceitar.`);
    setForm({ linha: "", doador: "", operadora: form.operadora, erro: "" });
  }

  function consultar(p: Portabilidade) {
    const proximo: StatusPortabilidade = p.status === "Aguardando confirmação" ? "Portabilidade em andamento" : p.status === "Portabilidade em andamento" ? "Sucesso" : p.status;
    setLista(lista.map((x) => (x === p ? { ...x, status: proximo } : x)));
    setAviso(proximo === p.status ? `Sem mudança: ${p.status}.` : `Status atualizado (simulação): ${proximo}.`);
  }

  const visiveis = lista.filter((p) => filtro === "Todas" || p.status === filtro);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Cartao titulo="Trazer número de outra operadora" subtitulo="O cliente já precisa ter uma linha Ora Connect ativa" icone={ArrowRightLeft}>
        <div className="space-y-3">
          <label className="block text-sm font-medium">Linha Ora Connect (nova)<input value={form.linha} onChange={(e) => setForm({ ...form, linha: e.target.value, erro: "" })} inputMode="numeric" placeholder="(41) 9 0000-0000" className={`${classeCampo} numeros mt-1`} /></label>
          <label className="block text-sm font-medium">Número que vai ser trazido<input value={form.doador} onChange={(e) => setForm({ ...form, doador: e.target.value, erro: "" })} inputMode="numeric" placeholder="(41) 9 9999-9999" className={`${classeCampo} numeros mt-1`} /></label>
          <label className="block text-sm font-medium">Operadora atual<select value={form.operadora} onChange={(e) => setForm({ ...form, operadora: Number(e.target.value) })} className={`${classeCampo} mt-1`}>{operadoras.map((o) => <option key={o.id} value={o.id}>{o.descricao}</option>)}</select></label>
          {form.erro && <p role="alert" className="text-sm text-perigo">{form.erro}</p>}
          <Botao onClick={solicitar} className="w-full">Solicitar portabilidade</Botao>
        </div>
        {aviso && <Aviso tom="info" className="mt-3">{aviso}</Aviso>}
      </Cartao>

      <Cartao className="xl:col-span-2" titulo="Portabilidades" subtitulo="Depois do aceite, leva 3 dias úteis (GET /portabilidade/listar)">
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
          {(["Todas", ...STATUS_PORTABILIDADE] as const).map((s) => (
            <button key={s} type="button" aria-pressed={filtro === s} onClick={() => setFiltro(s)} className={`min-h-9 rounded-lg border px-2.5 text-xs font-semibold ${filtro === s ? "border-acao bg-acao-clara text-acao-escura" : "border-borda bg-white text-suave"}`}>{s}</button>
          ))}
        </div>
        <ul className="space-y-3">
          {visiveis.map((p) => (
            <li key={`${p.linha}-${p.doador}`} className="rounded-xl border border-borda p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm"><strong className="numeros">{formatarLinha(p.doador)}</strong> <span className="text-suave">({p.operadora}) → Ora Connect</span> <span className="numeros">{formatarLinha(p.linha)}</span></span>
                <Selo tom={TOM[p.status]} ponto>{p.status}</Selo>
              </div>
              {p.status !== "Portabilidade negada" && <div className="mt-3"><Etapas etapas={ETAPAS} atual={etapaDe(p.status)} rotulo={`Andamento da portabilidade de ${formatarLinha(p.doador)}`} /></div>}
              {p.status === "Portabilidade negada" && <p className="mt-2 text-xs text-suave">Negada por divergência de dados. Confira titular e número e peça de novo; o cliente pode assinar o termo se não conseguir aceitar pelo SMS.</p>}
              {(p.status === "Aguardando confirmação" || p.status === "Portabilidade em andamento") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Botao tamanho="sm" variante="secundario" aria-label={`Consultar status de ${formatarLinha(p.doador)}`} onClick={() => consultar(p)}><RefreshCw aria-hidden className="size-4" /> Consultar status</Botao>
                  {p.status === "Aguardando confirmação" && <Botao tamanho="sm" variante="fantasma" onClick={() => setAviso(`SMS de aceite reenviado para ${formatarLinha(p.doador)} (simulação).`)}><MessageSquare aria-hidden className="size-4" /> Reenviar SMS</Botao>}
                </div>
              )}
            </li>
          ))}
          {visiveis.length === 0 && <li className="text-sm text-suave">Nenhuma portabilidade nessa situação.</li>}
        </ul>
      </Cartao>
    </div>
  );
}

"use client";

import { lerReais } from "@ora5g/dominio";
import { Pencil } from "lucide-react";
import { useState } from "react";

import { Dialogo } from "../../../componentes/Dialogo";
import { Botao, Selo } from "../../../componentes/ui";
import { brl } from "../../../lib/formato";

/** Preço do produto; só o dono altera (ADR-002). Venda já concluída nunca muda de preço. */
export function PrecoEditavel({ nome, preco, podeAlterar }: { nome: string; preco: number; podeAlterar: boolean }) {
  const [atual, setAtual] = useState(preco);
  const [alterado, setAlterado] = useState(false);
  const [edicao, setEdicao] = useState<{ aberto: boolean; valor: string; motivo: string; erro: string }>({ aberto: false, valor: "", motivo: "", erro: "" });

  function salvar() {
    let novo: number;
    try {
      novo = lerReais(edicao.valor);
    } catch {
      return setEdicao({ ...edicao, erro: "Preço inválido. Ex.: 2.099,00" });
    }
    if (novo <= 0) return setEdicao({ ...edicao, erro: "O preço precisa ser maior que zero." });
    if (edicao.motivo.trim().length < 5) return setEdicao({ ...edicao, erro: "Informe o motivo (fica no histórico)." });
    setAtual(novo);
    setAlterado(true);
    setEdicao({ aberto: false, valor: "", motivo: "", erro: "" });
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <span className="numeros font-semibold">{brl(atual)}</span>
      {alterado && <Selo tom="info">Novo preço (não gravado)</Selo>}
      {podeAlterar && (
        <button type="button" aria-label={`Alterar preço de ${nome}`} onClick={() => setEdicao({ aberto: true, valor: (atual / 100).toFixed(2).replace(".", ","), motivo: "", erro: "" })} className="grid size-9 place-items-center rounded-lg text-suave hover:bg-slate-100 hover:text-texto">
          <Pencil aria-hidden className="size-4" />
        </button>
      )}
      <Dialogo
        aberto={edicao.aberto}
        aoFechar={() => setEdicao({ aberto: false, valor: "", motivo: "", erro: "" })}
        titulo={`Alterar preço · ${nome}`}
        descricao="Vale a partir de agora. Vendas já concluídas mantêm o preço da época; tudo fica no histórico."
        rodape={<><Botao variante="secundario" onClick={() => setEdicao({ aberto: false, valor: "", motivo: "", erro: "" })}>Cancelar</Botao><Botao onClick={salvar}>Salvar novo preço</Botao></>}
      >
        <div className="space-y-3 text-left">
          <label className="block text-sm font-medium">Novo preço (R$)
            <input value={edicao.valor} onChange={(e) => setEdicao({ ...edicao, valor: e.target.value, erro: "" })} inputMode="decimal" className="numeros mt-1 min-h-11 w-full rounded-botao border border-borda px-3 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" />
          </label>
          <label className="block text-sm font-medium">Motivo
            <input value={edicao.motivo} onChange={(e) => setEdicao({ ...edicao, motivo: e.target.value, erro: "" })} placeholder="Ex.: ajuste à concorrência" className="mt-1 min-h-11 w-full rounded-botao border border-borda px-3 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" />
          </label>
          {edicao.erro && <p role="alert" className="text-sm text-perigo">{edicao.erro}</p>}
        </div>
      </Dialogo>
    </span>
  );
}

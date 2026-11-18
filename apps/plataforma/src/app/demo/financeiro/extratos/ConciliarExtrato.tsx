"use client";

import { Check, CircleSlash, FileSpreadsheet } from "lucide-react";
import { useState } from "react";

import { Botao, Cartao, Selo } from "../../../../componentes/ui";
import type { ExtratoDemo, SituacaoDaLinhaDoExtrato } from "../../../../demo/dados/fluxos-novos";

const brl = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const SELOS: Record<SituacaoDaLinhaDoExtrato, { rotulo: string; tom: "aviso" | "sucesso" | "neutro" }> = {
  a_conferir: { rotulo: "A conferir", tom: "aviso" },
  conciliada: { rotulo: "Conciliada", tom: "sucesso" },
  fora: { rotulo: "Fora da conta", tom: "neutro" },
};
type Estado = Record<string, { situacao: SituacaoDaLinhaDoExtrato; motivo?: string }>;

// Um extrato na demonstração (DEMO-b; a tela real é /pagamentos/extratos, do lote EXT-a): cada linha com a sugestão do
// sistema; a gerência concilia com a sugestão ou tira da conta com o motivo (de 3 a 200 letras, como na tela real). Tudo
// fica no navegador: nada é gravado. Conciliar marca o pagamento da venda como conciliado com o extrato; venda não é
// dinheiro recebido, e a linha sem venda que bata nunca se concilia sozinha.
export function ConciliarExtrato({ extrato }: { extrato: ExtratoDemo }) {
  const [estado, setEstado] = useState<Estado>(() => Object.fromEntries(extrato.linhas.map((l) => [l.id, { situacao: l.situacao, motivo: l.motivo }])));
  const [tirando, setTirando] = useState<{ id: string; motivo: string } | null>(null);
  const situacaoDe = (id: string) => estado[id]?.situacao ?? "a_conferir";
  const contar = (s: SituacaoDaLinhaDoExtrato) => extrato.linhas.filter((l) => situacaoDe(l.id) === s).length;
  const certas = extrato.linhas.filter((l) => situacaoDe(l.id) === "a_conferir" && l.sugestao?.porReferencia);
  const mudar = (ids: readonly string[], novo: { situacao: SituacaoDaLinhaDoExtrato; motivo?: string }) =>
    setEstado((atual) => ({ ...atual, ...Object.fromEntries(ids.map((id) => [id, novo])) }));

  return (
    <Cartao id={`extrato-${extrato.id}`} titulo={`Extrato nº ${extrato.numero} · ${extrato.fonte}`} icone={FileSpreadsheet}
      subtitulo={`${extrato.loja} · de ${dataCurta(extrato.de)} a ${dataCurta(extrato.ate)} · ${extrato.linhas.length} linhas`}
      acao={(
        <span className="flex flex-wrap gap-1.5">
          {contar("a_conferir") > 0 && <Selo tom="aviso">{`${contar("a_conferir")} a conferir`}</Selo>}
          {contar("conciliada") > 0 && <Selo tom="sucesso">{`${contar("conciliada")} conciliadas`}</Selo>}
          {contar("fora") > 0 && <Selo tom="neutro">{`${contar("fora")} fora da conta`}</Selo>}
        </span>
      )}>
      {certas.length > 0 && (
        <Botao tamanho="sm" variante="secundario" className="mb-2" onClick={() => mudar(certas.map((l) => l.id), { situacao: "conciliada" })}>
          <Check className="size-4" aria-hidden />{`Conciliar as certas (mesma referência): ${certas.length}`}
        </Botao>
      )}
      <ul className="divide-y divide-borda text-sm">
        {extrato.linhas.map((l) => {
          const s = estado[l.id] ?? { situacao: "a_conferir" as const };
          return (
            <li key={l.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{l.descricao}<span className="numeros text-xs font-normal text-suave">{` · ${l.referencia} · ${dataCurta(l.data)}`}</span></p>
                  <p className="numeros text-xs text-suave">{`Bruto ${brl(l.bruto)} · taxa ${brl(l.taxa)} · líquido ${brl(l.liquido)} · cai em ${dataCurta(l.repasse)}`}</p>
                  {l.sugestao ? (
                    <p className="numeros text-xs">{`Sugestão: venda ${l.sugestao.venda} · ${l.sugestao.meio} · ${brl(l.sugestao.valor)} · ${l.sugestao.porReferencia ? "mesma referência" : "mesmo valor e mesmo dia"}`}</p>
                  ) : l.bruto < 0 ? (
                    <p className="text-xs text-aviso">Estorno, chargeback, tarifa ou saída: confira e tire da conta, com o motivo.</p>
                  ) : (
                    <p className="text-xs text-aviso">Nenhuma venda bate com esta linha: confira na loja antes de conciliar.</p>
                  )}
                </div>
                <Selo tom={SELOS[s.situacao].tom}>{SELOS[s.situacao].rotulo}</Selo>
              </div>
              {s.situacao === "a_conferir" && tirando?.id !== l.id && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {l.sugestao && <Botao tamanho="sm" onClick={() => mudar([l.id], { situacao: "conciliada" })}><Check className="size-4" aria-hidden />Conciliar</Botao>}
                  <Botao tamanho="sm" variante="secundario" onClick={() => setTirando({ id: l.id, motivo: "" })}><CircleSlash className="size-4" aria-hidden />Tirar da conta</Botao>
                </div>
              )}
              {tirando?.id === l.id && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs font-medium">Motivo
                    <input value={tirando.motivo} maxLength={200} onChange={(e) => setTirando({ id: l.id, motivo: e.target.value })} placeholder="Estorno da venda devolvida" className={campo} />
                  </label>
                  <Botao tamanho="sm" disabled={tirando.motivo.trim().length < 3} onClick={() => { mudar([l.id], { situacao: "fora", motivo: tirando.motivo.trim() }); setTirando(null); }}>Tirar da conta</Botao>
                  <Botao tamanho="sm" variante="fantasma" onClick={() => setTirando(null)}>Cancelar</Botao>
                </div>
              )}
              {s.situacao !== "a_conferir" && (
                <p className="mt-1 text-xs text-suave">
                  {s.situacao === "fora" ? `Fora da conta. Motivo: ${s.motivo ?? "—"}. ` : "Conciliada: o pagamento da venda passa de \"a liquidar\" para \"conciliado com o extrato\". "}
                  <button type="button" onClick={() => mudar([l.id], { situacao: "a_conferir" })} className="font-semibold text-acao">Desfazer</button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Cartao>
  );
}

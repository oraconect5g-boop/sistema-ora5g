"use client";

import { BadgePercent, Ban, CircleCheck, CircleX, FileText, Hourglass } from "lucide-react";
import { useState } from "react";

import { Dialogo } from "../../../componentes/Dialogo";
import { Botao, Cartao, EstadoVazio, Selo } from "../../../componentes/ui";

export type PedidoAprovacao = {
  id: string;
  tipo: "desconto" | "nota" | "cancelamento";
  numero: string;
  loja: string;
  vendedor: string;
  cliente: string;
  descricao: string;
  total: string;
  esperaMinutos: number;
  motivo: string;
  /** Desconto: valores já formatados pelo servidor (só gestores recebem a margem). */
  desconto?: { pedido: string; precoOriginal: string; meio: string; limite: string; margem: string; abaixoDoCusto: boolean };
};

type Decisao = { resultado: "aprovado" | "negado"; justificativa: string };

const NOMES = { desconto: "Desconto acima do limite", nota: "Nota fiscal a emitir", cancelamento: "Cancelamento de venda" } as const;
const ICONES = { desconto: BadgePercent, nota: FileText, cancelamento: Ban } as const;
const TEXTO_APROVADO = {
  desconto: "Desconto aprovado: o vendedor já pode concluir a venda.",
  nota: "Nota autorizada para emissão. A emissão automática depende do emissor fiscal contratado.",
  cancelamento: "Cancelamento aprovado: no sistema real o estoque volta e o pagamento é estornado.",
} as const;

export function FilaDeAprovacoes({ pedidos, aprovador }: { pedidos: readonly PedidoAprovacao[]; aprovador: string }) {
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({});
  const [filtro, setFiltro] = useState<"todos" | PedidoAprovacao["tipo"]>("todos");
  const [emAnalise, setEmAnalise] = useState<{ pedido: PedidoAprovacao; acao: "aprovar" | "negar" } | null>(null);
  const [justificativa, setJustificativa] = useState("");

  const pendentes = pedidos.filter((p) => !decisoes[p.id]);
  const visiveis = pedidos.filter((p) => filtro === "todos" || p.tipo === filtro);
  const contagem = (tipo: PedidoAprovacao["tipo"]) => pendentes.filter((p) => p.tipo === tipo).length;

  function decidir() {
    if (!emAnalise) return;
    if (emAnalise.acao === "negar" && justificativa.trim().length < 5) return;
    setDecisoes({ ...decisoes, [emAnalise.pedido.id]: { resultado: emAnalise.acao === "aprovar" ? "aprovado" : "negado", justificativa: justificativa.trim() } });
    setEmAnalise(null);
    setJustificativa("");
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar pedidos">
        {([["todos", "Todos", pendentes.length], ["desconto", "Descontos", contagem("desconto")], ["nota", "Notas", contagem("nota")], ["cancelamento", "Cancelamentos", contagem("cancelamento")]] as const).map(([valor, rotulo, n]) => (
          <button key={valor} type="button" aria-pressed={filtro === valor} onClick={() => setFiltro(valor)} className={`flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition ${filtro === valor ? "border-acao bg-acao-clara text-acao-escura" : "border-borda bg-white text-suave hover:text-texto"}`}>
            {rotulo} <span className="numeros rounded-full bg-white px-1.5 text-xs">{n}</span>
          </button>
        ))}
        <span className="ml-auto text-sm text-suave" aria-live="polite">{pendentes.length === 0 ? "Fila zerada" : `${pendentes.length} aguardando decisão`}</span>
      </div>

      {visiveis.length === 0 ? (
        <div className="mt-4"><EstadoVazio titulo="Nenhum pedido aqui" icone={CircleCheck}>Quando um vendedor pedir aprovação, o pedido aparece nesta fila e no sino de avisos.</EstadoVazio></div>
      ) : (
        <ul className="mt-4 grid gap-4 xl:grid-cols-2">
          {visiveis.map((p) => {
            const decisao = decisoes[p.id];
            const IconePedido = ICONES[p.tipo];
            return (
              <li key={p.id}>
                <Cartao
                  icone={IconePedido}
                  titulo={`${NOMES[p.tipo]} · ${p.numero}`}
                  subtitulo={`${p.vendedor} · ${p.loja} · ${p.cliente}`}
                  acao={decisao ? <Selo tom={decisao.resultado === "aprovado" ? "sucesso" : "perigo"} ponto>{decisao.resultado === "aprovado" ? "Aprovado" : "Negado"}</Selo> : <Selo tom={p.esperaMinutos > 30 ? "perigo" : "aviso"} ponto>há {p.esperaMinutos} min</Selo>}
                  className={decisao ? "opacity-80" : ""}
                >
                  <p className="text-sm">{p.descricao} · <strong className="numeros">{p.total}</strong></p>
                  {p.desconto && (
                    <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-fundo p-3 text-sm sm:grid-cols-4">
                      <div><dt className="text-xs text-suave">Pedido</dt><dd className="numeros font-semibold">{p.desconto.pedido}</dd></div>
                      <div><dt className="text-xs text-suave">Limite sem aprovação</dt><dd className="numeros font-semibold">{p.desconto.limite}</dd></div>
                      <div><dt className="text-xs text-suave">Margem que sobra</dt><dd className={`numeros font-semibold ${p.desconto.abaixoDoCusto ? "text-perigo" : ""}`}>{p.desconto.margem}</dd></div>
                      <div><dt className="text-xs text-suave">Pagamento</dt><dd className="text-xs font-medium leading-4">{p.desconto.meio}</dd></div>
                    </dl>
                  )}
                  <p className="mt-2 text-sm text-suave">Motivo: {p.motivo}</p>
                  {p.desconto?.abaixoDoCusto && <p className="mt-2"><Selo tom="perigo" ponto>Abaixo do custo: só o dono aprova</Selo></p>}
                  {decisao ? (
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-fundo px-3 py-2 text-sm">
                      {decisao.resultado === "aprovado" ? <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-sucesso" /> : <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-perigo" />}
                      <span>{decisao.resultado === "aprovado" ? TEXTO_APROVADO[p.tipo] : `Negado: ${decisao.justificativa}`} <span className="text-suave">Registrado na auditoria por {aprovador} (demonstração).</span></span>
                    </p>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                      <Botao variante="perigo" aria-label={`Negar ${p.numero}`} onClick={() => { setEmAnalise({ pedido: p, acao: "negar" }); setJustificativa(""); }}>Negar</Botao>
                      <Botao aria-label={`Aprovar ${p.numero}`} onClick={() => { setEmAnalise({ pedido: p, acao: "aprovar" }); setJustificativa(""); }}>Aprovar</Botao>
                    </div>
                  )}
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}

      <Dialogo
        aberto={emAnalise !== null}
        aoFechar={() => setEmAnalise(null)}
        titulo={emAnalise ? `${emAnalise.acao === "aprovar" ? "Aprovar" : "Negar"} · ${emAnalise.pedido.numero}` : ""}
        descricao={emAnalise ? `${NOMES[emAnalise.pedido.tipo]} pedido por ${emAnalise.pedido.vendedor}. A decisão fica registrada com seu nome, data e hora.` : undefined}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setEmAnalise(null)}>Voltar</Botao>
            <Botao variante={emAnalise?.acao === "negar" ? "perigo" : "primario"} onClick={decidir} disabled={emAnalise?.acao === "negar" && justificativa.trim().length < 5}>
              {emAnalise?.acao === "negar" ? "Confirmar negativa" : "Confirmar aprovação"}
            </Botao>
          </>
        }
      >
        <label className="block text-sm font-medium" htmlFor="justificativa">{emAnalise?.acao === "negar" ? "Justificativa (obrigatória, o vendedor vê)" : "Observação (opcional)"}</label>
        <textarea id="justificativa" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3} className="mt-1 w-full rounded-botao border border-borda px-3 py-2 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-suave"><Hourglass aria-hidden className="size-3.5" /> Demonstração: nada é gravado.</p>
      </Dialogo>
    </>
  );
}

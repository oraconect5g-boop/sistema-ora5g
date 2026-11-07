import { ArrowRight, BellRing, CircleCheck } from "lucide-react";
import Link from "next/link";

import { Colunas, TabelaDoGrafico } from "../../../componentes/graficos";
import { Cartao } from "../../../componentes/ui";
import type { Alerta } from "../../../demo/consultas";
import { brl, brlEixo, diaMes, diasAntes } from "../../../lib/formato";

const COR = { aviso: "bg-amber-500", perigo: "bg-perigo", info: "bg-info" } as const;

/** "Atenção agora": alertas do escopo (estoque mínimo, caixa divergente, nota parada, OS parada...). */
export function CartaoAvisos({ alertas, limite = 6 }: { alertas: readonly Alerta[]; limite?: number }) {
  return (
    <Cartao titulo="Atenção agora" subtitulo="O que precisa de alguém hoje" icone={BellRing}>
      {alertas.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-suave"><CircleCheck aria-hidden className="size-4 text-sucesso" /> Nada pendente. Tudo em dia.</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {alertas.slice(0, limite).map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="group flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${COR[a.tom]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-5">{a.titulo}</span>
                  <span className="block text-xs text-suave">{a.detalhe}</span>
                </span>
                <ArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-suave opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {alertas.length > limite && <p className="mt-2 text-xs text-suave">E mais {alertas.length - limite} no sino de avisos.</p>}
    </Cartao>
  );
}

/** Faturamento dos últimos 13 dias + hoje (hoje em destaque). */
export function GraficoFaturamento({ historico, hoje, valorHoje }: { historico: readonly { faturamento: number }[]; hoje: Date; valorHoje: number }) {
  const dias = historico.slice(-13).map((d, i) => ({ rotulo: diaMes(diasAntes(hoje, 13 - i)), valor: d.faturamento }));
  const dados = [...dias, { rotulo: "Hoje", valor: valorHoje, destaque: true }];
  return (
    <>
      <Colunas dados={dados} formatar={brl} formatarEixo={brlEixo} nomeSerie="Faturamento" cadaRotulo={2} altura={250} />
      <TabelaDoGrafico colunas={["Dia", "Faturamento"]} linhas={dados.map((d) => [d.rotulo, brl(d.valor)])} />
    </>
  );
}

export const variacaoEntre = (atual: number, anterior: number) => (anterior > 0 ? (atual - anterior) / anterior : 0);

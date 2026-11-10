import { ArrowRight, BellRing, CircleCheck, ClipboardCheck, FileText, Package, Signal, Wallet, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Cartao } from "../../../componentes/ui";
import type { Alerta } from "../../../demo/consultas";

// Situação (ponto colorido, sempre com o texto do alerta ao lado).
const COR = { aviso: "bg-amber-500", perigo: "bg-perigo", info: "bg-info" } as const;
const SITUACAO = { aviso: "atenção", perigo: "urgente", info: "informação" } as const;

// Assunto do alerta (visual de 10/11/2026): cartão em tom pastel e ícone próprios. É identidade, não situação.
const ASSUNTOS: readonly { prefixo: string; fundo: string; icone: LucideIcon; cor: string }[] = [
  { prefixo: "/demo/aprovacoes", fundo: "bg-pastel-azul", icone: ClipboardCheck, cor: "text-acao" },
  { prefixo: "/demo/financeiro", fundo: "bg-pastel-amarelo", icone: Wallet, cor: "text-amber-700" },
  { prefixo: "/demo/estoque", fundo: "bg-pastel-menta", icone: Package, cor: "text-emerald-700" },
  { prefixo: "/demo/assistencia", fundo: "bg-pastel-pessego", icone: Wrench, cor: "text-orange-700" },
  { prefixo: "/demo/connect", fundo: "bg-pastel-azul", icone: Signal, cor: "text-acao" },
];

function assuntoDe(alerta: Alerta) {
  if (/^Nota /.test(alerta.titulo)) return { fundo: "bg-pastel-pessego", icone: FileText, cor: "text-orange-700" };
  return ASSUNTOS.find((a) => alerta.href.startsWith(a.prefixo)) ?? { fundo: "bg-slate-100", icone: BellRing, cor: "text-suave" };
}

/** "Atenção agora": alertas do escopo (estoque mínimo, caixa divergente, nota parada, OS parada...). */
export function CartaoAvisos({ alertas, limite = 6 }: { alertas: readonly Alerta[]; limite?: number }) {
  return (
    <Cartao titulo="Atenção agora" subtitulo="O que precisa de alguém hoje" icone={BellRing}>
      {alertas.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-suave"><CircleCheck aria-hidden className="size-4 text-sucesso" /> Nada pendente. Tudo em dia.</p>
      ) : (
        <ul className="space-y-2">
          {alertas.slice(0, limite).map((a) => {
            const assunto = assuntoDe(a);
            const IconeDoAssunto = assunto.icone;
            return (
              <li key={a.id}>
                <Link href={a.href} className={`group flex items-center gap-3 rounded-[20px] p-3 transition-[filter] hover:brightness-[0.98] ${assunto.fundo}`}>
                  <span className={`relative grid size-10 shrink-0 place-items-center rounded-full bg-white ${assunto.cor}`}>
                    <IconeDoAssunto aria-hidden className="size-[18px]" />
                    <span className={`absolute right-0 top-0 size-2.5 rounded-full ring-2 ring-white ${COR[a.tom]}`} title={SITUACAO[a.tom]} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5">{a.titulo}</span>
                    <span className="block text-xs text-slate-600">{a.detalhe}</span>
                  </span>
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80 text-texto transition-transform group-hover:translate-x-0.5">
                    <ArrowRight className="size-4" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {alertas.length > limite && <p className="mt-3 text-xs text-suave">E mais {alertas.length - limite} no sino de avisos.</p>}
    </Cartao>
  );
}

export const variacaoEntre = (atual: number, anterior: number) => (anterior > 0 ? (atual - anterior) / anterior : 0);

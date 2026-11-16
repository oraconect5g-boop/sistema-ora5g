import { ArrowLeft, MapPin, Store } from "lucide-react";
import Link from "next/link";

import { brl } from "../../../../lib/formato";
import { FormularioDaReserva } from "./FormularioDaReserva";

export function VoltarAoProduto({ produto }: { produto: string }) {
  return <Link href={`/loja/${produto}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Voltar ao produto</Link>;
}

/** A tela de reservar (ONLINE-b; ADR-009): confirma a variação, a loja e o preço do balcão antes do formulário. */
export function TelaDeReservar({ produto, variacao, loja, chave }: {
  produto: string;
  variacao: { id: string; nome: string };
  loja: { id: string; nome: string; endereco: string | null; cidade: string | null; preco_centavos: number };
  chave: string;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <VoltarAoProduto produto={produto} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reservar e retirar na loja</h1>
        <p className="text-sm text-suave">A reserva vale 24 horas. Você paga na loja, na retirada.</p>
      </div>
      <section className="space-y-1 rounded-cartao border border-borda bg-white p-4 text-sm">
        <p className="font-semibold">{variacao.nome}</p>
        <p className="flex items-center gap-1"><Store aria-hidden className="size-4 text-suave" /> {loja.nome}</p>
        {(loja.endereco || loja.cidade) && <p className="flex items-start gap-1 text-xs text-suave"><MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />{[loja.endereco, loja.cidade].filter(Boolean).join(" · ")}</p>}
        <p className="numeros pt-1 text-xl font-bold">{brl(loja.preco_centavos)}</p>
      </section>
      <FormularioDaReserva variante={variacao.id} loja={loja.id} chave={chave} />
    </div>
  );
}

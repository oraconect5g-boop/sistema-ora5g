import { CircleCheck, Scale, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Aviso, Cartao, Selo } from "../../componentes/ui";
import { conferenciaFecha, parteFecha, vendasQueNaoFecham, type Conferencia, type ParteDaConferencia } from "../../lib/financeiro/conferencia";
import { brl, numero } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";

// A conta do período (lote FIN-001a): as vendas concluídas no período, conferidas uma a uma com os pagamentos, com o
// livro do caixa e com o livro do estoque. A conta é do banco (public.financeiro_conferencia); aqui, só o que a tela diz.
// Falha de leitura nunca vira "fecha". O que a conta ainda não confere (o desfazer: o estoque que volta e o dinheiro
// devolvido no cancelamento e na devolução) fica dito no cartão, para ninguém ler "fecha" como "tudo conferido".

const unidades = (n: number) => `${numero(n)} ${n === 1 ? "unidade" : "unidades"}`;
const vendas = (n: number) => `${numero(n)} ${n === 1 ? "venda" : "vendas"}`;

/** As vendas que não fecham naquele lado: as primeiras (até 20), cada uma com o atalho para abrir. */
function VendasComDiferenca({ parte }: { parte: ParteDaConferencia }) {
  if (parte.exemplos.length === 0) return null;
  const mais = parte.vendasComDiferenca - parte.exemplos.length;
  return (
    <p className="mt-1 text-xs">
      {parte.vendasComDiferenca === 1 ? "A venda que não fecha: " : "As vendas que não fecham: "}
      {parte.exemplos.map((v, i) => (
        <span key={v.id}>{i > 0 ? ", " : ""}<Link href={`/vendas/${v.id}`} className="font-semibold text-acao hover:underline">{`Venda ${v.numero}`}</Link></span>
      ))}
      {mais > 0 ? ` e mais ${numero(mais)}` : ""}.
    </p>
  );
}

function Lado({ titulo, parte, texto, diferenca }: { titulo: string; parte: ParteDaConferencia; texto: string; diferenca: string }) {
  const fecha = parteFecha(parte);
  return (
    <li className="rounded-2xl bg-fundo/70 px-3 py-2.5">
      <p className="flex flex-wrap items-center gap-2 text-sm"><strong className="font-semibold">{titulo}</strong><Selo tom={fecha ? "sucesso" : "perigo"}>{fecha ? "fecha" : "não fecha"}</Selo></p>
      <p className="mt-1 text-xs text-suave">{texto}</p>
      {!fecha && <p className="mt-1 text-xs font-semibold text-perigo">{`${diferenca} em ${vendas(parte.vendasComDiferenca)}.`}</p>}
      {!fecha && <VendasComDiferenca parte={parte} />}
    </li>
  );
}

export function ContaDoPeriodo({ leitura }: { leitura: Leitura<Conferencia> }) {
  if (leitura.estado !== "ok") {
    return (
      <Cartao titulo="A conta do período" subtitulo="As vendas conferidas com os pagamentos, o caixa e o estoque" icone={Scale}>
        <Aviso tom="aviso">Não deu para conferir a conta do período agora. Os números desta tela continuam valendo; abra de novo daqui a pouco.</Aviso>
      </Cartao>
    );
  }
  const c = leitura.dados;
  const fecha = conferenciaFecha(c);
  const p = c.pagamentos;
  const partes = [
    `${brl(p.recebidoNaLoja)} recebidos na loja`,
    ...(p.financiado !== 0 ? [`${brl(p.financiado)} a receber das financeiras`] : []),
    ...(p.valeTroca !== 0 ? [`${brl(p.valeTroca)} em vale-troca`] : []),
    ...(p.desfeitos !== 0 ? [`${brl(p.desfeitos)} de pagamentos de vendas canceladas depois`] : []),
  ];
  return (
    <Cartao titulo="A conta do período" subtitulo="As vendas concluídas no período, conferidas uma a uma com os pagamentos, o livro do caixa e o livro do estoque" icone={Scale}>
      {c.vendas === 0 ? (
        <p className="text-sm text-suave">Nenhuma venda concluída no período: não há o que conferir.</p>
      ) : (
        <>
          <p className={`flex items-center gap-2 text-sm font-semibold ${fecha ? "text-sucesso" : "text-perigo"}`}>
            {fecha ? <CircleCheck aria-hidden className="size-4 shrink-0" /> : <TriangleAlert aria-hidden className="size-4 shrink-0" />}
            {fecha ? `A conta fecha: ${vendas(c.vendas)}, ${brl(c.vendido)} vendidos.` : `A conta não fecha em ${vendas(vendasQueNaoFecham(c))}, de ${numero(c.vendas)}.`}
          </p>
          <ul className="mt-3 grid gap-2 lg:grid-cols-3">
            <Lado titulo="Pagamentos" parte={p}
              texto={`O vendido (${brl(c.vendido)}) é a soma de: ${partes.join(" + ")}.`}
              diferenca={`Diferença de ${brl(Math.abs(p.diferenca))}`} />
            <Lado titulo="Livro do caixa" parte={c.caixa}
              texto={`O que essas vendas lançaram no caixa ao serem concluídas (dinheiro, Pix, cartão, entrada do financiamento e vale-troca, com o troco descontado): ${brl(c.caixa.esperado)}. No livro dos caixas: ${brl(c.caixa.noLivro)}.`}
              diferenca={`Diferença de ${brl(Math.abs(c.caixa.diferenca))}`} />
            <Lado titulo="Livro do estoque" parte={c.estoque}
              texto={`Aparelhos, chips e acessórios vendidos: ${unidades(c.estoque.unidades)}. Saídas por venda no livro do estoque: ${unidades(c.estoque.noLivro)}. Serviço e recarga não têm estoque.`}
              diferenca={`Diferença de ${unidades(Math.abs(c.estoque.diferenca))}`} />
          </ul>
          {!fecha && (
            <Aviso tom="perigo" className="mt-3" titulo="Isto não deveria acontecer">
              Toda venda concluída grava o pagamento, o caixa e o estoque de uma vez. Uma diferença aqui é um defeito do sistema ou um lançamento feito por fora dele. Abra as vendas indicadas e avise o suporte; nada foi corrigido sozinho.
            </Aviso>
          )}
          <p className="mt-3 text-xs text-suave">
            Esta conta confere o que cada venda gravou ao ser concluída. O que foi desfeito depois (cancelamento e devolução) está no resumo e nos registros desta tela; o estoque que voltou e o dinheiro devolvido ainda não são conferidos aqui.
          </p>
        </>
      )}
    </Cartao>
  );
}

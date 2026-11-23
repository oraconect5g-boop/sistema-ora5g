import { CircleCheck, Scale, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Aviso, Cartao, Selo } from "../../componentes/ui";
import {
  conferenciaFecha, desfeitoFecha, fatosDesfeitos, parteFecha, valorDesfeito, vendasDoDesfeitoQueNaoFecham, vendasQueNaoFecham,
  type Conferencia, type Desfeito, type ParteDaConferencia,
} from "../../lib/financeiro/conferencia";
import { brl, numero } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";

// A conta do período: as vendas concluídas no período, conferidas uma a uma com os pagamentos, com o livro do caixa e
// com o livro do estoque (lote FIN-001a, public.financeiro_conferencia); e o que foi desfeito no período, os cancelamentos
// e as devoluções, conferidos com o destino do valor, com o livro do caixa e com o livro do estoque (lote FIN-001b,
// public.financeiro_conferencia_do_desfeito). A conta é do banco; aqui, só o que a tela diz. Falha de leitura nunca vira
// "fecha". Num banco sem a segunda função, o cartão diz que o desfeito ainda não é conferido.

const unidades = (n: number) => `${numero(n)} ${n === 1 ? "unidade" : "unidades"}`;
const vendas = (n: number) => `${numero(n)} ${n === 1 ? "venda" : "vendas"}`;
/** "2 cancelamentos e 1 devolução", só com o que houve. */
const fatos = (d: Desfeito) => [
  ...(d.cancelamentos > 0 ? [`${numero(d.cancelamentos)} ${d.cancelamentos === 1 ? "cancelamento" : "cancelamentos"}`] : []),
  ...(d.devolucoes > 0 ? [`${numero(d.devolucoes)} ${d.devolucoes === 1 ? "devolução" : "devoluções"}`] : []),
].join(" e ");
/** Onde a gerência confirma o estorno e confere o item que voltou de uma venda cancelada (o mesmo atalho do Início). */
const VENDAS_CANCELADAS = "/vendas?situacao=canceladas&periodo=30";

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

function Lado({ titulo, parte, texto, diferenca, nota }: { titulo: string; parte: ParteDaConferencia; texto: string; diferenca: string; nota?: string | null }) {
  const fecha = parteFecha(parte);
  return (
    <li className="rounded-2xl bg-fundo/70 px-3 py-2.5">
      <p className="flex flex-wrap items-center gap-2 text-sm"><strong className="font-semibold">{titulo}</strong><Selo tom={fecha ? "sucesso" : "perigo"}>{fecha ? "fecha" : "não fecha"}</Selo></p>
      <p className="mt-1 text-xs text-suave">{texto}</p>
      {nota && <p className="mt-1 text-xs text-aviso">{`${nota} `}<Link href={VENDAS_CANCELADAS} className="font-semibold text-acao hover:underline">Ver as vendas canceladas</Link></p>}
      {!fecha && <p className="mt-1 text-xs font-semibold text-perigo">{`${diferenca} em ${vendas(parte.vendasComDiferenca)}.`}</p>}
      {!fecha && <VendasComDiferenca parte={parte} />}
    </li>
  );
}

function Veredito({ fecha, texto }: { fecha: boolean; texto: string }) {
  return (
    <p className={`flex items-center gap-2 text-sm font-semibold ${fecha ? "text-sucesso" : "text-perigo"}`}>
      {fecha ? <CircleCheck aria-hidden className="size-4 shrink-0" /> : <TriangleAlert aria-hidden className="size-4 shrink-0" />}
      {texto}
    </p>
  );
}

/** As vendas concluídas no período, conferidas com os pagamentos, o caixa e o estoque (FIN-001a). */
function ContaDasVendas({ c }: { c: Conferencia }) {
  if (c.vendas === 0) return <p className="text-sm text-suave">Nenhuma venda concluída no período: não há o que conferir.</p>;
  const fecha = conferenciaFecha(c);
  const p = c.pagamentos;
  const partes = [
    `${brl(p.recebidoNaLoja)} recebidos na loja`,
    ...(p.financiado !== 0 ? [`${brl(p.financiado)} a receber das financeiras`] : []),
    ...(p.valeTroca !== 0 ? [`${brl(p.valeTroca)} em vale-troca`] : []),
    ...(p.desfeitos !== 0 ? [`${brl(p.desfeitos)} de pagamentos de vendas canceladas depois`] : []),
  ];
  return (
    <>
      <Veredito fecha={fecha} texto={fecha ? `A conta fecha: ${vendas(c.vendas)}, ${brl(c.vendido)} vendidos.` : `A conta não fecha em ${vendas(vendasQueNaoFecham(c))}, de ${numero(c.vendas)}.`} />
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
    </>
  );
}

/** O que foi desfeito no período: os cancelamentos e as devoluções, conferidos com o destino do valor, o caixa e o estoque (FIN-001b). */
function ContaDoDesfeito({ d }: { d: Desfeito }) {
  if (fatosDesfeitos(d) === 0) return <p className="text-sm text-suave">Nenhum cancelamento nem devolução no período.</p>;
  const fecha = desfeitoFecha(d);
  const total = valorDesfeito(d);
  const destinos = [
    ...(d.destino.emDinheiro !== 0 ? [`${brl(d.destino.emDinheiro)} devolvidos em dinheiro`] : []),
    ...(d.destino.porFora !== 0 ? [`${brl(d.destino.porFora)} em estorno de Pix, cartão ou financeira`] : []),
    ...(d.destino.valeTroca !== 0 ? [`${brl(d.destino.valeTroca)} em vale-troca`] : []),
  ];
  const e = d.estoque;
  const retornos = [
    `Voltaram ao estoque: ${unidades(e.voltaram)} (no livro do estoque: ${unidades(e.noLivro)}).`,
    ...(e.esperando > 0 ? [`Esperam a conferência do retorno: ${unidades(e.esperando)}.`] : []),
    ...(e.naoVoltaram > 0 ? [`Não voltaram, com a explicação registrada: ${unidades(e.naoVoltaram)}.`] : []),
  ];
  return (
    <>
      <Veredito fecha={fecha} texto={fecha ? `O desfeito fecha: ${fatos(d)}, ${brl(total)}.` : `O desfeito não fecha em ${vendas(vendasDoDesfeitoQueNaoFecham(d))}.`} />
      <ul className="mt-3 grid gap-2 lg:grid-cols-3">
        <Lado titulo="Destino do valor" parte={d.destino}
          texto={`O desfeito (${brl(total)}) é a soma de: ${destinos.length > 0 ? destinos.join(" + ") : brl(0)}.`}
          nota={d.destino.aConfirmar > 0 ? `Dos estornos, ${brl(d.destino.aConfirmar)} ainda esperam o comprovante.` : null}
          diferenca={`Diferença de ${brl(Math.abs(d.destino.diferenca))}`} />
        <Lado titulo="Livro do caixa" parte={d.caixa}
          texto={`Dinheiro devolvido nesses cancelamentos e devoluções: ${brl(d.caixa.esperado)}. No livro dos caixas, como estorno: ${brl(d.caixa.noLivro)}.`}
          diferenca={`Diferença de ${brl(Math.abs(d.caixa.diferenca))}`} />
        <Lado titulo="Livro do estoque" parte={e}
          texto={`Aparelhos, chips e acessórios desfeitos: ${unidades(e.unidades)}. ${retornos.join(" ")}`}
          nota={e.esperando > 0 ? "O item de venda cancelada só volta ao estoque depois de conferido." : null}
          diferenca={`Diferença de ${unidades(Math.abs(e.diferenca))}`} />
      </ul>
      {!fecha && (
        <Aviso tom="perigo" className="mt-3" titulo="Isto não deveria acontecer">
          Todo cancelamento e toda devolução gravam o destino do valor, o estorno no caixa e a volta ao estoque de uma vez. Uma diferença aqui é um defeito do sistema ou um lançamento feito por fora dele. Abra as vendas indicadas e avise o suporte; nada foi corrigido sozinho.
        </Aviso>
      )}
    </>
  );
}

export function ContaDoPeriodo({ leitura, desfeito = null }: {
  leitura: Leitura<Conferencia>;
  /** Nulo: o banco ainda não tem a conferência do desfeito (antes da migration do FIN-001b). */
  desfeito?: Leitura<Desfeito> | null;
}) {
  if (leitura.estado !== "ok") {
    return (
      <Cartao titulo="A conta do período" subtitulo="As vendas conferidas com os pagamentos, o caixa e o estoque" icone={Scale}>
        <Aviso tom="aviso">Não deu para conferir a conta do período agora. Os números desta tela continuam valendo; abra de novo daqui a pouco.</Aviso>
      </Cartao>
    );
  }
  return (
    <Cartao titulo="A conta do período" subtitulo="As vendas concluídas no período e o que foi desfeito nele, conferidos um a um com os pagamentos, o livro do caixa e o livro do estoque" icone={Scale}>
      <ContaDasVendas c={leitura.dados} />
      {desfeito === null ? (
        // Sem a função no banco: o limite da conta fica dito, para ninguém ler "fecha" como "tudo conferido".
        leitura.dados.vendas > 0 && (
          <p className="mt-3 text-xs text-suave">
            Esta conta confere o que cada venda gravou ao ser concluída. O que foi desfeito depois (cancelamento e devolução) está no resumo e nos registros desta tela; o estoque que voltou e o dinheiro devolvido ainda não são conferidos aqui.
          </p>
        )
      ) : (
        <div className="mt-4 border-t border-borda/70 pt-4">
          <h3 className="mb-2 text-sm font-semibold">O que foi desfeito no período</h3>
          {desfeito.estado === "ok"
            ? <ContaDoDesfeito d={desfeito.dados} />
            : <Aviso tom="aviso">Não deu para conferir o que foi desfeito agora. A conta das vendas acima continua valendo; abra de novo daqui a pouco.</Aviso>}
          <p className="mt-3 text-xs text-suave">
            As duas contas conferem o que o sistema registrou: a de cima, o que cada venda gravou ao ser concluída; a de baixo, cada cancelamento e cada devolução, na data deles. O que caiu no banco é outra conferência: a conciliação com o extrato, em Gestão › Conciliação de pagamentos.
          </p>
        </div>
      )}
    </Cartao>
  );
}

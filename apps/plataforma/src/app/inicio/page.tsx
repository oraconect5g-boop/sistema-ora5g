import { ArrowRightLeft, BadgePercent, ChartColumn, FileText, RadioTower, RotateCcw, Undo2, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Icone } from "../../componentes/Icone";
import { MoldeReal, permissoesDoMenu } from "../../componentes/MoldeReal";
import { Aviso, Cartao, TituloPagina } from "../../componentes/ui";
import { montarMenu, PAGINAS_REAIS, podeVerFinanceiro } from "../../lib/acesso/menu";
import { horaDoFimDoTurno } from "../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { consultarPainel } from "../../lib/financeiro/consulta";
import { janelasDoPeriodo, resumoDoPainel } from "../../lib/financeiro/painel";
import { brl, brlCompacto, numero } from "../../lib/formato";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

type Pendencia = { rotulo: string; detalhe: string; href: string; icone: LucideIcon; quantidade: number };
const CABECA = { count: "exact", head: true } as const;

// Início real (revisão de 10/11/2026): o que espera a pessoa nesta loja e os atalhos do mesmo menu
// das outras telas. Cada contagem só é feita para quem tem a permissão; o RLS confere de novo.
export default async function Inicio() {
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const [permissoes, perfil] = await Promise.all([
    permissoesDoMenu(supabase, unidade),
    supabase.from("perfis_usuario").select("nome").eq("id", usuario.id).maybeSingle(),
  ]);
  if (perfil.error) throw new FalhaDoServico("inicio");
  const gestao = permissoes.has("venda.ver_unidade");
  const [aprovacoes, notas, caixas, transferencias, connect, estornos, retornos] = await Promise.all([
    permissoes.has("desconto.aprovar") ? supabase.from("aprovacoes_desconto").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "pendente") : null,
    permissoes.has("nota.aprovar") ? supabase.from("notas_pedidos").select("id", CABECA).eq("unidade_id", unidade).in("situacao", ["aguardando_aprovacao", "aprovada"]) : null,
    permissoes.has("caixa.conferir") ? supabase.from("caixas").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "fechado") : null,
    permissoes.has("estoque.consultar")
      ? supabase.from("transferencias").select("id", CABECA).or(`and(origem_id.eq.${unidade},situacao.in.(solicitada,separada)),and(destino_id.eq.${unidade},situacao.eq.enviada)`)
      : null,
    permissoes.has("connect.gerir") ? supabase.from("connect_operacoes").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "resultado_desconhecido") : null,
    gestao ? supabase.from("estornos_externos").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "pendente") : null,
    gestao ? supabase.from("venda_retornos").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "pendente") : null,
  ]);
  const respostas = [aprovacoes, notas, caixas, transferencias, connect, estornos, retornos];
  if (respostas.some((r) => r?.error)) throw new FalhaDoServico("inicio_pendencias");
  const quantos = (r: (typeof respostas)[number]) => r?.count ?? 0;
  const pendencias: Pendencia[] = [
    aprovacoes && { rotulo: "Descontos para aprovar", detalhe: "pedidos dos vendedores", href: "/aprovacoes", icone: BadgePercent, quantidade: quantos(aprovacoes) },
    notas && { rotulo: "Notas na fila", detalhe: "aprovar ou registrar a chave", href: "/notas", icone: FileText, quantidade: quantos(notas) },
    caixas && { rotulo: "Caixas para conferir", detalhe: "fechados, à espera de outra pessoa", href: "/caixa", icone: Wallet, quantidade: quantos(caixas) },
    transferencias && { rotulo: "Transferências", detalhe: "separar, enviar ou receber", href: "/transferencias", icone: ArrowRightLeft, quantidade: quantos(transferencias) },
    connect && { rotulo: "Ora Connect a decidir", detalhe: "resultado desconhecido da operadora", href: "/connect", icone: RadioTower, quantidade: quantos(connect) },
    estornos && { rotulo: "Estornos a confirmar", detalhe: "cartão, Pix ou financeira", href: "/vendas?situacao=canceladas&periodo=30", icone: RotateCcw, quantidade: quantos(estornos) },
    retornos && { rotulo: "Itens a conferir", detalhe: "voltaram de venda cancelada", href: "/vendas?situacao=canceladas&periodo=30", icone: Undo2, quantidade: quantos(retornos) },
  ].filter((p): p is Pendencia => Boolean(p));
  // Resumo financeiro de hoje (#65) para quem vê as vendas da loja ou da rede; o mesmo cálculo do /financeiro.
  const painelDeHoje = podeVerFinanceiro(permissoes) ? await consultarPainel(supabase, janelasDoPeriodo("hoje").atual, unidade, false) : null;
  const financeiro = painelDeHoje && painelDeHoje !== "indisponivel" ? resumoDoPainel(painelDeHoje) : painelDeHoje;
  const fim = horaDoFimDoTurno(situacao.turno_termina_em);
  const atalhos = montarMenu(permissoes).visiveis.filter((p) => p !== "inicio");

  return (
    <MoldeReal sessao={sessao} permissoes={permissoes} largura="max-w-4xl">
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo={`Olá, ${perfil.data?.nome ?? "bem-vindo"}`} subtitulo={fim ? `Turno até ${fim}. Para trabalhar em outra loja, toque no nome da loja no topo.` : undefined} />
      {pendencias.length > 0 && (
        <section aria-label="O que espera você" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pendencias.map((p) => (
            <Link key={p.rotulo} href={p.href} className={`rounded-cartao border bg-superficie p-4 shadow-cartao hover:border-borda-forte ${p.quantidade > 0 ? "border-aviso/40" : "border-borda"}`}>
              <span className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-medium text-suave">{p.rotulo}</span>
                <p.icone aria-hidden className="size-4 shrink-0 text-acao" />
              </span>
              <span className="numeros mt-1 block text-[26px] font-bold leading-tight">{p.quantidade}</span>
              <span className="block text-xs text-suave">{p.detalhe}</span>
            </Link>
          ))}
        </section>
      )}
      {financeiro && (
        <Cartao
          titulo="Financeiro de hoje"
          subtitulo="Somado no banco, nesta loja. Pagamento registrado não é dinheiro liquidado"
          icone={ChartColumn}
          acao={<Link href="/financeiro" className="text-sm font-semibold text-acao hover:underline">Abrir o financeiro</Link>}
        >
          {financeiro === "indisponivel" ? (
            <p className="text-sm text-suave">Indisponível neste ambiente: o banco ainda não tem a leitura agregada do financeiro.</p>
          ) : (
            <dl className="grid grid-cols-3 gap-3">
              {([
                ["Vendas concluídas", brlCompacto(financeiro.vendido), `${numero(financeiro.vendas)} venda${financeiro.vendas === 1 ? "" : "s"}`],
                ["Devoluções e cancelamentos", brl(financeiro.devolvido + financeiro.cancelado), `${numero(financeiro.devolucoes + financeiro.cancelamentos)} registro${financeiro.devolucoes + financeiro.cancelamentos === 1 ? "" : "s"}`],
                ["Recebido na loja", brlCompacto(financeiro.recebido), "registro, troco descontado"],
              ] as const).map(([rotulo, valor, detalhe]) => (
                <div key={rotulo} className="min-w-0">
                  <dt className="text-[13px] font-medium leading-tight text-suave">{rotulo}</dt>
                  <dd className="numeros mt-1 break-words text-lg font-extrabold tracking-tight sm:text-xl">{valor}</dd>
                  <dd className="text-xs text-suave">{detalhe}</dd>
                </div>
              ))}
            </dl>
          )}
        </Cartao>
      )}
      <Cartao titulo="Atalhos">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {atalhos.map((p) => (
            <Link key={p} href={PAGINAS_REAIS[p].caminho} className="flex min-h-12 items-center gap-3 rounded-xl border border-borda px-3 text-sm font-medium hover:bg-slate-50">
              <Icone nome={PAGINAS_REAIS[p].icone} className="size-5 text-acao" /> {PAGINAS_REAIS[p].titulo}
            </Link>
          ))}
        </div>
      </Cartao>
      <Aviso tom="info">Telas reais, com os dados da loja do turno. A demonstração continua separada, em /demo, só com dados fictícios.</Aviso>
    </MoldeReal>
  );
}

import {
  AlarmClock, ArrowRightLeft, BadgePercent, Banknote, FileClock, FileText, Gift, PackageCheck, RadioTower, ReceiptText, RotateCcw, Scale, SignalZero, Undo2, Wallet, Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Icone } from "../../componentes/Icone";
import { MoldeReal, permissoesDoMenu } from "../../componentes/MoldeReal";
import { Aviso, Cartao, TituloPagina } from "../../componentes/ui";
import { montarMenu, PAGINAS_REAIS } from "../../lib/acesso/menu";
import { horaDoFimDoTurno } from "../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { tabelaAusente } from "../../lib/caixa/saidas";
import { hojeEmSaoPaulo } from "../../lib/contas-a-pagar/regras";
import type { LojaDoFiltro } from "../../lib/financeiro/escopo";
import { periodoFinanceiro } from "../../lib/financeiro/painel";
import { janelasDosAlertas } from "../../lib/inicio/alertas";
import { lerPaineisDoInicio, permissoesDoInicio } from "../../lib/inicio/consulta";
import { visaoDoInicio } from "../../lib/inicio/painel";
import { textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { ConteudoInicio } from "./ConteudoInicio";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

type Parametros = { periodo?: ValorDeParametro; loja?: ValorDeParametro };
type Pendencia = { rotulo: string; detalhe: string; href: string; icone: LucideIcon; quantidade: number };
const CABECA = { count: "exact", head: true } as const;

// Início real: o que espera a pessoa nesta loja (revisão de 10/11/2026), os painéis de vendas do
// período (lote G1) e os atalhos do mesmo menu das outras telas. Cada contagem só é feita para quem
// tem a permissão; o RLS confere de novo. Os painéis seguem a visão de quem pede: a rede para quem
// tem venda.ver_todas, a loja do turno para quem tem venda.ver_unidade e só as próprias vendas para
// quem tem venda.ver_propria. Os números são somados no banco (vendas_painel e financeiro_painel);
// nada aqui vem da demonstração.
export default async function Inicio({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const turno: LojaDoFiltro = { id: unidade, nome: situacao.unidade_nome ?? "Loja do turno" };
  const [permissoes, inicio, perfil] = await Promise.all([
    permissoesDoMenu(supabase, unidade),
    permissoesDoInicio(supabase, unidade),
    supabase.from("perfis_usuario").select("nome").eq("id", usuario.id).maybeSingle(),
  ]);
  if (perfil.error) throw new FalhaDoServico("inicio");
  const gestao = permissoes.has("venda.ver_unidade");
  const visao = visaoDoInicio({ verTodas: permissoes.has("venda.ver_todas"), verUnidade: gestao, verPropria: inicio.propria });
  const recebeAparelho = permissoes.has("os.abrir") || permissoes.has("os.gerir");
  // Alertas (REPORT-007, L12f): janelas fixas, contadas a partir de agora.
  const { haSeteDias, haUmDia } = janelasDosAlertas();
  const [aprovacoes, notas, caixas, saidasDoBanco, contasDoBanco, fechamentosDoBanco, transferencias, connect, estornos, retornos, atrasadasDoBanco, prontasDoBanco, doTecnicoDoBanco,
    caixasComDiferenca, notasParadas, ativacoesComFalha, paineis] = await Promise.all([
    permissoes.has("desconto.aprovar") ? supabase.from("aprovacoes_desconto").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "pendente") : null,
    permissoes.has("nota.aprovar") ? supabase.from("notas_pedidos").select("id", CABECA).eq("unidade_id", unidade).in("situacao", ["aguardando_aprovacao", "aprovada"]) : null,
    permissoes.has("caixa.conferir") ? supabase.from("caixas").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "fechado") : null,
    // Saídas do caixa (L7c) que outra pessoa pediu: quem pediu não autoriza a própria.
    permissoes.has("caixa.conferir") ? supabase.from("caixa_saidas").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "pendente").neq("pedida_por", usuario.id) : null,
    // Contas a pagar (L8a) vencidas ou para hoje: as que a pessoa gere (o RLS dá ao dono a rede e todas as lojas; ao gerente, a loja dele).
    permissoes.has("conta_pagar.gerir") ? supabase.from("contas_a_pagar").select("id", CABECA).eq("situacao", "aberta").lte("vencimento", hojeEmSaoPaulo()) : null,
    // Fechamentos do bônus (L9b) enviados pela gerência, à espera do dono (o RLS dá a ele as lojas da rede).
    permissoes.has("bonus.aprovar") ? supabase.from("bonus_fechamentos").select("id", CABECA).eq("situacao", "enviado") : null,
    permissoes.has("estoque.consultar")
      ? supabase.from("transferencias").select("id", CABECA).or(`and(origem_id.eq.${unidade},situacao.in.(solicitada,separada)),and(destino_id.eq.${unidade},situacao.eq.enviada)`)
      : null,
    permissoes.has("connect.gerir") ? supabase.from("connect_operacoes").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "resultado_desconhecido") : null,
    gestao ? supabase.from("estornos_externos").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "pendente") : null,
    gestao ? supabase.from("venda_retornos").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "pendente") : null,
    // Assistência (L12f): as OS atrasadas e as prontas para entregar (o RLS dá à loja as dela e ao dono as da rede); ao
    // técnico, as que estão com ele esperando o orçamento ou o conserto.
    recebeAparelho ? supabase.from("ordens_servico").select("id", CABECA).eq("situacao", "aberta").lt("prazo", hojeEmSaoPaulo()) : null,
    recebeAparelho ? supabase.from("ordens_servico").select("id", CABECA).eq("situacao", "aberta").eq("local", "loja").eq("servico", "concluido") : null,
    permissoes.has("os.orcar")
      ? supabase.from("ordens_servico").select("id", CABECA).eq("situacao", "aberta").eq("local", "com_tecnico").in("servico", ["aguardando_orcamento", "aprovado"])
      : null,
    // Alertas da loja do turno (REPORT-007): caixa fechado com diferença nos últimos 7 dias, nota na fila há mais de um
    // dia e ativação ou portabilidade recusada, negada ou com erro da operadora nos últimos 7 dias.
    permissoes.has("caixa.conferir") ? supabase.from("caixas").select("id", CABECA).eq("unidade_id", unidade).neq("diferenca_centavos", 0).gte("fechado_em", haSeteDias) : null,
    permissoes.has("nota.aprovar")
      ? supabase.from("notas_pedidos").select("id", CABECA).eq("unidade_id", unidade).in("situacao", ["aguardando_aprovacao", "correcao_solicitada", "aprovada"]).lt("criado_em", haUmDia)
      : null,
    permissoes.has("connect.gerir")
      ? supabase.from("connect_operacoes").select("id", CABECA).eq("unidade_id", unidade).in("tipo", ["ativacao", "portabilidade"])
        .in("situacao", ["recusada", "negada", "erro_operadora"]).gte("atualizado_em", haSeteDias)
      : null,
    // Os painéis não derrubam a página: cada leitura volta com o próprio estado (ok, indisponível ou falha).
    lerPaineisDoInicio(supabase, { visao, periodo: periodoFinanceiro(textoDoParametro(parametros.periodo)), loja: textoDoParametro(parametros.loja), turno, usuario: usuario.id, ranking: inicio.ranking, custo: inicio.custo,
      metas: { gestao: permissoes.has("metas.gerir") || permissoes.has("metas.ver_unidade"), propria: permissoes.has("metas.ver_propria") } }),
  ]);
  // Banco ainda sem a migration do L7c, do L8a ou do L9b (tabela ausente): a pendência some e o resto do Início segue.
  // A contagem só de cabeçalho (HEAD) numa tabela ausente volta 404 sem corpo, que o cliente do Supabase
  // entrega SEM erro e sem número: contagem sem número também tira a pendência, em vez de mostrar zero.
  const semNumero = <T extends { error: { code?: string } | null; count: number | null }>(r: T | null) => (r && (tabelaAusente(r.error) || (!r.error && r.count === null)) ? null : r);
  const saidas = semNumero(saidasDoBanco);
  const contasAPagar = semNumero(contasDoBanco);
  const fechamentos = semNumero(fechamentosDoBanco);
  // A assistência num banco ainda sem a OS (L12a) ou sem o andamento do serviço (L12b): a pendência some.
  const semAssistencia = <T extends { error: { code?: string } | null; count: number | null }>(r: T | null) =>
    (r && (["42703", "PGRST204"].includes(r.error?.code ?? "") ? null : semNumero(r)));
  const osAtrasadas = semAssistencia(atrasadasDoBanco);
  const osProntas = semAssistencia(prontasDoBanco);
  const osDoTecnico = semAssistencia(doTecnicoDoBanco);
  const respostas = [aprovacoes, notas, caixas, saidas, contasAPagar, fechamentos, transferencias, connect, estornos, retornos, osAtrasadas, osProntas, osDoTecnico,
    caixasComDiferenca, notasParadas, ativacoesComFalha];
  if (respostas.some((r) => r?.error)) throw new FalhaDoServico("inicio_pendencias");
  const quantos = (r: (typeof respostas)[number]) => r?.count ?? 0;
  const pendencias: Pendencia[] = [
    aprovacoes && { rotulo: "Descontos para aprovar", detalhe: "pedidos dos vendedores", href: "/aprovacoes", icone: BadgePercent, quantidade: quantos(aprovacoes) },
    notas && { rotulo: "Notas na fila", detalhe: "aprovar ou registrar a chave", href: "/notas", icone: FileText, quantidade: quantos(notas) },
    saidas && { rotulo: "Saídas do caixa", detalhe: "dinheiro da gaveta a autorizar", href: "/caixa#saidas", icone: Banknote, quantidade: quantos(saidas) },
    contasAPagar && { rotulo: "Contas a pagar", detalhe: "vencidas ou para hoje", href: "/contas-a-pagar", icone: ReceiptText, quantidade: quantos(contasAPagar) },
    fechamentos && { rotulo: "Bônus para aprovar", detalhe: "fechamentos enviados pela gerência", href: "/metas/fechamento", icone: Gift, quantidade: quantos(fechamentos) },
    caixas && { rotulo: "Caixas para conferir", detalhe: "fechados, à espera de outra pessoa", href: "/caixa", icone: Wallet, quantidade: quantos(caixas) },
    transferencias && { rotulo: "Transferências", detalhe: "separar, enviar ou receber", href: "/transferencias", icone: ArrowRightLeft, quantidade: quantos(transferencias) },
    connect && { rotulo: "Ora Connect a decidir", detalhe: "resultado desconhecido da operadora", href: "/connect", icone: RadioTower, quantidade: quantos(connect) },
    estornos && { rotulo: "Estornos a confirmar", detalhe: "cartão, Pix ou financeira", href: "/vendas?situacao=canceladas&periodo=30", icone: RotateCcw, quantidade: quantos(estornos) },
    retornos && { rotulo: "Itens a conferir", detalhe: "voltaram de venda cancelada", href: "/vendas?situacao=canceladas&periodo=30", icone: Undo2, quantidade: quantos(retornos) },
    osAtrasadas && { rotulo: "OS atrasadas", detalhe: "passaram do prazo com o cliente", href: "/assistencia", icone: AlarmClock, quantidade: quantos(osAtrasadas) },
    osProntas && { rotulo: "OS prontas", detalhe: "cobrar no PDV e entregar", href: "/assistencia?ver=prontas", icone: PackageCheck, quantidade: quantos(osProntas) },
    osDoTecnico && { rotulo: "OS para orçar ou consertar", detalhe: "aparelhos com você", href: "/assistencia?ver=fora", icone: Wrench, quantidade: quantos(osDoTecnico) },
    // Os alertas só aparecem quando há o que ver (zero não é pendência de ninguém).
    caixasComDiferenca && quantos(caixasComDiferenca) > 0 && { rotulo: "Caixas com diferença", detalhe: "fechados nos últimos 7 dias", href: "/caixa", icone: Scale, quantidade: quantos(caixasComDiferenca) },
    notasParadas && quantos(notasParadas) > 0 && { rotulo: "Notas paradas", detalhe: "na fila há mais de um dia", href: "/notas", icone: FileClock, quantidade: quantos(notasParadas) },
    ativacoesComFalha && quantos(ativacoesComFalha) > 0 && { rotulo: "Ativações com falha", detalhe: "recusadas ou com erro, em 7 dias", href: "/connect", icone: SignalZero, quantidade: quantos(ativacoesComFalha) },
  ].filter((p): p is Pendencia => Boolean(p));
  const fim = horaDoFimDoTurno(situacao.turno_termina_em);
  const atalhos = montarMenu(permissoes).visiveis.filter((p) => p !== "inicio");

  return (
    <MoldeReal sessao={sessao} permissoes={permissoes} largura="max-w-6xl">
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo={`Olá, ${perfil.data?.nome ?? "bem-vindo"}`} subtitulo={fim ? `Turno até ${fim}. Para trabalhar em outra loja, toque no nome da loja no topo.` : undefined} />
      {pendencias.length > 0 && (
        <section aria-label="O que espera você" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
      <ConteudoInicio paineis={paineis} usuario={usuario.id} turno={turno} conferenteDeCaixa={permissoes.has("caixa.conferir")} />
      <Cartao titulo="Atalhos">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {atalhos.map((p) => (
            <Link key={p} href={PAGINAS_REAIS[p].caminho} className="flex min-h-12 items-center gap-3 rounded-xl border border-borda px-3 text-sm font-medium hover:bg-slate-50">
              <Icone nome={PAGINAS_REAIS[p].icone} className="size-5 text-acao" /> {PAGINAS_REAIS[p].titulo}
            </Link>
          ))}
        </div>
      </Cartao>
      <Aviso tom="info">Telas reais, com os dados gravados no sistema. A demonstração continua separada, em /demo, só com dados fictícios.</Aviso>
    </MoldeReal>
  );
}

// O que espera a pessoa na loja do turno (Início, revisão de 10/11/2026; alertas do REPORT-007, L12f e L10b): uma
// leitura só, usada pelo Início e pelo sino do topo de todas as telas (G6). Cada contagem só é feita para quem tem a
// permissão; o RLS confere de novo. Erro de leitura derruba quem pediu (zero inventado não); tabela, coluna ou função
// que o banco ainda não tem (migration não aplicada) tira só a pendência dela.
import type { obterSessao } from "../acesso/sessao";
import { FalhaDoServico } from "../acesso/sessao";
import { tabelaAusente } from "../caixa/saidas";
import { hojeEmSaoPaulo } from "../contas-a-pagar/regras";
import { divergenciasAbertas, enderecoDaConciliacao, intervaloDoPeriodo } from "../notas/conciliacao";
import { janelasDosAlertas } from "./alertas";
import type { NomeDoIconeDaPendencia } from "./icones-das-pendencias";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

/** Uma pendência: o que é, quantas, para onde levar. Os alertas só existem quando há o que ver. */
export type Pendencia = { rotulo: string; detalhe: string; href: string; icone: NomeDoIconeDaPendencia; quantidade: number; alerta: boolean };

const CABECA = { count: "exact", head: true } as const;

export async function lerPendencias(supabase: Cliente, { usuario, unidade, permissoes }: { usuario: string; unidade: string; permissoes: ReadonlySet<string> }): Promise<Pendencia[]> {
  const gestao = permissoes.has("venda.ver_unidade");
  const recebeAparelho = permissoes.has("os.abrir") || permissoes.has("os.gerir");
  // Alertas (REPORT-007, L12f): janelas fixas, contadas a partir de agora.
  const { haSeteDias, haUmDia } = janelasDosAlertas();
  // Divergências das notas (L10b) ainda não conferidas, da loja do turno, nos últimos 90 dias.
  const noventaDias = intervaloDoPeriodo("noventa_dias", hojeEmSaoPaulo());
  const [aprovacoes, notas, caixas, saidasDoBanco, contasDoBanco, fechamentosDoBanco, transferencias, connect, estornos, retornos, atrasadasDoBanco, prontasDoBanco, doTecnicoDoBanco,
    caixasComDiferenca, notasParadas, ativacoesComFalha, divergenciasDasNotas] = await Promise.all([
    permissoes.has("desconto.aprovar") ? supabase.from("aprovacoes_desconto").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "pendente") : null,
    permissoes.has("nota.aprovar") ? supabase.from("notas_pedidos").select("id", CABECA).eq("unidade_id", unidade).in("situacao", ["aguardando_aprovacao", "aprovada"]) : null,
    permissoes.has("caixa.conferir") ? supabase.from("caixas").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "fechado") : null,
    // Saídas do caixa (L7c) que outra pessoa pediu: quem pediu não autoriza a própria.
    permissoes.has("caixa.conferir") ? supabase.from("caixa_saidas").select("id", CABECA).eq("unidade_id", unidade).eq("situacao", "pendente").neq("pedida_por", usuario) : null,
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
    // Sem a função no banco (migration do L10b ainda não aplicada), o alerta some; outro erro derruba quem pediu.
    permissoes.has("nota.aprovar")
      ? divergenciasAbertas(supabase, unidade, noventaDias.inicio, noventaDias.fim).catch(() => { throw new FalhaDoServico("inicio_divergencias"); })
      : null,
  ]);
  // Banco ainda sem a migration do L7c, do L8a ou do L9b (tabela ausente): a pendência some e o resto segue.
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
  const pendencia = (rotulo: string, detalhe: string, href: string, icone: NomeDoIconeDaPendencia, quantidade: number, alerta = false): Pendencia =>
    ({ rotulo, detalhe, href, icone, quantidade, alerta });
  return [
    aprovacoes && pendencia("Descontos para aprovar", "pedidos dos vendedores", "/aprovacoes", "desconto", quantos(aprovacoes)),
    notas && pendencia("Notas na fila", "aprovar ou registrar a chave", "/notas", "nota", quantos(notas)),
    saidas && pendencia("Saídas do caixa", "dinheiro da gaveta a autorizar", "/caixa#saidas", "saida_do_caixa", quantos(saidas)),
    contasAPagar && pendencia("Contas a pagar", "vencidas ou para hoje", "/contas-a-pagar", "conta_a_pagar", quantos(contasAPagar)),
    fechamentos && pendencia("Bônus para aprovar", "fechamentos enviados pela gerência", "/metas/fechamento", "bonus", quantos(fechamentos)),
    caixas && pendencia("Caixas para conferir", "fechados, à espera de outra pessoa", "/caixa", "caixa", quantos(caixas)),
    transferencias && pendencia("Transferências", "separar, enviar ou receber", "/transferencias", "transferencia", quantos(transferencias)),
    connect && pendencia("Ora Connect a decidir", "resultado desconhecido da operadora", "/connect", "operadora", quantos(connect)),
    estornos && pendencia("Estornos a confirmar", "cartão, Pix ou financeira", "/vendas?situacao=canceladas&periodo=30", "estorno", quantos(estornos)),
    retornos && pendencia("Itens a conferir", "voltaram de venda cancelada", "/vendas?situacao=canceladas&periodo=30", "retorno", quantos(retornos)),
    osAtrasadas && pendencia("OS atrasadas", "passaram do prazo com o cliente", "/assistencia", "os_atrasada", quantos(osAtrasadas)),
    osProntas && pendencia("OS prontas", "cobrar no PDV e entregar", "/assistencia?ver=prontas", "os_pronta", quantos(osProntas)),
    osDoTecnico && pendencia("OS para orçar ou consertar", "aparelhos com você", "/assistencia?ver=fora", "os_do_tecnico", quantos(osDoTecnico)),
    // Os alertas só aparecem quando há o que ver (zero não é pendência de ninguém).
    caixasComDiferenca && quantos(caixasComDiferenca) > 0 && pendencia("Caixas com diferença", "fechados nos últimos 7 dias", "/caixa", "caixa_com_diferenca", quantos(caixasComDiferenca), true),
    notasParadas && quantos(notasParadas) > 0 && pendencia("Notas paradas", "na fila há mais de um dia", "/notas", "nota_parada", quantos(notasParadas), true),
    ativacoesComFalha && quantos(ativacoesComFalha) > 0 && pendencia("Ativações com falha", "recusadas ou com erro, em 7 dias", "/connect", "ativacao_com_falha", quantos(ativacoesComFalha), true),
    divergenciasDasNotas !== null && divergenciasDasNotas > 0
      && pendencia("Notas com divergência", "a conferir, em 90 dias", enderecoDaConciliacao("noventa_dias", unidade), "nota_com_divergencia", divergenciasDasNotas, true),
  ].filter((p): p is Pendencia => Boolean(p));
}

// O que espera a pessoa na loja do turno (Início, revisão de 10/11/2026; alertas do REPORT-007, L12f e L10b): uma
// leitura só, usada pelo Início e pelo sino do topo de todas as telas (G6). Cada contagem só é feita para quem tem a
// permissão; o RLS confere de novo. Erro de leitura derruba quem pediu (zero inventado não); tabela, coluna ou função
// que o banco ainda não tem (migration não aplicada) tira só a pendência dela.
//
// VEL-c (ADR-010; a orientação de 18/11: sem remover RLS e sem guardar permissão entre pessoas): as 16 contagens vêm
// numa ida só (public.pendencias_da_loja), com a permissão de cada fila conferida no banco pela mesma tem_permissao.
// Banco ainda sem a função: as contagens uma a uma, como antes.
import type { obterSessao } from "../acesso/sessao";
import { FalhaDoServico } from "../acesso/sessao";
import { tabelaAusente } from "../caixa/saidas";
import { hojeEmSaoPaulo } from "../contas-a-pagar/regras";
import { RespostaInesperada } from "../financeiro/painel";
import { contagem, ehObjeto } from "../leitura-do-banco";
import { divergenciasAbertas, enderecoDaConciliacao, intervaloDoPeriodo } from "../notas/conciliacao";
import { janelasDosAlertas } from "./alertas";
import type { NomeDoIconeDaPendencia } from "./icones-das-pendencias";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

/** Uma pendência: o que é, quantas, para onde levar. Os alertas só existem quando há o que ver. */
export type Pendencia = { rotulo: string; detalhe: string; href: string; icone: NomeDoIconeDaPendencia; quantidade: number; alerta: boolean };

/** As contagens da loja do turno, com os nomes da public.pendencias_da_loja. */
export const CHAVES_DAS_CONTAGENS = [
  "aprovacoes", "notas", "notas_paradas", "caixas", "saidas", "caixas_com_diferenca", "contas_a_pagar", "fechamentos", "transferencias",
  "connect", "ativacoes_com_falha", "estornos", "retornos", "os_atrasadas", "os_prontas", "os_do_tecnico",
  // FIN-007b: só pela função (o caminho uma a uma, de banco antigo, não as traz: a pendência não aparece).
  "repasses_atrasados", "cobrancas_a_retomar",
] as const;
export type ChaveDaContagem = (typeof CHAVES_DAS_CONTAGENS)[number];
/** Ausente: sem a permissão da fila (ou, no caminho antigo, sem a tabela no banco): a pendência não aparece. */
export type Contagens = Partial<Record<ChaveDaContagem, number>>;

const CABECA = { count: "exact", head: true } as const;
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

/**
 * A resposta da public.pendencias_da_loja, conferida: um objeto em que cada chave conhecida é uma contagem (inteiro, nunca
 * negativo). Forma inesperada é falha de leitura, nunca zero; chave desconhecida é ignorada.
 */
export function lerContagens(dado: unknown): Contagens {
  if (!ehObjeto(dado)) throw new RespostaInesperada("pendencias_da_loja");
  const contagens: Contagens = {};
  for (const chave of CHAVES_DAS_CONTAGENS) {
    if (Object.hasOwn(dado, chave)) contagens[chave] = contagem(dado, chave);
  }
  return contagens;
}

export async function lerPendencias(supabase: Cliente, { usuario, unidade, permissoes }: { usuario: string; unidade: string; permissoes: ReadonlySet<string> }): Promise<Pendencia[]> {
  // Divergências das notas (L10b) ainda não conferidas, da loja do turno, nos últimos 90 dias: a outra ida, ao mesmo tempo.
  const noventaDias = intervaloDoPeriodo("noventa_dias", hojeEmSaoPaulo());
  const [numaIda, divergenciasDasNotas] = await Promise.all([
    supabase.rpc("pendencias_da_loja"),
    // Sem a função no banco (migration do L10b ainda não aplicada), o alerta some; outro erro derruba quem pediu.
    permissoes.has("nota.aprovar")
      ? divergenciasAbertas(supabase, unidade, noventaDias.inicio, noventaDias.fim).catch(() => { throw new FalhaDoServico("inicio_divergencias"); })
      : null,
  ]);
  let contagens: Contagens;
  if (numaIda.error) {
    if (!FUNCAO_AUSENTE.has(numaIda.error.code)) throw new FalhaDoServico("inicio_pendencias");
    contagens = await contagensUmaAUma(supabase, { usuario, unidade, permissoes });
  } else {
    try {
      contagens = lerContagens(numaIda.data);
    } catch {
      throw new FalhaDoServico("inicio_pendencias");
    }
  }
  return montarPendencias(contagens, divergenciasDasNotas, unidade);
}

/** As pendências na ordem de sempre; os alertas só quando há o que ver (zero não é pendência de ninguém). */
export function montarPendencias(c: Contagens, divergenciasDasNotas: number | null, unidade: string): Pendencia[] {
  const pendencia = (chave: ChaveDaContagem, rotulo: string, detalhe: string, href: string, icone: NomeDoIconeDaPendencia): Pendencia | null => {
    const quantidade = c[chave];
    return quantidade === undefined ? null : { rotulo, detalhe, href, icone, quantidade, alerta: false };
  };
  const alerta = (chave: ChaveDaContagem, rotulo: string, detalhe: string, href: string, icone: NomeDoIconeDaPendencia): Pendencia | null => {
    const quantidade = c[chave];
    return quantidade === undefined || quantidade === 0 ? null : { rotulo, detalhe, href, icone, quantidade, alerta: true };
  };
  return [
    pendencia("aprovacoes", "Descontos para aprovar", "pedidos dos vendedores", "/aprovacoes", "desconto"),
    pendencia("notas", "Notas na fila", "aprovar ou registrar a chave", "/notas", "nota"),
    pendencia("saidas", "Saídas do caixa", "dinheiro da gaveta a autorizar", "/caixa#saidas", "saida_do_caixa"),
    pendencia("contas_a_pagar", "Contas a pagar", "vencidas ou para hoje", "/contas-a-pagar", "conta_a_pagar"),
    pendencia("fechamentos", "Bônus para aprovar", "fechamentos enviados pela gerência", "/metas/fechamento", "bonus"),
    pendencia("caixas", "Caixas para conferir", "fechados, à espera de outra pessoa", "/caixa", "caixa"),
    // TRF-e: a conta do banco inclui a recebida com falta sem o destino do que faltou (para a origem e para o destino).
    pendencia("transferencias", "Transferências", "separar, enviar, receber ou dar destino ao que faltou", "/transferencias", "transferencia"),
    pendencia("connect", "Ora Connect a decidir", "resultado desconhecido da operadora", "/connect", "operadora"),
    pendencia("estornos", "Estornos a confirmar", "cartão, Pix ou financeira", "/vendas?situacao=canceladas&periodo=30", "estorno"),
    pendencia("retornos", "Itens a conferir", "voltaram de venda cancelada", "/vendas?situacao=canceladas&periodo=30", "retorno"),
    pendencia("os_atrasadas", "OS atrasadas", "passaram do prazo com o cliente", "/assistencia", "os_atrasada"),
    pendencia("os_prontas", "OS prontas", "cobrar no PDV e entregar", "/assistencia?ver=prontas", "os_pronta"),
    pendencia("os_do_tecnico", "OS para orçar ou consertar", "aparelhos com você", "/assistencia?ver=fora", "os_do_tecnico"),
    alerta("caixas_com_diferenca", "Caixas com diferença", "fechados nos últimos 7 dias", "/caixa", "caixa_com_diferenca"),
    alerta("notas_paradas", "Notas paradas", "na fila há mais de um dia", "/notas", "nota_parada"),
    alerta("ativacoes_com_falha", "Ativações com falha", "recusadas ou com erro, em 7 dias", "/connect", "ativacao_com_falha"),
    // FIN-007b: para quem concilia na loja. Sem prazo de repasse gravado, o banco não conta atraso nenhum.
    alerta("repasses_atrasados", "Repasses atrasados", "financeiras que passaram do prazo", "/pagamentos/financeiras", "repasse_atrasado"),
    alerta("cobrancas_a_retomar", "Cobranças a retomar", "chegou o dia de voltar à financeira", "/pagamentos/financeiras", "cobranca_a_retomar"),
    divergenciasDasNotas !== null && divergenciasDasNotas > 0
      ? { rotulo: "Notas com divergência", detalhe: "a conferir, em 90 dias", href: enderecoDaConciliacao("noventa_dias", unidade), icone: "nota_com_divergencia", quantidade: divergenciasDasNotas, alerta: true } satisfies Pendencia
      : null,
  ].filter((p): p is Pendencia => p !== null);
}

/** O caminho de antes do VEL-c (banco ainda sem a public.pendencias_da_loja): uma contagem por fila, ao mesmo tempo. */
async function contagensUmaAUma(supabase: Cliente, { usuario, unidade, permissoes }: { usuario: string; unidade: string; permissoes: ReadonlySet<string> }): Promise<Contagens> {
  const gestao = permissoes.has("venda.ver_unidade");
  const recebeAparelho = permissoes.has("os.abrir") || permissoes.has("os.gerir");
  // Alertas (REPORT-007, L12f): janelas fixas, contadas a partir de agora.
  const { haSeteDias, haUmDia } = janelasDosAlertas();
  const [aprovacoes, notas, caixas, saidasDoBanco, contasDoBanco, fechamentosDoBanco, transferencias, connect, estornos, retornos, atrasadasDoBanco, prontasDoBanco, doTecnicoDoBanco,
    caixasComDiferenca, notasParadas, ativacoesComFalha] = await Promise.all([
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
  const lidas: Record<ChaveDaContagem, (typeof aprovacoes) | null> = {
    aprovacoes, notas, notas_paradas: notasParadas, caixas, saidas, caixas_com_diferenca: caixasComDiferenca, contas_a_pagar: contasAPagar,
    fechamentos, transferencias, connect, ativacoes_com_falha: ativacoesComFalha, estornos, retornos, os_atrasadas: semAssistencia(atrasadasDoBanco),
    os_prontas: semAssistencia(prontasDoBanco), os_do_tecnico: semAssistencia(doTecnicoDoBanco),
    // FIN-007b: o atraso do repasse depende do prazo em vigor (não é uma contagem simples de tabela): só a função conta.
    // Num banco sem ela, as duas pendências não aparecem (nunca zero inventado).
    repasses_atrasados: null, cobrancas_a_retomar: null,
  };
  if (Object.values(lidas).some((r) => r?.error)) throw new FalhaDoServico("inicio_pendencias");
  const contagens: Contagens = {};
  for (const chave of CHAVES_DAS_CONTAGENS) {
    const r = lidas[chave];
    if (r) contagens[chave] = r.count ?? 0;
  }
  return contagens;
}

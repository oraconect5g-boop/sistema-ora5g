// Financeiro real, primeira fatia (#65): contrato dos números do painel, sobre a leitura agregada
// public.financeiro_painel (soma do período inteiro no banco, com as regras de leitura de quem pede).
// Aqui só se lê a resposta, se separa cada fato e se montam as séries; nada vem da demonstração.
//
// Contrato (centavos inteiros; dia e hora de São Paulo; a loja é a da venda):
//   vendido      venda concluída no período, pela data de conclusão (mesmo se cancelada depois);
//   cancelado    venda já concluída e cancelada no período, pela data do cancelamento (o total);
//   devolvido    devolução registrada no período, pela data dela;
//   líquido      vendido − cancelado − devolvido (cada fato na sua data; nunca abatido duas vezes);
//   recebido     pagamentos CONFIRMADOS no registro local: meios sem financeira menos o troco, mais
//                as entradas de financiamento. Registro não é liquidação: não há conciliação com
//                extrato ainda. Vale-troca é crédito, não dinheiro: fica à parte;
//   a receber    parte financiada (PayJoy/Aiva) registrada no período, até a financeira pagar;
//   gaveta       movimentos em dinheiro do livro dos caixas. Fundo e suprimento não são receita;
//                sangria não é despesa; a saída autorizada (L7c) é despesa da loja paga com o
//                dinheiro da gaveta. Não é fluxo de caixa da empresa.
import { MEIOS, type MeioPagamento } from "@ora5g/dominio";

import { centavosDoBanco } from "../dinheiro";
import { inicioDoDiaEmSaoPaulo } from "../estoque/regras";

const DIA = 86_400_000;

export const PERIODOS_FINANCEIROS = {
  hoje: { rotulo: "Hoje", dias: 1, comparacao: "ontem até esta hora" },
  "7": { rotulo: "7 dias", dias: 7, comparacao: "os 7 dias anteriores" },
  "30": { rotulo: "30 dias", dias: 30, comparacao: "os 30 dias anteriores" },
} as const;
export type PeriodoFinanceiro = keyof typeof PERIODOS_FINANCEIROS;
export const ORDEM_DOS_PERIODOS: readonly PeriodoFinanceiro[] = ["hoje", "7", "30"];
export const periodoFinanceiro = (valor: unknown): PeriodoFinanceiro => (valor === "7" || valor === "30" ? valor : "hoje");

export type Janela = { inicio: Date; fim: Date };

/**
 * Os últimos `dias` dias (do começo do primeiro, em São Paulo, até agora) e o período anterior
 * equivalente: a mesma janela deslocada em dias inteiros, para comparar a mesma hora do dia.
 */
export function janelasDeDias(dias: number, agora: Date = new Date()): { atual: Janela; anterior: Janela } {
  const inicio = new Date(new Date(inicioDoDiaEmSaoPaulo(agora)).getTime() - (dias - 1) * DIA);
  const deslocamento = dias * DIA;
  return {
    atual: { inicio, fim: agora },
    anterior: { inicio: new Date(inicio.getTime() - deslocamento), fim: new Date(agora.getTime() - deslocamento) },
  };
}

/** As janelas de um período do financeiro; só "hoje" é lido hora a hora. */
export function janelasDoPeriodo(periodo: PeriodoFinanceiro, agora: Date = new Date()) {
  return { ...janelasDeDias(PERIODOS_FINANCEIROS[periodo].dias, agora), porHora: periodo === "hoje" };
}

// ---------------------------------------------------------------------------------------------
// Leitura da resposta do banco (formato de financeiro_painel); qualquer forma inesperada é erro.
// ---------------------------------------------------------------------------------------------
type Linha = Record<string, unknown>;
export class RespostaInesperada extends Error {}

const lista = (dado: unknown, campo: string): Linha[] => {
  const v = (dado as Linha | null)?.[campo];
  if (!Array.isArray(v) || v.some((l) => typeof l !== "object" || l === null)) throw new RespostaInesperada(campo);
  return v as Linha[];
};
const n = (l: Linha, campo: string) => centavosDoBanco(l[campo] ?? 0);
const t = (l: Linha, campo: string) => (typeof l[campo] === "string" ? (l[campo] as string) : null);

export type PainelDoBanco = {
  periodos: { periodo: string; vendas: number; vendido: number; cancelamentos: number; cancelado: number; devolucoes: number; devolvido: number }[];
  pagamentos: {
    meio: string; situacao: string; meioEntrada: string | null; quantidade: number; valor: number; entrada: number; troco: number;
    /** G2b: conciliação manual do grupo; null quando o banco ainda não tem a migration do G2b. */
    conciliacao: ConciliacaoDoGrupo | null;
  }[];
  reembolsos: { meio: string; quantidade: number; valor: number }[];
  estornos: { situacao: string; quantidade: number; valor: number }[];
  aReceber: { devedor: string; situacao: string; quantidade: number; valor: number }[];
  movimentos: { periodo: string; tipo: string; meio: string; quantidade: number; valor: number }[];
  caixas: { abertosAgora: number; fechados: number; conferidos: number; comDiferenca: number; diferenca: number; diferencaAbsoluta: number };
};

/** Quantos pagamentos do grupo já foram conciliados com o extrato, o valor deles e o líquido que caiu na conta. */
export type ConciliacaoDoGrupo = { conciliados: number; conciliado: number; liquido: number };
const CAMPOS_DA_CONCILIACAO = ["conciliados", "conciliado", "liquido"] as const;
function conciliacaoDoGrupo(l: Linha): ConciliacaoDoGrupo | null {
  const presentes = CAMPOS_DA_CONCILIACAO.filter((c) => Object.hasOwn(l, c));
  // Banco sem a migration do G2b: a conciliação fica indisponível, e o resto do financeiro continua.
  if (presentes.length === 0) return null;
  if (presentes.length < CAMPOS_DA_CONCILIACAO.length) throw new RespostaInesperada("conciliacao");
  const c = { conciliados: n(l, "conciliados"), conciliado: n(l, "conciliado"), liquido: n(l, "liquido") };
  // O líquido nunca passa do valor conciliado, nem o conciliado do total do grupo: conta que não fecha é falha.
  if (c.conciliados > n(l, "quantidade") || c.conciliado > n(l, "valor") || c.liquido > c.conciliado) throw new RespostaInesperada("conciliacao");
  return c;
}

export function lerPainel(dado: unknown): PainelDoBanco {
  const caixas = (dado as Linha | null)?.caixas;
  if (typeof caixas !== "object" || caixas === null) throw new RespostaInesperada("caixas");
  const c = caixas as Linha;
  return {
    periodos: lista(dado, "periodos").map((l) => ({
      periodo: t(l, "periodo") ?? "", vendas: n(l, "vendas"), vendido: n(l, "vendido"), cancelamentos: n(l, "cancelamentos"),
      cancelado: n(l, "cancelado"), devolucoes: n(l, "devolucoes"), devolvido: n(l, "devolvido"),
    })),
    pagamentos: lista(dado, "pagamentos").map((l) => ({
      meio: t(l, "meio") ?? "", situacao: t(l, "situacao") ?? "", meioEntrada: t(l, "meio_entrada"),
      quantidade: n(l, "quantidade"), valor: n(l, "valor"), entrada: n(l, "entrada"), troco: n(l, "troco"), conciliacao: conciliacaoDoGrupo(l),
    })),
    reembolsos: lista(dado, "reembolsos").map((l) => ({ meio: t(l, "meio") ?? "", quantidade: n(l, "quantidade"), valor: n(l, "valor") })),
    estornos: lista(dado, "estornos").map((l) => ({ situacao: t(l, "situacao") ?? "", quantidade: n(l, "quantidade"), valor: n(l, "valor") })),
    aReceber: lista(dado, "a_receber").map((l) => ({ devedor: t(l, "devedor") ?? "", situacao: t(l, "situacao") ?? "", quantidade: n(l, "quantidade"), valor: n(l, "valor") })),
    movimentos: lista(dado, "movimentos").map((l) => ({ periodo: t(l, "periodo") ?? "", tipo: t(l, "tipo") ?? "", meio: t(l, "meio") ?? "", quantidade: n(l, "quantidade"), valor: n(l, "valor") })),
    caixas: {
      abertosAgora: n(c, "abertos_agora"), fechados: n(c, "fechados"), conferidos: n(c, "conferidos"), comDiferenca: n(c, "com_diferenca"),
      diferenca: n(c, "diferenca"), diferencaAbsoluta: n(c, "diferenca_absoluta"),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Números do painel
// ---------------------------------------------------------------------------------------------
const nomeDoMeio = (meio: string) => (Object.hasOwn(MEIOS, meio) ? MEIOS[meio as MeioPagamento].nome : meio);
const FINANCEIRAS = new Set(["payjoy", "aiva"]);
const somar = <T>(itens: readonly T[], valor: (i: T) => number) => itens.reduce((s, i) => s + valor(i), 0);

export const NOMES_DOS_MOVIMENTOS: Record<string, string> = {
  fundo: "Fundo de abertura", suprimento: "Suprimento", recebimento: "Recebimentos em dinheiro",
  troco: "Troco", sangria: "Sangria", estorno: "Estornos e reembolsos",
  saida_autorizada: "Saídas autorizadas (despesas da loja)",
};

export type MeioRecebido = { meio: string; nome: string; valor: number; quantidade: number; entradas: number };

/** Os meios que se conciliam com o extrato: os mesmos de privado.meio_liquidavel (lote L7a), que pagamento_conciliar confere. */
export const MEIOS_CONCILIAVEIS: ReadonlySet<string> = new Set(["pix_direto", "pix_picpay", "cartao_picpay", "cartao_pagseguro"]);
type Conciliacao = { quantidade: number; valor: number; conciliados: number; conciliado: number; liquido: number };
export type MeioConciliado = Conciliacao & { meio: string; nome: string; aConciliar: number; pagamentosAConciliar: number; diferenca: number };
const completar = <T extends Conciliacao>(c: T) => ({ ...c, aConciliar: c.valor - c.conciliado, pagamentosAConciliar: c.quantidade - c.conciliados, diferenca: c.conciliado - c.liquido });

/**
 * P5 (G2b): a conciliação manual dos pagamentos de cartão e Pix que continuam confirmados (os mesmos do
 * recebido na loja). null: o banco ainda não tem a leitura (migration do G2b). A diferença entre o
 * conciliado e o líquido é a observada no extrato, não a taxa do contrato.
 */
export function conciliacaoDoPainel(p: PainelDoBanco) {
  if (p.pagamentos.some((x) => x.conciliacao === null)) return null;
  const confirmados = p.pagamentos.filter((x) => x.situacao === "confirmado");
  const porMeio = new Map<string, Conciliacao & { meio: string; nome: string }>();
  for (const x of confirmados) {
    if (!MEIOS_CONCILIAVEIS.has(x.meio) || !x.conciliacao) continue;
    const a = porMeio.get(x.meio) ?? { meio: x.meio, nome: nomeDoMeio(x.meio), quantidade: 0, valor: 0, conciliados: 0, conciliado: 0, liquido: 0 };
    porMeio.set(x.meio, {
      ...a, quantidade: a.quantidade + x.quantidade, valor: a.valor + x.valor,
      conciliados: a.conciliados + x.conciliacao.conciliados, conciliado: a.conciliado + x.conciliacao.conciliado, liquido: a.liquido + x.conciliacao.liquido,
    });
  }
  const meios: MeioConciliado[] = [...porMeio.values()].map(completar).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"));
  const total = completar({
    quantidade: somar(meios, (m) => m.quantidade), valor: somar(meios, (m) => m.valor),
    conciliados: somar(meios, (m) => m.conciliados), conciliado: somar(meios, (m) => m.conciliado), liquido: somar(meios, (m) => m.liquido),
  });
  // Entrada de financiamento paga em cartão ou Pix: está no recebido daquele meio, mas não se concilia
  // (fica dentro do pagamento da financeira). A tela diz quanto é, para os números baterem.
  const entradasForaDaConciliacao = somar(confirmados.filter((x) => FINANCEIRAS.has(x.meio) && MEIOS_CONCILIAVEIS.has(x.meioEntrada ?? "")), (x) => x.entrada);
  return { meios, total, entradasForaDaConciliacao };
}
export type ConciliacaoDoPeriodo = NonNullable<ReturnType<typeof conciliacaoDoPainel>>;

export function resumoDoPainel(p: PainelDoBanco) {
  const vendas = somar(p.periodos, (x) => x.vendas);
  const vendido = somar(p.periodos, (x) => x.vendido);
  const cancelamentos = somar(p.periodos, (x) => x.cancelamentos);
  const cancelado = somar(p.periodos, (x) => x.cancelado);
  const devolucoes = somar(p.periodos, (x) => x.devolucoes);
  const devolvido = somar(p.periodos, (x) => x.devolvido);

  // Recebido na loja (registro): só pagamentos que continuam confirmados.
  const confirmados = p.pagamentos.filter((x) => x.situacao === "confirmado");
  const porMeio = new Map<string, MeioRecebido>();
  const acumular = (meio: string, valor: number, quantidade: number, entradas: number) => {
    if (valor === 0 && quantidade === 0) return;
    const atual = porMeio.get(meio) ?? { meio, nome: nomeDoMeio(meio), valor: 0, quantidade: 0, entradas: 0 };
    porMeio.set(meio, { ...atual, valor: atual.valor + valor, quantidade: atual.quantidade + quantidade, entradas: atual.entradas + entradas });
  };
  let valeUsado = 0;
  const financiado = new Map<string, number>();
  for (const x of confirmados) {
    if (FINANCEIRAS.has(x.meio)) {
      if (x.entrada > 0) acumular(x.meioEntrada ?? "dinheiro", x.entrada, 0, x.entrada);
      financiado.set(x.meio, (financiado.get(x.meio) ?? 0) + x.valor - x.entrada);
    } else if (x.meio === "vale_troca") {
      valeUsado += x.valor;
    } else {
      acumular(x.meio, x.valor - x.troco, x.quantidade, 0);
    }
  }
  const meios = [...porMeio.values()].sort((a, b) => b.valor - a.valor);
  const recebido = somar(meios, (m) => m.valor);
  const desfeitos = p.pagamentos.filter((x) => x.situacao !== "confirmado");

  const movimentosPorTipo = Object.keys(NOMES_DOS_MOVIMENTOS)
    .map((tipo) => ({ tipo, nome: NOMES_DOS_MOVIMENTOS[tipo] ?? tipo, valor: somar(p.movimentos.filter((m) => m.tipo === tipo && m.meio === "dinheiro"), (m) => m.valor) }))
    .filter((m) => m.valor !== 0);

  return {
    vendas, vendido, cancelamentos, cancelado, devolucoes, devolvido,
    liquido: vendido - cancelado - devolvido,
    recebido,
    meios,
    entradasDeFinanciamento: somar(meios, (m) => m.entradas),
    valeUsado,
    financiado: [...financiado.entries()].map(([devedor, valor]) => ({ devedor, nome: nomeDoMeio(devedor), valor })),
    aReceberAberto: somar(p.aReceber.filter((a) => a.situacao === "aberta"), (a) => a.valor),
    pagamentosDesfeitos: { quantidade: somar(desfeitos, (x) => x.quantidade), valor: somar(desfeitos, (x) => x.valor) },
    estornoPendente: { quantidade: somar(p.estornos.filter((e) => e.situacao === "pendente"), (e) => e.quantidade), valor: somar(p.estornos.filter((e) => e.situacao === "pendente"), (e) => e.valor) },
    estornoConfirmado: { quantidade: somar(p.estornos.filter((e) => e.situacao === "confirmado"), (e) => e.quantidade), valor: somar(p.estornos.filter((e) => e.situacao === "confirmado"), (e) => e.valor) },
    reembolsos: p.reembolsos.map((r) => ({ ...r, nome: r.meio === "dinheiro" ? "Dinheiro (sai da gaveta)" : r.meio === "vale_troca" ? "Vale-troca (crédito, não é dinheiro)" : `${nomeDoMeio(r.meio)} (estorno externo)` })),
    gaveta: movimentosPorTipo,
    saldoDaGaveta: somar(movimentosPorTipo, (m) => m.valor),
    caixas: p.caixas,
    conciliacao: conciliacaoDoPainel(p),
  };
}
export type ResumoFinanceiro = ReturnType<typeof resumoDoPainel>;

/** Variação contra o período anterior; sem nada antes, não há base de comparação (nada de "+∞%"). */
export const variacaoFinanceira = (atual: number, anterior: number): number | null => (anterior > 0 ? (atual - anterior) / anterior : null);

// ---------------------------------------------------------------------------------------------
// Séries dos gráficos: todos os dias (ou horas) da janela, com zero onde não houve fato
// ---------------------------------------------------------------------------------------------
const chaveDoDia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const horaEmSaoPaulo = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(d));

/** Chaves no formato do banco: "2026-11-10" por dia; "2026-11-10T14" por hora (de 7h, ou antes se houve fato, até a hora atual). */
export function chavesDaJanela(janela: Janela, porHora: boolean, comFatos: readonly string[] = []): string[] {
  if (porHora) {
    const dia = chaveDoDia(janela.inicio);
    const horasComFato = comFatos.filter((c) => c.startsWith(dia)).map((c) => Number(c.slice(11, 13)));
    const ultima = Math.max(horaEmSaoPaulo(janela.fim), ...horasComFato);
    const primeira = Math.min(7, ...horasComFato, ultima);
    return Array.from({ length: ultima - primeira + 1 }, (_, i) => `${dia}T${String(primeira + i).padStart(2, "0")}`);
  }
  const chaves: string[] = [];
  for (let d = janela.inicio.getTime(); d <= janela.fim.getTime(); d += DIA) {
    const c = chaveDoDia(new Date(d));
    if (chaves.at(-1) !== c) chaves.push(c);
  }
  const ultimo = chaveDoDia(janela.fim);
  if (chaves.at(-1) !== ultimo) chaves.push(ultimo);
  return chaves;
}

export const rotuloDaChave = (chave: string) => (chave.length > 10 ? `${chave.slice(11, 13)}h` : `${chave.slice(8, 10)}/${chave.slice(5, 7)}`);

export function seriesDoPainel(p: PainelDoBanco, janela: Janela, porHora: boolean) {
  const chaves = chavesDaJanela(janela, porHora, [...p.periodos.map((x) => x.periodo), ...p.movimentos.map((m) => m.periodo)]);
  const vendas = chaves.map((chave) => {
    const x = p.periodos.find((y) => y.periodo === chave);
    return { chave, rotulo: rotuloDaChave(chave), vendido: x?.vendido ?? 0, desfeito: (x?.cancelado ?? 0) + (x?.devolvido ?? 0), vendas: x?.vendas ?? 0 };
  });
  const gaveta = chaves.map((chave) => {
    const doPeriodo = p.movimentos.filter((m) => m.periodo === chave && m.meio === "dinheiro");
    return {
      chave, rotulo: rotuloDaChave(chave),
      entrada: somar(doPeriodo.filter((m) => m.valor > 0), (m) => m.valor),
      saida: -somar(doPeriodo.filter((m) => m.valor < 0), (m) => m.valor),
    };
  });
  return { vendas, gaveta };
}

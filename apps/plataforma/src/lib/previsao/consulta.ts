// Previsão de caixa (lote L8c: ORA-FIN-010): leitura estrita de public.previsao_de_caixa, que devolve só
// fatos. As janelas têm de ser as pedidas (as próximas semanas a partir de hoje e as 8 anteriores), sem
// valor negativo onde não pode haver e com contagem e valor de acordo: forma inesperada é falha, nunca
// número. Banco sem a função é "indisponível"; quem não pode ver é "recusado".
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, lista, objeto, texto as t, type Leitura, type Linha } from "../leitura-do-banco";
import { somarDias, type SemanaBase, type SemanaFutura } from "./regras";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export type Contagem = { valor: number; quantidade: number };
/**
 * FIN-007b: o que as financeiras devem, pelo vencimento (o dia da venda mais o prazo de repasse em vigor): o que já
 * passou do prazo, o que vence dentro das semanas pedidas (e entra na previsão), o que vence depois e o que não tem
 * prazo gravado (sem data). As quatro partes somam o total.
 */
export type FinanceirasPorVencimento = { atrasadas: Contagem; noPeriodo: Contagem; depois: Contagem; semPrazo: Contagem };
export type Previsao = {
  hoje: string; unidade: string | null;
  semanas: SemanaFutura[];
  vencidas: Contagem;
  /** As 8 semanas antes de hoje, da mais antiga para a mais nova. */
  base: SemanaBase[];
  /** Pedidos de estorno de Pix e cartão sem comprovante (correção #82): devem sair, ainda não saíram. Nulo: banco sem a correção. */
  estornosAConfirmar: Contagem | null;
  financeiras: Contagem;
  /** Nulo: banco sem o FIN-007b (as financeiras seguem só com o total, sem data). */
  financeirasPorVencimento: FinanceirasPorVencimento | null;
  aConciliar: Contagem;
  gavetas: { valor: number; caixas: number };
  lojas: { id: string; nome: string }[];
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const dia = (l: Linha, campo: string) => {
  const v = t(l, campo);
  if (!DIA.test(v)) throw new RespostaInesperada(campo);
  return v;
};
function contagem(dado: Linha, campo: string): Contagem {
  const o = objeto(dado, campo);
  const c = { valor: n(o, "valor"), quantidade: n(o, "quantidade") };
  if (c.valor < 0 || c.quantidade < 0 || (c.valor === 0) !== (c.quantidade === 0)) throw new RespostaInesperada(campo);
  return c;
}

/** Converte a resposta. Janela fora do lugar, valor negativo ou contagem sem valor é falha (RespostaInesperada). */
export function lerPrevisao(dado: unknown, pedido: { semanas: number; unidade: string | null }): Previsao {
  if (!ehObjeto(dado)) throw new RespostaInesperada("previsao_de_caixa");
  if (dado.unidade !== null && !ehUuid(dado.unidade)) throw new RespostaInesperada("unidade");
  const gavetas = objeto(dado, "gavetas");
  // FIN-007b: as partes das financeiras pelo vencimento vêm juntas, ou nenhuma (banco sem a migration).
  const dasFinanceiras = objeto(dado, "financeiras");
  const porVencimento: FinanceirasPorVencimento | null = "sem_prazo" in dasFinanceiras
    ? { atrasadas: contagem(dasFinanceiras, "atrasadas"), noPeriodo: contagem(dasFinanceiras, "no_periodo"), depois: contagem(dasFinanceiras, "depois"), semPrazo: contagem(dasFinanceiras, "sem_prazo") }
    : null;
  const p: Previsao = {
    hoje: dia(dado, "hoje"),
    unidade: dado.unidade as string | null,
    semanas: lista(dado, "semanas").map((s) => ({
      inicio: dia(s, "inicio"), fim: dia(s, "fim"), contas: n(s, "contas"), quantidade: n(s, "quantidade"),
      financeiras: porVencimento ? n(s, "financeiras") : 0, financeirasQuantidade: porVencimento ? n(s, "financeiras_quantidade") : 0,
    })),
    vencidas: contagem(dado, "vencidas"),
    base: lista(dado, "base").map((b) => ({ inicio: dia(b, "inicio"), fim: dia(b, "fim"), recebido: n(b, "recebido"), devolvido: n(b, "devolvido"), saidasCaixa: n(b, "saidas_caixa") })),
    estornosAConfirmar: "estornos_a_confirmar" in dado ? contagem(dado, "estornos_a_confirmar") : null,
    financeiras: contagem(dado, "financeiras"),
    financeirasPorVencimento: porVencimento,
    aConciliar: contagem(dado, "a_conciliar"),
    gavetas: { valor: n(gavetas, "valor"), caixas: n(gavetas, "caixas") },
    lojas: lista(dado, "lojas").map((l) => {
      const id = t(l, "id");
      if (!ehUuid(id)) throw new RespostaInesperada("lojas");
      return { id, nome: t(l, "nome") };
    }),
  };
  const fecha = p.unidade === pedido.unidade
    && p.semanas.length === pedido.semanas
    && p.semanas.every((s, i) => s.inicio === somarDias(p.hoje, 7 * i) && s.fim === somarDias(s.inicio, 6)
      && s.contas >= 0 && s.quantidade >= 0 && (s.contas === 0) === (s.quantidade === 0))
    && p.base.length === 8
    && p.base.every((b, k) => b.inicio === somarDias(p.hoje, -56 + 7 * k) && b.fim === somarDias(b.inicio, 6)
      && b.recebido >= 0 && b.devolvido >= 0 && b.saidasCaixa >= 0)
    && p.gavetas.caixas >= 0 && (p.gavetas.caixas > 0 || p.gavetas.valor === 0);
  if (!fecha) throw new RespostaInesperada("previsao_de_caixa");
  // FIN-007b: as quatro partes somam o total em aberto, e as semanas somam o que vence no período: se não fecham, a
  // leitura não vale (nada some nem entra duas vezes na previsão).
  if (porVencimento) {
    const partes = [porVencimento.atrasadas, porVencimento.noPeriodo, porVencimento.depois, porVencimento.semPrazo];
    const semanasFecham = p.semanas.every((s) => (s.financeiras ?? 0) >= 0 && (s.financeirasQuantidade ?? 0) >= 0 && ((s.financeiras ?? 0) === 0) === ((s.financeirasQuantidade ?? 0) === 0))
      && p.semanas.reduce((t, s) => t + (s.financeiras ?? 0), 0) === porVencimento.noPeriodo.valor
      && p.semanas.reduce((t, s) => t + (s.financeirasQuantidade ?? 0), 0) === porVencimento.noPeriodo.quantidade;
    if (!semanasFecham || partes.reduce((t, x) => t + x.valor, 0) !== p.financeiras.valor || partes.reduce((t, x) => t + x.quantidade, 0) !== p.financeiras.quantidade) {
      throw new RespostaInesperada("financeiras");
    }
  }
  return p;
}

/** Os fatos da previsão da rede (unidade nula) ou de uma loja. "recusado": não é o dono, ou a loja não é da rede. */
export async function consultarPrevisao(supabase: Cliente, semanas: number, unidade: string | null): Promise<Leitura<Previsao> | { estado: "recusado" }> {
  const r = await supabase.rpc("previsao_de_caixa", { p_semanas: semanas, p_unidade: unidade as string });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    if (r.error.code === "42501") return { estado: "recusado" };
    console.error("previsão de caixa: falha ao consultar previsao_de_caixa", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerPrevisao(r.data, { semanas, unidade }) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("previsão de caixa: resposta inesperada de previsao_de_caixa");
    return { estado: "falha" };
  }
}

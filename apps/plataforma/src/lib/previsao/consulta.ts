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
export type Previsao = {
  hoje: string; unidade: string | null;
  semanas: SemanaFutura[];
  vencidas: Contagem;
  /** As 8 semanas antes de hoje, da mais antiga para a mais nova. */
  base: SemanaBase[];
  financeiras: Contagem;
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
  const p: Previsao = {
    hoje: dia(dado, "hoje"),
    unidade: dado.unidade as string | null,
    semanas: lista(dado, "semanas").map((s) => ({ inicio: dia(s, "inicio"), fim: dia(s, "fim"), contas: n(s, "contas"), quantidade: n(s, "quantidade") })),
    vencidas: contagem(dado, "vencidas"),
    base: lista(dado, "base").map((b) => ({ inicio: dia(b, "inicio"), fim: dia(b, "fim"), recebido: n(b, "recebido"), devolvido: n(b, "devolvido"), saidasCaixa: n(b, "saidas_caixa") })),
    financeiras: contagem(dado, "financeiras"),
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

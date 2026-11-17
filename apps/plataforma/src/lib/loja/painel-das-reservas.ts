// Lote MKT-a (ORA-ONLINE-003 e ORA-META-002): as reservas do site por origem e campanha, para os Relatórios.
// Leitura de public.reservas_do_site_painel (security invoker: a reserva pelo RLS das reservas, venda.registrar na
// loja; a venda pelo RLS das vendas); a soma está provada em packages/banco/src/origem-das-reservas.test.ts.
// Forma inesperada é falha (a tela mostra falha de leitura), nunca zero. O registro de erro leva só o código.
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada, type Janela } from "../financeiro/painel";
import { nomesDoRanking } from "../inicio/consulta";
import { contagem, ehObjeto, inteiro, lista, textoOuNulo, type Leitura, type Linha } from "../leitura-do-banco";
import { NOMES_DAS_ORIGENS, ORIGENS_DO_SITE, type OrigemDoSite } from "./origem";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type OrigemDoPainel = OrigemDoSite | "sem_registro";
export type LinhaDaOrigem = {
  origem: OrigemDoPainel; fonte: string | null; campanha: string | null;
  reservas: number; atendidas: number; canceladas: number; vencidas: number; vendas: number; vendasCentavos: number;
};
export type VendedorDoSite = { vendedor: string; vendas: number; vendasCentavos: number };
export type PainelDasReservas = { origens: LinhaDaOrigem[]; vendedores: VendedorDoSite[] };

const origemDe = (l: Linha): OrigemDoPainel => {
  const v = l.origem;
  if (v === "sem_registro" || (typeof v === "string" && (ORIGENS_DO_SITE as readonly string[]).includes(v))) return v as OrigemDoPainel;
  throw new RespostaInesperada("origem");
};

/** Converte a resposta de public.reservas_do_site_painel. */
export function lerPainelDasReservas(dado: unknown): PainelDasReservas {
  if (!ehObjeto(dado)) throw new RespostaInesperada("reservas_do_site_painel");
  const origens = lista(dado, "origens").map((l) => {
    const linha: LinhaDaOrigem = {
      origem: origemDe(l), fonte: textoOuNulo(l, "fonte"), campanha: textoOuNulo(l, "campanha"),
      reservas: contagem(l, "reservas"), atendidas: contagem(l, "atendidas"), canceladas: contagem(l, "canceladas"), vencidas: contagem(l, "vencidas"),
      vendas: contagem(l, "vendas"), vendasCentavos: inteiro(l, "vendas_centavos"),
    };
    // As partes nunca passam do todo: o que passar é resposta errada, não número para mostrar.
    if (linha.reservas < 1 || linha.atendidas + linha.canceladas + linha.vencidas > linha.reservas || linha.vendas > linha.atendidas) throw new RespostaInesperada("contagens");
    return linha;
  });
  const vendedores = lista(dado, "vendedores").map((l) => {
    const vendedor = l.vendedor_id;
    if (typeof vendedor !== "string" || !UUID.test(vendedor)) throw new RespostaInesperada("vendedor_id");
    return { vendedor, vendas: contagem(l, "vendas"), vendasCentavos: inteiro(l, "vendas_centavos") };
  });
  return { origens, vendedores };
}

/** O painel da janela, de uma loja (ou de todas as que a pessoa vê, com `unidade` nula), com os nomes de quem vendeu. */
export async function consultarReservasDoSite(supabase: Cliente, janela: Janela, unidade: string | null):
  Promise<Leitura<PainelDasReservas & { nomes: ReadonlyMap<string, string> }>> {
  const r = await supabase.rpc("reservas_do_site_painel", {
    p_inicio: janela.inicio.toISOString(), p_fim: janela.fim.toISOString(), ...(unidade ? { p_unidade: unidade } : {}),
  });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    console.error("relatorios: falha ao consultar reservas_do_site_painel", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  let painel: PainelDasReservas;
  try {
    painel = lerPainelDasReservas(r.data);
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("relatorios: resposta inesperada de reservas_do_site_painel");
    return { estado: "falha" };
  }
  // O nome de quem vendeu segue a regra do ranking (ranking_nomes): quem não pode ver o nome vê "Vendedor".
  const nomes = await nomesDoRanking(supabase, painel.vendedores.map((v) => v.vendedor));
  if (nomes.estado !== "ok") return { estado: "falha" };
  return { estado: "ok", dados: { ...painel, nomes: nomes.dados } };
}

/** O rótulo de uma linha do painel: "Instagram · natal", "Outra campanha (panfleto)", "Direto". */
export function rotuloDaOrigem(l: Pick<LinhaDaOrigem, "origem" | "fonte" | "campanha">): string {
  const nome = NOMES_DAS_ORIGENS[l.origem];
  const fonte = l.origem === "outra_campanha" && l.fonte ? ` (${l.fonte})` : "";
  return `${nome}${fonte}${l.campanha ? ` · ${l.campanha}` : ""}`;
}

/** Os totais do período, para o resumo do quadro. */
export function totaisDasReservas(p: PainelDasReservas) {
  return p.origens.reduce((t, l) => ({
    reservas: t.reservas + l.reservas, atendidas: t.atendidas + l.atendidas, vendas: t.vendas + l.vendas, vendasCentavos: t.vendasCentavos + l.vendasCentavos,
  }), { reservas: 0, atendidas: 0, vendas: 0, vendasCentavos: 0 });
}

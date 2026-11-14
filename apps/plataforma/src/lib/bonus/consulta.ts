// Consultas do bônus por meta (lote L9a): public.bonus_do_mes e public.extrato_do_vendedor (security
// invoker: as regras de leitura de quem pede) e as versões de public.bonus_regras (toda a equipe da rede
// lê). Cada leitura devolve o próprio estado: "ok", "indisponivel" (o banco do ambiente ainda não tem a
// função ou a tabela), "recusado" (o banco recusou: sem permissão) ou "falha". Falha nunca vira zero.
// O registro de erro leva só o código, nunca valor nem nome.
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import type { Leitura } from "../leitura-do-banco";
import { lerBonusDoMes, lerExtrato, lerVersoes, type BonusDoMes, type Extrato, type VersaoDaRegra } from "./regras";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
export type LeituraDoBonus<T> = Leitura<T> | { estado: "recusado" };
const AUSENTE = new Set(["PGRST202", "42883", "PGRST205", "42P01"]);

async function ler<T>(nome: string, consulta: PromiseLike<{ data: unknown; error: { code: string } | null }>, conversor: (dado: unknown) => T): Promise<LeituraDoBonus<T>> {
  const r = await consulta;
  if (r.error) {
    if (AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    if (r.error.code === "42501") return { estado: "recusado" };
    console.error(`bonus: falha ao consultar ${nome}`, { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: conversor(r.data) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error(`bonus: resposta inesperada de ${nome}`);
    return { estado: "falha" };
  }
}

/** O bônus do mês numa loja: as regras que valem e cada vendedor que a pessoa pode ver. */
export const consultarBonus = (supabase: Cliente, mes: string, unidade: string): Promise<LeituraDoBonus<BonusDoMes>> =>
  ler("bonus_do_mes", supabase.rpc("bonus_do_mes", { p_mes: mes, p_unidade: unidade }), (d) => lerBonusDoMes(d, { mes }));

/** O extrato de um vendedor numa loja no mês: o próprio, ou o de quem a gestão acompanha. */
export const consultarExtrato = (supabase: Cliente, mes: string, unidade: string, vendedor: string): Promise<LeituraDoBonus<Extrato>> =>
  ler("extrato_do_vendedor", supabase.rpc("extrato_do_vendedor", { p_mes: mes, p_unidade: unidade, p_vendedor: vendedor }), (d) => lerExtrato(d, { mes, unidade, vendedor }));

/** As versões das regras da rede, a mais nova primeiro (as 200 últimas bastam para a tela). */
export const consultarVersoes = (supabase: Cliente): Promise<LeituraDoBonus<VersaoDaRegra[]>> =>
  ler("bonus_regras",
    supabase.from("bonus_regras").select("versao, medida, vigente_desde, faixas, motivo, definida_em").order("versao", { ascending: false }).limit(200),
    lerVersoes);

// O custo da variação (lote CAT-008b: ORA-CAT-008): o histórico do custo (de onde veio cada um), a leitura do formulário
// da correção e as mensagens. O custo atual é o último gravado; a correção grava um custo novo com motivo, e o estorno da
// entrada grava a volta. A regra que vale é a do banco (packages/banco/src/correcao-do-custo.test.ts). Só lê quem vê
// custo (o RLS de public.custos): para os outros, a lista vem vazia e a tela não mostra o cartão.
import { lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { centavosDoBanco, ValorForaDoLimite } from "../dinheiro";
import type { Leitura } from "../leitura-do-banco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

/** De onde veio cada custo gravado. */
export const ORIGENS_DO_CUSTO = {
  importacao: "importação da planilha",
  entrada: "entrada de mercadoria",
  manual: "importação desfeita",
  estorno: "estorno da entrada",
  correcao: "correção",
} as const;
export type OrigemDoCusto = keyof typeof ORIGENS_DO_CUSTO;
const ehOrigem = (v: unknown): v is OrigemDoCusto => typeof v === "string" && Object.hasOwn(ORIGENS_DO_CUSTO, v);

/** Quantos custos do histórico a tela mostra (os mais novos). */
export const CUSTOS_NO_HISTORICO = 30;
/** O maior custo aceito (o mesmo do banco e da entrada de mercadoria): R$ 1.000.000,00. */
export const CUSTO_MAXIMO = 100_000_000;

export type CustoGravado = { id: string; valor: number; desde: string; origem: OrigemDoCusto; detalhe: string | null };

/** O que a referência gravada diz, em português: "entrada nº 12", "importação nº 3" ou o motivo da correção. */
export function detalheDoCusto(origem: OrigemDoCusto, referencia: string | null): string | null {
  if (!referencia) return null;
  const numero = (padrao: RegExp) => referencia.match(padrao)?.[1] ?? null;
  if (origem === "entrada") return numero(/^entrada:(\d+):/) ? `entrada nº ${numero(/^entrada:(\d+):/)}` : null;
  if (origem === "estorno") return numero(/^estorno:entrada:(\d+)$/) ? `entrada nº ${numero(/^estorno:entrada:(\d+)$/)} estornada` : null;
  if (origem === "importacao") return numero(/^importacao:(\d+):/) ? `importação nº ${numero(/^importacao:(\d+):/)}` : null;
  if (origem === "manual") return numero(/^desfaz:importacao:(\d+):/) ? `importação nº ${numero(/^desfaz:importacao:(\d+):/)} desfeita` : null;
  return referencia;
}

class Inesperado extends Error {}
/**
 * O histórico do custo da variação, do mais novo ao mais velho (até CUSTOS_NO_HISTORICO); o primeiro é o custo atual.
 * Lista vazia: sem custo gravado (ou sem custo.ver). Falha de leitura ou linha estranha: falha, nunca zero.
 */
export async function lerCustos(supabase: Cliente, variante: string): Promise<Leitura<CustoGravado[]>> {
  const r = await supabase.from("custos").select("id, valor_centavos, inicio, origem, referencia")
    .eq("variante_id", variante).order("inicio", { ascending: false }).order("criado_em", { ascending: false }).limit(CUSTOS_NO_HISTORICO);
  if (r.error) {
    console.error("catálogo: falha ao ler o custo da variação", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return {
      estado: "ok",
      dados: (r.data as Record<string, unknown>[]).map((l) => {
        if (!ehUuid(l.id) || !ehOrigem(l.origem) || typeof l.inicio !== "string" || Number.isNaN(Date.parse(l.inicio))
          || (l.referencia !== null && typeof l.referencia !== "string")) throw new Inesperado("custo");
        return { id: l.id, valor: centavosDoBanco(l.valor_centavos), desde: l.inicio, origem: l.origem, detalhe: detalheDoCusto(l.origem, l.referencia as string | null) };
      }),
    };
  } catch (erro) {
    if (!(erro instanceof Inesperado) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("catálogo: custo em forma inesperada");
    return { estado: "falha" };
  }
}

export const ERROS_DO_CUSTO = {
  custo_valor: "Custo inválido: em reais com vírgula, de R$ 0,00 a R$ 1.000.000,00.",
  custo_motivo: "Informe o motivo da correção (de 3 a 300 letras); ele fica na auditoria.",
  custo_permissao: "Só o dono e o administrador corrigem o custo (quem cadastra o catálogo e vê custo na rede).",
  custo_indisponivel: "A correção do custo ainda não está disponível neste ambiente.",
  custo_falha: "Não deu para gravar o custo agora. Tente de novo em instantes.",
} as const;
export type ErroDoCusto = keyof typeof ERROS_DO_CUSTO;

type Formulario = { get: (nome: string) => unknown };
/** A correção: a variação, o custo novo (em reais, zero vale) e o motivo de 3 a 300 letras. */
export function lerCorrecaoDoCusto(dados: Formulario): { ok: true; variante: string; valor: number; motivo: string } | { ok: false; erro: ErroDoCusto | "dados" } {
  const variante = dados.get("variante");
  if (!ehUuid(variante)) return { ok: false, erro: "dados" };
  const texto = typeof dados.get("valor") === "string" ? (dados.get("valor") as string).trim() : "";
  let valor: number;
  try {
    valor = lerReais(texto);
  } catch {
    return { ok: false, erro: "custo_valor" };
  }
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > CUSTO_MAXIMO) return { ok: false, erro: "custo_valor" };
  const motivo = typeof dados.get("motivo") === "string" ? (dados.get("motivo") as string).trim().replace(/\s+/g, " ") : "";
  if (motivo.length < 3 || motivo.length > 300) return { ok: false, erro: "custo_motivo" };
  return { ok: true, variante, valor, motivo };
}

/** Do erro do banco para a mensagem (a do banco não vai para a tela). */
export function erroDoCusto(erro: { code?: string; message?: string } | null | undefined): ErroDoCusto {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "P0002" || codigo === "42501") return "custo_permissao";
  if (codigo === "PGRST202" || codigo === "42883") return "custo_indisponivel";
  if (codigo !== "22023") return "custo_falha";
  if (m.includes("motivo")) return "custo_motivo";
  if (m.includes("custo inválido")) return "custo_valor";
  return "custo_falha";
}

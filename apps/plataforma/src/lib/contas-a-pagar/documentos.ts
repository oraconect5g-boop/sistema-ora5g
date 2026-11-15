// Documentos da conta a pagar (lote FIN-004b: ORA-FIN-004, "anexar o boleto ou a nota"): os tipos, a leitura dos
// formulários, as mensagens e a leitura da lista. O arquivo é conferido pelo conteúdo (a mesma conferência dos
// documentos da venda, lib/vendas/anexos.ts) e guardado no bucket privado "contas"; a regra que vale é a do banco
// (packages/banco/src/documentos-da-conta.test.ts). Num banco sem a migration (sem a tabela), nada disto aparece e a
// tela segue como antes; outra falha é falha: a tela diz que não leu, em vez de mostrar a conta sem documentos.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { lerPorIds } from "../leitura-completa";
import type { Leitura } from "../leitura-do-banco";
import { lerTipoEDescricao } from "../vendas/anexos";
import type { ErroDasContas } from "./regras";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const TABELA_AUSENTE = new Set(["PGRST205", "42P01"]);
const FALHA = { estado: "falha" } as const;

export const TIPOS_DE_DOCUMENTO = {
  boleto: "Boleto",
  nota_fiscal: "Nota fiscal",
  comprovante_pagamento: "Comprovante do pagamento",
  outro: "Outro documento",
} as const;
export type TipoDeDocumento = keyof typeof TIPOS_DE_DOCUMENTO;
export const ehTipoDeDocumento = (v: unknown): v is TipoDeDocumento => typeof v === "string" && Object.hasOwn(TIPOS_DE_DOCUMENTO, v);
/** Quantos documentos vigentes cabem numa conta (o banco recusa o 21º). */
export const MAXIMO_DE_DOCUMENTOS = 20;
const FORMATOS = new Set(["pdf", "jpg", "png", "webp"]);

export type DocumentoDaConta = {
  id: string; tipo: TipoDeDocumento; descricao: string | null; formato: string; bytes: number; enviadoEm: string;
  retiradoEm: string | null; motivoRetirada: string | null;
};

/** O tipo e a descrição do formulário de envio (a descrição é obrigatória em "Outro documento"). */
export const lerDadosDoDocumento = (tipo: unknown, descricao: unknown) => lerTipoEDescricao(ehTipoDeDocumento, tipo, descricao);

type Formulario = { get: (nome: string) => unknown };
/** Retirar o documento errado: o documento e o motivo (de 3 a 200 letras, como no banco). */
export function lerRetirada(dados: Formulario): { ok: true; documento: string; motivo: string } | { ok: false; erro: ErroDasContas } {
  const documento = dados.get("documento");
  if (!ehUuid(documento)) return { ok: false, erro: "dados" };
  const motivo = typeof dados.get("motivo") === "string" ? (dados.get("motivo") as string).trim().replace(/\s+/g, " ") : "";
  if (motivo.length < 3 || motivo.length > 200) return { ok: false, erro: "documento_motivo" };
  return { ok: true, documento, motivo };
}

/** Do erro do banco para a mensagem da tela (pelo código e por um trecho da mensagem; a do banco não vai para a tela). */
export function erroDosDocumentos(erro: { code?: string; message?: string } | null | undefined): ErroDasContas {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "P0002") return m.includes("storage") ? "documento_falha" : m.includes("documento") ? "documento_nao_encontrado" : "nao_encontrada";
  if (codigo === "42501") return "documento_permissao";
  if (codigo === "PGRST202" || codigo === "42883") return "indisponivel";
  if (codigo !== "22023") return "documento_falha";
  if (m.includes("20 documentos")) return "documento_limite";
  if (m.includes("motivo")) return "documento_motivo";
  if (m.includes("tipo de documento") || m.includes("descrição") || m.includes("que documento")) return "documento_dados";
  if (m.includes("formato")) return "documento_arquivo";
  return "documento_falha";
}

/** Do erro do Storage ao guardar o arquivo: a recusa da regra do bucket (403) é falta de permissão; 413, grande demais. */
export function erroDoEnvio(status: string | null): ErroDasContas {
  return status === "403" ? "documento_permissao" : status === "413" ? "documento_grande" : "documento_falha";
}

class Inesperado extends Error {}
function documento(l: Record<string, unknown>): DocumentoDaConta {
  const ok = ehUuid(l.id) && ehTipoDeDocumento(l.tipo) && (l.descricao === null || typeof l.descricao === "string")
    && typeof l.formato === "string" && FORMATOS.has(l.formato) && typeof l.bytes === "number" && Number.isSafeInteger(l.bytes) && l.bytes > 0
    && typeof l.enviado_em === "string" && !Number.isNaN(Date.parse(l.enviado_em))
    && (l.retirado_em === null || (typeof l.retirado_em === "string" && !Number.isNaN(Date.parse(l.retirado_em))))
    && (l.motivo_retirada === null || typeof l.motivo_retirada === "string");
  if (!ok) throw new Inesperado("documento");
  return {
    id: l.id as string, tipo: l.tipo as TipoDeDocumento, descricao: l.descricao as string | null, formato: l.formato as string, bytes: l.bytes as number,
    enviadoEm: l.enviado_em as string, retiradoEm: l.retirado_em as string | null, motivoRetirada: l.motivo_retirada as string | null,
  };
}

/**
 * Os documentos das contas da lista, por conta, dos mais antigos aos mais novos (os retirados também, marcados). Pelo
 * RLS de quem pede: só vê os documentos quem lê a conta (conta_pagar.gerir). Nulo: o banco ainda não tem a tabela.
 * O link de cada um é pedido na hora de abrir (/contas-a-pagar/[id]/documentos/[documento]), e não na leitura da lista.
 */
export async function lerDocumentos(supabase: Cliente, contas: readonly string[]): Promise<Leitura<ReadonlyMap<string, DocumentoDaConta[]>> | null> {
  const r = await lerPorIds(contas, (lote, de, ate) => supabase.from("conta_pagar_anexos")
    .select("id, conta_id, tipo, descricao, formato, bytes, enviado_em, retirado_em, motivo_retirada")
    .in("conta_id", lote).order("enviado_em").order("id").range(de, ate));
  if (!r.ok) {
    if (TABELA_AUSENTE.has(r.erro.code ?? "")) return null;
    console.error("contas a pagar: falha ao ler os documentos das contas", { codigo: r.erro.code || null });
    return FALHA;
  }
  try {
    const porConta = new Map<string, DocumentoDaConta[]>();
    for (const l of r.linhas) {
      if (!ehUuid(l.conta_id)) throw new Inesperado("conta");
      const lista = porConta.get(l.conta_id) ?? [];
      lista.push(documento(l as Record<string, unknown>));
      porConta.set(l.conta_id, lista);
    }
    return { estado: "ok", dados: porConta };
  } catch (erro) {
    if (!(erro instanceof Inesperado)) throw erro;
    console.error("contas a pagar: documento em forma inesperada");
    return FALHA;
  }
}

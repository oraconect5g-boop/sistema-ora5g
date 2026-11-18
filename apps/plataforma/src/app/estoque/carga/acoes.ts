"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { RESOLUCOES_EM_BLOCO, ehResolucao, erroDaCarga, type ErroDaCarga } from "../../../lib/estoque/carga-regras";

// A carga do estoque inicial por loja (lote REIN-b; ADR-021). Cada ação chama UMA função do banco como a pessoa logada:
// o banco confere a permissão (aplicar e desfazer: importacao.aprovar, o dono; descartar: quem importa ou aprova), a
// regra de quem gerou a prévia não aplicar, a situação da carga, e grava a auditoria com o motivo.

const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

function voltar(carga: unknown, parametros: { ok?: string; erro?: ErroDaCarga; [chave: string]: string | undefined }): never {
  if (!ehUuid(carga)) redirect("/estoque/carga?erro=dados");
  const busca = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) if (v) busca.set(k, v);
  redirect(`/estoque/carga/${carga}${busca.size ? `?${busca}` : ""}`);
}

async function chamar(dados: FormData, funcao: "estoque_carga_aplicar" | "estoque_carga_descartar" | "estoque_carga_desfazer") {
  const carga = dados.get("carga");
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(carga)) voltar(carga, { erro: "dados" });
  if (motivo.length < 3 || motivo.length > 200) voltar(carga, { erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc(funcao, { p_carga: carga as string, p_motivo: motivo });
  if (error) voltar(carga, { erro: erroDaCarga(error) });
  return { carga, data };
}

const numero = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : "0");

export async function aplicarCarga(dados: FormData) {
  const { carga, data } = await chamar(dados, "estoque_carga_aplicar");
  const r = data as unknown as { entradas?: unknown; unidades?: unknown } | null;
  voltar(carga, { ok: "aplicada", entradas: numero(r?.entradas), unidades: numero(r?.unidades) });
}

export async function descartarCarga(dados: FormData) {
  const { carga } = await chamar(dados, "estoque_carga_descartar");
  voltar(carga, { ok: "descartada" });
}

// REIN-c (F18-03): a decisão sobre a linha com o físico maior que o disponível (com o número da linha), ou sobre todas as
// que ainda não têm decisão (sem o número: só lançar o disponível ou deixar de fora; o banco recusa o físico em bloco).
export async function resolverDiferenca(dados: FormData) {
  const carga = dados.get("carga");
  const motivo = texto(dados.get("motivo"));
  const resolucao = dados.get("resolucao");
  const linha = texto(dados.get("linha"));
  if (!ehUuid(carga)) voltar(carga, { erro: "dados" });
  const vista = { ver: "diferenca" };
  if (!ehResolucao(resolucao)) voltar(carga, { ...vista, erro: "resolucao" });
  if (linha !== "" && !/^\d{1,6}$/.test(linha)) voltar(carga, { ...vista, erro: "dados" });
  if (linha === "" && !(RESOLUCOES_EM_BLOCO as readonly string[]).includes(resolucao as string)) voltar(carga, { ...vista, erro: "fisico_em_bloco" });
  if (motivo.length < 3 || motivo.length > 200) voltar(carga, { ...vista, erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("estoque_carga_resolver", {
    p_carga: carga as string, p_resolucao: resolucao as string, p_motivo: motivo, ...(linha === "" ? {} : { p_numero: Number(linha) }),
  });
  if (error) voltar(carga, { ...vista, erro: erroDaCarga(error) });
  const r = data as unknown as { linhas?: unknown } | null;
  voltar(carga, linha === "" ? { ...vista, ok: "resolvidas", linhas: numero(r?.linhas) } : { ...vista, ok: "resolvida", linha });
}

export async function desfazerCarga(dados: FormData) {
  const { carga, data } = await chamar(dados, "estoque_carga_desfazer");
  const r = data as unknown as { desfeitas?: unknown; ficaram?: unknown } | null;
  voltar(carga, { ok: "desfeita", desfeitas: numero(r?.desfeitas), ficaram: numero(r?.ficaram) });
}

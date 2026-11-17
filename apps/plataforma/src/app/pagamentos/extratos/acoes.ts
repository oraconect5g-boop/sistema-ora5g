"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDosExtratos, filtroDoExtrato, type ErroDosExtratos } from "../../../lib/extratos/regras";

// A conciliação pelo extrato (lote EXT-a: ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; ADR-016). Cada ação chama UMA função do
// banco como a pessoa logada: o banco confere pagamento.conciliar na loja do extrato (ou na rede), concilia pela
// conciliação de sempre (L7a) e grava a auditoria com o motivo.

const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/** Volta para o extrato, no mesmo filtro e na mesma página (só valores conhecidos). */
function voltar(dados: FormData, parametros: { ok?: string; erro?: ErroDosExtratos; conciliadas?: string }): never {
  const extrato = dados.get("extrato");
  if (!ehUuid(extrato)) redirect("/pagamentos/extratos?erro=dados");
  const busca = new URLSearchParams();
  const ver = filtroDoExtrato(dados.get("ver"));
  if (ver !== "pendente") busca.set("ver", ver);
  const pagina = dados.get("pagina");
  if (typeof pagina === "string" && /^\d{1,6}$/.test(pagina) && pagina !== "1") busca.set("pagina", pagina);
  for (const [k, v] of Object.entries(parametros)) if (v) busca.set(k, v);
  redirect(`/pagamentos/extratos/${extrato}${busca.size ? `?${busca}` : ""}`);
}

export async function conciliarLinha(dados: FormData) {
  const linha = dados.get("linha");
  const pagamento = dados.get("pagamento");
  if (!ehUuid(dados.get("extrato")) || !ehUuid(linha) || !ehUuid(pagamento)) voltar(dados, { erro: "dados" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("extrato_conciliar", { p_linha: linha, p_pagamento: pagamento });
  if (error) voltar(dados, { erro: erroDosExtratos(error) });
  voltar(dados, { ok: (data as { repetida?: unknown } | null)?.repetida === true ? "ja_conciliada" : "conciliada" });
}

export async function conciliarCertas(dados: FormData) {
  const extrato = dados.get("extrato");
  if (!ehUuid(extrato)) voltar(dados, { erro: "dados" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("extrato_conciliar_certas", { p_extrato: extrato });
  if (error) voltar(dados, { erro: erroDosExtratos(error) });
  const conciliadas = Number((data as { conciliadas?: unknown } | null)?.conciliadas);
  voltar(dados, { ok: "certas", conciliadas: Number.isSafeInteger(conciliadas) && conciliadas >= 0 ? String(conciliadas) : "0" });
}

export async function ignorarLinha(dados: FormData) {
  const linha = dados.get("linha");
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(dados.get("extrato")) || !ehUuid(linha)) voltar(dados, { erro: "dados" });
  if (motivo.length < 3 || motivo.length > 200) voltar(dados, { erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("extrato_ignorar", { p_linha: linha, p_motivo: motivo });
  if (error) voltar(dados, { erro: erroDosExtratos(error) });
  voltar(dados, { ok: data === false ? "sem_mudanca" : "ignorada" });
}

export async function desfazerLinha(dados: FormData) {
  const linha = dados.get("linha");
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(dados.get("extrato")) || !ehUuid(linha)) voltar(dados, { erro: "dados" });
  if (motivo.length < 3 || motivo.length > 200) voltar(dados, { erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("extrato_desfazer", { p_linha: linha, p_motivo: motivo });
  if (error) voltar(dados, { erro: erroDosExtratos(error) });
  voltar(dados, { ok: data === false ? "sem_mudanca" : "desfeita" });
}

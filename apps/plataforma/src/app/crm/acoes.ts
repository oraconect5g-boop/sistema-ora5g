"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { ehEtapa, erroDoCrm, lerAtividade, lerOportunidade, lerProximoPasso, MOTIVOS_DE_PERDA, type ErroDoCrm } from "../../lib/crm/regras";
import type { Json } from "../../lib/supabase/tipos-banco";

// Funil e agenda (lote L5b). Cada ação chama UMA função do banco como a pessoa logada: o banco confere
// crm.atender (o que é seu, na loja do turno) e crm.gerir (a loja inteira, trocar o responsável e reabrir)
// e grava o histórico com autor e hora.

const destino = (caminho: string, parametros: Record<string, string | null | undefined>) => {
  const busca = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) if (v) busca.set(k, v);
  return `${caminho}${busca.size ? `?${busca}` : ""}`;
};
// Declarada como função para o TypeScript entender que nada roda depois dela.
function voltar(caminho: string, erro: ErroDoCrm): never {
  redirect(destino(caminho, { erro }));
}
const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const chaveDe = (dados: FormData) => {
  const chave = dados.get("chave");
  return typeof chave === "string" && /^form:[0-9a-f-]{36}$/.test(chave) ? chave : `form:${randomUUID()}`;
};
// Volta para onde o formulário estava (funil, agenda ou a oportunidade), nunca para outro endereço.
const origemDe = (dados: FormData, oportunidade?: string) => {
  const voltarPara = dados.get("voltar");
  if (voltarPara === "agenda") return "/crm/agenda";
  if (voltarPara === "funil") return "/crm";
  return oportunidade && ehUuid(oportunidade) ? `/crm/${oportunidade}` : "/crm";
};

export async function registrarOportunidade(dados: FormData) {
  const cliente = dados.get("cliente_id");
  if (!ehUuid(cliente)) voltar("/crm", "cliente");
  const lido = lerOportunidade(dados);
  if (!lido.ok) voltar("/crm", lido.erro);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("oportunidade_registrar", { p_cliente: cliente, p_dados: lido.dados as unknown as Json, p_chave: chaveDe(dados) });
  if (error) voltar("/crm", erroDoCrm(error));
  const id = (data as { id?: string } | null)?.id;
  redirect(id ? `/crm/${id}?ok=registrada` : "/crm");
}

export async function moverOportunidade(dados: FormData) {
  const oportunidade = dados.get("oportunidade");
  const etapa = dados.get("etapa");
  if (!ehUuid(oportunidade) || !ehEtapa(etapa)) voltar("/crm", "dados");
  const volta = origemDe(dados, oportunidade);
  const extra: Record<string, string> = {};
  if (etapa === "perdida") {
    const motivo = texto(dados.get("motivo_perda"));
    const observacao = texto(dados.get("observacao"));
    if (!Object.hasOwn(MOTIVOS_DE_PERDA, motivo) || (motivo === "outro" && observacao.length < 5) || observacao.length > 300) voltar(volta, "motivo_perda");
    extra.motivo_perda = motivo;
    if (observacao) extra.observacao = observacao;
  } else if (etapa === "ganha") {
    const venda = dados.get("venda");
    if (typeof venda === "string" && venda !== "") {
      if (!ehUuid(venda)) voltar(volta, "venda");
      extra.venda = venda;
    }
    const observacao = texto(dados.get("observacao"));
    if (observacao) extra.observacao = observacao.slice(0, 300);
  } else {
    const passo = lerProximoPasso(dados);
    if (!passo.ok) voltar(volta, passo.erro);
    Object.assign(extra, passo.passo);
    const motivo = texto(dados.get("motivo"));
    if (motivo) extra.motivo = motivo.slice(0, 200);
  }
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("oportunidade_mover", { p_oportunidade: oportunidade, p_etapa: etapa, p_dados: extra });
  if (error) voltar(volta, erroDoCrm(error));
  redirect(destino(volta, { ok: "movida" }));
}

export async function atribuirOportunidade(dados: FormData) {
  const oportunidade = dados.get("oportunidade");
  const responsavel = dados.get("responsavel");
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(oportunidade)) voltar("/crm", "dados");
  if (!ehUuid(responsavel)) voltar(`/crm/${oportunidade}`, "responsavel");
  if (motivo.length < 3 || motivo.length > 200) voltar(`/crm/${oportunidade}`, "motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("oportunidade_atribuir", { p_oportunidade: oportunidade, p_responsavel: responsavel, p_motivo: motivo });
  if (error) voltar(`/crm/${oportunidade}`, erroDoCrm(error));
  redirect(`/crm/${oportunidade}?ok=atribuida`);
}

export async function anotarOportunidade(dados: FormData) {
  const oportunidade = dados.get("oportunidade");
  const nota = texto(dados.get("nota"));
  if (!ehUuid(oportunidade)) voltar("/crm", "dados");
  if (nota.length < 3 || nota.length > 500) voltar(`/crm/${oportunidade}`, "nota");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("oportunidade_anotar", { p_oportunidade: oportunidade, p_texto: nota });
  if (error) voltar(`/crm/${oportunidade}`, erroDoCrm(error));
  redirect(`/crm/${oportunidade}?ok=anotada`);
}

export async function criarAtividade(dados: FormData) {
  const oportunidade = dados.get("oportunidade");
  const volta = origemDe(dados, ehUuid(oportunidade) ? oportunidade : undefined);
  const lido = lerAtividade(dados);
  if (!lido.ok) voltar(volta, lido.erro);
  const responsavel = dados.get("responsavel");
  const corpo = { ...lido.dados, ...(ehUuid(oportunidade) ? { oportunidade } : {}), ...(ehUuid(responsavel) ? { responsavel } : {}) };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("atividade_criar", { p_dados: corpo as unknown as Json, p_chave: chaveDe(dados) });
  if (error) voltar(volta, erroDoCrm(error));
  redirect(destino(volta, { ok: "agendada" }));
}

export async function encerrarAtividade(dados: FormData) {
  const atividade = dados.get("atividade");
  const oportunidade = dados.get("oportunidade");
  const volta = origemDe(dados, ehUuid(oportunidade) ? oportunidade : undefined);
  const decisao = dados.get("decisao");
  const resultado = texto(dados.get("resultado"));
  if (!ehUuid(atividade) || (decisao !== "feita" && decisao !== "cancelada")) voltar(volta, "dados");
  if (resultado.length < 3 || resultado.length > 300) voltar(volta, "resultado");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("atividade_encerrar", { p_atividade: atividade, p_feita: decisao === "feita", p_resultado: resultado });
  if (error) voltar(volta, erroDoCrm(error));
  redirect(destino(volta, { ok: decisao === "feita" ? "feita" : "cancelada" }));
}

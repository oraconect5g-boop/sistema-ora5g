"use server";

import { redirect } from "next/navigation";

import { ehPapel, ehUuid, erroDoBanco, motivoValido, validarConvite } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";

// Cada ação chama UMA função do banco como a pessoa logada (sem chave secreta, ADR-002 §2.5).
// O banco confere permissão, hierarquia e motivo, e grava a auditoria na mesma transação.
type Resultado = { error: { code?: string } | null };
async function concluir(chamada: PromiseLike<Resultado>, ok: string): Promise<never> {
  const { error } = await chamada;
  redirect(error ? `/equipe?erro=${erroDoBanco(error)}` : `/equipe?ok=${ok}`);
}

export async function convidar(dados: FormData) {
  const r = validarConvite({
    organizacao: dados.get("organizacao"), nome: dados.get("nome"), email: dados.get("email"),
    papel: dados.get("papel"), unidades: dados.getAll("unidades"), motivo: dados.get("motivo"),
  });
  if (!r.ok) redirect(`/equipe?erro=${r.erro}`);
  const { supabase } = await obterSessao({ exigirLoja: false });
  const d = r.dados;
  await concluir(supabase.rpc("convidar_pessoa", {
    p_organizacao: d.organizacao, p_nome: d.nome, p_email: d.email, p_papel: d.papel, p_unidades: d.unidades, p_motivo: d.motivo,
  }), "convite");
}

export async function vincular(dados: FormData) {
  const usuario = dados.get("usuario");
  const organizacao = dados.get("organizacao");
  const papel = dados.get("papel");
  const unidade = dados.get("unidade");
  const motivo = motivoValido(dados.get("motivo"));
  if (!ehUuid(usuario) || !ehUuid(organizacao) || !ehPapel(papel)) redirect("/equipe?erro=dados");
  if (!motivo) redirect("/equipe?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: false });
  await concluir(supabase.rpc("vincular_pessoa", {
    // Papel de rede inteira vai sem loja (null); o tipo gerado não marca o parâmetro como opcional.
    p_usuario: usuario, p_organizacao: organizacao, p_papel: papel, p_unidade: ehUuid(unidade) ? unidade : (null as unknown as string), p_motivo: motivo,
  }), "vinculo");
}

export async function encerrarVinculo(dados: FormData) {
  const vinculo = dados.get("vinculo");
  const motivo = motivoValido(dados.get("motivo"));
  if (!ehUuid(vinculo)) redirect("/equipe?erro=dados");
  if (!motivo) redirect("/equipe?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: false });
  await concluir(supabase.rpc("encerrar_vinculo", { p_vinculo: vinculo, p_motivo: motivo }), "encerrado");
}

export async function alterarSituacao(dados: FormData) {
  const usuario = dados.get("usuario");
  const situacao = dados.get("situacao");
  const motivo = motivoValido(dados.get("motivo"));
  if (!ehUuid(usuario) || (situacao !== "ativo" && situacao !== "bloqueado")) redirect("/equipe?erro=dados");
  if (!motivo) redirect("/equipe?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: false });
  await concluir(supabase.rpc("alterar_situacao_pessoa", { p_usuario: usuario, p_situacao: situacao, p_motivo: motivo }), situacao === "bloqueado" ? "bloqueado" : "desbloqueado");
}

export async function cancelarConvite(dados: FormData) {
  const convite = dados.get("convite");
  const motivo = motivoValido(dados.get("motivo"));
  if (!ehUuid(convite)) redirect("/equipe?erro=dados");
  if (!motivo) redirect("/equipe?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: false });
  await concluir(supabase.rpc("cancelar_convite", { p_convite: convite, p_motivo: motivo }), "cancelado");
}

export async function repetirConvite(dados: FormData) {
  const convite = dados.get("convite");
  if (!ehUuid(convite)) redirect("/equipe?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: false });
  await concluir(supabase.rpc("repetir_convite", { p_convite: convite }), "repetido");
}

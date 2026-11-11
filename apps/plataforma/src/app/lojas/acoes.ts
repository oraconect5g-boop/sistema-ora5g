"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDeLojas, pendenciasDaMensagem, validarConfiguracao, validarEdicao, validarNovaLoja, motivoDeLojas } from "../../lib/lojas/regras";
import type { Json } from "../../lib/supabase/tipos-banco";

// Cada ação chama UMA função do banco como a pessoa logada (sem chave secreta, ADR-002 §2.5).
// O banco confere a permissão (unidades.gerir num vínculo de organização), as regras e as
// pendências, e grava a auditoria com o motivo na mesma transação.

/** Volta para /lojas com o resultado; a loja tratada fica aberta e no foco. */
function voltar(parametros: Record<string, string | null | undefined>): never {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) if (valor) busca.set(chave, valor);
  const loja = parametros.loja;
  redirect(`/lojas${busca.size ? `?${busca}` : ""}${loja ? `#loja-${loja}` : ""}`);
}
// O tipo gerado não marca como opcionais os parâmetros que o banco aceita nulos.
const ouNulo = (valor: string | null) => valor as unknown as string;
const campos = (dados: FormData, nomes: readonly string[]) => Object.fromEntries(nomes.map((n) => [n, dados.get(n)]));

export async function criarLoja(dados: FormData) {
  const r = validarNovaLoja(campos(dados, ["empresa", "codigo", "nome", "tipo", "cnpj", "uf", "cidade", "emissora", "motivo"]));
  if (!r.ok) voltar({ erro: r.erro, form: "nova" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("loja_criar", {
    p_empresa: d.empresa, p_codigo: d.codigo, p_nome: d.nome, p_tipo: d.tipo, p_cnpj: ouNulo(d.cnpj), p_uf: ouNulo(d.uf),
    p_cidade: ouNulo(d.cidade), p_emissora: ouNulo(d.emissora), p_motivo: d.motivo,
  });
  if (error) voltar({ erro: erroDeLojas(error), form: "nova" });
  const resposta = data as { id?: unknown; repetida?: unknown } | null;
  const id = ehUuid(resposta?.id) ? resposta.id : null;
  voltar({ ok: resposta?.repetida === true ? "repetida" : "criada", loja: id });
}

export async function atualizarLoja(dados: FormData) {
  const r = validarEdicao(campos(dados, ["unidade", "tipo", "nome", "cnpj", "uf", "cidade", "motivo"]));
  const unidade = ehUuid(dados.get("unidade")) ? (dados.get("unidade") as string) : null;
  if (!r.ok) voltar({ erro: r.erro, loja: unidade });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("loja_atualizar", {
    p_unidade: d.unidade, p_nome: d.nome, p_cnpj: ouNulo(d.cnpj), p_uf: ouNulo(d.uf), p_cidade: ouNulo(d.cidade), p_motivo: d.motivo,
  });
  if (error) voltar({ erro: erroDeLojas(error), loja: d.unidade });
  voltar({ ok: data === true ? "atualizada" : "sem_mudanca", loja: d.unidade });
}

export async function definirSituacao(dados: FormData) {
  const unidade = dados.get("unidade");
  const situacao = dados.get("situacao");
  const motivo = motivoDeLojas(dados.get("motivo"));
  if (!ehUuid(unidade) || (situacao !== "ativa" && situacao !== "inativa")) voltar({ erro: "dados" });
  if (!motivo) voltar({ erro: "motivo", loja: unidade });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("loja_definir_situacao", { p_unidade: unidade, p_situacao: situacao, p_motivo: motivo });
  if (error) {
    const erro = erroDeLojas(error);
    // As pendências vão como chaves do catálogo (a tela não repete o texto do banco).
    voltar({ erro, loja: unidade, falta: erro === "pendencias" ? pendenciasDaMensagem(error.message).join(".") : null });
  }
  voltar({ ok: data !== true ? "sem_mudanca" : situacao === "inativa" ? "inativada" : "reativada", loja: unidade });
}

export async function definirConfiguracao(dados: FormData) {
  const r = validarConfiguracao((nome) => dados.get(nome));
  const unidade = ehUuid(dados.get("unidade")) ? (dados.get("unidade") as string) : null;
  if (!r.ok) voltar({ erro: r.erro, loja: unidade });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("loja_definir_configuracao", {
    p_unidade: d.unidade, p_dados: d.dados as unknown as Json, p_vigente_desde: ouNulo(d.vigenteDesde), p_motivo: d.motivo,
  });
  if (error) voltar({ erro: erroDeLojas(error), loja: d.unidade });
  const repetida = (data as { repetida?: unknown } | null)?.repetida === true;
  voltar({ ok: repetida ? "configuracao_igual" : d.vigenteDesde ? "agendada" : "configurada", loja: d.unidade });
}

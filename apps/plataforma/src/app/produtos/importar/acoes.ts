"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDoBancoNaImportacao } from "../../../lib/importacao/regras";

// Aplicar, descartar e desfazer: cada ação chama UMA função do banco como a pessoa logada. O banco
// confere a permissão (importacao.aprovar para aplicar e desfazer), que quem aplica não gerou a
// prévia, que a comparação conferida ainda vale e que não há linha com erro, e grava a auditoria com o
// motivo. A tela nunca decide sozinha que aplicou: só repete o que o banco respondeu.

function voltar(importacao: string | null, parametros: Record<string, string | null>): never {
  const busca = new URLSearchParams();
  if (importacao) busca.set("importacao", importacao);
  for (const [chave, valor] of Object.entries(parametros)) if (valor) busca.set(chave, valor);
  redirect(`/produtos/importar${busca.size ? `?${busca}` : ""}`);
}
const motivoDe = (dados: FormData) => {
  const m = typeof dados.get("motivo") === "string" ? (dados.get("motivo") as string).trim().replace(/\s+/g, " ") : "";
  return m.length >= 3 && m.length <= 200 ? m : null;
};
// A comparação que a pessoa conferiu vai escondida no formulário (R2): número inteiro a partir de 1.
const comparacaoDe = (dados: FormData) => {
  const c = dados.get("comparacao");
  return typeof c === "string" && /^[1-9]\d{0,8}$/.test(c) ? Number(c) : null;
};
const contagem = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** O que toda ação confere antes de chamar o banco: a importação, o motivo e a sessão com loja. */
async function preparar(dados: FormData) {
  const importacao = dados.get("importacao");
  if (!ehUuid(importacao)) voltar(null, { erro: "dados" });
  const motivo = motivoDe(dados);
  if (!motivo) voltar(importacao, { erro: "motivo" });
  return { importacao, motivo };
}

export async function aplicarImportacao(dados: FormData) {
  const { importacao, motivo } = await preparar(dados);
  // Sem a comparação conferida (aba aberta desde antes desta versão, ou formulário mexido) nada é mandado:
  // a tela recarrega com a prévia atual e o campo certo.
  const comparacao = comparacaoDe(dados);
  if (comparacao === null) voltar(importacao, { erro: "conferencia" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("importacao_aplicar", { p_importacao: importacao, p_motivo: motivo, p_comparacao: comparacao });
  if (error) voltar(importacao, { erro: erroDoBancoNaImportacao(error) });
  const r = data as { repetida?: unknown; atualizada?: unknown } | null;
  if (r?.repetida === true) voltar(importacao, { ok: "ja_aplicada" });
  // O cadastro mudou depois da conferência: o banco não aplicou nada e já gravou a comparação nova.
  if (r?.atualizada === true) voltar(importacao, { erro: "desatualizada" });
  // Só "aplicada" quando o banco disse, com todas as letras, que aplicou agora.
  if (r?.repetida !== false || r.atualizada !== false) voltar(importacao, { erro: "falha" });
  voltar(importacao, { ok: "aplicada" });
}

export async function descartarImportacao(dados: FormData) {
  const { importacao, motivo } = await preparar(dados);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("importacao_descartar", { p_importacao: importacao, p_motivo: motivo });
  if (error) voltar(importacao, { erro: erroDoBancoNaImportacao(error) });
  // O banco responde verdadeiro (descartou agora) ou falso (já estava descartada): nos dois, nada entrou.
  if (typeof data !== "boolean") voltar(importacao, { erro: "falha" });
  voltar(importacao, { ok: "descartada" });
}

export async function desfazerImportacao(dados: FormData) {
  const { importacao, motivo } = await preparar(dados);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("importacao_desfazer", { p_importacao: importacao, p_motivo: motivo });
  if (error) voltar(importacao, { erro: erroDoBancoNaImportacao(error) });
  const r = data as { repetida?: unknown; parciais?: unknown; mantidas?: unknown } | null;
  if (r?.repetida === true) voltar(importacao, { ok: "ja_desfeita" });
  if (r?.repetida !== false) voltar(importacao, { erro: "falha" });
  // Linha que voltou só em parte, ou que ficou como estava, é dita na tela: o desfazer não promete tudo.
  voltar(importacao, { ok: contagem(r?.parciais) + contagem(r?.mantidas) > 0 ? "desfeita_parcial" : "desfeita" });
}

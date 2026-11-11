"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDoBancoNaImportacao } from "../../../lib/importacao/regras";

// Aplicar, descartar e desfazer: cada ação chama UMA função do banco como a pessoa logada. O banco
// confere a permissão (importacao.aprovar para aplicar e desfazer), que quem aplica não gerou a
// prévia e que não há linha com erro, e grava a auditoria com o motivo.

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

async function executar(dados: FormData, funcao: "importacao_aplicar" | "importacao_descartar" | "importacao_desfazer", ok: (data: unknown) => string) {
  const importacao = dados.get("importacao");
  if (!ehUuid(importacao)) voltar(null, { erro: "dados" });
  const motivo = motivoDe(dados);
  if (!motivo) voltar(importacao, { erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc(funcao, { p_importacao: importacao, p_motivo: motivo });
  if (error) voltar(importacao, { erro: erroDoBancoNaImportacao(error) });
  voltar(importacao, { ok: ok(data) });
}

export async function aplicarImportacao(dados: FormData) {
  await executar(dados, "importacao_aplicar", (d) => ((d as { repetida?: unknown } | null)?.repetida === true ? "ja_aplicada" : "aplicada"));
}

export async function descartarImportacao(dados: FormData) {
  await executar(dados, "importacao_descartar", () => "descartada");
}

export async function desfazerImportacao(dados: FormData) {
  await executar(dados, "importacao_desfazer", (d) => {
    const r = d as { repetida?: unknown; mantidas?: unknown } | null;
    if (r?.repetida === true) return "ja_desfeita";
    return typeof r?.mantidas === "number" && r.mantidas > 0 ? "desfeita_parcial" : "desfeita";
  });
}

import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { redirecionar } from "../../../../lib/acesso/redirecionar";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { montarLinhas } from "../../../../lib/importacao/catalogo";
import { ErroDoCsv, LIMITES_DO_CSV, lerCsv } from "../../../../lib/importacao/csv";
import { erroDoBancoNaImportacao, lerEnvio, mapeamentoParaGravar } from "../../../../lib/importacao/regras";

export const dynamic = "force-dynamic";

const voltar = (parametros: Record<string, string>) => redirecionar(`/produtos/importar?${new URLSearchParams(parametros)}`);

// Envio da planilha (lote L3c: ORA-CAT-002). Rota própria, e não ação do servidor, por causa do
// tamanho do arquivo (até 5 MB). O servidor relê o arquivo inteiro (a tela só leu o cabeçalho), calcula
// a impressão digital (SHA-256), monta as linhas com o mapeamento e grava a PRÉVIA no banco, que
// valida tudo de novo. Nada entra no catálogo aqui: aplicar é outra pessoa, em outra etapa.
export async function POST(requisicao: NextRequest) {
  // Só formulário desta mesma origem (além do cookie SameSite=Lax da sessão).
  const origem = requisicao.headers.get("origin");
  const host = requisicao.headers.get("x-forwarded-host") ?? requisicao.headers.get("host");
  if (origem && host && new URL(origem).host !== host) return new Response("Origem não permitida", { status: 403 });

  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  const tamanho = Number(requisicao.headers.get("content-length") ?? "0");
  if (tamanho > LIMITES_DO_CSV.bytes + 64 * 1024) return voltar({ erro: "grande" });
  let dados: FormData;
  try {
    dados = await requisicao.formData();
  } catch {
    return voltar({ erro: "arquivo" });
  }
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return voltar({ erro: arquivo instanceof File ? "vazio" : "arquivo" });
  if (arquivo.size > LIMITES_DO_CSV.bytes) return voltar({ erro: "grande" });
  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  let planilha;
  try {
    planilha = lerCsv(bytes);
  } catch (e) {
    return voltar({ erro: e instanceof ErroDoCsv ? e.motivo : "arquivo" });
  }
  const lido = lerEnvio(dados, planilha.cabecalho.length);
  if (!lido.ok) return voltar({ erro: lido.erro });
  if (planilha.linhas.length === 0) return voltar({ erro: "vazio" });

  const unidade = await supabase.from("unidades").select("organizacao_id").eq("id", situacao.unidade_id as string).maybeSingle();
  if (unidade.error || !unidade.data) return voltar({ erro: "falha" });
  const linhas = montarLinhas(planilha, lido.envio.mapa, lido.envio.padroes);
  const { data, error } = await supabase.rpc("importacao_catalogo_previa", {
    p_organizacao: unidade.data.organizacao_id,
    p_arquivo_nome: arquivo.name.slice(0, 200) || "planilha.csv",
    p_sha256: createHash("sha256").update(bytes).digest("hex"),
    p_mapeamento: mapeamentoParaGravar(planilha.cabecalho, lido.envio.mapa, lido.envio.padroes),
    p_linhas: linhas,
  });
  if (error) return voltar({ erro: erroDoBancoNaImportacao(error) });
  const resposta = data as { id?: unknown; repetida?: unknown } | null;
  const id = typeof resposta?.id === "string" ? resposta.id : "";
  return voltar({ importacao: id, ok: resposta?.repetida === true ? "previa_repetida" : "previa" });
}

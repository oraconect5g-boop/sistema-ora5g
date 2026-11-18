import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { redirecionar } from "../../../../lib/acesso/redirecionar";
import { permite } from "../../../../lib/acesso/molde";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { LINHAS_POR_LOJA, lerMapaDaCarga, linhasDaCarga, mapaDaCargaParaGravar } from "../../../../lib/estoque/carga";
import { corteDoFormulario, erroDaCarga, erroDaPlanilhaNaCarga } from "../../../../lib/estoque/carga-regras";
import { lojasDaCarga } from "../../../../lib/estoque/carga-lojas";
import { ErroDaPlanilha, LIMITES_DA_PLANILHA } from "../../../../lib/importacao/csv";
import { descomprimirNoServidor } from "../../../../lib/importacao/descomprimir-servidor";
import { lerPlanilha } from "../../../../lib/importacao/planilha";
import type { Json } from "../../../../lib/supabase/tipos-banco";

export const dynamic = "force-dynamic";

const voltar = (parametros: Record<string, string>) => redirecionar(`/estoque/carga?${new URLSearchParams(parametros)}`);

// Envio do relatório de produtos para a carga do estoque inicial por loja (lote REIN-b; ADR-021). Rota própria, e não
// ação do servidor, por causa do tamanho do arquivo (até 5 MB). O servidor relê o arquivo inteiro (a tela só leu o
// cabeçalho), calcula a impressão digital (SHA-256), monta as linhas de cada loja com o mapeamento e grava uma PRÉVIA por
// loja no banco, que classifica e confere tudo de novo. Nada entra no estoque aqui: aplicar é outra pessoa (o dono), em
// outra etapa.
export async function POST(requisicao: NextRequest) {
  const origem = requisicao.headers.get("origin");
  const host = requisicao.headers.get("x-forwarded-host") ?? requisicao.headers.get("host");
  if (origem && host && new URL(origem).host !== host) return new Response("Origem não permitida", { status: 403 });

  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const pode = permite(sessao, "importacao.executar");
  if (!pode) return voltar({ erro: "permissao" });
  const tamanho = Number(requisicao.headers.get("content-length") ?? "0");
  if (tamanho > LIMITES_DA_PLANILHA.bytes + 64 * 1024) return voltar({ erro: "grande" });
  let dados: FormData;
  try {
    dados = await requisicao.formData();
  } catch {
    return voltar({ erro: "arquivo" });
  }
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return voltar({ erro: arquivo instanceof File ? "vazio" : "arquivo" });
  if (arquivo.size > LIMITES_DA_PLANILHA.bytes) return voltar({ erro: "grande" });
  const corte = corteDoFormulario(dados.get("corte"));
  if (corte === null) return voltar({ erro: "corte" });
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let planilha;
  try {
    planilha = await lerPlanilha(bytes, descomprimirNoServidor);
  } catch (e) {
    return voltar({ erro: e instanceof ErroDaPlanilha ? erroDaPlanilhaNaCarga(e.motivo) : "arquivo" });
  }

  const lojas = await lojasDaCarga(supabase);
  if (lojas === null) return voltar({ erro: "falha" });
  const mapa = lerMapaDaCarga((n) => dados.get(n), planilha.cabecalho.length, lojas);
  if (!mapa) return voltar({ erro: "mapeamento" });
  const { porLoja, deFora } = linhasDaCarga(planilha, mapa);
  const comLinhas = Object.entries(porLoja).filter(([, linhas]) => linhas.length > 0);
  if (comLinhas.length === 0) return voltar({ erro: "nenhuma" });
  if (comLinhas.some(([, linhas]) => linhas.length > LINHAS_POR_LOJA)) return voltar({ erro: "linhas" });

  const unidade = await supabase.from("unidades").select("organizacao_id").eq("id", situacao.unidade_id as string).maybeSingle();
  if (unidade.error || !unidade.data) return voltar({ erro: "falha" });
  const impressao = createHash("sha256").update(bytes).digest("hex");
  const nomeDoArquivo = arquivo.name.slice(0, 200).trim() || (planilha.formato === "xlsx" ? "relatorio.xlsx" : "relatorio.csv");
  let cargas = 0;
  let repetidas = 0;
  for (const [loja, linhas] of comLinhas) {
    const mapeamento: { [chave: string]: Json } = { formato: planilha.formato, colunas: mapaDaCargaParaGravar(planilha.cabecalho, mapa, loja) };
    if (deFora !== null) mapeamento.fora = { linha: planilha.numeros[deFora.posicao] ?? deFora.posicao + 2, motivo: deFora.motivo };
    const { data, error } = await supabase.rpc("estoque_carga_previa", {
      p_organizacao: unidade.data.organizacao_id, p_unidade: loja, p_arquivo_nome: nomeDoArquivo, p_sha256: impressao, p_corte: corte,
      p_mapeamento: mapeamento, p_linhas: linhas as unknown as Json,
    });
    if (error) return voltar({ erro: erroDaCarga(error), ...(cargas + repetidas > 0 ? { cargas: String(cargas + repetidas) } : {}) });
    const resposta = data as { id?: unknown; repetida?: unknown } | null;
    if (typeof resposta?.id !== "string") return voltar({ erro: "falha" });
    if (resposta.repetida === true) repetidas += 1;
    else cargas += 1;
  }
  return voltar({ ok: "previa", cargas: String(cargas), repetidas: String(repetidas) });
}

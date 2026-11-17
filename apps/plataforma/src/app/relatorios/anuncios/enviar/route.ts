import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { redirecionar } from "../../../../lib/acesso/redirecionar";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { LINHAS_DO_ARQUIVO_DE_ANUNCIOS, lerMapaDosAnuncios, mapaDosAnunciosParaGravar, montarLinhasDosAnuncios } from "../../../../lib/anuncios/leitura";
import { erroDaPlanilhaNosAnuncios, erroDosAnuncios } from "../../../../lib/anuncios/regras";
import { ErroDaPlanilha, LIMITES_DA_PLANILHA } from "../../../../lib/importacao/csv";
import { descomprimirNoServidor } from "../../../../lib/importacao/descomprimir-servidor";
import { lerPlanilha } from "../../../../lib/importacao/planilha";
import type { Json } from "../../../../lib/supabase/tipos-banco";

export const dynamic = "force-dynamic";

const voltar = (parametros: Record<string, string>) => redirecionar(`/relatorios/anuncios?${new URLSearchParams(parametros)}`);

// Envio do relatório do Gerenciador de Anúncios (lote META-a: ORA-META-001 por arquivo; ADR-017). Rota própria, e não
// ação do servidor, por causa do tamanho do arquivo (até 5 MB). O servidor relê o arquivo inteiro, monta as linhas com o
// mapeamento, confere que o arquivo vem por dia e grava com a impressão digital (SHA-256: o mesmo arquivo devolve a mesma
// importação). O banco soma o mesmo dia da mesma campanha e substitui o dia que já existia.
export async function POST(requisicao: NextRequest) {
  const origem = requisicao.headers.get("origin");
  const host = requisicao.headers.get("x-forwarded-host") ?? requisicao.headers.get("host");
  if (origem && host && new URL(origem).host !== host) return new Response("Origem não permitida", { status: 403 });

  const { supabase, molde } = await obterSessao({ exigirLoja: true });
  if (!molde.permissoes.has("resultado.ver")) return voltar({ erro: "permissao" });
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
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let planilha;
  try {
    planilha = await lerPlanilha(bytes, descomprimirNoServidor);
  } catch (e) {
    return voltar({ erro: e instanceof ErroDaPlanilha ? erroDaPlanilhaNosAnuncios(e.motivo) : "arquivo" });
  }
  const mapa = lerMapaDosAnuncios((n) => dados.get(n), planilha.cabecalho.length);
  if (!mapa) return voltar({ erro: "mapeamento" });
  const lidas = montarLinhasDosAnuncios(planilha, mapa);
  const [problema] = lidas.problemas;
  if (problema) return voltar({ erro: "linha", linha: String(problema.numero), campo: problema.campo, texto: problema.texto });
  if (lidas.linhas.length === 0) return voltar({ erro: "nenhuma" });
  if (lidas.linhas.length > LINHAS_DO_ARQUIVO_DE_ANUNCIOS) return voltar({ erro: "linhas" });
  const mapeamento: { [chave: string]: Json } = { formato: planilha.formato, ...mapaDosAnunciosParaGravar(planilha.cabecalho, mapa) };
  if (lidas.deFora > 0) mapeamento.de_fora = lidas.deFora;

  const { data, error } = await supabase.rpc("anuncios_importar", {
    p_plataforma: "meta",
    p_arquivo: arquivo.name.slice(0, 200) || "relatorio",
    p_impressao: createHash("sha256").update(bytes).digest("hex"),
    p_linhas: lidas.linhas as unknown as Json,
    p_mapeamento: mapeamento,
  });
  if (error) return voltar({ erro: erroDosAnuncios(error) });
  const resposta = data as { importacao?: unknown; repetido?: unknown; campanhas?: unknown; dias_de_campanha?: unknown; substituidos?: unknown } | null;
  if (typeof resposta?.importacao !== "string") return voltar({ erro: "falha" });
  const numero = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : "0");
  return voltar(resposta.repetido === true ? { ok: "repetido" } : {
    ok: "importado", campanhas: numero(resposta.campanhas), dias: numero(resposta.dias_de_campanha), substituidos: numero(resposta.substituidos),
  });
}

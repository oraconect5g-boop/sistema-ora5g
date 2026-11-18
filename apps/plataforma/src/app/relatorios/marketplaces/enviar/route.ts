import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { redirecionar } from "../../../../lib/acesso/redirecionar";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { ErroDaPlanilha, LIMITES_DA_PLANILHA } from "../../../../lib/importacao/csv";
import { descomprimirNoServidor } from "../../../../lib/importacao/descomprimir-servidor";
import { lerPlanilha } from "../../../../lib/importacao/planilha";
import {
  CANAIS_DOS_MARKETPLACES, LINHAS_DO_ARQUIVO_DO_MARKETPLACE, MODOS_DOS_VALORES, lerMapaDoMarketplace, mapaDoMarketplaceParaGravar, montarPedidosDoMarketplace,
  type CanalDoMarketplace, type ModoDosValores,
} from "../../../../lib/marketplaces/leitura";
import { erroDaPlanilhaNosMarketplaces, erroDosMarketplaces } from "../../../../lib/marketplaces/regras";
import type { Json } from "../../../../lib/supabase/tipos-banco";

export const dynamic = "force-dynamic";

const voltar = (parametros: Record<string, string>) => redirecionar(`/relatorios/marketplaces?${new URLSearchParams(parametros)}`);

// Envio do relatório de vendas de um marketplace (lote MKTPL-a: ORA-MKTPL-003 e ORA-MKTPL-005 por arquivo; ADR-018). Rota
// própria, e não ação do servidor, por causa do tamanho do arquivo (até 5 MB). O servidor relê o arquivo inteiro, junta as
// linhas de cada pedido e grava com a impressão digital (SHA-256: o mesmo arquivo devolve a mesma importação). O banco
// atualiza o pedido que já existe (o mesmo número nunca vira dois pedidos) e liga os itens ao catálogo.
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
  const canal = dados.get("canal");
  if (typeof canal !== "string" || !Object.hasOwn(CANAIS_DOS_MARKETPLACES, canal)) return voltar({ erro: "canal" });
  const modo = dados.get("modo");
  if (typeof modo !== "string" || !Object.hasOwn(MODOS_DOS_VALORES, modo)) return voltar({ erro: "modo" });
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return voltar({ erro: arquivo instanceof File ? "vazio" : "arquivo" });
  if (arquivo.size > LIMITES_DA_PLANILHA.bytes) return voltar({ erro: "grande" });
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let planilha;
  try {
    planilha = await lerPlanilha(bytes, descomprimirNoServidor);
  } catch (e) {
    return voltar({ erro: e instanceof ErroDaPlanilha ? erroDaPlanilhaNosMarketplaces(e.motivo) : "arquivo" });
  }
  const mapa = lerMapaDoMarketplace((n) => dados.get(n), planilha.cabecalho.length);
  if (!mapa) return voltar({ erro: "mapeamento" });
  const lidos = montarPedidosDoMarketplace(planilha, mapa, modo as ModoDosValores);
  const [problema] = lidos.problemas;
  if (problema) return voltar({ erro: "linha", linha: String(problema.numero), campo: problema.campo, texto: problema.texto });
  if (lidos.pedidos.length === 0) return voltar({ erro: "nenhuma" });
  if (lidos.linhas > LINHAS_DO_ARQUIVO_DO_MARKETPLACE) return voltar({ erro: "linhas" });
  const mapeamento: { [chave: string]: Json } = { formato: planilha.formato, ...mapaDoMarketplaceParaGravar(planilha.cabecalho, mapa, modo as ModoDosValores) };
  if (lidos.deFora > 0) mapeamento.de_fora = lidos.deFora;

  const { data, error } = await supabase.rpc("marketplace_importar", {
    p_canal: canal as CanalDoMarketplace,
    p_arquivo: arquivo.name.slice(0, 200) || "vendas",
    p_impressao: createHash("sha256").update(bytes).digest("hex"),
    p_linhas: lidos.linhas,
    p_pedidos: lidos.pedidos as unknown as Json,
    p_mapeamento: mapeamento,
  });
  if (error) return voltar({ erro: erroDosMarketplaces(error) });
  const resposta = data as { importacao?: unknown; repetido?: unknown; pedidos?: unknown; novos?: unknown; atualizados?: unknown } | null;
  if (typeof resposta?.importacao !== "string") return voltar({ erro: "falha" });
  const numero = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : "0");
  return voltar(resposta.repetido === true ? { ok: "repetido" } : { ok: "importado", novos: numero(resposta.novos), atualizados: numero(resposta.atualizados) });
}

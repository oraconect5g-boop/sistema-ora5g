"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import type { ErroDeFoto } from "../../lib/catalogo/fotos";
import { APAGAR_DE_CADA_VEZ } from "../../lib/catalogo/fotos-sem-registro";
import { MAXIMO_DO_LOTE, skuDoArquivo, type DestinoDaFoto } from "../../lib/catalogo/lote-de-fotos";
import { lerPorIds } from "../../lib/leitura-completa";

// Depois do envio ao Storage: o banco confere permissão, caminho e o arquivo, e troca a foto em uso.
export async function registrarFoto(dados: { produto: string; variante: string | null; caminho: string; largura: number; altura: number }):
  Promise<{ ok: true } | { ok: false; erro: ErroDeFoto }> {
  if (!ehUuid(dados.produto) || (dados.variante !== null && !ehUuid(dados.variante)) || typeof dados.caminho !== "string"
      || !Number.isInteger(dados.largura) || !Number.isInteger(dados.altura)) {
    return { ok: false, erro: "registro" };
  }
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("registrar_foto", {
    p_produto: dados.produto,
    // Foto do produto inteiro vai sem variante (null); o tipo gerado não marca o parâmetro como opcional.
    p_variante: dados.variante as string,
    p_caminho: dados.caminho, p_largura: dados.largura, p_altura: dados.altura,
  });
  if (error) return { ok: false, erro: error.code === "42501" ? "permissao" : "registro" };
  revalidatePath("/catalogo");
  return { ok: true };
}

/**
 * Fotos em lote (CAT-010): para cada SKU, para onde vai a foto, pelas leituras de quem pede (o catálogo da rede dela).
 * A cor da variação quando o produto ativo tem duas cores ou mais e a variação tem cor; senão, o produto (como no
 * catálogo e nas pendências de foto). Só variações e produtos ativos. Sem catalogo.fotos na loja do turno: recusa.
 */
export async function localizarDestinos(skus: string[]): Promise<{ ok: true; destinos: DestinoDaFoto[] } | { ok: false; erro: "dados" | "permissao" | "falha" }> {
  if (!Array.isArray(skus) || skus.length === 0 || skus.length > MAXIMO_DO_LOTE || !skus.every((s) => typeof s === "string" && skuDoArquivo(s) === s)) {
    return { ok: false, erro: "dados" };
  }
  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  const pode = await supabase.rpc("tem_permissao", { p_permissao: "catalogo.fotos", p_unidade: situacao.unidade_id as string });
  if (pode.error) return { ok: false, erro: "falha" };
  if (!pode.data) return { ok: false, erro: "permissao" };
  const procurados = new Set(skus.map((s) => s.toLowerCase()));
  // ilike sem curinga do nome (o nome só tem letras, números, ponto, hífen e sublinhado): o sublinhado pode trazer a
  // mais, nunca a menos; a igualdade sem diferença de maiúsculas é conferida aqui.
  const achadas = await supabase.from("variantes").select("id, produto_id, sku, nome, cor").eq("ativa", true).ilikeAnyOf("sku", [...procurados]).order("sku").limit(1000);
  if (achadas.error || !achadas.data) {
    console.error("catálogo: falha ao localizar os SKUs das fotos", { codigo: achadas.error?.code || null });
    return { ok: false, erro: "falha" };
  }
  const variantes = achadas.data.filter((v) => procurados.has(v.sku.toLowerCase()));
  const ids = [...new Set(variantes.map((v) => v.produto_id))];
  if (ids.length === 0) return { ok: true, destinos: [] };
  const [produtos, cores, fotos] = await Promise.all([
    lerPorIds(ids, (lote, de, ate) => supabase.from("produtos").select("id, nome, organizacao_id").eq("ativo", true).in("id", lote).order("id").range(de, ate)),
    lerPorIds(ids, (lote, de, ate) => supabase.from("variantes").select("id, produto_id, cor").eq("ativa", true).not("cor", "is", null).in("produto_id", lote).order("id").range(de, ate)),
    lerPorIds(ids, (lote, de, ate) => supabase.from("fotos_produto").select("id, produto_id, variante_id").in("produto_id", lote).is("substituida_em", null).order("id").range(de, ate)),
  ]);
  if (!produtos.ok || !cores.ok || !fotos.ok) {
    console.error("catálogo: falha ao ler os produtos das fotos em lote", { codigo: (!produtos.ok ? produtos.erro.code : !cores.ok ? cores.erro.code : !fotos.ok ? fotos.erro.code : null) || null });
    return { ok: false, erro: "falha" };
  }
  const destinos: DestinoDaFoto[] = [];
  for (const v of variantes) {
    const produto = produtos.linhas.find((p) => p.id === v.produto_id);
    if (!produto) continue;
    const quantasCores = new Set(cores.linhas.filter((c) => c.produto_id === produto.id && c.cor).map((c) => (c.cor as string).toLowerCase())).size;
    const daCor = quantasCores >= 2 && Boolean(v.cor);
    const variante = daCor ? v.id : null;
    destinos.push({
      sku: v.sku, organizacao: produto.organizacao_id, produto: produto.id, variante,
      rotulo: daCor ? `${v.nome}: foto da cor ${v.cor}` : `${produto.nome}: foto do produto`,
      temFoto: fotos.linhas.some((f) => f.produto_id === produto.id && f.variante_id === variante),
    });
  }
  return { ok: true, destinos };
}

/**
 * CAT-011b: limpa os arquivos de foto enviados sem registro. O banco lista e confere (tudo ou nada, com a auditoria), e
 * a API do Storage apaga, como a pessoa logada (a regra do Storage confere de novo cada arquivo), de 100 em 100. Volta
 * para as fotos em lote com quantos foram apagados.
 */
export async function limparFotosSemRegistro(): Promise<void> {
  const { supabase } = await obterSessao({ exigirLoja: true });
  const volta = (parametros: string): never => redirect(`/catalogo/lote?${parametros}#limpeza`);
  const lista = await supabase.rpc("fotos_sem_registro");
  if (lista.error) volta(`limpeza=${lista.error.code === "42501" ? "permissao" : "falha"}`);
  const arquivos = (lista.data as { arquivos?: { caminho?: unknown }[] } | null)?.arquivos;
  const caminhos = Array.isArray(arquivos) ? arquivos.flatMap((a) => (typeof a?.caminho === "string" ? [a.caminho] : [])) : [];
  if (caminhos.length === 0) volta("limpeza=nada");
  const pedido = await supabase.rpc("fotos_sem_registro_limpar", { p_caminhos: caminhos });
  if (pedido.error) {
    console.error("catálogo: o banco não liberou a limpeza das fotos", { codigo: pedido.error.code || null });
    volta(`limpeza=${pedido.error.code === "42501" ? "permissao" : "falha"}`);
  }
  const liberados = ((pedido.data as { caminhos?: unknown } | null)?.caminhos as unknown[] | undefined)?.filter((c): c is string => typeof c === "string") ?? [];
  for (let i = 0; i < liberados.length; i += APAGAR_DE_CADA_VEZ) {
    const r = await supabase.storage.from("produtos").remove(liberados.slice(i, i + APAGAR_DE_CADA_VEZ));
    if (r.error) {
      console.error("catálogo: o Storage não apagou as fotos sem registro", { codigo: (r.error as { statusCode?: string }).statusCode ?? null });
      break;
    }
  }
  // #98: o que saiu do Storage de fato fica marcado e na auditoria como removido; o que não saiu fica separado e pendente
  // (a próxima limpeza tenta de novo). O número mostrado é o conferido pelo banco, não o que a chamada disse.
  const conclusao = await supabase.rpc("fotos_limpeza_concluir", { p_caminhos: liberados });
  if (conclusao.error) {
    console.error("catálogo: o banco não conferiu a limpeza das fotos", { codigo: conclusao.error.code || null });
    volta("limpeza=falha");
  }
  const removidos = ((conclusao.data as { removidos?: unknown } | null)?.removidos as unknown[] | undefined)?.length ?? 0;
  if (removidos === 0) volta("limpeza=falha");
  volta(`apagados=${removidos}&de=${liberados.length}`);
}

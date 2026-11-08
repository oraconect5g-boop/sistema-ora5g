"use server";

import { revalidatePath } from "next/cache";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import type { ErroDeFoto } from "../../lib/catalogo/fotos";

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

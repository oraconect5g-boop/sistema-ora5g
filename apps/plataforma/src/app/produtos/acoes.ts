"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDoCadastro, validarNome, validarPolitica, validarProduto, validarVariante } from "../../lib/catalogo/cadastro";

// Cada ação chama UMA função do banco como a pessoa logada (sem chave secreta, ADR-002 §2.5).
// O banco confere a permissão (catalogo.gerir na rede; política de desconto com preco.alterar), a
// unicidade, o estoque e grava a auditoria com o motivo.

function voltar(parametros: Record<string, string | null | undefined>, ancora?: string | null): never {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) if (valor) busca.set(chave, valor);
  redirect(`/produtos${busca.size ? `?${busca}` : ""}${ancora ? `#${ancora}` : ""}`);
}
// O tipo gerado não marca como opcionais os parâmetros que o banco aceita nulos.
const ouNulo = <T,>(valor: T | null) => valor as unknown as T;
const campos = (dados: FormData) => Object.fromEntries([...dados.keys()].map((k) => [k, dados.get(k)]));
const busca = (dados: FormData) => (typeof dados.get("q") === "string" ? (dados.get("q") as string).slice(0, 60) : null);
const repetida = (data: unknown) => (data as { repetida?: unknown } | null)?.repetida === true;
const idDe = (data: unknown) => {
  const id = (data as { id?: unknown } | null)?.id;
  return ehUuid(id) ? id : null;
};

/** A organização onde a pessoa cadastra: a da loja do turno (o banco confere catalogo.gerir nela). */
async function organizacaoDaSessao() {
  const sessao = await obterSessao({ exigirLoja: true });
  const { data, error } = await sessao.supabase.from("unidades").select("organizacao_id").eq("id", sessao.situacao.unidade_id as string).maybeSingle();
  if (error || !data) voltar({ erro: "falha" });
  return { supabase: sessao.supabase, organizacao: data.organizacao_id };
}

export async function salvarCategoria(dados: FormData) {
  const r = validarNome(campos(dados));
  if (!r.ok) voltar({ erro: r.erro, q: busca(dados) }, "categorias");
  const { supabase, organizacao } = await organizacaoDaSessao();
  const d = r.dados;
  const { data, error } = await supabase.rpc("catalogo_salvar_categoria", {
    p_organizacao: organizacao, p_id: ouNulo(d.id), p_nome: d.nome, p_ativa: ouNulo(d.ativa), p_motivo: d.motivo,
  });
  if (error) voltar({ erro: erroDoCadastro(error), q: busca(dados) }, "categorias");
  voltar({ ok: repetida(data) ? "sem_mudanca" : d.id ? "categoria_alterada" : "categoria_criada", q: busca(dados) }, "categorias");
}

export async function salvarMarca(dados: FormData) {
  const r = validarNome(campos(dados));
  if (!r.ok) voltar({ erro: r.erro, q: busca(dados) }, "marcas");
  const { supabase, organizacao } = await organizacaoDaSessao();
  const d = r.dados;
  const { data, error } = await supabase.rpc("catalogo_salvar_marca", { p_organizacao: organizacao, p_id: ouNulo(d.id), p_nome: d.nome, p_motivo: d.motivo });
  if (error) voltar({ erro: erroDoCadastro(error), q: busca(dados) }, "marcas");
  voltar({ ok: repetida(data) ? "sem_mudanca" : d.id ? "marca_alterada" : "marca_criada", q: busca(dados) }, "marcas");
}

export async function definirPolitica(dados: FormData) {
  const r = validarPolitica(campos(dados));
  if (!r.ok) voltar({ erro: r.erro, q: busca(dados) }, "categorias");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("catalogo_definir_politica_desconto", {
    p_categoria: d.categoria, p_teto_pb: ouNulo(d.teto), p_margem_minima_pb: ouNulo(d.margem), p_motivo: d.motivo,
  });
  if (error) voltar({ erro: erroDoCadastro(error), q: busca(dados) }, "categorias");
  voltar({ ok: data === true ? "politica_alterada" : "sem_mudanca", q: busca(dados) }, "categorias");
}

// L12d: a categoria de peças da assistência (o item não entra em venda e só sai do estoque pela OS).
export async function definirPecaDeAssistencia(dados: FormData) {
  const categoria = dados.get("categoria");
  const peca = dados.get("peca");
  const motivo = typeof dados.get("motivo") === "string" ? (dados.get("motivo") as string).trim().replace(/\s+/g, " ") : "";
  if (!ehUuid(categoria) || (peca !== "sim" && peca !== "nao")) voltar({ erro: "dados", q: busca(dados) }, "categorias");
  if (motivo.length < 3 || motivo.length > 200) voltar({ erro: "motivo", q: busca(dados) }, "categorias");
  const { supabase, organizacao } = await organizacaoDaSessao();
  const { data, error } = await supabase.rpc("catalogo_definir_peca_de_assistencia", {
    p_organizacao: organizacao, p_categoria: categoria as string, p_peca: peca === "sim", p_motivo: motivo,
  });
  if (error) voltar({ erro: erroDoCadastro(error), q: busca(dados) }, "categorias");
  voltar({ ok: data === true ? "peca_alterada" : "sem_mudanca", q: busca(dados) }, "categorias");
}

export async function salvarProduto(dados: FormData) {
  const r = validarProduto(campos(dados));
  const alvo = ehUuid(dados.get("id")) ? `produto-${dados.get("id") as string}` : "novo-produto";
  if (!r.ok) voltar({ erro: r.erro, q: busca(dados), form: alvo === "novo-produto" ? "novo" : null }, alvo);
  const { supabase, organizacao } = await organizacaoDaSessao();
  const d = r.dados;
  const { data, error } = await supabase.rpc("catalogo_salvar_produto", {
    p_organizacao: organizacao, p_id: ouNulo(d.id), p_tipo: ouNulo(d.tipo), p_nome: d.nome, p_categoria: d.categoria, p_marca: ouNulo(d.marca),
    p_modelo: ouNulo(d.modelo), p_descricao: ouNulo(d.descricao), p_publicar_online: d.publicarOnline, p_ativo: ouNulo(d.ativo),
    p_chave: ouNulo(d.chave), p_motivo: d.motivo,
  });
  if (error) voltar({ erro: erroDoCadastro(error), q: busca(dados), form: alvo === "novo-produto" ? "novo" : null }, alvo);
  const id = idDe(data);
  // Produto novo: a tela abre nele (busca pelo nome) para cadastrar a primeira variação.
  voltar({ ok: repetida(data) ? (d.id ? "sem_mudanca" : "produto_repetido") : d.id ? "produto_alterado" : "produto_criado", q: d.id ? busca(dados) : d.nome }, id ? `produto-${id}` : null);
}

export async function salvarVariante(dados: FormData) {
  const r = validarVariante(campos(dados));
  const produto = ehUuid(dados.get("produto")) ? (dados.get("produto") as string) : null;
  if (!r.ok) voltar({ erro: r.erro, q: busca(dados) }, produto ? `produto-${produto}` : null);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("catalogo_salvar_variante", {
    p_produto: d.produto, p_id: ouNulo(d.id), p_sku: d.sku, p_nome: d.nome, p_cor: ouNulo(d.cor), p_capacidade: ouNulo(d.capacidade),
    p_codigo_barras: ouNulo(d.codigoBarras), p_estoque_minimo: d.estoqueMinimo, p_ativa: ouNulo(d.ativa), p_motivo: d.motivo,
  });
  if (error) voltar({ erro: erroDoCadastro(error), q: busca(dados) }, `produto-${d.produto}`);
  voltar({ ok: repetida(data) ? "sem_mudanca" : d.id ? "variante_alterada" : "variante_criada", q: busca(dados) }, `produto-${d.produto}`);
}

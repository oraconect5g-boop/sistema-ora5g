"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import {
  CAMPOS_REVELAVEIS, CANAIS, erroDoCliente, FINALIDADES_DE_CONTATO, FONTES, lerCliente, valorDaBusca,
  type CampoRevelavel, type DadosDoCliente, type ErroDoCliente,
} from "../../lib/clientes/regras";
import type { Json } from "../../lib/supabase/tipos-banco";

// Clientes (lote L5a). Cada ação chama UMA função do banco como a pessoa logada: o banco confere
// cliente.buscar ou cliente.cadastrar na loja do turno, registra cada busca, ficha e revelação na
// auditoria e guarda CPF, telefone e e-mail fora da tabela pública. Nada de dado pessoal no endereço
// (URL): a busca vai no corpo da requisição e o resultado volta só para quem buscou.

export type ClienteEncontrado = { id: string; numero: number; nome: string; tipo: string; documento: string | null; telefone: string | null; situacao: string };
export type ResultadoDaBusca = { situacao: "ok" | "limite" | "erro"; clientes: ClienteEncontrado[]; erro?: ErroDoCliente };

export async function buscarClientes(criterio: string, valor: string): Promise<ResultadoDaBusca> {
  const lido = valorDaBusca(String(criterio), String(valor ?? ""));
  if (!lido.ok) return { situacao: "erro", clientes: [], erro: "busca" };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("cliente_buscar", { p_criterio: lido.criterio, p_valor: lido.valor });
  if (error) return { situacao: "erro", clientes: [], erro: erroDoCliente(error) };
  const r = data as { situacao?: string; clientes?: ClienteEncontrado[] } | null;
  return r?.situacao === "limite" ? { situacao: "limite", clientes: [], erro: "limite" } : { situacao: "ok", clientes: r?.clientes ?? [] };
}

export type Revelado = { ok: true; campo: CampoRevelavel; valor: unknown } | { ok: false; erro: ErroDoCliente };
export async function revelarDado(cliente: string, campo: string): Promise<Revelado> {
  if (!ehUuid(cliente) || !Object.hasOwn(CAMPOS_REVELAVEIS, campo)) return { ok: false, erro: "dados" };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("cliente_revelar", { p_cliente: cliente, p_campo: campo });
  if (error) return { ok: false, erro: erroDoCliente(error) };
  return { ok: true, campo: campo as CampoRevelavel, valor: (data as { valor?: unknown } | null)?.valor ?? null };
}

// Formulário de cadastro e correção: com erro, os dados digitados voltam para a mesma tela (nada se perde).
export type EstadoDoFormulario = { erro: ErroDoCliente | null; valores: Record<string, string | string[]> };
const valoresDe = (dados: FormData) => {
  const valores: Record<string, string | string[]> = {};
  for (const chave of new Set(dados.keys())) {
    if (chave.startsWith("$") || chave === "chave") continue;
    const todos = dados.getAll(chave).filter((v): v is string => typeof v === "string").map((v) => v.slice(0, 200));
    valores[chave] = chave === "finalidade" || chave === "remover" ? todos : todos[0] ?? "";
  }
  return valores;
};

export async function salvarCliente(_estado: EstadoDoFormulario, dados: FormData): Promise<EstadoDoFormulario> {
  const id = dados.get("cliente");
  const edicao = ehUuid(id);
  const falhar = (erro: ErroDoCliente): EstadoDoFormulario => ({ erro, valores: valoresDe(dados) });
  const lido = lerCliente(dados, edicao);
  if (!lido.ok) return falhar(lido.erro);
  const motivo = typeof dados.get("motivo") === "string" ? (dados.get("motivo") as string).trim().replace(/\s+/g, " ") : "";
  if (edicao && (motivo.length < 3 || motivo.length > 200)) return falhar("motivo");
  const chave = dados.get("chave");
  const chaveValida = typeof chave === "string" && /^form:[0-9a-f-]{36}$/.test(chave) ? chave : `form:${randomUUID()}`;
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("cliente_salvar", {
    p_cliente: (edicao ? id : null) as string, p_dados: lido.dados as DadosDoCliente as unknown as Json,
    p_motivo: (edicao ? motivo : null) as string, p_chave: (edicao ? null : chaveValida) as string,
  });
  if (error) return falhar(erroDoCliente(error));
  const r = data as { id?: string; alterado?: boolean } | null;
  if (!r?.id) return falhar("falha");
  redirect(`/clientes/${r.id}?ok=${edicao ? (r.alterado ? "alterado" : "sem_mudanca") : "criado"}`);
}

export async function registrarConsentimento(dados: FormData) {
  const cliente = dados.get("cliente");
  const canal = dados.get("canal");
  const finalidade = dados.get("finalidade_contato");
  const fonte = dados.get("fonte");
  const decisao = dados.get("decisao");
  if (!ehUuid(cliente)) redirect("/clientes");
  if (typeof canal !== "string" || !Object.hasOwn(CANAIS, canal) || typeof finalidade !== "string" || !Object.hasOwn(FINALIDADES_DE_CONTATO, finalidade)
      || typeof fonte !== "string" || !Object.hasOwn(FONTES, fonte) || (decisao !== "concedido" && decisao !== "retirado")) {
    redirect(`/clientes/${cliente}?erro=dados`);
  }
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("cliente_consentir", {
    p_cliente: cliente, p_canal: canal, p_finalidade: finalidade, p_concedido: decisao === "concedido", p_fonte: fonte,
  });
  if (error) redirect(`/clientes/${cliente}?erro=${erroDoCliente(error)}`);
  redirect(`/clientes/${cliente}?ok=${data ? "consentimento" : "consentimento_igual"}`);
}

// Cliente de uma venda concluída: liga, troca ou tira (com motivo). Volta para a venda.
export async function vincularClienteNaVenda(dados: FormData) {
  const venda = dados.get("venda");
  const cliente = dados.get("cliente_id");
  const tirar = dados.get("tirar") === "sim";
  const motivo = typeof dados.get("motivo") === "string" ? (dados.get("motivo") as string).trim().replace(/\s+/g, " ") : "";
  if (!ehUuid(venda)) redirect("/vendas");
  if (!tirar && !ehUuid(cliente)) redirect(`/vendas/${venda}?erro=cliente`);
  if (motivo.length < 3 || motivo.length > 200) redirect(`/vendas/${venda}?erro=motivo`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("venda_vincular_cliente", { p_venda: venda, p_cliente: (tirar ? null : cliente) as string, p_motivo: motivo });
  if (error) redirect(`/vendas/${venda}?erro=${error.code === "P0002" ? "cliente" : error.code === "22023" ? "dados" : "falha"}`);
  redirect(`/vendas/${venda}?cliente=1`);
}

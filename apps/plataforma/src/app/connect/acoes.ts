"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehTipoOperacao, type TipoOperacao } from "@ora5g/dominio/nogle";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { documentoParaBuscar, erroDoCadastro, lerRespostaDoCadastro, type ErroDoCadastro, type EstadoDoCadastro } from "../../lib/connect/cadastro-da-nogle";
import { erroDoConnect, lerPedido } from "../../lib/connect/regras";
import type { Json } from "../../lib/supabase/tipos-banco";

// Cada ação chama UMA função do banco como a pessoa logada (ADR-005). O servidor web não fala
// com a Nogle: a operação fica registrada e o worker do servidor envia e consulta.
const chaveDe = (dados: FormData) => {
  const chave = dados.get("chave");
  return typeof chave === "string" && /^[0-9a-f-]{36}$/.test(chave) ? chave : randomUUID();
};
// CONNECT-m (as abas da demonstração): o erro volta para a aba do formulário, com o que foi recusado; o que deu certo vai
// para a aba Operações do dia (a operação registrada aparece lá) ou fica na aba Integração Nogle (a liberação).
const TELA_DO_TIPO: Record<TipoOperacao, string> = { ativacao: "/connect/ativar", recarga: "/connect/recarga", portabilidade: "/connect/portabilidade" };
const voltar = (erro: { code?: string } | null, ok: string, tela = "/connect", telaDoOk = "/connect"): never =>
  redirect(erro ? `${tela}?erro=${erroDoConnect(erro)}` : `${telaDoOk}?ok=${ok}`);

export async function registrarOperacao(dados: FormData) {
  const tipo = dados.get("tipo");
  if (!ehTipoOperacao(tipo)) redirect("/connect?erro=dados");
  const lido = lerPedido(tipo, dados);
  if (!lido.ok) redirect(`${TELA_DO_TIPO[tipo]}?erro=${lido.erro}`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_registrar", { p_tipo: tipo, p_pedido: lido.pedido as Json, p_chave: chaveDe(dados) });
  voltar(error, "registrada", TELA_DO_TIPO[tipo]);
}

export async function cancelarOperacao(dados: FormData) {
  const operacao = dados.get("operacao");
  const motivo = dados.get("motivo");
  if (!ehUuid(operacao)) redirect("/connect?erro=dados");
  if (typeof motivo !== "string" || motivo.trim().length < 3) redirect("/connect?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_cancelar", { p_operacao: operacao, p_motivo: motivo.trim() });
  voltar(error, "cancelada");
}

export async function resolverOperacao(dados: FormData) {
  const operacao = dados.get("operacao");
  const resultado = dados.get("resultado");
  const motivo = dados.get("motivo");
  if (!ehUuid(operacao) || (resultado !== "confirmada" && resultado !== "nao_recebida" && resultado !== "recusada")) redirect("/connect?erro=dados");
  if (typeof motivo !== "string" || motivo.trim().length < 10) redirect("/connect?erro=evidencia");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_resolver", { p_operacao: operacao, p_resultado: resultado, p_motivo: motivo.trim() });
  voltar(error, "resolvida");
}

export async function habilitarOperacao(dados: FormData) {
  const tipo = dados.get("tipo");
  const habilitar = dados.get("habilitar");
  const evidencia = dados.get("evidencia");
  if (!ehTipoOperacao(tipo) || (habilitar !== "sim" && habilitar !== "nao")) redirect("/connect/integracao?erro=dados");
  if (typeof evidencia !== "string" || evidencia.trim().length < 10) redirect("/connect/integracao?erro=evidencia");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_habilitar", { p_tipo: tipo, p_habilitar: habilitar === "sim", p_evidencia: evidencia.trim() });
  voltar(error, "habilitacao", "/connect/integracao", "/connect/integracao");
}

// AUD-f (auditoria de e7f55b2), item 1: a busca do cadastro do cliente na Nogle para preencher, chamada pelo componente da tela
// (BuscaNoCadastroDaNogle), não por formulário. O banco confere tudo (quem pede, a loja e a sessão do turno, o documento, o
// limite) e só devolve a resposta a quem pediu, na mesma loja e sessão, para o mesmo documento e por 15 minutos; o worker do
// servidor é quem fala com a Nogle. Nada aqui grava no cadastro de clientes do sistema.
export async function pedirCadastroDaNogle(documento: string, chave: string): Promise<{ ok: true; consulta: string } | { ok: false; erro: ErroDoCadastro }> {
  const d = documentoParaBuscar(documento);
  if (!d) return { ok: false, erro: "documento" };
  if (!ehUuid(String(chave))) return { ok: false, erro: "falha" };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("connect_consultar", { p_tipo: "cliente_cadastro", p_chave: chave, p_parametro: d });
  if (error || typeof data !== "string") return { ok: false, erro: erroDoCadastro(error) };
  return { ok: true, consulta: data };
}

export async function lerCadastroDaNogle(consulta: string, documento: string): Promise<EstadoDoCadastro> {
  const d = documentoParaBuscar(documento);
  if (!ehUuid(String(consulta)) || !d) return { estado: "descartada" };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("connect_cadastro_da_nogle", { p_consulta: consulta, p_documento: d });
  if (error) return { estado: "falhou", mensagem: "Não foi possível ler a busca agora: tente de novo." };
  return lerRespostaDoCadastro(data);
}

// Descarta a resposta e o documento no banco (ao usar a resposta, ao mudar o documento ou ao sair da tela). Sem resposta útil.
export async function descartarCadastroDaNogle(consulta: string): Promise<void> {
  if (!ehUuid(String(consulta))) return;
  const { supabase } = await obterSessao({ exigirLoja: true });
  await supabase.rpc("connect_cadastro_da_nogle_descartar", { p_consulta: consulta });
}

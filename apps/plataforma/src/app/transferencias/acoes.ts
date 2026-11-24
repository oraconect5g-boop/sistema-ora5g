"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import {
  ehDecisaoDaDivergencia, erroDaTransferencia, escreverLinhasDaRemessa, lerIdentificadores, lerQuantidade, linhasDoFormulario,
  MOTIVO_MINIMO_DA_DIVERGENCIA,
} from "../../lib/transferencias/regras";

// Pedidos internos de transferência (ADR-007, #60). Cada ação chama UMA função do banco como a
// pessoa logada; o banco confere loja, permissão, situação, saldo, IMEI/ICCID e idempotência.
const chaveDe = (dados: FormData) => {
  const chave = dados.get("chave");
  return typeof chave === "string" && /^[0-9a-f-]{36}$/.test(chave) ? chave : randomUUID();
};
const texto = (dados: FormData, nome: string, maximo = 500) => String(dados.get(nome) ?? "").trim().slice(0, maximo);
const voltar = (erro: { code?: string } | null, ok: string, destino = "/transferencias"): never =>
  redirect(erro ? `${destino}?erro=${erroDaTransferencia(erro)}` : `${destino}?ok=${ok}`);

export async function solicitarTransferencia(dados: FormData) {
  const origem = dados.get("origem");
  const destino = dados.get("destino");
  const variante = dados.get("variante");
  const quantidade = lerQuantidade(dados.get("quantidade"));
  const motivo = texto(dados, "motivo");
  // F24-03: o erro volta para a mesma busca e a mesma página da lista do estoque (só o que a tela manda, conferido).
  const comErro = (codigo: string) => {
    const p = new URLSearchParams();
    const q = dados.get("q");
    if (typeof q === "string" && q.trim()) p.set("q", q.trim().slice(0, 40));
    const pagina = dados.get("pagina");
    if (typeof pagina === "string" && /^[1-9]\d{0,3}$/.test(pagina)) p.set("pagina", pagina);
    if (ehUuid(variante)) p.set("variante", variante);
    p.set("erro_transferencia", codigo);
    return `/estoque?${p}`;
  };
  if (!ehUuid(origem) || !ehUuid(destino) || !ehUuid(variante) || quantidade === null) redirect(comErro("dados"));
  if (motivo.length < 3) redirect(comErro("motivo"));
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("transferencia_solicitar", {
    p_origem: origem, p_destino: destino, p_variante: variante, p_quantidade: quantidade, p_motivo: motivo, p_chave: chaveDe(dados),
  });
  if (error) redirect(comErro(erroDaTransferencia(error)));
  redirect("/transferencias?ok=pedida");
}

export async function separarTransferencia(dados: FormData) {
  const transferencia = dados.get("transferencia");
  const itens = dados.getAll("item").filter(ehUuid);
  if (!ehUuid(transferencia)) redirect("/transferencias?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("transferencia_separar", { p_transferencia: transferencia, p_itens: itens });
  voltar(error, "separada");
}

export async function enviarTransferencia(dados: FormData) {
  const transferencia = dados.get("transferencia");
  if (!ehUuid(transferencia)) redirect("/transferencias?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("transferencia_enviar", { p_transferencia: transferencia });
  voltar(error, "enviada");
}

export async function receberTransferencia(dados: FormData) {
  const transferencia = dados.get("transferencia");
  if (!ehUuid(transferencia)) redirect("/transferencias?erro=dados");
  const serializado = dados.get("serializado") === "sim";
  const identificadores = serializado ? lerIdentificadores(dados.get("identificadores")) : [];
  const quantidade = serializado ? null : lerQuantidade(dados.get("quantidade"), 0);
  if (identificadores === null || (!serializado && quantidade === null)) redirect("/transferencias?erro=dados");
  const observacao = texto(dados, "observacao");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("transferencia_receber", {
    p_transferencia: transferencia, p_identificadores: identificadores,
    // Acessório vai pela quantidade contada; aparelho e chip, pelos números lidos (quantidade nula).
    p_quantidade: quantidade as number, p_observacao: (observacao || null) as string,
  });
  voltar(error, "recebida");
}

/**
 * O que faltou no recebimento tem destino (lote TRF-d): chegou depois (o destino confere), voltou para a origem (a origem
 * confere) ou baixa (quem ajusta estoque na origem; vale para tudo o que ainda falta). O banco confere o lado, a permissão,
 * o que ainda falta e a chave (o segundo toque devolve o que já estava).
 */
export async function resolverDivergencia(dados: FormData) {
  const transferencia = dados.get("transferencia");
  const decisao = dados.get("decisao");
  if (!ehUuid(transferencia) || !ehDecisaoDaDivergencia(decisao)) redirect("/transferencias?erro=dados");
  const serializado = dados.get("serializado") === "sim";
  const baixa = decisao === "baixada";
  const identificadores = !baixa && serializado ? lerIdentificadores(dados.get("identificadores")) : [];
  const quantidade = !baixa && !serializado ? lerQuantidade(dados.get("quantidade")) : null;
  if (identificadores === null || (!baixa && serializado && identificadores.length === 0) || (!baixa && !serializado && quantidade === null)) {
    redirect("/transferencias?erro=dados");
  }
  const motivo = texto(dados, "motivo");
  if (motivo.length < MOTIVO_MINIMO_DA_DIVERGENCIA) redirect("/transferencias?erro=explicacao");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("transferencia_resolver_divergencia", {
    p_transferencia: transferencia, p_decisao: decisao, p_identificadores: identificadores,
    // Aparelho e chip vão pelos números lidos, e a baixa vale para tudo: a quantidade vai nula.
    p_quantidade: quantidade as number, p_motivo: motivo, p_chave: chaveDe(dados),
  });
  voltar(error, "divergencia");
}

export async function encerrarTransferencia(dados: FormData) {
  const transferencia = dados.get("transferencia");
  const situacao = dados.get("situacao");
  const motivo = texto(dados, "motivo");
  if (!ehUuid(transferencia) || (situacao !== "recusada" && situacao !== "cancelada")) redirect("/transferencias?erro=dados");
  if (motivo.length < 3) redirect("/transferencias?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("transferencia_encerrar", { p_transferencia: transferencia, p_situacao: situacao, p_motivo: motivo });
  voltar(error, situacao);
}

// A remessa (TRF-a): vários produtos de uma vez. O pedido volta para a tela de montar com as mesmas linhas se der erro.
export async function solicitarRemessa(dados: FormData) {
  const origem = dados.get("origem");
  const destino = dados.get("destino");
  const linhas = linhasDoFormulario(dados.getAll("variante"), dados.getAll("quantidade"));
  const motivo = texto(dados, "motivo");
  const deVolta = (codigo: string) => {
    const busca = new URLSearchParams({ erro: codigo });
    if (ehUuid(origem)) busca.set("origem", origem);
    if (ehUuid(destino)) busca.set("destino", destino);
    if (linhas) busca.set("linhas", escreverLinhasDaRemessa(linhas));
    return `/transferencias/remessa?${busca.toString()}`;
  };
  if (!ehUuid(origem) || !ehUuid(destino) || linhas === null) redirect(deVolta("dados"));
  if (motivo.length < 3) redirect(deVolta("motivo"));
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("transferencia_solicitar_remessa", {
    p_origem: origem, p_destino: destino, p_itens: linhas, p_motivo: motivo, p_chave: chaveDe(dados),
  });
  if (error) redirect(deVolta(erroDaTransferencia(error)));
  redirect("/transferencias?ok=remessa");
}

export async function enviarRemessa(dados: FormData) {
  const remessa = dados.get("remessa");
  if (!ehUuid(remessa)) redirect("/transferencias?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("transferencia_remessa_enviar", { p_remessa: remessa });
  voltar(error, "remessa_enviada");
}

"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDaTransferencia, lerIdentificadores, lerQuantidade } from "../../lib/transferencias/regras";

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
  const comErro = (codigo: string) => (ehUuid(variante) ? `/estoque?variante=${variante}&erro_transferencia=${codigo}` : `/estoque?erro_transferencia=${codigo}`);
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

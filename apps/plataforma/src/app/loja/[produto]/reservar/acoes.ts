"use server";

import { headers } from "next/headers";

import { ehUuidDaVitrine, organizacaoDaLoja } from "../../../../lib/loja/vitrine";
import {
  criarLimitador, enderecoDeQuemPede, erroDaReserva, nomeDoFormulario, whatsappDoFormulario, type ConfirmacaoDaReserva, type ErroDaReserva,
} from "../../../../lib/loja/reserva";
import { clienteSupabaseServidor } from "../../../../lib/supabase/servidor";

/** O que a pessoa digitou volta com o erro, para o formulário não esvaziar (o React limpa o formulário depois da ação). */
export type DigitadoNaReserva = { nome: string; whatsapp: string; aceite: boolean };
export type EstadoDaReserva =
  | { situacao: "vazio" }
  | { situacao: "erro"; erro: ErroDaReserva; digitado: DigitadoNaReserva }
  | { situacao: "pronta"; reserva: ConfirmacaoDaReserva };

const digitado = (dados: FormData): DigitadoNaReserva => {
  const campo = (nome: string, maximo: number) => { const v = dados.get(nome); return typeof v === "string" ? v.slice(0, maximo) : ""; };
  return { nome: campo("nome", 80), whatsapp: campo("whatsapp", 20), aceite: dados.get("aceite") === "sim" };
};

// Até 5 reservas por hora por endereço de internet (na memória do servidor), além dos limites do banco.
const limitar = criarLimitador();

// ONLINE-b (ORA-ONLINE-006; ADR-009): o visitante reserva sem login. O banco confere tudo de novo e decide; aqui, os
// dados do formulário, o aceite e o limite por endereço. Nada do que a pessoa digitou vai para log.
export async function reservarNoSite(_anterior: EstadoDaReserva, dados: FormData): Promise<EstadoDaReserva> {
  const recusa = (erro: ErroDaReserva): EstadoDaReserva => ({ situacao: "erro", erro, digitado: digitado(dados) });
  const variante = dados.get("variante");
  const loja = dados.get("loja");
  const chave = dados.get("chave");
  if (!ehUuidDaVitrine(variante) || !ehUuidDaVitrine(loja) || typeof chave !== "string" || !/^[0-9a-f-]{36}$/.test(chave)) {
    return recusa("falha");
  }
  const nome = nomeDoFormulario(dados.get("nome"));
  const whatsapp = whatsappDoFormulario(dados.get("whatsapp"));
  if (!nome || !whatsapp) return recusa("dados");
  if (dados.get("aceite") !== "sim") return recusa("aceite");
  const organizacao = organizacaoDaLoja();
  const supabase = organizacao ? await clienteSupabaseServidor() : null;
  if (!organizacao || !supabase) return recusa("falha");
  if (!limitar(enderecoDeQuemPede(await headers()))) return recusa("limite_rede");
  const { data, error } = await supabase.rpc("loja_reservar", {
    p_organizacao: organizacao, p_variante: variante, p_unidade: loja, p_nome: nome, p_whatsapp: whatsapp, p_chave: `site:${chave}`,
  });
  if (error || !data) {
    const erro = erroDaReserva(error);
    if (erro === "falha") console.error("loja: falha ao reservar", { codigo: error?.code });
    return recusa(erro);
  }
  return { situacao: "pronta", reserva: data as unknown as ConfirmacaoDaReserva };
}

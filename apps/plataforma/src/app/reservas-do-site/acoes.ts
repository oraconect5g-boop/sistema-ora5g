"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDaLoja, type ErroDaLoja } from "../../lib/loja/reserva";

export type EstadoDoContato = { situacao: "vazio" } | { situacao: "erro"; erro: ErroDaLoja } | { situacao: "pronto"; whatsapp: string };

// ONLINE-b (ORA-ONLINE-006; ADR-009): a loja atende as reservas do site. Cada ação chama UMA função do banco como a
// pessoa logada; o banco confere a loja do turno e a permissão de vender, e o WhatsApp revelado fica na auditoria.
export async function revelarContato(_anterior: EstadoDoContato, dados: FormData): Promise<EstadoDoContato> {
  const reserva = dados.get("reserva");
  if (!ehUuid(reserva)) return { situacao: "erro", erro: "nao_encontrada" };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("loja_reserva_contato", { p_reserva: reserva });
  if (error || typeof data !== "string") return { situacao: "erro", erro: erroDaLoja(error) };
  return { situacao: "pronto", whatsapp: data };
}

export async function cancelarReserva(dados: FormData) {
  const reserva = dados.get("reserva");
  const motivo = typeof dados.get("motivo") === "string" ? String(dados.get("motivo")).replace(/\s+/g, " ").trim() : "";
  if (!ehUuid(reserva)) redirect("/reservas-do-site?erro=nao_encontrada");
  if (motivo.length < 3 || motivo.length > 200) redirect("/reservas-do-site?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("loja_reserva_cancelar", { p_reserva: reserva, p_motivo: motivo });
  if (error) redirect(`/reservas-do-site?erro=${erroDaLoja(error)}`);
  redirect(`/reservas-do-site?ok=${data === false ? "ja_cancelada" : "cancelada"}`);
}

export async function atenderReserva(dados: FormData) {
  const reserva = dados.get("reserva");
  if (!ehUuid(reserva)) redirect("/reservas-do-site?erro=nao_encontrada");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("loja_reserva_atender", { p_reserva: reserva, p_chave: randomUUID() });
  if (error || !data) redirect(`/reservas-do-site?erro=${erroDaLoja(error)}`);
  const r = data as unknown as { preco_reservado_centavos: number; preco_atual_centavos: number | null };
  const atual = r.preco_atual_centavos ?? r.preco_reservado_centavos;
  redirect(`/vender?reserva=atendida&anunciado=${r.preco_reservado_centavos}&atual=${atual}`);
}

// ONLINE-d (ORA-ONLINE-002; ADR-023): o pedido do site sai inteiro, numa venda só, ou é cancelado inteiro.
export async function atenderPedido(dados: FormData) {
  const pedido = dados.get("pedido");
  if (!ehUuid(pedido)) redirect("/reservas-do-site?erro=nao_encontrada");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("loja_pedido_atender", { p_pedido: pedido, p_chave: randomUUID() });
  if (error || !data) redirect(`/reservas-do-site?erro=${erroDaLoja(error)}`);
  const r = data as unknown as { total_reservado_centavos: number; total_atual_centavos: number | null };
  redirect(`/vender?reserva=atendida&pedido=sim&anunciado=${r.total_reservado_centavos}&atual=${r.total_atual_centavos ?? r.total_reservado_centavos}`);
}

export async function cancelarPedido(dados: FormData) {
  const pedido = dados.get("pedido");
  const motivo = typeof dados.get("motivo") === "string" ? String(dados.get("motivo")).replace(/\s+/g, " ").trim() : "";
  if (!ehUuid(pedido)) redirect("/reservas-do-site?erro=nao_encontrada");
  if (motivo.length < 3 || motivo.length > 200) redirect("/reservas-do-site?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("loja_pedido_cancelar", { p_pedido: pedido, p_motivo: motivo });
  if (error) redirect(`/reservas-do-site?erro=${erroDaLoja(error)}`);
  redirect(`/reservas-do-site?ok=${data === false ? "pedido_ja_cancelado" : "pedido_cancelado"}`);
}

"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDaTransferencia, erroDosChips, lerPedidoDeTransferencia } from "../../../lib/connect/chips";

// A ligação do PDV da Nogle com a loja (lote CONNECT-d): UMA função do banco, como a pessoa logada. O banco confere a
// permissão (quem gere a Ora Connect na rede ou as integrações), a loja física da rede e "uma loja, um PDV", e grava na
// auditoria. Sem loja escolhida, desliga. Nada vai para a Nogle.
export async function ligarPdv(dados: FormData) {
  const pdv = dados.get("pdv");
  const unidade = dados.get("unidade");
  if (typeof pdv !== "string" || !/^[1-9]\d{0,8}$/.test(pdv)) redirect("/connect/chips?erro=dados");
  const volta = `/connect/chips?pdv=${pdv}`;
  if (unidade !== "" && !ehUuid(unidade)) redirect(`${volta}&erro=dados`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_ligar_pdv", unidade === "" ? { p_pdv: Number(pdv) } : { p_pdv: Number(pdv), p_unidade: unidade });
  redirect(error ? `${volta}&erro=${erroDosChips(error)}` : `${volta}&ok=ligacao`);
}

// O pedido de transferência de chips (lote CONNECT-e): UMA função do banco, como a pessoa logada; o banco confere que é o
// dono, o estoque livre da última leitura e o chip em outro pedido. A tela não chama a Nogle: o servidor envia em até
// 1 minuto, uma vez, e confirma pelo estoque do PDV.
export async function pedirTransferencia(dados: FormData) {
  const lido = lerPedidoDeTransferencia(dados);
  if (!lido.ok) redirect(`/connect/chips?erro_transferencia=${lido.erro}`);
  const p = lido.pedido;
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("connect_transferir_chips", {
    p_tipo: p.tipo, p_pdv: p.pdv, p_chave: p.chave,
    ...(p.iccid ? { p_iccid: p.iccid } : {}),
    ...(p.iccidFinal ? { p_iccid_final: p.iccidFinal } : {}),
    ...(p.quantidade !== null ? { p_quantidade: p.quantidade } : {}),
    ...(p.motivo ? { p_motivo: p.motivo } : {}),
  });
  if (error) redirect(`/connect/chips?erro_transferencia=${erroDaTransferencia(error)}`);
  const numero = (data as { numero?: unknown } | null)?.numero;
  redirect(`/connect/chips?ok=transferencia${typeof numero === "number" && Number.isInteger(numero) ? `&numero=${numero}` : ""}`);
}

// O cancelamento, enquanto o pedido não saiu (o banco recusa depois: OR054), com o motivo na auditoria.
export async function cancelarTransferencia(dados: FormData) {
  const transferencia = dados.get("transferencia");
  const motivo = dados.get("motivo");
  if (!ehUuid(transferencia)) redirect("/connect/chips?erro_transferencia=dados");
  if (typeof motivo !== "string" || motivo.trim().length < 3) redirect("/connect/chips?erro_transferencia=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_cancelar_transferencia", { p_transferencia: transferencia, p_motivo: motivo.trim().slice(0, 200) });
  redirect(error ? `/connect/chips?erro_transferencia=${erroDaTransferencia(error)}` : "/connect/chips?ok=cancelada");
}

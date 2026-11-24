"use server";

import { redirect } from "next/navigation";

import { obterSessao } from "../../../lib/acesso/sessao";
import {
  erroDosDepositos, validarCasarDeposito, validarDesfazerDeposito, type ErroDosDepositos, type OkDosDepositos,
} from "../../../lib/extratos/depositos";

// O depósito agrupado da maquininha casado com o extrato do banco (lote FIN-006a: ORA-FIN-006). Cada ação chama UMA função
// do banco como a pessoa logada: o banco confere a permissão, recalcula o esperado do depósito, confere a linha (um uso só)
// e grava a auditoria com o motivo.
const PAGINA = "/pagamentos/depositos";
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Volta para o mesmo período (só datas no formato), com a mensagem. */
function voltar(dados: FormData, parametros: { ok?: OkDosDepositos; erro?: ErroDosDepositos }): never {
  const busca = new URLSearchParams();
  for (const campo of ["inicio", "fim"]) {
    const v = dados.get(campo);
    if (typeof v === "string" && DIA.test(v)) busca.set(campo, v);
  }
  for (const [k, v] of Object.entries(parametros)) if (v) busca.set(k, v);
  redirect(`${PAGINA}${busca.size ? `?${busca}` : ""}`);
}

export async function casarDeposito(dados: FormData) {
  const r = validarCasarDeposito(dados);
  if (!r.ok) voltar(dados, { erro: r.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("maquininha_deposito_casar", {
    p_provedor: r.dados.maquininha, p_data: r.dados.data, p_linha: r.dados.linha, p_motivo: r.dados.motivo as string,
  });
  if (error) voltar(dados, { erro: erroDosDepositos(error) });
  const resultado = data as { diferenca?: unknown; repetida?: unknown } | null;
  // O mesmo pedido de novo (o toque repetido) não grava de novo; a tela diz que já estava.
  if (resultado?.repetida === true) voltar(dados, { ok: "ja_casado" });
  const diferenca = Number(resultado?.diferenca);
  voltar(dados, { ok: Number.isFinite(diferenca) && diferenca !== 0 ? "casado_com_diferenca" : "casado" });
}

export async function desfazerDeposito(dados: FormData) {
  const r = validarDesfazerDeposito(dados);
  if (!r.ok) voltar(dados, { erro: r.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("maquininha_deposito_desfazer", { p_provedor: r.dados.maquininha, p_data: r.dados.data, p_motivo: r.dados.motivo });
  if (error) voltar(dados, { erro: erroDosDepositos(error) });
  voltar(dados, { ok: data === false ? "sem_mudanca" : "desfeito" });
}

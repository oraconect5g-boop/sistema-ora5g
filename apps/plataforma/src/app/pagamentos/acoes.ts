"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDasFinanceiras, lerRepasse } from "../../lib/pagamentos/financeiras";
import { erroDosPagamentos, lerConciliacao, lerMaquininha, type ErroDosPagamentos } from "../../lib/pagamentos/regras";

// Maquininhas e conciliação manual (lote L7a). Cada ação chama UMA função do banco como a pessoa logada: o
// banco confere terminal.gerir e pagamento.conciliar na loja e grava a auditoria com o motivo.

const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
function voltar(caminho: string, parametros: Record<string, string | undefined>): never {
  const busca = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) if (v) busca.set(k, v);
  redirect(`${caminho}${busca.size ? `?${busca}` : ""}`);
}
function erro(caminho: string, e: ErroDosPagamentos, extra: Record<string, string | undefined> = {}): never {
  voltar(caminho, { ...extra, erro: e });
}
// O período da tela de conciliação volta junto (só datas válidas).
const periodo = (dados: FormData) => {
  const data = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return { inicio: data(dados.get("inicio")), fim: data(dados.get("fim")) };
};

export async function cadastrarMaquininha(dados: FormData) {
  const lido = lerMaquininha(dados);
  if (!lido.ok) erro("/pagamentos/maquininhas", lido.erro);
  const motivo = texto(dados.get("motivo"));
  if (motivo.length < 3 || motivo.length > 200) erro("/pagamentos/maquininhas", "motivo");
  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("terminal_salvar", {
    p_id: null as unknown as string, p_unidade: situacao.unidade_id as string, p_provedor: lido.provedor, p_identificador: lido.identificador,
    p_apelido: lido.apelido, p_ativo: null as unknown as boolean, p_motivo: motivo,
  });
  if (error) erro("/pagamentos/maquininhas", erroDosPagamentos(error));
  voltar("/pagamentos/maquininhas", { ok: "cadastrada" });
}

export async function alterarMaquininha(dados: FormData) {
  const id = dados.get("terminal");
  const apelido = texto(dados.get("apelido"));
  const ativo = dados.get("ativo") === "sim";
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(id)) erro("/pagamentos/maquininhas", "dados");
  if (apelido.length < 2 || apelido.length > 60) erro("/pagamentos/maquininhas", "apelido");
  if (motivo.length < 3 || motivo.length > 200) erro("/pagamentos/maquininhas", "motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("terminal_salvar", {
    p_id: id, p_unidade: null as unknown as string, p_provedor: null as unknown as string, p_identificador: null as unknown as string,
    p_apelido: apelido, p_ativo: ativo, p_motivo: motivo,
  });
  if (error) erro("/pagamentos/maquininhas", erroDosPagamentos(error));
  voltar("/pagamentos/maquininhas", { ok: "alterada" });
}

export async function conciliarPagamento(dados: FormData) {
  const pagamento = dados.get("pagamento");
  const volta = periodo(dados);
  if (!ehUuid(pagamento)) erro("/pagamentos/conciliacao", "dados", volta);
  const lido = lerConciliacao(dados);
  if (!lido.ok) erro("/pagamentos/conciliacao", lido.erro, volta);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("pagamento_conciliar", { p_pagamento: pagamento, p_referencia: lido.referencia, p_valor_liquido: lido.liquido, p_liquidado_em: lido.data });
  if (error) erro("/pagamentos/conciliacao", erroDosPagamentos(error), volta);
  voltar("/pagamentos/conciliacao", { ...volta, ok: "conciliado" });
}

export async function desconciliarPagamento(dados: FormData) {
  const pagamento = dados.get("pagamento");
  const motivo = texto(dados.get("motivo"));
  const volta = periodo(dados);
  if (!ehUuid(pagamento)) erro("/pagamentos/conciliacao", "dados", volta);
  if (motivo.length < 3 || motivo.length > 200) erro("/pagamentos/conciliacao", "motivo", volta);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("pagamento_desconciliar", { p_pagamento: pagamento, p_motivo: motivo });
  if (error) erro("/pagamentos/conciliacao", erroDosPagamentos(error), volta);
  voltar("/pagamentos/conciliacao", { ...volta, ok: "desfeito" });
}

// Valores a receber das financeiras (L7b): o repasse da PayJoy e da Aiva, conferido no extrato, e o desfazer.
export async function receberDaFinanceira(dados: FormData) {
  const lido = lerRepasse(dados);
  if (!lido.ok) voltar("/pagamentos/financeiras", { erro: lido.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("financeira_receber", { p_conta: lido.conta, p_referencia: lido.referencia, p_valor_recebido: lido.recebido, p_recebido_em: lido.data });
  if (error) voltar("/pagamentos/financeiras", { erro: erroDasFinanceiras(error) });
  voltar("/pagamentos/financeiras", { ok: data === false ? "sem_mudanca" : "recebido" });
}

export async function desfazerRecebimento(dados: FormData) {
  const conta = dados.get("conta");
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(conta)) voltar("/pagamentos/financeiras", { erro: "dados" });
  if (motivo.length < 3 || motivo.length > 200) voltar("/pagamentos/financeiras", { erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("financeira_desfazer_recebimento", { p_conta: conta, p_motivo: motivo });
  if (error) voltar("/pagamentos/financeiras", { erro: erroDasFinanceiras(error) });
  // Na venda cancelada (#83) o banco deixa a conta cancelada, não aberta: a mensagem diz isso (o banco decide igual).
  voltar("/pagamentos/financeiras", { ok: data === false ? "sem_mudanca" : dados.get("cancelada") === "sim" ? "desfeito_cancelada" : "desfeito" });
}

// Correção de 14/11/2026 (#83): corrige referência, valor e data do repasse registrado, com motivo, sem
// passar por "aberta" (vale também na venda cancelada depois do repasse).
export async function corrigirRecebimento(dados: FormData) {
  const lido = lerRepasse(dados);
  if (!lido.ok) voltar("/pagamentos/financeiras", { erro: lido.erro });
  const motivo = texto(dados.get("motivo"));
  if (motivo.length < 3 || motivo.length > 200) voltar("/pagamentos/financeiras", { erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("financeira_corrigir_recebimento", {
    p_conta: lido.conta, p_referencia: lido.referencia, p_valor_recebido: lido.recebido, p_recebido_em: lido.data, p_motivo: motivo,
  });
  if (error) voltar("/pagamentos/financeiras", { erro: erroDasFinanceiras(error) });
  voltar("/pagamentos/financeiras", { ok: data === false ? "sem_mudanca" : "corrigido" });
}

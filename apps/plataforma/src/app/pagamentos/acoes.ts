"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDaCobranca, erroDoPrazo, lerCobranca, lerPrazo } from "../../lib/pagamentos/atrasados";
import { erroDasFinanceiras, lerNovoRepasse, lerRepasse } from "../../lib/pagamentos/financeiras";
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
  const lido = lerNovoRepasse(dados);
  if (!lido.ok) voltar("/pagamentos/financeiras", { erro: lido.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("financeira_registrar_repasse", {
    p_conta: lido.conta, p_referencia: lido.referencia, p_valor_recebido: lido.recebido, p_recebido_em: lido.data,
    p_tarifa: lido.tarifa, p_chave: lido.chave,
  });
  if (error) voltar("/pagamentos/financeiras", { erro: erroDasFinanceiras(error) });
  voltar("/pagamentos/financeiras", { ok: data === false ? "sem_mudanca" : lido.tarifa === null ? "parcial" : "recebido" });
}

export async function desfazerRepasseParcial(dados: FormData) {
  const conta = dados.get("conta");
  const repasse = dados.get("repasse");
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(conta) || !ehUuid(repasse)) voltar("/pagamentos/financeiras", { erro: "dados" });
  if (motivo.length < 3 || motivo.length > 200) voltar("/pagamentos/financeiras", { erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("financeira_desfazer_repasse_parcial", { p_conta: conta, p_repasse: repasse, p_motivo: motivo });
  if (error) voltar("/pagamentos/financeiras", { erro: erroDasFinanceiras(error) });
  voltar("/pagamentos/financeiras", { ok: data === false ? "sem_mudanca" : "parcial_desfeito" });
}

export async function desfazerRecebimento(dados: FormData) {
  const conta = dados.get("conta");
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(conta)) voltar("/pagamentos/financeiras", { erro: "dados" });
  if (motivo.length < 3 || motivo.length > 200) voltar("/pagamentos/financeiras", { erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const repasse = dados.get("repasse");
  if (repasse !== null && !ehUuid(repasse)) voltar("/pagamentos/financeiras", { erro: "dados" });
  const { data, error } = ehUuid(repasse)
    ? await supabase.rpc("financeira_desfazer_repasse_final", { p_conta: conta, p_repasse: repasse, p_motivo: motivo })
    : await supabase.rpc("financeira_desfazer_recebimento", { p_conta: conta, p_motivo: motivo });
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

// FIN-007a: o prazo de repasse de cada financeira (do dono, pela rede inteira) e a cobrança feita à financeira por uma
// conta em aberto (de quem concilia na loja). O banco confere de novo quem pode e grava a trilha.
export async function definirPrazoDeRepasse(dados: FormData) {
  const lido = lerPrazo(dados);
  if (!lido.ok) voltar("/pagamentos/financeiras", { erro: lido.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("prazo_de_repasse_definir", { p_devedor: lido.devedor, p_dias: lido.dias as number, p_motivo: lido.motivo });
  if (error) voltar("/pagamentos/financeiras", { erro: erroDoPrazo(error) });
  const repetida = typeof data === "object" && data !== null && !Array.isArray(data) && data.repetida === true;
  voltar("/pagamentos/financeiras", { ok: repetida ? "sem_mudanca" : lido.dias === null ? "prazo_retirado" : "prazo_definido" });
}

export async function registrarCobrancaDeRepasse(dados: FormData) {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const lido = lerCobranca(dados, hoje);
  if (!lido.ok) voltar("/pagamentos/financeiras", { erro: lido.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("cobranca_de_repasse_registrar", {
    p_conta: lido.conta, p_canal: lido.canal, p_resumo: lido.resumo, p_protocolo: lido.protocolo as string, p_retornar_em: lido.retornarEm as string, p_chave: lido.chave,
  });
  if (error) voltar("/pagamentos/financeiras", { erro: erroDaCobranca(error) });
  voltar("/pagamentos/financeiras", { ok: "cobranca_registrada" });
}

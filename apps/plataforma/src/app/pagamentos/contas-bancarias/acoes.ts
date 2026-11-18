"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDasContas, validarContaNova, validarMudancaDaConta, type ErroDasContas, type OkDasContas } from "../../../lib/contas-bancarias/regras";
import { hojeEmSaoPaulo } from "../../../lib/contas-a-pagar/regras";

// As contas bancárias (lote CONTAS-a: ORA-FIN-006). Cada ação chama UMA função do banco como a pessoa logada: o banco
// confere que ela concilia pela rede inteira, o formato de cada campo e grava a auditoria com o motivo.
const PAGINA = "/pagamentos/contas-bancarias";
const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

function voltar(parametros: { ok?: OkDasContas; erro?: ErroDasContas }, ancora: string | null = null): never {
  const busca = new URLSearchParams(Object.entries(parametros).filter(([, v]) => v) as [string, string][]);
  redirect(`${PAGINA}${busca.size ? `?${busca}` : ""}${ancora && ehUuid(ancora) ? `#conta-${ancora}` : ""}`);
}

export async function criarConta(dados: FormData) {
  const r = validarContaNova(dados, hojeEmSaoPaulo());
  if (!r.ok) voltar({ erro: r.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("conta_bancaria_criar", {
    p_empresa: r.dados.empresa, p_apelido: r.dados.apelido, p_banco: r.dados.banco, p_agencia: r.dados.agencia as string,
    p_conta: r.dados.conta as string, p_saldo_inicial: r.dados.saldoInicial, p_saldo_em: r.dados.saldoEm,
  });
  if (error) voltar({ erro: erroDasContas(error) });
  voltar({ ok: "criada" }, typeof data === "string" ? data : null);
}

export async function atualizarConta(dados: FormData) {
  const r = validarMudancaDaConta(dados, hojeEmSaoPaulo());
  if (!r.ok) voltar({ erro: r.erro }, texto(dados.get("conta_bancaria")));
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("conta_bancaria_atualizar", {
    p_conta_bancaria: r.dados.id, p_apelido: r.dados.apelido, p_banco: r.dados.banco, p_agencia: r.dados.agencia as string,
    p_conta: r.dados.conta as string, p_saldo_inicial: r.dados.saldoInicial, p_saldo_em: r.dados.saldoEm, p_ativa: r.dados.ativa, p_motivo: r.dados.motivo,
  });
  if (error) voltar({ erro: erroDasContas(error) }, r.dados.id);
  voltar({ ok: data === false ? "sem_mudanca" : "atualizada" }, r.dados.id);
}

/** Liga o extrato do banco à conta (sem motivo) ou o tira dela (com o motivo). */
export async function extratoDaConta(dados: FormData) {
  const extrato = dados.get("extrato");
  const conta = dados.get("conta_bancaria");
  const tirar = dados.get("tirar") === "sim";
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(extrato) || !ehUuid(conta)) voltar({ erro: "dados" });
  if (tirar && (motivo.length < 3 || motivo.length > 200)) voltar({ erro: "motivo" }, conta);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("extrato_da_conta", {
    p_extrato: extrato, p_conta_bancaria: (tirar ? null : conta) as string, p_motivo: (tirar ? motivo : null) as string,
  });
  if (error) voltar({ erro: erroDasContas(error) }, conta);
  voltar({ ok: data === false ? "sem_mudanca" : tirar ? "desligado" : "ligado" }, conta);
}

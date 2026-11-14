"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDoFechamento, validarAprovacao, validarConferencia } from "../../../lib/bonus/fechamento";

// Duas ações, cada uma uma chamada ao banco como a pessoa logada (sem chave secreta). Enviar:
// public.bonus_fechamento_enviar confere bonus.conferir na loja e o mês (que já terminou), apura o mês de
// novo, compara com os totais que a tela mostrou e grava a apuração, as linhas e as contestações.
// Aprovar: public.bonus_fechamento_aprovar confere bonus.aprovar (só o dono), exige decisão para cada
// contestação, grava o valor de cada vendedor e trava o fechamento. Tudo auditado.

const MES = /^\d{4}-(0[1-9]|1[0-2])-01$/;
function voltar(mes: unknown, loja: unknown, parametros: Record<string, string>): never {
  const busca = new URLSearchParams();
  if (typeof mes === "string" && MES.test(mes)) busca.set("mes", mes.slice(0, 7));
  if (typeof loja === "string" && ehUuid(loja)) busca.set("loja", loja);
  for (const [chave, valor] of Object.entries(parametros)) busca.set(chave, valor);
  redirect(`/metas/fechamento?${busca}`);
}
const campos = (dados: FormData) => ({ get: (nome: string) => dados.get(nome), getAll: (nome: string) => dados.getAll(nome) });

export async function enviarFechamento(dados: FormData) {
  const r = validarConferencia(campos(dados));
  if (!r.ok) voltar(dados.get("mes"), dados.get("loja"), { erro: r.erro });
  const d = r.dados;
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("bonus_fechamento_enviar", {
    p_mes: d.mes, p_unidade: d.unidade, p_totais: d.totais, p_contestacoes: Object.keys(d.contestacoes).length > 0 ? d.contestacoes : null,
  });
  if (error) voltar(d.mes, d.unidade, { erro: erroDoFechamento(error) });
  voltar(d.mes, d.unidade, { ok: "enviado" });
}

export async function aprovarFechamento(dados: FormData) {
  const r = validarAprovacao(campos(dados));
  if (!r.ok) voltar(dados.get("mes"), dados.get("loja"), { erro: r.erro });
  const d = r.dados;
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("bonus_fechamento_aprovar", { p_fechamento: d.fechamento, p_decisoes: d.decisoes });
  if (error) voltar(d.mes, d.unidade, { erro: erroDoFechamento(error) });
  voltar(d.mes, d.unidade, { ok: "aprovado" });
}

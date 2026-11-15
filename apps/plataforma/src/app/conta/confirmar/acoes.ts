"use server";

import { redirect } from "next/navigation";

import { enderecoDaConfirmacao, erroDaSenha, voltaDaConfirmacao } from "../../../lib/acesso/confirmacao";
import { celularesCadastrados, codigoValido, erroDoCodigo } from "../../../lib/acesso/segundo-fator";
import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";

// A confirmação de senha recente (lote ORG-006b: ORA-ORG-006; ADR-002 §2.6). Quem não tem o segundo fator confirma com a
// senha: o Supabase abre uma sessão nova (com a senha agora no amr) e a loja escolhida volta para ela. Quem tem o segundo
// fator confirma com o código do celular, na mesma sessão (o código também conta como recente). Depois, a volta.
export async function confirmarComSenha(dados: FormData) {
  const volta = voltaDaConfirmacao(dados.get("volta"));
  const senha = dados.get("senha");
  if (typeof senha !== "string" || senha === "") redirect(enderecoDaConfirmacao(volta, "senha"));
  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!data.user || !email) redirect("/entrar");
  // A loja escolhida nesta sessão: a sessão nova volta para ela (sem a resposta do banco, a pessoa escolhe de novo).
  const situacao = await supabase.rpc("situacao_da_sessao").maybeSingle();
  const unidade = situacao.error ? null : (situacao.data?.unidade_id ?? null);
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) redirect(enderecoDaConfirmacao(volta, erroDaSenha(error)));
  if (unidade) await supabase.rpc("selecionar_unidade", { p_unidade: unidade });
  redirect(volta);
}

export async function confirmarComCodigo(dados: FormData) {
  const volta = voltaDaConfirmacao(dados.get("volta"));
  const codigo = codigoValido(dados.get("codigo"));
  if (!codigo) redirect(enderecoDaConfirmacao(volta, "codigo"));
  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/entrar");
  const lista = await supabase.auth.mfa.listFactors();
  if (lista.error) redirect(enderecoDaConfirmacao(volta, "falha"));
  const celulares = celularesCadastrados(lista.data);
  const pedido = dados.get("celular");
  const celular = celulares.find((c) => c.id === pedido) ?? (celulares.length === 1 ? celulares[0] : undefined);
  if (!celular) redirect(enderecoDaConfirmacao(volta, "codigo"));
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: celular.id, code: codigo });
  if (error) {
    const motivo = erroDoCodigo(error);
    redirect(enderecoDaConfirmacao(volta, motivo === "muitas" || motivo === "falha" ? motivo : "codigo"));
  }
  redirect(volta);
}

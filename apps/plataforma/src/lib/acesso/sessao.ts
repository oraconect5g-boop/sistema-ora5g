import { redirect } from "next/navigation";

import { clienteSupabaseServidor } from "../supabase/servidor";
import { decidirSessao } from "./regras";

// Falha do serviço (rede, banco): vira a página de erro, nunca "sem acesso" (REV-014).
export class FalhaDoServico extends Error {
  constructor(etapa: string) {
    super(`Falha ao consultar o serviço (${etapa})`);
    this.name = "FalhaDoServico";
  }
}

// Sessão real para as páginas e ações do servidor: usuário validado no Auth, pessoa ativa,
// turno valendo e, quando a tela pede, loja escolhida. O banco decide de novo em cada consulta.
export async function obterSessao(opcoes: { exigirLoja: boolean }) {
  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError" && error.status !== 401 && error.status !== 403) {
    throw new FalhaDoServico("auth");
  }
  const usuario = data.user;
  let situacao = null;
  if (usuario) {
    const resposta = await supabase.rpc("situacao_da_sessao").maybeSingle();
    if (resposta.error) throw new FalhaDoServico("situacao_da_sessao");
    situacao = resposta.data ?? null;
  }
  const decisao = decidirSessao({ temUsuario: Boolean(usuario), situacao, exigirLoja: opcoes.exigirLoja });
  if (decisao.tipo === "entrar") redirect("/entrar");
  if (decisao.tipo === "sair") redirect(`/sair?motivo=${decisao.erro}`);
  if (decisao.tipo === "escolher_loja") redirect("/escolher-loja");
  if (!usuario || !situacao) redirect("/entrar");
  return { supabase, usuario, situacao };
}

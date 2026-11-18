import { redirect } from "next/navigation";
import { cache } from "react";

import { clienteSupabaseServidor } from "../supabase/servidor";
import type { Database } from "../supabase/tipos-banco";
import { lerMoldeDaSessao, PERMISSOES_DA_LOJA_NO_MOLDE, PERMISSOES_DA_REDE_NO_MOLDE } from "./molde";
import { decidirSessao, ehUuid } from "./regras";

// Falha do serviço (rede, banco): vira a página de erro, nunca "sem acesso" (REV-014).
export class FalhaDoServico extends Error {
  /** A etapa que falhou, palavra escrita no código: a Saúde da operação a mostra nos erros do servidor (OBS-a). */
  readonly etapa: string;
  constructor(etapa: string) {
    super(`Falha ao consultar o serviço (${etapa})`);
    this.name = "FalhaDoServico";
    this.etapa = etapa;
  }
}

/** Quem entrou, como o token assinado diz. O que a pessoa pode fazer é sempre decisão do banco. */
export type UsuarioDaSessao = { id: string; email: string | undefined };

// As telas leem a situação com o tipo da linha de public.situacao_da_sessao (o de sempre).
type LinhaDaSituacao = Database["public"]["Functions"]["situacao_da_sessao"]["Returns"][number];

// Erros do Auth que querem dizer "não há sessão que valha" (a pessoa vai para a entrada): sem sessão, token vencido,
// mal formado ou com assinatura que não confere, e a recusa do serviço (401, 403) quando a conferência vai à rede.
// Qualquer outro (rede, serviço fora do ar, chave pública que não veio) é falha do serviço: página de erro, nunca
// "sem acesso" (REV-014).
const ehSemSessao = (erro: { name: string; status?: number }) =>
  erro.name === "AuthSessionMissingError" || erro.name === "AuthInvalidJwtError" || erro.status === 401 || erro.status === 403;

// A leitura da sessão, uma vez por tela (lote VEL-a, ADR-010):
//  1) auth.getClaims() confere a assinatura e a validade do token. Com a chave de assinatura assimétrica do projeto, a
//     conferência é feita aqui, com a chave pública (guardada por 10 minutos), sem ida ao serviço de login; com a chave
//     antiga, a própria biblioteca pergunta ao serviço, como o getUser() fazia.
//  2) public.molde_da_sessao devolve, numa ida só, a decisão do banco sobre a sessão (a linha de situacao_da_sessao:
//     pessoa ativa, sessão que ainda existe e está no turno, segundo fator, loja) e o que o menu mostra.
// O token só diz quem é. Sessão encerrada, pessoa bloqueada e turno vencido são decididos pelo banco, em cada pedido.
// cache() do React: o layout e a página da mesma tela dividem uma leitura só. Fora da montagem de uma tela (ações e
// rotas), cada chamada lê de novo.
const lerSessao = cache(async () => {
  const supabase = await clienteSupabaseServidor();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error && !ehSemSessao(error)) throw new FalhaDoServico("auth");
  const id = error ? null : data?.claims.sub;
  if (typeof id !== "string" || !ehUuid(id)) return { supabase, lido: null };
  const email = data?.claims.email;
  const usuario: UsuarioDaSessao = { id, email: typeof email === "string" ? email : undefined };

  const resposta = await supabase.rpc("molde_da_sessao", {
    p_permissoes_da_loja: PERMISSOES_DA_LOJA_NO_MOLDE,
    p_permissoes_da_rede: PERMISSOES_DA_REDE_NO_MOLDE,
  });
  if (resposta.error) throw new FalhaDoServico("molde_da_sessao");
  let lida: ReturnType<typeof lerMoldeDaSessao>;
  try {
    lida = lerMoldeDaSessao(resposta.data);
  } catch {
    // Resposta fora do combinado não vira "sem acesso" nem menu vazio: é falha do serviço.
    throw new FalhaDoServico("molde_da_sessao");
  }
  return { supabase, lido: { usuario, ...lida } };
});

// Sessão real para as páginas e ações do servidor: token conferido, pessoa ativa, turno valendo, o código do
// segundo fator digitado (de quem o ligou; ORG-007a) e, quando a tela pede, loja escolhida. Junto vem o molde
// (permissões do menu, nome, vínculos e contagens), lido na mesma ida. O banco decide de novo em cada consulta.
export async function obterSessao(opcoes: { exigirLoja: boolean }) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/entrar?erro=configuracao");
  const { supabase, lido } = sessao;
  const decisao = decidirSessao({ temUsuario: lido !== null, situacao: lido?.situacao ?? null, exigirLoja: opcoes.exigirLoja });
  if (decisao.tipo === "entrar") redirect("/entrar");
  if (decisao.tipo === "sair") redirect(`/sair?motivo=${decisao.erro}`);
  if (decisao.tipo === "segundo_fator") redirect("/entrar/codigo");
  if (decisao.tipo === "escolher_loja") redirect("/escolher-loja");
  if (!lido) redirect("/entrar");
  return { supabase, usuario: lido.usuario, situacao: lido.situacao as LinhaDaSituacao, molde: lido.molde };
}

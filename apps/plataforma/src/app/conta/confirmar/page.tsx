import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ERROS_DA_CONFIRMACAO, voltaDaConfirmacao } from "../../../lib/acesso/confirmacao";
import { celularesCadastrados } from "../../../lib/acesso/segundo-fator";
import { FalhaDoServico } from "../../../lib/acesso/sessao";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";
import { telaDaConfirmacao } from "./TelaDaConfirmacao";

export const metadata: Metadata = { title: "Confirme que é você" };
export const dynamic = "force-dynamic";

// A confirmação de senha recente (lote ORG-006b: ORA-ORG-006; ADR-002 §2.6). O banco pede (OR033) e a tela da ação traz
// a pessoa para cá com a volta: com o segundo fator, o código do celular; sem ele, a senha.
export default async function Confirmar({ searchParams }: { searchParams: Promise<{ volta?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const volta = voltaDaConfirmacao(parametros.volta);
  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/entrar");
  const situacao = await supabase.rpc("situacao_da_sessao").maybeSingle();
  if (situacao.error) throw new FalhaDoServico("situacao_da_sessao");
  if (situacao.data?.segundo_fator_pendente === true) redirect("/entrar/codigo");
  const fatores = await supabase.auth.mfa.listFactors();
  if (fatores.error) throw new FalhaDoServico("mfa");
  const celulares = celularesCadastrados(fatores.data);
  const erro = chaveDoCatalogo(ERROS_DA_CONFIRMACAO, parametros.erro);
  return telaDaConfirmacao(data.user.email, volta, celulares, erro);
}

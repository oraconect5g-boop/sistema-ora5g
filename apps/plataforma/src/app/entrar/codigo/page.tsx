import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { caminhoDepoisDoCodigo, celularesCadastrados, depoisDoCodigo, ERROS_DO_CODIGO } from "../../../lib/acesso/segundo-fator";
import { FalhaDoServico } from "../../../lib/acesso/sessao";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";
import { telaDoCodigo } from "./TelaDoCodigo";

export const metadata: Metadata = { title: "Código de verificação" };
export const dynamic = "force-dynamic";

// Depois da senha, quem ligou a verificação em duas etapas digita o código do aplicativo do celular (lote ORG-007a:
// ORA-ORG-007). Sem o código o banco não dá permissão nenhuma; esta tela só aparece com o código pendente.
export default async function Codigo({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; depois?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const depois = depoisDoCodigo(parametros.depois);
  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/entrar");
  const situacao = await supabase.rpc("situacao_da_sessao").maybeSingle();
  if (situacao.error) throw new FalhaDoServico("situacao_da_sessao");
  if (situacao.data?.segundo_fator_pendente !== true) redirect(caminhoDepoisDoCodigo(depois));
  const fatores = await supabase.auth.mfa.listFactors();
  if (fatores.error) throw new FalhaDoServico("mfa");
  const celulares = celularesCadastrados(fatores.data);
  const erro = chaveDoCatalogo(ERROS_DO_CODIGO, parametros.erro);
  return telaDoCodigo(celulares, erro, depois);
}

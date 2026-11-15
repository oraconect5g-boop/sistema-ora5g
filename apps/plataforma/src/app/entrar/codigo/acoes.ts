"use server";

import { redirect } from "next/navigation";

import { caminhoDepoisDoCodigo, celularesCadastrados, codigoValido, depoisDoCodigo, enderecoDoCodigo, erroDoCodigo } from "../../../lib/acesso/segundo-fator";
import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";

// O código do segundo fator depois da senha (lote ORG-007a: ORA-ORG-007). Quem confere é o Supabase Auth; conferido,
// a sessão passa a aal2 (os cookies novos saem nesta resposta) e o banco volta a dar as permissões da pessoa.
export async function confirmarCodigo(dados: FormData) {
  const depois = depoisDoCodigo(dados.get("depois"));
  const codigo = codigoValido(dados.get("codigo"));
  if (!codigo) redirect(enderecoDoCodigo("formato", depois));
  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/entrar");
  const lista = await supabase.auth.mfa.listFactors();
  if (lista.error) redirect(enderecoDoCodigo("falha", depois));
  const celulares = celularesCadastrados(lista.data);
  // O celular escolhido na tela (com mais de um cadastrado) ou o único; um id que não é dos cadastrados não vale.
  const pedido = dados.get("celular");
  const celular = celulares.find((c) => c.id === pedido) ?? (celulares.length === 1 ? celulares[0] : undefined);
  if (!celular) redirect(enderecoDoCodigo("celular", depois));
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: celular.id, code: codigo });
  if (error) redirect(enderecoDoCodigo(erroDoCodigo(error), depois));
  redirect(caminhoDepoisDoCodigo(depois));
}

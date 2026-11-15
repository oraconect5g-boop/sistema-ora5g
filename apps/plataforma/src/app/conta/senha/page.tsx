import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Marca } from "../../../componentes/Marca";
import { Aviso, Botao, Cartao } from "../../../componentes/ui";
import { ERROS_DE_SENHA } from "../../../lib/acesso/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";
import { CampoSenha } from "../../entrar/CampoSenha";
import { definirSenha } from "./acoes";

export const metadata: Metadata = { title: "Definir senha" };
export const dynamic = "force-dynamic";

const classeCampo = "min-h-12 w-full rounded-botao border border-borda bg-slate-50/60 px-3.5 text-[15px] outline-none transition focus:border-acao focus:bg-white focus:ring-2 focus:ring-acao/20";

export default async function DefinirSenha({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro }> }) {
  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/entrar?erro=link");
  // ORG-007a: quem tem o segundo fator digita o código antes de trocar a senha (a recuperação pelo e-mail também).
  // Sem a resposta do banco, a página segue: a ação manda ao código se o Supabase pedir.
  const situacao = await supabase.rpc("situacao_da_sessao").maybeSingle();
  if (!situacao.error && situacao.data?.segundo_fator_pendente === true) redirect("/entrar/codigo?depois=senha");
  const erro = chaveDoCatalogo(ERROS_DE_SENHA, (await searchParams).erro);
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Marca tamanho="text-2xl" />
      <Cartao titulo="Defina sua senha" subtitulo={data.user.email} icone={KeyRound} className="mt-6">
        {erro && <Aviso tom="perigo" className="mb-3">{ERROS_DE_SENHA[erro]}</Aviso>}
        <form action={definirSenha} className="space-y-4">
          <div><label htmlFor="senha" className="text-sm font-semibold">Senha nova</label><CampoSenha classe={classeCampo} nome="senha" autoComplete="new-password" /></div>
          <div><label htmlFor="confirmacao" className="text-sm font-semibold">Repita a senha</label><CampoSenha classe={classeCampo} nome="confirmacao" id="confirmacao" autoComplete="new-password" /></div>
          <p className="text-xs text-suave">Pelo menos 10 caracteres, com letras e números. Não use a mesma senha de outros sites.</p>
          <Botao type="submit" tamanho="lg" className="w-full">Gravar a senha</Botao>
        </form>
      </Cartao>
    </main>
  );
}

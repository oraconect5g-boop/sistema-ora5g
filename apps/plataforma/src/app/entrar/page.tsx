import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, Botao } from "../../componentes/ui";
import { configuracaoSupabase } from "../../lib/supabase/configuracao";
import { entrar } from "./acoes";

export const metadata: Metadata = { title: "Entrar | Ora 5G" };
export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  credenciais: "E-mail ou senha incorretos.",
  dados: "Preencha e-mail e senha.",
  configuracao: "O login ainda não está configurado neste ambiente.",
};

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const configurado = configuracaoSupabase() !== null;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navegacao px-4 py-10">
      <div className="w-full max-w-sm rounded-cartao bg-white p-6 shadow-xl">
        <p className="text-2xl font-extrabold tracking-tight text-navegacao">ora<span className="text-acao">5G</span></p>
        <h1 className="mt-3 text-xl font-bold">Bem-vindo à Ora</h1>
        <p className="text-sm text-suave">Acesse com o seu e-mail.</p>
        {erro && ERROS[erro] && <div className="mt-4"><Aviso tom="perigo">{ERROS[erro]}</Aviso></div>}
        {configurado ? (
          <form action={entrar} className="mt-5 space-y-4">
            <label className="block text-sm font-medium">
              E-mail
              <input name="email" type="email" autoComplete="email" required className="mt-1 min-h-11 w-full rounded-botao border border-borda px-3" />
            </label>
            <label className="block text-sm font-medium">
              Senha
              <input name="senha" type="password" autoComplete="current-password" required className="mt-1 min-h-11 w-full rounded-botao border border-borda px-3" />
            </label>
            <Botao type="submit" className="w-full">Entrar na plataforma</Botao>
          </form>
        ) : (
          <div className="mt-5"><Aviso tom="aviso">O login ainda não está configurado neste ambiente.</Aviso></div>
        )}
        <p className="mt-4 text-xs text-suave">Recuperação de senha chega junto com o e-mail de envio do sistema. Acesso protegido por loja e perfil.</p>
        {process.env.APP_ENV !== "producao" && <Link href="/demo" className="mt-4 block text-center text-sm font-semibold text-acao">Ver a demonstração</Link>}
      </div>
    </main>
  );
}

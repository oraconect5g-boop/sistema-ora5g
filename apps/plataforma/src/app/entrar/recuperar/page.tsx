import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Marca } from "../../../componentes/Marca";
import { Aviso, Botao, Cartao } from "../../../componentes/ui";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { configuracaoSupabase } from "../../../lib/supabase/configuracao";
import { pedirLinkDeSenha } from "./acoes";

export const metadata: Metadata = { title: "Recuperar a senha" };
export const dynamic = "force-dynamic";

export default async function RecuperarSenha({ searchParams }: { searchParams: Promise<{ enviado?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const enviado = textoDoParametro(parametros.enviado) === "1";
  const erroEmail = textoDoParametro(parametros.erro) === "email";
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/entrar" aria-label="Voltar ao login" className="w-fit"><Marca tamanho="text-2xl" /></Link>
      <Cartao titulo="Recuperar a senha" icone={MailCheck} className="mt-6">
        {!configuracaoSupabase() ? (
          <Aviso tom="aviso">O login ainda não está configurado neste ambiente.</Aviso>
        ) : enviado ? (
          <Aviso tom="sucesso">Se este e-mail estiver cadastrado, enviamos um link para criar uma senha nova. Confira também a caixa de spam. O link vale por pouco tempo.</Aviso>
        ) : (
          <form action={pedirLinkDeSenha} className="space-y-4">
            {erroEmail && <Aviso tom="perigo">Confira o e-mail digitado.</Aviso>}
            <div>
              <label htmlFor="email" className="text-sm font-semibold">Seu e-mail de acesso</label>
              <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className="mt-1 min-h-12 w-full rounded-botao border border-borda bg-slate-50/60 px-3.5 text-[15px] outline-none focus:border-acao focus:bg-white focus:ring-2 focus:ring-acao/20" />
            </div>
            <Botao type="submit" tamanho="lg" className="w-full">Enviar o link</Botao>
            <p className="text-xs text-suave">Também pode pedir ao gerente ou ao dono um novo convite de acesso.</p>
          </form>
        )}
        <p className="mt-4 text-sm"><Link href="/entrar" className="font-semibold text-acao hover:underline">Voltar ao login</Link></p>
      </Cartao>
    </main>
  );
}

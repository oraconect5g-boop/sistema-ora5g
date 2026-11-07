import { ArrowRight, Lock, ShieldCheck, Signal, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Marca } from "../../componentes/Marca";
import { Aviso, Botao } from "../../componentes/ui";
import { configuracaoSupabase } from "../../lib/supabase/configuracao";
import { entrar } from "./acoes";
import { CampoSenha } from "./CampoSenha";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  credenciais: "E-mail ou senha incorretos.",
  dados: "Preencha e-mail e senha.",
  configuracao: "O login ainda não está configurado neste ambiente.",
};

const classeCampo = "min-h-12 w-full rounded-botao border border-borda bg-slate-50/60 px-3.5 text-[15px] outline-none transition focus:border-acao focus:bg-white focus:ring-2 focus:ring-acao/20";
const BARRAS = [42, 58, 50, 72, 66, 84, 78, 96];

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const configurado = configuracaoSupabase() !== null;
  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <Link href="/" aria-label="Página inicial da Ora 5G" className="w-fit"><Marca tamanho="text-2xl" /></Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-bold tracking-tight">Bem-vindo à Ora</h1>
          <p className="mt-1 text-suave">Acesse a plataforma de gestão integrada.</p>
          {erro && ERROS[erro] && <Aviso tom="perigo" className="mt-5">{ERROS[erro]}</Aviso>}
          {configurado ? (
            <form action={entrar} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-semibold">E-mail</label>
                <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="seuemail@ora5g.com.br" className={`${classeCampo} mt-1`} />
              </div>
              <div>
                <label htmlFor="senha" className="text-sm font-semibold">Senha</label>
                <CampoSenha classe={classeCampo} />
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-acao hover:underline">Esqueci minha senha</summary>
                <p className="mt-2 rounded-xl bg-fundo px-3 py-2 text-suave">A recuperação por e-mail será ligada junto com o e-mail de envio do sistema. Até lá, peça ao administrador para redefinir a sua senha.</p>
              </details>
              <Botao type="submit" tamanho="lg" className="w-full">Entrar na plataforma <ArrowRight aria-hidden className="size-5" /></Botao>
            </form>
          ) : (
            <Aviso tom="aviso" className="mt-6">O login ainda não está configurado neste ambiente.</Aviso>
          )}
          <p className="mt-6 flex items-start gap-2 text-xs text-suave"><Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" /> Acesso protegido por loja e perfil. Cada pessoa vê só o que o papel dela permite.</p>
          {process.env.APP_ENV !== "producao" && (
            <Link href="/demo" className="mt-6 flex items-center justify-center gap-1.5 rounded-botao border border-dashed border-borda-forte px-4 py-3 text-sm font-semibold text-acao hover:bg-acao-clara/50">
              Ver a demonstração
            </Link>
          )}
        </div>
      </section>

      <section aria-hidden className="relative hidden overflow-hidden bg-navegacao p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_30rem_at_70%_20%,rgba(19,217,199,0.22),transparent),radial-gradient(30rem_24rem_at_10%_100%,rgba(42,120,214,0.22),transparent)]" />
        <div className="relative max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-destaque">Tecnologia para crescer</p>
          <p className="mt-4 text-4xl font-bold leading-tight tracking-tight">Toda a operação da rede, <span className="text-destaque">em tempo real.</span></p>
          <p className="mt-4 text-slate-300">Vendas, estoque por IMEI, clientes, caixa e Ora Connect no mesmo sistema, do celular do vendedor ao painel da diretoria.</p>
          <div className="mt-10 rounded-3xl bg-white/[0.06] p-6 ring-1 ring-inset ring-white/10 backdrop-blur">
            <div className="flex items-center justify-between text-sm"><span className="text-slate-300">Vendas da rede · 8 dias</span><span className="rounded-full bg-destaque/15 px-2.5 py-0.5 text-xs font-semibold text-destaque">ilustrativo</span></div>
            <div className="mt-5 flex h-32 items-end gap-2">
              {BARRAS.map((altura, i) => <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-acao to-destaque" style={{ height: `${altura}%`, opacity: 0.55 + i * 0.06 }} />)}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-2xl bg-white/[0.05] p-3"><Store className="size-4 text-destaque" /><p className="mt-2 font-semibold">14 lojas</p></div>
              <div className="rounded-2xl bg-white/[0.05] p-3"><Signal className="size-4 text-destaque" /><p className="mt-2 font-semibold">Ora Connect</p></div>
              <div className="rounded-2xl bg-white/[0.05] p-3"><ShieldCheck className="size-4 text-destaque" /><p className="mt-2 font-semibold">Auditoria</p></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

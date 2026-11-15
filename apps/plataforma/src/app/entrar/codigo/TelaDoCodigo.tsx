// O desenho da tela do código do segundo fator (lote ORG-007a: ORA-ORG-007): a escolha do celular, o campo do código,
// a ajuda para quem está sem o celular e o sair. A página (page.tsx) confere a sessão e chama este desenho.
import { ShieldCheck } from "lucide-react";

import { Marca } from "../../../componentes/Marca";
import { RodapeVersao } from "../../../componentes/RodapeVersao";
import { Aviso, Botao } from "../../../componentes/ui";
import { ERROS_DO_CODIGO, type Celular, type ErroDoCodigo } from "../../../lib/acesso/segundo-fator";
import { sair } from "../acoes";
import { confirmarCodigo } from "./acoes";

const classeCampo = "min-h-14 w-full rounded-botao border border-borda bg-slate-50/60 px-3.5 text-center text-2xl tracking-[0.35em] outline-none transition focus:border-acao focus:bg-white focus:ring-2 focus:ring-acao/20";

/** A parte do formulário que escolhe o celular: só aparece quando há mais de um cadastrado. */
function escolhaDoCelular(celulares: readonly Celular[]) {
  if (celulares.length === 1) return <input type="hidden" name="celular" value={celulares[0]?.id} />;
  if (celulares.length === 0) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Qual celular está com você?</legend>
      {celulares.map((c, i) => (
        <label key={c.id} className="flex min-h-11 items-center gap-3 rounded-botao border border-borda px-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao-clara/40">
          <input type="radio" name="celular" value={c.id} defaultChecked={i === 0} className="size-4 accent-acao" />
          {c.nome}
        </label>
      ))}
    </fieldset>
  );
}

/** A tela inteira: o código para os celulares cadastrados, com a mensagem do erro, se houver. */
export function telaDoCodigo(celulares: readonly Celular[], erro?: ErroDoCodigo | null) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-5 py-8">
      <Marca tamanho="text-2xl" />
      <div className="flex flex-1 flex-col justify-center py-10">
        <ShieldCheck aria-hidden className="size-10 text-acao" />
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Código de verificação</h1>
        <p className="mt-1 text-suave">Abra o aplicativo autenticador do seu celular e digite o código de 6 algarismos da Ora.</p>
        {erro && <Aviso tom="perigo" className="mt-5">{ERROS_DO_CODIGO[erro]}</Aviso>}
        {celulares.length === 0 ? (
          <Aviso tom="aviso" className="mt-5">Sua conta pede o código, mas nenhum celular com aplicativo autenticador está cadastrado. Procure o dono: a verificação só sai pela administração do Supabase, fora do sistema.</Aviso>
        ) : (
          <form action={confirmarCodigo} className="mt-6 space-y-4">
            {escolhaDoCelular(celulares)}
            <div>
              <label htmlFor="codigo" className="text-sm font-semibold">Código</label>
              <input id="codigo" name="codigo" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000" className={`${classeCampo} numeros mt-1`} />
            </div>
            <Botao type="submit" tamanho="lg" className="w-full">Confirmar</Botao>
          </form>
        )}
        <details className="mt-6 rounded-botao border border-borda px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold text-acao">Está sem o celular?</summary>
          <p className="mt-2 text-suave">Se você cadastrou um celular de reserva, escolha ele acima. Se perdeu todos, procure o dono: a verificação só sai pela administração do Supabase, fora do sistema. Depois de entrar, cadastre o celular de novo em Minha conta → Segurança da conta.</p>
        </details>
        <form action={sair} className="mt-4"><Botao type="submit" variante="secundario" className="w-full">Sair</Botao></form>
      </div>
      <RodapeVersao className="mt-0" />
    </main>
  );
}

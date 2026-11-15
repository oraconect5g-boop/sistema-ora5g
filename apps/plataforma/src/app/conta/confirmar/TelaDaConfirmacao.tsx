// O desenho da tela da confirmação de senha recente (lote ORG-006b: ORA-ORG-006): com o segundo fator, o código do
// celular; sem ele, a senha. A página (page.tsx) confere a sessão e chama este desenho.
import { KeyRound } from "lucide-react";
import Link from "next/link";

import { Marca } from "../../../componentes/Marca";
import { Aviso, Botao, Cartao } from "../../../componentes/ui";
import { ERROS_DA_CONFIRMACAO, type ErroDaConfirmacao } from "../../../lib/acesso/confirmacao";
import type { Celular } from "../../../lib/acesso/segundo-fator";
import { CampoSenha } from "../../entrar/CampoSenha";
import { confirmarComCodigo, confirmarComSenha } from "./acoes";

const classeCampo = "min-h-12 w-full rounded-botao border border-borda bg-slate-50/60 px-3.5 text-[15px] outline-none transition focus:border-acao focus:bg-white focus:ring-2 focus:ring-acao/20";

export function telaDaConfirmacao(email: string | undefined, volta: string, celulares: readonly Celular[], erro?: ErroDaConfirmacao | null) {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Marca tamanho="text-2xl" />
      <Cartao titulo="Confirme que é você" subtitulo={email} icone={KeyRound} className="mt-6">
        <p className="text-sm text-suave">Aprovar desconto, aprovar nota, conferir o caixa, decidir a saída de dinheiro e mexer na equipe pedem a senha digitada nos últimos 30 minutos. Isso protege o celular ou o computador deixado aberto.</p>
        {erro && <Aviso tom="perigo" className="mt-3">{ERROS_DA_CONFIRMACAO[erro]}</Aviso>}
        {celulares.length > 0 ? (
          <form action={confirmarComCodigo} className="mt-4 space-y-4">
            <input type="hidden" name="volta" value={volta} />
            {celulares.length === 1 ? <input type="hidden" name="celular" value={celulares[0]?.id} /> : (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Qual celular está com você?</legend>
                {celulares.map((c, i) => (
                  <label key={c.id} className="flex min-h-11 items-center gap-3 rounded-botao border border-borda px-3 text-sm">
                    <input type="radio" name="celular" value={c.id} defaultChecked={i === 0} className="size-4 accent-acao" />{c.nome}
                  </label>
                ))}
              </fieldset>
            )}
            <div>
              <label htmlFor="codigo" className="text-sm font-semibold">Código do aplicativo do celular</label>
              <input id="codigo" name="codigo" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000"
                className={`${classeCampo} numeros mt-1 text-center text-2xl tracking-[0.35em]`} />
            </div>
            <Botao type="submit" tamanho="lg" className="w-full">Confirmar</Botao>
          </form>
        ) : (
          <form action={confirmarComSenha} className="mt-4 space-y-4">
            <input type="hidden" name="volta" value={volta} />
            <div><label htmlFor="senha" className="text-sm font-semibold">Senha</label><CampoSenha classe={classeCampo} /></div>
            <Botao type="submit" tamanho="lg" className="w-full">Confirmar</Botao>
          </form>
        )}
        <p className="mt-4 text-sm"><Link href={volta} className="font-semibold text-acao hover:underline">Voltar sem confirmar</Link></p>
      </Cartao>
    </main>
  );
}

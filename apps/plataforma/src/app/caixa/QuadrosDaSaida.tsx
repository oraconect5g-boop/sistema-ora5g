import { randomUUID } from "node:crypto";

import { Banknote, ShieldCheck } from "lucide-react";

import { Aviso, Botao, Cartao, Selo } from "../../componentes/ui";
import { ERROS_DA_SAIDA, horaDoPedido, SITUACOES_DA_SAIDA, type SaidaDoCaixa } from "../../lib/caixa/saidas";
import { brl } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";
import { cancelarSaida, decidirSaida, pedirSaida } from "./acoes";

// Os quadros da saída autorizada do caixa (lote L7c), à parte da página para a conferência visual e os
// testes. Cada estado da leitura tem a sua mensagem: tabela ausente (banco sem a migration), falha e vazio.
export const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const NAO_LEU = "Não deu para ler os pedidos de saída agora. Atualize a página em instantes.";

/** Pedir a saída e acompanhar os pedidos deste caixa (quem está com o caixa aberto). */
export function MinhasSaidas({ leitura }: { leitura: Leitura<SaidaDoCaixa[]> }) {
  return (
    <Cartao id="saida" titulo="Saída de dinheiro" icone={Banknote} subtitulo="Despesa da loja paga com dinheiro da gaveta (motoboy, compra pequena). O gerente ou o dono autoriza.">
      {leitura.estado === "indisponivel" ? <p className="text-sm text-suave">{ERROS_DA_SAIDA.indisponivel}</p> : (
        <>
          <form action={pedirSaida} className="grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="chave" value={randomUUID()} />
            <label className="text-xs font-medium">Valor (R$)<input name="valor" inputMode="decimal" required className={campo} /></label>
            <label className="text-xs font-medium sm:col-span-3">Motivo<input name="motivo" required minLength={3} maxLength={200} placeholder="Ex.: pagar o motoboy da entrega" className={campo} /></label>
            <Botao type="submit" className="sm:col-span-4">Pedir autorização</Botao>
          </form>
          <p className="mt-2 text-xs text-suave">Retire o dinheiro da gaveta só depois de autorizado: a saída entra no caixa e o fechamento já desconta.</p>
          {leitura.estado === "falha" ? <Aviso tom="perigo" className="mt-3">{NAO_LEU}</Aviso> : leitura.dados.length > 0 && (
            <ul className="mt-3 divide-y divide-borda border-t border-borda">
              {leitura.dados.map((s) => (
                <li key={s.id} className="flex flex-col gap-1.5 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="min-w-0">
                    <span className="numeros font-semibold">{brl(s.valor)}</span> · {s.motivo}
                    {s.situacao === "negada" && s.motivoDecisao && <span className="block text-xs text-suave">Motivo de negar: {s.motivoDecisao}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Selo tom={SITUACOES_DA_SAIDA[s.situacao].tom} ponto>{SITUACOES_DA_SAIDA[s.situacao].rotulo}</Selo>
                    {s.situacao === "pendente" && (
                      <form action={cancelarSaida}>
                        <input type="hidden" name="saida" value={s.id} />
                        <Botao type="submit" tamanho="sm" variante="secundario">Cancelar</Botao>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Cartao>
  );
}

/** Os pedidos pendentes da loja, para o gerente ou o dono autorizar ou negar (nunca o próprio). */
export function SaidasParaAutorizar({ leitura, nomes, usuario }: { leitura: Leitura<SaidaDoCaixa[]>; nomes: Map<string, string> | null; usuario: string }) {
  const quem = (id: string) => (nomes === null ? "nome indisponível" : nomes.get(id) ?? "Pessoa de fora da sua equipe");
  return (
    <Cartao id="saidas" className="scroll-mt-24" titulo="Saídas para autorizar" icone={ShieldCheck} subtitulo="Dinheiro da gaveta para despesa da loja. Autorizar lança a saída no caixa de quem pediu.">
      {leitura.estado === "indisponivel" ? <p className="text-sm text-suave">{ERROS_DA_SAIDA.indisponivel}</p>
        : leitura.estado === "falha" ? <Aviso tom="perigo">{NAO_LEU}</Aviso>
        : leitura.dados.length === 0 ? <p className="text-sm text-suave">Nenhum pedido de saída esperando autorização.</p>
        : (
          <ul className="divide-y divide-borda">
            {leitura.dados.map((s) => (
              <li key={s.id} className="space-y-2 py-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="numeros text-base font-bold">{brl(s.valor)}</span>
                  <span className="text-xs text-suave">{quem(s.pedidaPor)} · {horaDoPedido(s.pedidaEm)}</span>
                </p>
                <p>{s.motivo}</p>
                {s.pedidaPor === usuario ? <p className="text-xs text-suave">Seu pedido: outra pessoa (gerente ou dono) autoriza.</p> : (
                  <div className="flex flex-wrap items-end gap-2">
                    <form action={decidirSaida}>
                      <input type="hidden" name="saida" value={s.id} /><input type="hidden" name="decisao" value="autorizar" />
                      <Botao type="submit" tamanho="sm">Autorizar</Botao>
                    </form>
                    <form action={decidirSaida} className="flex min-w-0 flex-[1_1_16rem] items-end gap-2">
                      <input type="hidden" name="saida" value={s.id} /><input type="hidden" name="decisao" value="negar" />
                      <label className="min-w-0 flex-1 text-xs font-medium">Motivo para negar<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                      <Botao type="submit" tamanho="sm" variante="perigo">Negar</Botao>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
    </Cartao>
  );
}

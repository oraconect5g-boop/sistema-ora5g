// FISC-009b (ORA-FISC-009): as cartas de correção da NF-e emitida, no bloco "Nota fiscal" da venda, e o registro da carta
// feita no portal do fisco (só para quem aprova nota). Quem decide é o banco (notas_registrar_carta_de_correcao): só a
// NF-e emitida e não cancelada, o número de 1 a 20, o protocolo de 15 dígitos e o texto de 15 a 1.000 caracteres.
import { Botao, Selo } from "../../../componentes/ui";
import { dataEHoraDoEnvio } from "../../../lib/notas/regras";
import { registrarCartaDeCorrecao } from "../../notas/acoes";

export type CartaDeCorrecao = { id: string; numero: number; protocolo: string; correcao: string; registrada_em: string };

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
// O limite do fisco: o número da carta (o do evento) vai de 1 a 20.
const ULTIMA_CARTA = 20;

export function CartasDeCorrecao({ cartas, pedido, venda, podeRegistrar }: { cartas: CartaDeCorrecao[]; pedido: string; venda: string; podeRegistrar: boolean }) {
  const ordenadas = [...cartas].sort((a, b) => a.numero - b.numero);
  const proxima = (ordenadas.at(-1)?.numero ?? 0) + 1;
  return (
    <div className="space-y-2 rounded-lg border border-borda p-2">
      <p className="text-xs font-semibold">Cartas de correção</p>
      {ordenadas.length === 0 ? <p className="text-xs text-suave">Nenhuma carta de correção registrada nesta NF-e.</p> : (
        <ul className="space-y-2 text-xs">
          {ordenadas.map((c, i) => (
            <li key={c.id} className="space-y-1">
              <p className="flex flex-wrap items-center gap-2">{i === ordenadas.length - 1 && ordenadas.length > 1 && <Selo tom="info">A que vale</Selo>}
                <span className="numeros text-suave">Carta nº {c.numero} · registrada em {dataEHoraDoEnvio(c.registrada_em)} · protocolo {c.protocolo}</span></p>
              <p className="whitespace-pre-wrap break-words">{c.correcao}</p>
            </li>
          ))}
        </ul>
      )}
      {ordenadas.length > 1 && <p className="text-xs text-suave">No fisco, a carta mais recente substitui as anteriores: ela traz todas as correções.</p>}
      {podeRegistrar && (proxima <= ULTIMA_CARTA ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-acao">Fez uma carta de correção no portal do fisco? Registre</summary>
          <form action={registrarCartaDeCorrecao} className="mt-2 grid gap-2 sm:grid-cols-3 sm:items-end">
            <input type="hidden" name="pedido" value={pedido} /><input type="hidden" name="venda" value={venda} />
            <label className="font-medium">Número da carta (de 1 a 20)<input name="numero" required inputMode="numeric" autoComplete="off" maxLength={2} defaultValue={proxima} className={campo} /></label>
            <label className="font-medium sm:col-span-2">Protocolo do evento (15 dígitos)<input name="protocolo" required inputMode="numeric" autoComplete="off" maxLength={20} className={campo} /></label>
            <label className="font-medium sm:col-span-3">Texto da correção, o mesmo do evento (de 15 a 1.000 caracteres)<textarea name="correcao" required minLength={15} maxLength={1000} rows={3} className={`${campo} py-2`} /></label>
            <p className="text-suave sm:col-span-3">A carta de correção não corrige o imposto e o que o define (base de cálculo, alíquota, diferença de preço, quantidade, valor da operação), o remetente ou o destinatário, nem a data de emissão ou de saída (§ 1º-A do art. 7º do Convênio S/N, de 15/12/1970). O prazo e o aceite são do fisco: aqui fica registrado o que o portal aceitou.</p>
            <div className="sm:col-span-3"><Botao type="submit" tamanho="sm" variante="secundario">Registrar a carta</Botao></div>
          </form>
        </details>
      ) : <p className="text-xs text-suave">Esta NF-e chegou a 20 cartas de correção, o limite do fisco.</p>)}
    </div>
  );
}

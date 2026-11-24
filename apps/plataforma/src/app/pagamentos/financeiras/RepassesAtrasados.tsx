import { AlarmClock } from "lucide-react";

import { NOTA } from "../../../componentes/paineis-de-vendas";
import { Aviso, Botao, Cartao, Selo } from "../../../componentes/ui";
import { brl, numero } from "../../../lib/formato";
import type { Leitura } from "../../../lib/leitura-do-banco";
import { CANAIS_DA_COBRANCA, cobrancaARetomar, faixasDoAtraso, type RepasseEmAberto, type RepassesAtrasados } from "../../../lib/pagamentos/atrasados";
import { FINANCEIRAS } from "../../../lib/pagamentos/financeiras";
import { definirPrazoDeRepasse, registrarCobrancaDeRepasse } from "../acoes";

// Os repasses atrasados das financeiras (lote FIN-007a). Só apresentação: a lista chega lida por lib/pagamentos/atrasados,
// com o estado da leitura (falha nunca vira "nada atrasado"). Sem o prazo definido pelo dono, nenhuma conta é chamada de
// atrasada: a tela diz que falta o prazo. Os formulários chamam as ações, que chamam as funções do banco como a pessoa logada.

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
const contas = (n: number) => `${numero(n)} ${n === 1 ? "conta" : "contas"}`;
const dias = (n: number) => `${numero(n)} ${n === 1 ? "dia" : "dias"}`;

/** A frase do topo: quanto está atrasado, ou por que nada é chamado de atrasado. */
function resumoDosAtrasados(d: RepassesAtrasados): { texto: string; tom: "perigo" | "sucesso" | "aviso" | "neutro" } {
  const t = d.totais;
  if (t.atrasadas > 0) return { texto: `${contas(t.atrasadas)} ${t.atrasadas === 1 ? "passou" : "passaram"} do prazo; a mais atrasada, há ${dias(t.maiorAtraso)}.`, tom: "perigo" };
  if (d.contas.length === 0) return { texto: "Nenhuma conta em aberto com as financeiras.", tom: "neutro" };
  if (t.noPrazo === 0) return { texto: `Nenhum prazo definido para ${contas(t.semPrazo)} em aberto (${brl(t.valorSemPrazo)}): sem o prazo, o sistema não chama nenhuma conta de atrasada.`, tom: "aviso" };
  return { texto: `Nada atrasado: ${contas(t.noPrazo)} no prazo (${brl(t.valorNoPrazo)}).`, tom: "sucesso" };
}

/** O cartão do topo: o que está atrasado, o prazo de cada financeira (e o formulário de quem define) e, para a rede, loja a loja. */
export function PainelDosAtrasados({ leitura, daRede = null }: {
  leitura: Leitura<RepassesAtrasados>;
  /** Só para quem concilia pela rede inteira: o mesmo resumo, de todas as lojas. */
  daRede?: Leitura<RepassesAtrasados> | null;
}) {
  if (leitura.estado !== "ok") {
    return (
      <Cartao className="mt-4" titulo="O que está atrasado" subtitulo="As contas em aberto que passaram do prazo de repasse" icone={AlarmClock}>
        <Aviso tom="aviso">Não deu para ler os repasses atrasados agora. As contas abaixo continuam valendo; abra de novo daqui a pouco.</Aviso>
      </Cartao>
    );
  }
  const d = leitura.dados;
  const resumo = resumoDosAtrasados(d);
  const semPrazoComOutras = d.totais.semPrazo > 0 && (d.totais.atrasadas > 0 || d.totais.noPrazo > 0);
  // FIN-007b: as contas com o dia de voltar ao assunto já chegado (a mesma conta do alerta do Início e do sino).
  const aRetomar = d.contas.filter((c) => cobrancaARetomar(c, d.hoje) !== null).length;
  return (
    <Cartao className="mt-4" titulo="O que está atrasado" subtitulo="As contas em aberto que passaram do prazo de repasse de cada financeira" icone={AlarmClock}>
      {d.totais.atrasadas > 0 && <p className="numeros text-2xl font-bold tracking-tight text-perigo">{brl(d.totais.valorAtrasado)}</p>}
      <p className={`text-sm ${resumo.tom === "perigo" ? "font-semibold text-perigo" : resumo.tom === "sucesso" ? "font-semibold text-sucesso" : resumo.tom === "aviso" ? "text-aviso" : "text-suave"}`}>{resumo.texto}</p>
      {d.totais.atrasadas > 0 && d.totais.noPrazo > 0 && <p className={`mt-1 ${NOTA}`}>{`No prazo: ${contas(d.totais.noPrazo)} (${brl(d.totais.valorNoPrazo)}).`}</p>}
      {semPrazoComOutras && <p className={`mt-1 ${NOTA}`}>{`Sem prazo definido: ${contas(d.totais.semPrazo)} (${brl(d.totais.valorSemPrazo)}).`}</p>}
      {aRetomar > 0 && (
        <p className="mt-2 rounded-lg bg-aviso/10 px-3 py-2 text-sm text-aviso">
          {`${aRetomar === 1 ? "1 cobrança para retomar" : `${numero(aRetomar)} cobranças para retomar`}: chegou o dia combinado para voltar à financeira. ${aRetomar === 1 ? "A conta está marcada" : "As contas estão marcadas"} na lista abaixo.`}
        </p>
      )}
      {d.totais.atrasadas > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-semibold">Há quanto tempo está atrasado</h3>
          {/* No celular, uma faixa por linha (o valor não quebra); a partir do tablet, as três lado a lado. */}
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {faixasDoAtraso(d.contas).map((f) => (
              <li key={f.rotulo} className="flex items-baseline justify-between gap-3 rounded-xl border border-borda px-3 py-2 sm:block sm:text-center">
                <p className="text-xs text-suave">{f.rotulo}</p>
                <div className="text-right sm:text-center">
                  <p className={`numeros whitespace-nowrap text-sm font-semibold sm:mt-1 ${f.contas > 0 ? "text-perigo" : "text-suave"}`}>{f.contas > 0 ? brl(f.valor) : "—"}</p>
                  <p className="text-xs text-suave">{f.contas > 0 ? contas(f.contas) : "nenhuma conta"}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-borda/70 pt-3">
        <h3 className="text-sm font-semibold">O prazo de repasse de cada financeira</h3>
        <p className={`mt-1 ${NOTA}`}>Em dias corridos desde a venda, como está no contrato. Vale para a rede inteira; mudar o prazo muda o que está atrasado.</p>
        <ul className="mt-2 grid gap-3 sm:grid-cols-2">
          {d.prazos.map((p) => (
            <li key={p.devedor} className="rounded-xl border border-borda px-4 py-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-semibold">{FINANCEIRAS[p.devedor]}
                {p.dias === null ? <Selo tom="aviso">sem prazo definido</Selo> : <Selo tom="info">{`${dias(p.dias)} corridos`}</Selo>}
              </p>
              {p.dias !== null && p.definidoEm && <p className={`mt-1 ${NOTA}`}>{`Definido em ${quando(p.definidoEm)}.`}</p>}
              {d.podeDefinirPrazo && (
                <form action={definirPrazoDeRepasse} className="mt-2 grid gap-2 sm:grid-cols-[6rem_1fr_auto]">
                  <input type="hidden" name="devedor" value={p.devedor} />
                  <label className="text-xs font-medium">Dias<input name="dias" inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} defaultValue={p.dias ?? ""} placeholder="em branco: sem prazo" className={campo} /></label>
                  <label className="text-xs font-medium">De onde veio o prazo<input name="motivo" required minLength={3} maxLength={200} placeholder="Contrato, e-mail da financeira…" className={campo} /></label>
                  <Botao type="submit" tamanho="sm" variante="secundario" className="self-end">Gravar</Botao>
                </form>
              )}
            </li>
          ))}
        </ul>
        {!d.podeDefinirPrazo && <p className={`mt-2 ${NOTA}`}>Quem define o prazo é quem concilia pela rede inteira (o dono).</p>}
      </div>

      {daRede && <NaRedeInteira leitura={daRede} />}
    </Cartao>
  );
}

/** O resumo de todas as lojas, para quem concilia pela rede: a falha de leitura e a rede sem nada em aberto também são ditas. */
function NaRedeInteira({ leitura }: { leitura: Leitura<RepassesAtrasados> }) {
  const rede = leitura.estado === "ok" ? leitura.dados : null;
  return (
    <div className="mt-4 border-t border-borda/70 pt-3">
      <h3 className="text-sm font-semibold">Na rede inteira</h3>
      {rede === null ? (
        <p className="mt-1 text-xs text-aviso">Não deu para ler as outras lojas agora. O que está acima, da loja do turno, continua valendo; abra de novo daqui a pouco.</p>
      ) : rede.porLoja.length === 0 ? (
        <p className={`mt-1 ${NOTA}`}>Nenhuma loja da rede tem conta em aberto com as financeiras.</p>
      ) : (
        <>
          <p className={`mt-1 ${NOTA}`}>{rede.totais.atrasadas > 0
            ? `${brl(rede.totais.valorAtrasado)} atrasados em ${contas(rede.totais.atrasadas)}.`
            : `Nada atrasado nas ${numero(rede.porLoja.length)} ${rede.porLoja.length === 1 ? "loja" : "lojas"} com conta em aberto.`}</p>
          <ul className="mt-2 divide-y divide-borda text-sm">
            {rede.porLoja.map((l) => (
              <li key={l.unidadeId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{l.nome}</span>
                <span className="numeros text-xs text-suave">
                  <span className="whitespace-nowrap">{`${contas(l.abertas)} em aberto`}</span>
                  {l.atrasadas > 0 && " · "}
                  {l.atrasadas > 0 && <span className="whitespace-nowrap font-medium text-perigo">{`${contas(l.atrasadas)} ${l.atrasadas === 1 ? "atrasada" : "atrasadas"} (${brl(l.valorAtrasado)})`}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className={`mt-1 ${NOTA}`}>Para cobrar ou registrar o repasse de outra loja, troque de loja no topo da tela.</p>
        </>
      )}
    </div>
  );
}

/** As cobranças de uma conta em aberto: o histórico e o formulário de registrar mais uma. */
export function CobrancasDaConta({ conta, hoje, chave }: { conta: RepasseEmAberto; hoje: string; chave: string }) {
  return (
    <details className="rounded-xl bg-fundo/70 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-acao">{conta.cobrancas === 0 ? "Registrar cobrança feita à financeira" : `Cobranças feitas à financeira (${numero(conta.cobrancas)})`}</summary>
      {conta.historico.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {conta.historico.map((h) => (
            <li key={h.id}>
              <span className="numeros font-medium">{quando(h.quando)}</span>
              {` · ${CANAIS_DA_COBRANCA[h.canal]} · ${h.resumo}${h.protocolo ? ` · protocolo ${h.protocolo}` : ""}${h.retornarEm ? ` · voltar ao assunto em ${dataCurta(h.retornarEm)}` : ""}${h.por ? ` · por ${h.por}` : ""}`}
            </li>
          ))}
        </ul>
      )}
      <form action={registrarCobrancaDeRepasse} className="mt-2 grid gap-2 sm:grid-cols-4">
        <input type="hidden" name="conta" value={conta.id} />
        <input type="hidden" name="chave" value={chave} />
        <label className="text-xs font-medium">Por onde
          <select name="canal" required defaultValue="telefone" className={campo}>{Object.entries(CANAIS_DA_COBRANCA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        </label>
        <label className="text-xs font-medium sm:col-span-3">O que foi combinado<input name="resumo" required minLength={3} maxLength={500} placeholder="Com quem falou e o que ficou combinado" className={campo} /></label>
        <label className="text-xs font-medium sm:col-span-2">Protocolo (se houver)<input name="protocolo" maxLength={80} className={campo} /></label>
        <label className="text-xs font-medium">Voltar ao assunto em<input name="retornar_em" type="date" min={hoje} className={campo} /></label>
        <Botao type="submit" tamanho="sm" variante="secundario" className="self-end">Registrar cobrança</Botao>
      </form>
    </details>
  );
}

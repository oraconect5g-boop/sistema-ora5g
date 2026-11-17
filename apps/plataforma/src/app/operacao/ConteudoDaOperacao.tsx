import { Activity, CalendarClock, Hourglass, Layers } from "lucide-react";
import Link from "next/link";

import { BarrasHorizontais } from "../../componentes/graficos";
import { Aviso, Cartao, EstadoVazio, Indicador, Selo, TituloPagina } from "../../componentes/ui";
import { numero } from "../../lib/formato";
import { ICONES_DAS_PENDENCIAS } from "../../lib/inicio/icones-das-pendencias";
import { haQuanto } from "../../lib/notas/regras";
import { diasDesde, type LeituraDaFila } from "../../lib/operacao/filas";
import { minutosDesde, rotinasComProblema, SITUACOES_DA_ROTINA, type LeituraDasRotinas, type Rotina } from "../../lib/operacao/rotinas";

const haDias = (dias: number) => (dias === 0 ? "desde hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`);
const tomDaIdade = (dias: number | null) => (dias === null ? "neutro" : dias >= 3 ? "perigo" : dias >= 1 ? "aviso" : "neutro");

/** "última rodada certa há 3 min"; na falha, com o código do erro (o banco não guarda a mensagem). */
function ultimaRodada(r: Rotina, agora: number): string {
  const minutos = r.ultimaCerta ? minutosDesde(r.ultimaCerta, agora) : null;
  const certa = minutos === null ? "ainda sem rodada certa" : `última rodada certa ${minutos < 1 ? "agora há pouco" : haQuanto(minutos)}`;
  return r.situacao === "com_falha" && r.erro ? `${certa}; a última falhou (código ${r.erro})` : certa;
}

// O conteúdo da saúde da operação (lote Q1; as rotinas, ROT-a), à parte da página: recebe as filas e as rotinas já lidas.
export function ConteudoDaOperacao({ filas, hoje, rotinas, agora }: {
  filas: readonly LeituraDaFila[]; hoje: string; rotinas: LeituraDasRotinas; agora: number;
}) {
  const problemas = rotinas.estado === "ok" ? rotinasComProblema(rotinas.rotinas) : [];
  const lidas = filas.flatMap((f) => (f.estado === "ok" ? [{ ...f, dias: f.desde ? diasDesde(f.desde, hoje) : null }] : []));
  const comAlgo = lidas.filter((f) => f.quantidade > 0).sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1) || b.quantidade - a.quantidade);
  const falhas = filas.filter((f) => f.estado === "falha");
  const total = lidas.reduce((s, f) => s + f.quantidade, 0);
  const maisAntiga = comAlgo.find((f) => f.dias !== null) ?? null;
  const idade = maisAntiga?.dias ?? null;

  return (
    <>
      <TituloPagina titulo="Saúde da operação" subtitulo="O que espera alguém nas lojas que você acompanha, fila por fila, e há quanto tempo está o mais antigo." />
      {problemas.length > 0 && (
        <Aviso tom="perigo" titulo={problemas.length === 1 ? "Uma rotina automática do banco pede atenção" : `${problemas.length} rotinas automáticas do banco pedem atenção`}>
          {`${problemas.map((r) => `${r.descricao}: ${SITUACOES_DA_ROTINA[r.situacao].rotulo.toLowerCase()}`).join("; ")}. Veja o cartão "Rotinas automáticas", abaixo.`}
        </Aviso>
      )}
      {falhas.length > 0 && <Aviso tom="perigo">{`Não deu para ler ${falhas.length === 1 ? "uma fila" : `${falhas.length} filas`} agora: ${falhas.map((f) => f.rotulo).join(", ")}. As outras estão abaixo.`}</Aviso>}
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Indicador rotulo="Itens esperando" icone={Layers} valor={numero(total)} tom={total > 0 ? "atencao" : "neutro"}
          detalhe={`em ${numero(comAlgo.length)} de ${numero(lidas.length)} ${lidas.length === 1 ? "fila" : "filas"}`} />
        <Indicador rotulo="O mais antigo" icone={Hourglass} valor={idade === null ? "—" : haDias(idade)}
          tom={idade === null ? "neutro" : idade >= 3 ? "ruim" : idade >= 1 ? "atencao" : "neutro"}
          detalhe={maisAntiga ? maisAntiga.rotulo : "nada parado agora"} />
        <Indicador rotulo="Filas acompanhadas" icone={Activity} valor={numero(lidas.length + falhas.length)} detalhe="as que o seu papel decide" />
      </div>

      <Cartao className="mt-4" titulo="O que está parado" subtitulo="As filas com algo esperando, as mais antigas primeiro" icone={Hourglass}>
        {comAlgo.length === 0 ? (
          <EstadoVazio titulo="Nada parado nas filas que você acompanha" icone={Activity}>A leitura está funcionando; nenhuma fila tem algo esperando agora.</EstadoVazio>
        ) : (
          <>
            <BarrasHorizontais nomeSerie="Itens esperando" formatar={numero} dados={comAlgo.map((f) => ({ rotulo: f.rotulo, valor: f.quantidade }))} />
            <ul className="mt-4 divide-y divide-borda text-sm">
              {comAlgo.map((f) => {
                const IconeDaFila = ICONES_DAS_PENDENCIAS[f.icone];
                return (
                  <li key={f.chave} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <IconeDaFila aria-hidden className="size-4 shrink-0 text-acao" />
                      <span className="min-w-0"><Link href={f.href} className="font-semibold text-acao">{f.rotulo}</Link><span className="block text-xs text-suave">{f.detalhe}</span></span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2"><span className="numeros font-bold">{numero(f.quantidade)}</span>
                      {f.dias !== null && <Selo tom={tomDaIdade(f.dias)}>{haDias(f.dias)}</Selo>}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Cartao>

      {lidas.some((f) => f.quantidade === 0) && (
        <p className="mt-3 text-xs text-suave">Sem nada esperando: {lidas.filter((f) => f.quantidade === 0).map((f) => f.rotulo).join(" · ")}</p>
      )}
      {rotinas.estado !== "ausente" && (
        <Cartao className="mt-4" titulo="Rotinas automáticas" subtitulo="O que o banco faz sozinho, na hora marcada" icone={CalendarClock}>
          {rotinas.estado === "falha" ? (
            <Aviso tom="perigo">Não deu para ler as rotinas agora. As filas acima não dependem desta leitura.</Aviso>
          ) : rotinas.rotinas.length === 0 ? (
            <EstadoVazio titulo="Nenhuma rotina agendada" icone={CalendarClock}>O banco ainda não tem rotina automática.</EstadoVazio>
          ) : (
            <ul className="divide-y divide-borda text-sm">
              {rotinas.rotinas.map((r) => (
                <li key={r.nome} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0"><span className="font-semibold">{r.descricao}</span>
                    <span className="block text-xs text-suave">{`${r.frequencia} · ${ultimaRodada(r, agora)}`}</span></span>
                  <Selo tom={SITUACOES_DA_ROTINA[r.situacao].tom}>{SITUACOES_DA_ROTINA[r.situacao].rotulo}</Selo>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}
      <Aviso tom="info" className="mt-4">Erros do sistema e tempo de resposta ainda não aparecem aqui: dependem do monitoramento do servidor, a ligar.</Aviso>
    </>
  );
}

import { Activity, CalendarClock, Hourglass, Layers, PackageMinus, ServerCrash } from "lucide-react";
import Link from "next/link";

import { BarrasHorizontais } from "../../componentes/graficos";
import { Aviso, Cartao, EstadoVazio, Indicador, Selo, TituloPagina } from "../../componentes/ui";
import { horaEmSaoPaulo, minutosEmSaoPaulo, numero } from "../../lib/formato";
import type { AlertaDoEstoque } from "../../lib/inicio/alerta-do-estoque";
import { ICONES_DAS_PENDENCIAS } from "../../lib/inicio/icones-das-pendencias";
import { haQuanto } from "../../lib/notas/regras";
import { diasDesde, type LeituraDaFila } from "../../lib/operacao/filas";
import { minutosDesde, rotinasComProblema, SITUACOES_DA_ROTINA, type LeituraDasRotinas, type Rotina } from "../../lib/operacao/rotinas";
import type { ResumoDosErros, TipoDoErro } from "../../lib/saude/erros-do-servidor";

const haDias = (dias: number) => (dias === 0 ? "desde hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`);
const tomDaIdade = (dias: number | null) => (dias === null ? "neutro" : dias >= 3 ? "perigo" : dias >= 1 ? "aviso" : "neutro");

/** "última rodada certa há 3 min"; na falha, com o código do erro (o banco não guarda a mensagem). */
function ultimaRodada(r: Rotina, agora: number): string {
  const minutos = r.ultimaCerta ? minutosDesde(r.ultimaCerta, agora) : null;
  const certa = minutos === null ? "ainda sem rodada certa" : `última rodada certa ${minutos < 1 ? "agora há pouco" : haQuanto(minutos)}`;
  return r.situacao === "com_falha" && r.erro ? `${certa}; a última falhou (código ${r.erro})` : certa;
}

const TIPOS_DO_ERRO: Record<TipoDoErro, string> = { tela: "tela", acao: "ação", rota: "rota", proxy: "entrada do site" };
const dosErros = (n: number) => `${numero(n)} ${n === 1 ? "erro" : "erros"}`;
/** "14:05" no fuso de São Paulo. */
function horaMinuto(instante: number): string {
  const minutos = minutosEmSaoPaulo(new Date(instante));
  return `${String(horaEmSaoPaulo(new Date(instante))).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}
const haPouco = (instante: number, agora: number) => {
  const minutos = Math.max(0, Math.floor((agora - instante) / 60_000));
  return minutos < 1 ? "agora há pouco" : haQuanto(minutos);
};

// O conteúdo da saúde da operação (lote Q1; as rotinas, ROT-a; o aviso do estoque, SAUDE-a; os erros do servidor, OBS-a),
// à parte da página: recebe as filas, as rotinas, o estoque e os erros já lidos. O estoque é nulo para quem não consulta o
// estoque (ou banco sem o painel); os erros, para quem não gere a rede.
export function ConteudoDaOperacao({ filas, hoje, rotinas, agora, estoque = null, erros = null }: {
  filas: readonly LeituraDaFila[]; hoje: string; rotinas: LeituraDasRotinas; agora: number; estoque?: AlertaDoEstoque | null;
  erros?: ResumoDosErros | null;
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
      {erros && erros.ultimaHora > 0 && (
        <Aviso tom="perigo" titulo={erros.ultimaHora === 1 ? "Um erro do servidor na última hora" : `${numero(erros.ultimaHora)} erros do servidor na última hora`}>
          Uma tela mostrou a página de erro. Veja onde no cartão &quot;Erros do servidor&quot;, abaixo.
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
      {estoque && (
        <Cartao className="mt-4" titulo="Estoque abaixo do mínimo" subtitulo="Um aviso, não uma fila: não espera a decisão de ninguém e some quando o estoque volta ao mínimo" icone={PackageMinus}>
          {estoque.estado === "falha" ? (
            <Aviso tom="aviso">Não deu para ler o estoque agora. As filas acima não dependem desta leitura.</Aviso>
          ) : estoque.pendencia ? (
            <p className="text-sm">
              <Link href={estoque.pendencia.href} className="font-semibold text-acao">{`${numero(estoque.pendencia.quantidade)} ${estoque.pendencia.quantidade === 1 ? "produto numa loja" : "pares de produto e loja"}`}</Link>
              {" com o disponível abaixo do mínimo, nas lojas que você acompanha. Resolve-se com compra ou transferência, no painel do estoque."}
            </p>
          ) : (
            <p className="text-sm text-suave">Nenhum produto abaixo do mínimo nas lojas que você acompanha.</p>
          )}
        </Cartao>
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
      {erros && (
        <Cartao className="mt-4" titulo="Erros do servidor" subtitulo={`Desde ${horaMinuto(erros.desde)} (${haPouco(erros.desde, agora)}), quando o servidor subiu pela última vez; a conta recomeça a cada publicação`} icone={ServerCrash}>
          {erros.total === 0 ? (
            <EstadoVazio titulo="Nenhum erro do servidor desde então" icone={ServerCrash}>Quando uma tela mostrar a página de erro, ela aparece aqui, com o código que a loja vê.</EstadoVazio>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Indicador rotulo="Na última hora" icone={ServerCrash} valor={numero(erros.ultimaHora)} tom={erros.ultimaHora > 0 ? "ruim" : "neutro"} detalhe={dosErros(erros.ultimaHora)} />
                <Indicador rotulo="Nas últimas 24 horas" icone={ServerCrash} valor={erros.cheia ? `${numero(erros.ultimoDia)} ou mais` : numero(erros.ultimoDia)} tom={erros.ultimoDia > 0 ? "atencao" : "neutro"} detalhe="desde que o servidor subiu" />
                <Indicador rotulo="Desde que subiu" icone={ServerCrash} valor={numero(erros.total)} detalhe={dosErros(erros.total)} />
              </div>
              {erros.porRota.length > 0 && (
                <ul className="mt-4 divide-y divide-borda text-sm">
                  {erros.porRota.map((r) => (
                    <li key={`${r.tipo} ${r.rota}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                      <span className="min-w-0"><span className="numeros font-semibold">{r.rota}</span>
                        <span className="block text-xs text-suave">{`${TIPOS_DO_ERRO[r.tipo]} · o último ${haPouco(r.ultimo, agora)}`}</span></span>
                      <Selo tom="perigo">{dosErros(r.quantidade)}</Selo>
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-acao">Os mais recentes, com o código que a loja vê</summary>
                <ul className="mt-2 divide-y divide-borda">
                  {erros.recentes.map((e, i) => (
                    <li key={`${e.quando}-${i}`} className="py-1.5">
                      <span className="numeros">{horaMinuto(e.quando)}</span>{` · ${TIPOS_DO_ERRO[e.tipo]} · ${e.metodo} ${e.rota}`}
                      {e.codigo && <span className="numeros text-suave">{` · código ${e.codigo}`}</span>}
                      {e.etapa && <span className="text-suave">{` · o banco ou a rede não responderam (${e.etapa})`}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </Cartao>
      )}
      <Aviso tom="info" className="mt-4">O tempo de resposta do servidor ainda não aparece aqui: depende do monitoramento do servidor, a escolher.</Aviso>
    </>
  );
}

import { Activity, Hourglass, Layers } from "lucide-react";
import Link from "next/link";

import { BarrasHorizontais } from "../../componentes/graficos";
import { Aviso, Cartao, EstadoVazio, Indicador, Selo, TituloPagina } from "../../componentes/ui";
import { numero } from "../../lib/formato";
import { ICONES_DAS_PENDENCIAS } from "../../lib/inicio/icones-das-pendencias";
import { diasDesde, type LeituraDaFila } from "../../lib/operacao/filas";

const haDias = (dias: number) => (dias === 0 ? "desde hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`);
const tomDaIdade = (dias: number | null) => (dias === null ? "neutro" : dias >= 3 ? "perigo" : dias >= 1 ? "aviso" : "neutro");

// O conteúdo da saúde da operação (lote Q1), à parte da página: recebe as filas já lidas.
export function ConteudoDaOperacao({ filas, hoje }: { filas: readonly LeituraDaFila[]; hoje: string }) {
  const lidas = filas.flatMap((f) => (f.estado === "ok" ? [{ ...f, dias: f.desde ? diasDesde(f.desde, hoje) : null }] : []));
  const comAlgo = lidas.filter((f) => f.quantidade > 0).sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1) || b.quantidade - a.quantidade);
  const falhas = filas.filter((f) => f.estado === "falha");
  const total = lidas.reduce((s, f) => s + f.quantidade, 0);
  const maisAntiga = comAlgo.find((f) => f.dias !== null) ?? null;
  const idade = maisAntiga?.dias ?? null;

  return (
    <>
      <TituloPagina titulo="Saúde da operação" subtitulo="O que espera alguém nas lojas que você acompanha, fila por fila, e há quanto tempo está o mais antigo." />
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
      <Aviso tom="info" className="mt-4">Erros do sistema e tempo de resposta ainda não aparecem aqui: dependem do monitoramento do servidor, a ligar.</Aviso>
    </>
  );
}

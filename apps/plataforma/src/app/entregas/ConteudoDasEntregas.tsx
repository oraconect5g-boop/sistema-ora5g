import { ExternalLink, Hourglass, ListChecks, Rocket, ShieldCheck } from "lucide-react";

import { BarrasHorizontais } from "../../componentes/graficos";
import { Cartao, Indicador, Selo, TituloPagina } from "../../componentes/ui";
import { numero } from "../../lib/formato";
import { dataDoDia, ESTADOS_DOS_REQUISITOS, linkDoRoteiro, situacaoDoLote, type DadosDasEntregas } from "../../lib/entregas/entregas";
import { textoDaVersao, type DadosDaVersao } from "../../lib/versao";

// O conteúdo das entregas do projeto (lote ENTREGAS-a), à parte da página: recebe os dados gerados e a versão no ar.
export function ConteudoDasEntregas({ dados, versao }: { dados: DadosDasEntregas; versao: DadosDaVersao }) {
  const lotes = [...dados.lotes].reverse();
  const esperando = lotes.filter((l) => situacaoDoLote(l).chave === "esperando");
  const testados = dados.contagem.testado ?? 0;
  const barras = ESTADOS_DOS_REQUISITOS.map((e) => ({ rotulo: e.rotulo, valor: dados.contagem[e.chave] ?? 0 }));

  return (
    <>
      <TituloPagina titulo="Entregas do projeto" subtitulo="O que cada lote entregou, o que está no ar e o que espera o seu aceite." />
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Indicador rotulo="Homologados" icone={ShieldCheck} valor={`${numero(dados.homologados)} de ${numero(dados.total)}`}
          tom={dados.homologados > 0 ? "bom" : "neutro"} detalhe="só com o seu &quot;aceito&quot; no roteiro" />
        <Indicador rotulo="Esperando o seu aceite" icone={Hourglass} valor={numero(esperando.length)}
          tom={esperando.length > 0 ? "atencao" : "neutro"} detalhe={esperando.length > 0 ? esperando.map((l) => l.lote).join(", ") : "nenhum lote agora"} />
        <Indicador rotulo="Testados em desenvolvimento" icone={ListChecks} valor={numero(testados)} detalhe={`de ${numero(dados.total)} requisitos`} />
      </div>

      <Cartao className="mt-4" titulo="Os 179 requisitos" subtitulo={`Situação no checkpoint de ${dataDoDia(dados.atualizado_em)}`} icone={ListChecks}>
        <BarrasHorizontais nomeSerie="Requisitos" formatar={numero} dados={barras} />
      </Cartao>

      <Cartao className="mt-4" titulo="Lotes com roteiro de aceite" subtitulo="O mais novo primeiro" icone={Rocket}>
        <ul className="divide-y divide-borda text-sm">
          {lotes.map((l) => {
            const s = situacaoDoLote(l);
            return (
              <li key={l.lote} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{l.lote}</span>
                  <Selo tom={s.tom}>{s.rotulo}</Selo>
                </div>
                <p className="text-xs text-suave">{l.entrega}</p>
                <p className="text-xs text-suave">{[
                  l.requisitos.join(", "),
                  l.publicado_em ? `no ar desde ${dataDoDia(l.publicado_em)}${l.commit ? ` (commit ${l.commit})` : ""}` : "",
                  l.pedido_em ? `aceite pedido em ${dataDoDia(l.pedido_em)}` : "",
                ].filter(Boolean).join(" · ")}</p>
                <a href={linkDoRoteiro(l.roteiro)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-acao">
                  Ver o roteiro de aceite <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </li>
            );
          })}
        </ul>
      </Cartao>

      <p className="mt-3 text-xs text-suave">{`Versão no ar agora: ${textoDaVersao(versao)}. Os lotes e o placar são os do checkpoint de ${dataDoDia(dados.atualizado_em)}.`}</p>
    </>
  );
}

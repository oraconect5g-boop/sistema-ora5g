import { Scale } from "lucide-react";

import { Aviso, Cartao, Indicador, Selo } from "../../../../componentes/ui";
import { CONCILIACOES_NOGLE_DEMO, type ResultadoQueNaoFecha } from "../../../../demo/dados";
import { NOMES_DOS_RELATORIOS, RESULTADOS_DA_CONCILIACAO, SO_NA_ORA } from "../../../../lib/connect/conciliacao";
import { numero } from "../../../../lib/formato";

const ROTULOS: Record<ResultadoQueNaoFecha, string> = {
  valor_diferente: RESULTADOS_DA_CONCILIACAO.valor_diferente.rotulo,
  so_na_nogle: RESULTADOS_DA_CONCILIACAO.so_na_nogle.rotulo,
  so_na_ora: SO_NA_ORA.rotulo,
};
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

// A conciliação da Ora Connect com os relatórios oficiais da Nogle na demonstração (DEMO-b; a tela real é /connect/conciliacao,
// do lote CONNECT-c). Números FICTÍCIOS, com os mesmos rótulos da tela real; só o final da linha e do ICCID aparece.
export function ConciliacaoNogle() {
  return (
    <Cartao titulo="Conciliação com os relatórios da Nogle" subtitulo="As ativações e as recargas da Ora conferidas com os relatórios oficiais da Nogle (números fictícios)" icone={Scale}>
      <div className="space-y-6">
        {CONCILIACOES_NOGLE_DEMO.map((c) => (
          <section key={c.relatorio} aria-label={`Conciliação das ${NOMES_DOS_RELATORIOS[c.relatorio]?.toLowerCase() ?? c.relatorio}`}>
            <h3 className="text-sm font-semibold">{`${NOMES_DOS_RELATORIOS[c.relatorio] ?? c.relatorio} · de ${dia(c.de)} a ${dia(c.ate)} · ${numero(c.linhas)} linhas no relatório da Nogle`}</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Indicador rotulo={RESULTADOS_DA_CONCILIACAO.conferida.rotulo} valor={numero(c.conferidas)} detalhe={RESULTADOS_DA_CONCILIACAO.conferida.detalhe} />
              <Indicador rotulo={RESULTADOS_DA_CONCILIACAO.valor_diferente.rotulo} valor={numero(c.valorDiferente)} detalhe={RESULTADOS_DA_CONCILIACAO.valor_diferente.detalhe} />
              <Indicador rotulo={RESULTADOS_DA_CONCILIACAO.so_na_nogle.rotulo} valor={numero(c.soNaNogle)} detalhe={RESULTADOS_DA_CONCILIACAO.so_na_nogle.detalhe} />
              <Indicador rotulo={SO_NA_ORA.rotulo} valor={numero(c.soNaOra)} detalhe={SO_NA_ORA.detalhe} />
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-suave">O que não fecha</p>
            <ul className="divide-y divide-borda text-sm">
              {c.naoFecham.map((l) => (
                <li key={`${l.resultado}-${l.dia}-${l.linha}`} className="py-2">
                  <p className="numeros"><Selo tom={l.resultado === "so_na_nogle" ? "perigo" : "aviso"}>{ROTULOS[l.resultado]}</Selo>{` ${dia(l.dia)} · linha ${l.linha} · ICCID ${l.iccid}`}</p>
                  <p className="text-xs text-suave">{l.detalhe}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <Aviso tom="info" titulo="Na demonstração nada é buscado na Nogle">
          No sistema real, o servidor busca os relatórios oficiais quando a Nogle estiver ligada. Ficam de fora o extrato do saldo e as
          comissões (a Nogle respondeu que não há na API). A conciliação só mostra o que fecha e o que não fecha: nada muda uma operação.
        </Aviso>
      </div>
    </Cartao>
  );
}

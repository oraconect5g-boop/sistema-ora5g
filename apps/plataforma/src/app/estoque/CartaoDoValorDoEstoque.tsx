import { Coins, PackageX, Truck } from "lucide-react";

import { BarrasHorizontais, TabelaDoGrafico } from "../../componentes/graficos";
import { EstadoDoPainel } from "../../componentes/paineis-de-vendas";
import { Cartao, Indicador } from "../../componentes/ui";
import type { ValorDoEstoque } from "../../lib/estoque/valor";
import { brl, brlCompacto, numero } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";

const itens = (q: number) => `${numero(q)} ${q === 1 ? "item" : "itens"}`;
const variacoes = (q: number) => `${numero(q)} ${q === 1 ? "variação" : "variações"}`;
const semCusto = (q: number) => `${itens(q)} sem custo ${q === 1 ? "ficou" : "ficaram"} fora`;

// O valor do estoque a custo (lote G3b: REPORT-007; E8 da matriz), na aba Painel do estoque, só para quem vê o custo.
// O item sem custo gravado fica fora da soma e é contado (nunca vira zero na conta), também no que está chegando e no
// que está fora da venda. Cada indicador só aparece quando o recorte tem o local de que ele fala.
export function CartaoDoValorDoEstoque({ leitura, aqui }: { leitura: Leitura<ValorDoEstoque>; aqui: string }) {
  if (leitura.estado !== "ok") {
    return <Cartao className="mt-4" titulo="Valor do estoque a custo" icone={Coins}><EstadoDoPainel estado={leitura.estado} tentarDeNovo={aqui} /></Cartao>;
  }
  const v = leitura.dados;
  const vendem = v.porLocal.filter((l) => l.vende);
  const fora = v.porLocal.filter((l) => !l.vende);
  const indicadores = [
    vendem.length > 0 && (
      <Indicador key="vendem" rotulo={vendem.length > 1 ? "Nos locais que vendem" : "No estoque"} icone={Coins} valor={brl(v.valor)} tom={v.itensSemCusto > 0 ? "atencao" : "neutro"}
        detalhe={v.itensSemCusto > 0 ? `${itens(v.itensSemCusto)} de ${variacoes(v.variacoesSemCusto)} sem custo ${v.itensSemCusto === 1 ? "ficou" : "ficaram"} fora`
          : v.itensComCusto > 0 ? `${itens(v.itensComCusto)}, todos com custo` : "nenhum item com saldo"} />
    ),
    vendem.length > 0 && (
      <Indicador key="chegando" rotulo="Chegando" icone={Truck} valor={brl(v.valorChegando)} tom={v.chegandoSemCusto > 0 ? "atencao" : "neutro"}
        detalhe={v.chegandoSemCusto > 0 ? semCusto(v.chegandoSemCusto) : "em transferências enviadas e ainda não recebidas"} />
    ),
    fora.length > 0 && (
      <Indicador key="fora" rotulo="Fora da venda" icone={PackageX} valor={brl(v.valorForaDaVenda)} tom={v.itensForaDaVendaSemCusto > 0 ? "atencao" : "neutro"}
        detalhe={v.itensForaDaVendaSemCusto > 0 ? semCusto(v.itensForaDaVendaSemCusto) : fora.map((l) => l.nome).join(", ")} />
    ),
  ].filter((x) => x !== false);
  return (
    <Cartao className="mt-4" titulo="Valor do estoque a custo" subtitulo="Quantidade de agora × o custo vigente de cada variação (o último gravado, igual em toda a rede)" icone={Coins}>
      <div className={`grid grid-cols-1 gap-3 ${indicadores.length === 3 ? "sm:grid-cols-3" : indicadores.length === 2 ? "sm:grid-cols-2" : ""}`}>{indicadores}</div>
      {vendem.length > 1 && vendem.some((l) => l.valor > 0) && (
        <div className="mt-4">
          <BarrasHorizontais nomeSerie="Valor a custo" formatar={brlCompacto} dados={vendem.filter((l) => l.valor > 0).map((l) => ({ rotulo: l.nome, valor: l.valor }))} />
          <TabelaDoGrafico titulo="Ver o valor de cada local" colunas={["Local", "Valor a custo", "Itens com custo", "Itens sem custo", "Chegando"]}
            linhas={v.porLocal.map((l) => [`${l.nome}${l.vende ? "" : " (fora da venda)"}`, brl(l.valor), numero(l.itensComCusto), numero(l.itensSemCusto),
              l.chegandoSemCusto > 0 ? `${brl(l.valorChegando)} (+${itens(l.chegandoSemCusto)} sem custo)` : brl(l.valorChegando)])} />
        </div>
      )}
    </Cartao>
  );
}

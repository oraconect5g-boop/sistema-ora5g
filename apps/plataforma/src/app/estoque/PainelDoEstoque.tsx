import { ArrowDownToLine, Boxes, ClipboardList, Hourglass, PackageX, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { BarraSegmentada, BarrasHorizontais, TabelaDoGrafico } from "../../componentes/graficos";
import { EstadoDoPainel, Indicadores, LIGACAO, plural, type ItemDoResumo } from "../../componentes/paineis-de-vendas";
import { Cartao, EstadoVazio, ListaDados } from "../../componentes/ui";
import { categoriasDaBarra, modelosDoGrafico, pendenciasDe, type EstoqueDoBanco } from "../../lib/estoque/painel";
import { numero } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";

// Painéis do estoque (lote G3): a posição de agora, somada no banco (lib/estoque/consulta-painel), no
// recorte de quem pede. Só apresentação. Cada número tem a tabela ao lado e leva ao detalhe: o modelo
// abre a busca do saldo, o local abre o painel daquele local e a pendência abre a tela onde se resolve.

const nomeDoLocal = (nome: string, vende: boolean) => (vende ? nome : `${nome} (não vende)`);

export function PainelDoEstoque({ estoque, redeInteira, aqui, enderecoDoLocal }: {
  estoque: Leitura<EstoqueDoBanco>;
  /** O recorte é a rede inteira (mais de um local): aparece o painel por local. */
  redeInteira: boolean;
  /** Este mesmo endereço, para o "Tentar de novo". */
  aqui: string;
  enderecoDoLocal: (unidade: string) => string;
}) {
  if (estoque.estado !== "ok") {
    return <Cartao titulo="Painel do estoque"><EstadoDoPainel estado={estoque.estado} fonte="estoque" tentarDeNovo={aqui} /></Cartao>;
  }
  const e = estoque.dados;
  const t = e.totais;
  const pendencias = pendenciasDe(e.locais);
  const totalDePendencias = pendencias.reduce((s, p) => s + p.quantidade, 0);
  const indicadores: ItemDoResumo[] = [
    { rotulo: "Disponível para vender", icone: Boxes, valor: numero(t.disponivel), detalhe: `Físico ${numero(t.fisico)} · reservado ${numero(t.reservado)}` },
    { rotulo: "Chegando", icone: ArrowDownToLine, valor: numero(t.chegando), detalhe: "Transferências enviadas, ainda não recebidas" },
    {
      rotulo: "Abaixo do mínimo", icone: TriangleAlert, valor: numero(t.abaixoDoMinimo), tom: t.abaixoDoMinimo > 0 ? "atencao" : "neutro",
      detalhe: redeInteira ? "Variações abaixo do mínimo, contando cada loja" : "Variações com o disponível abaixo do mínimo",
    },
    { rotulo: "Parado há mais de 60 dias", icone: Hourglass, valor: numero(t.parado), tom: t.parado > 0 ? "atencao" : "neutro", detalhe: "Unidades disponíveis sem venda nem entrada no período" },
    {
      rotulo: "Pendências", icone: ClipboardList, valor: numero(totalDePendencias), tom: totalDePendencias > 0 ? "atencao" : "neutro",
      detalhe: pendencias.length === 0 ? "Nada esperando a loja" : pendencias.slice(0, 2).map((p) => plural(p.quantidade, p.um, p.varios)).join(" · "),
    },
    { rotulo: "Fora da venda", icone: PackageX, valor: numero(t.foraDaVenda), detalhe: "Em DEFEITOS, depósito ou assistência" },
  ];
  const doGrafico = modelosDoGrafico(e.modelos);
  const partes = categoriasDaBarra(e.categorias);
  const locaisQueVendem = e.locais.filter((l) => l.vende);
  const colunasDeNumeros = ["Físico", "Reservado", "Disponível"];

  return (
    <div className="space-y-4">
      <Indicadores itens={indicadores} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Disponível por modelo" subtitulo="Disponível = físico − reservado. O traço é o mínimo" className="xl:col-span-2">
          {doGrafico.length === 0 ? (
            <EstadoVazio titulo="Nenhum produto em estoque" icone={Boxes}>A leitura está funcionando; só não há saldo, mínimo nem mercadoria chegando.</EstadoVazio>
          ) : (
            <BarrasHorizontais
              nomeSerie="Disponível" nomeMeta="Mínimo" formatar={numero}
              dados={doGrafico.map((m) => ({
                rotulo: m.produto, valor: m.disponivel, meta: m.minimo > 0 ? m.minimo : undefined,
                detalhe: m.abaixoDoMinimo > 0 ? `${numero(m.abaixoDoMinimo)} abaixo do mínimo` : m.reservado > 0 ? `${numero(m.reservado)} reservado` : undefined,
              }))}
            />
          )}
          {e.modelos.length > 0 && (
            <TabelaDoGrafico
              titulo={`Ver os ${numero(e.modelos.length)} modelos`}
              colunas={["Modelo", "Categoria", ...colunasDeNumeros, "Mínimo", "Abaixo do mínimo", "Parado", "Chegando"]}
              linhas={e.modelos.map((m) => [
                <Link key={m.produtoId} href={`/estoque?q=${encodeURIComponent(m.produto)}`} className="font-semibold text-acao hover:underline">{m.produto}</Link>,
                m.categoria ?? "Sem categoria", numero(m.fisico), numero(m.reservado), numero(m.disponivel), m.minimo > 0 ? numero(m.minimo) : "—",
                numero(m.abaixoDoMinimo), numero(m.parado), numero(m.chegando),
              ])}
            />
          )}
        </Cartao>

        <Cartao titulo="Por categoria" subtitulo="Partes do disponível para vender">
          {partes.length === 0 ? (
            <EstadoVazio titulo="Nada disponível para vender" icone={Boxes} />
          ) : (
            <BarraSegmentada rotulo="Disponível" formatar={numero} partes={partes} />
          )}
          {e.categorias.length > 0 && (
            <TabelaDoGrafico
              colunas={["Categoria", ...colunasDeNumeros, "Abaixo do mínimo", "Parado"]}
              linhas={e.categorias.map((c) => [c.categoria ?? "Sem categoria", numero(c.fisico), numero(c.reservado), numero(c.disponivel), numero(c.abaixoDoMinimo), numero(c.parado)])}
            />
          )}
        </Cartao>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {redeInteira && (
          <Cartao titulo="Por local" subtitulo="Disponível para vender em cada loja; cada uma abre o painel dela" className="xl:col-span-2">
            {locaisQueVendem.some((l) => l.disponivel > 0) ? (
              <BarrasHorizontais nomeSerie="Disponível" formatar={numero} dados={locaisQueVendem.map((l) => ({ rotulo: l.nome, valor: l.disponivel, detalhe: l.chegando > 0 ? `${numero(l.chegando)} chegando` : undefined }))} />
            ) : (
              <EstadoVazio titulo="Nenhuma loja com produto disponível" icone={Boxes} />
            )}
            <TabelaDoGrafico
              colunas={["Local", ...colunasDeNumeros, "Chegando", "Abaixo do mínimo", "Parado", "Pendências"]}
              linhas={e.locais.map((l) => [
                <Link key={l.unidadeId} href={enderecoDoLocal(l.unidadeId)} className="font-semibold text-acao hover:underline">{nomeDoLocal(l.nome, l.vende)}</Link>,
                numero(l.fisico), numero(l.reservado), l.vende ? numero(l.disponivel) : "—", numero(l.chegando), numero(l.abaixoDoMinimo), numero(l.parado),
                numero(Object.values(l.pendencias).reduce((s, x) => s + x, 0)),
              ])}
            />
          </Cartao>
        )}

        <Cartao titulo="Pendências" subtitulo={redeInteira ? "Somadas nos locais que você consulta" : "O que está esperando a loja"} className={redeInteira ? "" : "xl:col-span-3"}>
          {pendencias.length === 0 ? (
            <EstadoVazio titulo="Nenhuma pendência" icone={ClipboardList}>Transferências, inventários, retornos e a conferência do dia estão em dia.</EstadoVazio>
          ) : (
            <ListaDados itens={pendencias.map((p) => [<Link key={p.chave} href={p.href} className={LIGACAO}>{p.rotulo}</Link>, numero(p.quantidade)] as const)} />
          )}
        </Cartao>
      </div>
    </div>
  );
}

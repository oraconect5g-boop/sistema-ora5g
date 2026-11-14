import { Users } from "lucide-react";
import Link from "next/link";

import { BarrasHorizontais, TabelaDoGrafico } from "../../componentes/graficos";
import {
  CABECAS, COLUNAS_DO_DESEMPENHO, desempenho, EstadoDoPainel, indicadorDaMargem, indicadorDoRecebido, Indicadores, indicadoresDeVendas, LIGACAO, NOTA,
  PainelDasLojas, PainelDeRecebimentos, PainelDeVendas, PainelDoMix, plural, SEM_LEITURA, temFatos, type ItemDoResumo,
} from "../../componentes/paineis-de-vendas";
import { indicadorDoConnect } from "../../componentes/paineis-do-connect";
import { PainelDaMetaDoMes, PainelDaMinhaMeta } from "../../componentes/paineis-de-metas";
import { Cartao, EstadoVazio, FiltroSegmentado } from "../../componentes/ui";
import type { LojaDoFiltro } from "../../lib/financeiro/escopo";
import { ORDEM_DOS_PERIODOS, PERIODOS_FINANCEIROS, type ResumoFinanceiro } from "../../lib/financeiro/painel";
import { brl, numero } from "../../lib/formato";
import type { PaineisComDados, PaineisDoInicio } from "../../lib/inicio/consulta";
import { enderecoDoFinanceiro, enderecoDoInicio, textosDoPeriodo, vendedoresDoPainel, type Leitura } from "../../lib/inicio/painel";
import type { RegioesDoPainel } from "../../lib/lojas/regioes";

// Apresentação dos painéis do Início (G1), separada da leitura: recebe o que lib/inicio/consulta leu,
// já com o estado de cada fonte. Sem acesso a dados aqui. Os painéis de vendas, recebimentos, mix e
// lojas são os mesmos dos Relatórios e ficam em componentes/paineis-de-vendas; aqui ficam a gaveta
// dos caixas, o ranking de vendedores e a montagem da seção na visão de quem pede.

function indicadoresDoFinanceiro(financeiro: Leitura<ResumoFinanceiro>, conferenteDeCaixa: boolean): ItemDoResumo[] {
  const gaveta = (): ItemDoResumo => {
    // A permissão vem antes do estado da leitura: sem caixa.conferir a gaveta da loja não é mostrada
    // (o banco só devolveria os caixas da própria pessoa, e a soma pareceria a da loja).
    if (!conferenteDeCaixa) return { ...CABECAS.gaveta, valor: "—", detalhe: "Só quem confere caixas acompanha a gaveta" };
    if (financeiro.estado !== "ok") return { ...CABECAS.gaveta, valor: "—", detalhe: SEM_LEITURA[financeiro.estado], tom: "atencao" };
    const f = financeiro.dados;
    return { ...CABECAS.gaveta, valor: brl(f.saldoDaGaveta), detalhe: `Entradas menos saídas das gavetas no período · ${plural(f.caixas.abertosAgora, "caixa aberto agora", "caixas abertos agora")}` };
  };
  return [indicadorDoRecebido(financeiro), gaveta()];
}

function PainelDeVendedores({ paineis, usuario, aqui }: { paineis: PaineisComDados; usuario: string; aqui: string }) {
  const { vendas, nomes, visao, escopo } = paineis;
  const daRedeInteira = visao === "rede" && escopo.unidade === null;
  const limite = daRedeInteira ? 10 : 12;
  const cartao = { titulo: daRedeInteira ? "Melhores vendedores" : "Equipe", subtitulo: "Vendido por vendedor de origem. Não é comissão" };
  if (nomes === "sem_permissao") {
    return <Cartao {...cartao}><EstadoDoPainel estado="sem_permissao" motivo="Você não tem a permissão de ver o ranking de vendedores nesta loja." /></Cartao>;
  }
  if (vendas.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={vendas.estado} fonte="vendas" tentarDeNovo={aqui} /></Cartao>;
  // Sem os nomes não há ranking: nenhum número é mostrado (nada de lista de "não identificados").
  if (nomes === null || nomes.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={nomes?.estado ?? "falha"} fonte="nomes" tentarDeNovo={aqui} /></Cartao>;

  const vendedores = vendedoresDoPainel(vendas.dados.vendedores, nomes.dados, usuario);
  const comVenda = vendedores.filter((v) => v.vendido > 0);
  return (
    <Cartao {...cartao}>
      {comVenda.length > 0 ? (
        <>
          <BarrasHorizontais duasColunas={daRedeInteira} nomeSerie="Vendido" formatar={brl} dados={comVenda.slice(0, limite).map((v) => ({ rotulo: v.nome, valor: v.vendido, detalhe: plural(v.vendas, "venda", "vendas") }))} />
          {comVenda.length > limite && <p className="mt-3 text-xs text-suave">O gráfico mostra os {limite} primeiros; a tabela traz todos os {numero(vendedores.length)}.</p>}
        </>
      ) : (
        <EstadoVazio titulo="Nenhuma venda concluída no período" icone={Users}>A leitura está funcionando; ninguém concluiu venda neste recorte.</EstadoVazio>
      )}
      {vendedores.some(temFatos) && <TabelaDoGrafico colunas={["Vendedor", ...COLUNAS_DO_DESEMPENHO]} linhas={vendedores.map((v) => [v.nome, ...desempenho(v)])} />}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// A seção inteira, na visão de quem pede
// ---------------------------------------------------------------------------------------------
export function ConteudoInicio({ paineis, usuario, turno, conferenteDeCaixa, regioes = null }: {
  paineis: PaineisDoInicio; usuario: string; turno: LojaDoFiltro; conferenteDeCaixa: boolean;
  /** ORG-009: as regiões da rede (só para quem vê a rede); a soma por região aparece na rede inteira. */
  regioes?: RegioesDoPainel;
}) {
  if (paineis.visao === "nenhuma") {
    return (
      <Cartao titulo="Vendas">
        <EstadoDoPainel estado="sem_permissao" motivo="Você não tem permissão para acompanhar vendas nesta loja." />
      </Cartao>
    );
  }
  const { visao, periodo, escopo, janelas, filtroDeLojas, cadastro, vendas, anterior, financeiro, margem } = paineis;
  const daRede = visao === "rede";
  const doVendedor = visao === "vendedor";
  const redeInteira = daRede && escopo.unidade === null;
  // Só quem vê a rede leva a loja no endereço; os demais ficam na loja do turno.
  const lojaDoEndereco = daRede ? escopo.unidade : null;
  const aqui = enderecoDoInicio(periodo, lojaDoEndereco);
  const recorte = PERIODOS_FINANCEIROS[periodo].rotulo;
  const textos = textosDoPeriodo(periodo);
  const dasVendas = { vendas, anterior, janelas, textos, aqui, doVendedor };
  const lojas = <PainelDasLojas vendas={vendas} cadastro={cadastro} turno={turno} aqui={aqui} doVendedor={doVendedor} enderecoDaLoja={(loja) => enderecoDoInicio(periodo, loja)} regioes={redeInteira ? regioes : null} />;
  const mix = <PainelDoMix vendas={vendas} aqui={aqui} doVendedor={doVendedor} />;

  return (
    <section aria-labelledby="titulo-dos-paineis" className="space-y-4">
      <header className="flex flex-col gap-3">
        <div>
          <h2 id="titulo-dos-paineis" className="text-lg font-bold tracking-tight">{doVendedor ? "Meus resultados" : "Acompanhamento das vendas"}</h2>
          <p className={NOTA}>
            {doVendedor ? `Só as suas vendas (você como vendedor de origem), nas lojas em que você trabalha · ${recorte}` : `${escopo.nome} · ${recorte}`}
          </p>
        </div>
        <FiltroSegmentado rotulo="Período" opcoes={ORDEM_DOS_PERIODOS.map((p) => ({ href: enderecoDoInicio(p, lojaDoEndereco), rotulo: PERIODOS_FINANCEIROS[p].rotulo, ativo: p === periodo }))} />
        {filtroDeLojas.length > 0 && (
          <FiltroSegmentado rotulo="Loja" opcoes={filtroDeLojas.map((l) => ({ href: enderecoDoInicio(periodo, l.id === "rede" ? null : l.id), rotulo: l.nome, ativo: l.id === escopo.chave }))} />
        )}
      </header>

      <Indicadores itens={[...indicadoresDeVendas({ vendas, anterior, textos, doVendedor }), ...(margem ? [indicadorDaMargem(margem)] : []), ...(financeiro ? indicadoresDoFinanceiro(financeiro, conferenteDeCaixa) : []), ...(paineis.producao ? [indicadorDoConnect(paineis.producao)] : [])]} />

      {/* A meta do mês (G4c): sempre o mês de hoje, qualquer que seja o período escolhido acima. */}
      {paineis.metaDaGestao && (
        <PainelDaMetaDoMes
          metas={paineis.metaDaGestao} rede={redeInteira} lojas={cadastro.length > 0 ? cadastro : [turno]} aqui={aqui}
          enderecoDasMetas={escopo.unidade && escopo.unidade !== turno.id ? `/metas?loja=${escopo.unidade}` : "/metas"} regioes={redeInteira ? regioes : null}
        />
      )}
      {paineis.minhaMeta && <PainelDaMinhaMeta metas={paineis.minhaMeta} eu={usuario} aqui={aqui} />}

      {doVendedor ? (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <PainelDeVendas {...dasVendas} acao={<Link href="/vendas" className={LIGACAO}>Ver minhas vendas</Link>} />
            {mix}
          </div>
          {vendas.estado === "ok" && vendas.dados.lojas.length > 1 && lojas}
          {/* Decisão pendente P3: nomes dos colegas ou só a própria posição. Até lá, nada da loja aqui. */}
          <Cartao titulo="Resumo da loja e ranking">
            <EstadoDoPainel estado="sem_permissao" motivo="O resumo da loja e o ranking com os colegas ainda não estão liberados para vendedores: dependem de uma decisão do proprietário. Por enquanto, você acompanha só as suas vendas." />
          </Cartao>
        </>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <PainelDeVendas {...dasVendas} acao={<Link href={enderecoDoFinanceiro(periodo, escopo, turno.id, daRede)} className={LIGACAO}>Conferir no financeiro</Link>} />
            {financeiro && <PainelDeRecebimentos financeiro={financeiro} aqui={aqui} acao={<Link href={enderecoDoFinanceiro(periodo, escopo, turno.id, daRede, "pagamentos")} className={LIGACAO}>Ver pagamentos</Link>} />}
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {mix}
            {redeInteira ? lojas : <PainelDeVendedores paineis={paineis} usuario={usuario} aqui={aqui} />}
          </div>
          {redeInteira && <PainelDeVendedores paineis={paineis} usuario={usuario} aqui={aqui} />}
        </>
      )}
    </section>
  );
}

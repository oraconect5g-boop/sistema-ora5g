import { Download } from "lucide-react";
import type { Metadata } from "next";

import { MoldeReal, permissoesDoMenu } from "../../componentes/MoldeReal";
import { Aviso, classeBotao, FiltroSegmentado, TituloPagina } from "../../componentes/ui";
import { podeVerFinanceiro } from "../../lib/acesso/menu";
import { obterSessao } from "../../lib/acesso/sessao";
import type { LojaDoFiltro } from "../../lib/financeiro/escopo";
import { lerRegioesDoPainel } from "../../lib/lojas/regioes";
import { textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { lerRelatorios, podeVerCusto } from "../../lib/relatorios/consulta";
import { enderecoDaExportacao, enderecoDosRelatorios, ORDEM_DOS_RELATORIOS, paginaDoRelatorio, PERIODOS_DOS_RELATORIOS, periodoDoRelatorio } from "../../lib/relatorios/painel";
import { ConteudoRelatorios } from "./ConteudoRelatorios";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

type Parametros = { periodo?: ValorDeParametro; loja?: ValorDeParametro; pagina?: ValorDeParametro };

// Relatórios reais (lote G2a): os painéis de vendas, recebimentos, mix e lojas em 7, 14 ou 30 dias,
// mais ticket médio e descontos por dia e a margem bruta (por dia, cobertura do custo e por item).
// Tudo somado no banco, no recorte que quem pede pode ver; nada aqui vem da demonstração.
// A margem só aparece para quem tem a permissão de ver o custo; o banco confere de novo, loja a loja.
export default async function Relatorios({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao: situacaoDaSessao } = sessao;
  const turno: LojaDoFiltro = { id: situacaoDaSessao.unidade_id as string, nome: situacaoDaSessao.unidade_nome ?? "Loja do turno" };
  const permissoes = await permissoesDoMenu(supabase, turno.id);
  if (!podeVerFinanceiro(permissoes)) {
    return (
      <MoldeReal sessao={sessao} permissoes={permissoes}>
        <TituloPagina titulo="Relatórios" />
        <Aviso tom="aviso" titulo="Sem permissão">
          Os relatórios são da gerência e da diretoria. As suas vendas continuam em Vendas, e os seus resultados, no Início. O banco também recusa, mesmo que alguém digite o endereço.
        </Aviso>
      </MoldeReal>
    );
  }

  const daRede = permissoes.has("venda.ver_todas");
  const custo = await podeVerCusto(supabase, turno.id);
  // ORG-009: as regiões só servem a quem vê a rede (a soma por região na rede inteira).
  const [relatorios, regioes] = await Promise.all([lerRelatorios(supabase, {
    periodo: periodoDoRelatorio(textoDoParametro(parametros.periodo)),
    loja: textoDoParametro(parametros.loja),
    turno,
    daRede,
    custo,
    metas: permissoes.has("metas.gerir") || permissoes.has("metas.ver_unidade"),
    pagina: paginaDoRelatorio(textoDoParametro(parametros.pagina)),
  }), daRede ? lerRegioesDoPainel(supabase) : Promise.resolve(null)]);
  const { periodo, escopo, filtroDeLojas } = relatorios;
  // Só quem vê a rede leva a loja no endereço; os demais ficam na loja do turno.
  const lojaDoEndereco = daRede ? escopo.unidade : null;

  return (
    <MoldeReal sessao={sessao} permissoes={permissoes} largura="max-w-6xl">
      <TituloPagina
        sobretitulo={escopo.nome}
        titulo="Relatórios"
        subtitulo="Vendas, recebimentos, mix, ticket, descontos e margem bruta, dia a dia, somados no banco. Os registros por trás de cada número ficam no Financeiro."
        acao={<a href={enderecoDaExportacao(periodo, lojaDoEndereco, "dias")} download className={classeBotao("secundario")}><Download aria-hidden className="size-4" /> Exportar por dia (CSV)</a>}
      />
      <div className="mb-4 flex flex-col gap-3">
        <FiltroSegmentado rotulo="Período" opcoes={ORDEM_DOS_RELATORIOS.map((p) => ({ href: enderecoDosRelatorios(p, lojaDoEndereco), rotulo: PERIODOS_DOS_RELATORIOS[p].rotulo, ativo: p === periodo }))} />
        {filtroDeLojas.length > 0 && (
          <FiltroSegmentado
            rotulo="Loja"
            opcoes={filtroDeLojas.map((l) => ({ href: enderecoDosRelatorios(periodo, l.id === "rede" ? null : l.id), rotulo: l.nome, ativo: l.id === escopo.chave }))}
          />
        )}
      </div>

      <ConteudoRelatorios relatorios={relatorios} turno={turno} regioes={regioes} />
    </MoldeReal>
  );
}

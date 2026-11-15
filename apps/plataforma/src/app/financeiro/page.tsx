import type { Metadata } from "next";

import { BaixarPlanilha } from "../../componentes/BaixarPlanilha";
import { MoldeReal, permissoesDoMenu } from "../../componentes/MoldeReal";
import { Aviso, FiltroSegmentado, TituloPagina } from "../../componentes/ui";
import { podeVerFinanceiro } from "../../lib/acesso/menu";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { consultarPainel } from "../../lib/financeiro/consulta";
import { escolherEscopo, opcoesDeLoja, type LojaDoFiltro } from "../../lib/financeiro/escopo";
import { janelasDoPeriodo, ORDEM_DOS_PERIODOS, PERIODOS_FINANCEIROS, periodoFinanceiro, resumoDoPainel, seriesDoPainel, type PeriodoFinanceiro } from "../../lib/financeiro/painel";
import { idsDosRegistros, paginaDeRegistros, situacaoDoParametro, visaoDoParametro, VISOES, type Registros } from "../../lib/financeiro/registros";
import { lerPagamentosPorMaquininha } from "../../lib/financeiro/terminais";
import { textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { ConteudoFinanceiro, type Nomes } from "./ConteudoFinanceiro";

export const metadata: Metadata = { title: "Financeiro" };
export const dynamic = "force-dynamic";

type Sessao = Awaited<ReturnType<typeof obterSessao>>;
type Parametros = { periodo?: ValorDeParametro; loja?: ValorDeParametro; ver?: ValorDeParametro; situacao?: ValorDeParametro; pagina?: ValorDeParametro };

// Financeiro real, primeira fatia (#65): vendas e devoluções, pagamentos registrados por meio e a
// movimentação/fechamento dos caixas, da loja do turno (ou da rede, para quem pode), com o
// detalhamento dos registros e a exportação. Nada aqui vem da demonstração.
export default async function Financeiro({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao: situacaoDaSessao } = sessao;
  const turno: LojaDoFiltro = { id: situacaoDaSessao.unidade_id as string, nome: situacaoDaSessao.unidade_nome ?? "Loja do turno" };
  const permissoes = await permissoesDoMenu(supabase, turno.id);
  if (!podeVerFinanceiro(permissoes)) {
    return (
      <MoldeReal sessao={sessao} permissoes={permissoes}>
        <TituloPagina titulo="Financeiro" />
        <Aviso tom="aviso" titulo="Sem permissão">
          O financeiro é da gerência e da diretoria. As suas vendas e o seu caixa continuam em Vendas e em Caixa. O banco também recusa, mesmo que alguém digite o endereço.
        </Aviso>
      </MoldeReal>
    );
  }

  const daRede = permissoes.has("venda.ver_todas");
  let lojas: LojaDoFiltro[] = [];
  if (daRede) {
    const r = await supabase.from("unidades").select("id, nome, tipo").in("tipo", ["loja_fisica", "online"]).order("nome");
    if (r.error) throw new FalhaDoServico("financeiro_lojas");
    lojas = r.data.map((l) => ({ id: l.id, nome: l.nome }));
  }
  const escopo = escolherEscopo(textoDoParametro(parametros.loja), lojas, turno, daRede);
  const periodo = periodoFinanceiro(textoDoParametro(parametros.periodo));
  const visao = visaoDoParametro(textoDoParametro(parametros.ver));
  const filtroSituacao = situacaoDoParametro(visao, textoDoParametro(parametros.situacao));
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(textoDoParametro(parametros.pagina) ?? "1", 10) || 1));
  const janelas = janelasDoPeriodo(periodo);

  const href = (mudanca: Partial<Record<"periodo" | "loja" | "ver" | "situacao" | "pagina", string | undefined>>, caminho = "/financeiro") => {
    const valores = { periodo: periodo === "hoje" ? undefined : periodo, loja: escopo.chave === turno.id ? undefined : escopo.chave, ver: visao === "vendas" ? undefined : visao, situacao: filtroSituacao ?? undefined, ...mudanca };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(valores)) if (v) p.set(k, v);
    const texto = p.toString();
    return `${caminho}${texto ? `?${texto}` : ""}`;
  };

  // REPORT-005b: os pagamentos por maquininha, lidos à parte (sem a função no banco, nulo: o cartão não aparece).
  const [atual, anterior, maquininhas] = await Promise.all([
    consultarPainel(supabase, janelas.atual, escopo.unidade, janelas.porHora),
    consultarPainel(supabase, janelas.anterior, escopo.unidade, false),
    lerPagamentosPorMaquininha(supabase, janelas.atual, escopo.unidade),
  ]);

  const cabecalho = (
    <>
      <TituloPagina
        sobretitulo={escopo.nome}
        titulo="Financeiro"
        subtitulo="Vendas, pagamentos registrados e movimentação dos caixas, somados no banco. Pagamento registrado não é dinheiro liquidado: só o conciliado com o extrato foi visto cair na conta."
        acao={<BaixarPlanilha endereco={href({ pagina: undefined }, "/financeiro/exportar")} rotulo={`Exportar ${VISOES[visao].rotulo.toLowerCase()}`} />}
      />
      <div className="mb-4 flex flex-col gap-3">
        <FiltroSegmentado rotulo="Período" opcoes={ORDEM_DOS_PERIODOS.map((p: PeriodoFinanceiro) => ({ href: href({ periodo: p === "hoje" ? undefined : p, pagina: undefined }), rotulo: PERIODOS_FINANCEIROS[p].rotulo, ativo: p === periodo }))} />
        {daRede && (
          <FiltroSegmentado
            rotulo="Loja"
            opcoes={opcoesDeLoja(lojas, turno).map((l) => ({ href: href({ loja: l.id === turno.id ? undefined : l.id, pagina: undefined }), rotulo: l.nome, ativo: l.id === escopo.chave }))}
          />
        )}
      </div>
    </>
  );

  if (atual === "indisponivel" || anterior === "indisponivel") {
    return (
      <MoldeReal sessao={sessao} permissoes={permissoes} largura="max-w-6xl">
        {cabecalho}
        <Aviso tom="aviso" titulo="Financeiro indisponível neste ambiente">
          O banco deste ambiente ainda não tem a leitura agregada do financeiro (migration <code>financeiro_painel</code>). Nenhum número é mostrado até ela ser instalada.
        </Aviso>
      </MoldeReal>
    );
  }

  const r = resumoDoPainel(atual);
  const ra = resumoDoPainel(anterior);
  const series = seriesDoPainel(atual, janelas.atual, janelas.porHora);
  const listaDeRegistros = await paginaDeRegistros(supabase, visao, janelas.atual, escopo.unidade, filtroSituacao, pagina);
  const nomes = await nomesDosRegistros(supabase, listaDeRegistros.registros);

  return (
    <MoldeReal sessao={sessao} permissoes={permissoes} largura="max-w-6xl">
      {cabecalho}

      <ConteudoFinanceiro
        resumo={r}
        anterior={ra}
        series={series}
        porHora={janelas.porHora}
        periodo={periodo}
        conferenteDeCaixa={permissoes.has("caixa.conferir")}
        podeConciliar={permissoes.has("pagamento.conciliar")}
        visao={visao}
        filtroSituacao={filtroSituacao}
        pagina={pagina}
        lista={listaDeRegistros}
        nomes={nomes}
        daRede={escopo.unidade === null}
        href={href}
        maquininhas={maquininhas}
        nomeDaLoja={(id) => [...lojas, turno].find((l) => l.id === id)?.nome ?? "Loja"}
      />
    </MoldeReal>
  );
}

async function nomesDosRegistros(supabase: Sessao["supabase"], registros: Registros): Promise<Nomes> {
  const { pessoas, lojas } = idsDosRegistros(registros);
  const [rPessoas, rLojas] = await Promise.all([
    pessoas.length ? supabase.from("perfis_usuario").select("id, nome").in("id", pessoas) : Promise.resolve({ data: [], error: null }),
    lojas.length ? supabase.from("unidades").select("id, nome").in("id", lojas) : Promise.resolve({ data: [], error: null }),
  ]);
  if (rPessoas.error || rLojas.error) throw new FalhaDoServico("financeiro_nomes");
  const pessoa = new Map((rPessoas.data ?? []).map((p) => [p.id, p.nome] as const));
  const loja = new Map((rLojas.data ?? []).map((l) => [l.id, l.nome] as const));
  return { pessoa: (id: string) => pessoa.get(id) ?? "Pessoa de fora da sua equipe", loja: (id: string) => loja.get(id) ?? "—" };
}

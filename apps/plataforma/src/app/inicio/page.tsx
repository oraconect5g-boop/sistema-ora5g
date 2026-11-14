import type { Metadata } from "next";
import Link from "next/link";

import { Icone } from "../../componentes/Icone";
import { MoldeReal, permissoesDoMenu } from "../../componentes/MoldeReal";
import { Aviso, Cartao, TituloPagina } from "../../componentes/ui";
import { montarMenu, PAGINAS_REAIS } from "../../lib/acesso/menu";
import { horaDoFimDoTurno } from "../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import type { LojaDoFiltro } from "../../lib/financeiro/escopo";
import { periodoFinanceiro } from "../../lib/financeiro/painel";
import { lerPaineisDoInicio, permissoesDoInicio } from "../../lib/inicio/consulta";
import { ICONES_DAS_PENDENCIAS } from "../../lib/inicio/icones-das-pendencias";
import { visaoDoInicio } from "../../lib/inicio/painel";
import { lerPendencias } from "../../lib/inicio/pendencias";
import { textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { ConteudoInicio } from "./ConteudoInicio";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

type Parametros = { periodo?: ValorDeParametro; loja?: ValorDeParametro };

// Início real: o que espera a pessoa nesta loja (revisão de 10/11/2026), os painéis de vendas do
// período (lote G1) e os atalhos do mesmo menu das outras telas. Cada contagem só é feita para quem
// tem a permissão; o RLS confere de novo. Os painéis seguem a visão de quem pede: a rede para quem
// tem venda.ver_todas, a loja do turno para quem tem venda.ver_unidade e só as próprias vendas para
// quem tem venda.ver_propria. Os números são somados no banco (vendas_painel e financeiro_painel);
// nada aqui vem da demonstração.
export default async function Inicio({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const turno: LojaDoFiltro = { id: unidade, nome: situacao.unidade_nome ?? "Loja do turno" };
  const [permissoes, inicio, perfil] = await Promise.all([
    permissoesDoMenu(supabase, unidade),
    permissoesDoInicio(supabase, unidade),
    supabase.from("perfis_usuario").select("nome").eq("id", usuario.id).maybeSingle(),
  ]);
  if (perfil.error) throw new FalhaDoServico("inicio");
  const gestao = permissoes.has("venda.ver_unidade");
  const visao = visaoDoInicio({ verTodas: permissoes.has("venda.ver_todas"), verUnidade: gestao, verPropria: inicio.propria });
  // O que espera a pessoa (lib/inicio/pendencias.ts: a mesma leitura do sino do topo, G6) e os painéis, em paralelo.
  // Erro nas pendências derruba a página; os painéis não: cada leitura volta com o próprio estado (ok, indisponível ou falha).
  const [pendencias, paineis] = await Promise.all([
    lerPendencias(supabase, { usuario: usuario.id, unidade, permissoes }),
    lerPaineisDoInicio(supabase, { visao, periodo: periodoFinanceiro(textoDoParametro(parametros.periodo)), loja: textoDoParametro(parametros.loja), turno, usuario: usuario.id, ranking: inicio.ranking, custo: inicio.custo,
      metas: { gestao: permissoes.has("metas.gerir") || permissoes.has("metas.ver_unidade"), propria: permissoes.has("metas.ver_propria") } })
  ]);
  const fim = horaDoFimDoTurno(situacao.turno_termina_em);
  const atalhos = montarMenu(permissoes).visiveis.filter((p) => p !== "inicio");

  return (
    <MoldeReal sessao={sessao} permissoes={permissoes} largura="max-w-6xl">
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo={`Olá, ${perfil.data?.nome ?? "bem-vindo"}`} subtitulo={fim ? `Turno até ${fim}. Para trabalhar em outra loja, toque no nome da loja no topo.` : undefined} />
      {pendencias.length > 0 && (
        <section aria-label="O que espera você" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {pendencias.map((p) => {
            const IconeDaPendencia = ICONES_DAS_PENDENCIAS[p.icone];
            return (
              <Link key={p.rotulo} href={p.href} className={`rounded-cartao border bg-superficie p-4 shadow-cartao hover:border-borda-forte ${p.quantidade > 0 ? "border-aviso/40" : "border-borda"}`}>
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-medium text-suave">{p.rotulo}</span>
                  <IconeDaPendencia aria-hidden className="size-4 shrink-0 text-acao" />
                </span>
                <span className="numeros mt-1 block text-[26px] font-bold leading-tight">{p.quantidade}</span>
                <span className="block text-xs text-suave">{p.detalhe}</span>
              </Link>
            );
          })}
        </section>
      )}
      <ConteudoInicio paineis={paineis} usuario={usuario.id} turno={turno} conferenteDeCaixa={permissoes.has("caixa.conferir")} />
      <Cartao titulo="Atalhos">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {atalhos.map((p) => (
            <Link key={p} href={PAGINAS_REAIS[p].caminho} className="flex min-h-12 items-center gap-3 rounded-xl border border-borda px-3 text-sm font-medium hover:bg-slate-50">
              <Icone nome={PAGINAS_REAIS[p].icone} className="size-5 text-acao" /> {PAGINAS_REAIS[p].titulo}
            </Link>
          ))}
        </div>
      </Cartao>
      <Aviso tom="info">Telas reais, com os dados gravados no sistema. A demonstração continua separada, em /demo, só com dados fictícios.</Aviso>
    </MoldeReal>
  );
}

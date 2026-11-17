import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BotaoImprimir, CarimboDaImpressao } from "../../../componentes/BotaoImprimir";
import { ExportarPlanilha } from "../../../componentes/ExportarPlanilha";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, classeBotao, FiltroSegmentado, TituloPagina } from "../../../componentes/ui";
import { podeVerMetas } from "../../../lib/acesso/menu";
import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { consultarBonus, consultarExtrato, consultarFechamento } from "../../../lib/bonus/consulta";
import { geradoEm, parteDoNome } from "../../../lib/csv";
import type { LojaDoFiltro } from "../../../lib/financeiro/escopo";
import { lojasQueVendem } from "../../../lib/inicio/consulta";
import { endereco } from "../../../lib/inicio/painel";
import { consultarEquipe } from "../../../lib/metas/consulta";
import { faseDoMes, mesDeHoje, mesDoEndereco, nomeDoMes, opcoesDeMes } from "../../../lib/metas/painel";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { FatosDoMes, planilhaDoExtrato, ResumoDoBonus } from "./ConteudoExtrato";

export const metadata: Metadata = { title: "Extrato do bônus" };
export const dynamic = "force-dynamic";

type Parametros = { mes?: ValorDeParametro; loja?: ValorDeParametro; vendedor?: ValorDeParametro };

// O extrato do bônus (lote L9a; decisão do proprietário de 13/11/2026, D-014): o vendedor vê o próprio,
// venda a venda, provisório até o fechamento; a gerência vê o de cada vendedor da loja (e o dono, de
// qualquer loja). O banco decide (public.extrato_do_vendedor): pedido de fora do escopo é recusado.
export default async function ExtratoDoBonus({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const turno: LojaDoFiltro = { id: situacao.unidade_id as string, nome: situacao.unidade_nome ?? "Loja do turno" };
  const { permissoes } = sessao.molde;
  if (!podeVerMetas(permissoes)) {
    return (
      <MoldeReal sessao={sessao}>
        <TituloPagina titulo="Extrato do bônus" />
        <Aviso tom="aviso" titulo="Sem permissão">O extrato é de cada vendedor (o próprio) e da gerência da loja. O banco também recusa, mesmo que alguém digite o endereço.</Aviso>
      </MoldeReal>
    );
  }

  const gestao = permissoes.has("metas.gerir") || permissoes.has("metas.ver_unidade");
  const agora = new Date();
  const hoje = mesDeHoje(agora);
  const mes = mesDoEndereco(textoDoParametro(parametros.mes), agora) ?? hoje;
  const fase = faseDoMes(mes, agora);
  const cadastro = gestao && permissoes.has("venda.ver_todas") ? await lojasQueVendem(supabase, "metas") : null;
  const loja = cadastro?.find((l) => l.id === textoDoParametro(parametros.loja)) ?? turno;
  const lojaNoEndereco = loja.id === turno.id ? null : loja.id;
  // O vendedor só vê o próprio extrato: o pedido de outro nem sai daqui (e o banco recusaria).
  const pedido = textoDoParametro(parametros.vendedor);
  const vendedor = gestao && ehUuid(pedido) ? pedido : usuario.id;
  const proprio = vendedor === usuario.id;
  const mesNoEndereco = mes === hoje ? null : mes.slice(0, 7);
  const enderecoDe = (valores: { mes?: string | null; vendedor?: string | null }) => endereco("/metas/extrato", {
    mes: valores.mes === undefined ? mesNoEndereco : valores.mes,
    loja: lojaNoEndereco,
    vendedor: (valores.vendedor === undefined ? (proprio ? null : vendedor) : valores.vendedor) ?? null,
  });
  const aqui = enderecoDe({});

  const [extrato, bonus, equipe, fechamento] = await Promise.all([
    consultarExtrato(supabase, mes, loja.id, vendedor),
    consultarBonus(supabase, mes, loja.id),
    gestao ? consultarEquipe(supabase, mes, loja.id) : Promise.resolve(null),
    // O fechamento (L9b), no mês que terminou: o valor aprovado de quem está no extrato.
    fase === "passado" ? consultarFechamento(supabase, mes, loja.id, gestao ? undefined : usuario.id) : Promise.resolve(null),
  ]);
  const pessoas = equipe?.estado === "ok" ? equipe.dados : [];
  const nome = proprio ? null : (pessoas.find((p) => p.id === vendedor)?.nome ?? "Vendedor");
  const planilha = extrato.estado === "ok" ? planilhaDoExtrato(extrato.dados) : null;

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <TituloPagina
        sobretitulo={loja.nome}
        titulo={nome === null ? "Meu extrato do bônus" : `Extrato de ${nome}`}
        subtitulo={`${nomeDoMes(mes)}: cada venda, cancelamento, devolução e operação do Ora Connect que conta para as metas. O bônus é provisório até o dono aprovar o fechamento do mês.`}
        acao={(
          <div className="nao-imprimir flex flex-wrap gap-2">
            <Link href={endereco("/metas", { mes: mesNoEndereco, loja: lojaNoEndereco })} className={classeBotao("secundario", "md")}><ArrowLeft aria-hidden className="size-4" /> Metas</Link>
            {planilha && (
              <ExportarPlanilha
                rotulo="Baixar planilha" aba="Extrato do bônus" secoes={planilha}
                nomeArquivo={`extrato-do-bonus-${mes.slice(0, 7)}-${parteDoNome(nome ?? "meu")}-${parteDoNome(loja.nome)}`}
              />
            )}
            {planilha && <BotaoImprimir />}
          </div>
        )}
      />
      <CarimboDaImpressao texto={`Ora 5G · extrato do bônus · ${nome ?? "próprio"} · ${loja.nome} · ${nomeDoMes(mes)} · impresso em ${geradoEm(agora)}`} />
      <div className="nao-imprimir flex flex-col gap-3">
        <FiltroSegmentado rotulo="Mês" opcoes={opcoesDeMes(mes, agora).map((o) => ({ href: enderecoDe({ mes: o.mes === hoje ? null : o.mes.slice(0, 7) }), rotulo: o.rotulo, ativo: o.mes === mes }))} />
        {gestao && pessoas.length > 0 && (
          <FiltroSegmentado
            rotulo="Vendedor"
            opcoes={pessoas.map((p) => ({ href: enderecoDe({ vendedor: p.id === usuario.id ? null : p.id }), rotulo: p.nome, ativo: p.id === vendedor }))}
          />
        )}
      </div>
      <ResumoDoBonus bonus={bonus} vendedor={vendedor} mes={mes} fase={fase} aqui={aqui} fechamento={fechamento} />
      <FatosDoMes extrato={extrato} mes={mes} aqui={aqui} />
    </MoldeReal>
  );
}

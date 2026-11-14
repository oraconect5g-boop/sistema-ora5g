import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal, permissoesDoMenu } from "../../../componentes/MoldeReal";
import { EstadoDoPainel } from "../../../componentes/paineis-de-vendas";
import { Aviso, Cartao, classeBotao, FiltroSegmentado, TituloPagina } from "../../../componentes/ui";
import { obterSessao } from "../../../lib/acesso/sessao";
import { consultarVersoes } from "../../../lib/bonus/consulta";
import { ERROS_DO_BONUS, OK_DO_BONUS } from "../../../lib/bonus/regras";
import { mesDeHoje, mesDoEndereco, somarMeses } from "../../../lib/metas/painel";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { ComoFunciona, Formulario, Historico } from "./ConteudoRegras";

export const metadata: Metadata = { title: "Regras do bônus" };
export const dynamic = "force-dynamic";

type Parametros = { desde?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro };

const NOMES_DOS_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Regras do bônus por meta (lote L9a; decisão do proprietário de 13/11/2026, D-014): só o dono cria e
// muda (bonus.definir), com histórico. Cada faixa: a partir de X% da meta, R$ Y; vale a maior alcançada.
// A regra vale do mês escolhido em diante, até a próxima mudança; o mês que já terminou não muda. O
// banco confere tudo de novo (public.bonus_definir).
export default async function RegrasDoBonus({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const permissoes = await permissoesDoMenu(supabase, situacao.unidade_id as string);
  if (!permissoes.has("bonus.definir")) {
    return (
      <MoldeReal sessao={sessao} permissoes={permissoes}>
        <TituloPagina titulo="Regras do bônus" />
        <Aviso tom="aviso" titulo="Sem permissão">
          Só o dono define as regras do bônus. O vendedor e a gerência veem as faixas que valem na tela de Metas. O banco também recusa, mesmo que alguém digite o endereço.
        </Aviso>
      </MoldeReal>
    );
  }

  const agora = new Date();
  const hoje = mesDeHoje(agora);
  const pedido = mesDoEndereco(textoDoParametro(parametros.desde), agora);
  const desde = pedido !== null && pedido >= hoje ? pedido : hoje;
  const opcoes = [...new Set([hoje, somarMeses(hoje, 1), somarMeses(hoje, 2), somarMeses(hoje, 3), desde])].sort();
  const versoes = await consultarVersoes(supabase);
  const ok = chaveDoCatalogo(OK_DO_BONUS, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DO_BONUS, parametros.erro);

  return (
    <MoldeReal sessao={sessao} permissoes={permissoes} largura="max-w-5xl">
      <TituloPagina
        sobretitulo="Metas e desempenho"
        titulo="Regras do bônus"
        subtitulo="O bônus que cada vendedor ganha ao bater a meta do mês. As faixas valem para toda a rede; cada mudança fica no histórico."
        acao={<Link href="/metas" className={classeBotao("secundario", "md")}><ArrowLeft aria-hidden className="size-4" /> Voltar às metas</Link>}
      />
      {ok && <Aviso tom="sucesso" className="mb-4">{OK_DO_BONUS[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mb-4">{ERROS_DO_BONUS[erro]}</Aviso>}
      <div className="mb-4">
        <FiltroSegmentado
          rotulo="Vale a partir de"
          opcoes={opcoes.map((m) => ({
            href: m === hoje ? "/metas/bonus" : `/metas/bonus?desde=${m.slice(0, 7)}`,
            rotulo: m === hoje ? "Este mês" : `${NOMES_DOS_MESES[Number(m.slice(5, 7)) - 1]}${m.slice(0, 4) === hoje.slice(0, 4) ? "" : ` de ${m.slice(0, 4)}`}`,
            ativo: m === desde,
          }))}
        />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {versoes.estado === "ok" ? (
          <Formulario versoes={versoes.dados} desde={desde} />
        ) : (
          <Cartao titulo="Faixas do bônus">
            {versoes.estado === "recusado"
              ? <EstadoDoPainel estado="sem_permissao" motivo="O banco recusou a leitura das regras para o seu perfil." />
              : <EstadoDoPainel estado={versoes.estado} fonte="bonus" tentarDeNovo="/metas/bonus" />}
          </Cartao>
        )}
        <ComoFunciona />
      </div>
      {versoes.estado === "ok" && <Historico versoes={versoes.dados} />}
    </MoldeReal>
  );
}

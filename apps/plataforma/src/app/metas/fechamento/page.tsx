import { ArrowLeft, ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { BotaoImprimir, CarimboDaImpressao } from "../../../componentes/BotaoImprimir";
import { ExportarPlanilha } from "../../../componentes/ExportarPlanilha";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { EstadoDoPainel } from "../../../componentes/paineis-de-vendas";
import { Aviso, Cartao, classeBotao, FiltroSegmentado, TituloPagina } from "../../../componentes/ui";
import { podeVerFechamento } from "../../../lib/acesso/menu";
import { obterSessao } from "../../../lib/acesso/sessao";
import { consultarBonus, consultarFechamento, consultarFechamentosDoMes, type LeituraDoBonus } from "../../../lib/bonus/consulta";
import { ERROS_DO_FECHAMENTO, mesesParaFechar, OK_DO_FECHAMENTO, planilhaDoFechamento } from "../../../lib/bonus/fechamento";
import { geradoEm, parteDoNome } from "../../../lib/csv";
import type { LojaDoFiltro } from "../../../lib/financeiro/escopo";
import { lojasQueVendem } from "../../../lib/inicio/consulta";
import { endereco } from "../../../lib/inicio/painel";
import { consultarEquipe } from "../../../lib/metas/consulta";
import { mesDeHoje, mesDoEndereco, nomeDoMes, somarMeses } from "../../../lib/metas/painel";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { ComoOFechamentoFunciona, ConferenciaDaGerencia, FechamentoAprovado, FechamentoEnviado, LojasDoMes } from "./ConteudoFechamento";

export const metadata: Metadata = { title: "Fechamento do bônus" };
export const dynamic = "force-dynamic";

type Parametros = { mes?: ValorDeParametro; loja?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro };

/** "Outubro", ou "Dezembro de 2025" quando o ano não é o de agora. */
function rotuloDoMes(mes: string, hoje: string) {
  const nome = mes.slice(0, 4) === hoje.slice(0, 4) ? nomeDoMes(mes).replace(/ de \d{4}$/, "") : nomeDoMes(mes);
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

// Fechamento do bônus por meta (lote L9b; decisão do proprietário de 13/11/2026, D-014): no mês que
// terminou, a gerência confere e contesta com motivo (bonus.conferir: o gerente, na loja dele, e o dono);
// o dono decide cada contestação e aprova o pagamento (bonus.aprovar). O banco decide tudo de novo
// (public.bonus_fechamento_enviar e public.bonus_fechamento_aprovar); a tela mostra o que leu e conferiu.
export default async function FechamentoDoBonus({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const turno: LojaDoFiltro = { id: situacao.unidade_id as string, nome: situacao.unidade_nome ?? "Loja do turno" };
  const { permissoes } = sessao.molde;
  if (!podeVerFechamento(permissoes)) {
    return (
      <MoldeReal sessao={sessao}>
        <TituloPagina titulo="Fechamento do bônus" />
        <Aviso tom="aviso" titulo="Sem permissão">
          O fechamento é da gerência e do dono. O seu bônus aprovado aparece em Metas e no seu extrato. O banco também recusa, mesmo que alguém digite o endereço.
        </Aviso>
      </MoldeReal>
    );
  }

  const agora = new Date();
  const hoje = mesDeHoje(agora);
  const ultimo = somarMeses(hoje, -1);
  const meses = mesesParaFechar(hoje);
  const pedido = mesDoEndereco(textoDoParametro(parametros.mes), agora);
  const mes = pedido !== null && meses.includes(pedido) ? pedido : ultimo;
  const souDono = permissoes.has("bonus.aprovar");
  // Quem vê a rede (o dono) escolhe a loja; os demais ficam na do turno. O banco confere de novo.
  const cadastro = permissoes.has("venda.ver_todas") ? await lojasQueVendem(supabase, "metas") : null;
  const loja = cadastro?.find((l) => l.id === textoDoParametro(parametros.loja)) ?? turno;
  const lojaNoEndereco = loja.id === turno.id ? null : loja.id;
  const mesNoEndereco = mes === ultimo ? null : mes.slice(0, 7);
  const enderecoDe = (valores: { mes?: string | null; loja?: string | null }) => endereco("/metas/fechamento", {
    mes: valores.mes === undefined ? mesNoEndereco : valores.mes,
    loja: valores.loja === undefined ? lojaNoEndereco : valores.loja,
  });
  const aqui = enderecoDe({});
  const enderecoDoExtrato = (vendedor: string) => endereco("/metas/extrato", { mes: mes.slice(0, 7), loja: lojaNoEndereco, vendedor });

  const [fechamento, bonus, equipe, daRede] = await Promise.all([
    consultarFechamento(supabase, mes, loja.id),
    consultarBonus(supabase, mes, loja.id),
    consultarEquipe(supabase, mes, loja.id),
    cadastro && souDono ? consultarFechamentosDoMes(supabase, mes) : Promise.resolve(null),
  ]);
  const pessoas = new Map((equipe.estado === "ok" ? equipe.dados : []).map((p) => [p.id, p.nome]));
  const ok = chaveDoCatalogo(OK_DO_FECHAMENTO, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DO_FECHAMENTO, parametros.erro);
  const estado = (leitura: Exclude<LeituraDoBonus<unknown>, { estado: "ok" }>, fonte: "bonus" | "fechamento") => (leitura.estado === "recusado"
    ? <EstadoDoPainel estado="sem_permissao" motivo="O banco recusou a leitura do bônus desta loja para o seu perfil." />
    : <EstadoDoPainel estado={leitura.estado} fonte={fonte} tentarDeNovo={aqui} />);

  let conteudo: ReactNode;
  let planilha: ReturnType<typeof planilhaDoFechamento> = null;
  if (fechamento.estado !== "ok") {
    conteudo = <Cartao titulo={`Fechamento de ${nomeDoMes(mes)}`} icone={ClipboardCheck}>{estado(fechamento, "fechamento")}</Cartao>;
  } else {
    const f = fechamento.dados;
    const cabeca = f.fechamento;
    const quemEnviou = cabeca === null ? "" : cabeca.enviadoPor === usuario.id ? "você" : (pessoas.get(cabeca.enviadoPor) ?? "o dono");
    if (cabeca === null) {
      conteudo = bonus.estado === "ok"
        ? <ConferenciaDaGerencia bonus={bonus.dados} pessoas={pessoas} loja={loja} podeConferir={permissoes.has("bonus.conferir")} enderecoDoExtrato={enderecoDoExtrato} />
        : <Cartao titulo={`Conferência de ${nomeDoMes(mes)}`} icone={ClipboardCheck}>{estado(bonus, "bonus")}</Cartao>;
    } else if (cabeca.situacao === "enviado") {
      conteudo = <FechamentoEnviado fechamento={cabeca} linhas={f.linhas} pessoas={pessoas} loja={loja} quemEnviou={quemEnviou} podeAprovar={souDono} enderecoDoExtrato={enderecoDoExtrato} />;
    } else {
      planilha = planilhaDoFechamento(f, pessoas);
      conteudo = <FechamentoAprovado fechamento={cabeca} linhas={f.linhas} pessoas={pessoas} quemEnviou={quemEnviou} enderecoDoExtrato={enderecoDoExtrato} />;
    }
  }
  const todas = cadastro ? (cadastro.some((l) => l.id === turno.id) ? cadastro : [turno, ...cadastro]) : [];

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <TituloPagina
        sobretitulo={loja.nome}
        titulo="Fechamento do bônus"
        subtitulo={`${nomeDoMes(mes)}: a gerência confere e contesta com motivo; o dono decide e aprova o pagamento. Aprovado, o valor não muda mais.`}
        acao={(
          <div className="nao-imprimir flex flex-wrap gap-2">
            <Link href={endereco("/metas", { mes: mes.slice(0, 7), loja: lojaNoEndereco })} className={classeBotao("secundario", "md")}><ArrowLeft aria-hidden className="size-4" /> Metas</Link>
            {planilha && (
              <ExportarPlanilha rotulo="Baixar planilha" aba="Fechamento do bônus" secoes={planilha}
                nomeArquivo={`fechamento-do-bonus-${mes.slice(0, 7)}-${parteDoNome(loja.nome)}`} />
            )}
            {planilha && <BotaoImprimir />}
          </div>
        )}
      />
      <CarimboDaImpressao texto={`Ora 5G · fechamento do bônus · ${loja.nome} · ${nomeDoMes(mes)} · impresso em ${geradoEm(agora)}`} />
      <div className="nao-imprimir mb-4 flex flex-col gap-3">
        <FiltroSegmentado rotulo="Mês" opcoes={meses.map((m) => ({ href: enderecoDe({ mes: m === ultimo ? null : m.slice(0, 7) }), rotulo: rotuloDoMes(m, hoje), ativo: m === mes }))} />
        {cadastro && cadastro.length > 1 && (
          <FiltroSegmentado
            rotulo="Loja"
            opcoes={[turno, ...cadastro.filter((l) => l.id !== turno.id)].map((l) => ({ href: enderecoDe({ loja: l.id === turno.id ? null : l.id }), rotulo: l.nome, ativo: l.id === loja.id }))}
          />
        )}
      </div>
      {ok && <Aviso tom="sucesso" className="mb-4">{OK_DO_FECHAMENTO[ok]}</Aviso>}
      {erro && <Aviso tom={erro === "ja_enviado" || erro === "ja_aprovado" ? "aviso" : "perigo"} className="mb-4">{ERROS_DO_FECHAMENTO[erro]}</Aviso>}
      {souDono && daRede?.estado === "ok" && todas.length > 1 && (
        <div className="nao-imprimir">
          <LojasDoMes lojas={todas} fechamentos={daRede.dados} atual={loja.id} mes={mes} enderecoDaLoja={(id) => enderecoDe({ loja: id === turno.id ? null : id })} />
        </div>
      )}
      {conteudo}
      <div className="nao-imprimir"><ComoOFechamentoFunciona /></div>
    </MoldeReal>
  );
}

import { ArrowLeft, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEnquantoEspera } from "../../../../componentes/AtualizarEnquantoEspera";
import { BotaoImprimir, CarimboDaImpressao } from "../../../../componentes/BotaoImprimir";
import { MoldeReal } from "../../../../componentes/MoldeReal";
import { Aviso, Cartao, Selo, TituloPagina } from "../../../../componentes/ui";
import { permite } from "../../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../../lib/acesso/sessao";
import { esperandoResposta, secoesDoRelatorio, SITUACOES_DA_CONSULTA, tituloDaConsulta, type ConsultaDaTela } from "../../../../lib/connect/consultas";

export const metadata: Metadata = { title: "Relatório da consulta" };
export const dynamic = "force-dynamic";

const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", " às");
const ehUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

// O relatório individual (lote CONNECT-g/h; a D-060): o do número (a consulta completa da linha) e o do cliente (pelo CPF/CNPJ),
// numa página que dá para imprimir ou salvar em PDF. Só quem pediu a consulta vê (RLS), e a resposta é apagada em 24 horas.
export default async function RelatorioDaConsulta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await obterSessao({ exigirLoja: true });
  const voltar = <Link href="/connect/linha" className="nao-imprimir inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Consultar linha</Link>;
  if (!permite(sessao, "connect.operar") && !permite(sessao, "connect.gerir")) {
    return <MoldeReal sessao={sessao}>{voltar}<Aviso tom="aviso" className="mt-4">Consultar linha é de quem opera a Ora Connect.</Aviso></MoldeReal>;
  }
  const [lida, planos] = await Promise.all([
    ehUuid(id)
      ? sessao.supabase.from("connect_consultas")
        .select("id, tipo, parametro, parametro_mascarado, situacao, resposta, mensagem, pedida_em, respondida_em, resposta_apagada_em")
        .eq("id", id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sessao.supabase.from("connect_referencias").select("codigo, nome").eq("tipo", "plano").limit(200),
  ]);
  if (lida.error) throw new FalhaDoServico("connect_consultas");
  if (planos.error) throw new FalhaDoServico("connect_referencias");
  const c = lida.data as unknown as ConsultaDaTela | null;
  if (!c) {
    return (
      <MoldeReal sessao={sessao}>
        {voltar}
        <Aviso tom="aviso" className="mt-4">Relatório não encontrado: só quem pediu a consulta vê o relatório.</Aviso>
      </MoldeReal>
    );
  }
  const nomeDoPlano = (codigo: string) => planos.data.find((p) => p.codigo === codigo)?.nome;
  const s = SITUACOES_DA_CONSULTA[c.situacao] ?? { rotulo: c.situacao, tom: "neutro" as const };
  const secoes = c.situacao === "respondida" && c.resposta ? secoesDoRelatorio(c, nomeDoPlano) : [];

  return (
    <MoldeReal sessao={sessao}>
      {voltar}
      <TituloPagina titulo={tituloDaConsulta(c)} subtitulo={`Consultado na Nogle em ${quando(c.pedida_em)}; só você vê, e a resposta é apagada em 24 horas`} />
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <Selo tom={s.tom}>{s.rotulo}</Selo>
        {secoes.length > 0 && <BotaoImprimir />}
      </p>
      <CarimboDaImpressao texto={`Ora Connect · ${tituloDaConsulta(c)} · consultado em ${quando(c.pedida_em)}`} />
      {esperandoResposta(c) && (
        <>
          <AtualizarEnquantoEspera aviso="Consultando a Nogle…" />
          <Aviso tom="info" className="mt-4">Consultando a Nogle: o relatório aparece aqui em alguns segundos.</Aviso>
        </>
      )}
      {c.situacao !== "respondida" && !esperandoResposta(c) && c.mensagem && <Aviso tom="aviso" className="mt-4">{c.mensagem}</Aviso>}
      {c.situacao === "respondida" && !c.resposta && (
        <Aviso tom="info" className="mt-4">A resposta foi apagada depois de 24 horas (ela pode ter o nome do titular). Consulte de novo, se precisar.</Aviso>
      )}
      {secoes.map((secao) => (
        <Cartao key={secao.titulo} className="mt-4" titulo={secao.titulo} icone={FileText}>
          {secao.mensagem ? (
            <p className="text-sm text-suave">{secao.mensagem}</p>
          ) : (
            <ul className="space-y-0.5 text-sm" aria-label={secao.titulo}>
              {secao.linhas.map((l, i) => <li key={i} className="numeros">{l}</li>)}
            </ul>
          )}
        </Cartao>
      ))}
    </MoldeReal>
  );
}

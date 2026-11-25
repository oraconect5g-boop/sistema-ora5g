import { randomUUID } from "node:crypto";

import { ArrowLeft, FileText, History, Search, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEnquantoEspera } from "../../../componentes/AtualizarEnquantoEspera";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ehConsultaComposta, ehTipoDeConsulta, PARAMETRO_DA_CONSULTA } from "@ora5g/dominio/nogle";

import {
  CONSULTAS_DA_LOJA, ehErroDaConsulta, ERROS_DA_CONSULTA, esperandoResposta, linhasDaResposta, NOMES_DAS_CONSULTAS, PEDE_O_QUE, SITUACOES_DA_CONSULTA,
  tituloDaConsulta, type ConsultaDaTela,
} from "../../../lib/connect/consultas";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { consultar } from "./acoes";

export const metadata: Metadata = { title: "Consultar linha" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", " às");

// As consultas da Nogle que só leem (lote CONNECT-g; ORA-CONNECT-007 e ORA-CONNECT-009; a decisão D-056, "só consultas"). Quem
// opera a Ora Connect na loja consulta a linha (pelo número) e o chip (pelo ICCID); o dono, também o saldo da carteira. A
// tela grava o pedido no banco; o worker do servidor consulta a Nogle em poucos segundos e grava a resposta, que só quem
// pediu vê e que é apagada depois de 24 horas.
export default async function ConsultarLinha({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const voltar = <Link href="/connect" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Ora Connect</Link>;
  const opera = permite(sessao, "connect.operar");
  const gere = permite(sessao, "connect.gerir");
  if (!opera && !gere) {
    return <MoldeReal sessao={sessao}>{voltar}<Aviso tom="aviso" className="mt-4">Consultar linha é de quem opera a Ora Connect.</Aviso></MoldeReal>;
  }
  const [lidas, planos] = await Promise.all([
    sessao.supabase.from("connect_consultas")
      .select("id, tipo, parametro, parametro_mascarado, situacao, resposta, mensagem, pedida_em, respondida_em, resposta_apagada_em")
      .order("pedida_em", { ascending: false }).limit(15),
    // O nome de cada plano da lista oficial (o plano pago do chip vem só com o código).
    sessao.supabase.from("connect_referencias").select("codigo, nome").eq("tipo", "plano").limit(200),
  ]);
  if (lidas.error) throw new FalhaDoServico("connect_consultas");
  if (planos.error) throw new FalhaDoServico("connect_referencias");
  const consultas = lidas.data as unknown as ConsultaDaTela[];
  const nomeDoPlano = (codigo: string) => planos.data.find((p) => p.codigo === codigo)?.nome;
  const erro = textoDoParametro(parametros.erro);

  return (
    <MoldeReal sessao={sessao}>
      {voltar}
      <TituloPagina titulo="Consultar linha" subtitulo="Na Nogle, pelo número com DDD, pelo ICCID do chip ou pelo CPF/CNPJ do cliente; a resposta chega em poucos segundos" />
      {erro && <Aviso tom="perigo" className="mt-4">{ehErroDaConsulta(erro) ? ERROS_DA_CONSULTA[erro] : ERROS_DA_CONSULTA.falha}</Aviso>}
      {consultas.some(esperandoResposta) && <AtualizarEnquantoEspera aviso="Consultando a Nogle…" />}

      {opera && (
        <Cartao className="mt-4" titulo="O que consultar" icone={Search}>
          <form action={consultar} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <label className="text-sm font-medium">Número com DDD, ICCID do chip ou CPF/CNPJ do cliente
              <input name="parametro" inputMode="numeric" autoComplete="off" required maxLength={30} className={campo} />
            </label>
            <label className="text-sm font-medium">Consulta
              <select name="tipo" defaultValue="linha_completa" className={campo}>
                {CONSULTAS_DA_LOJA.map((tipo) => (
                  <option key={tipo} value={tipo}>{`${NOMES_DAS_CONSULTAS[tipo]} (${PEDE_O_QUE[PARAMETRO_DA_CONSULTA[tipo] ?? "linha"]})`}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2"><Botao type="submit">Consultar</Botao></div>
          </form>
          <p className="mt-3 text-xs text-suave">
            Só consulta: nada muda na linha nem no chip. A resposta pode ter o nome do titular: só você vê, e ela é apagada em 24 horas.
          </p>
        </Cartao>
      )}

      {gere && (
        <Cartao className="mt-4" titulo="Carteira da Ora na Nogle" icone={Wallet}
          subtitulo="O saldo pré-pago que paga, na Nogle, as ativações e as recargas feitas nas lojas (SALDO)">
          <form action={consultar}>
            <input type="hidden" name="chave" value={randomUUID()} />
            <input type="hidden" name="tipo" value="carteira_saldo" />
            <Botao type="submit" variante="secundario">Consultar o saldo</Botao>
          </form>
        </Cartao>
      )}

      <Cartao className="mt-4" titulo="Minhas consultas" subtitulo="As 15 mais recentes, de quem está usando esta tela" icone={History}>
        {consultas.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma consulta ainda.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm" aria-label="Minhas consultas">
            {consultas.map((c) => {
              const s = SITUACOES_DA_CONSULTA[c.situacao] ?? { rotulo: c.situacao, tom: "neutro" as const };
              const linhas = linhasDaResposta(c, nomeDoPlano);
              const relatorio = ehTipoDeConsulta(c.tipo) && ehConsultaComposta(c.tipo) && c.situacao === "respondida" && c.resposta !== null;
              return (
                <li key={c.id} className="py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{tituloDaConsulta(c)}</span>
                    <Selo tom={s.tom}>{s.rotulo}</Selo>
                    <span className="text-xs text-suave">{quando(c.pedida_em)}</span>
                  </p>
                  {c.mensagem && c.situacao !== "respondida" && <p className="mt-1 text-xs">{c.mensagem}</p>}
                  {linhas.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-sm" aria-label="Resposta">
                      {linhas.map((l, i) => <li key={i} className="numeros">{l}</li>)}
                    </ul>
                  )}
                  {relatorio && (
                    <Link href={`/connect/linha/${c.id}`} className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao">
                      <FileText className="size-4" aria-hidden />Abrir o relatório
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </MoldeReal>
  );
}

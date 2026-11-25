import { randomUUID } from "node:crypto";

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarClock, FileText, Globe, Scale, Search, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEnquantoEspera } from "../../../componentes/AtualizarEnquantoEspera";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Celula, EstadoVazio, FiltroSegmentado, Indicador, Selo, Tabela } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import {
  algumaEsperando, CONSULTAS_DA_CARTEIRA, estadoDa, extratoUnico, lerExtrato, lerPortabilidades, lerProgramadas, lerSaldo, lerTamanhoDaLista, ultimaDe,
  type EstadoDaConsulta,
} from "../../../lib/connect/carteira";
import { NOMES_DOS_RELATORIOS, RESULTADOS_DA_CONCILIACAO, SO_NA_ORA, totaisDaConciliacao } from "../../../lib/connect/conciliacao";
import {
  DIAS_DAS_PORTABILIDADES, DIAS_DAS_PROGRAMADAS, diaDaNogle, ehErroDaConsulta, ERROS_DA_CONSULTA, linhaFormatada, momentoDaNogle, NOMES_DAS_CONSULTAS,
  type ConsultaDaTela,
} from "../../../lib/connect/consultas";
import { somasPor, totalConfirmadas } from "../../../lib/connect/relatorio";
import { janelasDoPeriodo, ORDEM_DOS_PERIODOS, PERIODOS_FINANCEIROS, periodoFinanceiro } from "../../../lib/financeiro/painel";
import { agora, brl, numero } from "../../../lib/formato";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { CabecalhoConnect, LARGURA_DA_CONNECT, permissoesDaConnect } from "../CabecalhoConnect";
import { campo, rotulo } from "../campos";
import { consultar } from "../linha/acoes";

export const metadata: Metadata = { title: "Carteira e relatórios · Ora Connect" };
export const dynamic = "force-dynamic";

const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", " às");
const diasPassados = (dias: number) => (dias === 366 ? "No último ano" : `Nos últimos ${dias} dias`);

/** O que o cartão diz quando a consulta não tem número (nunca um zero inventado). */
function detalheDa(e: EstadoDaConsulta<unknown>, ok: string): string {
  if (e.estado === "ok") return ok;
  if (e.estado === "esperando") return "Consultando a Nogle…";
  if (e.estado === "falhou") return "A Nogle não respondeu: consulte de novo";
  if (e.estado === "apagada") return "A resposta foi apagada (24 horas): consulte de novo";
  return "Ainda não consultado: use Consultar na Nogle";
}

/** A frase com o ponto final (o "Consultando a Nogle…" já termina com as reticências). */
const frase = (t: string) => (/[.…]$/.test(t) ? t : `${t}.`);

/** Os campos escondidos de toda consulta pedida daqui: a chave do toque e a volta para esta aba. */
function Pedido({ tipo }: { tipo?: string }) {
  return (
    <>
      <input type="hidden" name="chave" value={randomUUID()} />
      <input type="hidden" name="voltar" value="carteira" />
      {tipo && <input type="hidden" name="tipo" value={tipo} />}
    </>
  );
}

function AbrirORelatorio({ e, rotulo: texto = "Abrir o relatório" }: { e: EstadoDaConsulta<unknown>; rotulo?: string }) {
  if (e.estado !== "ok") return null;
  return <Link href={`/connect/linha/${e.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><FileText aria-hidden className="size-4" />{texto}</Link>;
}

// Lote CONNECT-o (25/11/2026; o pedido do proprietário: "as telas do ora connect da demo, que estavam muito boas"): a aba
// "Carteira e relatórios" da demonstração, com os dados reais. Para quem gere a Ora Connect na rede: os cartões do saldo, das
// saídas, das entradas e das recargas programadas, o extrato, as recargas programadas, as portabilidades da operadora e as
// listas da rede, cada um com o resultado da última consulta que a pessoa pediu (o servidor consulta a Nogle; a resposta só
// ela vê e é apagada em 24 horas), e a conciliação com os relatórios oficiais. Para todos que veem a aba: as ativações e as
// recargas por vendedor, com o atalho para o relatório completo (imprimir e planilha).
export default async function CarteiraDaConnect({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; periodo?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { opera, gere } = permissoesDaConnect(sessao);
  if (!opera && !gere) {
    return <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}><CabecalhoConnect sessao={sessao} aba="carteira" /><Aviso tom="aviso" className="mt-4">A carteira e os relatórios da Ora Connect são de quem opera ou gere a Ora Connect.</Aviso></MoldeReal>;
  }
  // A carteira e os relatórios da rede são de quem gere a Ora Connect na rede (como em Consultar linha; o banco confere de novo).
  const gereARede = gere && sessao.molde.vinculos.some((v) => v.escopo === "organizacao");
  const erroLido = textoDoParametro(parametros.erro);
  const erro = ehErroDaConsulta(erroLido) ? erroLido : erroLido ? "falha" : null;
  const periodo = periodoFinanceiro(textoDoParametro(parametros.periodo));
  const janela = janelasDoPeriodo(periodo, agora()).atual;
  const { supabase } = sessao;
  const unidade = sessao.situacao.unidade_id as string;

  const [operacoes, consultasLidas, conciliacoes] = await Promise.all([
    // As operações do período na loja do turno (quem só opera vê as suas: o RLS escolhe), como no relatório.
    supabase.from("connect_operacoes").select("id, numero, tipo, situacao, vendedor_id, unidade_id, plano_nome, valor_face_centavos, recebido_na_loja_centavos, linha, criado_em")
      .eq("unidade_id", unidade).gte("criado_em", janela.inicio.toISOString()).order("criado_em", { ascending: false }).limit(2000),
    gereARede
      ? supabase.from("connect_consultas").select("id, tipo, parametro, situacao, resposta, mensagem, pedida_em, respondida_em, resposta_apagada_em")
        .in("tipo", [...CONSULTAS_DA_CARTEIRA]).order("pedida_em", { ascending: false }).limit(60)
      : Promise.resolve({ data: [], error: null }),
    gereARede
      ? supabase.from("connect_conciliacoes").select("id, numero, relatorio, de, ate, recebida_em, totais").order("recebida_em", { ascending: false }).limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (operacoes.error) throw new FalhaDoServico("connect_operacoes");
  if (consultasLidas.error) throw new FalhaDoServico("connect_consultas");
  if (conciliacoes.error) throw new FalhaDoServico("connect_conciliacoes");
  const vendedores = [...new Set(operacoes.data.map((o) => o.vendedor_id))];
  const pessoas = vendedores.length > 0 ? await supabase.from("perfis_usuario").select("id, nome").in("id", vendedores) : { data: [], error: null };
  if (pessoas.error) throw new FalhaDoServico("perfis_usuario");
  const nomeDe = (id: string) => (pessoas.data as { id: string; nome: string }[]).find((p) => p.id === id)?.nome ?? "Pessoa sem nome";
  const porVendedor = somasPor(operacoes.data, "vendedor_id", nomeDe);

  const consultas = consultasLidas.data as unknown as ConsultaDaTela[];
  const saldo = estadoDa(ultimaDe(consultas, "carteira_saldo"), lerSaldo);
  const saidas = estadoDa(ultimaDe(consultas, "carteira_extrato_saidas"), lerExtrato(false));
  const entradas = estadoDa(ultimaDe(consultas, "carteira_extrato_entradas"), lerExtrato(true));
  const programadas = estadoDa(ultimaDe(consultas, "carteira_programadas"), lerProgramadas);
  const portabilidades = estadoDa(ultimaDe(consultas, "relatorio_portabilidades"), lerPortabilidades);
  const linhas = estadoDa(ultimaDe(consultas, "lista_de_linhas"), lerTamanhoDaLista("linhas"));
  const clientes = estadoDa(ultimaDe(consultas, "lista_de_clientes"), lerTamanhoDaLista("clientes"));
  const movimentos = extratoUnico(saidas, entradas);
  const conciliacao = (conciliacoes.data as { id: string; numero: number; relatorio: string; de: string; ate: string; recebida_em: string; totais: unknown }[])[0];
  const t = conciliacao ? totaisDaConciliacao(conciliacao.totais) : null;
  const enderecoDoPeriodo = (p: string) => (p === "hoje" ? "/connect/carteira" : `/connect/carteira?periodo=${p}`);

  return (
    <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}>
      <CabecalhoConnect sessao={sessao} aba="carteira" />
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_CONSULTA[erro]}</Aviso>}
      {algumaEsperando(saldo, saidas, entradas, programadas, portabilidades, linhas, clientes) && <AtualizarEnquantoEspera aviso="Consultando a Nogle…" />}

      {gereARede ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Indicador rotulo="Saldo na Nogle" icone={Wallet} valor={saldo.estado === "ok" ? brl(saldo.dados.centavos) : "—"}
              detalhe={detalheDa(saldo, saldo.estado === "ok" ? `Pré-pago para ativar e recarregar · consultado em ${quando(saldo.pedidaEm)}` : "")} />
            <Indicador rotulo="Saídas recentes" icone={ArrowUpRight} valor={saidas.estado === "ok" && saidas.dados.somaCentavos !== null ? brl(saidas.dados.somaCentavos) : "—"}
              detalhe={detalheDa(saidas, saidas.estado === "ok" ? `${numero(saidas.dados.total)} movimentos · ${(diasPassados(saidas.dias ?? 0)).toLowerCase()}` : "")} />
            <Indicador rotulo="Entradas recentes" icone={ArrowDownLeft} tom={entradas.estado === "ok" ? "bom" : "neutro"}
              valor={entradas.estado === "ok" && entradas.dados.somaCentavos !== null ? brl(entradas.dados.somaCentavos) : "—"}
              detalhe={detalheDa(entradas, entradas.estado === "ok" ? `${numero(entradas.dados.total)} créditos · ${(diasPassados(entradas.dias ?? 0)).toLowerCase()}` : "")} />
            <Indicador rotulo="Recargas programadas" icone={CalendarClock} valor={programadas.estado === "ok" ? numero(programadas.dados.total) : "—"}
              detalhe={detalheDa(programadas, programadas.estado === "ok"
                ? `nos próximos ${programadas.dias ?? 0} dias${programadas.dados.somaCentavos !== null ? ` · ${brl(programadas.dados.somaCentavos)}` : ""}` : "")} />
          </div>
          <p className="mt-2 text-xs text-suave">Os números são das suas consultas à Nogle: só você vê, e a resposta é apagada em 24 horas. Para atualizar, consulte de novo.</p>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Cartao className="xl:col-span-2 xl:self-start" titulo="Extrato da carteira" icone={FileText} corpo="p-0"
              subtitulo="O valor cobrado da Ora pela Nogle, não o que o cliente pagou; as saídas e as entradas da última consulta de cada">
              {movimentos.length === 0 ? (
                <div className="p-5"><EstadoVazio titulo="Nenhum movimento para mostrar" icone={FileText}>Consulte o extrato de saídas ou de entradas em Consultar na Nogle.</EstadoVazio></div>
              ) : (
                <ul className="divide-y divide-borda" aria-label="Extrato da carteira">
                  {movimentos.slice(0, 40).map((m, i) => (
                    <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <Selo tom={m.entrada ? "sucesso" : "neutro"}>{m.entrada ? "Entrada" : "Saída"}</Selo>
                          <span className="truncate">{[m.tipo, m.plano, m.linha ? linhaFormatada(m.linha) : null].filter(Boolean).join(" · ") || "Movimento"}</span>
                        </span>
                        <span className="numeros block text-xs text-suave">{momentoDaNogle(m.quando) ?? "—"}</span>
                      </span>
                      <span className={`numeros font-semibold ${m.entrada ? "text-sucesso" : ""}`}>{m.valorCentavos === null ? "—" : `${m.entrada ? "+" : "−"} ${brl(m.valorCentavos)}`}</span>
                    </li>
                  ))}
                </ul>
              )}
              {(saidas.estado === "ok" || entradas.estado === "ok") && (
                <p className="flex flex-wrap gap-x-4 border-t border-borda px-4 sm:px-5">
                  <AbrirORelatorio e={saidas} rotulo="As saídas, inteiras" /><AbrirORelatorio e={entradas} rotulo="As entradas, inteiras" />
                </p>
              )}
            </Cartao>

            <Cartao className="xl:self-start" titulo="Consultar na Nogle" icone={Search} subtitulo="O servidor consulta em poucos segundos e a tela se atualiza sozinha">
              <div className="space-y-4">
                <form action={consultar}>
                  <Pedido tipo="carteira_saldo" />
                  <Botao type="submit" variante="secundario" className="w-full">Consultar o saldo</Botao>
                </form>
                <form action={consultar} className="grid gap-2">
                  <Pedido />
                  <label className={rotulo}>Extrato da carteira
                    <select name="tipo" defaultValue="carteira_extrato_saidas" className={campo}>
                      <option value="carteira_extrato_saidas">Saídas (ativações, recargas e compras)</option>
                      <option value="carteira_extrato_entradas">Entradas (o crédito posto)</option>
                    </select>
                  </label>
                  <label className={rotulo}>Período
                    <select name="parametro" defaultValue="30" className={campo}>{DIAS_DAS_PORTABILIDADES.map((dias) => <option key={dias} value={dias}>{diasPassados(dias)}</option>)}</select>
                  </label>
                  <Botao type="submit" variante="secundario">Ver o extrato</Botao>
                </form>
                <form action={consultar} className="grid gap-2">
                  <Pedido tipo="carteira_programadas" />
                  <label className={rotulo}>Recargas programadas pela carteira
                    <select name="parametro" defaultValue="30" className={campo}>{DIAS_DAS_PROGRAMADAS.map((dias) => <option key={dias} value={dias}>{`Nos próximos ${dias} dias`}</option>)}</select>
                  </label>
                  <Botao type="submit" variante="secundario">Ver as programadas</Botao>
                </form>
              </div>
            </Cartao>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Cartao className="xl:self-start" titulo="Recargas programadas" icone={CalendarClock} subtitulo="As próximas renovações automáticas, pagas pela carteira">
              {programadas.estado !== "ok" ? <p className="text-sm text-suave">{frase(detalheDa(programadas, ""))}</p> : programadas.dados.recargas.length === 0 ? (
                <p className="text-sm text-suave">Nenhuma recarga programada nos próximos {programadas.dias ?? 0} dias.</p>
              ) : (
                <ul className="divide-y divide-borda text-sm" aria-label="Recargas programadas">
                  {programadas.dados.recargas.slice(0, 12).map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span><span className="numeros">{r.linha ? linhaFormatada(r.linha) : "—"}</span>{r.plano ? ` · ${r.plano}` : ""}
                        <span className="block text-xs text-suave">{r.renovacao ? `renova em ${diaDaNogle(r.renovacao)}` : "sem data de renovação"}</span></span>
                      <span className="numeros font-semibold">{r.valorCentavos === null ? "—" : brl(r.valorCentavos)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <AbrirORelatorio e={programadas} />
            </Cartao>

            <Cartao className="xl:self-start" titulo="Portabilidades" icone={ArrowLeftRight} subtitulo="O relatório da operadora: os números trazidos para a Ora">
              <form action={consultar} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Pedido tipo="relatorio_portabilidades" />
                <label className={rotulo}>Período
                  <select name="parametro" defaultValue="30" className={campo}>{DIAS_DAS_PORTABILIDADES.map((dias) => <option key={dias} value={dias}>{diasPassados(dias)}</option>)}</select>
                </label>
                <Botao type="submit" variante="secundario">Ver as portabilidades</Botao>
              </form>
              {portabilidades.estado !== "ok" ? <p className="mt-3 text-sm text-suave">{frase(detalheDa(portabilidades, ""))}</p> : (
                <>
                  <p className="mt-3 text-sm">{`${numero(portabilidades.dados.total)} ${portabilidades.dados.total === 1 ? "portabilidade" : "portabilidades"} ${(diasPassados(portabilidades.dias ?? 0)).toLowerCase()}`}
                    {portabilidades.dados.porStatus.length > 0 && <span className="text-suave">{`: ${portabilidades.dados.porStatus.map(([s, n]) => `${numero(n)} ${s}`).join(", ")}`}</span>}</p>
                  <ul className="mt-2 divide-y divide-borda text-sm" aria-label="Portabilidades">
                    {portabilidades.dados.itens.slice(0, 10).map((p, i) => (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="numeros">{`${p.doadora ? linhaFormatada(p.doadora) : "—"}${p.operadora ? ` (${p.operadora})` : ""} → ${p.linha ? linhaFormatada(p.linha) : "—"}`}
                          <span className="block text-xs text-suave">{momentoDaNogle(p.quando) ?? "—"}</span></span>
                        {p.status && <Selo tom={/sucesso/i.test(p.status) ? "sucesso" : /negad/i.test(p.status) ? "perigo" : "aviso"} ponto>{p.status}</Selo>}
                      </li>
                    ))}
                  </ul>
                  <AbrirORelatorio e={portabilidades} />
                </>
              )}
            </Cartao>
          </div>

          <Cartao className="mt-4" titulo="Linhas e clientes da Ora na Nogle" icone={Globe} subtitulo="As listas da rede, página por página (o documento aparece mascarado)">
            <div className="grid gap-4 sm:grid-cols-2">
              {([["lista_de_linhas", linhas, "Ver as linhas", "linhas"], ["lista_de_clientes", clientes, "Ver os clientes", "clientes"]] as const).map(([tipo, e, botao, nome]) => (
                <div key={tipo}>
                  <form action={consultar} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Pedido tipo={tipo} />
                    <label className={rotulo}>{`${NOMES_DAS_CONSULTAS[tipo]}: a página`}<input name="parametro" type="number" min={1} max={9999} defaultValue={1} required className={campo} /></label>
                    <Botao type="submit" variante="secundario">{botao}</Botao>
                  </form>
                  <p className="mt-2 text-sm text-suave">{e.estado === "ok" ? `A última página consultada tem ${numero(e.dados.quantos)} ${nome}.` : frase(detalheDa(e, ""))}</p>
                  <AbrirORelatorio e={e} />
                </div>
              ))}
            </div>
          </Cartao>
        </>
      ) : (
        <Aviso tom="info" className="mt-4">A carteira da Ora na Nogle (o saldo, o extrato e as recargas programadas) e os relatórios da rede são de quem gere a Ora Connect na rede.</Aviso>
      )}

      <Cartao className="mt-4" titulo={gere ? "Ativações e recargas por vendedor" : "Minhas ativações e recargas"} icone={Users} corpo="px-4 pb-4 sm:px-5"
        subtitulo={`${sessao.situacao.unidade_nome} · confirmadas entre as operações registradas no período (como no relatório)`}>
        <div className="mb-3"><FiltroSegmentado rotulo="Período do relatório" opcoes={ORDEM_DOS_PERIODOS.map((p) => ({ href: enderecoDoPeriodo(p), rotulo: PERIODOS_FINANCEIROS[p].rotulo, ativo: p === periodo }))} /></div>
        {porVendedor.length === 0 ? <p className="text-sm text-suave">Nenhuma operação no período.</p> : (
          <Tabela colunas={["Vendedor", "Ativações", "Recargas", "Portabilidades", "Pendentes", "Recebido na loja"]} legenda="Ativações e recargas por vendedor" alinharDireita={[1, 2, 3, 4, 5]} minimo="min-w-[38rem]">
            {porVendedor.slice(0, 20).map((v) => (
              <tr key={v.id} className="border-b border-borda last:border-b-0">
                <Celula className="font-medium">{v.nome}</Celula>
                <Celula className="numeros text-right">{numero(v.confirmadas.ativacao)}</Celula>
                <Celula className="numeros text-right">{numero(v.confirmadas.recarga)}</Celula>
                <Celula className="numeros text-right">{numero(v.confirmadas.portabilidade)}</Celula>
                <Celula className="numeros text-right">{numero(v.emAndamento + v.semResultado)}</Celula>
                <Celula className="numeros text-right">{brl(v.recebido)}</Celula>
              </tr>
            ))}
          </Tabela>
        )}
        <p className="mt-3 text-sm">
          <Link href={periodo === "hoje" ? "/connect/relatorio" : `/connect/relatorio?periodo=${periodo}`} className="font-semibold text-acao">
            {`${gere ? "Relatório completo (por loja, imprimir e planilha)" : "Meu relatório completo (imprimir e planilha)"}${porVendedor.length > 0 ? ` · ${numero(porVendedor.reduce((s, v) => s + totalConfirmadas(v), 0))} confirmadas` : ""}`}
          </Link>
        </p>
      </Cartao>

      {gereARede && (
        <Cartao className="mt-4" titulo="Conciliação com os relatórios da Nogle" icone={Scale}
          subtitulo={conciliacao ? `A mais recente: nº ${conciliacao.numero} · ${NOMES_DOS_RELATORIOS[conciliacao.relatorio] ?? conciliacao.relatorio} · de ${diaDaNogle(conciliacao.de) ?? conciliacao.de} a ${diaDaNogle(conciliacao.ate) ?? conciliacao.ate}` : "As ativações e as recargas da Ora conferidas com os relatórios oficiais da Nogle"}>
          {!conciliacao || !t ? <p className="text-sm text-suave">Nenhuma conciliação ainda.</p> : (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {([[RESULTADOS_DA_CONCILIACAO.conferida.rotulo, t.conferidas], [RESULTADOS_DA_CONCILIACAO.valor_diferente.rotulo, t.valor_diferente],
                [RESULTADOS_DA_CONCILIACAO.so_na_nogle.rotulo, t.so_na_nogle], [SO_NA_ORA.rotulo, t.so_aqui]] as const).map(([nome, valor]) => (
                <div key={nome} className="rounded-xl bg-fundo/60 p-3"><dt className="text-xs text-suave">{nome}</dt><dd className="numeros text-xl font-bold">{numero(valor)}</dd></div>
              ))}
            </dl>
          )}
          <p className="mt-3 text-sm"><Link href="/connect/conciliacao" className="font-semibold text-acao">Ver a conciliação</Link></p>
        </Cartao>
      )}
    </MoldeReal>
  );
}

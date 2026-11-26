import { ArrowLeftRight, QrCode as IconeQr, ShieldCheck, Signal, Smartphone, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NOMES_DAS_OPERACOES, SITUACOES_OPERACAO, type SituacaoOperacao, type TipoOperacao } from "@ora5g/dominio/nogle";

import { ExportarCsv } from "../../componentes/ExportarCsv";
import { BarrasHorizontais } from "../../componentes/graficos";
import { MoldeReal } from "../../componentes/MoldeReal";
import { plural } from "../../componentes/paineis-de-vendas";
import { IndicadoresDoConnect, OperacoesPorTipo } from "../../componentes/paineis-do-connect";
import { Aviso, Botao, Cartao, EstadoVazio, FiltroSegmentado, Selo } from "../../componentes/ui";
import { permite } from "../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { consultarProducao } from "../../lib/connect/consulta-producao";
import { linhaFormatada } from "../../lib/connect/consultas";
import { ERROS_DO_CONNECT, materialDoEsimNaTela, pagamentoNaNogle, podeVerMaterialDoEsim } from "../../lib/connect/regras";
import { somasPor, totalConfirmadas } from "../../lib/connect/relatorio";
import { centavosDoBanco } from "../../lib/dinheiro";
import { janelasDoPeriodo, ORDEM_DOS_PERIODOS, PERIODOS_FINANCEIROS, periodoFinanceiro, type PeriodoFinanceiro } from "../../lib/financeiro/painel";
import { agora, brl, numero } from "../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { cancelarOperacao, resolverOperacao } from "./acoes";
import { CabecalhoConnect, LARGURA_DA_CONNECT, permissoesDaConnect } from "./CabecalhoConnect";
import { campo } from "./campos";
import { ABERTAS, FILTROS_DA_LISTA, filtroDaLista, horaOuDia, naLista, quando, TOM_DA_SITUACAO, type FiltroDaLista } from "./lista";
import { MaterialDoEsim, PagamentoDaNogle } from "./PagamentoDaNogle";

export const metadata: Metadata = { title: "Ora Connect" };
export const dynamic = "force-dynamic";

const OK = {
  registrada: "Operação registrada. O servidor envia à Nogle e acompanha a resposta; a situação aparece abaixo.",
  cancelada: "Operação cancelada antes do envio.",
  resolvida: "Decisão registrada na operação.",
} as const;
const ICONES: Record<TipoOperacao, typeof Zap> = { ativacao: Smartphone, recarga: Zap, portabilidade: ArrowLeftRight };
const TITULOS: Record<PeriodoFinanceiro, string> = { hoje: "Operações de hoje", "7": "Operações dos últimos 7 dias", "30": "Operações dos últimos 30 dias" };
const COLUNAS = "id, numero, tipo, situacao, vendedor_id, unidade_id, metodo_pagamento, iccid, esim, linha, linha_doadora, plano_nome, valor_face_centavos, recebido_na_loja_centavos, venda_item_id, cliente_nome, documento_mascarado, id_externo, link_pagamento, pix_copia_cola, pagamento_confirmado_em, numero_ativado, mensagem_operadora, evidencia, motivo_resolucao, criado_em";
/** As do período que a tela lê (a soma por vendedor sai delas); a lista mostra as primeiras. O relatório tem todas. */
const LIMITE_DO_PERIODO = 500;
const LIMITE_DA_LISTA = 100;
/** AUD-f: a fila do Pix que a loja paga, de 20 em 20, das mais antigas (quem espera há mais tempo) para as mais novas. */
const PIX_POR_PAGINA = 20;
const ehSituacao = (s: string): s is SituacaoOperacao => Object.hasOwn(SITUACOES_OPERACAO, s);

// Ora Connect real (ADR-005): a loja registra; o worker do servidor fala com a Nogle; só a evidência da operadora confirma.
// Lote CONNECT-m (25/11/2026; o pedido do proprietário: "as telas do ora connect da demo, que estavam muito boas"): a aba
// "Operações do dia" da demonstração, com os números reais: os 4 cartões da produção do período, as operações do período
// (e as ainda abertas de antes, que esperam a Nogle ou a decisão da gerência) com os filtros, as operações por tipo, a
// produção por vendedor e, para quem gere, o Pix da Nogle que a loja ainda paga. As outras funções ficam nas abas do topo.
export default async function Connect({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; ok?: ValorDeParametro; periodo?: ValorDeParametro; filtro?: ValorDeParametro; pix?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DO_CONNECT, parametros.erro);
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const filtro = filtroDaLista(textoDoParametro(parametros.filtro));
  const paginaDoPix = Math.min(Math.max(Number.parseInt(textoDoParametro(parametros.pix) ?? "", 10) || 1, 1), 500);
  const periodo = periodoFinanceiro(textoDoParametro(parametros.periodo));
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const { opera, gere } = permissoesDaConnect(sessao);
  const veCusto = permite(sessao, "custo.ver");
  const momento = agora();
  const janela = janelasDoPeriodo(periodo, momento).atual;

  // CONNECT-l (D-062): para quem gere, o Pix da Nogle que a loja paga (o cliente já pagou no caixa), em todas as lojas que a
  // pessoa gere (o RLS escolhe), para o dono pagar de onde estiver. AUD-f: a fila inteira, de 20 em 20 (com o total), das mais
  // antigas para as mais novas, em ordem estável; o que a Nogle já deu como pago sai (ninguém paga duas vezes); a operação sem
  // link nem Pix copia e cola também aparece, com o aviso para conferir na Nogle.
  const aPagar = gere
    ? supabase.from("connect_operacoes").select("id, numero, tipo, situacao, metodo_pagamento, venda_item_id, plano_nome, valor_face_centavos, recebido_na_loja_centavos, id_externo, link_pagamento, pix_copia_cola, pagamento_confirmado_em, criado_em, unidades(nome)", { count: "exact" })
      .eq("metodo_pagamento", "LINK").eq("situacao", "aguardando_operadora").not("venda_item_id", "is", null).is("pagamento_confirmado_em", null)
      .order("criado_em", { ascending: true }).order("id", { ascending: true })
      .range((paginaDoPix - 1) * PIX_POR_PAGINA, paginaDoPix * PIX_POR_PAGINA - 1)
    : null;
  // As operações da loja (quem só opera vê as suas: o RLS escolhe): as do período e as abertas de antes. A lista não tem fim
  // de janela: a operação recém-registrada aparece mesmo com o relógio do banco um pouco à frente do da tela. A produção do
  // período (lote G4a) vem somada do banco, a da loja para quem gere e a própria para quem opera.
  const [doPeriodo, deAntes, pixAPagar, producao] = await Promise.all([
    supabase.from("connect_operacoes").select(COLUNAS).eq("unidade_id", unidade)
      .gte("criado_em", janela.inicio.toISOString()).order("criado_em", { ascending: false }).limit(LIMITE_DO_PERIODO),
    supabase.from("connect_operacoes").select(COLUNAS).eq("unidade_id", unidade)
      .in("situacao", [...ABERTAS]).lt("criado_em", janela.inicio.toISOString()).order("criado_em", { ascending: false }).limit(50),
    aPagar,
    opera || gere ? consultarProducao(supabase, janela, { unidade, vendedor: gere ? null : usuario.id }) : Promise.resolve(null),
  ]);
  if (doPeriodo.error || deAntes.error || pixAPagar?.error) throw new FalhaDoServico("connect");
  const operacoes = [...doPeriodo.data, ...deAntes.data].sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
  const filaDoPix = (pixAPagar?.data ?? []).map((o) => ({ ...o, pagamento: pagamentoNaNogle(o) }));
  const totalDoPix = pixAPagar?.count ?? 0;
  const filtradas = operacoes.filter((o) => naLista(filtro, o.situacao));
  const lista = filtradas.slice(0, LIMITE_DA_LISTA);
  // AUD-f: o material de instalação do eSIM, lido à parte e só das ativações que a pessoa pode ver (podeVerMaterialDoEsim).
  const comMaterial = lista.filter((o) => podeVerMaterialDoEsim(o, usuario.id, gere)).map((o) => o.id);
  // Débito da carteira é custo (#56): só para quem tem custo.ver, lido da tabela própria (o RLS também barra). Os nomes de
  // quem fez cada operação, só para quem gere (quem opera vê só as suas).
  const vendedores = [...new Set(operacoes.map((o) => o.vendedor_id))];
  const [custos, pessoas, materiais] = await Promise.all([
    veCusto && operacoes.length
      ? supabase.from("connect_operacoes_custos").select("operacao_id, valor_debitado_centavos").in("operacao_id", operacoes.map((o) => o.id))
      : Promise.resolve({ data: [], error: null }),
    gere && vendedores.length ? supabase.from("perfis_usuario").select("id, nome").in("id", vendedores) : Promise.resolve({ data: [], error: null }),
    comMaterial.length ? supabase.from("connect_operacoes").select("id, link_esim, esim_codigo").in("id", comMaterial) : Promise.resolve({ data: [], error: null }),
  ]);
  if (custos.error) throw new FalhaDoServico("connect_custos");
  if (pessoas.error) throw new FalhaDoServico("perfis_usuario");
  if (materiais.error) throw new FalhaDoServico("connect_material_esim");
  const materialDe = (id: string) => {
    const m = materiais.data.find((x) => x.id === id);
    return m ? materialDoEsimNaTela(m) : null;
  };
  const debitoDe = (id: string) => custos.data.find((c) => c.operacao_id === id)?.valor_debitado_centavos ?? null;
  const nomeDe = (id: string) => pessoas.data.find((p) => p.id === id)?.nome ?? "Pessoa sem nome";
  const porVendedor = gere ? somasPor(doPeriodo.data, "vendedor_id", nomeDe).filter((v) => totalConfirmadas(v) > 0).slice(0, 8) : [];

  const enderecoDe = (p: { periodo?: PeriodoFinanceiro; filtro?: FiltroDaLista; pix?: number }) => {
    const busca = new URLSearchParams();
    const per = p.periodo ?? periodo;
    const fil = p.filtro ?? filtro;
    const pag = p.pix ?? paginaDoPix;
    if (per !== "hoje") busca.set("periodo", per);
    if (fil !== "todas") busca.set("filtro", fil);
    if (pag > 1) busca.set("pix", String(pag));
    return busca.size ? `/connect?${busca}` : "/connect";
  };
  const primeiraDoPix = (paginaDoPix - 1) * PIX_POR_PAGINA + 1;

  return (
    <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}>
      <CabecalhoConnect sessao={sessao} aba="operacoes" acao={
        <ExportarCsv prefixo="ora5g" nomeArquivo="connect-operacoes" colunas={["Data", "Nº", "Operação", "Linha ou chip", "Plano", "Situação"]}
          linhas={operacoes.map((o) => [quando(o.criado_em), String(o.numero), NOMES_DAS_OPERACOES[o.tipo as TipoOperacao] ?? o.tipo,
            o.linha ? linhaFormatada(o.linha) : o.iccid ?? (o.esim ? "eSIM" : ""), o.plano_nome ?? "", ehSituacao(o.situacao) ? SITUACOES_OPERACAO[o.situacao].nome : o.situacao])} />
      } />
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CONNECT[erro]}</Aviso>}
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {!opera && !gere && <Aviso tom="aviso" className="mt-4">Seu papel não registra operações da Ora Connect nesta loja.</Aviso>}

      <div className="mt-4 space-y-3">
        <FiltroSegmentado rotulo="Período" opcoes={ORDEM_DOS_PERIODOS.map((p) => ({ href: enderecoDe({ periodo: p }), rotulo: PERIODOS_FINANCEIROS[p].rotulo, ativo: p === periodo }))} />
        {producao && <IndicadoresDoConnect producao={producao} aqui={enderecoDe({})} />}
      </div>

      {totalDoPix > 0 && (
        <Cartao className="mt-4" titulo="Pix da Nogle para a loja pagar" icone={IconeQr}
          subtitulo={`O cliente já pagou o plano no caixa: pague o Pix da Nogle com o dinheiro recebido. ${plural(totalDoPix, "operação espera", "operações esperam")}, das mais antigas para as mais novas; cada uma sai daqui quando a Nogle confirmar o pagamento.`}>
          {filaDoPix.length === 0 ? <p className="text-sm text-suave">Nada nesta página. <Link href={enderecoDe({ pix: 1 })} className="font-semibold text-acao">Voltar ao começo da fila</Link>.</p> : (
            <ul className="divide-y divide-borda">
              {filaDoPix.map((o) => (
                <li key={o.id} className="space-y-1 py-2 text-sm">
                  <p>Nº {o.numero} · {NOMES_DAS_OPERACOES[o.tipo as TipoOperacao] ?? o.tipo}{o.plano_nome ? ` · ${o.plano_nome}` : ""}{o.unidades?.nome ? ` · ${o.unidades.nome}` : ""}
                    <span className="numeros block text-xs text-suave">{quando(o.criado_em)}{o.valor_face_centavos !== null ? ` · valor de face ${brl(centavosDoBanco(o.valor_face_centavos))}` : ""}{o.recebido_na_loja_centavos !== null ? ` · recebido na loja ${brl(centavosDoBanco(o.recebido_na_loja_centavos))}` : ""}</span>
                  </p>
                  {o.pagamento && <PagamentoDaNogle numero={o.numero} pagamento={o.pagamento} compacto />}
                </li>
              ))}
            </ul>
          )}
          {totalDoPix > PIX_POR_PAGINA && (
            <nav aria-label="Páginas da fila do Pix" className="mt-3 flex flex-wrap items-center gap-3 border-t border-borda pt-3 text-xs">
              <span className="numeros text-suave">{filaDoPix.length ? `${numero(primeiraDoPix)}–${numero(primeiraDoPix + filaDoPix.length - 1)} de ${numero(totalDoPix)}` : `${numero(totalDoPix)} na fila`}</span>
              {paginaDoPix > 1 && <Link href={enderecoDe({ pix: paginaDoPix - 1 })} className="font-semibold text-acao">As anteriores (mais antigas)</Link>}
              {paginaDoPix * PIX_POR_PAGINA < totalDoPix && <Link href={enderecoDe({ pix: paginaDoPix + 1 })} className="font-semibold text-acao">As seguintes (mais novas)</Link>}
            </nav>
          )}
        </Cartao>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao titulo={gere ? TITULOS[periodo] : `Minhas ${TITULOS[periodo].toLowerCase()}`} className="xl:col-span-2 xl:self-start" corpo="p-0"
          subtitulo={`O status vem da operadora; nada é dado como confirmado sem resposta${deAntes.data.length ? ` · com ${plural(deAntes.data.length, "aberta de antes", "abertas de antes")}` : ""}`}>
          <div className="border-b border-borda px-4 pb-3 sm:px-5">
            <FiltroSegmentado rotulo="Filtrar operações" opcoes={(Object.keys(FILTROS_DA_LISTA) as FiltroDaLista[]).map((x) => ({
              href: enderecoDe({ filtro: x }), rotulo: FILTROS_DA_LISTA[x].rotulo, ativo: x === filtro, contagem: operacoes.filter((o) => naLista(x, o.situacao)).length,
            }))} />
          </div>
          {lista.length === 0 ? <div className="p-5"><EstadoVazio titulo="Nenhuma operação aqui" icone={Signal} /></div> : (
            <ul className="divide-y divide-borda">
              {lista.map((o) => {
                const s = ehSituacao(o.situacao) ? o.situacao : "registrada";
                const Icone = ICONES[o.tipo as TipoOperacao] ?? Zap;
                const evidencia = o.evidencia as { mensagem?: string; consultado_em?: string } | null;
                const decide = gere && o.vendedor_id !== usuario.id && (s === "resultado_desconhecido" || s === "erro_operadora");
                const pagamento = pagamentoNaNogle(o);
                const material = materialDe(o.id);
                const debito = debitoDe(o.id);
                const resumo = [`Nº ${o.numero}`, ...(gere ? [nomeDe(o.vendedor_id)] : []), ...(o.plano_nome ? [o.plano_nome] : []),
                  ...(o.valor_face_centavos ? [brl(centavosDoBanco(o.valor_face_centavos))] : [])].join(" · ");
                return (
                  <li key={o.id} className="px-4 py-2.5 sm:px-5">
                    <details>
                      <summary className="grid cursor-pointer list-none grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3">
                        <span className="numeros text-sm text-suave">{horaOuDia(o.criado_em, momento)}</span>
                        <span className="min-w-0 text-sm">
                          <span className="flex min-w-0 items-center gap-1 font-medium">
                            <Icone aria-hidden className="size-4 shrink-0 text-acao" />
                            <span className="truncate">{NOMES_DAS_OPERACOES[o.tipo as TipoOperacao] ?? o.tipo}{o.linha ? ` · ${linhaFormatada(o.linha)}` : o.esim ? " · eSIM" : ""}</span>
                          </span>
                          <span className="numeros block truncate text-xs text-suave">{resumo}</span>
                        </span>
                        <Selo tom={TOM_DA_SITUACAO[s]} ponto className="max-w-[9.5rem] sm:max-w-none">{SITUACOES_OPERACAO[s].nome}</Selo>
                      </summary>
                      <div className="mt-2 space-y-1 border-l-2 border-borda pl-3 text-sm">
                        <p className="numeros text-xs text-suave">
                          {quando(o.criado_em)}
                          {o.iccid ? ` · ICCID ${o.iccid}` : ""}
                          {o.linha_doadora ? ` · trazida de ${linhaFormatada(o.linha_doadora)}` : ""}
                          {o.metodo_pagamento === "LINK" ? " · Pix da Nogle" : o.metodo_pagamento === "SALDO" ? " · crédito da carteira" : ""}
                          {o.cliente_nome ? ` · ${o.cliente_nome} (${o.documento_mascarado ?? ""})` : ""}
                        </p>
                        <p className="text-xs">{SITUACOES_OPERACAO[s].explicacao}</p>
                        {o.tipo === "recarga" && (
                          <p className="numeros text-xs text-suave">Valor de face {brl(centavosDoBanco(o.valor_face_centavos ?? 0))}
                            {o.recebido_na_loja_centavos !== null ? ` · recebido na loja ${brl(centavosDoBanco(o.recebido_na_loja_centavos))}` : " · pago direto à Nogle"}
                            {debito !== null ? ` · debitado da carteira ${brl(centavosDoBanco(debito))}` : ""}</p>
                        )}
                        {o.numero_ativado && <p className="numeros text-xs">Número ativado: {linhaFormatada(o.numero_ativado)}</p>}
                        {pagamento && <PagamentoDaNogle numero={o.numero} pagamento={pagamento} />}
                        {material && <MaterialDoEsim numero={o.numero} material={material} />}
                        {o.mensagem_operadora && <p className="text-xs text-suave">Nogle: {o.mensagem_operadora}</p>}
                        {evidencia?.mensagem && <p className="text-xs text-suave">Última consulta{evidencia.consultado_em ? ` (${quando(evidencia.consultado_em)})` : ""}: {evidencia.mensagem}</p>}
                        {o.motivo_resolucao && <p className="text-xs text-suave">Motivo registrado: {o.motivo_resolucao}</p>}
                        {s === "registrada" && (o.vendedor_id === usuario.id || gere) && (
                          <form action={cancelarOperacao} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="operacao" value={o.id} />
                            <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
                            <Botao type="submit" tamanho="sm" variante="secundario">Cancelar antes do envio</Botao>
                          </form>
                        )}
                        {decide && (
                          <form action={resolverOperacao} className="grid gap-2 rounded-botao bg-perigo-clara/40 p-2 sm:grid-cols-3">
                            <input type="hidden" name="operacao" value={o.id} />
                            <label className="text-xs font-medium">Desfecho conferido
                              <select name="resultado" className={campo} defaultValue="nao_recebida">
                                <option value="confirmada">Feita na Nogle (conta na produção)</option>
                                <option value="nao_recebida">Não chegou à Nogle</option>
                                <option value="recusada">Recusada pela Nogle</option>
                              </select>
                            </label>
                            <label className="text-xs font-medium sm:col-span-2">Evidência (suporte, ERP da Nogle, consulta)<input name="motivo" required minLength={10} className={campo} /></label>
                            <div className="sm:col-span-3"><Botao type="submit" tamanho="sm" variante="perigo"><ShieldCheck aria-hidden className="size-4" /> Registrar decisão</Botao></div>
                          </form>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
          {(filtradas.length > lista.length || doPeriodo.data.length === LIMITE_DO_PERIODO) && (
            <p className="border-t border-borda px-4 py-3 text-xs text-suave sm:px-5">
              {`Mostrando as ${numero(lista.length)} mais recentes. `}<Link href="/connect/relatorio" className="font-semibold text-acao">O relatório tem todas</Link>.
            </p>
          )}
        </Cartao>

        <div className="min-w-0 space-y-4">
          {producao && <OperacoesPorTipo producao={producao} veCusto={veCusto} rotuloDoPeriodo={PERIODOS_FINANCEIROS[periodo].rotulo.toLowerCase()} />}
          {gere && (
            <Cartao titulo="Produção por vendedor" subtitulo="Confirmadas entre as operações do período, como no relatório" icone={Users}>
              {porVendedor.length === 0 ? <p className="text-sm text-suave">Nenhuma operação confirmada no período.</p> : (
                <BarrasHorizontais nomeSerie="Confirmadas" formatar={numero} dados={porVendedor.map((v) => ({ rotulo: v.nome, valor: totalConfirmadas(v) }))} />
              )}
              <p className="mt-4 text-sm"><Link href={periodo === "hoje" ? "/connect/relatorio" : `/connect/relatorio?periodo=${periodo}`} className="font-semibold text-acao">Ver o relatório completo</Link></p>
            </Cartao>
          )}
        </div>
      </div>
    </MoldeReal>
  );
}

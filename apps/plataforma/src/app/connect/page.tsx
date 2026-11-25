import { randomUUID } from "node:crypto";

import { ArrowLeftRight, QrCode as IconeQr, RadioTower, ShieldCheck, Smartphone, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NOMES_DAS_OPERACOES, SITUACOES_OPERACAO, TIPOS_OPERACAO, type SituacaoOperacao, type TipoOperacao } from "@ora5g/dominio/nogle";

import { MoldeReal } from "../../componentes/MoldeReal";
import { PainelDaProducao } from "../../componentes/paineis-do-connect";
import { QrCode } from "../../componentes/QrCode";
import { Aviso, Botao, Cartao, FiltroSegmentado, Selo, TituloPagina, type Tom } from "../../componentes/ui";
import { permite } from "../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { consultarProducao } from "../../lib/connect/consulta-producao";
import { ERROS_DO_CONNECT, inicioDaJanela, linkDePagamento, quemPagaOPix } from "../../lib/connect/regras";
import { centavosDoBanco } from "../../lib/dinheiro";
import { janelasDoPeriodo, ORDEM_DOS_PERIODOS, PERIODOS_FINANCEIROS, periodoFinanceiro } from "../../lib/financeiro/painel";
import { brl } from "../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { cancelarOperacao, habilitarOperacao, registrarOperacao, resolverOperacao } from "./acoes";

export const metadata: Metadata = { title: "Ora Connect" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const rotulo = "block text-sm font-medium";
const OK = {
  registrada: "Operação registrada. O servidor envia à Nogle e acompanha a resposta; a situação aparece abaixo.",
  cancelada: "Operação cancelada antes do envio.",
  resolvida: "Decisão registrada na operação.",
  habilitacao: "Habilitação registrada (com a evidência na auditoria).",
} as const;
const TOM_DA_SITUACAO: Record<SituacaoOperacao, Tom> = {
  registrada: "info", enviando: "info", aguardando_operadora: "aviso", resultado_desconhecido: "perigo", confirmada: "sucesso",
  recusada: "neutro", negada: "neutro", erro_operadora: "perigo", nao_recebida: "neutro", cancelada: "neutro",
};
const ICONES: Record<TipoOperacao, typeof Zap> = { ativacao: Smartphone, recarga: Zap, portabilidade: ArrowLeftRight };
const VIVAS = new Set(["registrada", "enviando", "aguardando_operadora", "resultado_desconhecido", "confirmada", "erro_operadora"]);
const ehSituacao = (s: string): s is SituacaoOperacao => Object.hasOwn(SITUACOES_OPERACAO, s);
const quando = (data: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(data));

// Ora Connect real (ADR-005): a loja registra; o worker do servidor fala com a Nogle; só a
// evidência da operadora confirma. Nada aqui chama a Nogle nem vê credencial.
export default async function Connect({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; ok?: ValorDeParametro; periodo?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DO_CONNECT, parametros.erro);
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const seteDias = inicioDaJanela(7);

  const opera = permite(sessao, "connect.operar");
  const gere = permite(sessao, "connect.gerir");
  const integra = permite(sessao, "integracoes.gerir");
  const veCusto = permite(sessao, "custo.ver");
  // CONNECT-l (D-062): para quem gere, o Pix da Nogle que a loja paga (o cliente já pagou no caixa), em todas as lojas
  // que a pessoa gere (o RLS escolhe), para o dono pagar de onde estiver.
  const aPagar = gere
    ? supabase.from("connect_operacoes").select("id, numero, tipo, plano_nome, valor_face_centavos, recebido_na_loja_centavos, link_pagamento, criado_em, unidades(nome)")
      .eq("metodo_pagamento", "LINK").eq("situacao", "aguardando_operadora").not("venda_item_id", "is", null).not("link_pagamento", "is", null)
      .order("criado_em", { ascending: false }).limit(20)
    : null;
  const [habilitacoes, referencias, operacoes, pagos, pixAPagar] = await Promise.all([
    supabase.from("connect_habilitacoes").select("tipo, habilitada, evidencia, alterado_em"),
    supabase.from("connect_referencias").select("tipo, codigo, nome, uf, valor_centavos").eq("ativo", true).order("nome").limit(3000),
    supabase.from("connect_operacoes").select("id, numero, tipo, situacao, vendedor_id, metodo_pagamento, iccid, esim, linha, linha_doadora, plano_nome, valor_face_centavos, recebido_na_loja_centavos, venda_item_id, cliente_nome, documento_mascarado, link_pagamento, link_esim, numero_ativado, mensagem_operadora, evidencia, motivo_resolucao, criado_em")
      .eq("unidade_id", unidade).order("criado_em", { ascending: false }).limit(30),
    // CONNECT-f: o nome da variação é o do plano (REC-<plano>, ATV-<plano>): a pessoa vê qual plano foi pago.
    supabase.from("venda_itens").select("id, tipo, preco_unitario_centavos, quantidade, desconto_centavos, variantes(nome), vendas!inner(numero, situacao, unidade_id, concluida_em)")
      .in("tipo", ["ativacao", "recarga", "portabilidade"]).eq("vendas.situacao", "concluida").eq("vendas.unidade_id", unidade).gte("vendas.concluida_em", seteDias).limit(50),
    aPagar,
  ]);
  if (habilitacoes.error || referencias.error || operacoes.error || pagos.error || pixAPagar?.error) throw new FalhaDoServico("connect");
  const pixDaLojaAPagar = (pixAPagar?.data ?? []).flatMap((o) => {
    const link = linkDePagamento(o.link_pagamento);
    return link ? [{ ...o, link }] : [];
  });
  // Débito da carteira é custo (#56): só para quem tem custo.ver, lido da tabela própria (o RLS também barra).
  const custos = veCusto && operacoes.data.length
    ? await supabase.from("connect_operacoes_custos").select("operacao_id, valor_debitado_centavos").in("operacao_id", operacoes.data.map((o) => o.id))
    : { data: [], error: null };
  if (custos.error) throw new FalhaDoServico("connect_custos");
  // Produção do período (lote G4a), somada no banco: a loja para quem gere; só a própria para quem opera.
  const periodo = periodoFinanceiro(textoDoParametro(parametros.periodo));
  const producao = opera || gere
    ? await consultarProducao(supabase, janelasDoPeriodo(periodo).atual, { unidade, vendedor: gere ? null : usuario.id })
    : null;
  const enderecoDoPeriodo = (p: string) => (p === "hoje" ? "/connect" : `/connect?periodo=${p}`);
  const debitoDe = (id: string) => custos.data.find((c) => c.operacao_id === id)?.valor_debitado_centavos ?? null;

  const habilitada = new Set(habilitacoes.data.filter((h) => h.habilitada).map((h) => h.tipo));
  const lista = (tipo: string) => referencias.data.filter((r) => r.tipo === tipo);
  const planos = lista("plano");
  const ocupados = new Set(operacoes.data.filter((o) => o.venda_item_id && VIVAS.has(o.situacao)).map((o) => o.venda_item_id));
  const pagosLivres = (tipo: TipoOperacao) => pagos.data.filter((p) => p.tipo === tipo && !ocupados.has(p.id));
  const opcaoDePago = (p: (typeof pagos.data)[number]) => (
    <option key={p.id} value={p.id}>Venda nº {p.vendas.numero}{p.variantes?.nome ? ` · ${p.variantes.nome}` : ""} · {brl(centavosDoBanco(p.preco_unitario_centavos) * p.quantidade - centavosDoBanco(p.desconto_centavos))}</option>
  );
  // CONNECT-l (D-062, o proprietário em 25/11: "não com o crédito da Nogle"): o Pix da Nogle é o padrão. Com o serviço
  // recebido no caixa, quem paga o link é a loja (o cliente já pagou); sem ele, o cliente paga direto à Nogle, na hora.
  const formaDePagamento = (tipo: TipoOperacao) => (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Pagamento à Nogle</legend>
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" name="metodo" value="LINK" defaultChecked className="mt-1 size-4" />
        <span><span className="font-semibold">Pix da Nogle</span> (o padrão): a Nogle devolve o pagamento, que aparece aqui com o QR Code. Com o serviço recebido no caixa, a loja paga com o dinheiro do cliente; sem ele, o cliente paga direto à Nogle, na hora.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" name="metodo" value="SALDO" className="mt-1 size-4" />
        <span><span className="font-semibold">Crédito da carteira da Ora na Nogle</span>: só com o serviço pago no caixa e com crédito na carteira.</span>
      </label>
      <label className={rotulo}>Serviço pago no caixa
        <select name="venda_item" className={campo} defaultValue=""><option value="">Nenhum: o cliente paga o Pix da Nogle direto</option>{pagosLivres(tipo).map(opcaoDePago)}</select>
      </label>
      <p className="text-xs text-suave">A venda escolhida tem de ser do mesmo plano da operação e vale uma operação só.</p>
    </fieldset>
  );
  const seletorDePlano = (
    <label className={rotulo}>Plano (lista da Nogle)
      <select name="plano" required className={campo} defaultValue="">
        <option value="" disabled>Escolha</option>
        {planos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome} · {brl(centavosDoBanco(p.valor_centavos ?? 0))}</option>)}
      </select>
    </label>
  );
  const semListas = planos.length === 0;

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Ora Connect" />
      {erro && <Aviso tom="perigo">{ERROS_DO_CONNECT[erro]}</Aviso>}
      {ok && <Aviso tom="sucesso">{OK[ok]}</Aviso>}
      {producao && (
        <PainelDaProducao
          producao={producao} veCusto={veCusto} aqui={enderecoDoPeriodo(periodo)}
          filtro={<FiltroSegmentado rotulo="Período" opcoes={ORDEM_DOS_PERIODOS.map((p) => ({ href: enderecoDoPeriodo(p), rotulo: PERIODOS_FINANCEIROS[p].rotulo, ativo: p === periodo }))} />}
        />
      )}

      {pixDaLojaAPagar.length > 0 && (
        <Cartao titulo="Pix da Nogle para a loja pagar" subtitulo="O cliente já pagou no caixa: pague o Pix da Nogle com o dinheiro recebido. A operação segue sozinha quando a Nogle confirmar." icone={IconeQr}>
          <ul className="divide-y divide-borda">
            {pixDaLojaAPagar.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>Nº {o.numero} · {NOMES_DAS_OPERACOES[o.tipo as TipoOperacao] ?? o.tipo}{o.plano_nome ? ` · ${o.plano_nome}` : ""}{o.unidades?.nome ? ` · ${o.unidades.nome}` : ""}
                  <span className="numeros block text-xs text-suave">{quando(o.criado_em)}{o.valor_face_centavos !== null ? ` · valor de face ${brl(centavosDoBanco(o.valor_face_centavos))}` : ""}{o.recebido_na_loja_centavos !== null ? ` · recebido na loja ${brl(centavosDoBanco(o.recebido_na_loja_centavos))}` : ""}</span>
                </span>
                <a className="font-semibold text-acao underline" href={o.link} rel="noreferrer noopener" target="_blank">Abrir o pagamento da Nogle</a>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao titulo="Situação da integração" icone={RadioTower}>
        <ul className="flex flex-wrap gap-2">
          {TIPOS_OPERACAO.map((t) => <li key={t}><Selo tom={habilitada.has(t) ? "sucesso" : "aviso"} ponto>{NOMES_DAS_OPERACOES[t]}: {habilitada.has(t) ? "liberada" : "aguardando homologação"}</Selo></li>)}
        </ul>
        {habilitada.size === 0 && (
          <p className="mt-3 text-sm text-suave">As operações ainda não foram liberadas: falta o teste com uma linha autorizada pela Nogle. Até lá nada é enviado e nada aparece como feito. As consultas já funcionam: o estoque de chips na Nogle é lido a cada 30 minutos.</p>
        )}
        {habilitada.size > 0 && semListas && <p className="mt-3 text-sm text-suave">Os planos da Nogle ainda não foram carregados pelo servidor.</p>}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {(opera || gere) && <Link href="/connect/linha" className="font-semibold text-acao">Consultar linha</Link>}
          {(opera || gere) && <Link href="/connect/relatorio" className="font-semibold text-acao">Relatório do vendedor e da loja</Link>}
          {gere && <Link href="/connect/acoes-na-nogle" className="font-semibold text-acao">Ações na Nogle</Link>}
          {(opera || gere || integra) && <Link href="/connect/chips" className="font-semibold text-acao">Chips na Nogle</Link>}
          {gere && <Link href="/connect/conciliacao" className="font-semibold text-acao">Conciliação com os relatórios da Nogle</Link>}
        </p>
      </Cartao>

      {!opera && <Aviso tom="aviso">Seu papel não registra operações da Ora Connect nesta loja.</Aviso>}

      {opera && habilitada.has("ativacao") && !semListas && (
        <details className="rounded-cartao border border-borda bg-white p-4">
          <summary className="cursor-pointer font-semibold"><Smartphone aria-hidden className="mr-1 inline size-4" /> Ativar chip</summary>
          <p className="mt-2 text-xs text-suave">Chip do estoque: venda o chip no PDV antes. Os dados do cliente vão só para a Nogle e saem do sistema depois do envio.</p>
          <form action={registrarOperacao} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="tipo" value="ativacao" /><input type="hidden" name="chave" value={randomUUID()} />
            <label className={rotulo}>ICCID (19 dígitos do chip)<input name="iccid" inputMode="numeric" autoComplete="off" className={campo} /></label>
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="esim" /> eSIM (sem chip físico)</label>
            <label className={rotulo}>DDD
              <select name="ddd" required className={campo} defaultValue=""><option value="" disabled>Escolha</option>{lista("ddd").map((d) => <option key={d.codigo} value={d.codigo}>{d.codigo} ({d.uf})</option>)}</select>
            </label>
            {seletorDePlano}
            <div className="sm:col-span-2">{formaDePagamento("ativacao")}</div>
            <label className={`${rotulo} sm:col-span-2`}>Nome completo do cliente<input name="nome" required minLength={3} maxLength={120} autoComplete="off" className={campo} /></label>
            <label className={rotulo}>CPF ou CNPJ<input name="documento" required inputMode="numeric" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Nascimento (pessoa física)<input name="data_nascimento" type="date" className={campo} /></label>
            <label className={rotulo}>E-mail<input name="email" type="email" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Telefone com DDD<input name="telefone" inputMode="tel" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>CEP<input name="cep" required inputMode="numeric" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Cidade
              <select name="id_cidade" required className={campo} defaultValue=""><option value="" disabled>Escolha</option>{lista("cidade").map((c) => <option key={c.codigo} value={c.codigo}>{c.nome} ({c.uf})</option>)}</select>
            </label>
            <label className={`${rotulo} sm:col-span-2`}>Rua<input name="rua" required maxLength={120} autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Número<input name="numero_endereco" required maxLength={20} autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Complemento<input name="complemento" maxLength={120} autoComplete="off" className={campo} /></label>
            <label className={`${rotulo} sm:col-span-2`}>Bairro<input name="bairro" required maxLength={120} autoComplete="off" className={campo} /></label>
            <div className="sm:col-span-2"><Botao type="submit">Registrar ativação</Botao></div>
          </form>
        </details>
      )}

      {opera && habilitada.has("recarga") && !semListas && (
        <details className="rounded-cartao border border-borda bg-white p-4">
          <summary className="cursor-pointer font-semibold"><Zap aria-hidden className="mr-1 inline size-4" /> Recarga</summary>
          <form action={registrarOperacao} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="tipo" value="recarga" /><input type="hidden" name="chave" value={randomUUID()} />
            <label className={rotulo}>Linha com DDD<input name="linha" required inputMode="tel" autoComplete="off" className={campo} /></label>
            {seletorDePlano}
            <div className="sm:col-span-2">{formaDePagamento("recarga")}</div>
            <div className="sm:col-span-2"><Botao type="submit">Registrar recarga</Botao></div>
          </form>
        </details>
      )}

      {opera && habilitada.has("portabilidade") && lista("operadora").length > 0 && (
        <details className="rounded-cartao border border-borda bg-white p-4">
          <summary className="cursor-pointer font-semibold"><ArrowLeftRight aria-hidden className="mr-1 inline size-4" /> Portabilidade</summary>
          <p className="mt-2 text-xs text-suave">O cliente aceita pelo SMS que chega na linha da outra operadora. A troca leva até 3 dias úteis depois do aceite.</p>
          <form action={registrarOperacao} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="tipo" value="portabilidade" /><input type="hidden" name="chave" value={randomUUID()} />
            <label className={rotulo}>Linha da Nogle (com DDD)<input name="linha" required inputMode="tel" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Linha na outra operadora<input name="linha_doadora" required inputMode="tel" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Operadora de origem
              <select name="operadora" required className={campo} defaultValue=""><option value="" disabled>Escolha</option>{lista("operadora").map((o) => <option key={o.codigo} value={o.codigo}>{o.nome}</option>)}</select>
            </label>
            <label className={rotulo}>Serviço pago no caixa (se houver)
              <select name="venda_item" className={campo} defaultValue=""><option value="">—</option>{pagosLivres("portabilidade").map(opcaoDePago)}</select>
            </label>
            <div className="sm:col-span-2"><Botao type="submit">Registrar portabilidade</Botao></div>
          </form>
        </details>
      )}

      <Cartao titulo={gere ? "Operações da loja" : "Minhas operações"} subtitulo="As 30 mais recentes">
        {operacoes.data.length === 0 ? <p className="text-sm text-suave">Nenhuma operação registrada.</p> : (
          <ul className="divide-y divide-borda">
            {operacoes.data.map((o) => {
              const s = ehSituacao(o.situacao) ? o.situacao : "registrada";
              const Icone = ICONES[o.tipo as TipoOperacao] ?? Zap;
              const evidencia = o.evidencia as { mensagem?: string; consultado_em?: string } | null;
              const decide = gere && o.vendedor_id !== usuario.id && (s === "resultado_desconhecido" || s === "erro_operadora");
              return (
                <li key={o.id} className="space-y-1 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold"><Icone aria-hidden className="mr-1 inline size-4 text-acao" />Nº {o.numero} · {NOMES_DAS_OPERACOES[o.tipo as TipoOperacao] ?? o.tipo}</span>
                    <Selo tom={TOM_DA_SITUACAO[s]} ponto>{SITUACOES_OPERACAO[s].nome}</Selo>
                  </div>
                  <p className="numeros text-xs text-suave">
                    {quando(o.criado_em)}
                    {o.iccid ? ` · ICCID ${o.iccid}` : o.esim ? " · eSIM" : ""}
                    {o.linha ? ` · linha ${o.linha}` : ""}{o.linha_doadora ? ` ← ${o.linha_doadora}` : ""}
                    {o.plano_nome ? ` · ${o.plano_nome}` : ""}{o.metodo_pagamento === "LINK" ? " · Pix da Nogle" : o.metodo_pagamento === "SALDO" ? " · crédito da carteira" : ""}
                    {o.cliente_nome ? ` · ${o.cliente_nome} (${o.documento_mascarado ?? ""})` : ""}
                  </p>
                  <p className="text-xs">{SITUACOES_OPERACAO[s].explicacao}</p>
                  {o.tipo === "recarga" && (
                    <p className="numeros text-xs text-suave">Valor de face {brl(centavosDoBanco(o.valor_face_centavos ?? 0))}
                      {o.recebido_na_loja_centavos !== null ? ` · recebido na loja ${brl(centavosDoBanco(o.recebido_na_loja_centavos))}` : " · pago direto à Nogle"}
                      {debitoDe(o.id) !== null ? ` · debitado da carteira ${brl(centavosDoBanco(debitoDe(o.id) ?? 0))}` : ""}</p>
                  )}
                  {o.numero_ativado && <p className="numeros text-xs">Número ativado: {o.numero_ativado}</p>}
                  {s === "aguardando_operadora" && linkDePagamento(o.link_pagamento) && (
                    <PixDaNogle numero={o.numero} link={linkDePagamento(o.link_pagamento) ?? ""} quemPaga={quemPagaOPix(o.venda_item_id)} />
                  )}
                  {o.link_esim && <p className="break-all text-xs">eSIM: <a className="text-acao underline" href={o.link_esim} rel="noreferrer noopener" target="_blank">abrir QR Code</a></p>}
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
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      {integra && (
        <Cartao titulo="Liberar operações (integrações)" subtitulo="Só depois de homologar com a Nogle; a evidência fica na auditoria" icone={ShieldCheck}>
          <form action={habilitarOperacao} className="grid gap-3 sm:grid-cols-3">
            <label className={rotulo}>Operação
              <select name="tipo" className={campo}>{TIPOS_OPERACAO.map((t) => <option key={t} value={t}>{NOMES_DAS_OPERACOES[t]}</option>)}</select>
            </label>
            <label className={rotulo}>Situação
              <select name="habilitar" className={campo} defaultValue="sim"><option value="sim">Liberar</option><option value="nao">Suspender</option></select>
            </label>
            <label className={`${rotulo} sm:col-span-3`}>Evidência da homologação<input name="evidencia" required minLength={10} className={campo} /></label>
            <div className="sm:col-span-3"><Botao type="submit" variante="secundario">Registrar</Botao></div>
          </form>
        </Cartao>
      )}
    </MoldeReal>
  );
}

// CONNECT-l (D-062): o Pix da Nogle da operação, com o QR Code desenhado no servidor e o botão para abrir na página da
// Nogle. Quem paga muda o texto: a loja (o cliente já pagou no caixa: o QR não é para ele) ou o cliente, na hora.
function PixDaNogle({ numero, link, quemPaga }: { numero: number; link: string; quemPaga: "loja" | "cliente" }) {
  return (
    <div className="mt-2 flex flex-wrap items-start gap-3 rounded-botao border border-borda p-3">
      <QrCode texto={link} rotulo={`QR Code do Pix da Nogle da operação nº ${numero}`} className="size-40 shrink-0 rounded-botao bg-white" />
      <div className="min-w-0 flex-1 space-y-1 text-xs">
        <p className="text-sm font-semibold">{quemPaga === "loja" ? "Pix da Nogle: a loja paga" : "Pix da Nogle: o cliente paga agora"}</p>
        <p className="text-suave">{quemPaga === "loja"
          ? "O cliente já pagou no caixa: não mostre este QR Code a ele. O dono ou o gerente paga com o dinheiro recebido, pelo celular."
          : "O cliente aponta a câmera do celular para o QR Code e paga na página da Nogle."} A operação segue sozinha quando a Nogle confirmar.</p>
        <a className="inline-block font-semibold text-acao underline" href={link} rel="noreferrer noopener" target="_blank">Abrir o pagamento da Nogle</a>
      </div>
    </div>
  );
}

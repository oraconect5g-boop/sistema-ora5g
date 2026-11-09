import { randomUUID } from "node:crypto";

import { ArrowLeftRight, RadioTower, ShieldCheck, Smartphone, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NOMES_DAS_OPERACOES, SITUACOES_OPERACAO, TIPOS_OPERACAO, type SituacaoOperacao, type TipoOperacao } from "@ora5g/dominio/nogle";

import { Marca } from "../../componentes/Marca";
import { Aviso, Botao, Cartao, Selo, type Tom } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { ERROS_DO_CONNECT, inicioDaJanela } from "../../lib/connect/regras";
import { centavosDoBanco } from "../../lib/dinheiro";
import { brl } from "../../lib/formato";
import { chaveDoCatalogo, type ValorDeParametro } from "../../lib/parametros";
import { cancelarOperacao, habilitarOperacao, registrarOperacao, resolverOperacao } from "./acoes";

export const metadata: Metadata = { title: "Ora Connect" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const rotulo = "block text-sm font-medium";
const OK = {
  registrada: "Operação registrada. O servidor envia à Contel e acompanha a resposta; a situação aparece abaixo.",
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

// Ora Connect real (ADR-005): a loja registra; o worker do servidor fala com a Contel; só a
// evidência da operadora confirma. Nada aqui chama a Contel nem vê credencial.
export default async function Connect({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; ok?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DO_CONNECT, parametros.erro);
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const { supabase, usuario, situacao } = await obterSessao({ exigirLoja: true });
  const unidade = situacao.unidade_id as string;
  const seteDias = inicioDaJanela(7);

  const [opera, gere, integra, habilitacoes, referencias, operacoes, pagos] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "connect.operar", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "connect.gerir", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "integracoes.gerir", p_unidade: unidade }),
    supabase.from("connect_habilitacoes").select("tipo, habilitada, evidencia, alterado_em"),
    supabase.from("connect_referencias").select("tipo, codigo, nome, uf, valor_centavos").eq("ativo", true).order("nome").limit(3000),
    supabase.from("connect_operacoes").select("id, numero, tipo, situacao, vendedor_id, metodo_pagamento, iccid, esim, linha, linha_doadora, plano_nome, valor_face_centavos, recebido_na_loja_centavos, valor_debitado_centavos, venda_item_id, cliente_nome, documento_mascarado, link_pagamento, link_esim, numero_ativado, mensagem_operadora, evidencia, motivo_resolucao, criado_em")
      .eq("unidade_id", unidade).order("criado_em", { ascending: false }).limit(30),
    supabase.from("venda_itens").select("id, tipo, preco_unitario_centavos, quantidade, desconto_centavos, vendas!inner(numero, situacao, unidade_id, concluida_em)")
      .in("tipo", ["ativacao", "recarga", "portabilidade"]).eq("vendas.situacao", "concluida").eq("vendas.unidade_id", unidade).gte("vendas.concluida_em", seteDias).limit(50),
  ]);
  if (opera.error || gere.error || integra.error || habilitacoes.error || referencias.error || operacoes.error || pagos.error) throw new FalhaDoServico("connect");

  const habilitada = new Set(habilitacoes.data.filter((h) => h.habilitada).map((h) => h.tipo));
  const lista = (tipo: string) => referencias.data.filter((r) => r.tipo === tipo);
  const planos = lista("plano");
  const ocupados = new Set(operacoes.data.filter((o) => o.venda_item_id && VIVAS.has(o.situacao)).map((o) => o.venda_item_id));
  const pagosLivres = (tipo: TipoOperacao) => pagos.data.filter((p) => p.tipo === tipo && !ocupados.has(p.id));
  const opcaoDePago = (p: (typeof pagos.data)[number]) => (
    <option key={p.id} value={p.id}>Venda nº {p.vendas.numero} · {brl(centavosDoBanco(p.preco_unitario_centavos) * p.quantidade - centavosDoBanco(p.desconto_centavos))}</option>
  );
  const formaDePagamento = (tipo: TipoOperacao) => (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Quem paga a Contel</legend>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name="metodo" value="LINK" defaultChecked /> LINK: o cliente paga pelo link da Contel</label>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name="metodo" value="SALDO" /> SALDO: carteira da Ora (o cliente já pagou no caixa)</label>
      <label className={rotulo}>Serviço pago no caixa (obrigatório no SALDO)
        <select name="venda_item" className={campo} defaultValue=""><option value="">—</option>{pagosLivres(tipo).map(opcaoDePago)}</select>
      </label>
    </fieldset>
  );
  const seletorDePlano = (
    <label className={rotulo}>Plano (lista da Contel)
      <select name="plano" required className={campo} defaultValue="">
        <option value="" disabled>Escolha</option>
        {planos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome} · {brl(centavosDoBanco(p.valor_centavos ?? 0))}</option>)}
      </select>
    </label>
  );
  const semListas = planos.length === 0;

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Marca tamanho="text-2xl" />
        <nav className="flex gap-3 text-sm font-semibold text-acao"><Link href="/vender">Vender</Link><Link href="/caixa">Caixa</Link><Link href="/inicio">Início</Link></nav>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Ora Connect · {situacao.unidade_nome}</h1>
      {erro && <Aviso tom="perigo">{ERROS_DO_CONNECT[erro]}</Aviso>}
      {ok && <Aviso tom="sucesso">{OK[ok]}</Aviso>}

      <Cartao titulo="Situação da integração" icone={RadioTower}>
        <ul className="flex flex-wrap gap-2">
          {TIPOS_OPERACAO.map((t) => <li key={t}><Selo tom={habilitada.has(t) ? "sucesso" : "aviso"} ponto>{NOMES_DAS_OPERACOES[t]}: {habilitada.has(t) ? "liberada" : "aguardando homologação"}</Selo></li>)}
        </ul>
        {habilitada.size === 0 && (
          <p className="mt-3 text-sm text-suave">A Contel ainda não foi ligada: faltam as credenciais no servidor, o tipo da chave (P9) e o teste com uma linha autorizada. Até lá nada é enviado e nada aparece como feito.</p>
        )}
        {habilitada.size > 0 && semListas && <p className="mt-3 text-sm text-suave">Os planos da Contel ainda não foram carregados pelo servidor.</p>}
      </Cartao>

      {!opera.data && <Aviso tom="aviso">Seu papel não registra operações da Ora Connect nesta loja.</Aviso>}

      {opera.data && habilitada.has("ativacao") && !semListas && (
        <details className="rounded-cartao border border-borda bg-white p-4">
          <summary className="cursor-pointer font-semibold"><Smartphone aria-hidden className="mr-1 inline size-4" /> Ativar chip</summary>
          <p className="mt-2 text-xs text-suave">Chip do estoque: venda o chip no PDV antes. Os dados do cliente vão só para a Contel e saem do sistema depois do envio.</p>
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

      {opera.data && habilitada.has("recarga") && !semListas && (
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

      {opera.data && habilitada.has("portabilidade") && lista("operadora").length > 0 && (
        <details className="rounded-cartao border border-borda bg-white p-4">
          <summary className="cursor-pointer font-semibold"><ArrowLeftRight aria-hidden className="mr-1 inline size-4" /> Portabilidade</summary>
          <p className="mt-2 text-xs text-suave">O cliente aceita pelo SMS que chega na linha da outra operadora. A troca leva até 3 dias úteis depois do aceite.</p>
          <form action={registrarOperacao} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="tipo" value="portabilidade" /><input type="hidden" name="chave" value={randomUUID()} />
            <label className={rotulo}>Linha da Contel (com DDD)<input name="linha" required inputMode="tel" autoComplete="off" className={campo} /></label>
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

      <Cartao titulo={gere.data ? "Operações da loja" : "Minhas operações"} subtitulo="As 30 mais recentes">
        {operacoes.data.length === 0 ? <p className="text-sm text-suave">Nenhuma operação registrada.</p> : (
          <ul className="divide-y divide-borda">
            {operacoes.data.map((o) => {
              const s = ehSituacao(o.situacao) ? o.situacao : "registrada";
              const Icone = ICONES[o.tipo as TipoOperacao] ?? Zap;
              const evidencia = o.evidencia as { mensagem?: string; consultado_em?: string } | null;
              const decide = gere.data && o.vendedor_id !== usuario.id && (s === "resultado_desconhecido" || s === "erro_operadora");
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
                    {o.plano_nome ? ` · ${o.plano_nome}` : ""}{o.metodo_pagamento ? ` · ${o.metodo_pagamento}` : ""}
                    {o.cliente_nome ? ` · ${o.cliente_nome} (${o.documento_mascarado ?? ""})` : ""}
                  </p>
                  <p className="text-xs">{SITUACOES_OPERACAO[s].explicacao}</p>
                  {o.tipo === "recarga" && (
                    <p className="numeros text-xs text-suave">Valor de face {brl(centavosDoBanco(o.valor_face_centavos ?? 0))}
                      {o.recebido_na_loja_centavos !== null ? ` · recebido na loja ${brl(centavosDoBanco(o.recebido_na_loja_centavos))}` : " · pago direto à Contel"}
                      {o.valor_debitado_centavos !== null ? ` · debitado da carteira ${brl(centavosDoBanco(o.valor_debitado_centavos))}` : ""}</p>
                  )}
                  {o.numero_ativado && <p className="numeros text-xs">Número ativado: {o.numero_ativado}</p>}
                  {o.link_pagamento && s === "aguardando_operadora" && <p className="break-all text-xs">Link para o cliente pagar: <a className="text-acao underline" href={o.link_pagamento} rel="noreferrer noopener" target="_blank">{o.link_pagamento}</a></p>}
                  {o.link_esim && <p className="break-all text-xs">eSIM: <a className="text-acao underline" href={o.link_esim} rel="noreferrer noopener" target="_blank">abrir QR Code</a></p>}
                  {o.mensagem_operadora && <p className="text-xs text-suave">Contel: {o.mensagem_operadora}</p>}
                  {evidencia?.mensagem && <p className="text-xs text-suave">Última consulta{evidencia.consultado_em ? ` (${quando(evidencia.consultado_em)})` : ""}: {evidencia.mensagem}</p>}
                  {o.motivo_resolucao && <p className="text-xs text-suave">Motivo registrado: {o.motivo_resolucao}</p>}
                  {s === "registrada" && (o.vendedor_id === usuario.id || gere.data) && (
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
                          <option value="confirmada">Feita na Contel (conta na produção)</option>
                          <option value="nao_recebida">Não chegou à Contel</option>
                          <option value="recusada">Recusada pela Contel</option>
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

      {integra.data && (
        <Cartao titulo="Liberar operações (integrações)" subtitulo="Só depois de homologar com a Contel; a evidência fica na auditoria" icone={ShieldCheck}>
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
    </main>
  );
}

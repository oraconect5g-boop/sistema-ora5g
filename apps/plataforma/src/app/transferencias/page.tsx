import { randomUUID } from "node:crypto";

import { ArrowRightLeft } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../componentes/ui";
import { permite } from "../../lib/acesso/molde";
import { obterSessao } from "../../lib/acesso/sessao";
import { paginaDoEndereco } from "../../lib/estoque/conferencia";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import {
  divergenciaDaTransferencia, efeitoNoEstoque, ERROS_DA_TRANSFERENCIA, MOTIVO_MINIMO_DA_DIVERGENCIA, nomeDaDecisao, nomeDaSituacao, saldoDaLoja,
  textoDaDivergencia,
} from "../../lib/transferencias/regras";
import { consultarTelaDasTransferencias, type TransferenciaDaTela } from "../../lib/transferencias/tela";
import { encerrarTransferencia, enviarRemessa, enviarTransferencia, receberTransferencia, resolverDivergencia, separarTransferencia } from "./acoes";

export const metadata: Metadata = { title: "Transferências entre lojas" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const ABERTAS = new Set(["solicitada", "separada", "enviada"]);
const OK: Record<string, string> = {
  pedida: "Pedido registrado e reservado na origem: já saiu do disponível de lá.", separada: "Separado: os itens escolhidos seguem reservados na origem.",
  enviada: "Enviado: saiu do estoque da origem e está em trânsito.", recebida: "Recebido e conferido.",
  recusada: "Pedido recusado; a reserva voltou ao disponível.", cancelada: "Pedido cancelado; a reserva voltou ao disponível.",
  remessa: "Remessa pedida e reservada na origem, produto por produto.",
  divergencia: "Registrado: o que faltou teve destino, e o estoque foi acertado pelo livro.",
  remessa_enviada: "Remessa enviada: o que já estava separado saiu do estoque desta loja; o resto espera a separação.",
};

// Pedidos internos de transferência (ADR-007, #60): os que saem e os que chegam na loja do turno.
// Lido pelo RLS (lojas envolvidas); cada passo é uma função do banco.
// TRF-f (o achado F24-01 do Codex, 24/11): as em andamento sempre aparecem, com páginas próprias, antes do histórico (que
// também tem páginas); a busca pelo número acha uma transferência que não esteja na página. Antes, as 50 mais novas de
// tudo escondiam a pedida antiga atrás das canceladas depois dela.
type Parametros = { ok?: ValorDeParametro; erro?: ValorDeParametro; abertas?: ValorDeParametro; historico?: ValorDeParametro; numero?: ValorDeParametro };
export default async function Transferencias({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const numeroDigitado = (textoDoParametro(parametros.numero) ?? "").trim();
  const numero = /^\d{1,12}$/.test(numeroDigitado) ? Number(numeroDigitado) : null;
  const erro = chaveDoCatalogo(ERROS_DA_TRANSFERENCIA, parametros.erro);
  const ok = textoDoParametro(parametros.ok);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const transfere = permite(sessao, "estoque.transferir");
  const ajusta = permite(sessao, "estoque.ajustar");
  // VEL-g (ADR-010): a lista e tudo o que a tela mostra dela numa ida ao banco (lib/transferencias/tela.ts): os produtos,
  // as lojas, os aparelhos separados, as remessas, o saldo de agora de cada lado (o que a pessoa vê pela RLS) e os
  // aparelhos livres na loja do turno para os pedidos de aparelho e chip que ela tem a separar.
  const tela = await consultarTelaDasTransferencias(supabase, unidade, {
    paginaAbertas: paginaDoEndereco(textoDoParametro(parametros.abertas)), pagina: paginaDoEndereco(textoDoParametro(parametros.historico)), numero,
  });
  const lista = { data: tela.transferencias };
  const { contas } = tela;
  const enderecoDaPagina = (mudar: { abertas?: number; historico?: number }) => {
    const p = new URLSearchParams();
    const abertas = mudar.abertas ?? contas.paginaAbertas;
    const historico = mudar.historico ?? contas.pagina;
    if (abertas > 1) p.set("abertas", String(abertas));
    if (historico > 1) p.set("historico", String(historico));
    return p.size ? `/transferencias?${p}` : "/transferencias";
  };
  type Navegacao = { rotulo: string; atual: number; total: number; anterior: string; proxima: string };
  const secoes: { chave: string; titulo: string; itens: TransferenciaDaTela[]; vazia: string | null; nav: Navegacao | null }[] = numero !== null
    ? [{ chave: "numero", titulo: `Transferência Nº ${numero}`, itens: lista.data,
        vazia: lista.data.length === 0 ? `Nenhuma transferência Nº ${numero} saindo ou chegando nesta loja.` : null, nav: null }]
    : [
        { chave: "abertas", titulo: `Em andamento (${contas.abertas})`, itens: lista.data.filter((t) => t.aberta),
          vazia: contas.abertas === 0 ? "Nada em andamento: nenhum pedido esperando separar, enviar, receber ou resolver." : null,
          nav: contas.paginasAbertas > 1 ? { rotulo: "Páginas das em andamento", atual: contas.paginaAbertas, total: contas.paginasAbertas,
            anterior: enderecoDaPagina({ abertas: contas.paginaAbertas - 1 }), proxima: enderecoDaPagina({ abertas: contas.paginaAbertas + 1 }) } : null },
        { chave: "historico", titulo: `Histórico (${contas.historico})`, itens: lista.data.filter((t) => !t.aberta),
          vazia: contas.historico === 0 ? "Nenhuma transferência encerrada ainda." : null,
          nav: contas.paginas > 1 ? { rotulo: "Páginas do histórico", atual: contas.pagina, total: contas.paginas,
            anterior: enderecoDaPagina({ historico: contas.pagina - 1 }), proxima: enderecoDaPagina({ historico: contas.pagina + 1 }) } : null },
      ];
  const saldoAgora = (loja: string, varianteId: string) => {
    const s = saldoDaLoja(tela.saldos, loja, varianteId);
    return s ? `físico ${s.fisico} · reservado ${s.reservado} · disponível ${s.disponivel}` : null;
  };
  const remessa = (id: string | null) => (id ? tela.remessas.find((r) => r.id === id) : undefined);
  // Remessas que saem desta loja com transferência já separada: a origem envia todas de uma vez.
  const remessasParaEnviar = tela.remessas.filter((r) => r.origem_id === unidade)
    .map((r) => ({ ...r, separadas: lista.data.filter((t) => t.remessa_id === r.id && t.situacao === "separada").length }))
    .filter((r) => r.separadas > 0);
  const variante = (id: string) => tela.variantes.find((v) => v.id === id);
  const serializado = (id: string) => { const tipo = variante(id)?.tipo; return tipo === "aparelho" || tipo === "chip"; };
  const local = (id: string) => tela.unidades.find((u) => u.id === id);
  const disponiveis = { data: tela.disponiveis };
  const itensDasTransferencias = { data: tela.itens };
  const podeNaOrigem = (origem: string) => (local(origem)?.tipo === "excecao" ? ajusta : transfere);
  const final = (n: string | null) => (n ? `…${n.slice(-6)}` : "");

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Transferências" />
      <p className="text-sm text-suave">Para pedir, abra o produto no estoque e toque em &quot;na rede&quot;. Aqui a loja de origem separa e envia, e a de destino recebe e confere.</p>
      {/* F24-04: os passos são etapas diferentes, cada uma com o seu efeito no estoque. */}
      <p className="mt-1 text-xs text-suave">Os passos: <strong>pedir</strong> (reserva na origem: sai do disponível de lá) → <strong>separar</strong> → <strong>enviar</strong> (sai do físico da origem e fica em trânsito) → <strong>receber</strong> (entra no destino, uma vez só).</p>
      <p className="mt-2 text-sm"><Link href="/transferencias/remessa" className="font-semibold text-acao">Pedir vários produtos de uma vez (nova remessa)</Link></p>
      {ok && Object.hasOwn(OK, ok) && <Aviso tom="sucesso">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo">{ERROS_DA_TRANSFERENCIA[erro]}</Aviso>}
      <Form action="/transferencias" prefetch={false} className="mt-3 flex flex-wrap items-end gap-2" role="search">
        <label className="text-sm font-medium">Achar pelo número<input key={numero ?? ""} name="numero" inputMode="numeric" pattern="[0-9]{1,12}" defaultValue={numero ?? ""} autoComplete="off" className={`${campo} w-40`} /></label>
        <Botao type="submit" tamanho="sm" variante="secundario">Achar</Botao>
        {numero !== null && <Link href="/transferencias" className="inline-flex min-h-11 items-center text-sm font-semibold text-acao">Ver todas</Link>}
      </Form>
      {remessasParaEnviar.map((r) => (
        <form key={r.id} action={enviarRemessa} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borda bg-white px-4 py-3">
          <input type="hidden" name="remessa" value={r.id} />
          <span className="text-sm"><span className="font-semibold">Remessa Nº {r.numero}</span>: {r.separadas} {r.separadas === 1 ? "produto separado" : "produtos separados"}, prontos para sair</span>
          <Botao type="submit" tamanho="sm">Enviar os separados da remessa</Botao>
        </form>
      ))}
      {secoes.map((s) => (
        // Cada parte é um bloco com o seu título; o cartão de cada transferência continua sendo a única "section" dela (a
        // prova de leitura no site acha o cartão pela section que tem o título com o número).
        <div key={s.chave} className="mt-5">
          <h2 id={`secao-${s.chave}`} className="text-base font-semibold">{s.titulo}</h2>
          {s.vazia && <p className="mt-1 text-sm text-suave">{s.vazia}</p>}
          {s.itens.map((t) => {
        const v = variante(t.variante_id);
        const saindo = t.origem_id === unidade;
        const itens = itensDasTransferencias.data.filter((i) => i.transferencia_id === t.id);
        // TRF-d: o que faltou no recebimento, o destino que cada parte já teve e o que ainda falta resolver.
        const divergencia = divergenciaDaTransferencia(t, tela.resolucoes);
        const resolucoesDela = tela.resolucoes.filter((r) => r.transferencia_id === t.id);
        return (
          <Cartao key={t.id} titulo={`${remessa(t.remessa_id) ? `Remessa Nº ${remessa(t.remessa_id)?.numero} · ` : ""}Nº ${t.numero} · ${v?.nome ?? "Produto"} × ${t.quantidade}`} subtitulo={`${local(t.origem_id)?.nome ?? "origem"} → ${local(t.destino_id)?.nome ?? "destino"} · ${saindo ? "saindo daqui" : "chegando aqui"}`} icone={ArrowRightLeft}>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Selo tom={t.situacao === "recebida" ? "sucesso" : t.situacao === "recebida_com_divergencia" ? "aviso" : ABERTAS.has(t.situacao) ? "info" : "neutro"} ponto>{nomeDaSituacao(t.situacao)}</Selo>
              {local(t.destino_id)?.tipo === "excecao" && <Selo tom="aviso">para DEFEITOS</Selo>}
              <span className="text-xs text-suave">Motivo: {t.motivo}</span>
            </p>
            {t.quantidade_recebida !== null && t.quantidade_recebida < t.quantidade && <p className="mt-1 text-xs text-aviso">Recebidos {t.quantidade_recebida} de {t.quantidade}: {t.observacao}</p>}
            {itens.length > 0 && <p className="numeros mt-1 text-xs text-suave">{itens.length} IMEI/ICCID separado(s){itens.some((i) => i.recebido === false) ? " · algum não chegou" : ""}</p>}
            {efeitoNoEstoque(t.situacao) && <p className="mt-1 text-xs">{efeitoNoEstoque(t.situacao)}</p>}
            {divergencia && (
              <div className="mt-2 rounded-lg border border-borda p-3 text-sm">
                <p className="font-semibold">{textoDaDivergencia(divergencia)}</p>
                {resolucoesDela.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-suave">
                    {resolucoesDela.map((r, i) => (
                      <li key={`${r.criado_em}-${r.item_serializado_id ?? i}`}>{`${r.quantidade} · ${nomeDaDecisao(r.decisao)}: ${r.motivo}`}</li>
                    ))}
                  </ul>
                )}
                {divergencia.pendentes > 0 && !saindo && transfere && (
                  <details className="mt-2"><summary className="cursor-pointer font-semibold text-acao">Chegou depois nesta loja</summary>
                    <form action={resolverDivergencia} className="mt-2 grid gap-2">
                      <input type="hidden" name="transferencia" value={t.id} /><input type="hidden" name="decisao" value="chegou_depois" />
                      <input type="hidden" name="serializado" value={serializado(t.variante_id) ? "sim" : "nao"} /><input type="hidden" name="chave" value={randomUUID()} />
                      {serializado(t.variante_id)
                        ? <label className="text-xs font-medium">IMEI/ICCID lidos nos itens que chegaram (um por linha)<textarea name="identificadores" rows={2} inputMode="numeric" required className={`${campo} py-2`} /></label>
                        : <label className="text-xs font-medium">{`Quantas chegaram (até ${divergencia.pendentes})`}<input name="quantidade" inputMode="numeric" defaultValue={String(divergencia.pendentes)} required className={campo} /></label>}
                      <label className="text-xs font-medium">O que houve<input name="motivo" required minLength={MOTIVO_MINIMO_DA_DIVERGENCIA} maxLength={500} className={campo} /></label>
                      <div><Botao type="submit" tamanho="sm">Dar a entrada do que chegou</Botao></div>
                    </form>
                  </details>
                )}
                {divergencia.pendentes > 0 && saindo && podeNaOrigem(t.origem_id) && (
                  <details className="mt-2"><summary className="cursor-pointer font-semibold text-acao">Voltou para esta loja</summary>
                    <form action={resolverDivergencia} className="mt-2 grid gap-2">
                      <input type="hidden" name="transferencia" value={t.id} /><input type="hidden" name="decisao" value="voltou_a_origem" />
                      <input type="hidden" name="serializado" value={serializado(t.variante_id) ? "sim" : "nao"} /><input type="hidden" name="chave" value={randomUUID()} />
                      {serializado(t.variante_id)
                        ? <label className="text-xs font-medium">IMEI/ICCID lidos nos itens que estão aqui (um por linha)<textarea name="identificadores" rows={2} inputMode="numeric" required className={`${campo} py-2`} /></label>
                        : <label className="text-xs font-medium">{`Quantas estão aqui (até ${divergencia.pendentes})`}<input name="quantidade" inputMode="numeric" defaultValue={String(divergencia.pendentes)} required className={campo} /></label>}
                      <label className="text-xs font-medium">O que houve<input name="motivo" required minLength={MOTIVO_MINIMO_DA_DIVERGENCIA} maxLength={500} className={campo} /></label>
                      <div><Botao type="submit" tamanho="sm">Dar a entrada de volta</Botao></div>
                    </form>
                  </details>
                )}
                {divergencia.pendentes > 0 && saindo && ajusta && (
                  <details className="mt-2"><summary className="cursor-pointer font-semibold text-perigo">Dar baixa no que não apareceu</summary>
                    <form action={resolverDivergencia} className="mt-2 grid gap-2">
                      <input type="hidden" name="transferencia" value={t.id} /><input type="hidden" name="decisao" value="baixada" />
                      <input type="hidden" name="serializado" value={serializado(t.variante_id) ? "sim" : "nao"} /><input type="hidden" name="chave" value={randomUUID()} />
                      <p className="text-xs text-suave">{`A baixa vale para tudo o que ainda falta (${divergencia.pendentes}). No estoque desta loja ficam registradas a volta e a perda, com o seu nome e o motivo.`}</p>
                      <label className="text-xs font-medium">Motivo da baixa<input name="motivo" required minLength={MOTIVO_MINIMO_DA_DIVERGENCIA} maxLength={500} className={campo} /></label>
                      <div><Botao type="submit" tamanho="sm" variante="perigo">Confirmar a baixa</Botao></div>
                    </form>
                  </details>
                )}
                {divergencia.pendentes > 0 && (
                  <p className="mt-2 text-xs text-suave">Quem resolve: a loja de destino, se chegou depois; a de origem, se voltou para ela; e quem ajusta estoque na origem dá a baixa do que não apareceu.</p>
                )}
              </div>
            )}
            {(saldoAgora(t.origem_id, t.variante_id) || saldoAgora(t.destino_id, t.variante_id)) && (
              <p className="numeros mt-1 text-xs text-suave">
                {[saldoAgora(t.origem_id, t.variante_id) && `Agora na origem (${local(t.origem_id)?.nome ?? "origem"}): ${saldoAgora(t.origem_id, t.variante_id)}`,
                  saldoAgora(t.destino_id, t.variante_id) && `no destino (${local(t.destino_id)?.nome ?? "destino"}): ${saldoAgora(t.destino_id, t.variante_id)}`].filter(Boolean).join(" · ")}
              </p>
            )}

            {t.situacao === "solicitada" && saindo && podeNaOrigem(t.origem_id) && (
              <form action={separarTransferencia} className="mt-3 space-y-2">
                <input type="hidden" name="transferencia" value={t.id} />
                {serializado(t.variante_id) ? (
                  <fieldset className="space-y-1 text-sm"><legend className="text-xs font-medium">Escolha {t.quantidade} IMEI/ICCID desta loja</legend>
                    {disponiveis.data.filter((d) => d.variante_id === t.variante_id).map((d) => (
                      <label key={d.id} className="numeros flex min-h-11 items-center gap-2"><input type="checkbox" name="item" value={d.id} className="size-5" /> {d.imei ? `IMEI ${d.imei}` : `ICCID ${final(d.iccid)}`}</label>
                    ))}
                    {disponiveis.data.every((d) => d.variante_id !== t.variante_id) && <p className="text-xs text-perigo">Nenhum disponível nesta loja agora.</p>}
                  </fieldset>
                ) : <p className="text-xs text-suave">As {t.quantidade} unidade(s) já estão reservadas desde o pedido: separar confirma que estão prontas para enviar.</p>}
                <Botao type="submit" tamanho="sm">Separar</Botao>
              </form>
            )}
            {t.situacao === "separada" && saindo && podeNaOrigem(t.origem_id) && (
              <form action={enviarTransferencia} className="mt-3"><input type="hidden" name="transferencia" value={t.id} /><Botao type="submit" tamanho="sm">Enviar (sai do estoque desta loja)</Botao></form>
            )}
            {t.situacao === "enviada" && !saindo && transfere && (
              <form action={receberTransferencia} className="mt-3 grid gap-2">
                <input type="hidden" name="transferencia" value={t.id} /><input type="hidden" name="serializado" value={serializado(t.variante_id) ? "sim" : "nao"} />
                {serializado(t.variante_id)
                  ? <label className="text-xs font-medium">IMEI/ICCID lidos nos itens que chegaram (um por linha)<textarea name="identificadores" rows={3} inputMode="numeric" className={`${campo} py-2`} /></label>
                  : <label className="text-xs font-medium">Quantidade contada<input name="quantidade" inputMode="numeric" defaultValue={String(t.quantidade)} required className={campo} /></label>}
                <label className="text-xs font-medium">Observação (obrigatória se faltar item)<input name="observacao" maxLength={500} className={campo} /></label>
                <div><Botao type="submit" tamanho="sm">Receber e conferir</Botao></div>
              </form>
            )}
            {(t.situacao === "solicitada" || t.situacao === "separada") && (t.solicitado_por === usuario.id || (saindo && podeNaOrigem(t.origem_id))) && (
              <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-perigo">{saindo && t.situacao === "solicitada" ? "Recusar ou cancelar" : "Cancelar"}</summary>
                <form action={encerrarTransferencia} className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="transferencia" value={t.id} /><input type="hidden" name="chave" value={randomUUID()} />
                  <label className="text-xs font-medium">O quê<select name="situacao" className={campo} defaultValue="cancelada">
                    <option value="cancelada">Cancelar</option>{saindo && t.situacao === "solicitada" && <option value="recusada">Recusar (origem)</option>}
                  </select></label>
                  <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
                  <div><Botao type="submit" tamanho="sm" variante="perigo">Confirmar</Botao></div>
                </form>
              </details>
            )}
          </Cartao>
        );
          })}
          {s.nav && (
            <nav aria-label={s.nav.rotulo} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              {s.nav.atual > 1 ? <Link href={s.nav.anterior} className="rounded-botao px-3 py-2 font-semibold text-acao ring-1 ring-borda">Anteriores</Link> : <span />}
              <span className="text-suave">{`Página ${s.nav.atual} de ${s.nav.total}`}</span>
              {s.nav.atual < s.nav.total ? <Link href={s.nav.proxima} className="rounded-botao px-3 py-2 font-semibold text-acao ring-1 ring-borda">Próximas</Link> : <span />}
            </nav>
          )}
        </div>
      ))}
    </MoldeReal>
  );
}

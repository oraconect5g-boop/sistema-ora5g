import { ArrowLeft, CalendarClock, History, Megaphone, ShieldAlert, Store, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { CANAIS, ERROS_DE_PRECO, acaoPossivel, situacaoDoPreco, type LinhaDePreco } from "../../../lib/catalogo/precos";
import { centavosDoBanco } from "../../../lib/dinheiro";
import { brl } from "../../../lib/formato";
import { isoParaHoraDeSaoPaulo } from "../../../lib/lojas/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { cancelarPreco, criarCampanha, definirPreco } from "./acoes";

export const metadata: Metadata = { title: "Preços da variação" };
export const dynamic = "force-dynamic";

const OK = {
  definido: "Preço novo gravado: vale a partir de agora nas próximas vendas.",
  agendado: "Mudança de preço agendada: vale a partir da data escolhida.",
  sem_mudanca: "Nada mudou: o preço já era esse.",
  campanha: "Campanha gravada: no período, vale acima do preço da loja e do geral.",
  campanha_repetida: "Esta campanha já estava gravada: nada foi duplicado.",
  cancelado: "Cancelado: o preço anterior continua valendo.",
  encerrado: "Campanha encerrada agora: o preço normal volta a valer.",
  ja_cancelado: "Este preço já estava cancelado.",
} as const;
const SITUACAO = {
  vigente: { texto: "vale agora", tom: "sucesso" },
  agendado: { texto: "agendado", tom: "info" },
  encerrado: { texto: "encerrado", tom: "neutro" },
  cancelado: { texto: "cancelado", tom: "perigo" },
} as const;
const ORIGEM: Record<string, string> = { manual: "preço definido", importacao: "importação", campanha: "campanha" };

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const rotulo = "block text-sm font-medium";
const quando = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "") : "—";

type PorLoja = { unidade_id: string; unidade: string; valor_centavos: number | string | null; origem: string | null; de_loja: boolean | null; fim: string | null };

function Alcance({ lojas }: { lojas: { id: string; nome: string }[] }) {
  return (
    <>
      <label className={rotulo}>Onde vale
        <select name="unidade" className={campo} defaultValue="rede">
          <option value="rede">Rede inteira (preço geral)</option>
          {lojas.map((l) => <option key={l.id} value={l.id}>Só na loja {l.nome}</option>)}
        </select>
      </label>
      <label className={rotulo}>Canal
        <select name="canal" className={campo} defaultValue="loja">{Object.entries(CANAIS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
      </label>
    </>
  );
}

// Preços de uma variação (lote L3b: ORA-CAT-004, ORA-CAT-007): o que vale agora em cada loja e por
// quê, mudança agendada, campanha com início e fim e o histórico inteiro, sem apagar nada.
export default async function PrecosDaVariante({ searchParams }: {
  searchParams: Promise<{ variante?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro; form?: ValorDeParametro }>;
}) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DE_PRECO, parametros.erro);
  const variante = ehUuid(parametros.variante) ? parametros.variante : null;
  const form = textoDoParametro(parametros.form);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;

  const [gerir, alterar] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "catalogo.gerir" }),
    supabase.rpc("tem_permissao", { p_permissao: "preco.alterar" }),
  ]);
  if (gerir.error || alterar.error) throw new FalhaDoServico("tem_permissao");
  if (!gerir.data && !alterar.data) {
    return (
      <MoldeReal sessao={sessao}>
        <Cartao titulo="Sem permissão" icone={ShieldAlert}>
          <p className="text-sm text-suave">Os preços são definidos por quem altera preços. Para ver o preço de um produto na venda, use <Link href="/vender" className="font-semibold text-acao">Vender</Link>.</p>
        </Cartao>
      </MoldeReal>
    );
  }
  const dadosDaVariante = variante
    ? await supabase.from("variantes").select("id, sku, nome, produto_id, produtos(nome)").eq("id", variante).maybeSingle()
    : { data: null, error: null };
  if (dadosDaVariante.error) throw new FalhaDoServico("variantes");
  if (!variante || !dadosDaVariante.data) {
    return (
      <MoldeReal sessao={sessao}>
        <Cartao titulo="Escolha uma variação" icone={Tag}>
          <p className="text-sm text-suave">Abra os preços pelo <Link href="/produtos" className="font-semibold text-acao">Cadastro de produtos</Link>, no botão "Preços" de cada variação.</p>
        </Cartao>
      </MoldeReal>
    );
  }
  const v = dadosDaVariante.data as unknown as { id: string; sku: string; nome: string; produto_id: string; produtos: { nome: string } | null };

  const [naLoja, online, historico] = await Promise.all([
    supabase.rpc("precos_por_loja", { p_variante: variante, p_canal: "loja" }),
    supabase.rpc("precos_por_loja", { p_variante: variante, p_canal: "online" }),
    supabase.from("precos").select("id, unidade_id, canal, valor_centavos, inicio, fim, origem, motivo, criado_em, cancelado_em, motivo_cancelamento")
      .eq("variante_id", variante).order("inicio", { ascending: false }).limit(200),
  ]);
  if (naLoja.error || online.error || historico.error) throw new FalhaDoServico("precos");
  const lojas = (naLoja.data as PorLoja[]).map((l) => ({ id: l.unidade_id, nome: l.unidade }));
  const nomeDaLoja = (id: string | null) => (id ? lojas.find((l) => l.id === id)?.nome ?? "loja" : "rede inteira");
  const linhas = (historico.data as unknown as (LinhaDePreco & { motivo: string | null; motivo_cancelamento: string | null })[])
    .map((l) => ({ ...l, valor_centavos: centavosDoBanco(l.valor_centavos) }));
  const agora = new Date();
  const pendentes = linhas.filter((l) => acaoPossivel(l, agora));
  const minimo = isoParaHoraDeSaoPaulo(agora.toISOString());
  const descreve = (p: PorLoja) => {
    if (p.valor_centavos === null) return <span className="text-aviso">sem preço</span>;
    const origem = p.origem === "campanha" ? `campanha até ${quando(p.fim)}` : p.de_loja ? "preço desta loja" : "preço da rede";
    return <><strong className="numeros">{brl(centavosDoBanco(p.valor_centavos))}</strong> <span className="text-xs text-suave">· {origem}</span></>;
  };

  return (
    <MoldeReal sessao={sessao}>
      <Link href={`/produtos?q=${encodeURIComponent(v.sku)}#produto-${v.produto_id}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Cadastro de produtos</Link>
      <TituloPagina titulo={`Preços · ${v.nome}`} subtitulo={<>SKU <span className="numeros">{v.sku}</span> · {v.produtos?.nome ?? ""}. A venda guarda o preço do momento: mudar aqui nunca altera venda já feita.</>} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DE_PRECO[erro]}</Aviso>}

      <Cartao className="mt-4" titulo="Vale agora em cada loja" icone={Store}>
        <ul className="divide-y divide-borda text-sm">
          {(naLoja.data as PorLoja[]).map((p) => {
            const naInternet = (online.data as PorLoja[]).find((o) => o.unidade_id === p.unidade_id);
            return (
              <li key={p.unidade_id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-medium">{p.unidade}</span>
                <span className="text-right">{descreve(p)}{naInternet && naInternet.valor_centavos !== null && <span className="block text-xs text-suave">online: {brl(centavosDoBanco(naInternet.valor_centavos))}</span>}</span>
              </li>
            );
          })}
          {lojas.length === 0 && <li className="py-2 text-suave">Nenhuma loja ativa visível.</li>}
        </ul>
      </Cartao>

      {alterar.data ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <details className="rounded-cartao border border-borda/80 bg-superficie p-4 shadow-cartao" open={form === "preco" || linhas.length === 0}>
            <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-semibold"><Tag aria-hidden className="size-4 text-acao" /> Mudar preço</summary>
            <form action={definirPreco} className="mt-3 grid gap-3">
              <input type="hidden" name="variante" value={v.id} />
              <Alcance lojas={lojas} />
              <label className={rotulo}>Preço (R$)<input name="valor" required inputMode="decimal" placeholder="1.299,90" className={campo} /></label>
              <fieldset className="space-y-2 text-sm">
                <legend className="font-medium">Vale a partir de</legend>
                <label className="flex min-h-10 items-center gap-2"><input type="radio" name="quando" value="agora" defaultChecked className="size-4 accent-acao" /> agora</label>
                <label className="flex flex-wrap items-center gap-2"><input type="radio" name="quando" value="data" className="size-4 accent-acao" /> data futura:
                  <input type="datetime-local" name="inicio" min={minimo} className="min-h-10 rounded-botao border border-borda px-2" />
                </label>
              </fieldset>
              <label className={rotulo}>Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={200} placeholder="Reajuste do fornecedor" className={campo} /></label>
              <Botao type="submit">Gravar preço</Botao>
            </form>
          </details>

          <details className="rounded-cartao border border-borda/80 bg-superficie p-4 shadow-cartao" open={form === "campanha"}>
            <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-semibold"><Megaphone aria-hidden className="size-4 text-acao" /> Campanha com início e fim</summary>
            <form action={criarCampanha} className="mt-3 grid gap-3">
              <input type="hidden" name="variante" value={v.id} />
              <Alcance lojas={lojas} />
              <label className={rotulo}>Preço da campanha (R$)<input name="valor" required inputMode="decimal" placeholder="1.199,90" className={campo} /></label>
              <fieldset className="space-y-2 text-sm">
                <legend className="font-medium">Começa</legend>
                <label className="flex min-h-10 items-center gap-2"><input type="radio" name="quando" value="agora" defaultChecked className="size-4 accent-acao" /> agora</label>
                <label className="flex flex-wrap items-center gap-2"><input type="radio" name="quando" value="data" className="size-4 accent-acao" /> em:
                  <input type="datetime-local" name="inicio" min={minimo} className="min-h-10 rounded-botao border border-borda px-2" />
                </label>
              </fieldset>
              <label className={rotulo}>Termina em<input type="datetime-local" name="fim" required min={minimo} className={campo} /></label>
              <label className={rotulo}>Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={200} placeholder="Black Friday" className={campo} /></label>
              <Botao type="submit">Gravar campanha</Botao>
            </form>
          </details>
        </div>
      ) : (
        <Aviso tom="info" className="mt-4">Só quem altera preços (hoje, o dono) muda preço e campanha. Aqui você vê o que vale e o histórico.</Aviso>
      )}

      {pendentes.length > 0 && (
        <Cartao className="mt-4" titulo="Agendados e campanhas em curso" icone={CalendarClock}>
          <ul className="divide-y divide-borda text-sm">
            {pendentes.map((l) => {
              const acao = acaoPossivel(l, agora);
              return (
                <li key={l.id} className="space-y-1 py-2">
                  <p className="flex flex-wrap items-center gap-2"><strong className="numeros">{brl(l.valor_centavos)}</strong> {ORIGEM[l.origem] ?? l.origem} · {nomeDaLoja(l.unidade_id)} · {CANAIS[l.canal as keyof typeof CANAIS] ?? l.canal}</p>
                  <p className="text-xs text-suave">de {quando(l.inicio)}{l.fim ? ` até ${quando(l.fim)}` : " em diante"}{l.motivo ? ` · ${l.motivo}` : ""}</p>
                  {alterar.data && acao && (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-perigo">{acao === "cancelar" ? "Cancelar (ainda não começou)" : "Encerrar a campanha agora"}</summary>
                      <form action={cancelarPreco} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input type="hidden" name="preco" value={l.id} /><input type="hidden" name="variante" value={v.id} />
                        <input name="motivo" required minLength={3} maxLength={200} placeholder="Motivo" aria-label="Motivo" className={campo} />
                        <Botao type="submit" tamanho="sm" variante="perigo" className="self-end">{acao === "cancelar" ? "Cancelar" : "Encerrar"}</Botao>
                      </form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      <Cartao className="mt-4" titulo="Histórico de preços" subtitulo="Nada é apagado: o preço de qualquer dia continua consultável." icone={History}>
        <ul className="divide-y divide-borda text-sm">
          {linhas.map((l) => {
            const s = situacaoDoPreco(l, agora);
            return (
              <li key={l.id} className="py-2">
                <p className="flex flex-wrap items-center gap-2"><strong className="numeros">{brl(l.valor_centavos)}</strong><Selo tom={SITUACAO[s].tom}>{SITUACAO[s].texto}</Selo><span className="text-xs text-suave">{ORIGEM[l.origem] ?? l.origem} · {nomeDaLoja(l.unidade_id)} · {CANAIS[l.canal as keyof typeof CANAIS] ?? l.canal}</span></p>
                <p className="text-xs text-suave">de {quando(l.inicio)}{l.fim ? ` até ${quando(l.fim)}` : ""}{l.motivo ? ` · ${l.motivo}` : ""}{l.cancelado_em ? ` · cancelado em ${quando(l.cancelado_em)}: ${l.motivo_cancelamento ?? ""}` : ""}</p>
              </li>
            );
          })}
          {linhas.length === 0 && <li className="py-2 text-suave">Sem preço cadastrado: a variação não aparece para venda até ter preço.</li>}
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

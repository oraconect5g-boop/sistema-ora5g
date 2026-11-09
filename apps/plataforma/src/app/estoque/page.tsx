import { Boxes, CheckCircle2, ClipboardCheck, History, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Marca } from "../../componentes/Marca";
import { Aviso, Botao, Cartao, Selo } from "../../componentes/ui";
import { ehUuid } from "../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { ERROS_DO_ESTOQUE, identificadorDigitado, inicioDoDiaEmSaoPaulo, nomeDe, NOMES_DAS_SITUACOES, NOMES_DOS_MOVIMENTOS } from "../../lib/estoque/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { FotoAmpliavel } from "../catalogo/FotoAmpliavel";
import { conferirItem, conferirPorIdentificador } from "./acoes";

export const metadata: Metadata = { title: "Estoque" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (data: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(data));
const final = (t: string | null) => (t ? t : "—");

// Estoque real da loja do turno (ORA-INV-001/004): saldo por produto, busca por IMEI/ICCID com o
// histórico do livro, disponibilidade na rede e conferência física do dia. Só leitura pelo RLS;
// a conferência é gravada e auditada pelo banco (conferir_item). Custo não aparece aqui.
export default async function Estoque({ searchParams }: { searchParams: Promise<{ q?: ValorDeParametro; aba?: ValorDeParametro; variante?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DO_ESTOQUE, parametros.erro);
  const conferencia = textoDoParametro(parametros.aba) === "conferencia";
  const busca = (textoDoParametro(parametros.q) ?? "").replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 40);
  const identificador = identificadorDigitado(busca);
  const varianteNaRede = textoDoParametro(parametros.variante);
  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  const unidade = situacao.unidade_id as string;

  const [consulta, confere] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "estoque.consultar", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "estoque.conferir", p_unidade: unidade }),
  ]);
  if (consulta.error || confere.error) throw new FalhaDoServico("estoque");
  const cabecalho = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Marca tamanho="text-2xl" />
      <nav className="flex gap-3 text-sm font-semibold text-acao"><Link href="/vender">Vender</Link><Link href="/catalogo">Catálogo</Link><Link href="/inicio">Início</Link></nav>
    </div>
  );
  if (!consulta.data) {
    return <main className="mx-auto max-w-3xl px-4 py-8">{cabecalho}<Aviso tom="aviso" className="mt-6">Seu papel não consulta estoque nesta loja.</Aviso></main>;
  }

  const abas = (
    <nav aria-label="Seções do estoque" className="flex gap-2 text-sm">
      <Link href="/estoque" aria-current={!conferencia ? "page" : undefined} className={`rounded-botao px-3 py-2 font-semibold ${!conferencia ? "bg-acao text-white" : "bg-white text-acao ring-1 ring-borda"}`}>Saldo e busca</Link>
      <Link href="/estoque?aba=conferencia" aria-current={conferencia ? "page" : undefined} className={`rounded-botao px-3 py-2 font-semibold ${conferencia ? "bg-acao text-white" : "bg-white text-acao ring-1 ring-borda"}`}>Conferência do dia</Link>
    </nav>
  );

  if (conferencia) {
    const desde = inicioDoDiaEmSaoPaulo();
    const itens = await supabase.from("itens_serializados").select("id, variante_id, imei, iccid, situacao, conferido_em")
      .eq("unidade_id", unidade).eq("em_estoque", true).order("variante_id").limit(500);
    if (itens.error) throw new FalhaDoServico("estoque_conferencia");
    const variantes = itens.data.length ? await supabase.from("variantes").select("id, nome, sku").in("id", [...new Set(itens.data.map((i) => i.variante_id))]) : { data: [], error: null };
    if (variantes.error) throw new FalhaDoServico("estoque_variantes");
    const conferidosHoje = itens.data.filter((i) => i.conferido_em && i.conferido_em >= desde).length;
    const pendentes = itens.data.filter((i) => !(i.conferido_em && i.conferido_em >= desde));
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        {cabecalho}
        <h1 className="text-2xl font-bold tracking-tight">Estoque · {situacao.unidade_nome}</h1>
        {abas}
        {erro && <Aviso tom="perigo">{ERROS_DO_ESTOQUE[erro]}</Aviso>}
        {textoDoParametro(parametros.ok) === "conferido" && <Aviso tom="sucesso"><CheckCircle2 aria-hidden className="inline size-4" /> Item conferido (gravado na auditoria).</Aviso>}
        <Cartao titulo="Conferência física de hoje" subtitulo={`${conferidosHoje} de ${itens.data.length} aparelhos e chips conferidos`} icone={ClipboardCheck}>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={itens.data.length} aria-valuenow={conferidosHoje} aria-label="Conferidos hoje">
            <div className="h-full bg-acao" style={{ width: `${itens.data.length ? Math.round((conferidosHoje / itens.data.length) * 100) : 0}%` }} />
          </div>
          {confere.data ? (
            <form action={conferirPorIdentificador} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-sm font-medium">IMEI ou ICCID do item na mão<input name="identificador" inputMode="numeric" autoComplete="off" required className={campo} /></label>
              <Botao type="submit">Conferir</Botao>
            </form>
          ) : <p className="mt-3 text-sm text-suave">Seu papel consulta, mas não confere.</p>}
        </Cartao>
        <Cartao titulo="Ainda não conferidos hoje" subtitulo={pendentes.length ? `${pendentes.length} item(ns)` : "Tudo conferido"}>
          {pendentes.length === 0 ? <p className="text-sm text-suave">Nenhum pendente.</p> : (
            <ul className="divide-y divide-borda text-sm">
              {pendentes.map((i) => {
                const v = variantes.data.find((x) => x.id === i.variante_id);
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{v?.nome ?? "—"}<span className="numeros block text-xs text-suave">{v?.sku} · {i.imei ? `IMEI ${i.imei}` : `ICCID ${final(i.iccid)}`}{i.situacao === "reservado" ? " · numa venda" : ""}</span></span>
                    {confere.data && <form action={conferirItem}><input type="hidden" name="item" value={i.id} /><Botao type="submit" tamanho="sm" variante="secundario">Conferido</Botao></form>}
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </main>
    );
  }

  // Busca por IMEI/ICCID: o item, onde está e o histórico do livro.
  const item = identificador
    ? await supabase.from("itens_serializados").select("id, variante_id, unidade_id, imei, imei2, iccid, situacao, em_estoque, condicao, conferido_em")
      .or(`imei.eq.${identificador},imei2.eq.${identificador},iccid.eq.${identificador}`).limit(1).maybeSingle()
    : { data: null, error: null };
  if (item.error) throw new FalhaDoServico("estoque_item");
  const [movimentos, lojaDoItem, varianteDoItem] = item.data
    ? await Promise.all([
      supabase.from("estoque_movimentos").select("id, tipo, quantidade, motivo, ocorrido_em, unidade_id").eq("item_serializado_id", item.data.id).order("ocorrido_em", { ascending: false }).limit(10),
      supabase.from("unidades").select("nome").eq("id", item.data.unidade_id).maybeSingle(),
      supabase.from("variantes").select("id, nome, sku, produto_id").eq("id", item.data.variante_id).maybeSingle(),
    ])
    : [{ data: [], error: null }, { data: null, error: null }, { data: null, error: null }];
  if (movimentos.error || lojaDoItem.error || varianteDoItem.error) throw new FalhaDoServico("estoque_historico");

  // Saldo da loja (com filtro por nome/SKU) e, se pedida, a disponibilidade na rede.
  const saldos = await supabase.from("estoque_saldos").select("variante_id, quantidade, reservado").eq("unidade_id", unidade).limit(500);
  if (saldos.error) throw new FalhaDoServico("estoque_saldos");
  const variantes = saldos.data.length
    ? await supabase.from("variantes").select("id, nome, sku, estoque_minimo, produto_id").in("id", saldos.data.map((s) => s.variante_id))
    : { data: [], error: null };
  if (variantes.error) throw new FalhaDoServico("estoque_variantes");
  const termo = busca && !identificador ? busca.toLocaleLowerCase("pt-BR") : "";
  const filtradas = termo
    ? variantes.data.filter((v) => v.nome.toLocaleLowerCase("pt-BR").includes(termo) || v.sku.toLocaleLowerCase("pt-BR").includes(termo))
    : variantes.data;
  const linhas = filtradas
    .map((v) => { const s = saldos.data.find((x) => x.variante_id === v.id); return { ...v, quantidade: s?.quantidade ?? 0, reservado: s?.reservado ?? 0 }; })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  // Fotos (ORA-CAT-011): a da variante ou a principal do produto; URL assinada e temporária.
  const comFoto = [...linhas.map((l) => ({ id: l.id, produto_id: l.produto_id })), ...(varianteDoItem.data ? [varianteDoItem.data] : [])];
  const produtoIds = [...new Set(comFoto.map((v) => v.produto_id))];
  const fotos = produtoIds.length ? await supabase.from("fotos_produto").select("produto_id, variante_id, caminho, ilustracao").in("produto_id", produtoIds).is("substituida_em", null) : { data: [], error: null };
  if (fotos.error) throw new FalhaDoServico("estoque_fotos");
  const assinadas = fotos.data.length ? await supabase.storage.from("produtos").createSignedUrls(fotos.data.map((f) => f.caminho), 3600) : { data: [], error: null };
  const urlDe = new Map((assinadas.data ?? []).map((a) => [a.path, a.error ? null : a.signedUrl]));
  const fotoDe = (variante: { id: string; produto_id: string }) => {
    const f = fotos.data.find((x) => x.variante_id === variante.id) ?? fotos.data.find((x) => x.produto_id === variante.produto_id && x.variante_id === null);
    return { url: f ? (urlDe.get(f.caminho) ?? null) : null, ilustracao: f?.ilustracao ?? false };
  };
  const rede = ehUuid(varianteNaRede) ? await supabase.rpc("disponibilidade_na_rede", { p_variante: varianteNaRede }) : { data: null, error: null };
  if (rede.error) throw new FalhaDoServico("estoque_rede");
  const nomeNaRede = ehUuid(varianteNaRede) ? linhas.find((l) => l.id === varianteNaRede)?.nome : undefined;

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      {cabecalho}
      <h1 className="text-2xl font-bold tracking-tight">Estoque · {situacao.unidade_nome}</h1>
      {abas}
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="min-w-0 flex-1 text-sm font-medium">Produto, SKU, IMEI ou ICCID<input name="q" defaultValue={busca} autoComplete="off" className={campo} /></label>
        <Botao type="submit"><Search aria-hidden className="size-4" /> Buscar</Botao>
      </form>

      {identificador && (
        item.data ? (
          <Cartao titulo={varianteDoItem.data?.nome ?? "Item"} subtitulo={`${varianteDoItem.data?.sku ?? ""} · ${lojaDoItem.data?.nome ?? "outra loja"}`} icone={History}>
            <div className="flex items-center gap-3">
              {varianteDoItem.data && <FotoAmpliavel {...fotoDe(varianteDoItem.data)} rotulo={`${varianteDoItem.data.nome} (${varianteDoItem.data.sku})`} />}
              <p className="numeros text-sm">{item.data.imei ? `IMEI ${item.data.imei}${item.data.imei2 ? ` / ${item.data.imei2}` : ""}` : `ICCID ${final(item.data.iccid)}`}</p>
            </div>
            <p className="mt-1 flex flex-wrap gap-2">
              <Selo tom={item.data.situacao === "disponivel" ? "sucesso" : item.data.situacao === "reservado" ? "aviso" : "neutro"} ponto>{nomeDe(NOMES_DAS_SITUACOES, item.data.situacao)}</Selo>
              <Selo tom={item.data.em_estoque ? "info" : "neutro"}>{item.data.em_estoque ? "no estoque" : "fora do estoque"}</Selo>
              {item.data.conferido_em && <Selo tom="neutro">conferido em {quando(item.data.conferido_em)}</Selo>}
            </p>
            <h2 className="mt-3 text-sm font-semibold">Histórico (livro do estoque)</h2>
            <ul className="mt-1 divide-y divide-borda text-xs">
              {movimentos.data.map((m) => (
                <li key={m.id} className="flex justify-between gap-2 py-1"><span>{nomeDe(NOMES_DOS_MOVIMENTOS, m.tipo)}{m.motivo ? ` · ${m.motivo}` : ""}</span><span className="numeros text-suave">{quando(m.ocorrido_em)}</span></li>
              ))}
            </ul>
          </Cartao>
        ) : <Aviso tom="aviso">Nenhum IMEI/ICCID com esse número nas lojas que você consulta.</Aviso>
      )}

      {nomeNaRede && rede.data && (
        <Cartao titulo={`${nomeNaRede} na rede`} subtitulo="Disponível por loja (sem IMEI)">
          <ul className="divide-y divide-borda text-sm">
            {rede.data.map((r) => <li key={r.unidade_id} className="flex justify-between py-1"><span>{r.unidade}</span><span className="numeros font-semibold">{r.disponivel}</span></li>)}
          </ul>
        </Cartao>
      )}

      {!identificador && (
        <Cartao titulo="Saldo da loja" subtitulo={`${linhas.length} produto(s)${busca ? ` com "${busca}"` : ""}`} icone={Boxes}>
          {linhas.length === 0 ? <p className="text-sm text-suave">Nenhum produto com saldo nesta loja{busca ? " para essa busca" : ""}.</p> : (
            <ul className="divide-y divide-borda text-sm">
              {linhas.map((l) => {
                const disponivel = l.quantidade - l.reservado;
                return (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-3"><FotoAmpliavel {...fotoDe(l)} rotulo={`${l.nome} (${l.sku})`} /><span>{l.nome}<span className="numeros block text-xs text-suave">{l.sku}{l.reservado > 0 ? ` · ${l.reservado} em venda` : ""}</span></span></span>
                    <span className="flex items-center gap-2">
                      {disponivel < l.estoque_minimo && <Selo tom="aviso">abaixo do mínimo</Selo>}
                      <span className="numeros text-base font-bold">{disponivel}</span>
                      <Link href={`/estoque?variante=${l.id}`} className="text-xs font-semibold text-acao">na rede</Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      )}
    </main>
  );
}

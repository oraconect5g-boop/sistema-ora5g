import { randomUUID } from "node:crypto";

import { ArrowRightLeft, Boxes, CheckCircle2, ClipboardCheck, History, Search } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, FiltroSegmentado, Selo, TituloPagina } from "../../componentes/ui";
import { ehUuid } from "../../lib/acesso/regras";
import { permite } from "../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { SERVICOS, SITUACOES as SITUACOES_DA_OS, ehServico } from "../../lib/assistencia/regras";
import { tabelaAusente } from "../../lib/caixa/saidas";
import { buscarNoCatalogo, filtroDoIdentificador, identificadorDigitado, termoDaBusca } from "../../lib/catalogo/busca";
import type { FotoDaTela } from "../../lib/catalogo/tela";
import { consultarEstoque } from "../../lib/estoque/consulta-painel";
import { consultarListaDoEstoque } from "../../lib/estoque/lista";
import { lerValorDoEstoque } from "../../lib/estoque/valor";
import { filtroDosPendentes, numerosDaConferencia, paginaDoEndereco, paginasDaConferencia, POR_PAGINA_DA_CONFERENCIA, resumoDosPendentes } from "../../lib/estoque/conferencia";
import { lerPorIds } from "../../lib/leitura-completa";
import { escopoDoEstoque } from "../../lib/estoque/painel";
import { ERROS_DO_ESTOQUE, inicioDoDiaEmSaoPaulo, nomeDe, NOMES_DAS_SITUACOES, NOMES_DOS_MOVIMENTOS } from "../../lib/estoque/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { ERROS_DA_TRANSFERENCIA } from "../../lib/transferencias/regras";
import { FotoAmpliavel } from "../catalogo/FotoAmpliavel";
import { solicitarTransferencia } from "../transferencias/acoes";
import { conferirItem, conferirPorIdentificador } from "./acoes";
import { CartaoDasPlanilhas } from "./CartaoDasPlanilhas";
import { CartaoDoValorDoEstoque } from "./CartaoDoValorDoEstoque";
import { LinksDaPlanilha } from "./LinksDaPlanilha";
import { PainelDoEstoque } from "./PainelDoEstoque";

export const metadata: Metadata = { title: "Estoque" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (data: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(data));
const final = (t: string | null) => (t ? t : "—");
const POR_PAGINA_DO_SALDO = 100;

// Estoque real da loja do turno (ORA-INV-001/004): saldo por produto, busca por IMEI/ICCID com o
// histórico do livro, disponibilidade na rede e conferência física do dia. Só leitura pelo RLS;
// a conferência é gravada e auditada pelo banco (conferir_item). Custo não aparece aqui.
// Lote G3: a aba "Painel" mostra a posição de agora somada no banco (public.estoque_painel), por modelo,
// categoria e local, com mínimo, trânsito, parado há mais de 60 dias e pendências.
export default async function Estoque({ searchParams }: { searchParams: Promise<{ q?: ValorDeParametro; aba?: ValorDeParametro; pagina?: ValorDeParametro; loja?: ValorDeParametro; variante?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro; erro_transferencia?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DO_ESTOQUE, parametros.erro);
  const conferencia = textoDoParametro(parametros.aba) === "conferencia";
  const painel = textoDoParametro(parametros.aba) === "painel";
  const busca = termoDaBusca(textoDoParametro(parametros.q)).slice(0, 40);
  const identificador = identificadorDigitado(busca);
  const varianteNaRede = textoDoParametro(parametros.variante);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;

  const consulta = permite(sessao, "estoque.consultar");
  const confere = permite(sessao, "estoque.conferir");
  const recebe = permite(sessao, "estoque.receber");
  if (!consulta) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Seu papel não consulta estoque nesta loja.</Aviso></MoldeReal>;
  }

  const abas = (
    // As seções carregam no toque, sem pré-carga (VEL-h).
    <nav aria-label="Seções do estoque" className="flex flex-wrap gap-2 text-sm">
      <Link prefetch={false} href="/estoque" aria-current={!conferencia && !painel ? "page" : undefined} className={`rounded-botao px-3 py-2 font-semibold ${!conferencia && !painel ? "bg-acao text-white" : "bg-white text-acao ring-1 ring-borda"}`}>Saldo e busca</Link>
      <Link prefetch={false} href="/estoque?aba=painel" aria-current={painel ? "page" : undefined} className={`rounded-botao px-3 py-2 font-semibold ${painel ? "bg-acao text-white" : "bg-white text-acao ring-1 ring-borda"}`}>Painel</Link>
      <Link prefetch={false} href="/estoque?aba=conferencia" aria-current={conferencia ? "page" : undefined} className={`rounded-botao px-3 py-2 font-semibold ${conferencia ? "bg-acao text-white" : "bg-white text-acao ring-1 ring-borda"}`}>Conferência do dia</Link>
      {recebe && <Link prefetch={false} href="/estoque/entrada" className="rounded-botao bg-white px-3 py-2 font-semibold text-acao ring-1 ring-borda">Entrada de mercadoria</Link>}
      {recebe && <Link prefetch={false} href="/estoque/pedidos" className="rounded-botao bg-white px-3 py-2 font-semibold text-acao ring-1 ring-borda">Pedidos de compra</Link>}
      {confere && <Link prefetch={false} href="/estoque/inventario" className="rounded-botao bg-white px-3 py-2 font-semibold text-acao ring-1 ring-borda">Inventário</Link>}
    </nav>
  );

  if (painel) {
    // Primeiro a posição de todos os locais que a pessoa consulta; quem consulta mais de um escolhe o
    // recorte (o padrão é a loja do turno) e o banco soma de novo só aquele local.
    const todos = await consultarEstoque(supabase, null);
    const locais = todos.estado === "ok" ? todos.dados.locais : [];
    const escopo = escopoDoEstoque(textoDoParametro(parametros.loja), locais, unidade);
    // G3b (E8): o valor a custo do mesmo recorte, só para quem vê o custo (sem permissão ou sem a função: o bloco some).
    const [estoque, valor] = await Promise.all([
      todos.estado === "ok" && locais.length > 1 && escopo.unidade ? consultarEstoque(supabase, escopo.unidade) : Promise.resolve(todos),
      lerValorDoEstoque(supabase, escopo.unidade),
    ]);
    const enderecoDoLocal = (loja: string) => (loja === unidade ? "/estoque?aba=painel" : `/estoque?aba=painel&loja=${loja}`);
    const redeInteira = locais.length > 1 && escopo.unidade === null;
    return (
      <MoldeReal sessao={sessao} largura="max-w-6xl">
        <TituloPagina
          sobretitulo={redeInteira ? "Rede inteira" : (locais.find((l) => l.unidadeId === escopo.unidade)?.nome ?? situacao.unidade_nome)} titulo="Estoque"
          subtitulo="Posição de agora, somada no banco, nos locais que você consulta. Disponível para vender é o físico menos o reservado."
        />
        <div className="mb-4 flex flex-col gap-3">
          {abas}
          {locais.length > 1 && (
            <FiltroSegmentado
              rotulo="Local"
              opcoes={[{ href: enderecoDoLocal("rede"), rotulo: "Rede inteira", ativo: redeInteira }, ...locais.map((l) => ({ href: enderecoDoLocal(l.unidadeId), rotulo: l.nome, ativo: l.unidadeId === escopo.chave }))]}
            />
          )}
        </div>
        <PainelDoEstoque estoque={estoque} redeInteira={redeInteira} aqui={enderecoDoLocal(escopo.chave)} enderecoDoLocal={enderecoDoLocal} />
        {valor && <CartaoDoValorDoEstoque leitura={valor} aqui={enderecoDoLocal(escopo.chave)} />}
        {/* FIN-009b: as planilhas do mesmo recorte. Sem os locais (falha do painel), a rota não sabe o recorte e o
            cartão some; banco sem o painel: a planilha é da loja do turno. */}
        {todos.estado !== "falha" && <CartaoDasPlanilhas loja={locais.length > 1 ? escopo.chave : null} />}
      </MoldeReal>
    );
  }

  if (conferencia) {
    const desde = inicioDoDiaEmSaoPaulo();
    // #80 (REV-DIR-003): total, conferidos e pendentes são contagens no banco sobre TODOS os aparelhos e chips da
    // loja que a pessoa vê (o RLS vale em cada uma); só a lista dos pendentes vem por página, em ordem estável.
    const doEstoque = () => supabase.from("itens_serializados").select("id", { count: "exact", head: true }).eq("unidade_id", unidade).eq("em_estoque", true);
    const [total, conferidos, pendentes] = await Promise.all([
      doEstoque(), doEstoque().gte("conferido_em", desde), doEstoque().or(filtroDosPendentes(desde)),
    ]);
    if (total.error || conferidos.error || pendentes.error) throw new FalhaDoServico("estoque_conferencia");
    const numeros = numerosDaConferencia(total.count, conferidos.count, pendentes.count);
    const paginas = numeros ? paginasDaConferencia(numeros.pendentes) : 1;
    const pagina = Math.min(paginaDoEndereco(textoDoParametro(parametros.pagina)), paginas);
    const lista = numeros && numeros.pendentes > 0
      ? await supabase.from("itens_serializados").select("id, variante_id, imei, iccid, situacao, conferido_em")
        .eq("unidade_id", unidade).eq("em_estoque", true).or(filtroDosPendentes(desde))
        .order("variante_id").order("id").range((pagina - 1) * POR_PAGINA_DA_CONFERENCIA, pagina * POR_PAGINA_DA_CONFERENCIA - 1)
      : { data: [], error: null };
    if (lista.error) throw new FalhaDoServico("estoque_conferencia");
    const variantes = lista.data.length ? await supabase.from("variantes").select("id, nome, sku").in("id", [...new Set(lista.data.map((i) => i.variante_id))]) : { data: [], error: null };
    if (variantes.error) throw new FalhaDoServico("estoque_variantes");
    const enderecoDaPagina = (n: number) => (n === 1 ? "/estoque?aba=conferencia" : `/estoque?aba=conferencia&pagina=${n}`);
    return (
      <MoldeReal sessao={sessao}>
        <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Estoque" />
        {abas}
        {erro && <Aviso tom="perigo">{ERROS_DO_ESTOQUE[erro]}</Aviso>}
        {textoDoParametro(parametros.ok) === "conferido" && <Aviso tom="sucesso"><CheckCircle2 aria-hidden className="inline size-4" /> Item conferido (gravado na auditoria).</Aviso>}
        {!numeros && <Aviso tom="aviso">Não deu para contar os aparelhos e chips agora: os números não aparecem, para a conferência não parecer terminada sem estar. Tente de novo em instantes.</Aviso>}
        <Cartao titulo="Conferência física de hoje" subtitulo={numeros ? `${numeros.conferidos} de ${numeros.total} aparelhos e chips conferidos` : "Não deu para contar agora"} icone={ClipboardCheck}
          acao={<LinksDaPlanilha parte="itens" rotulo="Aparelhos e chips" />}>
          {numeros && (
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={numeros.total} aria-valuenow={numeros.conferidos} aria-label="Conferidos hoje">
              <div className="h-full bg-acao" style={{ width: `${numeros.total ? Math.floor((numeros.conferidos / numeros.total) * 100) : 0}%` }} />
            </div>
          )}
          {confere ? (
            <form action={conferirPorIdentificador} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-sm font-medium">IMEI ou ICCID do item na mão<input name="identificador" inputMode="numeric" autoComplete="off" required className={campo} /></label>
              <Botao type="submit">Conferir</Botao>
            </form>
          ) : <p className="mt-3 text-sm text-suave">Seu papel consulta, mas não confere.</p>}
        </Cartao>
        <Cartao titulo="Ainda não conferidos hoje" subtitulo={resumoDosPendentes(numeros, pagina)}>
          {!numeros ? <p className="text-sm text-suave">A lista volta quando o banco responder.</p>
            : numeros.total === 0 ? <p className="text-sm text-suave">Nada para conferir hoje.</p>
            : numeros.pendentes === 0 ? <p className="text-sm text-suave">Nenhum pendente.</p> : (
              <>
                <ul className="divide-y divide-borda text-sm">
                  {lista.data.map((i) => {
                    const v = variantes.data.find((x) => x.id === i.variante_id);
                    return (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>{v?.nome ?? "—"}<span className="numeros block text-xs text-suave">{v?.sku} · {i.imei ? `IMEI ${i.imei}` : `ICCID ${final(i.iccid)}`}{i.situacao === "reservado" ? " · numa venda" : ""}</span></span>
                        {confere && <form action={conferirItem}><input type="hidden" name="item" value={i.id} /><Botao type="submit" tamanho="sm" variante="secundario">Conferido</Botao></form>}
                      </li>
                    );
                  })}
                </ul>
                {paginas > 1 && (
                  <nav aria-label="Páginas dos pendentes" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    {pagina > 1 ? <Link href={enderecoDaPagina(pagina - 1)} className="rounded-botao px-3 py-2 font-semibold text-acao ring-1 ring-borda">Anteriores</Link> : <span />}
                    <span className="text-suave">{`Página ${pagina} de ${paginas}`}</span>
                    {pagina < paginas ? <Link href={enderecoDaPagina(pagina + 1)} className="rounded-botao px-3 py-2 font-semibold text-acao ring-1 ring-borda">Próximos</Link> : <span />}
                  </nav>
                )}
              </>
            )}
        </Cartao>
      </MoldeReal>
    );
  }

  // Busca por IMEI/ICCID: o item, onde está e o histórico do livro.
  const item = identificador
    ? await supabase.from("itens_serializados").select("id, variante_id, unidade_id, imei, imei2, iccid, situacao, em_estoque, condicao, conferido_em")
      .or(filtroDoIdentificador(identificador)).limit(1).maybeSingle()
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
  // L5e (INV-010): os consertos deste aparelho, pelas OS abertas com o IMEI (o primeiro ou o segundo), lidos à parte e
  // pelo RLS (quem não acompanha a assistência não vê nada). Banco sem a OS: a parte some; outra falha: diz que não leu.
  const imeisDoItem = item.data ? [item.data.imei, item.data.imei2].filter((x): x is string => Boolean(x)) : [];
  const consertosDoBanco = imeisDoItem.length
    ? await supabase.from("ordens_servico").select("id, numero, situacao, servico, defeito, aberta_em").in("imei", imeisDoItem).order("aberta_em", { ascending: false }).limit(10)
    : null;
  const consertos = !consertosDoBanco || tabelaAusente(consertosDoBanco.error) ? null : consertosDoBanco.error ? "falha" as const : consertosDoBanco.data;
  if (consertos === "falha") console.error("estoque: falha ao ler os consertos do aparelho", { codigo: consertosDoBanco?.error?.code ?? null });

  // Saldo da loja (com filtro por nome/SKU) e, se pedida, a disponibilidade na rede.
  // B5 (REV-PLAN-003): antes vinham os 500 primeiros saldos e o subtítulo dizia "500 produto(s)" mesmo havendo mais.
  // Sem busca, a página vem do banco já ordenada pelo nome, com o total contado lá. Com busca (a mesma do
  // catálogo e do PDV, na fonte e antes do limite, #40, com variação desativada que ainda tenha saldo), os saldos
  // das variações achadas vêm completos, em lotes, e a tela avisa quando a busca chegou ao limite.
  const termo = busca && !identificador ? busca : "";
  type LinhaDoSaldo = { id: string; nome: string; sku: string; estoque_minimo: number; produto_id: string; quantidade: number; reservado: number };
  const paginaPedida = paginaDoEndereco(textoDoParametro(parametros.pagina));
  let linhas: LinhaDoSaldo[] = [];
  let totalDoSaldo = 0;
  let buscaCortada = false;
  let paginaDoSaldo = 1;
  let fotosDaLista: FotoDaTela[] | null = null;
  if (termo) {
    const achados = await buscarNoCatalogo(supabase, termo, { limite: 100, ativos: false });
    buscaCortada = achados.cortada;
    const saldos = await lerPorIds(achados.variantes, (lote, de, ate) => supabase.from("estoque_saldos").select("variante_id, quantidade, reservado")
      .eq("unidade_id", unidade).in("variante_id", lote).order("variante_id").range(de, ate));
    if (!saldos.ok || saldos.mais) throw new FalhaDoServico("estoque_saldos");
    const variantes = await lerPorIds(saldos.linhas.map((s) => s.variante_id), (lote, de, ate) => supabase.from("variantes")
      .select("id, nome, sku, estoque_minimo, produto_id").in("id", lote).order("id").range(de, ate));
    if (!variantes.ok || variantes.mais) throw new FalhaDoServico("estoque_variantes");
    const todas = variantes.linhas
      .map((v) => { const s = saldos.linhas.find((x) => x.variante_id === v.id); return { ...v, quantidade: s?.quantidade ?? 0, reservado: s?.reservado ?? 0 }; })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
    totalDoSaldo = todas.length;
    paginaDoSaldo = Math.min(paginaPedida, Math.max(1, Math.ceil(totalDoSaldo / POR_PAGINA_DO_SALDO)));
    linhas = todas.slice((paginaDoSaldo - 1) * POR_PAGINA_DO_SALDO, paginaDoSaldo * POR_PAGINA_DO_SALDO);
  } else {
    // VEL-d (ADR-010): a página, o total e as fotos dos produtos dela numa ida ao banco (lib/estoque/lista.ts).
    const lista = await consultarListaDoEstoque(supabase, unidade, paginaPedida, POR_PAGINA_DO_SALDO);
    totalDoSaldo = lista.total;
    paginaDoSaldo = lista.pagina;
    linhas = lista.linhas;
    fotosDaLista = lista.fotos;
  }
  const paginasDoSaldo = Math.max(1, Math.ceil(totalDoSaldo / POR_PAGINA_DO_SALDO));
  const enderecoDoSaldo = (n: number) => {
    const busca2 = new URLSearchParams();
    if (busca) busca2.set("q", busca);
    if (n > 1) busca2.set("pagina", String(n));
    return busca2.size ? `/estoque?${busca2}` : "/estoque";
  };
  // Fotos (ORA-CAT-011): a da variante ou a principal do produto; URL assinada e temporária.
  const comFoto = [...linhas.map((l) => ({ id: l.id, produto_id: l.produto_id })), ...(varianteDoItem.data ? [varianteDoItem.data] : [])];
  const produtoIds = [...new Set(comFoto.map((v) => v.produto_id))];
  // Sem busca, as fotos da página vieram junto com a lista (VEL-d): só falta ler as do aparelho aberto, se for de outro produto.
  const faltam = fotosDaLista ? produtoIds.filter((id) => !linhas.some((l) => l.produto_id === id)) : produtoIds;
  const lidas = faltam.length
    ? await lerPorIds(faltam, (lote, de, ate) => supabase.from("fotos_produto").select("id, produto_id, variante_id, caminho, ilustracao")
      .in("produto_id", lote).is("substituida_em", null).order("id").range(de, ate))
    : { ok: true as const, mais: false, linhas: [] };
  if (!lidas.ok || lidas.mais) throw new FalhaDoServico("estoque_fotos");
  const fotos = { data: [...(fotosDaLista ?? []), ...lidas.linhas] };
  const assinadas = fotos.data.length ? await supabase.storage.from("produtos").createSignedUrls(fotos.data.map((f) => f.caminho), 3600) : { data: [], error: null };
  const urlDe = new Map((assinadas.data ?? []).map((a) => [a.path, a.error ? null : a.signedUrl]));
  const fotoDe = (variante: { id: string; produto_id: string }) => {
    const f = fotos.data.find((x) => x.variante_id === variante.id) ?? fotos.data.find((x) => x.produto_id === variante.produto_id && x.variante_id === null);
    return { url: f ? (urlDe.get(f.caminho) ?? null) : null, ilustracao: f?.ilustracao ?? false };
  };
  // "Onde tem este produto?" (ADR-007, #60): físico, reservado (venda e transferência), disponível
  // e chegando por local; DEFEITOS à parte, sem venda. Abre também para produto sem saldo aqui.
  const rede = ehUuid(varianteNaRede) ? await supabase.rpc("estoque_na_rede", { p_variante: varianteNaRede }) : { data: null, error: null };
  const varianteDaRede = ehUuid(varianteNaRede) ? await supabase.from("variantes").select("nome").eq("id", varianteNaRede).maybeSingle() : { data: null, error: null };
  if (rede.error || varianteDaRede.error) throw new FalhaDoServico("estoque_rede");
  const nomeNaRede = varianteDaRede.data?.nome;
  const locaisDaRede = [...(rede.data ?? [])].sort((a, b) => Number(b.unidade_id === unidade) - Number(a.unidade_id === unidade));
  const erroTransferencia = chaveDoCatalogo(ERROS_DA_TRANSFERENCIA, parametros.erro_transferencia);

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Estoque" />
      {abas}
      {/* next/form: a busca troca só o endereço, sem recarregar; a tela fica até o resultado chegar. */}
      <Form action="/estoque" prefetch={false} className="flex flex-wrap items-end gap-2" role="search">
        <label className="min-w-0 flex-1 text-sm font-medium">Produto, marca, SKU, código de barras, IMEI ou ICCID<input key={busca} name="q" defaultValue={busca} autoComplete="off" placeholder="IMEI inteiro, ou o final dele (4 dígitos ou mais)" className={campo} /></label>
        <Botao type="submit" enquanto="Buscando…"><Search aria-hidden className="size-4" /> Buscar</Botao>
      </Form>

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
            {consertos === "falha" && <p className="mt-3 text-xs text-suave">Não deu para ler os consertos deste aparelho agora.</p>}
            {Array.isArray(consertos) && consertos.length > 0 && (
              <>
                <h2 className="mt-3 text-sm font-semibold">Consertos (assistência)</h2>
                <ul className="mt-1 divide-y divide-borda text-xs">
                  {consertos.map((o) => (
                    <li key={o.id} className="flex justify-between gap-2 py-1">
                      <span className="min-w-0"><Link href={`/assistencia/${o.id}`} className="font-semibold text-acao">OS nº {o.numero}</Link>{` · ${o.defeito} · `}
                        {o.situacao === "aberta" && ehServico(o.servico) ? SERVICOS[o.servico] : SITUACOES_DA_OS[o.situacao as keyof typeof SITUACOES_DA_OS] ?? o.situacao}</span>
                      <span className="numeros shrink-0 text-suave">{quando(o.aberta_em)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Cartao>
        ) : <Aviso tom="aviso">Nenhum IMEI/ICCID com esse número nas lojas que você consulta.</Aviso>
      )}

      {erroTransferencia && <Aviso tom="perigo">{ERROS_DA_TRANSFERENCIA[erroTransferencia]}</Aviso>}
      {nomeNaRede && ehUuid(varianteNaRede) && (
        <Cartao titulo={`Onde tem: ${nomeNaRede}`} subtitulo="Disponível para vender = físico − reservado (venda e transferência). Sem IMEI de outra loja. Pedir já reserva na origem: sai do disponível de lá na hora." icone={ArrowRightLeft}
          acao={<Link href="/transferencias" className="text-xs font-semibold text-acao">pedidos</Link>}>
          <ul className="divide-y divide-borda text-sm">
            {locaisDaRede.map((r) => {
              const aqui = r.unidade_id === unidade;
              const excecao = r.tipo === "excecao";
              return (
                <li key={r.unidade_id} className="space-y-2 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{r.unidade}{aqui ? " (esta loja)" : ""}{excecao && <Selo tom="aviso" className="ml-2">local de exceção, não vende</Selo>}</span>
                    <span className="numeros text-right text-xs"><strong className="text-sm">{r.disponivel}</strong> disponível · físico {r.fisico} · reservado {r.reservado}{r.chegando > 0 ? ` · chegando ${r.chegando}` : ""}{r.pedidos_abertos > 0 ? ` · ${r.pedidos_abertos} pedido(s)` : ""}</span>
                  </div>
                  {!aqui && !excecao && r.disponivel > 0 && (
                    <form action={solicitarTransferencia} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <input type="hidden" name="origem" value={r.unidade_id} /><input type="hidden" name="destino" value={unidade} />
                      <input type="hidden" name="variante" value={varianteNaRede} /><input type="hidden" name="chave" value={randomUUID()} />
                      <label className="text-xs font-medium">Quantidade<input name="quantidade" inputMode="numeric" defaultValue="1" required className={campo} /></label>
                      <label className="text-xs font-medium sm:col-span-2">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
                      <div className="self-end"><Botao type="submit" tamanho="sm" variante="secundario">Pedir desta loja</Botao></div>
                    </form>
                  )}
                  {aqui && r.disponivel > 0 && locaisDaRede.length > 1 && (
                    <form action={solicitarTransferencia} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <input type="hidden" name="origem" value={unidade} /><input type="hidden" name="variante" value={varianteNaRede} /><input type="hidden" name="chave" value={randomUUID()} />
                      <label className="text-xs font-medium">Mandar para<select name="destino" className={campo}>
                        {locaisDaRede.filter((x) => x.unidade_id !== unidade).map((x) => <option key={x.unidade_id} value={x.unidade_id}>{x.unidade}</option>)}
                      </select></label>
                      <label className="text-xs font-medium">Quantidade<input name="quantidade" inputMode="numeric" defaultValue="1" required className={campo} /></label>
                      <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} className={campo} /></label>
                      <div className="self-end"><Botao type="submit" tamanho="sm" variante="secundario">Registrar envio</Botao></div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      {!identificador && (
        <Cartao titulo="Saldo da loja" subtitulo={`${totalDoSaldo} produto(s)${busca ? ` com "${busca}"` : ""}${paginasDoSaldo > 1 ? ` · mostrando ${(paginaDoSaldo - 1) * POR_PAGINA_DO_SALDO + 1} a ${Math.min(paginaDoSaldo * POR_PAGINA_DO_SALDO, totalDoSaldo)}` : ""}`} icone={Boxes}
          acao={<LinksDaPlanilha parte="saldo" rotulo={busca ? "Saldo da loja inteira" : "Saldo"} />}>
          {buscaCortada && <p className="mb-2 text-xs text-aviso">A busca achou muitos produtos e parou no limite: escreva mais do nome ou o SKU para ver os outros.</p>}
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
                      <Link href={`/estoque?variante=${l.id}`} prefetch={false} className="text-xs font-semibold text-acao">na rede</Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {paginasDoSaldo > 1 && (
            <nav aria-label="Páginas do saldo" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              {paginaDoSaldo > 1 ? <Link href={enderecoDoSaldo(paginaDoSaldo - 1)} className="rounded-botao px-3 py-2 font-semibold text-acao ring-1 ring-borda">Anteriores</Link> : <span />}
              <span className="text-suave">{`Página ${paginaDoSaldo} de ${paginasDoSaldo}`}</span>
              {paginaDoSaldo < paginasDoSaldo ? <Link href={enderecoDoSaldo(paginaDoSaldo + 1)} className="rounded-botao px-3 py-2 font-semibold text-acao ring-1 ring-borda">Próximos</Link> : <span />}
            </nav>
          )}
        </Cartao>
      )}
    </MoldeReal>
  );
}

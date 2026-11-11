import { randomUUID } from "node:crypto";

import { Boxes, PackagePlus, Pencil, Plus, ShieldAlert, Tag, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { termoDaBusca, buscarNoCatalogo } from "../../lib/catalogo/busca";
import { ERROS_DO_CADASTRO, TEM_ESTOQUE, TIPOS_DE_PRODUTO, ehTipoDeProduto, percentualDosPontosBase } from "../../lib/catalogo/cadastro";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { definirPolitica, salvarCategoria, salvarMarca, salvarProduto, salvarVariante } from "./acoes";

export const metadata: Metadata = { title: "Cadastro de produtos" };
export const dynamic = "force-dynamic";

const OK = {
  categoria_criada: "Categoria cadastrada.",
  categoria_alterada: "Categoria atualizada.",
  marca_criada: "Marca cadastrada.",
  marca_alterada: "Marca atualizada.",
  politica_alterada: "Política de desconto da categoria gravada. Vale nas próximas vendas.",
  produto_criado: "Produto cadastrado. Agora cadastre a primeira variação (SKU) dele.",
  produto_repetido: "Este produto já tinha sido cadastrado por este formulário: nada foi duplicado.",
  produto_alterado: "Produto atualizado.",
  variante_criada: "Variação cadastrada. O preço e o estoque entram pelas telas próprias.",
  variante_alterada: "Variação atualizada.",
  sem_mudanca: "Nada mudou: os dados já eram esses.",
} as const;
const LIMITE = 40;

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const rotulo = "block text-sm font-medium";
const resumo = "flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao";

function Motivo({ exemplo }: { exemplo: string }) {
  return (
    <label className={rotulo}>Motivo (fica na auditoria)
      <input name="motivo" required minLength={3} maxLength={200} placeholder={exemplo} className={campo} />
    </label>
  );
}
function Situacao({ ativo, rotuloAtivo = "Ativo" }: { ativo: boolean; rotuloAtivo?: string }) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <input type="hidden" name="tem_ativo" value="1" />
      <input type="checkbox" name="ativo" defaultChecked={ativo} className="size-4 accent-acao" /> {rotuloAtivo}
    </label>
  );
}

type Categoria = { id: string; nome: string; ativa: boolean; desconto_teto_pb: number | null; margem_minima_pb: number | null };
type Marca = { id: string; nome: string };
type Produto = { id: string; nome: string; tipo: string; categoria_id: string; marca_id: string | null; modelo: string | null; descricao: string | null; publicar_online: boolean; ativo: boolean };
type Variante = { id: string; produto_id: string; sku: string; nome: string; cor: string | null; capacidade: string | null; codigo_barras: string | null; estoque_minimo: number; ativa: boolean };

// Cadastro do catálogo (lote L3a: ORA-CAT-001, ORA-CAT-005). Dono e administrador cadastram e editam
// categorias, marcas, produtos e variações; a política de desconto da categoria é de quem altera preço.
export default async function Produtos({ searchParams }: {
  searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro; q?: ValorDeParametro; inativos?: ValorDeParametro; form?: ValorDeParametro }>;
}) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DO_CADASTRO, parametros.erro);
  const busca = (textoDoParametro(parametros.q) ?? "").trim().slice(0, 60);
  const comInativos = textoDoParametro(parametros.inativos) === "1";
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;

  const [gerir, preco] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "catalogo.gerir" }),
    supabase.rpc("tem_permissao", { p_permissao: "preco.alterar" }),
  ]);
  if (gerir.error || preco.error) throw new FalhaDoServico("tem_permissao");
  if (!gerir.data) {
    return (
      <MoldeReal sessao={sessao}>
        <Cartao titulo="Sem permissão" icone={ShieldAlert}>
          <p className="text-sm text-suave">Só o dono e o administrador cadastram produtos. Para ver o catálogo e as fotos, use <Link href="/catalogo" className="font-semibold text-acao">Catálogo e fotos</Link>.</p>
        </Cartao>
      </MoldeReal>
    );
  }

  // Busca no banco antes do limite (mesma regra do catálogo, #40); sem termo, os mais recentes.
  const termo = termoDaBusca(busca.toLowerCase());
  const achados = termo ? await buscarNoCatalogo(supabase, termo, { limite: LIMITE, ativos: !comInativos }) : null;
  const consultaProdutos = supabase.from("produtos").select("id, nome, tipo, categoria_id, marca_id, modelo, descricao, publicar_online, ativo");
  const filtrada = comInativos ? consultaProdutos : consultaProdutos.eq("ativo", true);
  const [categorias, marcas, produtos] = await Promise.all([
    supabase.from("categorias").select("id, nome, ativa, desconto_teto_pb, margem_minima_pb").order("nome"),
    supabase.from("marcas").select("id, nome").order("nome"),
    achados && achados.produtos.length === 0
      ? Promise.resolve({ data: [] as Produto[], error: null })
      : (achados ? filtrada.in("id", achados.produtos).order("nome") : filtrada.order("criado_em", { ascending: false })).limit(LIMITE),
  ]);
  if (categorias.error || marcas.error || produtos.error) throw new FalhaDoServico("produtos");
  const lista = produtos.data as Produto[];
  const variantes = lista.length
    ? await supabase.from("variantes").select("id, produto_id, sku, nome, cor, capacidade, codigo_barras, estoque_minimo, ativa").in("produto_id", lista.map((p) => p.id)).order("sku")
    : { data: [] as Variante[], error: null };
  if (variantes.error) throw new FalhaDoServico("variantes");
  const cats = categorias.data as Categoria[];
  const ativas = cats.filter((c) => c.ativa);
  const nomeDaCategoria = (id: string) => cats.find((c) => c.id === id)?.nome ?? "—";
  const nomeDaMarca = (id: string | null) => (id ? (marcas.data as Marca[]).find((m) => m.id === id)?.nome ?? "—" : "sem marca");
  const chave = `form:${randomUUID()}`;
  const ocultoBusca = busca ? <input type="hidden" name="q" value={busca} /> : null;

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina titulo="Cadastro de produtos" subtitulo="Categorias, marcas, produtos e variações (SKU). Toda mudança pede motivo e fica na auditoria; nada é apagado." />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CADASTRO[erro]}</Aviso>}

      <form className="mt-4 flex flex-wrap items-end gap-2" role="search">
        <label className="min-w-0 flex-1 text-sm font-medium">Buscar por nome ou SKU
          <input name="q" defaultValue={busca} className={campo} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="inativos" value="1" defaultChecked={comInativos} className="size-4 accent-acao" /> incluir inativos</label>
        <Botao type="submit">Buscar</Botao>
      </form>

      <details id="novo-produto" className="mt-4 rounded-cartao border border-borda/80 bg-superficie shadow-cartao" open={textoDoParametro(parametros.form) === "novo"}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 font-semibold sm:px-6">
          <span className="grid size-9 place-items-center rounded-full bg-acao-clara text-acao"><PackagePlus aria-hidden className="size-4" /></span>
          Novo produto
        </summary>
        <form action={salvarProduto} className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-6 sm:pb-6">
          <input type="hidden" name="chave" value={chave} />
          <label className={rotulo}>Tipo (não muda depois)
            <select name="tipo" required className={campo} defaultValue="acessorio">
              {Object.entries(TIPOS_DE_PRODUTO).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
            </select>
          </label>
          <label className={rotulo}>Nome<input name="nome" required maxLength={120} placeholder="Galaxy A16" className={campo} /></label>
          <label className={rotulo}>Categoria
            <select name="categoria" required className={campo}>{ativas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </label>
          <label className={rotulo}>Marca
            <select name="marca" className={campo} defaultValue=""><option value="">sem marca</option>{(marcas.data as Marca[]).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
          </label>
          <label className={rotulo}>Modelo<input name="modelo" maxLength={60} className={campo} /></label>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" name="publicar_online" className="size-4 accent-acao" /> mostrar na loja online (quando existir)</label>
          <label className={`${rotulo} sm:col-span-2`}>Descrição<textarea name="descricao" maxLength={2000} rows={2} className={`${campo} py-2`} /></label>
          <div className="sm:col-span-2"><Motivo exemplo="Produto novo da coleção" /></div>
          <Botao type="submit" className="sm:col-span-2"><Plus aria-hidden className="size-4" /> Cadastrar produto</Botao>
        </form>
      </details>

      <ul className="mt-4 space-y-4">
        {lista.map((p) => {
          const dele = (variantes.data as Variante[]).filter((v) => v.produto_id === p.id);
          const tipo = ehTipoDeProduto(p.tipo) ? TIPOS_DE_PRODUTO[p.tipo] : p.tipo;
          return (
            <li key={p.id} id={`produto-${p.id}`} className="scroll-mt-24">
              <Cartao
                titulo={<span className="flex flex-wrap items-center gap-2">{p.nome}{!p.ativo && <Selo tom="neutro" ponto>inativo</Selo>}</span>}
                subtitulo={[tipo, nomeDaCategoria(p.categoria_id), nomeDaMarca(p.marca_id), p.modelo].filter(Boolean).join(" · ")}
                icone={Boxes}
              >
                <ul className="divide-y divide-borda rounded-xl border border-borda">
                  {dele.map((v) => (
                    <li key={v.id} className="px-3 py-2 text-sm">
                      <p className="flex flex-wrap items-center gap-2"><span className="numeros font-semibold">{v.sku}</span> {v.nome}{!v.ativa && <Selo tom="neutro">inativa</Selo>}</p>
                      <p className="text-xs text-suave">{[v.cor, v.capacidade, v.codigo_barras && `código de barras ${v.codigo_barras}`, TEM_ESTOQUE.has(p.tipo) ? `mínimo ${v.estoque_minimo}` : null].filter(Boolean).join(" · ") || "sem detalhes"}</p>
                      <details className="mt-1">
                        <summary className={resumo}><Pencil aria-hidden className="size-4" /> Editar variação</summary>
                        <form action={salvarVariante} className="mt-2 grid gap-3 sm:grid-cols-2">
                          <input type="hidden" name="produto" value={p.id} /><input type="hidden" name="id" value={v.id} />{ocultoBusca}
                          <label className={rotulo}>SKU (fixo depois de usado)<input name="sku" required maxLength={60} defaultValue={v.sku} autoCapitalize="characters" className={campo} /></label>
                          <label className={rotulo}>Nome completo<input name="nome" required maxLength={160} defaultValue={v.nome} className={campo} /></label>
                          <label className={rotulo}>Cor<input name="cor" maxLength={40} defaultValue={v.cor ?? ""} className={campo} /></label>
                          <label className={rotulo}>Capacidade<input name="capacidade" maxLength={40} defaultValue={v.capacidade ?? ""} className={campo} /></label>
                          <label className={rotulo}>Código de barras<input name="codigo_barras" inputMode="numeric" pattern="[0-9 ]{8,20}" defaultValue={v.codigo_barras ?? ""} className={campo} /></label>
                          {TEM_ESTOQUE.has(p.tipo) ? <label className={rotulo}>Estoque mínimo<input name="estoque_minimo" type="number" min={0} max={100000} defaultValue={v.estoque_minimo} className={campo} /></label> : <input type="hidden" name="estoque_minimo" value="0" />}
                          <Situacao ativo={v.ativa} rotuloAtivo="Variação ativa (inativar exige estoque zerado)" />
                          <div className="sm:col-span-2"><Motivo exemplo="Correção do nome" /></div>
                          <Botao type="submit" tamanho="sm" className="sm:col-span-2">Salvar variação</Botao>
                        </form>
                      </details>
                    </li>
                  ))}
                  {dele.length === 0 && <li className="px-3 py-2 text-sm text-aviso">Sem variação: cadastre ao menos uma (é ela que tem SKU, preço e estoque).</li>}
                </ul>

                <div className="mt-3 flex flex-col gap-2">
                  {p.ativo && (
                    <details className="rounded-xl border border-borda px-3 py-2" open={dele.length === 0}>
                      <summary className={resumo}><Plus aria-hidden className="size-4" /> Nova variação</summary>
                      <form action={salvarVariante} className="mt-2 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="produto" value={p.id} />{ocultoBusca}
                        <label className={rotulo}>SKU<input name="sku" required maxLength={60} placeholder="APA-0002" autoCapitalize="characters" className={campo} /></label>
                        <label className={rotulo}>Nome completo<input name="nome" required maxLength={160} defaultValue={p.nome} className={campo} /></label>
                        <label className={rotulo}>Cor<input name="cor" maxLength={40} className={campo} /></label>
                        <label className={rotulo}>Capacidade<input name="capacidade" maxLength={40} className={campo} /></label>
                        <label className={rotulo}>Código de barras<input name="codigo_barras" inputMode="numeric" pattern="[0-9 ]{8,20}" className={campo} /></label>
                        {TEM_ESTOQUE.has(p.tipo) ? <label className={rotulo}>Estoque mínimo<input name="estoque_minimo" type="number" min={0} max={100000} defaultValue={0} className={campo} /></label> : <input type="hidden" name="estoque_minimo" value="0" />}
                        <div className="sm:col-span-2"><Motivo exemplo="Cor nova" /></div>
                        <Botao type="submit" tamanho="sm" className="sm:col-span-2">Cadastrar variação</Botao>
                      </form>
                    </details>
                  )}
                  <details className="rounded-xl border border-borda px-3 py-2">
                    <summary className={resumo}><Pencil aria-hidden className="size-4" /> Editar produto</summary>
                    <form action={salvarProduto} className="mt-2 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={p.id} />{ocultoBusca}
                      <p className="text-xs text-suave sm:col-span-2">Tipo: {tipo} (não muda).</p>
                      <label className={rotulo}>Nome<input name="nome" required maxLength={120} defaultValue={p.nome} className={campo} /></label>
                      <label className={rotulo}>Categoria
                        <select name="categoria" required className={campo} defaultValue={p.categoria_id}>
                          {cats.filter((c) => c.ativa || c.id === p.categoria_id).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.ativa ? "" : " (inativa)"}</option>)}
                        </select>
                      </label>
                      <label className={rotulo}>Marca
                        <select name="marca" className={campo} defaultValue={p.marca_id ?? ""}><option value="">sem marca</option>{(marcas.data as Marca[]).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
                      </label>
                      <label className={rotulo}>Modelo<input name="modelo" maxLength={60} defaultValue={p.modelo ?? ""} className={campo} /></label>
                      <label className={`${rotulo} sm:col-span-2`}>Descrição<textarea name="descricao" maxLength={2000} rows={2} defaultValue={p.descricao ?? ""} className={`${campo} py-2`} /></label>
                      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="publicar_online" defaultChecked={p.publicar_online} className="size-4 accent-acao" /> mostrar na loja online</label>
                      <Situacao ativo={p.ativo} rotuloAtivo="Produto ativo (inativar exige estoque zerado)" />
                      <div className="sm:col-span-2"><Motivo exemplo="Nome comercial novo" /></div>
                      <Botao type="submit" tamanho="sm" className="sm:col-span-2">Salvar produto</Botao>
                    </form>
                  </details>
                </div>
              </Cartao>
            </li>
          );
        })}
      </ul>
      {lista.length === 0 && <p className="mt-4 text-sm text-suave">{busca ? "Nada encontrado com esta busca." : "Nenhum produto ainda."}</p>}
      {lista.length === LIMITE && <Aviso tom="info" className="mt-3">Mostrando {LIMITE} produtos{busca ? " desta busca; refine o termo" : " mais recentes; use a busca"}.</Aviso>}

      <section id="categorias" className="mt-6 scroll-mt-24">
        <Cartao titulo="Categorias" subtitulo={preco.data ? "A política de desconto (teto e margem mínima) liga o desconto real das vendas da categoria." : "A política de desconto é definida por quem altera preços."} icone={Tags}>
          <ul className="divide-y divide-borda">
            {cats.map((c) => (
              <li key={c.id} className="space-y-1 py-2 text-sm">
                <p className="flex flex-wrap items-center gap-2"><strong>{c.nome}</strong>{!c.ativa && <Selo tom="neutro">inativa</Selo>}
                  <span className="text-xs text-suave">{c.desconto_teto_pb === null ? "desconto desligado (sem política)" : `desconto até ${percentualDosPontosBase(c.desconto_teto_pb)}%, margem mínima ${percentualDosPontosBase(c.margem_minima_pb)}%`}</span>
                </p>
                <details>
                  <summary className={resumo}><Pencil aria-hidden className="size-4" /> Editar</summary>
                  <form action={salvarCategoria} className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="id" value={c.id} />{ocultoBusca}
                    <label className={rotulo}>Nome<input name="nome" required maxLength={60} defaultValue={c.nome} className={campo} /></label>
                    <Situacao ativo={c.ativa} rotuloAtivo="Categoria ativa" />
                    <div className="sm:col-span-2"><Motivo exemplo="Novo nome da categoria" /></div>
                    <Botao type="submit" tamanho="sm" className="sm:col-span-2">Salvar categoria</Botao>
                  </form>
                  {preco.data && (
                    <form action={definirPolitica} className="mt-3 grid gap-2 rounded-xl bg-fundo p-3 sm:grid-cols-2">
                      <input type="hidden" name="categoria" value={c.id} />{ocultoBusca}
                      <label className={rotulo}>Desconto máximo (%)<input name="teto" inputMode="decimal" defaultValue={percentualDosPontosBase(c.desconto_teto_pb)} placeholder="vazio = desligado" className={campo} /></label>
                      <label className={rotulo}>Margem mínima (%)<input name="margem" inputMode="decimal" defaultValue={percentualDosPontosBase(c.margem_minima_pb)} placeholder="vazio = desligado" className={campo} /></label>
                      <div className="sm:col-span-2"><Motivo exemplo="Política de desconto definida" /></div>
                      <Botao type="submit" tamanho="sm" variante="secundario" className="sm:col-span-2">Gravar política de desconto</Botao>
                    </form>
                  )}
                </details>
              </li>
            ))}
          </ul>
          <form action={salvarCategoria} className="mt-3 grid gap-2 sm:grid-cols-2">
            {ocultoBusca}
            <label className={rotulo}>Nova categoria<input name="nome" required maxLength={60} className={campo} /></label>
            <Motivo exemplo="Linha nova" />
            <Botao type="submit" tamanho="sm" variante="secundario" className="sm:col-span-2"><Plus aria-hidden className="size-4" /> Cadastrar categoria</Botao>
          </form>
        </Cartao>
      </section>

      <section id="marcas" className="mt-4 scroll-mt-24">
        <Cartao titulo="Marcas" icone={Tag}>
          <ul className="divide-y divide-borda">
            {(marcas.data as Marca[]).map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <details>
                  <summary className="flex min-h-10 cursor-pointer items-center gap-2"><strong>{m.nome}</strong><Pencil aria-hidden className="size-3.5 text-acao" /></summary>
                  <form action={salvarMarca} className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="id" value={m.id} />{ocultoBusca}
                    <label className={rotulo}>Nome<input name="nome" required maxLength={60} defaultValue={m.nome} className={campo} /></label>
                    <Motivo exemplo="Grafia correta" />
                    <Botao type="submit" tamanho="sm" className="sm:col-span-2">Salvar marca</Botao>
                  </form>
                </details>
              </li>
            ))}
          </ul>
          <form action={salvarMarca} className="mt-3 grid gap-2 sm:grid-cols-2">
            {ocultoBusca}
            <label className={rotulo}>Nova marca<input name="nome" required maxLength={60} className={campo} /></label>
            <Motivo exemplo="Marca nova na rede" />
            <Botao type="submit" tamanho="sm" variante="secundario" className="sm:col-span-2"><Plus aria-hidden className="size-4" /> Cadastrar marca</Botao>
          </form>
        </Cartao>
      </section>
    </MoldeReal>
  );
}

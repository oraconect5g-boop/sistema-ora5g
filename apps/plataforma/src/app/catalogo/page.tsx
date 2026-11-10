import { ImageOff, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Cartao, Selo, TituloPagina } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { buscarNoCatalogo, termoDaBusca } from "../../lib/catalogo/busca";
import { inteiroDoBanco } from "../../lib/dinheiro";
import { textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { configuracaoSupabase } from "../../lib/supabase/configuracao";
import { EnviarFoto } from "./EnviarFoto";
import { FotoAmpliavel } from "./FotoAmpliavel";

export const metadata: Metadata = { title: "Catálogo e fotos" };
export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = {
  aparelho: "Aparelho", acessorio: "Acessório", chip: "Chip", ativacao: "Ativação", portabilidade: "Portabilidade", recarga: "Recarga", servico: "Serviço",
};
const LIMITE = 200;

// Catálogo real (ORA-CAT-001, ORA-CAT-011): foto, nome, SKU e quanto há na loja do turno.
// Custo e margem nunca vêm para esta tela (o vendedor também a usa). Fotos por URL assinada de
// 1 hora, criada aqui no servidor com a sessão da pessoa (o Storage confere a organização).
export default async function Catalogo({ searchParams }: { searchParams: Promise<{ q?: ValorDeParametro; pendentes?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const busca = (textoDoParametro(parametros.q) ?? "").trim().toLowerCase().slice(0, 60);
  const soPendentes = textoDoParametro(parametros.pendentes) === "1";
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;

  // Busca na fonte, ANTES do limite (REV-038, #40): nome do produto, SKU ou nome da variante, a
  // mesma do estoque e do PDV (lib/catalogo/busca.ts).
  const termo = termoDaBusca(busca);
  const [podeEnviar, pendencias, achados] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "catalogo.fotos", p_unidade: unidade }),
    supabase.rpc("pendencias_de_foto"),
    termo ? buscarNoCatalogo(supabase, termo, { limite: LIMITE }) : Promise.resolve(null),
  ]);
  if (podeEnviar.error || pendencias.error) throw new FalhaDoServico("catalogo");
  const pendentesPorProduto = new Set(pendencias.data.map((p) => p.produto_id));
  let ids: string[] | null = achados ? achados.produtos : null;
  if (soPendentes) ids = (ids ?? [...pendentesPorProduto]).filter((id) => pendentesPorProduto.has(id));
  const consulta = supabase.from("produtos").select("id, nome, tipo, organizacao_id").eq("ativo", true);
  const produtos = ids && ids.length === 0
    ? { data: [] as { id: string; nome: string; tipo: string; organizacao_id: string }[], error: null }
    : await (ids ? consulta.in("id", ids) : consulta).order("nome").limit(LIMITE);
  if (produtos.error) throw new FalhaDoServico("catalogo");
  const produtoIds = produtos.data.map((p) => p.id);
  const [variantes, fotos] = produtoIds.length
    ? await Promise.all([
        supabase.from("variantes").select("id, produto_id, sku, nome, cor").eq("ativa", true).in("produto_id", produtoIds).order("sku"),
        supabase.from("fotos_produto").select("produto_id, variante_id, caminho, ilustracao").in("produto_id", produtoIds).is("substituida_em", null),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (variantes.error || fotos.error) throw new FalhaDoServico("catalogo");
  const saldos = variantes.data.length
    ? await supabase.from("estoque_saldos").select("variante_id, quantidade, reservado").eq("unidade_id", unidade).in("variante_id", variantes.data.map((v) => v.id))
    : { data: [], error: null };
  if (saldos.error) throw new FalhaDoServico("catalogo");

  const assinadas = fotos.data.length
    ? await supabase.storage.from("produtos").createSignedUrls(fotos.data.map((f) => f.caminho), 3600)
    : { data: [], error: null };
  if (assinadas.error) throw new FalhaDoServico("fotos");
  const urlDe = new Map(assinadas.data.map((a) => [a.path, a.error ? null : a.signedUrl]));
  const fotoDe = (produto: string, variante: string | null) => fotos.data.find((f) => f.produto_id === produto && f.variante_id === variante);
  const disponivel = (variante: string) => {
    const s = saldos.data.find((x) => x.variante_id === variante);
    return s ? inteiroDoBanco(s.quantidade) - inteiroDoBanco(s.reservado) : 0;
  };
  const configuracao = podeEnviar.data ? configuracaoSupabase() : null;
  const lista = produtos.data;

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Catálogo e fotos" />
      <p className="text-sm text-suave">Loja do turno: <strong>{situacao.unidade_nome}</strong>. Toque na foto para ampliar.</p>

      <form className="mt-4 flex flex-wrap gap-2" role="search">
        <label className="min-w-0 flex-1 text-sm font-medium">Buscar por nome ou SKU
          <input name="q" defaultValue={busca} className="mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" />
        </label>
        {soPendentes && <input type="hidden" name="pendentes" value="1" />}
        <button type="submit" className="mt-6 min-h-11 rounded-botao bg-acao px-4 text-sm font-semibold text-white">Buscar</button>
      </form>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {pendencias.data.length > 0 ? (
          <><ImageOff aria-hidden className="size-4 text-aviso" /> {pendencias.data.length} {pendencias.data.length === 1 ? "foto pendente" : "fotos pendentes"} ·{" "}
            <Link href={soPendentes ? "/catalogo" : "/catalogo?pendentes=1"} className="font-semibold text-acao hover:underline">{soPendentes ? "ver tudo" : "ver só os pendentes"}</Link></>
        ) : <Selo tom="sucesso" ponto>todos os produtos com foto</Selo>}
      </p>
      {produtos.data.length === LIMITE && <Aviso tom="info" className="mt-3">Mostrando os primeiros {LIMITE} produtos{busca ? " desta busca; refine o termo" : "; use a busca"}.</Aviso>}

      <Cartao className="mt-4" titulo={`${lista.length} ${lista.length === 1 ? "produto" : "produtos"}`} icone={Package}>
        <ul className="divide-y divide-borda">
          {lista.map((p) => {
            const doProduto = variantes.data.filter((v) => v.produto_id === p.id);
            const cores = new Set(doProduto.filter((v) => v.cor).map((v) => v.cor?.toLowerCase()));
            const porCor = cores.size >= 2;
            const foto = fotoDe(p.id, null);
            const rotulo = `${p.nome} (${doProduto[0]?.sku ?? "sem SKU"})`;
            return (
              <li key={p.id} className="space-y-3 py-4">
                <div className="flex gap-3">
                  <FotoAmpliavel url={foto ? (urlDe.get(foto.caminho) ?? null) : null} rotulo={rotulo} ilustracao={foto?.ilustracao ?? false} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.nome}</p>
                    <p className="text-xs text-suave">{TIPOS[p.tipo] ?? p.tipo}{!foto && " · sem foto do produto"}</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {doProduto.map((v) => (
                        <li key={v.id} className="numeros">{v.sku} · {v.nome}{["aparelho", "acessorio", "chip"].includes(p.tipo) ? ` · ${disponivel(v.id)} na loja` : ""}{["aparelho", "acessorio", "chip"].includes(p.tipo) && <> · <Link href={`/estoque?variante=${v.id}`} className="font-semibold text-acao">onde tem</Link></>}</li>
                      ))}
                    </ul>
                  </div>
                  {configuracao && <EnviarFoto supabaseUrl={configuracao.url} chavePublica={configuracao.chavePublica} organizacao={p.organizacao_id} produto={p.id} variante={null} rotulo={rotulo} />}
                </div>
                {porCor && (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {doProduto.filter((v) => v.cor).map((v) => {
                      const daCor = fotoDe(p.id, v.id);
                      return (
                        <li key={v.id} className="flex items-center gap-2 rounded-xl bg-fundo p-2 text-xs">
                          <FotoAmpliavel url={daCor ? (urlDe.get(daCor.caminho) ?? null) : null} rotulo={`${v.nome} (${v.sku})`} ilustracao={daCor?.ilustracao ?? false} />
                          <span className="min-w-0 flex-1"><strong>{v.cor}</strong><span className="numeros block text-suave">{v.sku}</span>{!daCor && <span className="block text-aviso">cor sem foto própria</span>}</span>
                          {configuracao && <EnviarFoto supabaseUrl={configuracao.url} chavePublica={configuracao.chavePublica} organizacao={p.organizacao_id} produto={p.id} variante={v.id} rotulo={`${v.nome} (${v.sku})`} />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          {lista.length === 0 && <li className="py-6 text-sm text-suave">Nada encontrado.</li>}
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

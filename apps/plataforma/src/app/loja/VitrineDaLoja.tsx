import { ChevronLeft, ChevronRight, Clock, LayoutGrid, PackageSearch, Search, Store, Wallet } from "lucide-react";
import Link from "next/link";

import { EstadoVazio, Selo } from "../../componentes/ui";
import { brl } from "../../lib/formato";
import { atalhosDoInicio, iconeDaCategoria } from "../../lib/loja/categorias";
import { paginasDaVitrine, POR_PAGINA_NA_VITRINE, type Vitrine } from "../../lib/loja/vitrine";

const botaoDePagina = "inline-flex min-h-11 items-center gap-1 rounded-botao border border-borda bg-white px-4 text-sm font-semibold text-acao";
const campo = "min-h-12 w-full rounded-botao border border-white/40 bg-white pl-10 pr-3 text-[15px] shadow-lg shadow-black/10 outline-none focus:border-acao focus:ring-2 focus:ring-white/40";

// O que a loja garante, na vitrine principal (ONLINE-g): o que vale hoje (o pagamento pelo site segue desligado).
const VANTAGENS = [
  { icone: Store, titulo: "Retire na loja", texto: "Escolha a loja e retire pessoalmente." },
  { icone: Clock, titulo: "Reserva por 24 horas", texto: "O carrinho reserva tudo de uma vez." },
  { icone: Wallet, titulo: "Pague na retirada", texto: "Dinheiro, Pix ou cartão no balcão." },
] as const;

// O desenho da vitrine (ONLINE-a): a busca, as categorias e a grade dos produtos, com o preço "a partir de" e o estoque.
// ONLINE-f: quantos são, de 60 em 60, e as páginas ("Anteriores" e "Próximos"), guardando a busca e a categoria.
// ONLINE-g: a cara de loja: o topo com gradiente e os atalhos ilustrados das categorias (no computador), as vantagens, as
// categorias em blocos com ícone e o título da seção. A vitrine principal (sem busca, sem categoria, na primeira página)
// mostra os atalhos e as vantagens; a busca e a categoria vão direto aos produtos.
export function VitrineDaLoja({ vitrine, fotos, busca, categoria }: { vitrine: Vitrine; fotos: Map<string, string>; busca: string | null; categoria: string | null }) {
  const endereco = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ busca, categoria, ...extra })) if (v) p.set(k, v);
    const texto = p.toString();
    return texto ? `/loja?${texto}` : "/loja";
  };
  const { total, pagina, paginas } = paginasDaVitrine(vitrine);
  const inicio = (pagina - 1) * POR_PAGINA_NA_VITRINE + 1;
  const contagem = paginas > 1 ? `Mostrando ${inicio}–${inicio + vitrine.produtos.length - 1} de ${total} produtos` : `${total} ${total === 1 ? "produto" : "produtos"}`;
  const principal = !busca && !categoria && pagina === 1;
  const atalhos = principal ? atalhosDoInicio(vitrine.categorias) : [];
  const daCategoria = vitrine.categorias.find((c) => c.id === categoria)?.nome;
  const tituloDaSecao = busca ? `Resultados para "${busca}"` : daCategoria ?? "Todos os produtos";

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-cartao bg-gradient-to-br from-acao via-acao-escura to-[#4c1fb8] px-5 py-7 text-white sm:px-8 sm:py-10">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-white/10 blur-2xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-28 left-1/4 size-72 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <h1 className="max-w-2xl text-balance text-[26px] font-bold leading-tight tracking-tight sm:text-4xl">Tudo para o seu celular, com retirada na loja</h1>
            <p className="mt-2 max-w-xl text-sm text-white/85 sm:text-base">Escolha aqui, confira o preço e o estoque de cada loja e retire pessoalmente.</p>
            <form action="/loja" className="relative mt-5 max-w-xl" role="search">
              {categoria && <input type="hidden" name="categoria" value={categoria} />}
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-suave" />
              <label className="sr-only" htmlFor="busca-da-loja">Buscar produto</label>
              <input id="busca-da-loja" name="busca" defaultValue={busca ?? ""} maxLength={60} placeholder="Buscar: Galaxy, capa, carregador..." className={`${campo} text-texto`} />
            </form>
          </div>
          {atalhos.length > 0 && (
            <ul aria-label="Atalhos das categorias" className="hidden grid-cols-2 gap-3 lg:grid">
              {atalhos.map((c, n) => {
                const Icone = iconeDaCategoria(c.nome);
                return (
                  <li key={c.id} className={n % 2 === 1 ? "translate-y-4" : ""}>
                    <Link href={endereco({ categoria: c.id })}
                      className="flex size-32 flex-col items-center justify-center gap-2 rounded-cartao bg-white/95 px-2 text-center text-texto shadow-xl shadow-black/15 transition hover:-translate-y-0.5 hover:bg-white">
                      <span className="grid size-14 place-items-center rounded-2xl bg-acao-clara text-acao"><Icone aria-hidden className="size-7" /></span>
                      <span className="line-clamp-2 text-[11px] font-semibold uppercase leading-tight tracking-wide">{c.nome}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {principal && (
        <ul aria-label="Como funciona" className="grid grid-cols-3 gap-2 sm:gap-3">
          {VANTAGENS.map((v) => (
            <li key={v.titulo} className="flex flex-col items-center gap-2 rounded-cartao border border-borda bg-white p-3 text-center sm:flex-row sm:gap-3 sm:p-4 sm:text-left">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-acao-clara text-acao sm:size-11"><v.icone aria-hidden className="size-5" /></span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold leading-tight sm:text-sm">{v.titulo}</span>
                <span className="hidden text-xs text-suave sm:block">{v.texto}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {vitrine.categorias.length > 0 && (
        <nav aria-label="Categorias" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ id: null, nome: "Tudo" }, ...vitrine.categorias].map((c) => {
            const escolhida = c.id === null ? !categoria : categoria === c.id;
            const Icone = c.id === null ? LayoutGrid : iconeDaCategoria(c.nome);
            return (
              <Link key={c.id ?? "tudo"} href={endereco({ categoria: c.id })} aria-current={escolhida ? "page" : undefined}
                className={`flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-3 text-center transition ${escolhida ? "border-acao bg-acao text-white" : "border-borda bg-white text-texto hover:border-acao/50"}`}>
                <span className={`grid size-10 place-items-center rounded-full ${escolhida ? "bg-white/20" : "bg-acao-clara text-acao"}`}><Icone aria-hidden className="size-5" /></span>
                <span className="line-clamp-2 text-[10.5px] font-semibold uppercase leading-tight">{c.nome}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {vitrine.produtos.length === 0 ? (
        busca || categoria
          ? <EstadoVazio titulo="Nada encontrado" icone={PackageSearch}>{busca ? `Nenhum produto com "${busca}". ` : ""}Tente outra busca ou veja tudo.</EstadoVazio>
          : <EstadoVazio titulo="Em breve" icone={Store}>Os produtos da loja online aparecem aqui assim que forem publicados.</EstadoVazio>
      ) : (
        <>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">{tituloDaSecao}</h2>
          <p className="numeros text-sm text-suave">{contagem}</p>
        </div>
        <ul aria-label="Produtos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {vitrine.produtos.map((p) => {
            const foto = p.foto ? fotos.get(p.foto) : undefined;
            return (
              <li key={p.id}>
                <Link href={`/loja/${p.id}`} className="group flex h-full flex-col overflow-hidden rounded-cartao border border-borda bg-white transition hover:-translate-y-0.5 hover:border-acao/50 hover:shadow-lg hover:shadow-acao/10">
                  <span className="grid aspect-square place-items-center bg-white">
                    {foto
                      // eslint-disable-next-line @next/next/no-img-element -- link temporário do armazenamento, não passa pelo otimizador
                      ? <img src={foto} alt={p.nome} loading="lazy" className="size-full object-contain p-3 transition group-hover:scale-[1.03]" />
                      : <PackageSearch aria-hidden className="size-10 text-slate-300" />}
                  </span>
                  <span className="flex flex-1 flex-col gap-1 border-t border-borda/70 p-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-suave">{[p.marca, p.categoria].filter(Boolean).join(" · ")}</span>
                    <span className="line-clamp-2 text-[13px] font-medium leading-snug">{p.nome}</span>
                    <span className="mt-auto pt-1 text-xs text-suave">a partir de</span>
                    <span className="numeros text-lg font-bold text-texto">{brl(p.preco_a_partir_centavos)}</span>
                    <span>{p.disponivel ? <Selo tom="sucesso" ponto>Disponível</Selo> : <Selo tom="neutro">Sem estoque</Selo>}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {paginas > 1 && (
          <nav aria-label="Páginas" className="space-y-2">
            <p className="numeros text-center text-sm text-suave">{`Página ${pagina} de ${paginas}`}</p>
            <div className="flex items-center justify-between gap-3">
              {pagina > 1
                ? <Link href={endereco({ pagina: pagina > 2 ? String(pagina - 1) : null })} rel="prev" className={botaoDePagina}><ChevronLeft aria-hidden className="size-4" /> Anteriores</Link>
                : <span />}
              {pagina < paginas
                ? <Link href={endereco({ pagina: String(pagina + 1) })} rel="next" className={botaoDePagina}>Próximos <ChevronRight aria-hidden className="size-4" /></Link>
                : <span />}
            </div>
          </nav>
        )}
        </>
      )}
    </div>
  );
}

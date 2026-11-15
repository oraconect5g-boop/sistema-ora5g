import { PackageSearch, Search, Store } from "lucide-react";
import Link from "next/link";

import { EstadoVazio, Selo } from "../../componentes/ui";
import { brl } from "../../lib/formato";
import type { Vitrine } from "../../lib/loja/vitrine";

const campo = "min-h-12 w-full rounded-botao border border-borda bg-white pl-10 pr-3 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";

// O desenho da vitrine (ONLINE-a): a busca, as categorias e a grade dos produtos, com o preço "a partir de" e o estoque.
export function VitrineDaLoja({ vitrine, fotos, busca, categoria }: { vitrine: Vitrine; fotos: Map<string, string>; busca: string | null; categoria: string | null }) {
  const endereco = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ busca, categoria, ...extra })) if (v) p.set(k, v);
    const texto = p.toString();
    return texto ? `/loja?${texto}` : "/loja";
  };

  return (
    <div className="space-y-6">
      <section className="rounded-cartao bg-gradient-to-br from-acao to-acao-escura px-5 py-7 text-white sm:px-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Celulares e acessórios, com retirada na loja</h1>
        <p className="mt-1 max-w-xl text-sm text-white/85 sm:text-base">Escolha aqui, confira o preço e o estoque de cada loja e retire pessoalmente.</p>
        <form action="/loja" className="relative mt-5 max-w-xl" role="search">
          {categoria && <input type="hidden" name="categoria" value={categoria} />}
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-suave" />
          <label className="sr-only" htmlFor="busca-da-loja">Buscar produto</label>
          <input id="busca-da-loja" name="busca" defaultValue={busca ?? ""} maxLength={60} placeholder="Buscar: Galaxy, capa, carregador..." className={`${campo} text-texto`} />
        </form>
      </section>

      {vitrine.categorias.length > 0 && (
        <nav aria-label="Categorias" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link href={endereco({ categoria: null })} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${categoria ? "border-borda bg-white text-texto" : "border-acao bg-acao text-white"}`}>Tudo</Link>
          {vitrine.categorias.map((c) => (
            <Link key={c.id} href={endereco({ categoria: c.id })} aria-current={categoria === c.id ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${categoria === c.id ? "border-acao bg-acao text-white" : "border-borda bg-white text-texto"}`}>{c.nome}</Link>
          ))}
        </nav>
      )}

      {vitrine.produtos.length === 0 ? (
        busca || categoria
          ? <EstadoVazio titulo="Nada encontrado" icone={PackageSearch}>{busca ? `Nenhum produto com "${busca}". ` : ""}Tente outra busca ou veja tudo.</EstadoVazio>
          : <EstadoVazio titulo="Em breve" icone={Store}>Os produtos da loja online aparecem aqui assim que forem publicados.</EstadoVazio>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {vitrine.produtos.map((p) => {
            const foto = p.foto ? fotos.get(p.foto) : undefined;
            return (
              <li key={p.id}>
                <Link href={`/loja/${p.id}`} className="group flex h-full flex-col overflow-hidden rounded-cartao border border-borda bg-white transition hover:border-acao/50 hover:shadow-sm">
                  <span className="grid aspect-square place-items-center bg-slate-50">
                    {foto
                      // eslint-disable-next-line @next/next/no-img-element -- link temporário do armazenamento, não passa pelo otimizador
                      ? <img src={foto} alt={p.nome} loading="lazy" className="size-full object-contain p-3 transition group-hover:scale-[1.02]" />
                      : <PackageSearch aria-hidden className="size-10 text-slate-300" />}
                  </span>
                  <span className="flex flex-1 flex-col gap-1 p-3">
                    <span className="text-xs text-suave">{[p.marca, p.categoria].filter(Boolean).join(" · ")}</span>
                    <span className="line-clamp-2 text-sm font-semibold">{p.nome}</span>
                    <span className="mt-auto pt-1 text-xs text-suave">a partir de</span>
                    <span className="numeros text-lg font-bold">{brl(p.preco_a_partir_centavos)}</span>
                    <span>{p.disponivel ? <Selo tom="sucesso" ponto>Disponível</Selo> : <Selo tom="neutro">Sem estoque</Selo>}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

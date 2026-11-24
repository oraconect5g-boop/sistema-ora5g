import { ArrowLeft, MapPin, PackageSearch } from "lucide-react";
import Link from "next/link";

import { Botao, Selo } from "../../../componentes/ui";
import { brl } from "../../../lib/formato";
import { DISPONIBILIDADES, type DetalheDoProduto } from "../../../lib/loja/vitrine";
import { adicionarAoCarrinho } from "../carrinho/acoes";

export type ImagemDaLoja = DetalheDoProduto["fotos"][number] & { url: string };

// O desenho do produto (ONLINE-a): as fotos, a descrição e, em cada variação, o preço do balcão e o estoque de cada loja.
// ONLINE-e (24/11, a pedido do proprietário): um caminho só para comprar, o carrinho (que reserva tudo de uma vez); a página
// de reservar um item continua no ar para os links antigos, mas não é mais oferecida aqui. Sem foto, um espaço baixo, para o
// preço e as lojas aparecerem logo.
export function DetalheDaLoja({ produto, imagens }: { produto: DetalheDoProduto; imagens: ImagemDaLoja[] }) {
  const p = produto;
  const comEstoque = p.variantes.some((v) => v.lojas.some((l) => l.disponibilidade !== "sem_estoque"));

  return (
    <div className="space-y-6">
      <Link href="/loja" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Voltar à loja</Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Fotos" className="space-y-3">
          {imagens[0] ? (
            <div className="grid aspect-square place-items-center overflow-hidden rounded-cartao border border-borda bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- link temporário do armazenamento, não passa pelo otimizador */}
              <img src={imagens[0].url} alt={p.nome} className="size-full object-contain p-4" />
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center gap-2 rounded-cartao border border-dashed border-borda bg-white text-sm text-suave">
              <PackageSearch aria-hidden className="size-7 text-slate-300" />Sem foto por enquanto
            </div>
          )}
          {imagens.length > 1 && (
            <ul className="flex gap-2 overflow-x-auto">
              {imagens.slice(1).map((f) => (
                <li key={f.caminho} className="size-20 shrink-0 overflow-hidden rounded-xl border border-borda bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element -- link temporário do armazenamento */}
                  <img src={f.url} alt={`${p.nome}: outra foto`} loading="lazy" className="size-full object-contain p-1" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm text-suave">{[p.marca, p.categoria].filter(Boolean).join(" · ")}</p>
            <h1 className="text-2xl font-bold tracking-tight">{p.nome}</h1>
            {p.modelo && <p className="text-sm text-suave">Modelo {p.modelo}</p>}
          </div>
          {p.descricao && <p className="whitespace-pre-line text-sm leading-relaxed">{p.descricao}</p>}

          <div className="rounded-cartao border border-acao/20 bg-acao-clara p-4 text-sm">
            <p className="font-semibold">Como comprar</p>
            <p className="mt-1">{comEstoque
              ? "Escolha a loja e toque em \"Pôr no carrinho\". No carrinho, você reserva tudo de uma vez por 24 horas (até 3 unidades da mesma loja) e paga e retira na loja. O preço é o do balcão de cada loja."
              : "No momento, nenhuma loja tem este produto em estoque. Volte em breve ou fale com a loja mais perto de você."}</p>
          </div>

          <div className="space-y-4">
            {p.variantes.map((v) => (
              <article key={v.id} className="rounded-cartao border border-borda bg-white p-4">
                <h2 className="font-semibold">{v.nome}</h2>
                {(v.cor || v.capacidade) && <p className="text-xs text-suave">{[v.cor, v.capacidade].filter(Boolean).join(" · ")}</p>}
                <ul className="mt-3 divide-y divide-borda">
                  {v.lojas.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                      <span className="min-w-0">
                        <span className="block font-medium">{l.nome}</span>
                        {(l.endereco || l.cidade) && <span className="flex items-start gap-1 text-xs text-suave"><MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />{[l.endereco, l.cidade].filter(Boolean).join(" · ")}</span>}
                      </span>
                      <span className="flex flex-wrap items-center justify-end gap-2">
                        <Selo tom={DISPONIBILIDADES[l.disponibilidade]?.tom ?? "neutro"} ponto={l.disponibilidade !== "sem_estoque"}>{DISPONIBILIDADES[l.disponibilidade]?.nome ?? l.disponibilidade}</Selo>
                        <span className="numeros text-base font-bold">{brl(l.preco_centavos)}</span>
                        {l.disponibilidade !== "sem_estoque" && (
                          <form action={adicionarAoCarrinho}>
                            <input type="hidden" name="produto" value={p.id} /><input type="hidden" name="variante" value={v.id} /><input type="hidden" name="loja" value={l.id} />
                            <Botao type="submit" tamanho="sm" enquanto="Pondo…">Pôr no carrinho</Botao>
                          </form>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

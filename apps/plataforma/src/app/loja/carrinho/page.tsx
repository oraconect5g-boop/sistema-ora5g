import { randomUUID } from "node:crypto";

import { ShoppingCart, Store } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { Aviso, Botao, EstadoVazio, Selo } from "../../../componentes/ui";
import { brl } from "../../../lib/formato";
import { COOKIE_DO_CARRINHO, lerCarrinho, linhasDoCarrinho, UNIDADES_NO_CARRINHO } from "../../../lib/loja/carrinho";
import { ehUuidDaVitrine, organizacaoDaLoja, type DetalheDoProduto } from "../../../lib/loja/vitrine";
import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { adicionarAoCarrinho, tirarDoCarrinho } from "./acoes";
import { FormularioDoPedido } from "./FormularioDoPedido";

export const metadata: Metadata = { title: "Carrinho" };
export const dynamic = "force-dynamic";

const OK: Record<string, string> = { posto: "Item no carrinho.", tirado: "Item tirado do carrinho." };
const ERROS: Record<string, string> = {
  item: "Não deu para pôr este item no carrinho. Volte ao produto e tente de novo.",
  cheio: `O carrinho leva até ${UNIDADES_NO_CARRINHO} unidades. Reserve este pedido e faça outro depois.`,
  outra_loja: "O carrinho é de uma loja só (a de retirada). Quer trocar de loja? O carrinho recomeça com este item.",
};

// O carrinho do site (lote ONLINE-d: ORA-ONLINE-002; ADR-023): até 3 unidades de uma loja, com o preço do balcão e o
// estoque de agora de cada uma; o pedido reserva tudo de uma vez para retirar e pagar na loja.
export default async function Carrinho({ searchParams }: { searchParams: Promise<Record<"ok" | "erro" | "produto" | "variante" | "loja", ValorDeParametro>> }) {
  const parametros = await searchParams;
  const carrinho = lerCarrinho((await cookies()).get(COOKIE_DO_CARRINHO)?.value);
  const ok = textoDoParametro(parametros.ok);
  const erro = textoDoParametro(parametros.erro);
  const troca = erro === "outra_loja" && ehUuidDaVitrine(parametros.produto) && ehUuidDaVitrine(parametros.variante) && ehUuidDaVitrine(parametros.loja)
    ? { produto: parametros.produto, variante: parametros.variante, loja: parametros.loja } : null;
  const avisos = (
    <>
      {ok && Object.hasOwn(OK, ok) && <Aviso tom="sucesso">{OK[ok]}</Aviso>}
      {erro && Object.hasOwn(ERROS, erro) && (
        <Aviso tom={erro === "outra_loja" ? "aviso" : "perigo"}>
          {ERROS[erro]}
          {troca && (
            <form action={adicionarAoCarrinho} className="mt-2">
              <input type="hidden" name="produto" value={troca.produto} /><input type="hidden" name="variante" value={troca.variante} />
              <input type="hidden" name="loja" value={troca.loja} /><input type="hidden" name="trocar" value="sim" />
              <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Trocando…">Trocar de loja</Botao>
            </form>
          )}
        </Aviso>
      )}
    </>
  );
  const organizacao = organizacaoDaLoja();
  if (!organizacao) {
    return <EstadoVazio titulo="A loja online ainda não está no ar" icone={Store}>Enquanto isso, procure uma das lojas da Ora 5G.</EstadoVazio>;
  }
  if (carrinho.itens.length === 0) {
    return (
      <div className="space-y-4">
        {avisos}
        <EstadoVazio titulo="O carrinho está vazio" icone={ShoppingCart}>Escolha um produto na <Link href="/loja" className="font-semibold text-acao">loja</Link> e toque em &quot;Pôr no carrinho&quot; na loja de retirada.</EstadoVazio>
      </div>
    );
  }
  const supabase = await clienteSupabaseServidor();
  if (!supabase) {
    return <EstadoVazio titulo="A loja online ainda não está no ar" icone={Store}>Enquanto isso, procure uma das lojas da Ora 5G.</EstadoVazio>;
  }
  const produtos = [...new Set(carrinho.itens.map((i) => i.produto))];
  // PAY-014a: se o pagamento pelo site está ligado (sem a função no banco, ou com falha, conta como desligado).
  const [lidos, pagamento] = await Promise.all([
    Promise.all(produtos.map((p) => supabase.rpc("loja_produto", { p_organizacao: organizacao, p_produto: p }))),
    supabase.rpc("loja_pagamento_disponivel"),
  ]);
  const pagamentoPeloSite = !pagamento.error && pagamento.data === true;
  if (lidos.some((l) => l.error && l.error.code !== "P0002")) {
    console.error("loja: falha ao ler o carrinho", { codigos: lidos.map((l) => l.error?.code ?? null) });
    return <EstadoVazio titulo="A loja online está fora do ar agora" icone={Store}>Tente de novo em instantes.</EstadoVazio>;
  }
  const detalhes = new Map(produtos.flatMap((p, i) => (lidos[i]?.data ? [[p, lidos[i]?.data as unknown as DetalheDoProduto] as const] : [])));
  const { linhas, fora, loja } = linhasDoCarrinho(carrinho, detalhes);
  const total = linhas.reduce((s, l) => s + l.preco_centavos, 0);
  const tirar = (indice: number, rotulo: string) => (
    <form action={tirarDoCarrinho}>
      <input type="hidden" name="indice" value={indice} />
      <Botao type="submit" tamanho="sm" variante="fantasma" enquanto="Tirando…">{rotulo}</Botao>
    </form>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Carrinho</h1>
      {avisos}
      <section className="rounded-cartao border border-borda bg-white p-4">
        <p className="flex items-center gap-2 text-sm"><Store aria-hidden className="size-4 text-suave" /> Retirada em <span className="font-semibold">{loja ?? "loja que não vende mais estes itens"}</span></p>
        <ul className="mt-3 divide-y divide-borda text-sm">
          {linhas.map((l) => (
            <li key={l.indice} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0"><span className="block font-medium">{l.nome}</span>{l.variacao && l.variacao !== l.nome && <span className="block text-xs text-suave">{l.variacao}</span>}</span>
              <span className="flex items-center gap-2">
                {!l.disponivel && <Selo tom="neutro">sem estoque agora</Selo>}
                <span className="numeros font-bold">{brl(l.preco_centavos)}</span>
                {tirar(l.indice, "Tirar")}
              </span>
            </li>
          ))}
          {fora.map((indice) => (
            <li key={`fora-${indice}`} className="flex items-center justify-between gap-2 py-2.5 text-suave">
              <span>Um item não está mais à venda nesta loja.</span>{tirar(indice, "Tirar")}
            </li>
          ))}
          <li className="flex justify-between gap-3 py-2.5 font-bold"><span>Total na loja</span><span className="numeros">{brl(total)}</span></li>
        </ul>
        <p className="mt-2 text-xs text-suave">{`Até ${UNIDADES_NO_CARRINHO} unidades de uma loja. Os preços são os do balcão hoje.`}</p>
      </section>
      {linhas.length > 0 && fora.length === 0 ? <FormularioDoPedido chave={randomUUID()} pagamentoPeloSite={pagamentoPeloSite} /> : (
        <Aviso tom="aviso">Tire do carrinho o que não está mais à venda nesta loja para reservar o pedido.</Aviso>
      )}
      <p className="text-sm"><Link href="/loja" className="font-semibold text-acao">Continuar escolhendo</Link> · <Link href="/loja/pedido" className="font-semibold text-acao">Meu pedido</Link></p>
    </div>
  );
}

import { randomUUID } from "node:crypto";

import { PackagePlus, Search, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, TituloPagina } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { buscarNoCatalogo, termoDaBusca } from "../../../lib/catalogo/busca";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import {
  comALinha, ERROS_DA_TRANSFERENCIA, escreverLinhasDaRemessa, lerLinhasDaRemessa, MAXIMO_DE_LINHAS_DA_REMESSA, semALinha, type LinhaDaRemessa,
} from "../../../lib/transferencias/regras";
import { solicitarRemessa } from "../acoes";

export const metadata: Metadata = { title: "Nova remessa" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
type Parametros = { origem?: ValorDeParametro; destino?: ValorDeParametro; linhas?: ValorDeParametro; busca?: ValorDeParametro; erro?: ValorDeParametro };

// Montar a remessa (lote TRF-a; ORA-INV-007, #60): vários produtos pedidos de uma vez entre as mesmas duas lojas. As
// lojas e as linhas viajam no endereço (cada "Adicionar" é um link), sem rascunho no banco; o pedido final vai numa
// função só, que confere tudo de novo (a loja da pessoa, as lojas da rede, o produto e a quantidade).
export default async function NovaRemessa({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const atual = situacao.unidade_id as string;
  const erro = chaveDoCatalogo(ERROS_DA_TRANSFERENCIA, parametros.erro);
  const origemPedida = textoDoParametro(parametros.origem);
  const destinoPedido = textoDoParametro(parametros.destino);
  // Quem está na loja recebe por padrão (o pedido mais comum é "mandem para cá"); a pessoa troca se for enviar.
  const destino = ehUuid(destinoPedido) ? destinoPedido : atual;
  const origem = ehUuid(origemPedida) ? origemPedida : null;
  const linhas = lerLinhasDaRemessa(textoDoParametro(parametros.linhas));
  const busca = termoDaBusca(textoDoParametro(parametros.busca) ?? "");

  const lojas = await supabase.rpc("transferencia_lojas");
  if (lojas.error) throw new FalhaDoServico("transferencia_lojas");
  const nomeDaLoja = (id: string | null) => lojas.data.find((l) => l.id === id)?.nome ?? "—";
  const achados = busca ? await buscarNoCatalogo(supabase, busca, { limite: 20 }) : null;
  const ids = [...new Set([...linhas.map((l) => l.variante), ...(achados?.variantes ?? [])])];
  const variantes = ids.length
    ? await supabase.from("variantes").select("id, nome, sku, produtos(nome, tipo)").in("id", ids)
    : { data: [], error: null };
  if (variantes.error) throw new FalhaDoServico("remessa_variantes");
  const transferivel = (id: string) => ["aparelho", "chip", "acessorio"].includes(variantes.data.find((v) => v.id === id)?.produtos?.tipo ?? "");
  const nomeDe = (id: string) => {
    const v = variantes.data.find((x) => x.id === id);
    return v ? `${v.produtos?.nome ?? ""} ${v.nome}`.trim() : "Produto";
  };
  const skuDe = (id: string) => variantes.data.find((x) => x.id === id)?.sku ?? "";
  const resultados = (achados?.variantes ?? []).filter(transferivel).slice(0, 20);

  const endereco = (mudancas: { origem?: string | null; destino?: string; linhas?: readonly LinhaDaRemessa[]; busca?: string | null }) => {
    const p = new URLSearchParams();
    const o = mudancas.origem === undefined ? origem : mudancas.origem;
    if (o) p.set("origem", o);
    p.set("destino", mudancas.destino ?? destino);
    const l = mudancas.linhas ?? linhas;
    if (l.length) p.set("linhas", escreverLinhasDaRemessa(l));
    const b = mudancas.busca === undefined ? busca : mudancas.busca;
    if (b) p.set("busca", b);
    return `/transferencias/remessa?${p.toString()}`;
  };
  const prontaParaPedir = origem !== null && origem !== destino && linhas.length > 0 && (origem === atual || destino === atual);

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Nova remessa" subtitulo="Vários produtos de uma vez, entre as mesmas duas lojas. Cada produto segue o caminho de sempre: separar, enviar e receber." />
      {erro && <Aviso tom="perigo">{ERROS_DA_TRANSFERENCIA[erro]}</Aviso>}

      <Cartao titulo="1. De onde vem e para onde vai" subtitulo="A sua loja precisa ser a de origem ou a de destino.">
        {/* next/form: escolher as lojas e buscar só trocam o endereço, sem recarregar a tela. */}
        <Form action="/transferencias/remessa" prefetch={false} className="grid gap-3 sm:grid-cols-2">
          {linhas.length > 0 && <input type="hidden" name="linhas" value={escreverLinhasDaRemessa(linhas)} />}
          <label className="text-sm font-medium">De (origem)
            <select key={origem ?? ""} name="origem" defaultValue={origem ?? ""} required className={campo}>
              <option value="" disabled>Escolha a loja que manda</option>
              {lojas.data.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Para (destino)
            <select key={destino} name="destino" defaultValue={destino} required className={campo}>
              {lojas.data.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </label>
          <Botao type="submit" variante="secundario" enquanto="Abrindo…" className="sm:col-span-2">Usar estas lojas</Botao>
        </Form>
        {origem !== null && origem === destino && <Aviso tom="aviso">A origem e o destino são a mesma loja: escolha duas lojas diferentes.</Aviso>}
        {origem !== null && origem !== atual && destino !== atual && <Aviso tom="aviso">A sua loja ({situacao.unidade_nome}) precisa ser a origem ou o destino.</Aviso>}
      </Cartao>

      <Cartao className="mt-4" titulo="2. Os produtos" subtitulo={`Até ${MAXIMO_DE_LINHAS_DA_REMESSA} produtos. Busque pelo nome, pela marca ou pelo código e toque em "Adicionar".`} icone={Search}>
        <Form action="/transferencias/remessa" prefetch={false} className="flex gap-2" role="search">
          {origem && <input type="hidden" name="origem" value={origem} />}
          <input type="hidden" name="destino" value={destino} />
          {linhas.length > 0 && <input type="hidden" name="linhas" value={escreverLinhasDaRemessa(linhas)} />}
          <input key={busca ?? ""} name="busca" defaultValue={busca ?? ""} placeholder="Ex.: capinha, Galaxy, SKU" aria-label="Buscar produto" className={campo} />
          <Botao type="submit" variante="secundario" enquanto="Buscando…">Buscar</Botao>
        </Form>
        {busca && resultados.length === 0 && <p className="mt-3 text-sm text-suave">Nenhum aparelho, chip ou acessório com esse nome ou código.</p>}
        {resultados.length > 0 && (
          <ul className="mt-3 divide-y divide-borda text-sm">
            {resultados.map((id) => {
              const jaEsta = linhas.some((l) => l.variante === id);
              return (
                <li key={id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="font-medium">{nomeDe(id)}</span><span className="block text-xs text-suave">{skuDe(id)}</span></span>
                  {jaEsta
                    ? <span className="shrink-0 text-xs text-suave">na remessa</span>
                    : <Link href={endereco({ linhas: comALinha(linhas, id) })} className="shrink-0 font-semibold text-acao">Adicionar</Link>}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      <Cartao className="mt-4" titulo="3. Conferir e pedir" subtitulo={origem ? `${nomeDaLoja(origem)} → ${nomeDaLoja(destino)}` : "Escolha as lojas no passo 1."} icone={PackagePlus}>
        {linhas.length === 0 ? (
          <p className="text-sm text-suave">Nenhum produto na remessa ainda.</p>
        ) : (
          <form action={solicitarRemessa} className="space-y-3">
            <input type="hidden" name="chave" value={randomUUID()} />
            {origem && <input type="hidden" name="origem" value={origem} />}
            <input type="hidden" name="destino" value={destino} />
            <ul className="divide-y divide-borda text-sm">
              {linhas.map((l) => (
                <li key={l.variante} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="font-medium">{nomeDe(l.variante)}</span><span className="block text-xs text-suave">{skuDe(l.variante)}</span></span>
                  <span className="flex shrink-0 items-center gap-2">
                    <input type="hidden" name="variante" value={l.variante} />
                    <input name="quantidade" defaultValue={String(l.quantidade)} inputMode="numeric" pattern="[0-9]{1,4}" required aria-label={`Quantidade de ${nomeDe(l.variante)}`} className="min-h-11 w-20 rounded-botao border border-borda px-2 text-right text-sm" />
                    <Link href={endereco({ linhas: semALinha(linhas, l.variante) })} aria-label={`Tirar ${nomeDe(l.variante)}`} className="text-perigo"><Trash2 aria-hidden className="size-4" /></Link>
                  </span>
                </li>
              ))}
            </ul>
            <label className="block text-sm font-medium">Motivo
              <input name="motivo" required minLength={3} maxLength={500} placeholder="Ex.: reposição da semana" className={campo} />
            </label>
            <Botao type="submit" disabled={!prontaParaPedir} className="w-full">Pedir a remessa ({linhas.length} {linhas.length === 1 ? "produto" : "produtos"})</Botao>
            {!prontaParaPedir && <p className="text-xs text-suave">Para pedir, escolha a origem e o destino (a sua loja é uma delas) no passo 1.</p>}
          </form>
        )}
      </Cartao>
      <p className="mt-4 text-sm"><Link href="/transferencias" className="font-semibold text-acao">Voltar às transferências</Link></p>
    </MoldeReal>
  );
}

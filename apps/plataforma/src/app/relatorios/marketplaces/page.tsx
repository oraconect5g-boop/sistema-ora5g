import { ArrowLeft, FileUp, ShoppingBag, Sigma } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { FormularioDeArquivo } from "../../../componentes/FormularioDeArquivo";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Indicador, Selo, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { brl, numero, percentualComSinal } from "../../../lib/formato";
import { CANAIS_DOS_MARKETPLACES } from "../../../lib/marketplaces/leitura";
import { ERROS_DOS_MARKETPLACES, lerPainelDosMarketplaces, margemSobreOBruto, periodoDosMarketplaces, textoDoProblemaDoMarketplace } from "../../../lib/marketplaces/regras";
import { textoDoParametro, chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { EscolherColunasDoMarketplace } from "./EscolherColunasDoMarketplace";

export const metadata: Metadata = { title: "Marketplaces" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const opcao = "flex min-h-11 items-center gap-2 rounded-xl border border-borda px-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao-clara";
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
const ou = (v: number | null, formatar: (n: number) => string) => (v === null ? "—" : formatar(v));
const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
type Importacao = { id: string; numero: number; canal: keyof typeof CANAIS_DOS_MARKETPLACES; arquivo: string; periodo_inicio: string; periodo_fim: string; pedidos: number; novos: number; atualizados: number; importado_em: string };

// Os pedidos do Mercado Livre, da Shopee e do TikTok Shop (lote MKTPL-a: ORA-MKTPL-003 e ORA-MKTPL-005 por arquivo,
// ORA-MKTPL-008; ADR-018): o relatório de vendas de cada canal por arquivo e, por canal, anúncio e pedido, o bruto, as
// tarifas, o frete, os reembolsos, o líquido, o custo do cadastro e o lucro estimado. Só o dono (resultado.ver).
export default async function Marketplaces({ searchParams }: {
  searchParams: Promise<Record<"inicio" | "fim" | "ok" | "erro" | "linha" | "campo" | "texto" | "novos" | "atualizados", ValorDeParametro>>;
}) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  if (!sessao.molde.permissoes.has("resultado.ver")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">{ERROS_DOS_MARKETPLACES.permissao}</Aviso></MoldeReal>;
  }
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { inicio, fim } = periodoDosMarketplaces(textoDoParametro(parametros.inicio), textoDoParametro(parametros.fim), hoje);
  const { supabase } = sessao;
  const [lido, importacoes] = await Promise.all([
    supabase.rpc("marketplace_painel", { p_inicio: inicio, p_fim: fim }),
    supabase.from("marketplace_importacoes").select("id, numero, canal, arquivo, periodo_inicio, periodo_fim, pedidos, novos, atualizados, importado_em")
      .order("importado_em", { ascending: false }).limit(10),
  ]);
  if (lido.error) throw new FalhaDoServico("marketplace_painel");
  if (importacoes.error) throw new FalhaDoServico("marketplace_importacoes");
  const painel = lerPainelDosMarketplaces(lido.data);
  const soma = (f: (c: (typeof painel.canais)[number]) => number) => painel.canais.reduce((s, c) => s + f(c), 0);
  const total = { bruto: soma((c) => c.bruto), liquido: soma((c) => c.liquido), lucro: soma((c) => c.lucro), pedidos: soma((c) => c.pedidos), semCusto: soma((c) => c.pedidosSemCusto) };
  const erro = chaveDoCatalogo(ERROS_DOS_MARKETPLACES, parametros.erro);
  const problema = erro === "linha" ? textoDoProblemaDoMarketplace(textoDoParametro(parametros.linha), textoDoParametro(parametros.campo), textoDoParametro(parametros.texto)) : null;
  const ok = textoDoParametro(parametros.ok);
  const contagemDoParametro = (v: ValorDeParametro) => { const x = textoDoParametro(v); return x !== undefined && /^\d{1,6}$/.test(x) ? Number(x) : 0; };

  return (
    <MoldeReal sessao={sessao} largura="max-w-6xl">
      <Link href="/relatorios" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Relatórios</Link>
      <TituloPagina titulo="Marketplaces" subtitulo={`De ${dataCurta(inicio)} a ${dataCurta(fim)}: os pedidos do Mercado Livre, da Shopee e do TikTok Shop, com o bruto, o que o canal cobrou, o líquido e o lucro estimado.`} />
      {ok === "importado" && <Aviso tom="sucesso" className="mt-4">Pedidos importados: {plural(contagemDoParametro(parametros.novos), "novo", "novos")} e {plural(contagemDoParametro(parametros.atualizados), "atualizado", "atualizados")} (o mesmo pedido nunca se repete).</Aviso>}
      {ok === "repetido" && <Aviso tom="info" className="mt-4">Este arquivo já tinha sido importado: nada mudou.</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{problema ?? ERROS_DOS_MARKETPLACES[erro]}</Aviso>}

      <Form action="/relatorios/marketplaces" prefetch={false} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium">De<input key={inicio} name="inicio" type="date" defaultValue={inicio} className={campo} /></label>
        <label className="text-xs font-medium">Até<input key={fim} name="fim" type="date" defaultValue={fim} className={campo} /></label>
        <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Carregando…">Ver</Botao>
      </Form>

      <section aria-label="Resumo dos marketplaces" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Vendido (bruto)" valor={brl(total.bruto)} detalhe={plural(total.pedidos, "pedido", "pedidos")} icone={ShoppingBag} />
        <Indicador rotulo="Líquido (o que o canal repassa)" valor={brl(total.liquido)} detalhe={`${brl(total.bruto - total.liquido)} ficaram com o canal, no frete e nos reembolsos`} />
        <Indicador rotulo="Lucro estimado" valor={brl(total.lucro)} detalhe={total.semCusto > 0 ? `fora ${plural(total.semCusto, "pedido", "pedidos")} sem custo` : "todos os pedidos com custo"} tom={total.lucro < 0 ? "ruim" : "neutro"} />
        <Indicador rotulo="Itens sem produto ligado" valor={numero(painel.itensSemProduto)} detalhe="ligue o anúncio no catálogo (códigos de outros canais)" tom={painel.itensSemProduto > 0 ? "atencao" : "neutro"} />
      </section>

      <Cartao className="mt-4" titulo="Por canal" icone={ShoppingBag}>
        {painel.canais.length === 0 ? <p className="text-sm text-suave">Nenhum pedido no período.</p> : (
          <ul className="divide-y divide-borda text-sm">
            {painel.canais.map((c) => (
              <li key={c.canal} className="space-y-1 py-3">
                <p className="font-semibold">{CANAIS_DOS_MARKETPLACES[c.canal]} · {plural(c.pedidos, "pedido", "pedidos")} · {plural(c.unidades, "unidade", "unidades")}</p>
                <p className="numeros text-xs text-suave">Bruto {brl(c.bruto)} · reembolsos {brl(c.reembolsos)} · tarifas {brl(c.tarifas)} · frete {brl(c.frete)} · líquido {brl(c.liquido)}{c.liquidosEstimados > 0 ? ` (${plural(c.liquidosEstimados, "estimado", "estimados")})` : ""}</p>
                <p className="numeros text-xs">Custo {brl(c.custo)} · lucro estimado {brl(c.lucro)} · margem {ou(margemSobreOBruto(c.lucro, c.bruto), percentualComSinal)}{c.pedidosSemCusto > 0 ? ` · ${plural(c.pedidosSemCusto, "pedido", "pedidos")} sem custo, fora do lucro` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {painel.anuncios.length > 0 && (
        <Cartao className="mt-4" titulo="Por anúncio e produto">
          <ul className="divide-y divide-borda text-sm">
            {painel.anuncios.map((a) => (
              <li key={`${a.canal}:${a.codigo}:${a.produto ?? ""}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-semibold">{a.produto ?? a.titulo ?? a.codigo}</span>
                  <span className="block text-xs text-suave">{CANAIS_DOS_MARKETPLACES[a.canal]} · {a.codigo}{a.produto === null ? " · sem produto ligado" : ""}</span>
                </span>
                <span className="numeros text-right text-xs">{plural(a.unidades, "unidade", "unidades")} · bruto {brl(a.bruto)} · líquido {brl(a.liquido)} · lucro {ou(a.lucro, brl)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {painel.pedidos.length > 0 && (
        <Cartao className="mt-4" titulo="Pedidos" subtitulo={painel.pedidosNoPeriodo > painel.pedidos.length ? `Os ${painel.pedidos.length} mais recentes de ${numero(painel.pedidosNoPeriodo)}.` : undefined}>
          <ul className="divide-y divide-borda text-sm">
            {painel.pedidos.map((p) => (
              <li key={`${p.canal}:${p.idExterno}`} className="space-y-1 py-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{CANAIS_DOS_MARKETPLACES[p.canal]} nº {p.idExterno}</span>
                  <span className="numeros text-xs text-suave">{dataCurta(p.data)}</span>
                  {p.situacao && <Selo tom="neutro">{p.situacao}</Selo>}
                  {p.reembolsos > 0 && <Selo tom="aviso">reembolso {brl(p.reembolsos)}</Selo>}
                </p>
                <p className="numeros text-xs text-suave">
                  Bruto {brl(p.bruto)} · tarifas {brl(p.tarifas)} · frete {brl(p.frete)} · líquido {brl(p.liquido)}{p.liquidoEstimado ? " (estimado)" : ""}
                  {p.dataRepasse ? ` · repasse em ${dataCurta(p.dataRepasse)}` : ""} · custo {ou(p.custo, brl)} · lucro {ou(p.lucro, brl)}
                  {p.itensSemCusto > 0 ? ` · ${plural(p.itensSemCusto, "item", "itens")} sem custo` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao className="mt-4" titulo="Importar pedidos" subtitulo="No painel do vendedor de cada canal: exporte o relatório de vendas do período, em CSV ou Excel." icone={FileUp}>
        <FormularioDeArquivo action="/relatorios/marketplaces/enviar" className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Canal do arquivo</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(CANAIS_DOS_MARKETPLACES).map(([valor, nome], i) => <label key={valor} className={opcao}><input type="radio" name="canal" value={valor} defaultChecked={i === 0} required />{nome}</label>)}
            </div>
          </fieldset>
          <EscolherColunasDoMarketplace />
          <Botao type="submit" enquanto="Enviando o arquivo…">Importar os pedidos</Botao>
        </FormularioDeArquivo>
        {(importacoes.data as unknown as Importacao[]).length > 0 && (
          <ul className="mt-4 divide-y divide-borda text-xs">
            {(importacoes.data as unknown as Importacao[]).map((i) => (
              <li key={i.id} className="numeros py-2">
                nº {i.numero} · {CANAIS_DOS_MARKETPLACES[i.canal] ?? i.canal} · {i.arquivo} · de {dataCurta(i.periodo_inicio)} a {dataCurta(i.periodo_fim)} · {plural(i.novos, "novo", "novos")}, {plural(i.atualizados, "atualizado", "atualizados")} · {quando(i.importado_em)}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao className="mt-4" titulo="Como cada número é calculado" icone={Sigma}>
        <ul className="list-disc space-y-1 pl-5 text-xs text-suave">
          <li>O bruto é a soma dos itens do pedido; as tarifas, o frete pago pelo vendedor e os reembolsos vêm do arquivo do canal.</li>
          <li>O líquido é o do arquivo; quando o arquivo não traz, é o bruto menos as tarifas, o frete e os reembolsos (marcado como “estimado”).</li>
          <li>O custo é o do cadastro que valia no dia do pedido; o pedido reembolsado por inteiro não leva o custo (o produto voltou ou não saiu).</li>
          <li>O lucro estimado é o líquido menos o custo, só nos pedidos em que todo item tem produto ligado e custo; os outros ficam fora e são contados.</li>
          <li>No anúncio, o líquido do pedido é dividido pelos itens na proporção do valor de cada um.</li>
          <li>O mesmo número de pedido no mesmo canal nunca vira dois pedidos: o arquivo mais novo atualiza a situação, os valores e os itens.</li>
          <li>Nada aqui mexe no estoque, nas vendas da loja, nas notas ou nas comissões: é a conta do canal, para ver o lucro de cada pedido.</li>
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

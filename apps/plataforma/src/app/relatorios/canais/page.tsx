import { ArrowLeft, Layers, Sigma } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Indicador, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { lerPainelDosAnuncios } from "../../../lib/anuncios/painel";
import { periodoDosAnuncios } from "../../../lib/anuncios/regras";
import {
  anunciosNosCanais, detalheDoResultado, faltaDaLeitura, lojasNosCanais, marketplacesNosCanais, receitaDaRede, resultadoDosCanais, textoDaMargemDasLojas,
  type Canais,
} from "../../../lib/canais/painel";
import { consultarPainel } from "../../../lib/financeiro/consulta";
import { brl, brlComSinal, numero } from "../../../lib/formato";
import { consultarReservasDoSite } from "../../../lib/loja/painel-das-reservas";
import { consultarMargem } from "../../../lib/margem/consulta";
import { lerPainelDosMarketplaces } from "../../../lib/marketplaces/regras";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";

export const metadata: Metadata = { title: "Canais" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
/** O começo do dia em São Paulo (sem horário de verão desde 2019), mais `somar` dias. */
const comecoDoDia = (dia: string, somar = 0) => {
  const d = new Date(`${dia}T00:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + somar);
  return d;
};

// Os canais de venda lado a lado (lote CANAIS-a: ORA-REPORT-008; ADR-019): as lojas (e, delas, o site), cada marketplace e os
// anúncios, no mesmo período, com a receita, as taxas e tarifas, o líquido e a margem. Só o dono (resultado.ver), porque junta
// o custo dos anúncios e o lucro dos marketplaces. Cada número vem do painel do próprio canal.
export default async function CanaisDeVenda({ searchParams }: { searchParams: Promise<{ inicio?: ValorDeParametro; fim?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  if (!sessao.molde.permissoes.has("resultado.ver")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Os canais lado a lado são do dono (a mesma permissão do resultado do mês).</Aviso></MoldeReal>;
  }
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { inicio, fim } = periodoDosAnuncios(textoDoParametro(parametros.inicio), textoDoParametro(parametros.fim), hoje);
  const janela = { inicio: comecoDoDia(inicio), fim: comecoDoDia(fim, 1) };
  const { supabase } = sessao;
  const [financeiro, margem, reservas, marketplaces, anuncios] = await Promise.all([
    consultarPainel(supabase, janela, null, false),
    consultarMargem(supabase, janela, null),
    consultarReservasDoSite(supabase, janela, null),
    supabase.rpc("marketplace_painel", { p_inicio: inicio, p_fim: fim }),
    supabase.rpc("anuncios_painel", { p_inicio: inicio, p_fim: fim }),
  ]);
  if (financeiro === "indisponivel") throw new FalhaDoServico("financeiro_painel");
  if (marketplaces.error) throw new FalhaDoServico("marketplace_painel");
  if (anuncios.error) throw new FalhaDoServico("anuncios_painel");
  const canais: Canais = {
    lojas: lojasNosCanais(financeiro, margem.estado === "ok" ? margem.dados : null, reservas.estado === "ok" ? reservas.dados : null),
    marketplaces: marketplacesNosCanais(lerPainelDosMarketplaces(marketplaces.data)),
    anuncios: anunciosNosCanais(lerPainelDosAnuncios(anuncios.data)),
  };
  const resultado = resultadoDosCanais(canais);
  const { lojas } = canais;
  // GRAF-a: a margem e as reservas do site que não vieram aparecem como falha, nunca como "sem o custo" ou como nada.
  const faltaDaMargem = faltaDaLeitura(margem);
  const faltaDoSite = faltaDaLeitura(reservas);
  const aqui = `/relatorios/canais?inicio=${inicio}&fim=${fim}`;

  return (
    <MoldeReal sessao={sessao} largura="max-w-6xl">
      <Link href="/relatorios" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Relatórios</Link>
      <TituloPagina titulo="Canais de venda" subtitulo={`De ${dataCurta(inicio)} a ${dataCurta(fim)}: as lojas, o site, cada marketplace e os anúncios, com a receita, o que cada canal cobra e o que sobra.`} />
      <Form action="/relatorios/canais" prefetch={false} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium">De<input key={inicio} name="inicio" type="date" defaultValue={inicio} className={campo} /></label>
        <label className="text-xs font-medium">Até<input key={fim} name="fim" type="date" defaultValue={fim} className={campo} /></label>
        <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Carregando…">Ver</Botao>
      </Form>

      {(faltaDaMargem === "falha" || faltaDoSite === "falha") && (
        <Aviso tom="aviso" className="mt-4" titulo="Parte dos números não pôde ser lida agora">
          {faltaDaMargem === "falha" ? "A margem das lojas não respondeu, e sem ela o resultado estimado fica sem valor. " : ""}
          {faltaDoSite === "falha" ? "As reservas do site não responderam, e a parte das vendas que veio do site não aparece. " : ""}
          Os outros números estão certos. <Link href={aqui} prefetch={false} className="font-semibold text-acao underline">Tentar de novo</Link>
        </Aviso>
      )}

      <section aria-label="Resumo dos canais" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Indicador rotulo="Receita da rede" valor={brl(receitaDaRede(canais))} detalhe="as lojas (sem devoluções e cancelamentos) e o bruto dos marketplaces" icone={Layers} />
        <Indicador rotulo="O que os canais cobraram" valor={brl(lojas.taxas + canais.marketplaces.reduce((s, m) => s + m.taxas, 0) + (canais.anuncios?.gasto ?? 0))}
          detalhe="taxas dos meios (conciliadas), tarifas, frete e reembolsos dos marketplaces e o valor usado nos anúncios" />
        <Indicador rotulo="Resultado dos canais (estimado)" valor={resultado === null ? "—" : brlComSinal(resultado)}
          detalhe={detalheDoResultado(resultado, faltaDaMargem)} tom={resultado !== null && resultado < 0 ? "ruim" : "neutro"} />
      </section>

      <Cartao className="mt-4" titulo="Por canal" icone={Layers}>
        <ul className="divide-y divide-borda text-sm">
          <li className="space-y-1 py-3">
            <p className="font-semibold">Lojas físicas · {plural(lojas.vendas, "venda", "vendas")}</p>
            <p className="numeros text-xs text-suave">Vendido {brl(lojas.vendido)} · devoluções e cancelamentos {brl(lojas.devolvidoECancelado)} · receita {brl(lojas.receita)}</p>
            <p className="numeros text-xs">Taxas dos meios {brl(lojas.taxas)} (observadas em {brl(lojas.conciliado)} conciliados) · margem bruta {textoDaMargemDasLojas(lojas.margem, faltaDaMargem, brlComSinal)}</p>
            {lojas.doSite && lojas.doSite.vendas > 0 && <p className="numeros text-xs text-suave">Das vendas das lojas, {plural(lojas.doSite.vendas, "veio", "vieram")} de reserva do site: {brl(lojas.doSite.valor)} (já dentro da receita das lojas).</p>}
            {faltaDoSite === "falha" && <p className="text-xs text-aviso">Não deu para ler as reservas do site agora: a parte das vendas que veio do site não aparece.</p>}
          </li>
          {canais.marketplaces.map((m) => (
            <li key={m.canal} className="space-y-1 py-3">
              <p className="font-semibold">{m.nome} · {plural(m.pedidos, "pedido", "pedidos")}</p>
              <p className="numeros text-xs text-suave">Bruto {brl(m.bruto)} · tarifas, frete e reembolsos {brl(m.taxas)} · líquido {brl(m.liquido)}</p>
              <p className="numeros text-xs">Lucro estimado {brlComSinal(m.lucro)}{m.semCusto > 0 ? ` (fora ${plural(m.semCusto, "pedido", "pedidos")} sem custo)` : ""}</p>
            </li>
          ))}
          {canais.marketplaces.length === 0 && <li className="py-3 text-xs text-suave">Nenhum pedido de marketplace importado no período (Relatórios → Marketplaces).</li>}
          {canais.anuncios && (
            <li className="space-y-1 py-3">
              <p className="font-semibold">Anúncios (Meta)</p>
              <p className="numeros text-xs">Valor usado {brl(canais.anuncios.gasto)} · {plural(canais.anuncios.vendas, "venda", "vendas")} das campanhas que ficaram, {brl(canais.anuncios.receita)} sem as devoluções (já dentro da receita das lojas)</p>
            </li>
          )}
        </ul>
      </Cartao>

      <Cartao className="mt-4" titulo="Como cada número é calculado" icone={Sigma}>
        <ul className="list-disc space-y-1 pl-5 text-xs text-suave">
          <li>Lojas: o vendido das vendas concluídas no período, menos as devoluções e os cancelamentos (o mesmo do Financeiro); a margem bruta é a dos itens com custo gravado (a mesma dos Relatórios).</li>
          <li>As taxas dos meios são só as já observadas na conciliação: o valor conciliado menos o líquido que caiu na conta. O cartão e o Pix ainda não conciliados não entram.</li>
          <li>O site e os anúncios trazem clientes para as lojas: a receita deles já está dentro da receita das lojas e não é somada de novo.</li>
          <li>Marketplaces: o bruto, as tarifas, o frete pago pelo vendedor e os reembolsos do arquivo de cada canal; o lucro é o estimado da tela Marketplaces.</li>
          <li>O resultado dos canais é estimado: a margem das lojas menos as taxas observadas, mais o lucro dos marketplaces, menos o valor usado nos anúncios. Não é o lucro da empresa: despesas fixas, comissões e impostos ficam fora.</li>
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

import { CircleDashed, FileSpreadsheet, Globe, Megaphone, MessageCircle, ShoppingBag, Sigma, Store } from "lucide-react";
import type { Metadata } from "next";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Indicador, Selo, TituloPagina } from "../../../componentes/ui";
import { CANAIS, CANAIS_NO_MES, ORIGENS_DAS_RESERVAS_DEMO } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

export const metadata: Metadata = { title: "Canais online" };

const ICONES = { "Loja online Ora 5G": Store, "Mercado Livre": ShoppingBag, "TikTok Shop": ShoppingBag, Shopee: ShoppingBag, "Meta Ads": Megaphone, "WhatsApp oficial": MessageCircle } as const;
const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const vezes = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

// Os canais na demonstração (DEMO-a, 18/11; aceite A16 do adendo do Codex de 16/11): o que já entra por arquivo na
// aplicação real, o que falta para ligar cada canal direto e os canais lado a lado num mês, com números FICTÍCIOS no
// mesmo cálculo da tela real /relatorios/canais (ADR-019). Nada aqui lê o banco nem fala com canal nenhum.
export default async function Canais() {
  const contexto = await acessoDaPagina("canais");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Canais online" />;
  const porArquivo = CANAIS.filter((c) => c.situacao === "Por arquivo").length;
  const { lojas, marketplaces, anuncios } = CANAIS_NO_MES;
  const receitaLojas = lojas.vendido - lojas.devolvidoECancelado;
  const receitaDaRede = receitaLojas + marketplaces.reduce((s, m) => s + m.bruto, 0);
  const resultado = lojas.margem - lojas.taxas + marketplaces.reduce((s, m) => s + m.lucro, 0) - anuncios.gasto;
  const receitaDosAnuncios = anuncios.receita - anuncios.devolvido;
  const vendasQueFicaram = anuncios.vendas - anuncios.devolvidas;
  return (
    <>
      <TituloPagina titulo="Canais online e campanhas" subtitulo="Mesmo catálogo, preço e estoque do PDV; um canal nunca vende o IMEI reservado em outro" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Por arquivo hoje" valor={`${porArquivo} de ${CANAIS.length}`} icone={FileSpreadsheet} detalhe="o relatório de cada canal e o custo dos anúncios" />
        <Indicador rotulo="Conectados direto" valor={`0 de ${CANAIS.length}`} icone={Globe} detalhe="esperam o contrato e a autorização" tom="atencao" />
        <Indicador rotulo="Receita da rede no mês" valor={reais(receitaDaRede)} icone={Store} detalhe="lojas e marketplaces (fictícia)" />
        <Indicador rotulo="Resultado dos canais" valor={reais(resultado)} icone={Sigma} detalhe="estimado (fictício)" />
      </div>

      <Cartao className="mt-4" titulo="Os canais lado a lado (dados fictícios)" subtitulo="O mesmo cálculo da tela real: cada número vem do painel do próprio canal, sem somar duas vezes." icone={Sigma}>
        <ul className="divide-y divide-borda text-sm">
          <li className="py-2">
            <p className="font-semibold">{`Lojas físicas · ${lojas.vendas} vendas`}</p>
            <p className="numeros text-xs">{`Vendido ${reais(lojas.vendido)} · devoluções e cancelamentos ${reais(lojas.devolvidoECancelado)} · receita ${reais(receitaLojas)} · taxas dos meios ${reais(lojas.taxas)} · margem bruta ${reais(lojas.margem)}`}</p>
            <p className="text-xs text-suave">{`${lojas.doSite.vendas} vieram de reserva do site: ${reais(lojas.doSite.valor)} (já dentro da receita das lojas)`}</p>
          </li>
          {marketplaces.map((m) => (
            <li key={m.nome} className="py-2">
              <p className="font-semibold">{`${m.nome} · ${m.pedidos} pedidos (pelo relatório de vendas do canal)`}</p>
              <p className="numeros text-xs">{`Bruto ${reais(m.bruto)} · tarifas, frete e reembolsos ${reais(m.taxas)} · líquido ${reais(m.liquido)} · lucro estimado ${reais(m.lucro)}${m.semCusto > 0 ? ` (fora ${m.semCusto} pedidos sem custo)` : ""}`}</p>
            </li>
          ))}
          <li className="py-2">
            <p className="font-semibold">Anúncios (Meta, pelo arquivo do Gerenciador)</p>
            <p className="numeros text-xs">{`Valor usado ${reais(anuncios.gasto)} · ${vendasQueFicaram} vendas que ficaram (${anuncios.devolvidas} devolvida por inteiro) · receita ${reais(anuncios.receita)} − devolvido ${reais(anuncios.devolvido)} = ${reais(receitaDosAnuncios)} · CPA ${reais(Math.round(anuncios.gasto / vendasQueFicaram))} · ROAS ${vezes(receitaDosAnuncios / anuncios.gasto)} · CAC ${reais(Math.round(anuncios.gasto / anuncios.clientesNovos))}`}</p>
            <p className="text-xs text-suave">Atribuição não é prova de causa: a venda aparece na campanha porque o contato chegou por ela.</p>
          </li>
        </ul>
      </Cartao>

      {/* DEMO-b: a origem e a campanha das reservas do site (a tela real é /reservas-do-site e os relatórios; lote MKT-a). */}
      <Cartao className="mt-4" titulo="De onde vêm as reservas do site (dados fictícios)" subtitulo="A origem e a campanha vêm do link que levou o cliente ao site. A venda conta na loja que atendeu, já dentro da receita das lojas." icone={Globe}>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Reservas do site por origem e campanha</caption>
            <thead>
              <tr className="border-b border-borda text-left text-xs text-suave">
                <th scope="col" className="px-1 py-2 font-medium">Origem e campanha</th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Reservas</th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Atendidas</th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Canceladas ou vencidas</th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Vendas</th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Valor das vendas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {ORIGENS_DAS_RESERVAS_DEMO.map((o) => (
                <tr key={o.origem}>
                  <th scope="row" className="px-1 py-2 text-left font-medium">{o.origem}{o.campanha ? <span className="block text-xs font-normal text-suave">{`campanha: ${o.campanha}`}</span> : null}</th>
                  <td className="numeros px-1 py-2 text-right">{o.reservas}</td>
                  <td className="numeros px-1 py-2 text-right">{o.atendidas}</td>
                  <td className="numeros px-1 py-2 text-right">{o.canceladas + o.vencidas}</td>
                  <td className="numeros px-1 py-2 text-right">{o.vendas}</td>
                  <td className="numeros px-1 py-2 text-right">{reais(o.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-suave">Reserva não é venda: a venda só conta quando a loja conclui no PDV. A reserva vale 24 horas e, vencida, devolve o produto ao estoque.</p>
      </Cartao>

      <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CANAIS.map((c) => {
          const IconeCanal = ICONES[c.nome as keyof typeof ICONES] ?? Globe;
          return (
            <li key={c.nome}>
              <Cartao icone={IconeCanal} titulo={c.nome} acao={<Selo tom={c.situacao.startsWith("Não") ? "neutro" : "info"} ponto>{c.situacao}</Selo>} className="h-full">
                <p className="text-xs font-semibold uppercase tracking-wide text-suave">Para conectar direto</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {c.precisa.map((item) => <li key={item} className="flex items-start gap-2"><CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-suave" /> {item}</li>)}
                </ul>
              </Cartao>
            </li>
          );
        })}
      </ul>
      <Aviso className="mt-4" titulo="Números fictícios">Na demonstração, os números são inventados para mostrar o cálculo. Na aplicação real, eles vêm das vendas e dos arquivos importados (o extrato, o relatório de vendas de cada canal e o custo dos anúncios); a conexão direta com cada canal espera o contrato e a autorização.</Aviso>
    </>
  );
}

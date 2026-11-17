import { ArrowLeft, FileUp, Megaphone, Sigma } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { FormularioDeArquivo } from "../../../componentes/FormularioDeArquivo";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Indicador, ListaDados, Selo, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { lerPainelDosAnuncios, metricasDaCampanha, totalDasCampanhas, type CampanhaDoPainel } from "../../../lib/anuncios/painel";
import { ERROS_DOS_ANUNCIOS, periodoDosAnuncios, textoDoProblemaDosAnuncios } from "../../../lib/anuncios/regras";
import { brl, numero, percentual } from "../../../lib/formato";
import { nomesDoRanking } from "../../../lib/inicio/consulta";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { EscolherColunasDosAnuncios } from "./EscolherColunasDosAnuncios";

export const metadata: Metadata = { title: "Anúncios" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
const ou = (v: number | null, formatar: (n: number) => string) => (v === null ? "—" : formatar(v));
const vezes = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
type Importacao = { id: string; numero: number; arquivo: string; periodo_inicio: string; periodo_fim: string; campanhas: number; dias_de_campanha: number; substituidos: number; gasto_centavos: number; importado_em: string };

// O custo dos anúncios da Meta (lote META-a: ORA-META-001 por arquivo, ORA-META-003, ORA-META-004 e ORA-META-006; ADR-017):
// o relatório do Gerenciador de Anúncios por arquivo e, por campanha, o custo junto aos contatos e às vendas que vieram
// dela. Só o dono (resultado.ver). As fórmulas e os limites ficam à vista, no fim da tela.
export default async function Anuncios({ searchParams }: {
  searchParams: Promise<Record<"inicio" | "fim" | "ok" | "erro" | "linha" | "campo" | "texto" | "campanhas" | "dias" | "substituidos", ValorDeParametro>>;
}) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  if (!sessao.molde.permissoes.has("resultado.ver")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">{ERROS_DOS_ANUNCIOS.permissao}</Aviso></MoldeReal>;
  }
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { inicio, fim } = periodoDosAnuncios(textoDoParametro(parametros.inicio), textoDoParametro(parametros.fim), hoje);
  const { supabase } = sessao;
  const [lido, importacoes] = await Promise.all([
    supabase.rpc("anuncios_painel", { p_inicio: inicio, p_fim: fim }),
    supabase.from("anuncios_importacoes").select("id, numero, arquivo, periodo_inicio, periodo_fim, campanhas, dias_de_campanha, substituidos, gasto_centavos, importado_em")
      .order("importado_em", { ascending: false }).limit(10),
  ]);
  if (lido.error) throw new FalhaDoServico("anuncios_painel");
  if (importacoes.error) throw new FalhaDoServico("anuncios_importacoes");
  const painel = lerPainelDosAnuncios(lido.data);
  const lidos = await nomesDoRanking(supabase, [...new Set(painel.porVendedor.map((v) => v.vendedor))]);
  const nomes: ReadonlyMap<string, string> = lidos.estado === "ok" ? lidos.dados : new Map();
  const total = totalDasCampanhas(painel.campanhas);
  const t = metricasDaCampanha(total);
  const erro = chaveDoCatalogo(ERROS_DOS_ANUNCIOS, parametros.erro);
  const problema = erro === "linha" ? textoDoProblemaDosAnuncios(textoDoParametro(parametros.linha), textoDoParametro(parametros.campo), textoDoParametro(parametros.texto)) : null;
  const ok = textoDoParametro(parametros.ok);
  const contagemDoParametro = (v: ValorDeParametro) => { const x = textoDoParametro(v); return x !== undefined && /^\d{1,6}$/.test(x) ? Number(x) : 0; };
  const linha = (c: CampanhaDoPainel) => ({ c, m: metricasDaCampanha(c) });

  return (
    <MoldeReal sessao={sessao} largura="max-w-6xl">
      <Link href="/relatorios" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Relatórios</Link>
      <TituloPagina titulo="Anúncios (Meta)" subtitulo={`De ${dataCurta(inicio)} a ${dataCurta(fim)}: quanto custou cada contato, cada venda e cada cliente novo de cada campanha.`} />
      {ok === "importado" && <Aviso tom="sucesso" className="mt-4">Custo importado: {plural(contagemDoParametro(parametros.campanhas), "campanha", "campanhas")}, {plural(contagemDoParametro(parametros.dias), "dia de campanha", "dias de campanha")}{contagemDoParametro(parametros.substituidos) > 0 ? `; ${plural(contagemDoParametro(parametros.substituidos), "dia substituído", "dias substituídos")} pelo arquivo novo` : ""}.</Aviso>}
      {ok === "repetido" && <Aviso tom="info" className="mt-4">Este arquivo já tinha sido importado: nada mudou.</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{problema ?? ERROS_DOS_ANUNCIOS[erro]}</Aviso>}

      <Form action="/relatorios/anuncios" prefetch={false} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium">De<input key={inicio} name="inicio" type="date" defaultValue={inicio} className={campo} /></label>
        <label className="text-xs font-medium">Até<input key={fim} name="fim" type="date" defaultValue={fim} className={campo} /></label>
        <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Carregando…">Ver</Botao>
      </Form>

      <section aria-label="Resumo dos anúncios" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Valor usado" valor={brl(total.gasto)} detalhe={painel.importadoAte ? `custo importado até ${dataCurta(painel.importadoAte)}` : "nenhum custo importado ainda"} icone={Megaphone} />
        <Indicador rotulo="Custo por contato (CPL)" valor={ou(t.cpl, brl)} detalhe={plural(t.contatos, "contato", "contatos")} />
        <Indicador rotulo="Custo por venda (CPA)" valor={ou(t.cpa, brl)} detalhe={`${plural(total.vendas, "venda", "vendas")} · ${brl(total.receita)}`} />
        <Indicador rotulo="Retorno (ROAS)" valor={ou(t.roas, vezes)} detalhe={`CAC ${ou(t.cac, brl)} · ${plural(total.clientesNovos, "cliente novo", "clientes novos")}`} />
      </section>

      <Cartao className="mt-4" titulo="Por campanha" icone={Megaphone}>
        {painel.campanhas.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma campanha no período: nem custo importado, nem contato com campanha.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {painel.campanhas.map(linha).map(({ c, m }) => (
              <li key={c.chave} className="space-y-1 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.campanha}</span>
                  {c.gasto > 0 && m.contatos === 0 && <Selo tom="aviso">custo sem contato: confira o link da campanha</Selo>}
                  {c.gasto === 0 && c.dias === 0 && <Selo tom="neutro">sem custo importado</Selo>}
                </p>
                <p className="numeros text-xs text-suave">
                  Valor usado {brl(c.gasto)} · {ou(c.impressoes, numero)} impressões · {ou(c.cliques, numero)} cliques · CTR {ou(m.ctr, percentual)} · CPC {ou(m.cpc, brl)}
                  {c.resultados !== null ? ` · ${numero(c.resultados)} resultados (Meta), ${ou(m.custoPorResultado, brl)} cada` : ""}
                </p>
                <p className="numeros text-xs">
                  {plural(m.contatos, "contato", "contatos")} ({numero(c.reservas)} do site, {numero(c.oportunidades)} do CRM) · CPL {ou(m.cpl, brl)} ·{" "}
                  {plural(c.vendas, "venda", "vendas")} · CPA {ou(m.cpa, brl)} · receita {brl(c.receita)} · ROAS {ou(m.roas, vezes)}
                </p>
                <p className="numeros text-xs">
                  Margem {brl(c.margem)}{c.vendasSemCusto > 0 ? ` (${plural(c.vendasSemCusto, "venda", "vendas")} com item sem custo)` : ""} · ROAS da margem {ou(m.roasDaMargem, vezes)} ·{" "}
                  {plural(c.clientesNovos, "cliente novo", "clientes novos")} · CAC {ou(m.cac, brl)} · recebido de fato {brl(c.recebido)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {painel.contatosSemCampanha > 0 && <p className="mt-2 text-xs text-suave">{plural(painel.contatosSemCampanha, "contato do período chegou", "contatos do período chegaram")} sem campanha (direto, loja ou campanha não digitada) e não entram aqui.</p>}
      </Cartao>

      {(painel.porLoja.length > 0 || painel.porVendedor.length > 0) && (
        <Cartao className="mt-4" titulo="O funil por loja e por vendedor">
          {painel.porLoja.length > 0 && (
            <ListaDados itens={painel.porLoja.map((l) => [`${l.loja} · ${painel.campanhas.find((c) => c.chave === l.chave)?.campanha ?? l.chave}`,
              `${plural(l.contatos, "contato", "contatos")} · ${plural(l.vendas, "venda", "vendas")} · ${brl(l.receita)}`] as const)} />
          )}
          {painel.porVendedor.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-sm font-semibold">Quem vendeu</p>
              <ListaDados itens={painel.porVendedor.map((v) => [`${nomes.get(v.vendedor) ?? "Vendedor"} · ${painel.campanhas.find((c) => c.chave === v.chave)?.campanha ?? v.chave}`,
                `${plural(v.vendas, "venda", "vendas")} · ${brl(v.receita)}`] as const)} />
            </div>
          )}
        </Cartao>
      )}

      <Cartao className="mt-4" titulo="Importar o custo" subtitulo="No Gerenciador de Anúncios: Relatórios → exportar, com o detalhamento por dia (Por tempo → Dia), em CSV ou Excel." icone={FileUp}>
        <FormularioDeArquivo action="/relatorios/anuncios/enviar" className="space-y-3">
          <EscolherColunasDosAnuncios />
          <Botao type="submit" enquanto="Enviando o arquivo…">Importar o custo</Botao>
        </FormularioDeArquivo>
        {(importacoes.data as unknown as Importacao[]).length > 0 && (
          <ul className="mt-4 divide-y divide-borda text-xs">
            {(importacoes.data as unknown as Importacao[]).map((i) => (
              <li key={i.id} className="numeros py-2">
                nº {i.numero} · {i.arquivo} · de {dataCurta(i.periodo_inicio)} a {dataCurta(i.periodo_fim)} · {plural(i.campanhas, "campanha", "campanhas")} · {brl(i.gasto_centavos)}
                {i.substituidos > 0 ? ` · ${plural(i.substituidos, "dia substituído", "dias substituídos")}` : ""} · {quando(i.importado_em)}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao className="mt-4" titulo="Como cada número é calculado" icone={Sigma}>
        <ul className="list-disc space-y-1 pl-5 text-xs text-suave">
          <li>CTR = cliques ÷ impressões; CPC = valor usado ÷ cliques (do arquivo da Meta).</li>
          <li>CPL = valor usado ÷ contatos no sistema: as reservas do site com a campanha no link e as oportunidades do CRM com a campanha digitada.</li>
          <li>CPA = valor usado ÷ vendas concluídas que vieram desses contatos; ROAS = receita dessas vendas ÷ valor usado; ROAS da margem = margem ÷ valor usado.</li>
          <li>CAC = valor usado ÷ clientes novos (a venda da campanha é a primeira compra concluída do cliente).</li>
          <li>Contam os contatos do período e as vendas que vieram deles, mesmo concluídas depois. Uma venda conta uma vez: se veio da reserva e da oportunidade, vale a reserva.</li>
          <li>A receita é estimativa de venda; “recebido de fato” é o dinheiro no caixa e o cartão ou Pix já conciliado (pelo líquido). A margem é a dos itens com custo gravado.</li>
          <li>A campanha do arquivo casa com a do link pelo nome (sem diferença de maiúsculas, acentos e espaços): no anúncio, use utm_campaign={"{{campaign.name}}"}.</li>
          <li>Quando o divisor é zero, a métrica aparece como “—”.</li>
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

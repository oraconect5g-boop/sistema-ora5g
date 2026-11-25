import { ListChecks, Store, Users } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { BotaoImprimir, CarimboDaImpressao } from "../../../componentes/BotaoImprimir";
import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, FiltroSegmentado, Indicador, Selo } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import {
  COLUNAS_DO_CSV, linhasDoCsv, nomeDaSituacao, nomeDoTipo, somasDoRelatorio, somasPor, totalConfirmadas, type OperacaoDoRelatorio, type Somas,
} from "../../../lib/connect/relatorio";
import { janelasDoPeriodo, ORDEM_DOS_PERIODOS, PERIODOS_FINANCEIROS, periodoFinanceiro } from "../../../lib/financeiro/painel";
import { agora, brl, numero } from "../../../lib/formato";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { CabecalhoConnect, LARGURA_DA_CONNECT } from "../CabecalhoConnect";

export const metadata: Metadata = { title: "Relatório da Ora Connect" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", " às");
const ehUuid = (v: string | undefined): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
/** Quantas operações a lista mostra; a planilha (CSV) leva todas as do período. */
const LIMITE_DA_LISTA = 200;

type Parametros = { periodo?: ValorDeParametro; loja?: ValorDeParametro; vendedor?: ValorDeParametro };

// O relatório do vendedor e da loja da Ora Connect (lote CONNECT-k; a D-060 do proprietário, 25/11): as operações do período,
// com a situação, o plano, o valor de face e o que a loja recebeu, somadas por vendedor e por loja, para imprimir ou exportar.
// Quem só opera vê o próprio relatório; quem gere a Ora Connect escolhe a loja (ou a rede, se vê todas) e o vendedor. A RLS de
// connect_operacoes garante o mesmo no banco. A produção que conta para meta e comissão continua sendo só a confirmada.
export default async function RelatorioDaConnect({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const gere = permite(sessao, "connect.gerir");
  // A carteira e os relatórios da rede são de quem gere a Ora Connect na rede (como em Consultar linha; o banco confere de novo).
  const gereARede = gere && sessao.molde.vinculos.some((v) => v.escopo === "organizacao");
  if (!gere && !permite(sessao, "connect.operar")) {
    return <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}><CabecalhoConnect sessao={sessao} aba="carteira" /><Aviso tom="aviso" className="mt-4">O relatório da Ora Connect é de quem opera ou gere a Ora Connect.</Aviso></MoldeReal>;
  }
  const periodo = periodoFinanceiro(textoDoParametro(parametros.periodo));
  const janela = janelasDoPeriodo(periodo, agora()).atual;
  const lojaPedida = textoDoParametro(parametros.loja);
  const vendedorPedido = textoDoParametro(parametros.vendedor);
  // Quem só opera: o próprio relatório. Quem gere: a loja do turno (ou outra, ou a rede) e, se escolher, um vendedor.
  const unidade = gere ? (lojaPedida === "rede" ? null : ehUuid(lojaPedida) ? lojaPedida : sessao.situacao.unidade_id) : null;
  const vendedor = gere ? (ehUuid(vendedorPedido) ? vendedorPedido : null) : sessao.usuario.id;

  const { supabase } = sessao;
  let consulta = supabase.from("connect_operacoes")
    .select("id, numero, tipo, situacao, vendedor_id, unidade_id, plano_nome, valor_face_centavos, recebido_na_loja_centavos, linha, criado_em")
    .gte("criado_em", janela.inicio.toISOString()).lte("criado_em", janela.fim.toISOString())
    .order("criado_em", { ascending: false }).limit(2000);
  if (unidade) consulta = consulta.eq("unidade_id", unidade);
  if (vendedor) consulta = consulta.eq("vendedor_id", vendedor);
  const [lidas, lojasLidas] = await Promise.all([consulta, supabase.from("unidades").select("id, nome, tipo").order("nome").limit(300)]);
  if (lidas.error) throw new FalhaDoServico("connect_operacoes");
  if (lojasLidas.error) throw new FalhaDoServico("unidades");
  const operacoes = lidas.data as unknown as OperacaoDoRelatorio[];
  const lojas = lojasLidas.data as { id: string; nome: string; tipo: string }[];
  const ids = [...new Set([...operacoes.map((o) => o.vendedor_id), ...(vendedor ? [vendedor] : [])])];
  const pessoas = ids.length > 0 ? await supabase.from("perfis_usuario").select("id, nome").in("id", ids) : { data: [], error: null };
  if (pessoas.error) throw new FalhaDoServico("perfis_usuario");
  const nomeDoVendedor = (id: string) => (pessoas.data as { id: string; nome: string }[]).find((p) => p.id === id)?.nome ?? "Pessoa sem nome";
  const nomeDaLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "Loja";

  const somas = somasDoRelatorio(operacoes);
  const porVendedor = !vendedor ? somasPor(operacoes, "vendedor_id", nomeDoVendedor) : [];
  const porLoja = gere && !unidade ? somasPor(operacoes, "unidade_id", nomeDaLoja) : [];
  const deQuem = vendedor ? nomeDoVendedor(vendedor) : unidade ? nomeDaLoja(unidade) : "Toda a rede";
  const endereco = (mudanca: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const atual: Record<string, string | null> = { periodo: periodo === "hoje" ? null : periodo, loja: lojaPedida ?? null, vendedor: vendedorPedido ?? null, ...mudanca };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/connect/relatorio?${q}` : "/connect/relatorio";
  };
  const tabela = (titulo: string, linhas: ({ id: string; nome: string } & Somas)[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label={titulo}>
        <thead className="text-left text-xs text-suave">
          <tr>
            <th className="py-1 pr-3 font-medium">{titulo}</th><th className="py-1 pr-3 text-right font-medium">Ativações</th>
            <th className="py-1 pr-3 text-right font-medium">Recargas</th><th className="py-1 pr-3 text-right font-medium">Portabilidades</th>
            <th className="py-1 pr-3 text-right font-medium">Recebido na loja</th><th className="py-1 text-right font-medium">Pendentes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((l) => (
            <tr key={l.id}>
              <td className="py-2 pr-3">{l.nome}</td>
              <td className="numeros py-2 pr-3 text-right">{numero(l.confirmadas.ativacao)}</td>
              <td className="numeros py-2 pr-3 text-right">{numero(l.confirmadas.recarga)}</td>
              <td className="numeros py-2 pr-3 text-right">{numero(l.confirmadas.portabilidade)}</td>
              <td className="numeros whitespace-nowrap py-2 pr-3 text-right">{brl(l.recebido)}</td>
              <td className="numeros py-2 text-right">{numero(l.emAndamento + l.semResultado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}>
      <CabecalhoConnect sessao={sessao} aba="carteira" titulo="Relatório da Ora Connect" subtitulo={`${deQuem} · ${PERIODOS_FINANCEIROS[periodo].rotulo} · as operações registradas no período`} />
      <CarimboDaImpressao texto={`Ora Connect · relatório de ${deQuem} · ${PERIODOS_FINANCEIROS[periodo].rotulo} · tirado em ${quando(agora().toISOString())}`} />
      <div className="nao-imprimir mt-4 flex flex-wrap items-end gap-3">
        <FiltroSegmentado rotulo="Período" opcoes={ORDEM_DOS_PERIODOS.map((p) => ({ href: endereco({ periodo: p === "hoje" ? null : p }), rotulo: PERIODOS_FINANCEIROS[p].rotulo, ativo: p === periodo }))} />
        {gere && (
          <Form action="/connect/relatorio" prefetch={false} className="flex flex-wrap items-end gap-2">
            {periodo !== "hoje" && <input type="hidden" name="periodo" value={periodo} />}
            <label className="text-sm font-medium">Loja
              <select name="loja" defaultValue={unidade ?? "rede"} className={campo}>
                {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                <option value="rede">Toda a rede (as lojas que você vê)</option>
              </select>
            </label>
            <label className="text-sm font-medium">Vendedor
              <select name="vendedor" defaultValue={vendedor ?? ""} className={campo}>
                <option value="">Todos</option>
                {ids.map((id) => <option key={id} value={id}>{nomeDoVendedor(id)}</option>)}
              </select>
            </label>
            <Botao type="submit" variante="secundario" tamanho="sm">Ver</Botao>
          </Form>
        )}
      </div>

      {gere && (
        // CONNECT-m: a aba Carteira e relatórios, como na demonstração: daqui, o saldo e o extrato da carteira e os relatórios
        // oficiais da rede na Nogle (pedidos ao servidor em Consultar linha, por quem gere a rede) e a conciliação.
        <nav aria-label="Carteira e relatórios da Nogle" className="nao-imprimir mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {gereARede && <Link href="/connect/linha#carteira" className="font-semibold text-acao">Saldo da carteira da Ora na Nogle</Link>}
          {gereARede && <Link href="/connect/linha#relatorios-da-rede" className="font-semibold text-acao">Relatórios da rede na Nogle</Link>}
          <Link href="/connect/conciliacao" className="font-semibold text-acao">Conciliação com os relatórios da Nogle</Link>
        </nav>
      )}

      <section aria-label="Resumo do período" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Ativações confirmadas" valor={numero(somas.confirmadas.ativacao)} />
        <Indicador rotulo="Recargas confirmadas" valor={numero(somas.confirmadas.recarga)} />
        <Indicador rotulo="Portabilidades confirmadas" valor={numero(somas.confirmadas.portabilidade)} />
        <Indicador rotulo="Recebido na loja" valor={brl(somas.recebido)} detalhe={`valor de face dos planos: ${brl(somas.valorDeFace)}`} />
        <Indicador rotulo="Pendentes" valor={numero(somas.emAndamento + somas.semResultado)} tom={somas.semResultado > 0 ? "atencao" : "neutro"}
          detalhe={`${numero(somas.emAndamento)} em andamento · ${numero(somas.semResultado)} sem resultado`} />
        <Indicador rotulo="Não feitas" valor={numero(somas.naoFeitas)} detalhe="recusadas, negadas, não recebidas ou canceladas" />
      </section>

      {porVendedor.length > 1 && <Cartao className="mt-4" titulo="Por vendedor" icone={Users} subtitulo="Só as confirmadas contam para meta e comissão">{tabela("Vendedor", porVendedor)}</Cartao>}
      {porLoja.length > 1 && <Cartao className="mt-4" titulo="Por loja" icone={Store}>{tabela("Loja", porLoja)}</Cartao>}

      <Cartao className="mt-4" titulo="Operações" icone={ListChecks}
        subtitulo={operacoes.length > LIMITE_DA_LISTA ? `As ${numero(LIMITE_DA_LISTA)} mais recentes de ${numero(operacoes.length)}; a planilha leva todas` : `${numero(operacoes.length)} no período`}
        acao={operacoes.length > 0 ? (
          <span className="nao-imprimir flex flex-wrap gap-2">
            <ExportarCsv nomeArquivo={`relatorio-${periodo}`} prefixo="ora5g-connect" colunas={COLUNAS_DO_CSV} linhas={linhasDoCsv(operacoes, nomeDoVendedor, nomeDaLoja, quando)} />
            <BotaoImprimir />
          </span>
        ) : undefined}>
        {operacoes.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma operação no período.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm" aria-label="Operações do período">
            {operacoes.slice(0, LIMITE_DA_LISTA).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-xs text-suave">{quando(o.criado_em)}</span>
                <span className="font-semibold">{`Nº ${o.numero} · ${nomeDoTipo(o.tipo)}`}</span>
                <Selo tom={o.situacao === "confirmada" ? "sucesso" : ["recusada", "negada", "nao_recebida", "cancelada"].includes(o.situacao) ? "neutro" : "aviso"}>{nomeDaSituacao(o.situacao)}</Selo>
                <span>{[o.plano_nome, nomeDoVendedor(o.vendedor_id), unidade ? null : nomeDaLoja(o.unidade_id)].filter(Boolean).join(" · ")}</span>
                {o.recebido_na_loja_centavos !== null && <span className="numeros text-suave">{`recebido ${brl(o.recebido_na_loja_centavos)}`}</span>}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      {totalConfirmadas(somas) === 0 && operacoes.length > 0 && (
        <p className="mt-2 text-xs text-suave">Nenhuma confirmada ainda: a produção conta quando a Nogle confirma cada operação.</p>
      )}
    </MoldeReal>
  );
}

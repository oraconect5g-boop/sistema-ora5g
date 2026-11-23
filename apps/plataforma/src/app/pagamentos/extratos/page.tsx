import { ArrowLeft, FileSpreadsheet, FileUp, Landmark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, BotaoLink, Cartao, EstadoVazio, Selo, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ERROS_DOS_EXTRATOS, TIPOS_DE_EXTRATO } from "../../../lib/extratos/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";

export const metadata: Metadata = { title: "Extratos" };
export const dynamic = "force-dynamic";

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
type Extrato = {
  id: string; numero: number; unidade_id: string | null; loja: string | null; tipo: string; fonte: string; arquivo: string; periodo_inicio: string;
  periodo_fim: string; linhas: number; importado_em: string; pendentes: number; conciliadas: number; ignoradas: number;
  /** AUD-c: as linhas que são o recebimento de um repasse de marketplace (o banco de antes da migration não manda). */
  repasses?: number;
};

// Os extratos importados (lote EXT-a: ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; ADR-016): os das lojas em que a pessoa
// concilia e, para quem concilia pela rede, os da rede; quantas linhas ainda esperam conferência em cada um.
export default async function Extratos({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  if (!sessao.molde.permissoes.has("pagamento.conciliar")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Conciliar pagamentos é da gerência da loja.</Aviso></MoldeReal>;
  }
  const erro = chaveDoCatalogo(ERROS_DOS_EXTRATOS, parametros.erro);
  const resposta = await sessao.supabase.rpc("extratos_recentes", { p_limite: 50 });
  if (resposta.error) throw new FalhaDoServico("extratos_recentes");
  const extratos = resposta.data as unknown as Extrato[];

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <Link href="/pagamentos/conciliacao" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Conciliação</Link>
      <TituloPagina titulo="Extratos" subtitulo="O extrato da maquininha ou do banco, por arquivo: o sistema sugere a venda de cada linha, e você concilia. Venda não é dinheiro recebido."
        acao={<span className="flex flex-wrap gap-2">
          <BotaoLink href="/pagamentos/contas-bancarias" tamanho="sm" variante="secundario"><Landmark className="size-4" aria-hidden />Contas bancárias</BotaoLink>
          <BotaoLink href="/pagamentos/extratos/importar" tamanho="sm"><FileUp className="size-4" aria-hidden />Importar extrato</BotaoLink>
        </span>} />
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DOS_EXTRATOS[erro]}</Aviso>}
      <Cartao className="mt-4" titulo="Importados" subtitulo="Os 50 mais recentes." icone={FileSpreadsheet}>
        {extratos.length === 0 ? (
          <EstadoVazio titulo="Nenhum extrato importado ainda" icone={FileSpreadsheet}
            acao={<BotaoLink href="/pagamentos/extratos/importar" tamanho="sm" variante="secundario">Importar o primeiro</BotaoLink>}>
            Baixe o relatório de vendas no site ou no app da maquininha (ou o OFX do banco) e importe aqui.
          </EstadoVazio>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {extratos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <Link href={`/pagamentos/extratos/${e.id}`} className="font-semibold text-acao">Extrato nº {e.numero} · {e.fonte}</Link>
                  <p className="numeros text-xs text-suave">
                    {e.loja ?? "Rede"} · {TIPOS_DE_EXTRATO[e.tipo as keyof typeof TIPOS_DE_EXTRATO]?.split(" (")[0] ?? e.tipo} · de {dataCurta(e.periodo_inicio)} a {dataCurta(e.periodo_fim)} · {e.linhas} linhas · importado em {quando(e.importado_em)}
                  </p>
                </div>
                <span className="flex flex-wrap gap-1.5">
                  {e.pendentes > 0 && <Selo tom="aviso">{e.pendentes} a conferir</Selo>}
                  {e.conciliadas > 0 && <Selo tom="sucesso">{e.conciliadas} conciliadas</Selo>}
                  {(e.repasses ?? 0) > 0 && <Selo tom="info">{e.repasses} de repasse</Selo>}
                  {e.ignoradas > 0 && <Selo tom="neutro">{e.ignoradas} fora da conta</Selo>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </MoldeReal>
  );
}

import { Scale } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Cartao, Indicador, Selo } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import {
  NOMES_DOS_RELATORIOS, RESULTADOS_DA_CONCILIACAO, SO_NA_ORA, ehResultadoDaConciliacao, finalDoNumero, totaisDaConciliacao,
} from "../../../lib/connect/conciliacao";
import { centavosDoBanco } from "../../../lib/dinheiro";
import { brl, numero } from "../../../lib/formato";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { CabecalhoConnect, LARGURA_DA_CONNECT } from "../CabecalhoConnect";

export const metadata: Metadata = { title: "Conciliação com a Nogle" };
export const dynamic = "force-dynamic";

const dia = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
type Conciliacao = { id: string; numero: number; relatorio: string; de: string; ate: string; recebida_em: string; totais: unknown };
type Linha = { ordem: number; linha: string | null; iccid: string | null; dia: string | null; plano: string | null; valor_centavos: number | string | null; resultado: string; operacao_id: string | null };
type SoAqui = { operacao_id: string; connect_operacoes: { numero: number; tipo: string; linha: string | null; numero_ativado: string | null; iccid: string | null; concluida_em: string | null; valor_face_centavos: number | string | null } | null };

// A conciliação da produção com os relatórios oficiais da Nogle (lote CONNECT-c; ORA-CONNECT-009). O worker grava; aqui
// quem gere a Ora Connect lê, pela RLS (connect.gerir na rede). A tela não chama a Nogle nem vê credencial.
export default async function ConciliacaoDaNogle({ searchParams }: { searchParams: Promise<{ id?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  if (!permite(sessao, "connect.gerir")) {
    return <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}><CabecalhoConnect sessao={sessao} aba="carteira" /><Aviso tom="aviso" className="mt-4">A conciliação com a Nogle é de quem gere a Ora Connect.</Aviso></MoldeReal>;
  }
  const { supabase } = sessao;
  const lidas = await supabase.from("connect_conciliacoes").select("id, numero, relatorio, de, ate, recebida_em, totais").order("recebida_em", { ascending: false }).limit(20);
  if (lidas.error) throw new FalhaDoServico("connect_conciliacoes");
  const conciliacoes = lidas.data as unknown as Conciliacao[];
  const pedida = textoDoParametro(parametros.id);
  const aberta = conciliacoes.find((c) => c.id === pedida) ?? (pedida === undefined ? conciliacoes[0] : undefined);

  let linhas: Linha[] = [];
  let soAqui: SoAqui[] = [];
  if (aberta && ehUuid(aberta.id)) {
    const [l, s] = await Promise.all([
      supabase.from("connect_conciliacao_linhas").select("ordem, linha, iccid, dia, plano, valor_centavos, resultado, operacao_id")
        .eq("conciliacao_id", aberta.id).neq("resultado", "conferida").order("ordem").limit(200),
      supabase.from("connect_conciliacao_so_aqui").select("operacao_id, connect_operacoes(numero, tipo, linha, numero_ativado, iccid, concluida_em, valor_face_centavos)")
        .eq("conciliacao_id", aberta.id).limit(200),
    ]);
    if (l.error) throw new FalhaDoServico("connect_conciliacao_linhas");
    if (s.error) throw new FalhaDoServico("connect_conciliacao_so_aqui");
    linhas = l.data as unknown as Linha[];
    soAqui = s.data as unknown as SoAqui[];
  }
  const t = totaisDaConciliacao(aberta?.totais);

  return (
    <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}>
      <CabecalhoConnect sessao={sessao} aba="carteira" titulo="Conciliação com a Nogle" subtitulo="As ativações e as recargas da Ora conferidas com os relatórios oficiais da Nogle (ORA-CONNECT-009)" />
      <Aviso tom="info" className="mt-4">
        Ficam de fora, por enquanto: o extrato do saldo (o exemplo oficial da Nogle não traz os campos da resposta) e as comissões e
        bonificações (a Nogle respondeu que não há na API; a fonte oficial precisa ser indicada). Nada aqui muda uma operação: a
        conciliação só mostra o que fecha e o que não fecha.
      </Aviso>
      {conciliacoes.length === 0 ? (
        <Cartao className="mt-4" titulo="Nenhuma conciliação ainda" icone={Scale}>
          <p className="text-sm text-suave">
            O servidor busca os relatórios de ativações e de recargas da Nogle (o comando de conciliação do worker) quando a Nogle
            estiver ligada: faltam as chaves no servidor e a confirmação do tipo da chave. Até lá, nada aparece aqui.
          </p>
        </Cartao>
      ) : (
        <>
          <nav aria-label="Conciliações" className="mt-4 flex flex-wrap gap-2 text-sm">
            {conciliacoes.map((c) => (
              <Link key={c.id} href={`/connect/conciliacao?id=${c.id}`} aria-current={c.id === aberta?.id ? "page" : undefined}
                className={`rounded-botao px-3 py-2 font-semibold ${c.id === aberta?.id ? "bg-acao text-white" : "bg-white text-acao ring-1 ring-borda"}`}>
                {`Nº ${c.numero} · ${NOMES_DOS_RELATORIOS[c.relatorio] ?? c.relatorio} · ${dia(c.de)} a ${dia(c.ate)}`}
              </Link>
            ))}
          </nav>
          {aberta ? (
            <>
              <p className="mt-2 text-xs text-suave">{`Recebida em ${quando(aberta.recebida_em)}; ${numero(t.linhas)} linhas no relatório da Nogle.`}</p>
              <section aria-label="Resumo da conciliação" className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Indicador rotulo={RESULTADOS_DA_CONCILIACAO.conferida.rotulo} valor={numero(t.conferidas)} detalhe={RESULTADOS_DA_CONCILIACAO.conferida.detalhe} />
                <Indicador rotulo={RESULTADOS_DA_CONCILIACAO.valor_diferente.rotulo} valor={numero(t.valor_diferente)} detalhe={RESULTADOS_DA_CONCILIACAO.valor_diferente.detalhe} />
                <Indicador rotulo={RESULTADOS_DA_CONCILIACAO.so_na_nogle.rotulo} valor={numero(t.so_na_nogle)} detalhe={RESULTADOS_DA_CONCILIACAO.so_na_nogle.detalhe} />
                <Indicador rotulo={SO_NA_ORA.rotulo} valor={numero(t.so_aqui)} detalhe={SO_NA_ORA.detalhe} />
                <Indicador rotulo={RESULTADOS_DA_CONCILIACAO.sem_identificacao.rotulo} valor={numero(t.sem_identificacao)} detalhe={RESULTADOS_DA_CONCILIACAO.sem_identificacao.detalhe} />
              </section>
              <Cartao className="mt-4" titulo="O que não fecha" subtitulo="As linhas da Nogle que não conferiram e as operações da Ora que a Nogle não trouxe (até 200 de cada)">
                {linhas.length === 0 && soAqui.length === 0 ? (
                  <p className="text-sm text-suave">Tudo conferido nesta conciliação.</p>
                ) : (
                  <ul className="divide-y divide-borda text-sm">
                    {linhas.map((l) => (
                      <li key={`n${l.ordem}`} className="py-2">
                        <p className="numeros">
                          <Selo tom={l.resultado === "valor_diferente" ? "aviso" : "perigo"}>{ehResultadoDaConciliacao(l.resultado) ? RESULTADOS_DA_CONCILIACAO[l.resultado].rotulo : l.resultado}</Selo>
                          {` Linha ${l.ordem} do relatório · ${dia(l.dia)} · linha ${finalDoNumero(l.linha)} · ICCID ${finalDoNumero(l.iccid)}`}
                        </p>
                        <p className="numeros text-xs text-suave">{`${l.plano ?? "plano não informado"}${l.valor_centavos !== null ? ` · ${brl(centavosDoBanco(l.valor_centavos))}` : ""}`}</p>
                      </li>
                    ))}
                    {soAqui.map((s) => (
                      <li key={`a${s.operacao_id}`} className="py-2">
                        <p className="numeros">
                          <Selo tom="aviso">{SO_NA_ORA.rotulo}</Selo>
                          {` Operação nº ${s.connect_operacoes?.numero ?? "—"} · ${s.connect_operacoes?.tipo === "recarga" ? "recarga" : "ativação"} · ${dia(s.connect_operacoes?.concluida_em ?? null)}`}
                          {` · linha ${finalDoNumero(s.connect_operacoes?.linha ?? s.connect_operacoes?.numero_ativado ?? null)} · ICCID ${finalDoNumero(s.connect_operacoes?.iccid ?? null)}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>
            </>
          ) : <Aviso tom="aviso" className="mt-4">Conciliação não encontrada.</Aviso>}
        </>
      )}
    </MoldeReal>
  );
}

import { BadgeDollarSign, CircleSlash, HandCoins, Landmark, ReceiptText, RotateCcw, ShoppingBag, Undo2, Wallet } from "lucide-react";
import Link from "next/link";

import { BarrasHorizontais, ColunasDivergentes, TabelaDoGrafico } from "../../componentes/graficos";
import { Aviso, BotaoLink, Cartao, Celula, EstadoVazio, FiltroSegmentado, Indicador, ListaDados, Selo, Tabela, type Tom } from "../../componentes/ui";
import { PERIODOS_FINANCEIROS, variacaoFinanceira, type PeriodoFinanceiro, type ResumoFinanceiro, type seriesDoPainel } from "../../lib/financeiro/painel";
import { nomeDoMeio, ORDEM_DAS_VISOES, POR_PAGINA, VISOES, type Registros, type Visao } from "../../lib/financeiro/registros";
import { brl, brlCompacto, brlEixo, numero } from "../../lib/formato";

// Apresentação do financeiro real (#65), separada da leitura: recebe os números já somados no banco
// e os registros da página. Sem acesso a dados aqui (a página confere sessão, permissão e escopo).

const quando = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
const SITUACAO: Record<string, { nome: string; tom: Tom }> = {
  concluida: { nome: "concluída", tom: "sucesso" }, cancelada: { nome: "cancelada", tom: "neutro" },
  confirmado: { nome: "confirmado", tom: "sucesso" }, estorno_pendente: { nome: "estorno pendente", tom: "aviso" }, estornado: { nome: "estornado", tom: "neutro" },
  aberto: { nome: "aberto", tom: "info" }, fechado: { nome: "fechado", tom: "aviso" }, conferido: { nome: "conferido", tom: "sucesso" },
};
const situacao = (codigo: string) => SITUACAO[codigo] ?? { nome: codigo, tom: "neutro" as Tom };

// Nome curto no gráfico (a tabela e o CSV levam o nome inteiro).
const nomeCurto = (nome: string) => nome.replace(" na maquininha", "");

export type Nomes = { pessoa: (id: string) => string; loja: (id: string) => string };
export type Ligacao = (mudanca: Partial<Record<"periodo" | "loja" | "ver" | "situacao" | "pagina", string | undefined>>) => string;

export function ConteudoFinanceiro({ resumo: r, anterior: ra, series, porHora, periodo, conferenteDeCaixa, visao, filtroSituacao, pagina, lista, nomes, daRede, href }: {
  resumo: ResumoFinanceiro;
  anterior: ResumoFinanceiro;
  series: ReturnType<typeof seriesDoPainel>;
  porHora: boolean;
  periodo: PeriodoFinanceiro;
  conferenteDeCaixa: boolean;
  visao: Visao;
  filtroSituacao: string | null;
  pagina: number;
  lista: { registros: Registros; total: number };
  nomes: Nomes;
  daRede: boolean;
  href: Ligacao;
}) {
  const comparacao = PERIODOS_FINANCEIROS[periodo].comparacao;
  const variacao = (agora: number, antes: number, bomQuandoSobe = true) => {
    const fracao = variacaoFinanceira(agora, antes);
    return fracao === null ? undefined : { fracao, referencia: `vs. ${comparacao}`, bomQuandoSobe };
  };
  const semHistorico = ra.vendido === 0 && ra.recebido === 0 ? `Sem histórico para comparar com ${comparacao}` : undefined;
  const semFatos = r.vendas === 0 && r.devolucoes === 0 && r.cancelamentos === 0;

  return (
    <>
    <section aria-label="Resumo do período" className="sem-barra -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      <Indicador className="w-[78%] shrink-0 snap-start sm:w-auto" rotulo="Vendas concluídas" valor={brlCompacto(r.vendido)} icone={ShoppingBag} variacao={variacao(r.vendido, ra.vendido)} detalhe={`${numero(r.vendas)} venda${r.vendas === 1 ? "" : "s"}${semHistorico ? ` · ${semHistorico}` : ""}`} />
      <Indicador className="w-[78%] shrink-0 snap-start sm:w-auto" rotulo="Devoluções e cancelamentos" valor={brl(r.devolvido + r.cancelado)} icone={Undo2} detalhe={`${numero(r.devolucoes)} devoluç${r.devolucoes === 1 ? "ão" : "ões"} · ${numero(r.cancelamentos)} cancelamento${r.cancelamentos === 1 ? "" : "s"}`} />
      <Indicador className="w-[78%] shrink-0 snap-start sm:w-auto" rotulo="Vendido líquido" valor={brlCompacto(r.liquido)} icone={BadgeDollarSign} variacao={variacao(r.liquido, ra.liquido)} detalhe="Vendas menos devoluções e cancelamentos, cada um na sua data" />
      <Indicador className="w-[78%] shrink-0 snap-start sm:w-auto" rotulo="Recebido na loja (registro)" valor={brlCompacto(r.recebido)} icone={HandCoins} variacao={variacao(r.recebido, ra.recebido)} detalhe="Pagamentos confirmados, troco descontado. Não é liquidação" />
      <Indicador className="w-[78%] shrink-0 snap-start sm:w-auto" rotulo="A receber das financeiras" valor={brl(r.aReceberAberto)} icone={Landmark} detalhe="PayJoy e Aiva, registrado no período; prazo e taxa ainda sem contrato" />
      <Indicador className="w-[78%] shrink-0 snap-start sm:w-auto" rotulo="Estornos externos pendentes" valor={brl(r.estornoPendente.valor)} icone={RotateCcw} tom={r.estornoPendente.quantidade > 0 ? "atencao" : "neutro"} detalhe={r.estornoPendente.quantidade > 0 ? `${r.estornoPendente.quantidade} aguardando o comprovante` : "Nenhum aguardando comprovante"} />
    </section>

    <div className="grid gap-4 xl:grid-cols-3">
      <Cartao titulo="Vendas e devoluções" subtitulo={`${porHora ? "Por hora" : "Por dia"} · devoluções e cancelamentos para baixo`} className="xl:col-span-2">
        {semFatos ? (
          <EstadoVazio titulo="Nenhuma venda concluída no período" icone={ShoppingBag}>A leitura está funcionando; só não houve venda, devolução nem cancelamento {periodo === "hoje" ? "hoje" : "no período"}.</EstadoVazio>
        ) : (
          <>
            <ColunasDivergentes
              dados={series.vendas.map((s) => ({ rotulo: s.rotulo, entrada: s.vendido, saida: s.desfeito }))}
              nomes={["Vendas concluídas", "Devoluções e cancelamentos"]}
              rotuloSaldo="Líquido"
              formatar={brl}
              formatarEixo={brlEixo}
              cadaRotulo={series.vendas.length > 16 ? 3 : series.vendas.length > 8 ? 2 : 1}
            />
            <TabelaDoGrafico
              colunas={[porHora ? "Hora" : "Dia", "Vendas", "Vendido", "Devolvido e cancelado"]}
              linhas={series.vendas.map((s) => [s.rotulo, s.vendas, brl(s.vendido), brl(s.desfeito)])}
            />
          </>
        )}
      </Cartao>

      <Cartao titulo="Pagamentos registrados por meio" subtitulo="Confirmados no sistema; troco descontado do dinheiro">
        {r.meios.length === 0 ? (
          <EstadoVazio titulo="Nenhum pagamento confirmado no período" icone={ReceiptText} />
        ) : (
          <>
            <BarrasHorizontais
              nomeSerie="Recebido"
              formatar={brl}
              dados={r.meios.map((m) => ({ rotulo: nomeCurto(m.nome), valor: m.valor, detalhe: `${m.quantidade} pag.` }))}
            />
            <TabelaDoGrafico colunas={["Meio", "Recebido", "Pagamentos", "Entradas de financiamento"]} linhas={r.meios.map((m) => [m.nome, brl(m.valor), m.quantidade, brl(m.entradas)])} />
          </>
        )}
        <ListaDados
          className="mt-4 border-t border-borda pt-3"
          itens={[
            ...(r.entradasDeFinanciamento > 0 ? [["Entradas de financiamento (já somadas no meio em que foram pagas)", brl(r.entradasDeFinanciamento)] as const] : []),
            ...r.financiado.map((f) => [`${f.nome}: a receber`, brl(f.valor)] as const),
            ...(r.valeUsado > 0 ? [["Vale-troca usado (crédito, não é dinheiro)", brl(r.valeUsado)] as const] : []),
            ...(r.pagamentosDesfeitos.quantidade > 0 ? [[`Pagamentos de vendas canceladas (${r.pagamentosDesfeitos.quantidade})`, brl(r.pagamentosDesfeitos.valor)] as const] : []),
            ["Estornos confirmados com comprovante", brl(r.estornoConfirmado.valor)],
          ]}
        />
      </Cartao>
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Cartao titulo="Movimentação dos caixas" subtitulo="Só dinheiro, na gaveta. Fundo e suprimento não são receita; sangria não é despesa" className="xl:col-span-2">
        {r.gaveta.length === 0 ? (
          <EstadoVazio titulo="Nenhum movimento de gaveta no período" icone={Wallet}>{conferenteDeCaixa ? "Nenhum caixa desta loja teve movimento em dinheiro." : "Você não confere caixas: os caixas da loja não entram aqui."}</EstadoVazio>
        ) : (
          <>
            <ColunasDivergentes
              dados={series.gaveta.map((s) => ({ rotulo: s.rotulo, entrada: s.entrada, saida: s.saida }))}
              nomes={["Entrou na gaveta", "Saiu da gaveta"]}
              rotuloSaldo="Diferença"
              formatar={brl}
              formatarEixo={brlEixo}
              cadaRotulo={series.gaveta.length > 16 ? 3 : series.gaveta.length > 8 ? 2 : 1}
            />
            <ListaDados className="mt-4 border-t border-borda pt-3" itens={[...r.gaveta.map((m) => [m.nome, brl(m.valor)] as const), ["Diferença das movimentações", brl(r.saldoDaGaveta)]]} />
          </>
        )}
      </Cartao>

      <Cartao titulo="Fechamentos" subtitulo="Esperado × contado nos caixas fechados no período">
        <ListaDados
          itens={[
            ["Caixas abertos agora", numero(r.caixas.abertosAgora)],
            ["Fechados no período", numero(r.caixas.fechados)],
            ["Conferidos pela gerência", numero(r.caixas.conferidos)],
            ["Com diferença", numero(r.caixas.comDiferenca)],
            ["Soma das diferenças", brl(r.caixas.diferenca)],
            ["Diferença absoluta (faltas + sobras)", brl(r.caixas.diferencaAbsoluta)],
          ]}
        />
        {r.caixas.comDiferenca > 0 && <Aviso tom="aviso" className="mt-4">Há caixa com diferença: veja os caixas abaixo e a conferência no Caixa.</Aviso>}
      </Cartao>
    </div>

    <Cartao titulo="Registros do período" subtitulo="O que explica cada número; a exportação leva todos os registros da visão">
      <div className="flex flex-col gap-3">
        <FiltroSegmentado rotulo="Registros" opcoes={ORDEM_DAS_VISOES.map((v: Visao) => ({ href: href({ ver: v === "vendas" ? undefined : v, situacao: undefined, pagina: undefined }), rotulo: VISOES[v].rotulo, ativo: v === visao }))} />
        {Object.keys(VISOES[visao].situacoes).length > 0 && (
          <FiltroSegmentado
            rotulo="Situação"
            opcoes={[
              { href: href({ situacao: undefined, pagina: undefined }), rotulo: "Todas", ativo: filtroSituacao === null },
              ...Object.entries(VISOES[visao].situacoes as Record<string, string>).map(([codigo, rotulo]) => ({ href: href({ situacao: codigo, pagina: undefined }), rotulo, ativo: codigo === filtroSituacao })),
            ]}
          />
        )}
      </div>
      <div className="mt-4">
        {lista.total === 0 ? (
          <EstadoVazio titulo="Nenhum registro nesta visão" icone={CircleSlash} />
        ) : (
          <TabelaDosRegistros registros={lista.registros} nomes={nomes} daRede={daRede} />
        )}
      </div>
      {lista.total > POR_PAGINA && (
        <nav aria-label="Páginas" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-suave">{`${(pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, lista.total)} de ${numero(lista.total)}`}</span>
          <span className="flex gap-2">
            {pagina > 1 && <BotaoLink href={href({ pagina: pagina - 1 === 1 ? undefined : String(pagina - 1) })} variante="secundario" tamanho="sm">Anterior</BotaoLink>}
            {pagina * POR_PAGINA < lista.total && <BotaoLink href={href({ pagina: String(pagina + 1) })} variante="secundario" tamanho="sm">Próxima</BotaoLink>}
          </span>
        </nav>
      )}
    </Cartao>

    <Cartao titulo="Ainda não está no financeiro real" subtitulo="Mostrado como indisponível, sem número inventado">
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {[
          ["Margem bruta", "custo histórico só para quem tem custo.ver; próxima fatia"],
          ["Conciliação com extratos", "depende dos arquivos das maquininhas e do banco (PAY-009/010)"],
          ["Contas a pagar e DRE", "modelos ainda não existem (FIN-002/004)"],
          ["Repasses das financeiras e da Nogle", "prazo, taxa e contrato ainda não confirmados"],
        ].map(([titulo, motivo]) => (
          <li key={titulo} className="flex items-start gap-2 rounded-2xl bg-fundo/70 px-3 py-2.5">
            <Selo tom="neutro">indisponível</Selo>
            <span><strong className="font-semibold">{titulo}</strong> <span className="text-suave">· {motivo}</span></span>
          </li>
        ))}
      </ul>
    </Cartao>
    </>
  );
}

export function TabelaDosRegistros({ registros, nomes, daRede }: { registros: Registros; nomes: { pessoa: (id: string) => string; loja: (id: string) => string }; daRede: boolean }) {
  const linkDaVenda = (id: string, n: number) => <Link href={`/vendas/${id}`} className="whitespace-nowrap font-semibold text-acao hover:underline">Venda {n}</Link>;
  if (registros.visao === "vendas") {
    return (
      <Tabela legenda="Vendas do período" colunas={["Venda", "Quando", ...(daRede ? ["Loja"] : []), "Vendedor", "Total", "Devolvido", "Situação"]} alinharDireita={daRede ? [4, 5] : [3, 4]}>
        {registros.linhas.map((l) => (
          <tr key={l.id}>
            <Celula>{linkDaVenda(l.id, l.numero)}</Celula>
            <Celula className="numeros whitespace-nowrap text-suave">{quando(l.quando)}</Celula>
            {daRede && <Celula>{nomes.loja(l.unidadeId)}</Celula>}
            <Celula>{nomes.pessoa(l.pessoaId)}</Celula>
            <Celula className="numeros whitespace-nowrap text-right font-semibold">{brl(l.total)}</Celula>
            <Celula className="numeros whitespace-nowrap text-right text-suave">{l.devolvido > 0 ? brl(l.devolvido) : "—"}</Celula>
            <Celula><Selo tom={situacao(l.situacao).tom} ponto>{situacao(l.situacao).nome}</Selo></Celula>
          </tr>
        ))}
      </Tabela>
    );
  }
  if (registros.visao === "pagamentos") {
    return (
      <Tabela legenda="Pagamentos do período" colunas={["Venda", "Quando", ...(daRede ? ["Loja"] : []), "Meio", "Valor", "Entrada", "Situação"]} alinharDireita={daRede ? [4, 5] : [3, 4]}>
        {registros.linhas.map((l, i) => (
          <tr key={`${l.vendaId}-${i}`}>
            <Celula>{linkDaVenda(l.vendaId, l.vendaNumero)}</Celula>
            <Celula className="numeros whitespace-nowrap text-suave">{quando(l.quando)}</Celula>
            {daRede && <Celula>{nomes.loja(l.unidadeId)}</Celula>}
            <Celula>{nomeDoMeio(l.meio)}</Celula>
            <Celula className="numeros whitespace-nowrap text-right font-semibold">{brl(l.valor)}</Celula>
            <Celula className="numeros whitespace-nowrap text-right text-suave">{l.entrada > 0 ? `${brl(l.entrada)} (${nomeDoMeio(l.meioEntrada)})` : "—"}</Celula>
            <Celula><Selo tom={situacao(l.situacao).tom} ponto>{situacao(l.situacao).nome}</Selo></Celula>
          </tr>
        ))}
      </Tabela>
    );
  }
  if (registros.visao === "devolucoes") {
    return (
      <Tabela legenda="Devoluções do período" colunas={["Devolução", "Venda", "Quando", ...(daRede ? ["Loja"] : []), "Valor", "Motivo"]} alinharDireita={daRede ? [4] : [3]}>
        {registros.linhas.map((l) => (
          <tr key={l.numero}>
            <Celula className="font-semibold">nº {l.numero}</Celula>
            <Celula>{linkDaVenda(l.vendaId, l.vendaNumero)}</Celula>
            <Celula className="numeros whitespace-nowrap text-suave">{quando(l.quando)}</Celula>
            {daRede && <Celula>{nomes.loja(l.unidadeId)}</Celula>}
            <Celula className="numeros whitespace-nowrap text-right font-semibold">{brl(l.valor)}</Celula>
            <Celula className="max-w-[18rem] truncate text-suave">{l.motivo}</Celula>
          </tr>
        ))}
      </Tabela>
    );
  }
  return (
    <Tabela legenda="Caixas do período" colunas={["Operador", ...(daRede ? ["Loja"] : []), "Aberto", "Fechado", "Fundo", "Esperado", "Contado", "Diferença", "Situação"]} alinharDireita={daRede ? [4, 5, 6, 7] : [3, 4, 5, 6]} minimo="min-w-[46rem]">
      {registros.linhas.map((l, i) => (
        <tr key={`${l.pessoaId}-${l.abertoEm}-${i}`}>
          <Celula>{nomes.pessoa(l.pessoaId)}</Celula>
          {daRede && <Celula>{nomes.loja(l.unidadeId)}</Celula>}
          <Celula className="numeros whitespace-nowrap text-suave">{quando(l.abertoEm)}</Celula>
          <Celula className="numeros whitespace-nowrap text-suave">{quando(l.fechadoEm)}</Celula>
          <Celula className="numeros whitespace-nowrap text-right">{brl(l.fundo)}</Celula>
          <Celula className="numeros whitespace-nowrap text-right">{l.esperado === null ? "—" : brl(l.esperado)}</Celula>
          <Celula className="numeros whitespace-nowrap text-right">{l.contado === null ? "—" : brl(l.contado)}</Celula>
          <Celula className={`numeros text-right font-semibold ${l.diferenca ? "text-perigo" : ""}`}>{l.diferenca === null ? "—" : brl(l.diferenca)}</Celula>
          <Celula><Selo tom={situacao(l.situacao).tom} ponto>{situacao(l.situacao).nome}</Selo></Celula>
        </tr>
      ))}
    </Tabela>
  );
}

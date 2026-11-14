import Link from "next/link";

import { ChevronLeft, ChevronRight, Info, Layers, ListTree, PiggyBank, ReceiptText, Store, Tags, TrendingUp, Wallet } from "lucide-react";

import { BarrasComSinal, BarrasHorizontais, Cascata, ColunasComSinal, TabelaDoGrafico, type Degrau } from "../../componentes/graficos";
import { EstadoDoPainel, NOTA, plural } from "../../componentes/paineis-de-vendas";
import { Aviso, Cartao, FiltroSegmentado, Indicador, Selo } from "../../componentes/ui";
import { brl, brlComSinal, brlCompacto, brlCompactoComSinal, brlEixoComSinal, percentual, percentualComSinal } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";
import { resultadoPorRegiao, type RegioesDoPainel } from "../../lib/lojas/regioes";
import { nomeDoMes, somarMeses } from "../../lib/metas/painel";
import type { ResultadoDoMes } from "../../lib/resultado/consulta";
import { daReceita, mesCurto, MESES_DE_HISTORICO, type FiltroDoResultado } from "../../lib/resultado/regras";

// Resultado do mês (lote L8b). Só apresentação: os números chegam somados e conferidos por
// lib/resultado/consulta; falha e banco sem a leitura têm estado próprio e nunca viram zero.

const maiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** O endereço da tela para um mês e um filtro (o mês atual e a rede inteira ficam fora do endereço). */
export function enderecoDoResultado(mes: string, mesAtual: string, filtro: FiltroDoResultado): string {
  const p = new URLSearchParams();
  if (mes !== mesAtual) p.set("mes", mes.slice(0, 7));
  if (filtro.tipo === "loja") p.set("loja", filtro.id);
  const texto = p.toString();
  return texto ? `/resultado?${texto}` : "/resultado";
}

type Props = {
  leitura: Leitura<ResultadoDoMes>; mes: string; mesAtual: string; filtro: FiltroDoResultado;
  /** ORG-009b: as regiões da rede, só na rede inteira; com alguma loja em região, o resultado por região. */
  regioes?: RegioesDoPainel;
};

export function ConteudoResultado({ leitura, mes, mesAtual, filtro, regioes = null }: Props) {
  const lojas = leitura.estado === "ok" ? leitura.dados.lojas : [];
  return (
    <>
      <div className="nao-imprimir space-y-2">
        <PassoDoMes mes={mes} mesAtual={mesAtual} filtro={filtro} />
        {lojas.length > 0 && (
          <FiltroSegmentado
            rotulo="Onde"
            opcoes={[
              { href: enderecoDoResultado(mes, mesAtual, { tipo: "rede" }), rotulo: "Rede inteira", ativo: filtro.tipo === "rede" },
              ...lojas.map((l) => ({ href: enderecoDoResultado(mes, mesAtual, { tipo: "loja", id: l.id }), rotulo: l.nome, ativo: filtro.tipo === "loja" && filtro.id === l.id })),
            ]}
          />
        )}
      </div>
      {leitura.estado !== "ok" ? (
        <Cartao titulo="Resultado do mês" icone={PiggyBank}>
          <EstadoDoPainel estado={leitura.estado} fonte="resultado" tentarDeNovo={enderecoDoResultado(mes, mesAtual, filtro)} />
        </Cartao>
      ) : (
        <Painel r={leitura.dados} mesAtual={mesAtual} regioes={regioes} />
      )}
      <ComoLer />
    </>
  );
}

/** Mês anterior e seguinte (até 24 meses atrás, até o mês atual), sem JavaScript. */
function PassoDoMes({ mes, mesAtual, filtro }: { mes: string; mesAtual: string; filtro: FiltroDoResultado }) {
  const anterior = somarMeses(mes, -1);
  const seguinte = somarMeses(mes, 1);
  const podeVoltar = anterior >= somarMeses(mesAtual, -MESES_DE_HISTORICO);
  const podeAvancar = seguinte <= mesAtual;
  const botao = "grid size-10 shrink-0 place-items-center rounded-full border border-borda bg-white text-texto hover:border-borda-forte";
  return (
    <nav aria-label="Mês do resultado" className="flex items-center gap-2">
      {podeVoltar
        ? <Link href={enderecoDoResultado(anterior, mesAtual, filtro)} scroll={false} aria-label={`Mês anterior: ${nomeDoMes(anterior)}`} className={botao}><ChevronLeft aria-hidden className="size-4" /></Link>
        : <span aria-hidden className={`${botao} opacity-40`}><ChevronLeft className="size-4" /></span>}
      <p className="min-w-0 flex-1 text-center text-[15px] font-semibold sm:flex-none sm:px-2">
        {maiuscula(nomeDoMes(mes))}
        {mes === mesAtual && <span className="ml-2 align-middle"><Selo tom="info">até hoje</Selo></span>}
      </p>
      {podeAvancar
        ? <Link href={enderecoDoResultado(seguinte, mesAtual, filtro)} scroll={false} aria-label={`Próximo mês: ${nomeDoMes(seguinte)}`} className={botao}><ChevronRight aria-hidden className="size-4" /></Link>
        : <span aria-hidden className={`${botao} opacity-40`}><ChevronRight className="size-4" /></span>}
    </nav>
  );
}

function Painel({ r, mesAtual, regioes }: { r: ResultadoDoMes; mesAtual: string; regioes: RegioesDoPainel }) {
  const l = r.linhas;
  const naRede = r.unidade === null;
  const daReceitaTexto = (valor: number) => {
    const fracao = daReceita(valor, l.receitaLiquida);
    return fracao === null ? null : percentualComSinal(fracao);
  };
  const parte = (valor: number) => {
    const texto = daReceitaTexto(valor);
    return texto ? [`Parte da receita|${texto}`] : [];
  };
  const custosEDespesas = l.taxas + l.despesas + l.saidasCaixa + l.rede;
  const margem = daReceitaTexto(l.margemBruta);
  const final = daReceitaTexto(l.resultado);

  const degraus: Degrau[] = [
    {
      rotulo: "Vendas concluídas", valor: l.vendido, total: true,
      detalhe: `${plural(l.vendas, "venda", "vendas")}${l.descontos > 0 ? ` · ${brl(l.descontos)} de desconto já abatido` : ""}`,
      dica: [`Preço cheio|${brl(l.bruto)}`, `Descontos|${brl(l.descontos)}`],
    },
    {
      rotulo: "Devoluções e cancelamentos", valor: -(l.devolvido + l.cancelado),
      detalhe: `Devolvido ${brl(l.devolvido)} · cancelado ${brl(l.cancelado)}`, dica: parte(l.devolvido + l.cancelado),
    },
    { rotulo: "Receita líquida", valor: l.receitaLiquida, total: true },
    {
      rotulo: "Custo das mercadorias", valor: -l.cmv, dica: parte(l.cmv),
      detalhe: l.vendidoSemCusto > 0 ? `Falta o custo de ${brl(l.vendidoSemCusto)} vendidos` : "Pelo custo gravado em cada venda",
    },
    { rotulo: "Margem bruta", valor: l.margemBruta, total: true, detalhe: margem ? `${margem} da receita` : undefined },
    {
      rotulo: "Taxas de cartão e Pix", valor: -l.taxas, dica: parte(l.taxas),
      detalhe: l.aConciliar > 0 ? `${plural(l.aConciliar, "pagamento", "pagamentos")} ainda sem conciliação` : `${plural(l.pagamentosConciliados, "pagamento conciliado", "pagamentos conciliados")}`,
    },
    {
      rotulo: naRede ? "Contas das lojas" : "Contas da loja", valor: -l.despesas, dica: parte(l.despesas),
      detalhe: l.despesasEmAberto > 0 ? `Pelo vencimento · ${brl(l.despesasEmAberto)} ainda em aberto` : "Pelo vencimento",
    },
    {
      rotulo: "Dinheiro do caixa", valor: -l.saidasCaixa, dica: parte(l.saidasCaixa),
      detalhe: plural(l.saidasQuantidade, "saída autorizada", "saídas autorizadas"),
    },
    naRede
      ? {
        rotulo: "Contas da rede (central)", valor: -l.rede, dica: parte(l.rede),
        detalhe: l.redeEmAberto > 0 ? `Pelo vencimento · ${brl(l.redeEmAberto)} ainda em aberto` : "Pelo vencimento",
      }
      : {
        rotulo: "Parte das contas da rede", valor: -l.rede, dica: parte(l.rede),
        detalhe: l.pesoDaRede > 0 ? `A loja fez ${percentual(l.peso / l.pesoDaRede)} da receita da rede no mês` : "Sem vendas na rede no mês",
      },
    { rotulo: "Resultado do mês", valor: l.resultado, total: true, detalhe: final ? `${final} da receita` : undefined },
  ];

  return (
    <>
      {(l.vendidoSemCusto > 0 || l.aConciliar > 0 || (naRede && l.naoDividido > 0)) && (
        <div className="space-y-2">
          {l.vendidoSemCusto > 0 && (
            <Aviso tom="aviso" titulo="Custo faltando">
              {`${brl(l.vendidoSemCusto)} vendidos sem custo cadastrado (${plural(l.itensSemCusto, "item", "itens")}): o custo deles não entra, e o resultado aparece maior do que é.`}
            </Aviso>
          )}
          {l.aConciliar > 0 && (
            <Aviso tom="info" titulo="Taxas a conferir">
              {`${plural(l.aConciliar, "pagamento", "pagamentos")} de cartão e Pix (${brl(l.aConciliarValor)}) ainda sem conciliação: a taxa deles só entra depois de conciliar. `}
              <Link href="/pagamentos/conciliacao" className="font-semibold underline">Conciliar</Link>
            </Aviso>
          )}
          {naRede && l.naoDividido > 0 && (
            <Aviso tom="info" titulo="Contas da rede sem divisão">
              {`Sem vendas no mês, ${brl(l.naoDividido)} das contas da rede não foram divididos entre as lojas: entram só no resultado da rede.`}
            </Aviso>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Receita líquida" icone={Wallet} valor={brlCompactoComSinal(l.receitaLiquida)} detalhe={plural(l.vendas, "venda", "vendas")} />
        <Indicador rotulo="Margem bruta" icone={Layers} valor={brlCompactoComSinal(l.margemBruta)} detalhe={margem ? `${margem} da receita` : "Sem receita no mês"} />
        <Indicador rotulo="Taxas e contas" icone={ReceiptText} valor={brlCompacto(custosEDespesas)} detalhe="Taxas, contas, caixa e rede" />
        <Indicador
          rotulo="Resultado"
          icone={PiggyBank}
          valor={brlCompactoComSinal(l.resultado)}
          tom={l.resultado < 0 ? "ruim" : l.resultado > 0 ? "bom" : "neutro"}
          detalhe={`${l.resultado < 0 ? "Prejuízo" : l.resultado > 0 ? "Lucro" : "Zero"}${final ? ` · ${final} da receita` : ""}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5 xl:items-start">
        <Cartao
          className="xl:col-span-3"
          titulo="Do vendido ao resultado"
          icone={ListTree}
          subtitulo={`${maiuscula(nomeDoMes(r.mes))}${r.emAndamento ? " até hoje" : ""}. Toque ou passe o mouse numa linha para ver a parte da receita.`}
        >
          <Cascata degraus={degraus} formatar={brlComSinal} rotulo="Demonstrativo do resultado do mês" />
        </Cartao>
        <div className="space-y-4 xl:col-span-2">
          <Cartao titulo={`Últimos ${r.meses.length} meses`} icone={TrendingUp} subtitulo="O resultado de cada mês, pela mesma regra.">
            <ColunasComSinal
              dados={r.meses.map((m) => ({ rotulo: mesCurto(m.mes), valor: m.resultado }))}
              formatar={brlComSinal}
              formatarEixo={brlEixoComSinal}
              nomeSerie="Resultado"
              nomes={["Lucro", "Prejuízo"]}
            />
            <TabelaDoGrafico
              colunas={["Mês", "Receita líquida", "Custo", "Taxas e contas", "Resultado"]}
              linhas={r.meses.map((m) => [
                `${maiuscula(nomeDoMes(m.mes))}${m.mes === mesAtual ? " (até hoje)" : ""}`,
                brlComSinal(m.receitaLiquida), brlComSinal(m.cmv), brl(m.taxas + m.despesas + m.saidasCaixa + m.rede), brlComSinal(m.resultado),
              ])}
            />
          </Cartao>
          <Despesas r={r} />
        </div>
      </div>

      {naRede && <PorLoja r={r} mesAtual={mesAtual} regioes={regioes} />}
    </>
  );
}

function Despesas({ r }: { r: ResultadoDoMes }) {
  const naRede = r.unidade === null;
  const emAberto = r.porCategoria.reduce((s, c) => s + c.emAberto, 0);
  return (
    <Cartao
      titulo="Contas por categoria"
      icone={Tags}
      subtitulo={naRede ? "As contas a pagar das lojas e da rede, pelo vencimento." : "As contas a pagar da loja, pelo vencimento. A parte da rede está no demonstrativo."}
    >
      {r.porCategoria.length === 0 ? <p className={NOTA}>Nenhuma conta vence neste mês.</p> : (
        <>
          <BarrasHorizontais nomeSerie="No mês" formatar={brl} dados={r.porCategoria.map((c) => ({ rotulo: c.nome, valor: c.valor }))} />
          {emAberto > 0 && <p className="mt-3 text-xs text-suave">{`${brl(emAberto)} destas contas ainda estão em aberto: entram no mês do vencimento, pagas ou não.`}</p>}
        </>
      )}
      {r.foraDoResultado.length > 0 && (
        <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-suave">
          <p className="font-semibold text-texto">Fora do resultado</p>
          <ul className="mt-1 space-y-0.5">
            {r.foraDoResultado.map((c) => <li key={c.categoria}>{`${c.nome}: ${brl(c.valor)}`}</li>)}
          </ul>
          <p className="mt-1">Compra de mercadoria vira estoque: o custo entra no resultado quando o item é vendido.</p>
        </div>
      )}
    </Cartao>
  );
}

function PorLoja({ r, mesAtual, regioes }: { r: ResultadoDoMes; mesAtual: string; regioes: RegioesDoPainel }) {
  const nome = (l: { nome: string | null }) => l.nome ?? "Loja desativada";
  return (
    <Cartao
      titulo="Resultado por loja"
      icone={Store}
      subtitulo="Cada loja com as contas dela e a parte das contas da rede, dividida pelo que cada uma vendeu. Na tabela, o nome abre o resultado da loja."
    >
      {r.porLoja.length === 0 ? <p className={NOTA}>Nenhuma loja teve venda ou conta neste mês.</p> : (
        <>
          <BarrasComSinal
            nomeSerie="Resultado"
            nomes={["Lucro", "Prejuízo"]}
            formatar={brlComSinal}
            dados={r.porLoja.map((l) => {
              const margem = daReceita(l.margemBruta, l.receitaLiquida);
              return {
                rotulo: nome(l), valor: l.resultado,
                detalhe: `Receita ${brlCompactoComSinal(l.receitaLiquida)}${margem === null ? "" : ` · margem ${percentualComSinal(margem)}`}`,
              };
            })}
          />
          <TabelaDoGrafico
            colunas={["Loja", "Receita líquida", "Margem bruta", "Taxas", "Contas", "Caixa", "Parte da rede", "Resultado"]}
            linhas={r.porLoja.map((l) => [
              <Link key={l.unidade} href={enderecoDoResultado(r.mes, mesAtual, { tipo: "loja", id: l.unidade })} className="font-semibold text-acao hover:underline">{nome(l)}</Link>,
              brlComSinal(l.receitaLiquida), brlComSinal(l.margemBruta), brl(l.taxas), brl(l.despesas), brl(l.saidasCaixa), brl(l.rede), brlComSinal(l.resultado),
            ])}
          />
          <PorRegiao r={r} regioes={regioes} />
        </>
      )}
    </Cartao>
  );
}

/** ORG-009b: o resultado das lojas de cada região somado (a parte da rede já vem dividida em cada loja). */
function PorRegiao({ r, regioes }: { r: ResultadoDoMes; regioes: RegioesDoPainel }) {
  if (regioes === "falha") return <p className={`mt-3 ${NOTA}`}>Não deu para ler as regiões agora; o resultado por loja acima está certo.</p>;
  const porRegiao = resultadoPorRegiao(r.porLoja, regioes);
  if (!porRegiao) return null;
  return (
    <div className="mt-5 border-t border-borda pt-4">
      <h3 className="mb-3 text-sm font-semibold">Por região</h3>
      {porRegiao.length > 1 && (
        <BarrasComSinal
          nomeSerie="Resultado" nomes={["Lucro", "Prejuízo"]} formatar={brlComSinal}
          dados={porRegiao.map((g) => ({ rotulo: g.nome, valor: g.resultado, detalhe: `${plural(g.lojas, "loja", "lojas")} · receita ${brlCompactoComSinal(g.receitaLiquida)}` }))}
        />
      )}
      <TabelaDoGrafico
        titulo="Ver as regiões em tabela"
        colunas={["Região", "Lojas", "Receita líquida", "Margem bruta", "Taxas", "Contas", "Caixa", "Parte da rede", "Resultado"]}
        linhas={porRegiao.map((g) => [
          g.nome, String(g.lojas), brlComSinal(g.receitaLiquida), brlComSinal(g.margemBruta), brl(g.taxas), brl(g.despesas), brl(g.saidasCaixa), brl(g.rede), brlComSinal(g.resultado),
        ])}
      />
      <p className={`mt-2 ${NOTA}`}>A região soma o resultado das lojas dela, cada uma já com a sua parte das contas da rede.</p>
    </div>
  );
}

function ComoLer() {
  return (
    <Cartao titulo="Como ler este resultado" icone={Info}>
      <details data-imprimir="" className="group">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-borda bg-white px-3 text-[13px] font-semibold hover:border-borda-forte [&::-webkit-details-marker]:hidden">
          Ver as regras de cada linha
        </summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-suave">
          <li>Não é a contabilidade: é o resultado gerencial com o que está lançado no sistema. O contador fecha o oficial.</li>
          <li>Vendas, devoluções e cancelamentos entram no mês em que aconteceram, na loja da venda.</li>
          <li>Custo das mercadorias: o custo gravado em cada item quando ele foi vendido. Custo novo não muda venda antiga.</li>
          <li>Taxas de cartão e Pix: a diferença entre o valor e o que caiu na conta, nos pagamentos já conciliados. A taxa da PayJoy e da Aiva ainda não entra (falta o contrato).</li>
          <li>Contas a pagar entram no mês do vencimento, pagas ou não; a conta paga, pelo valor pago (com juros ou desconto). Compra de mercadoria fica fora: o custo entra quando o item é vendido.</li>
          <li>As contas da rede (central) são divididas entre as lojas pela receita líquida de cada uma no mês.</li>
          <li>Imposto sobre a venda e comissão só entram quando forem lançados nas contas a pagar.</li>
        </ul>
      </details>
    </Cartao>
  );
}

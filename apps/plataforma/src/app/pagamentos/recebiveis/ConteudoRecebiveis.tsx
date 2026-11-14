import { Banknote, Clock, CreditCard, HandCoins, Hourglass, Landmark, ListChecks, Scale, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { BarraSegmentada, BarrasHorizontais, TabelaDoGrafico } from "../../../componentes/graficos";
import { EstadoDoPainel, NOTA } from "../../../componentes/paineis-de-vendas";
import { Cartao, Celula, EstadoVazio, FiltroSegmentado, Indicador, Selo, Tabela } from "../../../componentes/ui";
import { centavosCsv } from "../../../lib/csv";
import { brl, numero, percentual } from "../../../lib/formato";
import {
  ADQUIRENTES, DAS_FINANCEIRAS, DO_EXTRATO, enderecoDosRecebiveis, fracaoDaDiferenca, idadeDoRecebivel, JANELAS, porAdquirente, somar,
  type FiltroDosRecebiveis, type LeituraDosRecebiveis, type Recebiveis,
} from "../../../lib/pagamentos/recebiveis";

// Recebíveis por loja e adquirente (lote L8e: ORA-FIN-005). Só apresentação: os números chegam lidos por
// lib/pagamentos/recebiveis, com o estado da leitura (falha nunca vira zero). Nada aqui grava: a conciliação
// e o repasse continuam nas telas da loja (/pagamentos/conciliacao e /pagamentos/financeiras).

const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
const idade = (dias: number | null) => (dias === null ? "—" : dias === 0 ? "hoje" : `${numero(dias)} ${dias === 1 ? "dia" : "dias"}`);

export function ConteudoRecebiveis({ leitura, filtro }: { leitura: LeituraDosRecebiveis; filtro: FiltroDosRecebiveis }) {
  const lojas = leitura.estado === "ok" ? leitura.dados.lojas : [];
  return (
    <>
      <div className="nao-imprimir mt-4 space-y-2">
        {lojas.length > 1 && (
          <FiltroSegmentado
            rotulo="Onde"
            opcoes={[
              { href: enderecoDosRecebiveis({ ...filtro, loja: null }), rotulo: "Todas as lojas", ativo: filtro.loja === null },
              ...lojas.map((l) => ({ href: enderecoDosRecebiveis({ ...filtro, loja: l.id }), rotulo: l.nome, ativo: filtro.loja === l.id })),
            ]}
          />
        )}
        <FiltroSegmentado
          rotulo="Caiu na conta nos últimos"
          opcoes={JANELAS.map((d) => ({ href: enderecoDosRecebiveis({ ...filtro, dias: d }), rotulo: `${d} dias`, ativo: filtro.dias === d }))}
        />
      </div>

      {leitura.estado !== "ok" ? (
        <Cartao className="mt-4" titulo="Recebíveis" icone={HandCoins}>
          <EstadoDoPainel
            estado={leitura.estado}
            fonte="recebiveis"
            motivo="Os recebíveis são de quem concilia os pagamentos da loja (dono e gerente); o gerente vê só a loja dele."
            tentarDeNovo={enderecoDosRecebiveis(filtro)}
          />
        </Cartao>
      ) : leitura.dados.linhas.length === 0 && totalDasPendencias(leitura.dados) === 0 ? (
        <Cartao className="mt-4" titulo="Recebíveis" icone={HandCoins}>
          <EstadoVazio titulo="Nada a receber nem recebido" icone={HandCoins}>
            {`A leitura está funcionando: nenhum cartão, Pix ou financiamento em aberto ${leitura.dados.unidade ? "nesta loja" : "nas lojas"} e nada conciliado nos últimos ${leitura.dados.dias} dias.`}
          </EstadoVazio>
        </Cartao>
      ) : (
        <PainelDosRecebiveis r={leitura.dados} />
      )}
    </>
  );
}

function totalDasPendencias(r: Recebiveis) {
  return r.pendencias.semMaquininha.quantidade + r.pendencias.entradasNaMaquininha.quantidade + r.pendencias.financeiraDeVendaCancelada.quantidade;
}

function PainelDosRecebiveis({ r }: { r: Recebiveis }) {
  const nomeDaLoja = (id: string) => r.lojas.find((l) => l.id === id)?.nome ?? "Loja";
  const doExtrato = somar(r.linhas, DO_EXTRATO);
  const dasFinanceiras = somar(r.linhas, DAS_FINANCEIRAS);
  const tudo = somar(r.linhas);
  const diferenca = tudo.recebidoBruto - tudo.recebidoLiquido;
  const fracao = fracaoDaDiferenca(tudo);
  const adquirentes = porAdquirente(r.linhas);
  const comLoja = r.unidade === null && r.lojas.length > 1;
  const colunas = [...(comLoja ? ["Loja"] : []), "Quem deve", "A receber", "A mais antiga", `Caiu na conta (${r.dias} dias)`, "Diferença observada", "Estornos a confirmar"];
  const csv = {
    colunas: ["Loja", "Quem deve", "A receber (qtd.)", "A receber (R$)", "Até 7 dias (R$)", "De 8 a 30 dias (R$)", "Mais de 30 dias (R$)", "A mais antiga (dias)",
      `Recebidos em ${r.dias} dias (qtd.)`, "Bruto (R$)", "Líquido que caiu (R$)", "Diferença observada (R$)", "Estornos a confirmar (qtd.)", "Estornos a confirmar (R$)"],
    linhas: r.linhas.map((l) => [nomeDaLoja(l.unidade), ADQUIRENTES[l.adquirente], l.aReceber, centavosCsv(l.valorAReceber), centavosCsv(l.ate7Dias), centavosCsv(l.de8a30Dias),
      centavosCsv(l.maisDe30Dias), l.maisAntigaDias ?? "", l.recebidos, centavosCsv(l.recebidoBruto), centavosCsv(l.recebidoLiquido), centavosCsv(l.recebidoBruto - l.recebidoLiquido),
      l.estornos, centavosCsv(l.valorEstornos)]),
  };
  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo="A receber: maquininhas e Pix" valor={brl(doExtrato.valorAReceber)} icone={CreditCard}
          detalhe={doExtrato.aReceber === 0 ? "Nada a conciliar" : `${plural(doExtrato.aReceber, "pagamento", "pagamentos")} sem conciliar · o mais antigo há ${idade(doExtrato.maisAntigaDias)}`}
          tom={doExtrato.maisDe30Dias > 0 ? "atencao" : "neutro"}
        />
        <Indicador
          rotulo="A receber: financeiras" valor={brl(dasFinanceiras.valorAReceber)} icone={HandCoins}
          detalhe={dasFinanceiras.aReceber === 0 ? "Nada em aberto" : `${plural(dasFinanceiras.aReceber, "venda", "vendas")} · a mais antiga há ${idade(dasFinanceiras.maisAntigaDias)}`}
          tom={dasFinanceiras.maisDe30Dias > 0 ? "atencao" : "neutro"}
        />
        <Indicador
          rotulo={`Caiu na conta (${r.dias} dias)`} valor={brl(tudo.recebidoLiquido)} icone={Banknote}
          detalhe={tudo.recebidos === 0 ? "Nada conciliado nem repassado no período" : `${plural(tudo.recebidos, "recebimento", "recebimentos")} · bruto ${brl(tudo.recebidoBruto)}`}
        />
        <Indicador
          rotulo={`Diferença observada (${r.dias} dias)`} valor={brl(diferenca)} icone={Scale}
          detalhe={fracao === null ? "Sem recebido no período" : `${percentual(fracao)} do bruto: o que o extrato descontou (não é a taxa do contrato)`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Idade do que falta receber" subtitulo="Dias desde a venda; sem contrato verificado, não há data prevista" icone={Hourglass}>
          {tudo.aReceber === 0 ? (
            <p className={NOTA}>Nada a receber agora.</p>
          ) : (
            <>
              <BarraSegmentada
                rotulo="Falta receber"
                formatar={brl}
                partes={[
                  { nome: "Até 7 dias", valor: tudo.ate7Dias, serie: 1 },
                  { nome: "De 8 a 30 dias", valor: tudo.de8a30Dias, serie: 2 },
                  { nome: "Mais de 30 dias", valor: tudo.maisDe30Dias, serie: 3 },
                ]}
              />
              <TabelaDoGrafico
                colunas={["Quem deve", "Até 7 dias", "De 8 a 30 dias", "Mais de 30 dias"]}
                linhas={adquirentes.filter((a) => a.soma.aReceber > 0).map((a) => [ADQUIRENTES[a.adquirente], brl(a.soma.ate7Dias), brl(a.soma.de8a30Dias), brl(a.soma.maisDe30Dias)])}
              />
            </>
          )}
        </Cartao>
        <Cartao titulo="A receber por quem deve" subtitulo={r.unidade ? nomeDaLoja(r.unidade) : comLoja ? "Somado nas lojas" : nomeDaLoja(r.lojas[0]?.id ?? "")} icone={Landmark}>
          {adquirentes.every((a) => a.soma.aReceber === 0) ? (
            <p className={NOTA}>Nada a receber agora.</p>
          ) : (
            <BarrasHorizontais
              nomeSerie="A receber"
              formatar={brl}
              dados={adquirentes.filter((a) => a.soma.aReceber > 0).map((a) => ({
                rotulo: ADQUIRENTES[a.adquirente], valor: a.soma.valorAReceber,
                detalhe: `${plural(a.soma.aReceber, "item", "itens")} · ${idade(a.soma.maisAntigaDias)}`,
              }))}
            />
          )}
        </Cartao>
      </div>

      <Cartao
        className="mt-4" titulo={comLoja ? "Por loja e por quem deve" : "Por quem deve"} icone={Clock}
        subtitulo={`O que falta receber agora e o que caiu na conta nos últimos ${r.dias} dias, pela data do extrato`}
        acao={<ExportarCsv nomeArquivo={`recebiveis-${r.hoje}`} prefixo="ora5g" colunas={csv.colunas} linhas={csv.linhas} rotulo="Planilha (CSV)" />}
      >
        <Tabela legenda="Recebíveis por loja e por quem deve" colunas={colunas} alinharDireita={comLoja ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]} minimo="min-w-[44rem]">
          {r.linhas.map((l) => {
            const dif = l.recebidoBruto - l.recebidoLiquido;
            return (
              <tr key={`${l.unidade}:${l.adquirente}`}>
                {comLoja && <Celula className="whitespace-nowrap font-medium">{nomeDaLoja(l.unidade)}</Celula>}
                <Celula className="whitespace-nowrap">{ADQUIRENTES[l.adquirente]}</Celula>
                <Celula className="numeros whitespace-nowrap text-right">{l.aReceber === 0 ? "—" : <>{brl(l.valorAReceber)}<span className="block text-xs text-suave">{plural(l.aReceber, "item", "itens")}</span></>}</Celula>
                <Celula className="whitespace-nowrap text-right">{l.maisAntigaDias === null ? "—" : <Selo tom={idadeDoRecebivel(l.maisAntigaDias).tom}>{idadeDoRecebivel(l.maisAntigaDias).rotulo}</Selo>}</Celula>
                <Celula className="numeros whitespace-nowrap text-right">{l.recebidos === 0 ? "—" : <>{brl(l.recebidoLiquido)}<span className="block text-xs text-suave">{`bruto ${brl(l.recebidoBruto)}`}</span></>}</Celula>
                <Celula className="numeros whitespace-nowrap text-right">{l.recebidos === 0 ? "—" : <>{brl(dif)}<span className="block text-xs text-suave">{l.recebidoBruto > 0 ? percentual(dif / l.recebidoBruto) : ""}</span></>}</Celula>
                <Celula className="numeros whitespace-nowrap text-right">{l.estornos === 0 ? "—" : <>{brl(l.valorEstornos)}<span className="block text-xs text-suave">{plural(l.estornos, "estorno", "estornos")}</span></>}</Celula>
              </tr>
            );
          })}
        </Tabela>
        <p className={`mt-3 ${NOTA}`}>
          A conciliação do cartão e do Pix e o repasse das financeiras são feitos na loja, conferindo o extrato:{" "}
          <Link href="/pagamentos/conciliacao" className="font-semibold text-acao">Conciliação de pagamentos</Link> e{" "}
          <Link href="/pagamentos/financeiras" className="font-semibold text-acao">A receber das financeiras</Link> (da loja do turno).
        </p>
      </Cartao>

      <Pendencias r={r} estornos={tudo.estornos} valorEstornos={tudo.valorEstornos} />

      <Cartao className="mt-4" titulo="Os mais antigos a receber" icone={ListChecks}
        subtitulo={r.totalAReceber.quantidade === 0 ? "Nada a receber"
          : r.maisAntigos.length === r.totalAReceber.quantidade ? `${plural(r.totalAReceber.quantidade, "item", "itens")} a receber (${brl(r.totalAReceber.valor)}), do mais antigo para o mais novo`
            : `Os ${numero(r.maisAntigos.length)} mais antigos de ${plural(r.totalAReceber.quantidade, "item", "itens")} a receber (${brl(r.totalAReceber.valor)})`}>
        {r.maisAntigos.length === 0 ? (
          <p className={NOTA}>Nada a receber agora.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {r.maisAntigos.map((m) => {
              const selo = idadeDoRecebivel(m.dias);
              return (
                <li key={`${m.tipo}:${m.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5">
                  <Link href={`/vendas/${m.vendaId}`} className="font-semibold text-acao">Venda nº {m.vendaNumero}</Link>
                  <span className="numeros whitespace-nowrap text-right font-semibold">{brl(m.valor)}</span>
                  <span className="min-w-0 text-suave">{[comLoja ? nomeDaLoja(m.unidade) : null, ADQUIRENTES[m.adquirente], m.terminal ? `maquininha ${m.terminal}` : null].filter(Boolean).join(" · ")}</span>
                  <span className="justify-self-end"><Selo tom={selo.tom}>{selo.rotulo}</Selo></span>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </>
  );
}

function Pendencias({ r, estornos, valorEstornos }: { r: Recebiveis; estornos: number; valorEstornos: number }) {
  const p = r.pendencias;
  const itens = [
    {
      chave: "estornos", quantidade: estornos, valor: valorEstornos, titulo: "Estornos de cartão e Pix a confirmar",
      texto: "Vendas canceladas ou devolvidas pagas no cartão ou no Pix: o dinheiro volta ao cliente pela maquininha ou pela conta. Confirme na venda quando o estorno sair.",
      link: { href: "/vendas", rotulo: "Ver as vendas" },
    },
    {
      chave: "sem_maquininha", quantidade: p.semMaquininha.quantidade, valor: p.semMaquininha.valor, titulo: "Cartão ou Pix da maquininha sem a maquininha informada",
      texto: "A conciliação desses pagamentos não sabe de qual terminal veio o dinheiro. Cadastre as maquininhas da loja: a partir daí, escolher uma é obrigatório.",
      link: { href: "/pagamentos/maquininhas", rotulo: "Maquininhas" },
    },
    {
      chave: "entradas", quantidade: p.entradasNaMaquininha.quantidade, valor: p.entradasNaMaquininha.valor, titulo: "Entradas de financiamento pagas no cartão ou no Pix",
      texto: "Entram na conta com os outros pagamentos, mas ainda não se conciliam pelo sistema: confira no extrato à parte.",
    },
    {
      chave: "financeira_cancelada", quantidade: p.financeiraDeVendaCancelada.quantidade, valor: p.financeiraDeVendaCancelada.valor, titulo: "Repasse de financeira de venda cancelada",
      texto: "A financeira pagou e depois a venda foi cancelada: combine com ela a devolução ou o desconto desse valor.",
      link: { href: "/pagamentos/financeiras", rotulo: "A receber das financeiras" },
    },
  ];
  const abertas = itens.filter((i) => i.quantidade > 0);
  return (
    <Cartao className="mt-4" titulo="Pendências do financeiro" icone={TriangleAlert} subtitulo={abertas.length === 0 ? "Nenhuma agora" : plural(abertas.length, "tipo de pendência", "tipos de pendência")}>
      {abertas.length === 0 ? (
        <p className={NOTA}>Nenhum estorno a confirmar, nenhum pagamento sem maquininha, nenhuma entrada fora da conciliação e nenhum repasse de venda cancelada.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {abertas.map((i) => (
            <li key={i.chave} className="rounded-xl border border-borda px-4 py-3">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {i.titulo}
                <Selo tom="aviso">{`${numero(i.quantidade)} · ${brl(i.valor)}`}</Selo>
              </p>
              <p className={`mt-1 ${NOTA}`}>
                {i.texto}
                {i.link && <>{" "}<Link href={i.link.href} className="font-semibold text-acao">{i.link.rotulo}</Link></>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

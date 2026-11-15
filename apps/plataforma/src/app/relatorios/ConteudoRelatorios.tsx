import { BadgePercent, CircleSlash, PiggyBank, ShoppingBag, Ticket } from "lucide-react";
import Link from "next/link";

import { BaixarPlanilha } from "../../componentes/BaixarPlanilha";
import { BarraSegmentada, Colunas, Linhas, TabelaDoGrafico } from "../../componentes/graficos";
import {
  cadaRotulo, EstadoDoPainel, foraDaMargem, indicadorDaMargem, indicadorDoRecebido, Indicadores, indicadoresDeVendas, LIGACAO, NOTA, NUMERO_PRINCIPAL,
  PainelDasLojas, PainelDeRecebimentos, PainelDeVendas, PainelDoMix, plural, type MetaDoGrafico,
} from "../../componentes/paineis-de-vendas";
import { PainelDaProducaoPorDia } from "../../componentes/paineis-do-connect";
import { Aviso, BotaoLink, Cartao, Celula, EstadoVazio, ListaDados, Selo, Tabela } from "../../componentes/ui";
import { nomeCurtoDoTipo } from "../../lib/catalogo/cadastro";
import type { LojaDoFiltro } from "../../lib/financeiro/escopo";
import { PERIODOS_FINANCEIROS, type Janela } from "../../lib/financeiro/painel";
import { POR_PAGINA } from "../../lib/financeiro/registros";
import { brl, brlCompacto, brlCompactoComSinal, brlComSinal, brlEixo, brlEixoComSinal, numero, percentual, percentualComSinal } from "../../lib/formato";
import { enderecoDoFinanceiro, numerosDasVendas, type Leitura, type VendasDoBanco } from "../../lib/inicio/painel";
import type { RegioesDoPainel } from "../../lib/lojas/regioes";
import { metaDoDiaPorMes } from "../../lib/metas/painel";
import { numerosDaMargem, situacaoDaMargem, type ItensDaMargem, type MargemDoBanco } from "../../lib/margem/painel";
import type { Relatorios } from "../../lib/relatorios/consulta";
import { diasDeMargem, diasDeVendas, enderecoDaExportacao, enderecoDosRelatorios, PERIODO_NO_FINANCEIRO, textosDoRelatorio } from "../../lib/relatorios/painel";
import { situacaoDaVenda } from "../../lib/vendas/lista";

// Relatórios (lote G2a): os painéis de vendas do Início (componentes/paineis-de-vendas) no recorte de
// 7, 14 ou 30 dias, mais a margem bruta por dia, a cobertura do custo, o ticket médio e os descontos
// por dia, e o detalhe da margem por item. Só apresentação: os dados chegam lidos por
// lib/relatorios/consulta, cada leitura com o estado dela. Cada painel mantém o título e o espaço em
// qualquer estado; falha de leitura e margem desconhecida nunca aparecem como zero.

const RODAPE = "mt-3 text-xs text-suave";
const SO_LOJA_FORA = "O movimento do período foi só em loja em que você não vê o custo dos produtos; sem essa permissão, a margem não é mostrada.";
const NAO_E_LUCRO = "Não é lucro: taxa de meio de pagamento, comissão, frete e imposto ficam fora.";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const semBase = (fracao: number | null, formatar: (fracao: number) => string) => (fracao === null ? "—" : formatar(fracao));

// ---------------------------------------------------------------------------------------------
// Margem bruta por dia (M1, cada fato no dia em que aconteceu)
// ---------------------------------------------------------------------------------------------
type MedidasDaMargem = { margem: number | null; base: number; custo: number; fracao: number | null; cobertura: number | null; itensSemCusto: number; vendidoSemCusto: number };
const COLUNAS_DA_MARGEM = ["Margem bruta", "Vendido com custo (líquido)", "Custo", "Margem %", "Cobertura do custo", "Itens sem custo", "Vendido sem custo"] as const;
const medidasDaMargem = (d: MedidasDaMargem) => [
  d.margem === null ? "sem custo" : brlComSinal(d.margem), brlComSinal(d.base), brlComSinal(d.custo),
  semBase(d.fracao, percentualComSinal), semBase(d.cobertura, percentual), numero(d.itensSemCusto), brl(d.vendidoSemCusto),
];

function PainelDaMargem({ margem, janela, aqui }: { margem: Leitura<MargemDoBanco>; janela: Janela; aqui: string }) {
  const cartao = { titulo: "Margem bruta por dia", subtitulo: "Vendido com custo gravado − custo, cada fato no dia em que aconteceu", className: "xl:col-span-2" };
  if (margem.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={margem.estado} fonte="margem" tentarDeNovo={aqui} /></Cartao>;

  const m = margem.dados;
  const situacao = situacaoDaMargem(m);
  if (situacao === "lojas_fora") return <Cartao {...cartao}><EstadoDoPainel estado="sem_permissao" motivo={SO_LOJA_FORA} /></Cartao>;
  if (situacao === "sem_vendas") {
    return (
      <Cartao {...cartao}>
        <EstadoVazio titulo="Nenhuma venda, devolução ou cancelamento no período" icone={PiggyBank}>A leitura está funcionando; só não houve movimento para calcular a margem.</EstadoVazio>
      </Cartao>
    );
  }
  if (situacao === "sem_custo") {
    return (
      <Cartao {...cartao}>
        <Aviso tom="aviso" titulo="Margem desconhecida">
          Houve movimento no período, e nenhum item dele tinha custo gravado. Isso não é margem zero: sem custo não há como calcular.
          O custo é gravado no item no momento da venda; corrigir o cadastro depois não muda as vendas já feitas.
        </Aviso>
      </Cartao>
    );
  }

  const n = numerosDaMargem(m.totais);
  const dias = diasDeMargem(m, janela);
  const fora = foraDaMargem(m);
  const total: MedidasDaMargem = { margem: n.margem, base: n.base, custo: n.custoLiquido, fracao: n.fracao, cobertura: n.cobertura, itensSemCusto: m.totais.itensSemCusto, vendidoSemCusto: m.totais.vendidoSemCusto };
  return (
    <Cartao {...cartao}>
      <p className={NUMERO_PRINCIPAL}>{brlComSinal(n.margem)}</p>
      <p className={NOTA}>{[n.fracao === null ? "Sem base para percentual" : `${percentualComSinal(n.fracao)} do vendido com custo`, ...fora].join(" · ")}</p>
      <div className="mt-4">
        <Linhas
          suave series={[{ nome: "Margem bruta", serie: 1, area: true, ponto: "maximo", valores: dias.map((d) => d.margem) }]} rotulosX={dias.map((d) => d.rotulo)}
          semValor="sem custo" formatar={brlComSinal} formatarEixo={brlEixoComSinal} formatarPonto={brlCompactoComSinal} cadaRotulo={cadaRotulo(dias.length)}
        />
      </div>
      {dias.some((d) => d.margem === null) && <p className={RODAPE}>Dia em branco no gráfico: houve movimento, e nenhum item dele tinha custo gravado. A margem desse dia é desconhecida, não zero.</p>}
      <TabelaDoGrafico colunas={["Dia", ...COLUNAS_DA_MARGEM]} linhas={[...dias.map((d) => [d.rotulo, ...medidasDaMargem(d)]), ["Total", ...medidasDaMargem(total)]]} />
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// Cobertura do custo (M2) e a conta da margem do período
// ---------------------------------------------------------------------------------------------
function PainelDaCobertura({ margem, aqui }: { margem: Leitura<MargemDoBanco>; aqui: string }) {
  const cartao = { titulo: "Cobertura do custo", subtitulo: "Quanto do vendido tem custo gravado e entra na conta da margem" };
  if (margem.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={margem.estado} fonte="margem" tentarDeNovo={aqui} /></Cartao>;

  const m = margem.dados;
  const situacao = situacaoDaMargem(m);
  if (situacao === "lojas_fora") return <Cartao {...cartao}><EstadoDoPainel estado="sem_permissao" motivo={SO_LOJA_FORA} /></Cartao>;

  const t = m.totais;
  const n = numerosDaMargem(t);
  const parte = (itens: number, vendido: number) => [numero(itens), brl(vendido), t.vendido > 0 ? percentual(vendido / t.vendido) : "—"];
  const conta = [
    ["Vendido com custo, depois de devoluções e cancelamentos", brlComSinal(n.base)] as const,
    ["Custo desses itens", brlComSinal(n.custoLiquido)] as const,
    ["Margem bruta", brlComSinal(n.margem)] as const,
    ["Margem sobre o vendido com custo", semBase(n.fracao, percentualComSinal)] as const,
    ["Itens sem custo gravado, fora da conta", numero(t.itensSemCusto)] as const,
    ...(m.lojasFora > 0 ? [["Lojas com movimento fora da conta (custo não visível para você)", numero(m.lojasFora)] as const] : []),
  ];
  return (
    <Cartao {...cartao}>
      {n.cobertura === null ? (
        <EstadoVazio titulo="Nenhuma venda concluída no período" icone={ShoppingBag}>A cobertura é medida sobre o vendido; sem venda concluída não há o que medir.</EstadoVazio>
      ) : (
        <>
          <p className={NUMERO_PRINCIPAL}>{percentual(n.cobertura)}</p>
          <p className={`mb-4 ${NOTA}`}>
            do vendido tem custo gravado no item da venda
            {t.itensSemCusto > 0 && ` · ${plural(t.itensSemCusto, "item sem custo ficou", "itens sem custo ficaram")} fora da margem`}
          </p>
          <BarraSegmentada
            rotulo="Vendido" formatar={brl}
            // Nomes curtos na legenda (no celular, o nome inteiro era cortado); a tabela abaixo diz "gravado".
            partes={[{ nome: "Com custo", valor: t.vendidoComCusto, serie: 1 }, { nome: "Sem custo", valor: t.vendidoSemCusto, serie: "comparacao" }]}
          />
          <TabelaDoGrafico
            colunas={["Parte", "Itens", "Vendido", "% do vendido"]}
            linhas={[["Com custo gravado", ...parte(t.itensComCusto, t.vendidoComCusto)], ["Sem custo gravado", ...parte(t.itensSemCusto, t.vendidoSemCusto)], ["Total", ...parte(t.itens, t.vendido)]]}
          />
        </>
      )}
      {situacao === "sem_custo" && <p className={RODAPE}>Nenhum item do período tinha custo gravado: a margem é desconhecida, não zero.</p>}
      {situacao === "ok" && (
        <div className="mt-5 border-t border-borda pt-4">
          <h3 className="mb-3 text-sm font-semibold">A conta da margem</h3>
          <ListaDados itens={conta} />
          <p className={RODAPE}>{NAO_E_LUCRO}</p>
        </div>
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// Ticket médio por dia (V5) e descontos concedidos por dia (V6)
// ---------------------------------------------------------------------------------------------
function PainelDoTicket({ vendas, janela, aqui }: { vendas: Leitura<VendasDoBanco>; janela: Janela; aqui: string }) {
  const cartao = { titulo: "Ticket médio por dia", subtitulo: "Vendido ÷ vendas concluídas de cada dia" };
  if (vendas.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={vendas.estado} fonte="vendas" tentarDeNovo={aqui} /></Cartao>;

  const n = numerosDasVendas(vendas.dados);
  if (n.ticket === null) {
    return (
      <Cartao {...cartao}>
        <EstadoVazio titulo="Nenhuma venda concluída no período" icone={Ticket}>A leitura está funcionando; sem venda concluída não há ticket médio.</EstadoVazio>
      </Cartao>
    );
  }
  const dias = diasDeVendas(vendas.dados, janela);
  return (
    <Cartao {...cartao}>
      <p className={NUMERO_PRINCIPAL}>{brl(n.ticket)}</p>
      <p className={NOTA}>Ticket médio do período · {plural(n.vendas, "venda", "vendas")}</p>
      <div className="mt-4">
        <Linhas
          suave series={[{ nome: "Ticket médio", serie: 1, ponto: "maximo", valores: dias.map((d) => d.ticket) }]} rotulosX={dias.map((d) => d.rotulo)}
          semValor="sem venda" formatar={brl} formatarEixo={brlEixo} formatarPonto={brlCompacto} cadaRotulo={cadaRotulo(dias.length)}
        />
      </div>
      {dias.some((d) => d.ticket === null) && <p className={RODAPE}>Dia sem venda concluída fica em branco no gráfico: sem venda não há ticket (não é zero).</p>}
      <TabelaDoGrafico colunas={["Dia", "Vendas", "Vendido", "Ticket médio"]} linhas={dias.map((d) => [d.rotulo, numero(d.vendas), brl(d.vendido), d.ticket === null ? "sem venda" : brl(d.ticket)])} />
    </Cartao>
  );
}

function PainelDosDescontos({ vendas, janela, aqui }: { vendas: Leitura<VendasDoBanco>; janela: Janela; aqui: string }) {
  const cartao = { titulo: "Descontos concedidos por dia", subtitulo: "Soma dos descontos das vendas concluídas em cada dia" };
  if (vendas.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={vendas.estado} fonte="vendas" tentarDeNovo={aqui} /></Cartao>;

  const n = numerosDasVendas(vendas.dados);
  if (n.vendas === 0) {
    return (
      <Cartao {...cartao}>
        <EstadoVazio titulo="Nenhuma venda concluída no período" icone={BadgePercent}>A leitura está funcionando; sem venda concluída não há desconto concedido.</EstadoVazio>
      </Cartao>
    );
  }
  if (n.descontos === 0) {
    return (
      <Cartao {...cartao}>
        <EstadoVazio titulo="Nenhum desconto concedido no período" icone={BadgePercent}>
          {n.vendas === 1 ? "A venda concluída no período saiu pelo valor de tabela." : `As ${numero(n.vendas)} vendas concluídas no período saíram pelo valor de tabela.`}
        </EstadoVazio>
      </Cartao>
    );
  }
  const dias = diasDeVendas(vendas.dados, janela);
  return (
    <Cartao {...cartao}>
      <p className={NUMERO_PRINCIPAL}>{brl(n.descontos)}</p>
      <p className={NOTA}>
        {n.fracaoDeDesconto !== null && `${percentual(n.fracaoDeDesconto)} do valor de tabela · `}
        {plural(n.vendasComDesconto, "venda com desconto", "vendas com desconto")}
      </p>
      <div className="mt-4">
        <Colunas nomeSerie="Descontos" formatar={brl} formatarEixo={brlEixo} cadaRotulo={cadaRotulo(dias.length)} dados={dias.map((d) => ({ rotulo: d.rotulo, valor: d.descontos }))} />
      </div>
      <TabelaDoGrafico
        colunas={["Dia", "Descontos", "Valor de tabela", "% do valor de tabela"]}
        linhas={dias.map((d) => [d.rotulo, brl(d.descontos), brl(d.subtotal), semBase(d.fracaoDeDesconto, percentual)])}
      />
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// Margem por item: o detalhe, uma linha por item das vendas concluídas no período
// ---------------------------------------------------------------------------------------------
function PainelDosItens({ itens, margem, pagina, comLoja, aqui, enderecoDaPagina, exportar }: {
  itens: Leitura<ItensDaMargem>; margem: Leitura<MargemDoBanco>; pagina: number;
  /** Rede inteira: a tabela ganha a coluna da loja. */
  comLoja: boolean;
  aqui: string;
  enderecoDaPagina: (pagina: number) => string;
  /** O endereço do arquivo com todos os itens do período. */
  exportar: string;
}) {
  const cartao = { id: "itens", titulo: "Margem por item", subtitulo: "Uma linha por item das vendas concluídas no período, com o custo gravado na venda" };
  if (itens.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={itens.estado} fonte="margem" tentarDeNovo={aqui} /></Cartao>;

  const { total, itens: linhas } = itens.dados;
  const m = margem.estado === "ok" ? margem.dados : null;
  if (total === 0) {
    return (
      <Cartao {...cartao}>
        {m && situacaoDaMargem(m) === "lojas_fora" ? (
          <EstadoDoPainel estado="sem_permissao" motivo={SO_LOJA_FORA} />
        ) : (
          <EstadoVazio titulo="Nenhum item em venda concluída no período" icone={CircleSlash}>
            A leitura está funcionando; só não houve item em venda concluída nas lojas em que você vê o custo dos produtos.
          </EstadoVazio>
        )}
      </Cartao>
    );
  }
  const baixar = <BaixarPlanilha endereco={exportar} rotulo="Exportar itens" estilo="ligacao" />;
  if (linhas.length === 0) {
    // Página pedida no endereço depois do fim da lista.
    return (
      <Cartao {...cartao} acao={baixar}>
        <EstadoVazio titulo="Esta página não tem itens" icone={CircleSlash} acao={<BotaoLink href={`${enderecoDaPagina(1)}#itens`} variante="secundario" tamanho="sm">Voltar à primeira página</BotaoLink>}>
          O período tem {plural(total, "item", "itens")} ao todo.
        </EstadoVazio>
      </Cartao>
    );
  }

  // A data (e, na rede inteira, a loja) vai embaixo do número da venda: com uma coluna para cada, o
  // produto ficava espremido em três ou quatro linhas no computador.
  return (
    <Cartao {...cartao} acao={baixar}>
      <Tabela legenda="Margem por item" minimo="min-w-[44rem]" alinharDireita={[2, 3, 4, 5]} colunas={["Venda", "Produto", "Qtd.", "Valor", "Custo unit.", "Margem bruta", "Situação"]}>
        {linhas.map((i) => {
          const situacao = situacaoDaVenda(i.situacao);
          return (
            <tr key={i.itemId}>
              <Celula>
                <Link href={`/vendas/${i.vendaId}`} className="whitespace-nowrap font-semibold text-acao hover:underline">Venda {i.numero}</Link>
                <span className="block text-xs text-suave">
                  <span className="numeros whitespace-nowrap">{quando(i.concluidaEm)}</span>
                  {comLoja && i.unidade && ` · ${i.unidade}`}
                </span>
              </Celula>
              {/* Largura mínima: no celular a tabela rola de lado, e o nome do produto não vira uma palavra por linha. */}
              <Celula className="min-w-[11rem]">
                <span className="block font-medium">{i.variante ?? "Produto sem nome"}</span>
                <span className="block text-xs text-suave">{[nomeCurtoDoTipo(i.tipo), ...(i.sku ? [i.sku] : [])].join(" · ")}</span>
              </Celula>
              <Celula className="numeros whitespace-nowrap text-right">{numero(i.quantidade)}</Celula>
              <Celula className="numeros whitespace-nowrap text-right font-semibold">{brl(i.valor)}</Celula>
              <Celula className="numeros whitespace-nowrap text-right text-suave">{i.custoUnitario === null ? "sem custo" : brl(i.custoUnitario)}</Celula>
              <Celula className="numeros whitespace-nowrap text-right font-semibold">{i.margem === null ? "—" : brlComSinal(i.margem)}</Celula>
              <Celula>
                <Selo tom={situacao.tom} ponto>{situacao.nome}</Selo>
                {i.devolvidos > 0 && <span className="mt-1 block whitespace-nowrap text-xs text-suave">{plural(i.devolvidos, "unidade devolvida", "unidades devolvidas")}</span>}
              </Celula>
            </tr>
          );
        })}
      </Tabela>
      <p className={RODAPE}>
        Cada linha mostra o item como foi vendido. Devolução e cancelamento não mudam a linha: saem da margem no dia em que aconteceram, no gráfico e no total do período.
        {m && m.lojasFora > 0 && ` Não entram os itens de ${plural(m.lojasFora, "loja", "lojas")} em que você não vê o custo.`}
      </p>
      {total > POR_PAGINA && (
        <nav aria-label="Páginas da margem por item" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-suave">{`${(pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, total)} de ${numero(total)}`}</span>
          <span className="flex gap-2">
            {pagina > 1 && <BotaoLink href={`${enderecoDaPagina(pagina - 1)}#itens`} variante="secundario" tamanho="sm">Anterior</BotaoLink>}
            {pagina * POR_PAGINA < total && <BotaoLink href={`${enderecoDaPagina(pagina + 1)}#itens`} variante="secundario" tamanho="sm">Próxima</BotaoLink>}
          </span>
        </nav>
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------------------------
// A tela inteira, no recorte de quem pede
// ---------------------------------------------------------------------------------------------
export function ConteudoRelatorios({ relatorios, turno, regioes = null }: {
  relatorios: Relatorios; turno: LojaDoFiltro;
  /** ORG-009: as regiões da rede (só para quem vê a rede); a soma por região aparece na rede inteira. */
  regioes?: RegioesDoPainel;
}) {
  const { periodo, escopo, daRede, janelas, cadastro, vendas, anterior, financeiro, margem, itens, pagina, producao, metas } = relatorios;
  // A meta do dia (G4c): a meta do mês do vendido líquido ÷ dias do mês, de cada mês do período.
  const meta: MetaDoGrafico | null = metas === null ? null : metas.estado === "ok" ? { estado: "ok", ...metaDoDiaPorMes(metas.dados) } : { estado: metas.estado };
  const redeInteira = daRede && escopo.unidade === null;
  // Só quem vê a rede leva a loja no endereço; os demais ficam na loja do turno.
  const lojaDoEndereco = daRede ? escopo.unidade : null;
  const aqui = enderecoDosRelatorios(periodo, lojaDoEndereco, pagina);
  const textos = textosDoRelatorio(periodo);
  // O /financeiro não tem o recorte de 14 dias: a ligação abre lá o que cobre o período e diz qual é.
  const noFinanceiro = PERIODO_NO_FINANCEIRO[periodo];
  const recorte = noFinanceiro === periodo ? "" : ` (${PERIODOS_FINANCEIROS[noFinanceiro].rotulo.toLowerCase()})`;

  return (
    <div className="space-y-4">
      <Indicadores itens={[...indicadoresDeVendas({ vendas, anterior, textos }), indicadorDaMargem(margem), indicadorDoRecebido(financeiro)]} />

      <div className="grid gap-4 xl:grid-cols-3">
        <PainelDeVendas vendas={vendas} anterior={anterior} janelas={janelas} textos={textos} aqui={aqui} meta={meta} acao={<Link href={enderecoDoFinanceiro(noFinanceiro, escopo, turno.id, daRede)} className={LIGACAO}>Conferir no financeiro{recorte}</Link>} />
        <PainelDeRecebimentos financeiro={financeiro} aqui={aqui} acao={<Link href={enderecoDoFinanceiro(noFinanceiro, escopo, turno.id, daRede, "pagamentos")} className={LIGACAO}>Ver pagamentos{recorte}</Link>} />
      </div>

      {margem === "sem_permissao" ? (
        <Cartao titulo="Margem bruta" subtitulo="Por dia e por item, com a cobertura do custo">
          <EstadoDoPainel estado="sem_permissao" motivo="Você não tem a permissão de ver o custo dos produtos nesta loja; sem ela, a margem não é mostrada." />
        </Cartao>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <PainelDaMargem margem={margem} janela={janelas.atual} aqui={aqui} />
          <PainelDaCobertura margem={margem} aqui={aqui} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <PainelDoTicket vendas={vendas} janela={janelas.atual} aqui={aqui} />
        <PainelDosDescontos vendas={vendas} janela={janelas.atual} aqui={aqui} />
      </div>

      {redeInteira ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <PainelDoMix vendas={vendas} aqui={aqui} />
          <PainelDasLojas vendas={vendas} cadastro={cadastro} turno={turno} aqui={aqui} enderecoDaLoja={(loja) => enderecoDosRelatorios(periodo, loja)} regioes={redeInteira ? regioes : null} />
        </div>
      ) : (
        <PainelDoMix vendas={vendas} aqui={aqui} className="" />
      )}

      <PainelDaProducaoPorDia producao={producao} janela={janelas.atual} aqui={aqui} />

      {margem !== "sem_permissao" && itens !== "sem_permissao" && (
        <PainelDosItens
          itens={itens} margem={margem} pagina={pagina} comLoja={redeInteira} aqui={aqui}
          enderecoDaPagina={(p) => enderecoDosRelatorios(periodo, lojaDoEndereco, p)} exportar={enderecoDaExportacao(periodo, lojaDoEndereco, "itens")}
        />
      )}
    </div>
  );
}

import { Target } from "lucide-react";
import Link from "next/link";

import type { LojaDoFiltro } from "../lib/financeiro/escopo";
import { brlCompacto, numero, percentual } from "../lib/formato";
import type { Leitura } from "../lib/leitura-do-banco";
import { agruparPorRegiao, type RegioesDoPainel } from "../lib/lojas/regioes";
import {
  formatarMedida, MEDIDAS, nomeDoMes, progresso, progressoDasLojas, progressoDoAlvo, REALIZADO_ZERO, SITUACOES,
  type FaseDoMes, type Medida, type MetasDasLojas, type MetasDoBanco, type Progresso,
} from "../lib/metas/painel";
import { BarrasHorizontais, Medidor, TabelaDoGrafico } from "./graficos";
import { EstadoDoPainel, LIGACAO, NOTA } from "./paineis-de-vendas";
import { Cartao, EstadoVazio, Selo } from "./ui";

// Peças das metas mensais usadas no /metas (G4b) e no Início (G4c). Só apresentação: os números chegam
// lidos por lib/metas/consulta, com o estado da leitura (falha nunca vira zero; meta não definida
// nunca vira 0%). O ritmo esperado é o da regra pura de lib/metas/painel.

/** Valor curto para indicador e gráfico estreito: "R$ 85,2 mil", "47". O valor cheio fica nas tabelas. */
export const compacto = (medida: Medida, valor: number) => (MEDIDAS[medida].dinheiro ? brlCompacto(valor) : numero(valor));
/** O medidor segue a situação do ritmo, não um corte fixo de percentual (55% no dia 13 de 30 está adiantado). */
export const TOM_DO_MEDIDOR = { sem_meta: "neutro", nao_comecou: "neutro", batida: "sucesso", no_ritmo: "marca", abaixo: "aviso", nao_batida: "aviso" } as const;

/** Barra do atingimento e traço do ritmo esperado (ou da meta inteira, no mês que terminou), uma linha por medida com meta, com a tabela. */
export function BarrasDoRitmo({ lista, fase }: { lista: readonly Progresso[]; fase: FaseDoMes }) {
  const comMeta = lista.filter((p) => p.meta !== null);
  return (
    <>
      <BarrasHorizontais
        nomeSerie="Atingido" nomeMeta={fase === "atual" ? "Ritmo esperado hoje" : "Meta"} formatar={(v) => percentual(v / 100)}
        maximo={Math.max(100, ...comMeta.map((p) => (p.atingido ?? 0) * 100))}
        dados={comMeta.map((p) => ({
          rotulo: MEDIDAS[p.medida].curto, valor: (p.atingido ?? 0) * 100, meta: ((p.esperado ?? 0) / (p.meta ?? 1)) * 100,
          // No celular o detalhe some (os números estão ao lado e na tabela); o rótulo não corta.
          detalhe: <span className="hidden sm:inline">{`${compacto(p.medida, p.realizado)} de ${compacto(p.medida, p.meta ?? 0)}`}</span>,
        }))}
      />
      <TabelaDoGrafico
        colunas={["Medida", "Realizado", "Meta", "Atingido", fase === "atual" ? "Esperado até hoje" : "Esperado", "Situação"]}
        linhas={comMeta.map((p) => [
          MEDIDAS[p.medida].nome, formatarMedida(p.medida, p.realizado), formatarMedida(p.medida, p.meta ?? 0), percentual(p.atingido ?? 0),
          formatarMedida(p.medida, p.esperado ?? 0), SITUACOES[p.situacao].rotulo,
        ])}
      />
    </>
  );
}

/** O medidor da medida principal (o vendido líquido, quando tem meta; senão a primeira com meta), com os números ao lado. */
function MedidaPrincipal({ p }: { p: Progresso }) {
  const situacao = SITUACOES[p.situacao];
  return (
    <div className="flex items-center gap-4">
      <Medidor percentual={(p.atingido ?? 0) * 100} rotulo={MEDIDAS[p.medida].nome} detalhe="atingido" tom={TOM_DO_MEDIDOR[p.situacao]} tamanho={112} />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{MEDIDAS[p.medida].nome}</p>
        <p className="numeros text-xl font-bold tracking-tight">{compacto(p.medida, p.realizado)}</p>
        <p className="text-suave">de {compacto(p.medida, p.meta ?? 0)}</p>
        <Selo tom={situacao.tom} ponto className="mt-1.5">{situacao.rotulo}</Selo>
      </div>
    </div>
  );
}

function ResumoDaMeta({ lista }: { lista: readonly Progresso[] }) {
  const comMeta = lista.filter((p) => p.meta !== null);
  const principal = comMeta.find((p) => p.medida === "vendido_liquido") ?? comMeta[0];
  if (!principal) return null;
  return (
    <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
      <MedidaPrincipal p={principal} />
      <div className="min-w-0"><BarrasDoRitmo lista={lista} fase="atual" /></div>
    </div>
  );
}

const subtituloDoMes = (d: { diasDecorridos: number; diasNoMes: number }) =>
  `Até hoje (${d.diasDecorridos} de ${d.diasNoMes} dias). Barra: quanto de cada meta já foi feito. Traço: o ritmo esperado.`;

/**
 * A meta do mês no Início da gestão (G4c): a loja do recorte ou, na rede inteira, a soma das lojas com
 * meta (o realizado das lojas sem meta fica fora da comparação, e a tela diz quantas são), com o
 * atingimento do vendido líquido de cada loja.
 */
export function PainelDaMetaDoMes({ metas, rede, lojas, aqui, enderecoDasMetas, regioes = null }: {
  metas: Leitura<MetasDasLojas>;
  rede: boolean;
  /** Nomes das lojas do cadastro, para o atingimento por loja. */
  lojas: readonly LojaDoFiltro[];
  aqui: string;
  enderecoDasMetas: string;
  /** ORG-009: as regiões, só na rede inteira; com alguma loja com meta numa região, a soma por região. */
  regioes?: RegioesDoPainel;
}) {
  const acao = <Link href={enderecoDasMetas} className={LIGACAO}>Ver metas</Link>;
  if (metas.estado !== "ok") return <Cartao titulo="Meta do mês" icone={Target} acao={acao}><EstadoDoPainel estado={metas.estado} fonte="metas" tentarDeNovo={aqui} /></Cartao>;
  const d = metas.dados;
  const lista = progressoDasLojas(d, "atual");
  const cartao = { titulo: `${rede ? "Meta da rede" : "Meta da loja"} em ${nomeDoMes(d.mes)}`, subtitulo: subtituloDoMes(d), icone: Target, acao };
  if (lista.every((p) => p.meta === null)) {
    return (
      <Cartao {...cartao}>
        <EstadoVazio titulo="Nenhuma meta da loja definida para este mês" icone={Target}>
          A leitura está funcionando; só não há meta. Sem meta, aparece &quot;meta não definida&quot;, nunca 0%. As metas são definidas em Metas e desempenho.
        </EstadoVazio>
      </Cartao>
    );
  }
  const parciais = rede ? lista.filter((p) => p.meta !== null && p.comMeta < p.total) : [];
  return (
    <Cartao {...cartao}>
      <ResumoDaMeta lista={lista} />
      {parciais.length > 0 && (
        <p className={`mt-3 ${NOTA}`}>
          {`${parciais.map((p) => `${MEDIDAS[p.medida].curto}: soma de ${p.comMeta} de ${p.total} lojas`).join(" · ")}. As lojas sem meta ficam fora da comparação.`}
        </p>
      )}
      {rede && <PorLoja d={d} lojas={lojas} />}
      {rede && <PorRegiao d={d} regioes={regioes} />}
    </Cartao>
  );
}

/** ORG-009: a meta da região é a soma das metas das lojas dela (só as com meta, como na rede). */
function PorRegiao({ d, regioes }: { d: MetasDasLojas; regioes: RegioesDoPainel }) {
  if (regioes === "falha") return <p className={`mt-3 ${NOTA}`}>Não deu para ler as regiões agora; a meta por loja acima está certa.</p>;
  const grupos = agruparPorRegiao(d.lojas.filter((l) => l.metas.vendido_liquido !== undefined), (l) => l.unidadeId, regioes);
  if (!grupos) return null;
  const linhas = grupos.map((g) => {
    const realizado = g.itens.reduce((s, l) => s + l.realizado.vendido_liquido, 0);
    const meta = g.itens.reduce((s, l) => s + (l.metas.vendido_liquido ?? 0), 0);
    return { nome: g.nome, lojas: g.itens.length, p: progresso("vendido_liquido", realizado, meta, d, "atual") };
  });
  return (
    <div className="mt-5 border-t border-borda pt-4">
      <h3 className="mb-3 text-sm font-semibold">Vendido líquido por região</h3>
      <BarrasHorizontais
        nomeSerie="Atingido" nomeMeta="Ritmo esperado hoje" formatar={(v) => percentual(v / 100)} duasColunas
        maximo={Math.max(100, ...linhas.map((x) => (x.p.atingido ?? 0) * 100))}
        dados={linhas.map((x) => ({
          rotulo: x.nome, valor: (x.p.atingido ?? 0) * 100, meta: ((x.p.esperado ?? 0) / (x.p.meta ?? 1)) * 100,
          detalhe: <span className="hidden sm:inline">{`${compacto("vendido_liquido", x.p.realizado)} de ${compacto("vendido_liquido", x.p.meta ?? 0)}`}</span>,
        }))}
      />
      <TabelaDoGrafico
        titulo="Ver as regiões em tabela"
        colunas={["Região", "Lojas com meta", "Vendido líquido", "Meta", "Atingido", "Esperado até hoje", "Situação"]}
        linhas={linhas.map((x) => [
          x.nome, String(x.lojas), formatarMedida("vendido_liquido", x.p.realizado), formatarMedida("vendido_liquido", x.p.meta ?? 0), percentual(x.p.atingido ?? 0),
          formatarMedida("vendido_liquido", x.p.esperado ?? 0), SITUACOES[x.p.situacao].rotulo,
        ])}
      />
      <p className={`mt-2 ${NOTA}`}>A meta da região é a soma das metas das lojas dela; as lojas sem meta ficam fora.</p>
    </div>
  );
}

/** O vendido líquido de cada loja com meta, do maior atingimento ao menor; as sem meta são ditas. */
function PorLoja({ d, lojas }: { d: MetasDasLojas; lojas: readonly LojaDoFiltro[] }) {
  const nome = new Map(lojas.map((l) => [l.id, l.nome] as const));
  const nomeDe = (id: string) => nome.get(id) ?? "Loja fora da lista";
  const comMeta = d.lojas
    .filter((l) => l.metas.vendido_liquido !== undefined)
    .map((l) => ({ id: l.unidadeId, nome: nomeDe(l.unidadeId), p: progresso("vendido_liquido", l.realizado.vendido_liquido, l.metas.vendido_liquido, d, "atual") }))
    .sort((a, b) => (b.p.atingido ?? 0) - (a.p.atingido ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  const semMeta = d.lojas.filter((l) => l.metas.vendido_liquido === undefined).map((l) => nomeDe(l.unidadeId)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (comMeta.length === 0) return null;
  return (
    <div className="mt-5 border-t border-borda pt-4">
      <h3 className="mb-3 text-sm font-semibold">Vendido líquido por loja</h3>
      <BarrasHorizontais
        nomeSerie="Atingido" nomeMeta="Ritmo esperado hoje" formatar={(v) => percentual(v / 100)} duasColunas
        maximo={Math.max(100, ...comMeta.map((x) => (x.p.atingido ?? 0) * 100))}
        dados={comMeta.map((x) => ({
          rotulo: x.nome, valor: (x.p.atingido ?? 0) * 100, meta: ((x.p.esperado ?? 0) / (x.p.meta ?? 1)) * 100,
          detalhe: <span className="hidden sm:inline">{`${compacto("vendido_liquido", x.p.realizado)} de ${compacto("vendido_liquido", x.p.meta ?? 0)}`}</span>,
        }))}
      />
      <TabelaDoGrafico
        colunas={["Loja", "Vendido líquido", "Meta", "Atingido", "Esperado até hoje", "Situação"]}
        linhas={comMeta.map((x) => [
          x.nome, formatarMedida("vendido_liquido", x.p.realizado), formatarMedida("vendido_liquido", x.p.meta ?? 0), percentual(x.p.atingido ?? 0),
          formatarMedida("vendido_liquido", x.p.esperado ?? 0), SITUACOES[x.p.situacao].rotulo,
        ])}
      />
      {semMeta.length > 0 && <p className={`mt-2 ${NOTA}`}>{`Sem meta do vendido líquido neste mês: ${semMeta.join(", ")}.`}</p>}
    </div>
  );
}

/** A própria meta do mês no Início do vendedor (G4c), nesta loja: medidor, ritmo e o caminho para "Minhas metas". */
export function PainelDaMinhaMeta({ metas, eu, aqui }: { metas: Leitura<MetasDoBanco>; eu: string; aqui: string }) {
  const acao = <Link href="/metas" className={LIGACAO}>Ver minhas metas</Link>;
  if (metas.estado !== "ok") return <Cartao titulo="Minha meta do mês" icone={Target} acao={acao}><EstadoDoPainel estado={metas.estado} fonte="metas" tentarDeNovo={aqui} /></Cartao>;
  const d = metas.dados;
  const minha = d.vendedores.find((v) => v.vendedorId === eu) ?? { metas: {}, realizado: REALIZADO_ZERO };
  const lista = progressoDoAlvo(minha, d, "atual");
  const cartao = { titulo: `Minha meta em ${nomeDoMes(d.mes)}`, subtitulo: `Nesta loja. ${subtituloDoMes(d)}`, icone: Target, acao };
  if (lista.every((p) => p.meta === null)) {
    return (
      <Cartao {...cartao}>
        <EstadoVazio titulo="Nenhuma meta sua definida para este mês" icone={Target}>
          Quando a gerência definir, ela aparece aqui e em Minhas metas, com o ritmo do dia.
        </EstadoVazio>
      </Cartao>
    );
  }
  return <Cartao {...cartao}><ResumoDaMeta lista={lista} /></Cartao>;
}

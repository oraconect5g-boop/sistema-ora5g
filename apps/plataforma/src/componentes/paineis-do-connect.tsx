import { Signal } from "lucide-react";
import type { ReactNode } from "react";

import type { Janela } from "../lib/financeiro/painel";
import { brl, numero } from "../lib/formato";
import { confirmadas, diasDaProducao, SERIES_DA_PRODUCAO, type ProducaoDoBanco } from "../lib/connect/producao";
import type { Leitura } from "../lib/leitura-do-banco";
import { BarraSegmentada, Linhas, TabelaDoGrafico } from "./graficos";
import { cadaRotulo, EstadoDoPainel, NOTA, NUMERO_PRINCIPAL, plural, SEM_LEITURA, type ItemDoResumo } from "./paineis-de-vendas";
import { Cartao, EstadoVazio, ListaDados } from "./ui";

// Produção do Ora Connect (lote G4a), do mesmo jeito no Início, nos Relatórios e no /connect: chips
// vendidos (T1) e operações confirmadas (T2), uma por operação, cada uma no dia da confirmação. O que
// está em andamento ou sem resultado aparece à parte e nunca soma na produção. Só apresentação: os
// números chegam lidos por lib/connect/consulta-producao, com o estado da leitura.

const ROTULO = "Ora Connect confirmado";

/** O indicador do período: operações confirmadas, com os chips vendidos e o que ainda não é produção. */
export function indicadorDoConnect(producao: Leitura<ProducaoDoBanco>): ItemDoResumo {
  if (producao.estado !== "ok") return { rotulo: ROTULO, icone: Signal, valor: "—", detalhe: SEM_LEITURA[producao.estado], tom: "atencao" };
  const t = producao.dados.totais;
  const pendentes = t.emAndamento + t.semResultado;
  return {
    rotulo: ROTULO, icone: Signal, valor: numero(confirmadas(t)),
    detalhe: [
      plural(t.ativacoes, "ativação", "ativações"), ...(t.portabilidades > 0 ? [plural(t.portabilidades, "portabilidade", "portabilidades")] : []),
      plural(t.recargas, "recarga", "recargas"), plural(t.chips, "chip vendido", "chips vendidos"),
      ...(pendentes > 0 ? [`${numero(pendentes)} ainda sem confirmação`] : []),
    ].join(" · "),
  };
}

/** Chips vendidos e operações confirmadas por dia (Relatórios). */
export function PainelDaProducaoPorDia({ producao, janela, aqui }: { producao: Leitura<ProducaoDoBanco>; janela: Janela; aqui: string }) {
  const cartao = { titulo: "Chips, ativações e recargas por dia", subtitulo: "Operações confirmadas, no dia da confirmação; chip, no dia da venda", className: "xl:col-span-2" };
  if (producao.estado !== "ok") return <Cartao {...cartao}><EstadoDoPainel estado={producao.estado} fonte="connect" tentarDeNovo={aqui} /></Cartao>;
  const t = producao.dados.totais;
  if (confirmadas(t) === 0 && t.chips === 0) {
    return (
      <Cartao {...cartao}>
        <EstadoVazio titulo="Nenhum chip vendido nem operação confirmada no período" icone={Signal}>A leitura está funcionando; só não houve produção do Ora Connect.</EstadoVazio>
        {t.emAndamento + t.semResultado > 0 && <p className={`mt-3 ${NOTA}`}>{plural(t.emAndamento + t.semResultado, "operação ainda sem confirmação", "operações ainda sem confirmação")}: não entram até serem confirmadas.</p>}
      </Cartao>
    );
  }
  const dias = diasDaProducao(producao.dados, janela);
  return (
    <Cartao {...cartao}>
      <p className={NUMERO_PRINCIPAL}>{numero(confirmadas(t))}</p>
      <p className={NOTA}>
        {plural(confirmadas(t), "operação confirmada", "operações confirmadas")} · {plural(t.chips, "chip vendido", "chips vendidos")}
        {t.emAndamento + t.semResultado > 0 && ` · ${numero(t.emAndamento + t.semResultado)} ainda sem confirmação (fora da conta)`}
      </p>
      <div className="mt-4">
        <Linhas
          series={SERIES_DA_PRODUCAO.map((s) => ({ nome: s.nome, serie: s.serie, ponto: "nenhum" as const, valores: dias.map((d) => d[s.chave]) }))}
          rotulosX={dias.map((d) => d.rotulo)} formatar={numero} cadaRotulo={cadaRotulo(dias.length)}
        />
      </div>
      <TabelaDoGrafico colunas={["Dia", ...SERIES_DA_PRODUCAO.map((s) => s.nome)]} linhas={dias.map((d) => [d.rotulo, ...SERIES_DA_PRODUCAO.map((s) => numero(d[s.chave]))])} />
    </Cartao>
  );
}

/** A produção do período no /connect: por tipo, por origem, o que falta confirmar e, com custo.ver, o débito na carteira. */
export function PainelDaProducao({ producao, veCusto, aqui, filtro }: {
  producao: Leitura<ProducaoDoBanco>;
  /** Tem custo.ver na loja do turno: o débito registrado na carteira aparece. */
  veCusto: boolean;
  aqui: string;
  filtro: ReactNode;
}) {
  const cartao = { titulo: "Produção do período", subtitulo: "Operações confirmadas pela operadora ou pela revisão da gerência; registrada não é produção" };
  if (producao.estado !== "ok") return <Cartao {...cartao}>{filtro}<div className="mt-3"><EstadoDoPainel estado={producao.estado} fonte="connect" tentarDeNovo={aqui} /></div></Cartao>;
  const t = producao.dados.totais;
  const partes = SERIES_DA_PRODUCAO.filter((s) => s.chave !== "chips").map((s) => ({ nome: s.nome, valor: t[s.chave], serie: s.serie }));
  const lista = [
    ["Chips vendidos (venda; ativar é outra operação)", numero(t.chips)] as const,
    ["Confirmadas pela operadora", numero(t.porEvidencia)] as const,
    ["Confirmadas pela revisão da gerência", numero(t.porRevisao)] as const,
    ["Em andamento (registradas, enviando ou aguardando)", numero(t.emAndamento)] as const,
    ["Sem resultado (precisam de decisão)", numero(t.semResultado)] as const,
    ["Valor de face das recargas (não é receita)", brl(t.valorFaceRecargas)] as const,
    ...(veCusto ? [["Débito registrado na carteira", t.lojasSemCusto > 0 ? `${brl(t.debito)} (sem ${plural(t.lojasSemCusto, "loja", "lojas")})` : brl(t.debito)] as const] : []),
  ];
  return (
    <Cartao {...cartao}>
      {filtro}
      <div className="mt-4">
        {confirmadas(t) === 0 ? (
          <EstadoVazio titulo="Nenhuma operação confirmada no período" icone={Signal}>A leitura está funcionando; operação registrada só conta depois de confirmada.</EstadoVazio>
        ) : (
          <>
            <p className={NUMERO_PRINCIPAL}>{numero(confirmadas(t))}</p>
            <p className={`mb-4 ${NOTA}`}>{plural(confirmadas(t), "operação confirmada", "operações confirmadas")} no período</p>
            <BarraSegmentada rotulo="Confirmadas" formatar={numero} partes={partes} />
          </>
        )}
      </div>
      <ListaDados className="mt-4 border-t border-borda pt-3" itens={lista} />
    </Cartao>
  );
}

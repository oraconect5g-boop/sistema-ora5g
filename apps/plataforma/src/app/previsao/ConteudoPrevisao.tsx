import Link from "next/link";

import { History, Info, Landmark, ListChecks } from "lucide-react";

import { ColunasComSinal, TabelaDoGrafico } from "../../componentes/graficos";
import { EstadoDoPainel, NOTA, plural } from "../../componentes/paineis-de-vendas";
import { Cartao, FiltroSegmentado } from "../../componentes/ui";
import { brl, brlComSinal, brlEixoComSinal } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";
import type { Previsao } from "../../lib/previsao/consulta";
import { diaCurto, estimativa, HORIZONTES, liquidoDaSemana, type Horizonte } from "../../lib/previsao/regras";
import type { FiltroDoResultado } from "../../lib/resultado/regras";
import { Simulador } from "./Simulador";

// Previsão de caixa (lote L8c). O servidor apresenta os fatos (lidos por lib/previsao/consulta) e as
// premissas; o simulador, no navegador, faz a estimativa, a simulação e o saldo previsto.

/** O endereço da tela para um horizonte e um filtro (8 semanas e a rede inteira ficam fora do endereço). */
export function enderecoDaPrevisao(semanas: Horizonte, filtro: FiltroDoResultado): string {
  const p = new URLSearchParams();
  if (semanas !== 8) p.set("semanas", String(semanas));
  if (filtro.tipo === "loja") p.set("loja", filtro.id);
  const texto = p.toString();
  return texto ? `/previsao?${texto}` : "/previsao";
}

type Props = { leitura: Leitura<Previsao>; semanas: Horizonte; filtro: FiltroDoResultado };

export function ConteudoPrevisao({ leitura, semanas, filtro }: Props) {
  const lojas = leitura.estado === "ok" ? leitura.dados.lojas : [];
  return (
    <>
      <div className="nao-imprimir space-y-2">
        <FiltroSegmentado
          rotulo="Horizonte"
          opcoes={HORIZONTES.map((h) => ({ href: enderecoDaPrevisao(h, filtro), rotulo: `${h} semanas`, ativo: h === semanas }))}
        />
        {lojas.length > 0 && (
          <FiltroSegmentado
            rotulo="Onde"
            opcoes={[
              { href: enderecoDaPrevisao(semanas, { tipo: "rede" }), rotulo: "Rede inteira", ativo: filtro.tipo === "rede" },
              ...lojas.map((l) => ({ href: enderecoDaPrevisao(semanas, { tipo: "loja", id: l.id }), rotulo: l.nome, ativo: filtro.tipo === "loja" && filtro.id === l.id })),
            ]}
          />
        )}
      </div>
      {leitura.estado !== "ok" ? (
        <Cartao titulo="Previsão de caixa" icone={Landmark}>
          <EstadoDoPainel estado={leitura.estado} fonte="previsao" tentarDeNovo={enderecoDaPrevisao(semanas, filtro)} />
        </Cartao>
      ) : (
        <Painel p={leitura.dados} onde={filtro.tipo === "rede" ? "Rede inteira" : (lojas.find((l) => l.id === filtro.id)?.nome ?? "Loja")} />
      )}
    </>
  );
}

function Painel({ p, onde }: { p: Previsao; onde: string }) {
  const est = estimativa(p.base);
  const naRede = p.unidade === null;
  return (
    <>
      <Simulador
        semanas={p.semanas} vencidas={p.vencidas} estimativa={est} onde={onde} hoje={p.hoje}
        fatos={{ financeiras: p.financeiras, aConciliar: p.aConciliar, gavetas: p.gavetas }}
      />
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Fatos p={p} naRede={naRede} />
        <Base p={p} />
      </div>
      <Premissas est={est} naRede={naRede} />
    </>
  );
}

function Fatos({ p, naRede }: { p: Previsao; naRede: boolean }) {
  const contas = p.semanas.reduce((s, x) => s + x.contas, 0);
  const quantidade = p.semanas.reduce((s, x) => s + x.quantidade, 0);
  const linha = (rotulo: string, valor: string, detalhe: string) => (
    <li className="flex items-baseline justify-between gap-3 py-2.5">
      <span className="min-w-0"><span className="block text-sm">{rotulo}</span><span className="block text-xs text-suave">{detalhe}</span></span>
      <span className="numeros shrink-0 text-sm font-semibold">{valor}</span>
    </li>
  );
  return (
    <Cartao titulo="Fatos de hoje" icone={ListChecks} subtitulo="O que já está lançado no sistema, sem estimativa.">
      <ul className="divide-y divide-borda">
        {linha("Contas a pagar no período", brl(contas), `${plural(quantidade, "conta em aberto", "contas em aberto")}, pelo vencimento${naRede ? " (lojas e rede)" : " (só as da loja)"}`)}
        {linha("Contas já vencidas", brl(p.vencidas.valor), p.vencidas.quantidade === 0 ? "Nenhuma em aberto" : `${plural(p.vencidas.quantidade, "conta", "contas")} ainda em aberto: entram na primeira semana`)}
        {linha("A receber das financeiras", brl(p.financeiras.valor), p.financeiras.quantidade === 0 ? "Nada em aberto" : `${plural(p.financeiras.quantidade, "venda", "vendas")}, sem data: falta o prazo da PayJoy e da Aiva`)}
        {linha("Cartão e Pix a conciliar", brl(p.aConciliar.valor), p.aConciliar.quantidade === 0 ? "Nada dos últimos 60 dias" : `${plural(p.aConciliar.quantidade, "pagamento", "pagamentos")} dos últimos 60 dias: parte pode já estar no banco`)}
        {linha("Dinheiro nas gavetas agora", brl(p.gavetas.valor), p.gavetas.caixas === 0 ? "Nenhum caixa aberto" : plural(p.gavetas.caixas, "caixa aberto", "caixas abertos"))}
      </ul>
      <p className="mt-3 text-xs text-suave">
        Os três últimos não entram na previsão: some ao saldo de hoje o que você quiser contar.{" "}
        <Link href="/contas-a-pagar" className="font-semibold text-acao hover:underline">Ver as contas a pagar</Link>
      </p>
    </Cartao>
  );
}

function Base({ p }: { p: Previsao }) {
  const temMovimento = p.base.some((b) => b.recebido !== 0 || b.devolvido !== 0 || b.saidasCaixa !== 0);
  return (
    <Cartao titulo="As 8 semanas anteriores" icone={History} subtitulo="O que cada semana deixou: o recebido nas lojas, menos devoluções pagas e saídas do caixa. É a base da estimativa.">
      {!temMovimento ? <p className={NOTA}>Nenhum recebimento nas 8 semanas anteriores.</p> : (
        <>
          <ColunasComSinal
            dados={p.base.map((b) => ({ rotulo: diaCurto(b.inicio), valor: liquidoDaSemana(b) }))}
            formatar={brlComSinal}
            formatarEixo={brlEixoComSinal}
            nomeSerie="Deixou"
            nomes={["Entrou mais", "Saiu mais"]}
            cadaRotulo={2}
            altura={160}
          />
          <TabelaDoGrafico
            colunas={["Semana", "Recebido", "Devoluções", "Saídas do caixa", "Deixou"]}
            linhas={p.base.map((b) => [`${diaCurto(b.inicio)} a ${diaCurto(b.fim)}`, brl(b.recebido), brl(b.devolvido), brl(b.saidasCaixa), brlComSinal(liquidoDaSemana(b))])}
          />
        </>
      )}
    </Cartao>
  );
}

function Premissas({ est, naRede }: { est: ReturnType<typeof estimativa>; naRede: boolean }) {
  return (
    <Cartao titulo="Premissas" icone={Info} subtitulo="O que é estimativa e o que é fato nesta previsão.">
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-suave">
        <li>
          {est === null
            ? "Entrada estimada: sem recebimento nas 8 semanas anteriores, não há estimativa; a previsão mostra só as contas."
            : `Entrada estimada (estimativa): a média de ${est.semanas} ${est.semanas === 1 ? "semana" : "semanas"} (de ${diaCurto(est.de)} a ${diaCurto(est.ate)}) do que entrou nas lojas (dinheiro, Pix, cartão e entradas de financiamento), menos as devoluções pagas e as saídas do caixa. Toda semana igual: feriados e datas fortes não entram.`}
        </li>
        <li>Simulação: muda só a estimativa das vendas, de 30% a menos a 30% a mais. As contas não mudam.</li>
        <li>{`Contas (fato): as contas a pagar em aberto, pelo vencimento${naRede ? ", das lojas e da rede" : ", só as da loja (as da rede aparecem na rede inteira)"}; as já vencidas entram na primeira semana.`}</li>
        <li>Saldo de partida: o que você digitar, só no seu navegador. O sistema não sabe o saldo do banco.</li>
        <li>Não entram: o que as financeiras devem (sem data), o cartão e Pix a conciliar (pode já estar no banco) e o dinheiro das gavetas.</li>
      </ul>
    </Cartao>
  );
}

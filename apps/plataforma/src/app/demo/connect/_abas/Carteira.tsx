import { ArrowDownLeft, ArrowUpRight, CalendarClock, FileSpreadsheet, Wallet } from "lucide-react";

import { ExportarCsv } from "../../../../componentes/ExportarCsv";
import { BarraSegmentada } from "../../../../componentes/graficos";
import { Cartao, Celula, Indicador, Selo, Tabela, type Tom } from "../../../../componentes/ui";
import { CARTEIRA_CONTEL, nomeDaLoja, nomeDaPessoa, PORTABILIDADES, RECARGAS_PROGRAMADAS, type OperacaoConnect } from "../../../../demo/dados";
import type { StatusPortabilidade } from "../../../../integracoes/nogle/regras";
import { brl, numero } from "../../../../lib/formato";
import { dataRelativa, formatarLinha } from "./util";

const TOM: Record<StatusPortabilidade, Tom> = { "Aguardando confirmação": "aviso", "Portabilidade em andamento": "info", Sucesso: "sucesso", "Portabilidade negada": "perigo" };

/** Carteira pré-paga da Ora na Contel (GET /saldo/*) e relatórios (GET /relatorios/*, /portabilidade/listar). */
export function Carteira({ operacoes, agora }: { operacoes: readonly OperacaoConnect[]; agora: Date }) {
  const saidas = CARTEIRA_CONTEL.extrato.filter((e) => e.tipo === "SAÍDA").reduce((s, e) => s + e.valor, 0);
  const entradas = CARTEIRA_CONTEL.extrato.filter((e) => e.tipo === "ENTRADA").reduce((s, e) => s + e.valor, 0);
  const transacoes = operacoes.filter((o) => (o.tipo === "Ativação" || o.tipo === "Recarga") && o.situacao.startsWith("Confirmada"));
  const ativacoes = transacoes.filter((o) => o.tipo === "Ativação").length;
  const recargas = transacoes.filter((o) => o.tipo === "Recarga");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Saldo na Contel" valor={brl(CARTEIRA_CONTEL.saldo)} icone={Wallet} detalhe="Pré-pago para ativar e recarregar" />
        <Indicador rotulo="Saídas recentes" valor={brl(saidas)} icone={ArrowUpRight} detalhe="Ativações, recargas e compras" />
        <Indicador rotulo="Entradas recentes" valor={brl(entradas)} icone={ArrowDownLeft} detalhe="Depósitos de saldo" tom="bom" />
        <Indicador rotulo="Recargas programadas" valor={numero(RECARGAS_PROGRAMADAS.length)} icone={CalendarClock} detalhe="Renovam pelo saldo" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Cartao className="xl:col-span-2" titulo="Extrato da carteira" subtitulo="Valor cobrado da Ora, não o que o cliente pagou (GET /saldo/extrato)" acao={<ExportarCsv nomeArquivo="extrato-contel" colunas={["Data", "Tipo", "Descrição", "Valor (R$)"]} linhas={CARTEIRA_CONTEL.extrato.map((e) => [dataRelativa(agora, e.diasAtras), e.tipo, e.descricao, (e.valor / 100).toFixed(2).replace(".", ",")])} />}>
          <Tabela colunas={["Data", "Movimento", "Valor"]} legenda="Extrato da carteira na Contel" alinharDireita={[2]} minimo="min-w-[30rem]">
            {CARTEIRA_CONTEL.extrato.map((e, i) => (
              <tr key={i}>
                <Celula className="numeros text-suave">{dataRelativa(agora, e.diasAtras)}</Celula>
                <Celula><Selo tom={e.tipo === "ENTRADA" ? "sucesso" : "neutro"}>{e.tipo === "ENTRADA" ? "Entrada" : "Saída"}</Selo> <span className="ml-1">{e.descricao}</span></Celula>
                <Celula className={`numeros text-right font-semibold ${e.tipo === "ENTRADA" ? "text-sucesso" : ""}`}>{e.tipo === "ENTRADA" ? "+" : "−"} {brl(e.valor)}</Celula>
              </tr>
            ))}
          </Tabela>
        </Cartao>
        <Cartao titulo="Transações de hoje" subtitulo="Ativações e recargas confirmadas (GET /relatorios/transacoes)" icone={FileSpreadsheet}>
          <BarraSegmentada rotulo="Transações" formatar={(v) => numero(v)} partes={[{ nome: "Ativações", valor: ativacoes, serie: 2 }, { nome: "Recargas", valor: recargas.length, serie: 4 }]} />
          <p className="mt-3 text-xs text-suave">Recargas somam {brl(recargas.reduce((s, o) => s + o.valor, 0))} em valor de face (não é receita da Ora).</p>
        </Cartao>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Cartao titulo="Portabilidades" subtitulo="Relatório da operadora (GET /portabilidade/listar)">
          <ul className="divide-y divide-borda text-sm">
            {PORTABILIDADES.map((p) => (
              <li key={p.linha} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="numeros">{formatarLinha(p.doador)} <span className="text-suave">({p.operadora})</span> → {formatarLinha(p.linha)}</span>
                <Selo tom={TOM[p.status]} ponto>{p.status}</Selo>
              </li>
            ))}
          </ul>
        </Cartao>
        <Cartao titulo="Recargas programadas" subtitulo="Próximas renovações automáticas (GET /saldo/programado)">
          <ul className="divide-y divide-borda text-sm">
            {RECARGAS_PROGRAMADAS.map((r) => (
              <li key={r.linha} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="numeros">{formatarLinha(r.linha)}</span> · {r.plano}<span className="block text-xs text-suave">{r.cliente} · renova em {dataRelativa(agora, -r.renovacaoEmDias)}</span></span>
                <span className="numeros font-semibold">{brl(r.valor)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>

      <Cartao titulo="Ativações e recargas por vendedor" subtitulo="Atribuídas a quem vendeu e à loja da venda (CONNECT-006)">
        <Tabela colunas={["Hora", "Operação", "Vendedor", "Loja", "Valor"]} legenda="Ativações e recargas confirmadas" alinharDireita={[4]} minimo="min-w-[36rem]">
          {transacoes.slice(-12).reverse().map((o) => (
            <tr key={o.id}>
              <Celula className="numeros text-suave">{o.hora}</Celula>
              <Celula>{o.tipo} <span className="numeros text-suave">{o.linha}</span></Celula>
              <Celula>{nomeDaPessoa(o.vendedor)}</Celula>
              <Celula className="text-suave">{nomeDaLoja(o.loja)}</Celula>
              <Celula className="numeros text-right">{o.valor > 0 ? brl(o.valor) : "—"}</Celula>
            </tr>
          ))}
        </Tabela>
      </Cartao>
    </div>
  );
}

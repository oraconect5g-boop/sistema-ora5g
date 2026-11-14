import { FileCheck2, FileClock, FileWarning, FolderCheck, ReceiptText, ShieldAlert, Timer, Undo2 } from "lucide-react";
import Link from "next/link";

import { MODELOS_DE_NOTA, SITUACOES_DA_NOTA } from "@ora5g/dominio/fiscal";

import { BarraSegmentada, BarrasHorizontais, TabelaDoGrafico } from "../../../componentes/graficos";
import { Botao, Cartao, EstadoVazio, Indicador, ListaDados, Selo } from "../../../componentes/ui";
import { brl, numero } from "../../../lib/formato";
import {
  DIVERGENCIAS, EXPLICACAO_DAS_DIVERGENCIAS, NOME_DA_FALTA, type ConciliacaoFiscal, type Divergencia, type Periodo,
} from "../../../lib/notas/conciliacao";
import { haQuanto } from "../../../lib/notas/regras";
import { conferirDivergencia } from "../acoes";

// O conteúdo da conciliação das notas (lote L10b: ORA-FISC-008 em parte), à parte da página: recebe a leitura já conferida.
const campo = "mt-1 w-full rounded-botao border border-borda bg-white px-3 py-2 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const diaDe = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(iso));
const mesDe = (aaaaMm: string | null) => (aaaaMm ? `${aaaaMm.slice(5, 7)}/${aaaaMm.slice(0, 4)}` : "—");
const emMinutos = (v: number | null) => (v === null ? "—" : haQuanto(v).replace(/^há /, ""));
const documento = (modelo: string | null, serie: number | null, numeroDocumento: number | null) =>
  numeroDocumento === null ? null : `${MODELOS_DE_NOTA[modelo ?? ""] ?? `Modelo ${modelo}`} nº ${numeroDocumento}${serie === null ? "" : ` · série ${serie}`}`;
const MAIS_ANTIGAS = (mostradas: number, total: number) => (total > mostradas ? `as ${numero(mostradas)} mais antigas de ${numero(total)}` : undefined);

function detalheDaDivergencia(d: Divergencia): string {
  if (d.tipo === "chave_fora_do_mes") return `chave de ${mesDe(d.mesDaChave)}, ${d.pedidoTipo === "devolucao" ? "devolução" : "venda"} de ${mesDe(d.mesDaVenda)}`;
  if (d.tipo === "numero_repetido") return `o mesmo número na venda nº ${d.outraVenda}`;
  return `pedido cancelado${d.motivo ? `: ${d.motivo}` : ""}`;
}

// prazo: o prazo de alerta da fila registrado pela rede (nulo: sem prazo; nada conta como atrasado).
export function ConteudoDaConciliacao({ r, periodo, prazo }: { r: ConciliacaoFiscal; periodo: Periodo; prazo: number | null }) {
  const s = r.resumo;
  const cobertura = s.vendas > 0 ? Math.round((s.comNota / s.vendas) * 100) : null;
  const nadaAResolver = r.semPedido.length + r.emAndamento.length + r.devolucoesPendentes.length + r.semDocumento.length === 0;
  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Vendas com nota" icone={FileCheck2} valor={cobertura === null ? "—" : `${cobertura}%`}
          tom={cobertura === null ? "neutro" : cobertura === 100 ? "bom" : "atencao"}
          detalhe={s.vendas > 0 ? `${numero(s.comNota)} de ${numero(s.vendas)} ${s.vendas === 1 ? "venda" : "vendas"} do período` : "nenhuma venda no período"} />
        <Indicador rotulo="Sem pedido de nota" icone={FileWarning} valor={numero(s.semPedido)} tom={s.semPedido > 0 ? "atencao" : "neutro"}
          detalhe={s.semPedido > 0 ? `${brl(s.valorSemPedido)} em vendas` : "toda venda tem pedido ou nota"} />
        <Indicador rotulo="Na fila de notas" icone={FileClock} valor={numero(s.emAndamento)} tom={s.atrasadas > 0 ? "ruim" : "neutro"}
          detalhe={s.atrasadas > 0 ? `${numero(s.atrasadas)} ${s.atrasadas === 1 ? "passou" : "passaram"} do prazo` : "esperando aprovação ou emissão"} />
        <Indicador rotulo="Divergências abertas" icone={ShieldAlert} valor={numero(s.divergenciasAbertas)} tom={s.divergenciasAbertas > 0 ? "ruim" : "neutro"}
          detalhe={s.divergencias > s.divergenciasAbertas ? `${numero(s.divergencias - s.divergenciasAbertas)} já ${s.divergencias - s.divergenciasAbertas === 1 ? "conferida" : "conferidas"}` : "a conferir no portal"} />
      </div>

      <Cartao className="mt-4" titulo="As vendas do período e a nota" icone={ReceiptText}
        subtitulo="Cada venda concluída num grupo só (as canceladas não entram)">
        {s.vendas === 0 ? (
          <EstadoVazio titulo="Nenhuma venda concluída no período" icone={ReceiptText}>A leitura está funcionando; não houve venda nestes dias.</EstadoVazio>
        ) : (
          <>
            <BarraSegmentada rotulo="Vendas do período" formatar={numero} partes={[
              { nome: "Com a nota emitida", valor: s.comNota, serie: 1 },
              { nome: "Pedido de nota em andamento", valor: s.emAndamento, serie: 2 },
              { nome: "Sem pedido de nota", valor: s.semPedido, serie: 3 },
              { nome: "Devolvidas inteiras, sem nota", valor: s.devolvidasSemNota, serie: "comparacao" },
            ]} />
            {r.porLoja.length > 1 && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">Vendas com nota, por loja</p>
                <BarrasHorizontais nomeSerie="Vendas com nota" maximo={100} formatar={(v) => `${v}%`}
                  dados={r.porLoja.filter((l) => l.vendas > 0).map((l) => ({ rotulo: l.nome, valor: Math.round((l.comNota / l.vendas) * 100) }))} />
                <TabelaDoGrafico titulo="Ver as vendas e as notas de cada loja"
                  colunas={["Loja", "Vendas", "Com nota", "Em andamento", "Sem pedido", "Devolvidas", "Divergências abertas"]}
                  linhas={r.porLoja.map((l) => [l.nome, numero(l.vendas), numero(l.comNota), numero(l.emAndamento), numero(l.semPedido), numero(l.devolvidasSemNota),
                    numero(l.divergenciasAbertas)])} />
              </div>
            )}
          </>
        )}
      </Cartao>

      <Cartao className="mt-4" id="divergencias" titulo="Divergências" icone={ShieldAlert}
        subtitulo="O que não pode estar certo, sem depender de regra do contador. Confira no portal e registre o que foi feito">
        {r.divergencias.length === 0 ? (
          <EstadoVazio titulo="Nenhuma divergência no período" icone={ShieldAlert}>As chaves registradas batem com o mês da venda e nenhum número de nota se repete.</EstadoVazio>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {r.divergencias.map((d) => (
              <li key={`${d.tipo}:${d.pedido}`} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <Link href={`/vendas/${d.venda}`} className="font-semibold text-acao">{d.pedidoTipo === "devolucao" ? "Devolução da venda" : "Venda"} nº {d.numero}</Link>
                  <Selo tom={d.conferidaEm ? "neutro" : "perigo"} ponto>{DIVERGENCIAS[d.tipo]}{d.conferidaEm ? " · conferida" : ""}</Selo>
                </div>
                <p className="mt-1 text-suave">{[d.loja, documento(d.modelo, d.serie, d.numeroDocumento), detalheDaDivergencia(d)].filter(Boolean).join(" · ")}</p>
                {d.conferidaEm ? (
                  <p className="mt-1 text-xs text-suave">Conferida por {d.conferidaPor} em {diaDe(d.conferidaEm)}: {d.observacaoDaConferencia}</p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-suave">{EXPLICACAO_DAS_DIVERGENCIAS[d.tipo]}</p>
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer font-semibold text-acao">Registrar a conferência</summary>
                      <form action={conferirDivergencia} className="mt-2 space-y-2">
                        <input type="hidden" name="pedido" value={d.pedido} />
                        <input type="hidden" name="tipo" value={d.tipo} />
                        <input type="hidden" name="periodo" value={periodo} />
                        {r.unidade && <input type="hidden" name="loja" value={r.unidade} />}
                        <label className="block text-xs font-medium">O que você conferiu e o que foi feito (fica na auditoria)
                          <textarea name="observacao" required minLength={10} maxLength={500} rows={2} className={campo} />
                        </label>
                        <Botao type="submit" tamanho="sm" variante="secundario">Registrar conferência</Botao>
                      </form>
                    </details>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao className="mt-4" titulo="O que resolver" icone={FileWarning}
        subtitulo="Venda sem pedido, pedido parado, nota de devolução pendente e nota sem o PDF, o XML ou o protocolo">
        {nadaAResolver ? (
          <EstadoVazio titulo="Nada a resolver no período" icone={FolderCheck}>Toda venda tem a nota emitida e guardada, ou ficou devolvida inteira.</EstadoVazio>
        ) : (
          <div className="space-y-5">
            {r.semPedido.length > 0 && (
              <section aria-label="Vendas sem pedido de nota">
                <h3 className="text-sm font-semibold">Vendas sem pedido de nota{MAIS_ANTIGAS(r.semPedido.length, s.semPedido) ? ` (${MAIS_ANTIGAS(r.semPedido.length, s.semPedido)})` : ""}</h3>
                <p className="text-xs text-suave">Se a nota foi emitida fora do sistema, peça a nota no comprovante da venda e registre a chave: a conciliação fecha.</p>
                <ul className="mt-1 divide-y divide-borda text-sm">
                  {r.semPedido.map((v) => (
                    <li key={v.venda} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                      <span className="min-w-0"><Link href={`/vendas/${v.venda}`} className="font-semibold text-acao">Venda nº {v.numero}</Link>
                        <span className="text-suave"> · {v.loja} · {v.vendedor}</span></span>
                      <span className="numeros shrink-0 text-xs text-suave">{brl(v.valor)} · {haQuanto(v.minutos)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {r.emAndamento.length > 0 && (
              <section aria-label="Pedidos de nota em andamento">
                <h3 className="text-sm font-semibold">Na fila de notas{MAIS_ANTIGAS(r.emAndamento.length, s.emAndamento) ? ` (${MAIS_ANTIGAS(r.emAndamento.length, s.emAndamento)})` : ""}</h3>
                <p className="text-xs text-suave">A emissão e o registro da chave ficam na <Link href="/notas" className="font-semibold text-acao">fila de notas</Link> da loja do turno.</p>
                <ul className="mt-1 divide-y divide-borda text-sm">
                  {r.emAndamento.map((p) => (
                    <li key={p.pedido} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                      <span className="min-w-0"><Link href={`/vendas/${p.venda}`} className="font-semibold text-acao">Venda nº {p.numero}</Link>
                        <span className="text-suave"> · {p.loja} · <span className="numeros whitespace-nowrap">{brl(p.valor)}</span></span></span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Selo tom={p.atrasada ? "perigo" : "neutro"}>{haQuanto(p.minutos)}</Selo>
                        <Selo tom={p.situacao === "aprovada" ? "sucesso" : p.situacao === "correcao_solicitada" ? "aviso" : "info"} ponto>{SITUACOES_DA_NOTA[p.situacao]}</Selo>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {r.devolucoesPendentes.length > 0 && (
              <section aria-label="Notas de devolução pendentes">
                <h3 className="text-sm font-semibold">Notas de devolução pendentes{MAIS_ANTIGAS(r.devolucoesPendentes.length, s.devolucoesPendentes) ? ` (${MAIS_ANTIGAS(r.devolucoesPendentes.length, s.devolucoesPendentes)})` : ""}</h3>
                <p className="text-xs text-suave">A venda tinha nota emitida e foi devolvida: a nota de devolução está na fila de notas.</p>
                <ul className="mt-1 divide-y divide-borda text-sm">
                  {r.devolucoesPendentes.map((p) => (
                    <li key={p.pedido} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                      <span className="min-w-0"><Link href={`/vendas/${p.venda}`} className="font-semibold text-acao">Devolução da venda nº {p.numero}</Link>
                        <span className="text-suave"> · {p.loja}</span></span>
                      <span className="flex shrink-0 items-center gap-2"><Selo>{haQuanto(p.minutos)}</Selo><Selo tom="info" ponto>{SITUACOES_DA_NOTA[p.situacao]}</Selo></span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {r.semDocumento.length > 0 && (
              <section aria-label="Notas sem documento guardado">
                <h3 className="text-sm font-semibold">Notas sem o PDF, o XML ou o protocolo</h3>
                <p className="text-xs text-suave">Guarde os arquivos no bloco “Documentos da nota” do comprovante da venda (o PDF também é o que vai ao cliente pelo WhatsApp).</p>
                <ul className="mt-1 divide-y divide-borda text-sm">
                  {r.semDocumento.map((n) => (
                    <li key={n.pedido} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                      <span className="min-w-0"><Link href={`/vendas/${n.venda}`} className="font-semibold text-acao">{n.tipo === "devolucao" ? "Devolução da venda" : "Venda"} nº {n.numero}</Link>
                        <span className="text-suave"> · {[n.loja, documento(n.modelo, n.serie, n.numeroDocumento)].filter(Boolean).join(" · ")}</span></span>
                      <span className="shrink-0 text-xs text-suave">falta: {n.falta.map((f) => NOME_DA_FALTA[f]).join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Cartao>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Cartao titulo="Tempo até a nota" icone={Timer} subtitulo="Da venda ao registro da emissão">
          <ListaDados itens={[
            ["Notas de venda emitidas", numero(r.tempo.emitidas)],
            ["Média", emMinutos(r.tempo.mediaMinutos)],
            ["A mais demorada", emMinutos(r.tempo.maiorMinutos)],
            ["Prazo de alerta da fila", prazo === null ? "sem prazo registrado" : `${numero(prazo)} min`],
            ["Registradas depois do prazo", prazo === null ? "—" : numero(s.foraDoPrazo)],
          ]} />
        </Cartao>
        <Cartao titulo="Documentos guardados" icone={FolderCheck} subtitulo="Das notas emitidas no período (de venda e de devolução)">
          <ListaDados itens={[
            ["Notas emitidas", numero(s.notasEmitidas)],
            ["Sem o PDF", numero(s.semPdf)],
            ["Sem o XML", numero(s.semXml)],
            ["Sem o protocolo", numero(s.semProtocolo)],
          ]} />
        </Cartao>
        <Cartao titulo="Notas de devolução" icone={Undo2} subtitulo="Devoluções de vendas que tinham nota emitida">
          <ListaDados itens={[
            ["Devoluções", numero(s.devolucoes)],
            ["Com a nota emitida", numero(s.devolucoesEmitidas)],
            ["Na fila", numero(s.devolucoesPendentes)],
            ["Sem nota (pedido cancelado)", numero(s.devolucoesCanceladas)],
          ]} />
        </Cartao>
      </div>
    </>
  );
}

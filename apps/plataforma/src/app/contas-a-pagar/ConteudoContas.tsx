import { randomUUID } from "node:crypto";

import { CalendarClock, CalendarRange, CircleCheck, Layers, ReceiptText, Store, Tags, TriangleAlert } from "lucide-react";

import { BarrasHorizontais, Colunas, TabelaDoGrafico } from "../../componentes/graficos";
import { EstadoDoPainel, NOTA } from "../../componentes/paineis-de-vendas";
import { Botao, Cartao, EstadoVazio, FiltroSegmentado, Indicador, Selo } from "../../componentes/ui";
import type { CategoriaDaConta, ContaAPagar, ResumoDasContas } from "../../lib/contas-a-pagar/consulta";
import { LIMITE_DA_LISTA } from "../../lib/contas-a-pagar/consulta";
import {
  dataDoDia, FORMAS, filtroNoEndereco, parcelaDaConta, prazoDaConta, VISOES_DAS_CONTAS,
  type FiltroDasContas, type VisaoDasContas,
} from "../../lib/contas-a-pagar/regras";
import { brl, brlCompacto, brlEixo, diaMes, numero } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";
import { cancelarConta, corrigirConta, desfazerPagamento, lancarConta, pagarConta, salvarCategoria } from "./acoes";

// Contas a pagar da empresa (lote L8a). Só apresentação: o resumo (somado no banco), a lista e as categorias
// chegam lidos por lib/contas-a-pagar/consulta, cada um com o seu estado; falha nunca vira zero nem lista
// vazia. Os formulários chamam as ações, que chamam as funções do banco como a pessoa logada.

const campoEmLinha = "min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const campo = `mt-1 ${campoEmLinha}`;
const rotulo = "text-xs font-medium";
const pilula = "inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-borda bg-white px-3 text-[13px] font-semibold hover:border-borda-forte [&::-webkit-details-marker]:hidden";
const reaisDoCampo = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");
const contas = (n: number) => `${numero(n)} ${n === 1 ? "conta" : "contas"}`;

export type LojaDaConta = { id: string; nome: string };
type Props = {
  resumo: Leitura<ResumoDasContas>;
  lista: Leitura<{ contas: ContaAPagar[]; mais: boolean }>;
  categorias: Leitura<CategoriaDaConta[]>;
  fornecedores: { id: string; nome: string }[] | null;
  visao: VisaoDasContas;
  filtro: FiltroDasContas;
  hoje: string;
  /** Sem o resumo (falha), o formulário oferece só a loja do turno. */
  lojaDoTurno: LojaDaConta;
};

function endereco(visao: VisaoDasContas, filtro: FiltroDasContas) {
  const p = new URLSearchParams();
  if (visao !== "abertas") p.set("ver", visao);
  const loja = filtroNoEndereco(filtro);
  if (loja) p.set("loja", loja);
  const texto = p.toString();
  return texto ? `/contas-a-pagar?${texto}` : "/contas-a-pagar";
}

/** A lista e o filtro de volta, em todo formulário (a ação volta para o mesmo lugar). */
function Volta({ visao, filtro }: { visao: VisaoDasContas; filtro: FiltroDasContas }) {
  return <><input type="hidden" name="ver" value={visao} /><input type="hidden" name="loja" value={filtroNoEndereco(filtro) ?? ""} /></>;
}

export function ConteudoContas({ resumo, lista, categorias, fornecedores, visao, filtro, hoje, lojaDoTurno }: Props) {
  const escopo = resumo.estado === "ok" ? resumo.dados.escopo : null;
  const lojas: LojaDaConta[] = escopo?.lojas ?? [lojaDoTurno];
  const nomeDaLoja = (id: string | null) => (id === null ? "Rede (central)" : lojas.find((l) => l.id === id)?.nome ?? "Outra loja");
  const nomeDaCategoria = (id: string) => (categorias.estado === "ok" ? categorias.dados.find((c) => c.id === id)?.nome : undefined) ?? "Categoria";
  const nomeDoFornecedor = (id: string | null) => (id === null ? null : fornecedores?.find((f) => f.id === id)?.nome ?? null);
  const varias = Boolean(escopo && (escopo.rede || escopo.lojas.length > 1));
  const mostrarLoja = varias && filtro.tipo === "todas";
  const nomes = { nomeDaLoja, nomeDaCategoria, nomeDoFornecedor };

  return (
    <>
      <div className="nao-imprimir mt-4 space-y-2">
        {varias && escopo && (
          <FiltroSegmentado
            rotulo="Onde"
            opcoes={[
              { href: endereco(visao, { tipo: "todas" }), rotulo: "Todas", ativo: filtro.tipo === "todas" },
              ...(escopo.rede ? [{ href: endereco(visao, { tipo: "rede" }), rotulo: "Rede (central)", ativo: filtro.tipo === "rede" }] : []),
              ...escopo.lojas.map((l) => ({ href: endereco(visao, { tipo: "loja", id: l.id }), rotulo: l.nome, ativo: filtro.tipo === "loja" && filtro.id === l.id })),
            ]}
          />
        )}
        <FiltroSegmentado
          rotulo="Situação das contas"
          opcoes={(Object.keys(VISOES_DAS_CONTAS) as VisaoDasContas[]).map((v) => ({
            href: endereco(v, filtro), rotulo: VISOES_DAS_CONTAS[v], ativo: v === visao,
            contagem: v === "abertas" && resumo.estado === "ok" ? resumo.dados.abertas.quantidade : undefined,
          }))}
        />
      </div>

      {resumo.estado !== "ok" ? (
        <Cartao className="mt-4" titulo="Resumo das contas" icone={ReceiptText}>
          <EstadoDoPainel estado={resumo.estado} fonte="contas_a_pagar" tentarDeNovo={endereco(visao, filtro)} />
        </Cartao>
      ) : (
        <PainelDoResumo r={resumo.dados} porLoja={mostrarLoja} nomes={nomes} />
      )}

      {resumo.estado !== "indisponivel" && (
        <Lancamento
          lojas={lojas} rede={escopo?.rede ?? false} categorias={categorias} fornecedores={fornecedores} filtro={filtro} visao={visao} hoje={hoje}
          lojaDoTurno={lojaDoTurno} abrir={resumo.estado === "ok" && resumo.dados.abertas.quantidade === 0 && visao === "abertas"}
        />
      )}

      <ListaDeContas lista={lista} visao={visao} filtro={filtro} hoje={hoje} mostrarLoja={mostrarLoja} nomes={nomes} />

      {escopo?.rede && categorias.estado === "ok" && <Categorias categorias={categorias.dados} visao={visao} filtro={filtro} />}
    </>
  );
}

type Nomes = { nomeDaLoja: (id: string | null) => string; nomeDaCategoria: (id: string) => string; nomeDoFornecedor: (id: string | null) => string | null };

function PainelDoResumo({ r, porLoja, nomes }: { r: ResumoDasContas; porLoja: boolean; nomes: Nomes }) {
  const diferenca = r.pagasNoMes.valorPago - r.pagasNoMes.valor;
  const semanas = r.porSemana.map((s, i) => ({ rotulo: i === 0 ? "Hoje" : diaMes(new Date(`${s.inicio}T12:00:00Z`)), valor: s.valor }));
  const categorias = r.porCategoria.filter((c) => c.aberto > 0);
  const pagasPorCategoria = r.porCategoria.filter((c) => c.pagoNoMes > 0);
  const vencidasPorLoja = r.porLoja.filter((l) => l.vencido > 0);
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador
          rotulo="Vencidas" valor={brlCompacto(r.vencidas.valor)} icone={TriangleAlert} tom={r.vencidas.quantidade > 0 ? "ruim" : "bom"}
          detalhe={r.vencidas.quantidade === 0 ? "Nenhuma conta vencida" : `${contas(r.vencidas.quantidade)} · a mais antiga há ${numero(r.vencidas.maisAntigaDias)} ${r.vencidas.maisAntigaDias === 1 ? "dia" : "dias"}`}
        />
        <Indicador rotulo="Vencem hoje" valor={brlCompacto(r.hojeVencem.valor)} icone={CalendarClock} tom={r.hojeVencem.quantidade > 0 ? "atencao" : "neutro"} detalhe={r.hojeVencem.quantidade === 0 ? "Nada para hoje" : contas(r.hojeVencem.quantidade)} />
        <Indicador rotulo="Próximos 7 dias" valor={brlCompacto(r.proximos7.valor)} icone={CalendarRange} detalhe={`${contas(r.proximos7.quantidade)} · em 30 dias: ${brlCompacto(r.proximos30.valor)}`} />
        <Indicador
          rotulo="Pagas no mês" valor={brlCompacto(r.pagasNoMes.valorPago)} icone={CircleCheck} tom={r.pagasNoMes.quantidade > 0 ? "bom" : "neutro"}
          detalhe={r.pagasNoMes.quantidade === 0 ? "Nenhum pagamento registrado" : `${contas(r.pagasNoMes.quantidade)}${diferenca > 0 ? ` · juros e multas ${brl(diferenca)}` : diferenca < 0 ? ` · descontos ${brl(-diferenca)}` : ""}`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao
          className="xl:col-span-2" titulo="A vencer nas próximas 8 semanas" icone={CalendarRange}
          subtitulo={r.vencidas.quantidade > 0 ? `Em aberto, semana a semana a partir de hoje. Fora do gráfico: ${brl(r.vencidas.valor)} já vencidos.` : "Em aberto, semana a semana a partir de hoje."}
        >
          <Colunas dados={semanas} formatar={brl} formatarEixo={brlEixo} nomeSerie="A pagar na semana" />
          <TabelaDoGrafico colunas={["Semana a partir de", "A pagar"]} linhas={r.porSemana.map((s) => [dataDoDia(s.inicio), brl(s.valor)])} />
        </Cartao>
        <Cartao titulo="Em aberto por categoria" icone={Tags} subtitulo="Do maior para o menor">
          {categorias.length === 0 ? <p className={NOTA}>Nada em aberto.</p> : (
            <BarrasHorizontais nomeSerie="Em aberto" formatar={brl} dados={categorias.map((c) => ({ rotulo: nomes.nomeDaCategoria(c.categoria), valor: c.aberto }))} />
          )}
          {pagasPorCategoria.length > 0 && (
            <p className={`mt-3 border-t border-borda pt-3 ${NOTA}`}>{`Pago no mês: ${pagasPorCategoria.map((c) => `${nomes.nomeDaCategoria(c.categoria)} ${brl(c.pagoNoMes)}`).join(" · ")}.`}</p>
          )}
        </Cartao>
      </div>

      {porLoja && r.porLoja.length > 0 && (
        <Cartao className="mt-4" titulo="Em aberto por loja" icone={Store} subtitulo="A rede (central) e cada loja; em destaque, onde há conta vencida">
          <BarrasHorizontais
            nomeSerie="Em aberto" formatar={brl} duasColunas={r.porLoja.length > 6}
            dados={r.porLoja.map((l) => ({ rotulo: nomes.nomeDaLoja(l.unidade), valor: l.aberto, destaque: l.vencido > 0 }))}
          />
          <p className={`mt-3 border-t border-borda pt-3 ${NOTA}`}>
            {vencidasPorLoja.length === 0 ? "Nada vencido." : `Vencido: ${vencidasPorLoja.map((l) => `${nomes.nomeDaLoja(l.unidade)} ${brl(l.vencido)}`).join(" · ")}.`}
          </p>
        </Cartao>
      )}
    </>
  );
}

function Lancamento({ lojas, rede, categorias, fornecedores, filtro, visao, hoje, lojaDoTurno, abrir }: {
  lojas: LojaDaConta[]; rede: boolean; categorias: Leitura<CategoriaDaConta[]>; fornecedores: { id: string; nome: string }[] | null;
  filtro: FiltroDasContas; visao: VisaoDasContas; hoje: string; lojaDoTurno: LojaDaConta; abrir: boolean;
}) {
  const ativas = categorias.estado === "ok" ? categorias.dados.filter((c) => c.ativa) : [];
  const onde = filtro.tipo === "rede" && rede ? "rede" : filtro.tipo === "loja" && lojas.some((l) => l.id === filtro.id) ? filtro.id
    : lojas.some((l) => l.id === lojaDoTurno.id) ? lojaDoTurno.id : (lojas[0]?.id ?? "rede");
  return (
    <Cartao className="nao-imprimir mt-4" titulo="Lançar conta" icone={ReceiptText} subtitulo="A conta fica registrada para pagar; o pagamento é feito no banco e registrado aqui depois.">
      {categorias.estado !== "ok" ? <EstadoDoPainel estado={categorias.estado} fonte="contas_a_pagar" /> : (
        <details open={abrir} className="group">
          <summary className={`${pilula} border-acao text-acao`}>
            <span aria-hidden className="mr-1 transition-transform group-open:rotate-45">+</span> Nova conta a pagar
          </summary>
          <form action={lancarConta} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="chave" value={randomUUID()} />
            <Volta visao={visao} filtro={filtro} />
            <label className={rotulo}>Onde fica a conta
              <select name="unidade" defaultValue={onde} className={campo}>
                {rede && <option value="rede">Rede (central)</option>}
                {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </label>
            <label className={rotulo}>Categoria
              <select name="categoria" required className={campo}>
                {ativas.map((c) => <option key={c.id} value={c.id}>{c.entraNoResultado === false ? `${c.nome} (fora do resultado)` : c.nome}</option>)}
              </select>
            </label>
            <label className={`${rotulo} sm:col-span-2`}>Descrição<input name="descricao" required minLength={3} maxLength={120} placeholder="Ex.: aluguel de novembro" className={campo} /></label>
            <label className={rotulo}>Valor (R$)<input name="valor" required inputMode="decimal" placeholder="0,00" className={campo} /></label>
            <label className={rotulo}>Vencimento (o primeiro)<input name="vencimento" type="date" required defaultValue={hoje} className={campo} /></label>
            <label className={rotulo}>Como é a conta
              <select name="forma" defaultValue="unica" className={campo}>
                {(Object.keys(FORMAS) as (keyof typeof FORMAS)[]).map((f) => <option key={f} value={f}>{FORMAS[f].nome}</option>)}
              </select>
            </label>
            <label className={rotulo}>Parcelas ou meses<input name="vezes" type="number" min={2} max={36} placeholder="De 2 a 36" className={campo} /></label>
            {fornecedores && fornecedores.length > 0 && (
              <label className={`${rotulo} sm:col-span-2`}>Fornecedor (opcional)
                <select name="fornecedor" defaultValue="" className={campo}>
                  <option value="">Sem fornecedor</option>
                  {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </label>
            )}
            <label className={`${rotulo} sm:col-span-2`}>Documento (opcional)<input name="documento" maxLength={60} placeholder="Nº do boleto ou da nota" className={campo} /></label>
            <ul className={`${NOTA} list-disc space-y-0.5 pl-5 sm:col-span-2 lg:col-span-4`}>
              <li><strong>Parcelada:</strong> {FORMAS.parcelada.explicacao}</li>
              <li><strong>Repete todo mês:</strong> {FORMAS.mensal.explicacao}</li>
            </ul>
            <Botao type="submit" className="sm:col-span-2 lg:col-span-4">Lançar</Botao>
          </form>
        </details>
      )}
    </Cartao>
  );
}

const VAZIO: Record<VisaoDasContas, { titulo: string; texto: string }> = {
  abertas: { titulo: "Nenhuma conta em aberto", texto: "A leitura está funcionando: nada a pagar aqui. Lance uma conta acima." },
  pagas: { titulo: "Nenhuma conta paga nos últimos 60 dias", texto: "Os pagamentos registrados aparecem aqui, com a data, o valor pago e a referência." },
  canceladas: { titulo: "Nenhuma conta cancelada nos últimos 60 dias", texto: "As contas canceladas ficam aqui com o motivo; nada se apaga." },
};
const SUBTITULOS: Record<VisaoDasContas, string> = {
  abertas: "Pelo vencimento, das vencidas para as mais distantes",
  pagas: "Pagamentos registrados nos últimos 60 dias, dos mais recentes",
  canceladas: "Cancelamentos dos últimos 60 dias, com o motivo",
};

function ListaDeContas({ lista, visao, filtro, hoje, mostrarLoja, nomes }: {
  lista: Leitura<{ contas: ContaAPagar[]; mais: boolean }>; visao: VisaoDasContas; filtro: FiltroDasContas; hoje: string; mostrarLoja: boolean; nomes: Nomes;
}) {
  return (
    <Cartao className="mt-4" titulo={`Contas: ${VISOES_DAS_CONTAS[visao].toLowerCase()}`} subtitulo={SUBTITULOS[visao]} icone={Layers}>
      {lista.estado !== "ok" ? <EstadoDoPainel estado={lista.estado} fonte="contas_a_pagar" tentarDeNovo={endereco(visao, filtro)} />
        : lista.dados.contas.length === 0 ? <EstadoVazio titulo={VAZIO[visao].titulo} icone={ReceiptText}>{VAZIO[visao].texto}</EstadoVazio>
        : (
          <>
            <ul className="divide-y divide-borda text-sm">
              {lista.dados.contas.map((c) => <LinhaDaConta key={c.id} c={c} visao={visao} filtro={filtro} hoje={hoje} mostrarLoja={mostrarLoja} nomes={nomes} />)}
            </ul>
            {lista.dados.mais && <p className={`mt-3 ${NOTA}`}>{`Mostrando as ${LIMITE_DA_LISTA} primeiras. Escolha uma loja acima para ver as outras.`}</p>}
          </>
        )}
    </Cartao>
  );
}

function LinhaDaConta({ c, visao, filtro, hoje, mostrarLoja, nomes }: { c: ContaAPagar; visao: VisaoDasContas; filtro: FiltroDasContas; hoje: string; mostrarLoja: boolean; nomes: Nomes }) {
  const parcela = parcelaDaConta(c.forma, c.parcela, c.parcelas);
  const detalhes = [nomes.nomeDaCategoria(c.categoriaId), mostrarLoja ? nomes.nomeDaLoja(c.unidadeId) : null, nomes.nomeDoFornecedor(c.fornecedorId), c.documento ? `doc. ${c.documento}` : null]
    .filter((d): d is string => Boolean(d)).join(" · ");
  const prazo = prazoDaConta(c.vencimento, hoje);
  const diferenca = c.valorPago === null ? 0 : c.valorPago - c.valor;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 flex-[1_1_14rem]">
          <p className="font-semibold">{c.descricao}{parcela && <span className="font-normal text-suave">{` · ${parcela}`}</span>}</p>
          <p className="text-xs text-suave">{detalhes}</p>
        </div>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end sm:gap-0.5">
          <p className="numeros order-2 shrink-0 text-base font-bold sm:order-1">{brl(c.situacao === "paga" && c.valorPago !== null ? c.valorPago : c.valor)}</p>
          {c.situacao === "aberta" && (
            <p className="order-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:order-2 sm:justify-end"><span className="numeros text-suave">{`vence ${dataDoDia(c.vencimento)}`}</span><Selo tom={prazo.tom} ponto>{prazo.rotulo}</Selo></p>
          )}
          {c.situacao === "paga" && c.pagaEm && (
            <p className="numeros order-1 min-w-0 text-xs text-suave sm:order-2">{`paga em ${dataDoDia(c.pagaEm)}`}{diferenca !== 0 && ` · ${diferenca > 0 ? "juros" : "desconto"} ${brl(Math.abs(diferenca))}`}</p>
          )}
          {c.situacao === "cancelada" && c.canceladaEm && (
            <p className="numeros order-1 min-w-0 text-xs text-suave sm:order-2">{`cancelada em ${dataDoDia(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(c.canceladaEm)))}`}</p>
          )}
        </div>
      </div>
      {c.situacao === "paga" && <p className="mt-1 text-xs text-suave">{`Referência: ${c.referencia ?? ""} · vencia ${dataDoDia(c.vencimento)}, valor da conta ${brl(c.valor)}`}</p>}
      {c.situacao === "cancelada" && <p className="mt-1 text-xs text-suave">{`Motivo: ${c.motivoCancelamento ?? ""}`}</p>}

      {visao === "abertas" && c.situacao === "aberta" && (
        <div className="nao-imprimir mt-2 flex flex-wrap gap-2">
          <details className="group open:w-full">
            <summary className={pilula}>Marcar paga</summary>
            <form action={pagarConta} className="mt-2 grid gap-2 rounded-xl border border-borda p-3 sm:grid-cols-4">
              <input type="hidden" name="conta" value={c.id} /><Volta visao={visao} filtro={filtro} />
              <label className={rotulo}>Pago em<input name="pago_em" type="date" required defaultValue={hoje} max={hoje} className={campo} /></label>
              <label className={rotulo}>Valor pago (R$)<input name="valor_pago" required inputMode="decimal" defaultValue={reaisDoCampo(c.valor)} className={campo} /></label>
              <label className={rotulo}>Referência<input name="referencia" required minLength={3} maxLength={80} placeholder="Comprovante ou autenticação" className={campo} /></label>
              <Botao type="submit" tamanho="sm" className="self-end">Registrar</Botao>
            </form>
          </details>
          <details className="group open:w-full">
            <summary className={pilula}>Corrigir</summary>
            <form action={corrigirConta} className="mt-2 grid gap-2 rounded-xl border border-borda p-3 sm:grid-cols-4">
              <input type="hidden" name="conta" value={c.id} /><Volta visao={visao} filtro={filtro} />
              <label className={rotulo}>Valor (R$)<input name="valor" required inputMode="decimal" defaultValue={reaisDoCampo(c.valor)} className={campo} /></label>
              <label className={rotulo}>Vencimento<input name="vencimento" type="date" required defaultValue={c.vencimento} className={campo} /></label>
              <label className={rotulo}>Motivo<input name="motivo" required minLength={3} maxLength={300} placeholder="Ex.: reajuste" className={campo} /></label>
              <Botao type="submit" tamanho="sm" variante="secundario" className="self-end">Corrigir</Botao>
            </form>
          </details>
          <details className="group open:w-full">
            <summary className={pilula}>Cancelar</summary>
            <form action={cancelarConta} className="mt-2 grid gap-2 rounded-xl border border-borda p-3 sm:grid-cols-4">
              <input type="hidden" name="conta" value={c.id} /><Volta visao={visao} filtro={filtro} />
              <label className={`${rotulo} sm:col-span-2`}>Motivo<input name="motivo" required minLength={3} maxLength={300} placeholder="Ex.: lançada em dobro" className={campo} /></label>
              {c.parcela < c.parcelas
                ? <label className="flex items-center gap-2 self-end text-xs font-medium"><input type="checkbox" name="seguintes" value="sim" className="size-4" />{`E as seguintes (até ${c.forma === "parcelada" ? "a parcela" : "o mês"} ${c.parcelas})`}</label>
                : <span />}
              <Botao type="submit" tamanho="sm" variante="perigo" className="self-end">Cancelar conta</Botao>
            </form>
          </details>
        </div>
      )}
      {visao === "pagas" && c.situacao === "paga" && (
        <details className="nao-imprimir group mt-2 open:w-full">
          <summary className={pilula}>Desfazer pagamento</summary>
          <form action={desfazerPagamento} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-borda p-3">
            <input type="hidden" name="conta" value={c.id} /><Volta visao={visao} filtro={filtro} />
            <label className={`${rotulo} min-w-0 flex-1`}>Motivo para desfazer<input name="motivo" required minLength={3} maxLength={300} className={campo} /></label>
            <Botao type="submit" tamanho="sm" variante="secundario">Desfazer</Botao>
          </form>
        </details>
      )}
    </li>
  );
}

function Categorias({ categorias, visao, filtro }: { categorias: CategoriaDaConta[]; visao: VisaoDasContas; filtro: FiltroDasContas }) {
  return (
    <Cartao className="nao-imprimir mt-4" titulo="Categorias das despesas" icone={Tags} subtitulo="Só o dono ajusta. Desativar tira a categoria do lançamento; as contas antigas continuam com ela. Compra de mercadoria fica fora do resultado do mês: vira estoque, e o custo entra quando o item é vendido.">
      <details className="group">
        <summary className={pilula}>{`Ver e ajustar as ${numero(categorias.length)} categorias`}</summary>
        <ul className="mt-2 divide-y divide-borda text-sm">
          {categorias.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
              <form action={salvarCategoria} className="flex min-w-0 flex-[1_1_16rem] items-center gap-2">
                <input type="hidden" name="categoria" value={c.id} /><Volta visao={visao} filtro={filtro} />
                <input name="nome" aria-label="Nome da categoria" required minLength={2} maxLength={60} defaultValue={c.nome} className={`${campoEmLinha} min-w-0 flex-1`} />
                {!c.ativa && <Selo tom="neutro">desativada</Selo>}
                {c.entraNoResultado === false && <Selo tom="neutro">fora do resultado</Selo>}
                <Botao type="submit" tamanho="sm" variante="secundario">Renomear</Botao>
              </form>
              {c.entraNoResultado !== null && (
                <form action={salvarCategoria}>
                  <input type="hidden" name="categoria" value={c.id} /><input type="hidden" name="nome" value={c.nome} />
                  <input type="hidden" name="entra" value={c.entraNoResultado ? "nao" : "sim"} /><Volta visao={visao} filtro={filtro} />
                  <Botao type="submit" tamanho="sm" variante="fantasma">{c.entraNoResultado ? "Tirar do resultado" : "Pôr no resultado"}</Botao>
                </form>
              )}
              <form action={salvarCategoria}>
                <input type="hidden" name="categoria" value={c.id} /><input type="hidden" name="nome" value={c.nome} />
                <input type="hidden" name="ativa" value={c.ativa ? "nao" : "sim"} /><Volta visao={visao} filtro={filtro} />
                <Botao type="submit" tamanho="sm" variante={c.ativa ? "fantasma" : "secundario"}>{c.ativa ? "Desativar" : "Reativar"}</Botao>
              </form>
            </li>
          ))}
        </ul>
        <form action={salvarCategoria} className="mt-3 flex flex-wrap items-end gap-2">
          <Volta visao={visao} filtro={filtro} />
          <label className={`${rotulo} min-w-0 flex-1`}>Nova categoria<input name="nome" required minLength={2} maxLength={60} placeholder="Ex.: Frete e entregas" className={campo} /></label>
          <Botao type="submit" tamanho="sm">Criar categoria</Botao>
          {categorias.some((c) => c.entraNoResultado !== null) && (
            <label className="flex w-full items-center gap-2 text-sm">
              <input type="checkbox" name="entra" value="nao" className="size-4 accent-acao" />
              Fica fora do resultado do mês (compra de mercadoria, empréstimo)
            </label>
          )}
        </form>
      </details>
    </Cartao>
  );
}

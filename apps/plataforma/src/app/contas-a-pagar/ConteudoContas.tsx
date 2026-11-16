import { randomUUID } from "node:crypto";

import { CalendarClock, CalendarRange, CircleCheck, Layers, PackagePlus, Paperclip, ReceiptText, Store, Tags, TriangleAlert } from "lucide-react";

import { FormularioDeArquivo } from "../../componentes/FormularioDeArquivo";
import { BarrasHorizontais, Colunas, TabelaDoGrafico } from "../../componentes/graficos";
import { EstadoDoPainel, NOTA } from "../../componentes/paineis-de-vendas";
import { Botao, Cartao, EstadoVazio, FiltroSegmentado, Indicador, Selo } from "../../componentes/ui";
import type { CategoriaDaConta, ContaAPagar, ResumoDasContas } from "../../lib/contas-a-pagar/consulta";
import { LIMITE_DA_LISTA } from "../../lib/contas-a-pagar/consulta";
import { MAXIMO_DE_DOCUMENTOS, TIPOS_DE_DOCUMENTO, type DocumentoDaConta } from "../../lib/contas-a-pagar/documentos";
import type { EntradaDaConta, LigacoesDasContas } from "../../lib/contas-a-pagar/entradas";
import {
  dataDoDia, FORMAS, filtroNoEndereco, parcelaDaConta, prazoDaConta, VISOES_DAS_CONTAS,
  type FiltroDasContas, type VisaoDasContas,
} from "../../lib/contas-a-pagar/regras";
import { brl, brlCompacto, brlEixo, diaMes, numero } from "../../lib/formato";
import type { Leitura } from "../../lib/leitura-do-banco";
import { tamanhoDoAnexo } from "../../lib/vendas/anexos";
import { cancelarConta, corrigirConta, desfazerPagamento, lancarConta, ligarEntrada, pagarConta, retirarDocumento, salvarCategoria } from "./acoes";

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
  /** FIN-004a: a entrada de cada conta e as compras que podem ser ligadas; nulo: o banco ainda não tem a ligação (some). */
  ligacoes?: Leitura<LigacoesDasContas> | null;
  /** FIN-004a: lançar a conta a partir desta entrada (o formulário vem aberto e preenchido). */
  entradaParaLancar?: EntradaDaConta | null;
  /** FIN-004b: os documentos de cada conta da lista; nulo: o banco ainda não tem os documentos (some). */
  documentos?: Leitura<ReadonlyMap<string, DocumentoDaConta[]>> | null;
};

/** O dia de São Paulo de um instante, no formato da tela ("13/11/2026"). */
const diaDoInstante = (iso: string) => dataDoDia(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso)));
/** O dia e a hora de São Paulo ("13/11/2026, 10:30"). */
const dataHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

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

export function ConteudoContas({ resumo, lista, categorias, fornecedores, visao, filtro, hoje, lojaDoTurno, ligacoes = null, entradaParaLancar = null, documentos = null }: Props) {
  const escopo = resumo.estado === "ok" ? resumo.dados.escopo : null;
  const lojas: LojaDaConta[] = escopo?.lojas ?? [lojaDoTurno];
  const nomeDaLoja = (id: string | null) => (id === null ? "Rede (central)" : lojas.find((l) => l.id === id)?.nome ?? "Outra loja");
  const nomeDaCategoria = (id: string) => (categorias.estado === "ok" ? categorias.dados.find((c) => c.id === id)?.nome : undefined) ?? "Categoria";
  const nomeDoFornecedor = (id: string | null) => (id === null ? null : fornecedores?.find((f) => f.id === id)?.nome ?? null);
  const varias = Boolean(escopo && (escopo.rede || escopo.lojas.length > 1));
  const mostrarLoja = varias && filtro.tipo === "todas";
  // FIN-004a: a entrada como aparece na conta e no formulário: "nº 12 · 13/11/2026 · NF 123 · Fornecedor".
  const rotuloDaEntrada = (e: EntradaDaConta) => [`nº ${e.numero}`, diaDoInstante(e.criadaEm), e.documento, nomeDoFornecedor(e.fornecedorId), mostrarLoja ? nomeDaLoja(e.unidadeId) : null]
    .filter((x): x is string => Boolean(x)).join(" · ");
  const nomes = { nomeDaLoja, nomeDaCategoria, nomeDoFornecedor, rotuloDaEntrada };

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
          lojaDoTurno={lojaDoTurno} abrir={entradaParaLancar !== null || (resumo.estado === "ok" && resumo.dados.abertas.quantidade === 0 && visao === "abertas")}
          entrada={entradaParaLancar} rotuloDaEntrada={rotuloDaEntrada}
        />
      )}

      <ListaDeContas lista={lista} visao={visao} filtro={filtro} hoje={hoje} mostrarLoja={mostrarLoja} nomes={nomes} ligacoes={ligacoes} documentos={documentos} />

      {escopo?.rede && categorias.estado === "ok" && <Categorias categorias={categorias.dados} visao={visao} filtro={filtro} />}
    </>
  );
}

type Nomes = {
  nomeDaLoja: (id: string | null) => string; nomeDaCategoria: (id: string) => string; nomeDoFornecedor: (id: string | null) => string | null;
  rotuloDaEntrada: (e: EntradaDaConta) => string;
};

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

function Lancamento({ lojas, rede, categorias, fornecedores, filtro, visao, hoje, lojaDoTurno, abrir, entrada, rotuloDaEntrada }: {
  lojas: LojaDaConta[]; rede: boolean; categorias: Leitura<CategoriaDaConta[]>; fornecedores: { id: string; nome: string }[] | null;
  filtro: FiltroDasContas; visao: VisaoDasContas; hoje: string; lojaDoTurno: LojaDaConta; abrir: boolean;
  /** FIN-004a: a conta desta entrada de mercadoria (o formulário vem com a loja, o fornecedor e o documento dela). */
  entrada: EntradaDaConta | null; rotuloDaEntrada: (e: EntradaDaConta) => string;
}) {
  const ativas = categorias.estado === "ok" ? categorias.dados.filter((c) => c.ativa) : [];
  const daEntrada = entrada !== null && lojas.some((l) => l.id === entrada.unidadeId) ? entrada : null;
  const onde = daEntrada ? daEntrada.unidadeId : filtro.tipo === "rede" && rede ? "rede" : filtro.tipo === "loja" && lojas.some((l) => l.id === filtro.id) ? filtro.id
    : lojas.some((l) => l.id === lojaDoTurno.id) ? lojaDoTurno.id : (lojas[0]?.id ?? "rede");
  // A categoria da mercadoria (a lista inicial tem "Mercadoria (fornecedor)"), se ainda existir e estiver ativa.
  const mercadoria = daEntrada ? ativas.find((c) => c.nome.toLowerCase().startsWith("mercadoria"))?.id : undefined;
  return (
    <Cartao id="lancar" className="nao-imprimir mt-4 scroll-mt-24" titulo="Lançar conta" icone={ReceiptText} subtitulo="A conta fica registrada para pagar; o pagamento é feito no banco e registrado aqui depois.">
      {categorias.estado !== "ok" ? <EstadoDoPainel estado={categorias.estado} fonte="contas_a_pagar" /> : (
        <details open={abrir} className="group">
          <summary className={`${pilula} border-acao text-acao`}>
            <span aria-hidden className="mr-1 transition-transform group-open:rotate-45">+</span> Nova conta a pagar
          </summary>
          <form action={lancarConta} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="chave" value={randomUUID()} />
            <Volta visao={visao} filtro={filtro} />
            {daEntrada && (
              <>
                <input type="hidden" name="entrada" value={daEntrada.id} />
                <p className="flex items-start gap-2 rounded-xl bg-acao-clara px-3 py-2 text-sm sm:col-span-2 lg:col-span-4">
                  <PackagePlus aria-hidden className="mt-0.5 size-4 shrink-0 text-acao" />
                  <span>{`A conta fica ligada à entrada de mercadoria ${rotuloDaEntrada(daEntrada)}. Confira o valor e o vencimento no boleto ou na nota.`}</span>
                </p>
              </>
            )}
            <label className={rotulo}>Onde fica a conta
              <select name="unidade" defaultValue={onde} className={campo}>
                {rede && <option value="rede">Rede (central)</option>}
                {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </label>
            <label className={rotulo}>Categoria
              <select name="categoria" required defaultValue={mercadoria} className={campo}>
                {ativas.map((c) => <option key={c.id} value={c.id}>{c.entraNoResultado === false ? `${c.nome} (fora do resultado)` : c.nome}</option>)}
              </select>
            </label>
            <label className={`${rotulo} sm:col-span-2`}>Descrição<input name="descricao" required minLength={3} maxLength={120} placeholder="Ex.: aluguel de novembro" defaultValue={daEntrada ? `Mercadoria da entrada nº ${daEntrada.numero}` : undefined} className={campo} /></label>
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
                <select name="fornecedor" defaultValue={daEntrada?.fornecedorId ?? ""} className={campo}>
                  <option value="">Sem fornecedor</option>
                  {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </label>
            )}
            <label className={`${rotulo} sm:col-span-2`}>Documento (opcional)<input name="documento" maxLength={60} placeholder="Nº do boleto ou da nota" defaultValue={daEntrada?.documento ?? undefined} className={campo} /></label>
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

function ListaDeContas({ lista, visao, filtro, hoje, mostrarLoja, nomes, ligacoes, documentos }: {
  lista: Leitura<{ contas: ContaAPagar[]; mais: boolean }>; visao: VisaoDasContas; filtro: FiltroDasContas; hoje: string; mostrarLoja: boolean; nomes: Nomes;
  ligacoes: Leitura<LigacoesDasContas> | null; documentos: Leitura<ReadonlyMap<string, DocumentoDaConta[]>> | null;
}) {
  const lidas = ligacoes?.estado === "ok" ? ligacoes.dados : null;
  const docs = documentos?.estado === "ok" ? documentos.dados : null;
  return (
    <Cartao className="mt-4" titulo={`Contas: ${VISOES_DAS_CONTAS[visao].toLowerCase()}`} subtitulo={SUBTITULOS[visao]} icone={Layers}>
      {lista.estado !== "ok" ? <EstadoDoPainel estado={lista.estado} fonte="contas_a_pagar" tentarDeNovo={endereco(visao, filtro)} />
        : lista.dados.contas.length === 0 ? <EstadoVazio titulo={VAZIO[visao].titulo} icone={ReceiptText}>{VAZIO[visao].texto}</EstadoVazio>
        : (
          <>
            <ul className="divide-y divide-borda text-sm">
              {lista.dados.contas.map((c) => <LinhaDaConta key={c.id} c={c} visao={visao} filtro={filtro} hoje={hoje} mostrarLoja={mostrarLoja} nomes={nomes} ligacoes={lidas} documentos={docs} />)}
            </ul>
            {ligacoes !== null && ligacoes.estado !== "ok" && <p className={`mt-3 ${NOTA}`}>Não deu para ler as entradas de mercadoria ligadas às contas agora; a ligação volta quando o banco responder.</p>}
            {documentos !== null && documentos.estado !== "ok" && <p className={`mt-3 ${NOTA}`}>Não deu para ler os documentos das contas (boletos, notas e comprovantes) agora; eles voltam quando o banco responder.</p>}
            {lista.dados.mais && <p className={`mt-3 ${NOTA}`}>{`Mostrando as ${LIMITE_DA_LISTA} primeiras. Escolha uma loja acima para ver as outras.`}</p>}
          </>
        )}
    </Cartao>
  );
}

function LinhaDaConta({ c, visao, filtro, hoje, mostrarLoja, nomes, ligacoes, documentos }: {
  c: ContaAPagar; visao: VisaoDasContas; filtro: FiltroDasContas; hoje: string; mostrarLoja: boolean; nomes: Nomes; ligacoes: LigacoesDasContas | null;
  documentos: ReadonlyMap<string, DocumentoDaConta[]> | null;
}) {
  const daConta = documentos?.get(c.id) ?? [];
  const parcela = parcelaDaConta(c.forma, c.parcela, c.parcelas);
  // FIN-004a: a entrada de mercadoria da conta (a ligada, se lida; "sem acesso" se o perfil não lê o estoque daquela loja).
  const idDaEntrada = ligacoes?.ligadas.get(c.id) ?? null;
  const entrada = idDaEntrada ? (ligacoes?.entradas.find((e) => e.id === idDaEntrada) ?? null) : null;
  const textoDaEntrada = idDaEntrada === null ? null
    : entrada ? `entrada nº ${entrada.numero}${entrada.estornada ? " (estornada)" : ""}` : "ligada a uma entrada de loja que você não consulta";
  const detalhes = [nomes.nomeDaCategoria(c.categoriaId), mostrarLoja ? nomes.nomeDaLoja(c.unidadeId) : null, nomes.nomeDoFornecedor(c.fornecedorId), c.documento ? `doc. ${c.documento}` : null, textoDaEntrada]
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

      {/* As ações da conta numa fileira de pílulas; a aberta ocupa a linha inteira. Nada disto sai no papel. */}
      <div className="nao-imprimir mt-2 flex flex-wrap gap-2 empty:hidden">
        {visao === "abertas" && c.situacao === "aberta" && (
          <>
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
          </>
        )}
        {ligacoes && c.situacao !== "cancelada" && <LigacaoDaConta c={c} entrada={idDaEntrada} candidatas={ligacoes.entradas} visao={visao} filtro={filtro} nomes={nomes} />}
        {visao === "pagas" && c.situacao === "paga" && (
          <details className="group open:w-full">
            <summary className={pilula}>Desfazer pagamento</summary>
            <form action={desfazerPagamento} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-borda p-3">
              <input type="hidden" name="conta" value={c.id} /><Volta visao={visao} filtro={filtro} />
              <label className={`${rotulo} min-w-0 flex-1`}>Motivo para desfazer<input name="motivo" required minLength={3} maxLength={300} className={campo} /></label>
              <Botao type="submit" tamanho="sm" variante="secundario">Desfazer</Botao>
            </form>
          </details>
        )}
        {documentos && (c.situacao !== "cancelada" || daConta.length > 0) && <DocumentosDaConta c={c} documentos={daConta} visao={visao} filtro={filtro} />}
      </div>
    </li>
  );
}

/**
 * FIN-004b: os documentos da conta (o boleto, a nota do fornecedor, o comprovante do pagamento): abrir (o link é
 * assinado na hora, pela rota), guardar outro (PDF ou foto, até 5 MB, pela rota de envio) e retirar o errado, com
 * motivo. A conta cancelada só mostra os que já tem.
 */
function DocumentosDaConta({ c, documentos, visao, filtro }: { c: ContaAPagar; documentos: readonly DocumentoDaConta[]; visao: VisaoDasContas; filtro: FiltroDasContas }) {
  const vigentes = documentos.filter((d) => d.retiradoEm === null).length;
  const podeGuardar = c.situacao !== "cancelada" && vigentes < MAXIMO_DE_DOCUMENTOS;
  return (
    <details className="group open:w-full">
      <summary className={pilula}><Paperclip className="mr-1.5 size-3.5" aria-hidden />{vigentes > 0 ? `Documentos (${vigentes})` : "Anexar boleto ou nota"}</summary>
      <div className="mt-2 rounded-xl border border-borda p-3">
        {documentos.length === 0
          ? <p className="text-xs text-suave">Nenhum documento guardado. Guarde aqui o boleto, a nota do fornecedor ou o comprovante do pagamento: fica em privado, só para quem gere a conta.</p>
          : (
            <ul className="divide-y divide-borda">
              {documentos.map((d) => {
                const nome = TIPOS_DE_DOCUMENTO[d.tipo];
                return (
                  <li key={d.id} className="space-y-1 py-2 first:pt-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {d.retiradoEm === null
                        ? <a href={`/contas-a-pagar/${c.id}/documentos/${d.id}`} target="_blank" rel="noreferrer" className="font-semibold text-acao">{nome}</a>
                        : <span className="text-suave line-through">{nome}</span>}
                      <span className="numeros text-xs text-suave">{`${d.formato.toUpperCase()} · ${tamanhoDoAnexo(d.bytes)} · ${dataHora(d.enviadoEm)}`}</span>
                      {d.retiradoEm !== null && <Selo tom="neutro">retirado</Selo>}
                    </p>
                    {d.descricao && <p className="text-xs text-suave">{d.descricao}</p>}
                    {d.retiradoEm !== null && <p className="text-xs text-suave">{`Retirado em ${dataHora(d.retiradoEm)}: ${d.motivoRetirada ?? ""}`}</p>}
                    {d.retiradoEm === null && (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-acao">Retirar (documento errado)</summary>
                        <form action={retirarDocumento} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="documento" value={d.id} /><Volta visao={visao} filtro={filtro} />
                          <label className={`${rotulo} min-w-0 flex-1`}>Motivo para retirar<input name="motivo" required minLength={3} maxLength={200} placeholder="Ex.: boleto de outra conta" className={campo} /></label>
                          <Botao type="submit" tamanho="sm" variante="secundario">Retirar</Botao>
                        </form>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        {podeGuardar && (
          <FormularioDeArquivo action={`/contas-a-pagar/${c.id}/documentos`} className="mt-3 grid gap-2 border-t border-borda pt-3 sm:grid-cols-4">
            <Volta visao={visao} filtro={filtro} />
            <label className={rotulo}>Tipo do documento
              <select name="tipo" required defaultValue={c.situacao === "paga" ? "comprovante_pagamento" : "boleto"} className={campo}>
                {(Object.keys(TIPOS_DE_DOCUMENTO) as (keyof typeof TIPOS_DE_DOCUMENTO)[]).map((tipo) => <option key={tipo} value={tipo}>{TIPOS_DE_DOCUMENTO[tipo]}</option>)}
              </select>
            </label>
            <label className={rotulo}>Descrição <span className="font-normal text-suave">(no &quot;Outro&quot;)</span><input name="descricao" maxLength={120} className={campo} /></label>
            <label className={`${rotulo} sm:col-span-2`}>Arquivo: PDF ou foto, até 5 MB
              <input type="file" name="arquivo" required accept="application/pdf,image/jpeg,image/png,image/webp" className={`${campo} py-2`} />
            </label>
            <div className="sm:col-span-4"><Botao type="submit" tamanho="sm" enquanto="Enviando o arquivo…">Guardar o documento</Botao></div>
          </FormularioDeArquivo>
        )}
        {c.situacao !== "cancelada" && !podeGuardar && <p className={`mt-3 ${NOTA}`}>{`A conta já tem ${MAXIMO_DE_DOCUMENTOS} documentos: retire um errado para guardar outro.`}</p>}
      </div>
    </details>
  );
}

/**
 * FIN-004a: ligar a conta à entrada de mercadoria de origem (as compras registradas da mesma loja e, se a conta tem, do
 * mesmo fornecedor; a conta da rede, de qualquer loja), ou desligar. O banco confere tudo de novo e liga o lançamento
 * inteiro (todas as parcelas).
 */
function LigacaoDaConta({ c, entrada, candidatas, visao, filtro, nomes }: {
  c: ContaAPagar; entrada: string | null; candidatas: readonly EntradaDaConta[]; visao: VisaoDasContas; filtro: FiltroDasContas; nomes: Nomes;
}) {
  if (entrada !== null) {
    return (
      <details className="group open:w-full">
        <summary className={pilula}>Desligar da entrada</summary>
        <form action={ligarEntrada} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-borda p-3">
          <input type="hidden" name="conta" value={c.id} /><input type="hidden" name="entrada" value="" /><Volta visao={visao} filtro={filtro} />
          <label className={`${rotulo} min-w-0 flex-1`}>Motivo para desligar<input name="motivo" required minLength={3} maxLength={300} placeholder="Ex.: ligada à entrada errada" className={campo} /></label>
          <Botao type="submit" tamanho="sm" variante="secundario">Desligar</Botao>
        </form>
      </details>
    );
  }
  const opcoes = candidatas.filter((e) => !e.estornada && (c.unidadeId === null || e.unidadeId === c.unidadeId) && (c.fornecedorId === null || e.fornecedorId === c.fornecedorId));
  if (opcoes.length === 0) return null;
  return (
    <details className="group open:w-full">
      <summary className={pilula}>Ligar à entrada</summary>
      <form action={ligarEntrada} className="mt-2 grid gap-2 rounded-xl border border-borda p-3 sm:grid-cols-4">
        <input type="hidden" name="conta" value={c.id} /><Volta visao={visao} filtro={filtro} />
        <label className={`${rotulo} sm:col-span-2`}>Entrada de mercadoria
          <select name="entrada" required className={campo}>
            {opcoes.map((e) => <option key={e.id} value={e.id}>{nomes.rotuloDaEntrada(e)}</option>)}
          </select>
        </label>
        <label className={rotulo}>Motivo<input name="motivo" required minLength={3} maxLength={300} placeholder="Ex.: boleto da compra" className={campo} /></label>
        <Botao type="submit" tamanho="sm" variante="secundario" className="self-end">Ligar</Botao>
      </form>
    </details>
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

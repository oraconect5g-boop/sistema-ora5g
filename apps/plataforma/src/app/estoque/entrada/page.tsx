import { randomUUID } from "node:crypto";

import { ArrowLeft, ClipboardList, History, PackagePlus, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina, classeBotao } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { CONDICOES, ERROS_DA_ENTRADA, TIPOS_DE_ENTRADA, detalheDoEndereco, type ErroDaEntrada } from "../../../lib/estoque/entrada";
import {
  impedimentosDoEstorno, lerEntradaAberta, lerHistoricoDeEntradas, posicaoDoItem, resumoDasPosicoes,
  type EntradaAberta, type EntradaLida, type HistoricoDeEntradas, type ImpedimentosDoEstorno, type LinhaDaEntrada,
} from "../../../lib/estoque/historico-entradas";
import { brl, numero } from "../../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { estornarEntrada, salvarFornecedor } from "./acoes";
import { FormularioEntrada } from "./FormularioEntrada";

export const metadata: Metadata = { title: "Entrada de mercadoria" };
export const dynamic = "force-dynamic";

const OK = {
  registrada: "Entrada registrada: o estoque e o custo já estão atualizados.",
  repetida: "Esta entrada já tinha sido registrada por este formulário: nada foi duplicado.",
  estornada: "Entrada estornada: os itens saíram do estoque pelo livro, com o motivo.",
  ja_estornada: "Esta entrada já estava estornada.",
  fornecedor: "Fornecedor cadastrado.",
} as const;
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");

/** Entradas por página do histórico (o banco aceita até 50). */
const POR_PAGINA = 20;
/** Linhas que cabem no resumo de cada entrada do histórico; o resto fica no detalhe. */
const LINHAS_NO_RESUMO = 6;
/** Até quantos IMEI/ICCID a linha do detalhe já abre mostrando; acima disso, abre no toque. */
const IDS_ABERTOS = 12;
/** Número de entrada ou de página vindo do endereço: só dígitos, sem zero à esquerda. */
const NUMERO = /^[1-9]\d{0,11}$/;
const ouNulo = <T,>(valor: T | null) => valor as unknown as T;

const tipoDaEntrada = (tipo: string) => (Object.hasOwn(TIPOS_DE_ENTRADA, tipo) ? TIPOS_DE_ENTRADA[tipo as keyof typeof TIPOS_DE_ENTRADA] : tipo);
const condicaoDaLinha = (condicao: string) => (Object.hasOwn(CONDICOES, condicao) ? CONDICOES[condicao as keyof typeof CONDICOES] : condicao);
const origemDaEntrada = (e: EntradaLida) => `${tipoDaEntrada(e.tipo)}${e.fornecedor ? ` · ${e.fornecedor}` : ""}${e.documento ? ` · ${e.documento}` : ""}`;
/** Custo só para quem o banco disse que vê (custo.ver): escondido não é zero, e "não informado" não é escondido. */
const custoTotal = (veCusto: boolean, total: number | null) => (!veCusto ? "" : total === null ? " · sem custo informado" : ` · custo ${brl(total)}`);

function resumoDasLinhas(e: EntradaLida): string {
  const partes = e.itens.slice(0, LINHAS_NO_RESUMO).map((l) => `${l.sku} × ${numero(l.quantidade)}${l.condicao !== "novo" ? ` (${condicaoDaLinha(l.condicao)})` : ""}`);
  const resto = e.itens.length - partes.length;
  return `${partes.join(", ")}${resto > 0 ? ` e mais ${resto} linha(s)` : ""}`;
}

/** Onde o banco recusou (linha, SKU, IMEI/ICCID), já conferido no formato; nulo quando a recusa não disse. */
function ondeDoErro(erro: ErroDaEntrada, onde: ReturnType<typeof detalheDoEndereco>, doEstorno: boolean): string | null {
  const partes = [
    onde.linha ? `linha ${onde.linha} ${doEstorno ? "da entrada" : "do formulário"}` : null,
    onde.sku ? (erro === "outra_variacao" ? `variação original: SKU ${onde.sku}` : `SKU ${onde.sku}`) : null,
    onde.id ? `IMEI/ICCID ${onde.id}` : null,
  ].filter((p): p is string => p !== null);
  return partes.length > 0 ? `Onde: ${partes.join(" · ")}.` : null;
}

function textoDosImpedimentos(i: ImpedimentosDoEstorno): string {
  const partes: string[] = [];
  if (i.identificadores.length > 0) {
    const primeiros = i.identificadores.slice(0, 5).map((x) => `${x.identificador} (${posicaoDoItem(x.situacao)})`).join(", ");
    const resto = i.identificadores.length - 5;
    partes.push(`${i.identificadores.length} IMEI/ICCID fora do estoque livre desta loja: ${primeiros}${resto > 0 ? ` e mais ${resto}` : ""}.`);
  }
  for (const q of i.quantidades) partes.push(`SKU ${q.sku}: entraram ${numero(q.entrou)}, livres hoje ${numero(q.livre)}.`);
  return `${partes.join(" ")} Quem decide é o banco, que confere de novo na hora do estorno.`;
}

// As partes da tela abaixo são funções comuns (não componentes): devolvem o JSX já montado, para a
// página continuar sendo uma árvore só, legível de ponta a ponta nos testes.

function linhaDoDetalhe(l: LinhaDaEntrada, veCusto: boolean, estornada: boolean, destaque: string | null) {
  const ids = l.identificadores ?? [];
  const custo = !veCusto ? "" : l.custoUnitario !== null ? ` · custo unitário ${brl(l.custoUnitario)}` : " · sem custo informado";
  return (
    <li key={l.linha} className="space-y-1.5 py-3">
      <p className="font-semibold">{`${l.linha}. ${l.nome}`}</p>
      <p className="text-xs text-suave">{`SKU ${l.sku} · ${numero(l.quantidade)} unidade(s) · ${condicaoDaLinha(l.condicao)}${custo}${l.reentradas > 0 ? ` · ${l.reentradas} reentrada(s)` : ""}`}</p>
      {ids.length > 0 && (
        <details open={ids.length <= IDS_ABERTOS || (destaque !== null && ids.some((i) => i.identificador === destaque))}>
          <summary className="flex min-h-9 cursor-pointer items-center text-xs font-semibold text-acao">{`${ids.length} IMEI/ICCID · hoje: ${resumoDasPosicoes(ids)}`}</summary>
          <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
            {ids.map((i) => (
              <li key={i.identificador} className={`flex flex-wrap items-center gap-1.5 rounded-botao border px-2.5 py-1.5 ${i.identificador === destaque ? "border-perigo bg-perigo-clara" : "border-borda"}`}>
                <span className="numeros break-all text-xs font-semibold">{i.identificador}</span>
                <Selo tom={estornada ? "neutro" : i.livre ? "sucesso" : "aviso"}>{posicaoDoItem(i.situacao)}</Selo>
                {i.reentrada && <Selo tom="info">reentrada</Selo>}
                {i.identificador === destaque && <Selo tom="perigo">recusado</Selo>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {l.saldoLivre !== null && <p className="text-xs text-suave">{`Saldo livre desta variação hoje, nesta loja: ${numero(l.saldoLivre)}`}</p>}
    </li>
  );
}

/** A entrada aberta: o que entrou, linha por linha, com a posição de HOJE de cada IMEI/ICCID, e o estorno. */
function blocoDaEntrada(e: EntradaAberta, destaque: string | null, fechar: string) {
  const estornada = e.situacao === "estornada";
  const impedimentos = estornada ? null : impedimentosDoEstorno(e);
  const informouCusto = e.itens.some((l) => l.custoUnitario !== null);
  return (
    <Cartao id="entrada" className="mt-4 scroll-mt-24" titulo={`Entrada nº ${e.numero}`} subtitulo={origemDaEntrada(e)} icone={ClipboardList}
      acao={<Selo tom={estornada ? "perigo" : "sucesso"}>{estornada ? "estornada" : "registrada"}</Selo>}>
      <p className="text-sm text-suave">{`Registrada em ${quando(e.criadoEm)}${e.criadoPor ? ` por ${e.criadoPor}` : ""} · ${numero(e.totalUnidades)} unidade(s)${e.veCusto ? custoTotal(true, e.totalCusto) : " · custo oculto para o seu perfil"}`}</p>
      {estornada && (
        <Aviso tom="perigo" className="mt-3" titulo={`Estornada${e.estornadoEm ? ` em ${quando(e.estornadoEm)}` : ""}${e.estornadoPor ? ` por ${e.estornadoPor}` : ""}`}>
          {`Motivo: ${e.motivoEstorno ?? "não informado"}. As posições abaixo são as de hoje: um item desta entrada pode ter voltado ao estoque por outra entrada.`}
        </Aviso>
      )}
      <ol className="mt-2 divide-y divide-borda text-sm">
        {e.itens.map((l) => linhaDoDetalhe(l, e.veCusto, estornada, destaque))}
      </ol>
      {impedimentos && (
        <div className="border-t border-borda pt-4">
          <h3 className="text-sm font-bold">Estornar esta entrada</h3>
          <p className="mt-1 text-xs text-suave">O estorno tira do estoque tudo o que esta entrada trouxe, pelo livro e com o motivo. Só passa se cada item ainda estiver livre nesta loja (nada vendido, reservado ou transferido).</p>
          {(impedimentos.identificadores.length > 0 || impedimentos.quantidades.length > 0) && (
            <Aviso tom="aviso" className="mt-3" titulo="Hoje o banco recusaria este estorno">{textoDosImpedimentos(impedimentos)}</Aviso>
          )}
          {(!e.veCusto || informouCusto) && (
            <p className="mt-2 text-xs text-suave">
              {e.veCusto
                ? "O estorno não desfaz o custo: o custo informado nesta entrada continua sendo o custo atual da variação até uma nova entrada ou importação informar outro."
                : "O estorno não desfaz o custo: se esta entrada informou custo, ele continua valendo até uma nova entrada ou importação informar outro."}
            </p>
          )}
          <form action={estornarEntrada} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input type="hidden" name="entrada" value={e.id} />
            <input name="motivo" required minLength={3} maxLength={200} placeholder="Motivo (ex.: lançada na loja errada)" aria-label="Motivo do estorno" className={campo} />
            <Botao type="submit" variante="perigo" className="self-end">Estornar</Botao>
          </form>
        </div>
      )}
      <p className="mt-3"><Link href={fechar} className="inline-flex min-h-10 items-center text-sm font-semibold text-acao">Fechar esta entrada</Link></p>
    </Cartao>
  );
}

/** Histórico completo da loja, paginado pelo número da entrada; nulo = o perfil não consulta o estoque daqui. */
function blocoDoHistorico(h: HistoricoDeEntradas | null, antes: number | null, aberta: string | null) {
  const pagina = antes !== null ? `&antes=${antes}` : "";
  return (
    <Cartao id="historico" className="mt-4 scroll-mt-24" titulo="Entradas desta loja" icone={History}
      subtitulo={h ? `${numero(h.total)} entrada(s) no total${h.veCusto ? "" : " · custo oculto para o seu perfil"}` : "sem permissão de consulta"}>
      {h === null ? (
        <Aviso tom="aviso" titulo="Histórico indisponível para o seu perfil">
          O seu perfil recebe mercadoria, mas não tem a permissão de consultar o estoque desta loja. O formulário de entrada continua valendo; para ver e estornar entradas, peça a permissão ao dono.
        </Aviso>
      ) : (
        <>
          <form method="get" action="/estoque/entrada#entrada" className="grid gap-2 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end">
            <label className="block text-sm font-medium">Abrir pelo número<input name="numero" inputMode="numeric" pattern="[0-9]{1,12}" maxLength={12} required placeholder="ex.: 12" className={campo} /></label>
            {antes !== null && <input type="hidden" name="antes" value={antes} />}
            <Botao type="submit" variante="secundario">Abrir</Botao>
          </form>
          <ul className="mt-3 divide-y divide-borda text-sm">
            {h.entradas.map((e) => (
              <li key={e.id} className="space-y-1 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/estoque/entrada?entrada=${e.id}${pagina}#entrada`} className="inline-flex min-h-9 items-center font-semibold text-acao underline-offset-2 hover:underline">{`Entrada nº ${e.numero}`}</Link>
                  <Selo tom={e.situacao === "estornada" ? "perigo" : "sucesso"}>{e.situacao === "estornada" ? "estornada" : "registrada"}</Selo>
                  {e.id === aberta && <Selo tom="info">aberta acima</Selo>}
                </p>
                <p className="text-xs text-suave">{`${origemDaEntrada(e)} · ${quando(e.criadoEm)}${e.criadoPor ? ` · ${e.criadoPor}` : ""}`}</p>
                <p className="text-xs text-suave">{`${numero(e.totalUnidades)} unidade(s)${custoTotal(h.veCusto, e.totalCusto)}: ${resumoDasLinhas(e)}`}</p>
                {e.situacao === "estornada" && e.motivoEstorno && <p className="text-xs text-perigo">{`Estornada: ${e.motivoEstorno}`}</p>}
              </li>
            ))}
            {h.entradas.length === 0 && <li className="py-2 text-suave">{antes !== null ? `Nenhuma entrada anterior à nº ${antes}.` : "Nenhuma entrada ainda nesta loja."}</li>}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-suave">{`Mostrando ${h.entradas.length} de ${numero(h.total)}${antes !== null ? ` · anteriores à nº ${antes}` : ""}`}</p>
            <p className="flex flex-wrap gap-2">
              {antes !== null && <Link href="/estoque/entrada#historico" className={classeBotao("fantasma", "sm")}>Voltar às mais recentes</Link>}
              {h.proxima !== null && <Link href={`/estoque/entrada?antes=${h.proxima}#historico`} className={classeBotao("secundario", "sm")}>Ver anteriores</Link>}
            </p>
          </div>
        </>
      )}
    </Cartao>
  );
}

type Parametros = Partial<Record<"ok" | "erro" | "form" | "entrada" | "numero" | "antes" | "id" | "linha" | "sku", ValorDeParametro>>;

// Entrada de mercadoria (lote L4a: ORA-INV-009, ORA-INV-004, ORA-CAT-008): compra de fornecedor ou carga
// inicial na loja do turno, por quem tem estoque.receber (dono e gerente). O custo da entrada vira o
// custo atual da variação; o estorno devolve tudo pelo livro enquanto os itens estiverem livres.
// Lote R1: o histórico e a entrada aberta vêm das funções estoque_entradas e estoque_entrada, que só
// devolvem custo a quem tem custo.ver (REV-NOV-001); o histórico é completo, paginado, e cada entrada
// abre pelo número ou pelo endereço, inclusive depois de um estorno recusado (REV-NOV-009); a recusa
// aponta a linha e o IMEI/ICCID (REV-NOV-004).
export default async function EntradaDeMercadoria({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DA_ENTRADA, parametros.erro);
  const onde = detalheDoEndereco({ linha: textoDoParametro(parametros.linha), id: textoDoParametro(parametros.id), sku: textoDoParametro(parametros.sku) });
  const entradaDoEndereco = textoDoParametro(parametros.entrada);
  const entradaPedida = ehUuid(entradaDoEndereco) ? entradaDoEndereco : null;
  // Zero à esquerda é de quem digita ("007"): sai antes da conferência.
  const numeroDoEndereco = (textoDoParametro(parametros.numero) ?? "").trim().replace(/^0+(?=\d)/, "");
  const numeroPedido = entradaPedida === null && NUMERO.test(numeroDoEndereco) ? Number(numeroDoEndereco) : null;
  const numeroInvalido = entradaPedida === null && numeroDoEndereco !== "" && numeroPedido === null;
  const antesDoEndereco = textoDoParametro(parametros.antes) ?? "";
  const antes = NUMERO.test(antesDoEndereco) ? Number(antesDoEndereco) : null;

  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;

  const permitido = await supabase.rpc("tem_permissao", { p_permissao: "estoque.receber", p_unidade: unidade });
  if (permitido.error) throw new FalhaDoServico("tem_permissao");
  if (!permitido.data) {
    return (
      <MoldeReal sessao={sessao}>
        <Aviso tom="aviso" className="mt-6">Receber mercadoria é da gerência da loja (dono e gerente). O banco também recusa, mesmo que alguém digite o endereço.</Aviso>
      </MoldeReal>
    );
  }
  const [fornecedores, historico, detalhe] = await Promise.all([
    supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.rpc("estoque_entradas", { p_unidade: unidade, p_limite: POR_PAGINA, ...(antes !== null ? { p_antes: antes } : {}) }),
    entradaPedida !== null || numeroPedido !== null
      ? supabase.rpc("estoque_entrada", { p_unidade: unidade, p_entrada: ouNulo<string>(entradaPedida), p_numero: ouNulo<number>(numeroPedido) })
      : null,
  ]);
  if (fornecedores.error) throw new FalhaDoServico("fornecedores");

  // Sem estoque.consultar nesta loja o banco recusa (42501): é um estado da tela, não uma lista vazia.
  // Qualquer outra recusa, ou resposta fora do formato, é falha: nunca vira "nenhuma entrada".
  const semConsulta = historico.error?.code === "42501" || detalhe?.error?.code === "42501";
  let h: HistoricoDeEntradas | null = null;
  if (!semConsulta) {
    if (historico.error) throw new FalhaDoServico("estoque_entradas");
    h = lerHistoricoDeEntradas(historico.data);
    if (h === null) throw new FalhaDoServico("estoque_entradas");
  }
  let aberta: EntradaAberta | null = null;
  let naoEncontrada = false;
  if (detalhe && !semConsulta) {
    if (detalhe.error?.code === "P0002") naoEncontrada = true;
    else if (detalhe.error) throw new FalhaDoServico("estoque_entrada");
    else {
      aberta = lerEntradaAberta(detalhe.data);
      if (aberta === null) throw new FalhaDoServico("estoque_entrada");
    }
  }

  const reentradas = aberta ? aberta.itens.reduce((soma, l) => soma + l.reentradas, 0) : 0;
  const detalheDoErroNaTela = erro ? ondeDoErro(erro, onde, entradaPedida !== null) : null;
  const fechar = `/estoque/entrada${antes !== null ? `?antes=${antes}` : ""}#historico`;

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/estoque" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Estoque</Link>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Entrada de mercadoria" subtitulo="Compra de fornecedor ou carga inicial. Aparelho e chip entram pelo IMEI/ICCID; acessório por quantidade. Tudo entra numa transação só." />
      {ok && (
        <Aviso tom="sucesso" className="mt-4">
          {`${OK[ok]}${ok === "registrada" && reentradas > 0 ? ` ${reentradas} aparelho(s) ou chip(s) voltaram ao estoque com a mesma identidade (reentrada): o histórico anterior foi preservado.` : ""}`}
        </Aviso>
      )}
      {erro && (detalheDoErroNaTela
        ? <Aviso tom="perigo" className="mt-4" titulo={ERROS_DA_ENTRADA[erro]}>{detalheDoErroNaTela}</Aviso>
        : <Aviso tom="perigo" className="mt-4">{ERROS_DA_ENTRADA[erro]}</Aviso>)}
      {numeroInvalido && (
        <div id="entrada" className="mt-4 scroll-mt-24"><Aviso tom="aviso">Número de entrada inválido: use só os dígitos (ex.: 12).</Aviso></div>
      )}
      {naoEncontrada && (
        <div id="entrada" className="mt-4 scroll-mt-24">
          <Aviso tom="aviso" titulo={`Entrada ${numeroPedido !== null ? `nº ${numeroPedido} ` : ""}não encontrada nesta loja`}>
            A numeração das entradas é da rede inteira, então os números de uma loja pulam. Confira o número no histórico abaixo.
          </Aviso>
        </div>
      )}
      {aberta && blocoDaEntrada(aberta, erro ? onde.id : null, fechar)}

      <Cartao className="mt-4" titulo="Nova entrada" icone={PackagePlus} subtitulo="O custo informado vira o custo atual da variação (último custo). Cada venda guarda o custo que valia quando o item entrou nela.">
        <FormularioEntrada unidade={unidade} chave={`form:${randomUUID()}`} fornecedores={fornecedores.data} />
      </Cartao>

      <details className="mt-4 rounded-cartao border border-borda/80 bg-superficie p-4 shadow-cartao" open={textoDoParametro(parametros.form) === "fornecedor" || fornecedores.data.length === 0}>
        <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-semibold"><Truck aria-hidden className="size-4 text-acao" /> Cadastrar fornecedor</summary>
        <form action={salvarFornecedor} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Nome<input name="nome" required minLength={2} maxLength={120} className={campo} /></label>
          <label className="block text-sm font-medium">CNPJ (opcional)<input name="cnpj" inputMode="numeric" className={campo} /></label>
          <label className="block text-sm font-medium sm:col-span-2">Contato (opcional)<input name="contato" maxLength={200} placeholder="telefone ou e-mail do vendedor" className={campo} /></label>
          <label className="block text-sm font-medium sm:col-span-2">Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={200} placeholder="Fornecedor novo" className={campo} /></label>
          <Botao type="submit" variante="secundario" className="sm:col-span-2">Cadastrar fornecedor</Botao>
        </form>
      </details>

      {blocoDoHistorico(h, antes, aberta?.id ?? null)}
    </MoldeReal>
  );
}

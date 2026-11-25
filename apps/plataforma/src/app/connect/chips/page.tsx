import { randomUUID } from "node:crypto";

import { ArrowLeft, ArrowRightLeft, Cpu, Search, Store, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Indicador, Selo, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import {
  abaixoDoMinimo, buscaDeIccid, chipsQueChegaram, ehErroDaTransferencia, ehErroDosChips, ERROS_DA_TRANSFERENCIA, ERROS_DOS_CHIPS, iccidEmBlocos,
  MAXIMO_DAS_DIVERGENCIAS, NOME_DO_TIPO, NOMES_DOS_TIPOS_DE_TRANSFERENCIA, separarPdvs, SITUACOES_DA_TRANSFERENCIA, situacaoDaLeitura, somar,
  type ChipDaTela, type DivergenciaDaTela, type LeituraDaTela, type PdvDaTela, type TipoDeTransferencia, type TransferenciaDaTela,
} from "../../../lib/connect/chips";
import { agora, numero } from "../../../lib/formato";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { cancelarTransferencia, ligarPdv, pedirTransferencia } from "./acoes";

export const metadata: Metadata = { title: "Chips na Nogle" };
export const dynamic = "force-dynamic";

/** Quantos chips a lista de um PDV mostra; acima disso, a busca pelo ICCID. */
const LIMITE_DA_LISTA = 300;
/** Quantos chips para conferir a tela lista (CONNECT-f). */
const LIMITE_DAS_DIVERGENCIAS = 100;
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", " às");
const diaDoRepasse = (texto: string | null) => (texto && /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10).split("-").reverse().join("/") : null);
const chips = (fisicos: number, esims: number) => `${numero(fisicos)} ${fisicos === 1 ? "físico" : "físicos"} · ${numero(esims)} eSIM`;

type Parametros = {
  pdv?: ValorDeParametro; iccid?: ValorDeParametro; erro?: ValorDeParametro; ok?: ValorDeParametro; numero?: ValorDeParametro;
  erro_transferencia?: ValorDeParametro;
};

// O estoque de chips da Nogle (lote CONNECT-d; ORA-INV-011), SÓ LEITURA. O worker do servidor lê a Nogle a cada 30 minutos,
// das 7h às 22h, e grava no banco; aqui cada um vê pela RLS: o dono, a rede inteira; o administrador, os PDVs e as contagens
// (para ligar cada PDV à loja); quem opera a Ora Connect numa loja, o PDV e os chips dela. A tela não chama a Nogle.
// CONNECT-f: depois de cada leitura, os chips físicos do PDV de cada loja ligada entram no estoque dela pelo ICCID; o dono vê
// aqui os "chips para conferir" (disponíveis no estoque de uma loja e fora do PDV dela na Nogle).
export default async function ChipsDaNogle({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const voltar = <Link href="/connect" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Ora Connect</Link>;
  const liga = permite(sessao, "connect.gerir") || permite(sessao, "integracoes.gerir");
  if (!liga && !permite(sessao, "connect.operar")) {
    return <MoldeReal sessao={sessao}>{voltar}<Aviso tom="aviso" className="mt-4">O estoque de chips da Nogle é de quem opera ou gere a Ora Connect.</Aviso></MoldeReal>;
  }
  const { supabase } = sessao;
  const gereARede = permite(sessao, "connect.gerir");
  const [pdvsLidos, leiturasLidas, lojasLidas, transferenciasLidas, divergenciasLidas] = await Promise.all([
    supabase.from("connect_pdvs").select("pdv_id, nome, cidade, uf, estoque_minimo, unidade_id, ativo, estoque_lido_em, fisicos, esims").order("nome").limit(500),
    supabase.from("connect_leituras_nogle").select("numero, lida_em, pdvs, pdvs_lidos, mvno_fisicos, mvno_esims, falhas").order("lida_em", { ascending: false }).limit(48),
    supabase.from("unidades").select("id, nome, tipo").order("nome").limit(300),
    // CONNECT-e: os pedidos de transferência (a RLS mostra ao dono e ao administrador).
    supabase.from("connect_transferencias_chips")
      .select("id, numero, tipo, pdv_id, iccid, iccid_final, quantidade, motivo, situacao, pedida_em, concluida_em, mensagem, resultado")
      .order("pedida_em", { ascending: false }).limit(20),
    // CONNECT-f: os chips para conferir, só para quem gere a Ora Connect na rede (o banco confere de novo).
    gereARede ? supabase.rpc("connect_chips_divergentes") : Promise.resolve({ data: [] as DivergenciaDaTela[], error: null }),
  ]);
  if (pdvsLidos.error) throw new FalhaDoServico("connect_pdvs");
  if (leiturasLidas.error) throw new FalhaDoServico("connect_leituras_nogle");
  if (lojasLidas.error) throw new FalhaDoServico("unidades");
  if (transferenciasLidas.error) throw new FalhaDoServico("connect_transferencias_chips");
  if (divergenciasLidas.error) throw new FalhaDoServico("connect_chips_divergentes");
  const divergencias = (divergenciasLidas.data ?? []) as DivergenciaDaTela[];
  const transferencias = transferenciasLidas.data as unknown as TransferenciaDaTela[];
  const pdvs = pdvsLidos.data as unknown as PdvDaTela[];
  const leituras = leiturasLidas.data as unknown as LeituraDaTela[];
  const lojas = lojasLidas.data as { id: string; nome: string; tipo: string }[];
  const nomeDaLoja = (id: string) => lojas.find((l) => l.id === id)?.nome;
  const { comLoja, outros } = separarPdvs(pdvs, nomeDaLoja);
  const comLojaAtivos = () => comLoja.filter((p) => p.ativo);
  const ultima = leituras[0];
  const mvno = leituras.find((l) => l.mvno_fisicos !== null && l.mvno_esims !== null);
  const lidaEm = ultima?.lida_em ?? pdvs.map((p) => p.estoque_lido_em).filter((d): d is string => d !== null).sort().at(-1) ?? null;
  const situacao = situacaoDaLeitura(lidaEm, agora());

  // A parte aberta: um PDV (?pdv=), o estoque geral da MVNO (?pdv=mvno) ou, com um PDV só à vista, ele.
  const pedido = textoDoParametro(parametros.pdv);
  const aberto: PdvDaTela | "mvno" | undefined = pedido === "mvno" && mvno ? "mvno" : pdvs.find((p) => String(p.pdv_id) === pedido) ?? (pdvs.length === 1 ? pdvs[0] : undefined);
  let lista: ChipDaTela[] = [];
  if (aberto) {
    const consulta = supabase.from("connect_chips_nogle").select("iccid, pdv_id, tipo, repassado_em, lido_em").order("tipo").order("iccid").limit(LIMITE_DA_LISTA);
    const r = aberto === "mvno" ? await consulta.is("pdv_id", null) : await consulta.eq("pdv_id", aberto.pdv_id);
    if (r.error) throw new FalhaDoServico("connect_chips_nogle");
    lista = r.data as unknown as ChipDaTela[];
  }
  const totalAberto = aberto === "mvno" ? (mvno ? (mvno.mvno_fisicos ?? 0) + (mvno.mvno_esims ?? 0) : 0) : aberto ? aberto.fisicos + aberto.esims : 0;

  // "Onde está o chip?": pelo fim do ICCID, só entre os chips que a pessoa pode ver.
  const busca = buscaDeIccid(textoDoParametro(parametros.iccid));
  let achados: ChipDaTela[] = [];
  if (busca) {
    const r = await supabase.from("connect_chips_nogle").select("iccid, pdv_id, tipo, repassado_em, lido_em").like("iccid", `%${busca}`).order("iccid").limit(20);
    if (r.error) throw new FalhaDoServico("connect_chips_nogle");
    achados = r.data as unknown as ChipDaTela[];
  }
  const ondeEsta = (c: ChipDaTela) => {
    if (c.pdv_id === null) return "no estoque geral da Ora (MVNO), ainda sem PDV";
    const p = pdvs.find((x) => x.pdv_id === c.pdv_id);
    return p?.unidade_id ? `na loja ${nomeDaLoja(p.unidade_id) ?? ""} (PDV ${c.pdv_id})` : `no PDV ${c.pdv_id}${p ? ` (${p.nome})` : ""}`;
  };

  const erro = textoDoParametro(parametros.erro);
  const ok = textoDoParametro(parametros.ok);
  const erroDaTransferencia = textoDoParametro(parametros.erro_transferencia);
  const numeroPedido = textoDoParametro(parametros.numero);
  // Só o dono pede (o banco confere): quem gere a Ora Connect e vê as leituras da rede.
  const pedeTransferencia = gereARede && ultima !== undefined;
  const destinos = [...comLojaAtivos(), ...outros.filter((p) => p.ativo)];
  const nomeDoDestino = (pdv: number) => {
    const p = pdvs.find((x) => x.pdv_id === pdv);
    const loja = p?.unidade_id ? nomeDaLoja(p.unidade_id) : undefined;
    return loja ? `${loja} (PDV ${pdv})` : `${p?.nome ?? "PDV"} (PDV ${pdv})`;
  };
  const nasLojas = somar(comLoja);
  const nosOutros = somar(outros);
  const abaixo = comLoja.filter(abaixoDoMinimo);
  const linha = (p: PdvDaTela & { loja?: string }) => (
    <li key={p.pdv_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="font-semibold">{p.loja ?? p.nome}</p>
        <p className="text-xs text-suave">{p.loja ? `PDV ${p.pdv_id} na Nogle · ${p.nome}` : `PDV ${p.pdv_id}${p.cidade ? ` · ${p.cidade}${p.uf ? `-${p.uf}` : ""}` : ""}`}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="numeros text-sm">{chips(p.fisicos, p.esims)}</span>
        {abaixoDoMinimo(p) && <Selo tom="aviso">{`abaixo do mínimo (${numero(p.estoque_minimo ?? 0)})`}</Selo>}
        {!p.ativo && <Selo tom="perigo">fora da lista da Nogle</Selo>}
        <Link href={`/connect/chips?pdv=${p.pdv_id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-acao">Ver os chips</Link>
      </div>
    </li>
  );

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      {voltar}
      <TituloPagina titulo="Chips na Nogle" subtitulo="O estoque virgem de chips na Nogle, lido pelo servidor a cada 30 minutos, das 7h às 22h" />
      {ok === "ligacao" && <Aviso tom="sucesso" className="mt-4">Ligação salva: fica na auditoria.</Aviso>}
      {ok === "transferencia" && (
        <Aviso tom="sucesso" className="mt-4">
          {`Pedido ${numeroPedido && /^\d+$/.test(numeroPedido) ? `nº ${numeroPedido} ` : ""}registrado: o servidor envia à Nogle em até 1 minuto, uma vez, e confirma pelo estoque do PDV.`}
        </Aviso>
      )}
      {ok === "cancelada" && <Aviso tom="sucesso" className="mt-4">Pedido cancelado: fica na auditoria.</Aviso>}
      {erroDaTransferencia && (
        <Aviso tom="perigo" className="mt-4">{ehErroDaTransferencia(erroDaTransferencia) ? ERROS_DA_TRANSFERENCIA[erroDaTransferencia] : ERROS_DA_TRANSFERENCIA.falha}</Aviso>
      )}
      {erro && <Aviso tom="perigo" className="mt-4">{ehErroDosChips(erro) ? ERROS_DOS_CHIPS[erro] : ERROS_DOS_CHIPS.falha}</Aviso>}
      <Aviso tom={situacao === "em_dia" ? "info" : "aviso"} className="mt-4">
        {situacao === "sem_leitura" || !lidaEm
          ? "O servidor ainda não leu o estoque da Nogle."
          : situacao === "em_dia"
            ? `Última leitura da Nogle: ${quando(lidaEm)}.`
            : `A última leitura da Nogle foi ${quando(lidaEm)}: o servidor não conseguiu ler depois disso, e o que aparece aqui pode estar desatualizado.`}
        {ultima && ultima.falhas > 0 && ` Na última leitura, ${numero(ultima.falhas)} ${ultima.falhas === 1 ? "parte não respondeu" : "partes não responderam"}: ${ultima.falhas === 1 ? "ela mostra" : "elas mostram"} o que foi lido antes.`}
        {" "}A leitura não muda nada na Nogle: só o pedido de transferência do dono move chips, uma vez cada. Os chips físicos do PDV de cada loja
        ligada entram no estoque da loja pelo ICCID, uma vez só, para o vendedor vender o chip certo.
      </Aviso>

      {ultima && (
        <section aria-label="Resumo dos chips na Nogle" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador rotulo="Nas lojas" valor={numero(nasLojas.fisicos + nasLojas.esims)} detalhe={`${chips(nasLojas.fisicos, nasLojas.esims)} · ${numero(comLoja.length)} ${comLoja.length === 1 ? "loja ligada" : "lojas ligadas"}`} />
          <Indicador rotulo="Estoque geral da Ora" valor={mvno ? numero((mvno.mvno_fisicos ?? 0) + (mvno.mvno_esims ?? 0)) : "—"} detalhe={mvno ? `${chips(mvno.mvno_fisicos ?? 0, mvno.mvno_esims ?? 0)} · na MVNO, ainda sem PDV` : "ainda não lido"} />
          <Indicador rotulo="Outros PDVs" valor={numero(nosOutros.fisicos + nosOutros.esims)} detalhe={`${chips(nosOutros.fisicos, nosOutros.esims)} · ${numero(outros.length)} PDVs`} />
          <Indicador rotulo="Abaixo do mínimo" valor={numero(abaixo.length)} tom={abaixo.length > 0 ? "atencao" : "neutro"} detalhe="lojas abaixo do estoque mínimo que a Nogle tem para elas" />
        </section>
      )}

      {pdvs.length === 0 ? (
        <Cartao className="mt-4" titulo="Nenhum PDV da Nogle para mostrar" icone={Store}>
          <p className="text-sm text-suave">
            {`A loja ${sessao.situacao.unidade_nome ?? "do turno"} ainda não está ligada a um PDV da Nogle, ou o servidor ainda não leu o estoque. Quem gere a Ora Connect na rede liga cada PDV à loja nesta tela.`}
          </p>
        </Cartao>
      ) : (
        <>
          {comLoja.length > 0 && (
            <Cartao className="mt-4" titulo="Lojas" subtitulo="Cada loja e o PDV dela na Nogle" icone={Store}>
              <ul className="divide-y divide-borda">{comLoja.map(linha)}</ul>
            </Cartao>
          )}
          {outros.length > 0 && (
            <Cartao className="mt-4" titulo="Outros PDVs" subtitulo="Os PDVs da Nogle que não estão ligados a uma loja (revendas e outros cadastros)">
              <ul className="divide-y divide-borda">{outros.map(linha)}</ul>
            </Cartao>
          )}
          {mvno && (
            <p className="mt-3 text-sm">
              <Link href="/connect/chips?pdv=mvno" className="font-semibold text-acao">Ver o estoque geral da Ora (MVNO)</Link>
            </p>
          )}
        </>
      )}

      {gereARede && ultima && comLoja.length > 0 && (
        <Cartao className="mt-4" id="conferir" titulo="Chips para conferir" icone={TriangleAlert}
          subtitulo="Disponíveis no estoque de uma loja e fora do PDV dela na Nogle: vendidos ou ativados por fora, ou levados para outro PDV">
          {divergencias.length === 0 ? (
            <p className="text-sm text-suave">Nenhum na última leitura: cada chip disponível nas lojas ligadas está no PDV delas na Nogle.</p>
          ) : (
            <>
              <p className="text-sm text-suave">
                {`${divergencias.length >= MAXIMO_DAS_DIVERGENCIAS ? `${numero(MAXIMO_DAS_DIVERGENCIAS)} ou mais` : numero(divergencias.length)} `}
                {divergencias.length === 1 ? "chip. " : "chips. "}
                Nada é apagado: confira na loja. O chip que saiu sem passar pelo caixa sai do estoque pelo inventário da loja; o que foi para
                outra loja, pela transferência.
              </p>
              <ul className="mt-2 divide-y divide-borda text-sm" aria-label="Chips para conferir">
                {divergencias.slice(0, LIMITE_DAS_DIVERGENCIAS).map((d) => (
                  <li key={`${d.unidade_id}:${d.iccid}`} className="py-2">
                    <span className="numeros font-medium">{iccidEmBlocos(d.iccid)}</span>{` · ${nomeDaLoja(d.unidade_id) ?? "loja"} · ${d.onde_na_nogle}`}
                  </li>
                ))}
              </ul>
              {divergencias.length > LIMITE_DAS_DIVERGENCIAS && (
                <p className="mt-2 text-xs text-suave">{`Mostrando ${numero(LIMITE_DAS_DIVERGENCIAS)} de ${numero(divergencias.length)}.`}</p>
              )}
            </>
          )}
        </Cartao>
      )}

      {aberto && (
        <Cartao
          className="mt-4"
          icone={Cpu}
          titulo={aberto === "mvno" ? "Estoque geral da Ora (MVNO)" : `Chips de ${(aberto.unidade_id && nomeDaLoja(aberto.unidade_id)) ?? aberto.nome}`}
          subtitulo={aberto === "mvno"
            ? `Na Nogle, ainda sem PDV · ${mvno ? chips(mvno.mvno_fisicos ?? 0, mvno.mvno_esims ?? 0) : ""}`
            : `PDV ${aberto.pdv_id} na Nogle · ${chips(aberto.fisicos, aberto.esims)}${aberto.estoque_lido_em ? ` · lido ${quando(aberto.estoque_lido_em)}` : ""}`}
        >
          {lista.length === 0 ? (
            <p className="text-sm text-suave">{totalAberto > 0 ? "A lista dos chips é de quem gere a Ora Connect na rede ou opera esta loja." : "Nenhum chip virgem neste PDV na última leitura."}</p>
          ) : (
            <>
              <ul className="divide-y divide-borda text-sm" aria-label="Chips">
                {lista.map((c) => (
                  <li key={c.iccid} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="numeros font-medium">{iccidEmBlocos(c.iccid)}</span>
                    <Selo tom={c.tipo === "esim" ? "info" : "neutro"}>{NOME_DO_TIPO[c.tipo] ?? c.tipo}</Selo>
                    {diaDoRepasse(c.repassado_em) && <span className="text-xs text-suave">{`repassado em ${diaDoRepasse(c.repassado_em)}`}</span>}
                  </li>
                ))}
              </ul>
              {totalAberto > lista.length && <p className="mt-2 text-xs text-suave">{`Mostrando ${numero(lista.length)} de ${numero(totalAberto)}: para achar um chip, use a busca pelo fim do ICCID.`}</p>}
            </>
          )}
          {aberto !== "mvno" && liga && (
            <form action={ligarPdv} className="mt-4 flex flex-wrap items-end gap-2 border-t border-borda pt-4">
              <input type="hidden" name="pdv" value={aberto.pdv_id} />
              <label className="min-w-0 flex-1 text-sm font-medium">Loja ligada a este PDV
                <select name="unidade" defaultValue={aberto.unidade_id ?? ""} className={campo}>
                  <option value="">Nenhuma (PDV de fora)</option>
                  {lojas.filter((l) => l.tipo === "loja_fisica").map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </label>
              <Botao type="submit" variante="secundario">Salvar a ligação</Botao>
            </form>
          )}
        </Cartao>
      )}

      {pedeTransferencia && (
        <Cartao className="mt-4" id="transferir" titulo="Transferir chips" icone={ArrowRightLeft}
          subtitulo="Do estoque geral da Ora na Nogle para uma loja ou PDV; o servidor envia uma vez e confirma pelo estoque do PDV">
          <p className="text-sm text-suave">
            {mvno ? `Livres no estoque geral (última leitura): ${chips(mvno.mvno_fisicos ?? 0, mvno.mvno_esims ?? 0)}. ` : ""}
            Para eSIM, só a quantidade; para um chip, o ICCID; para um lote, o primeiro e o último ICCID (o sistema conta os chips livres no intervalo).
          </p>
          <form action={pedirTransferencia} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="chave" value={randomUUID()} />
            <label className="text-sm font-medium">O que transferir
              <select name="tipo" defaultValue="esim" className={campo}>
                {(Object.keys(NOMES_DOS_TIPOS_DE_TRANSFERENCIA) as TipoDeTransferencia[]).map((tipo) => (
                  <option key={tipo} value={tipo}>{NOMES_DOS_TIPOS_DE_TRANSFERENCIA[tipo]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">Para onde
              <select name="pdv" required defaultValue="" className={campo}>
                <option value="" disabled>Escolha a loja ou o PDV</option>
                {destinos.map((p) => <option key={p.pdv_id} value={p.pdv_id}>{nomeDoDestino(p.pdv_id)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Quantidade de eSIM
              <input name="quantidade" type="number" min={1} max={500} inputMode="numeric" className={campo} />
            </label>
            <label className="text-sm font-medium">ICCID (um chip, ou o primeiro do lote)
              <input name="iccid" inputMode="numeric" autoComplete="off" className={campo} />
            </label>
            <label className="text-sm font-medium">Último ICCID do lote
              <input name="iccid_final" inputMode="numeric" autoComplete="off" className={campo} />
            </label>
            <label className="text-sm font-medium">Motivo (opcional)
              <input name="motivo" maxLength={200} autoComplete="off" className={campo} />
            </label>
            <div className="sm:col-span-2"><Botao type="submit">Pedir a transferência</Botao></div>
          </form>
        </Cartao>
      )}

      {transferencias.length > 0 && (
        <Cartao className="mt-4" titulo="Transferências pedidas" subtitulo="As 20 mais recentes, com o que a Nogle respondeu e o que chegou no PDV">
          <ul className="divide-y divide-borda text-sm" aria-label="Transferências">
            {transferencias.map((tr) => {
              const s = SITUACOES_DA_TRANSFERENCIA[tr.situacao] ?? { rotulo: tr.situacao, tom: "neutro" as const };
              const chegaram = chipsQueChegaram(tr.resultado);
              const nome = NOMES_DOS_TIPOS_DE_TRANSFERENCIA[tr.tipo as TipoDeTransferencia] ?? tr.tipo;
              return (
                <li key={tr.id} className="py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{`Nº ${tr.numero}`}</span>
                    <Selo tom={s.tom}>{s.rotulo}</Selo>
                    <span>{`${tr.quantidade} × ${nome.split(" (")[0]} → ${nomeDoDestino(tr.pdv_id)}`}</span>
                  </p>
                  <p className="mt-1 text-xs text-suave">
                    {`Pedida ${quando(tr.pedida_em)}${tr.iccid ? ` · ICCID ${iccidEmBlocos(tr.iccid)}${tr.iccid_final ? ` até ${iccidEmBlocos(tr.iccid_final)}` : ""}` : ""}${tr.motivo ? ` · ${tr.motivo}` : ""}`}
                  </p>
                  {tr.mensagem && <p className="mt-1 text-xs">{tr.mensagem}</p>}
                  {chegaram.length > 0 && <p className="mt-1 text-xs text-suave">{`Chegaram no PDV: ${chegaram.map((c) => `…${c.slice(-6)}`).join(", ")}`}</p>}
                  {tr.situacao === "registrada" && pedeTransferencia && (
                    <form action={cancelarTransferencia} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="transferencia" value={tr.id} />
                      <label className="text-xs font-medium">Motivo do cancelamento
                        <input name="motivo" required minLength={3} maxLength={200} autoComplete="off" className={campo} />
                      </label>
                      <Botao type="submit" tamanho="sm" variante="perigo">Cancelar o pedido</Botao>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      {pdvs.length > 0 && (
        <Cartao className="mt-4" titulo="Onde está o chip?" subtitulo="Pelo fim do ICCID, entre os chips que você pode ver" icone={Search}>
          <Form action="/connect/chips" prefetch={false} className="flex flex-wrap items-end gap-2" role="search">
            <label className="text-sm font-medium">Fim do ICCID (4 dígitos ou mais)
              <input key={busca ?? ""} name="iccid" inputMode="numeric" pattern="[0-9 ]{4,24}" defaultValue={busca ?? ""} autoComplete="off" className={`${campo} w-56`} />
            </label>
            <Botao type="submit" tamanho="sm" variante="secundario">Buscar</Botao>
          </Form>
          {busca && (achados.length === 0
            ? <p className="mt-3 text-sm text-suave">{`Nenhum chip virgem terminado em ${busca} na última leitura.`}</p>
            : (
              <ul className="mt-3 divide-y divide-borda text-sm" aria-label="Chips achados">
                {achados.map((c) => (
                  <li key={c.iccid} className="py-2">
                    <span className="numeros font-medium">{iccidEmBlocos(c.iccid)}</span>{` · ${NOME_DO_TIPO[c.tipo] ?? c.tipo} · ${ondeEsta(c)}`}
                  </li>
                ))}
              </ul>
            ))}
        </Cartao>
      )}
    </MoldeReal>
  );
}

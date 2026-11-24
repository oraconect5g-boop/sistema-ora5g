import { ArrowLeft, CheckCheck, ListChecks, Scale, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, FiltroSegmentado, Indicador, Selo, TituloPagina } from "../../../../componentes/ui";
import { ehUuid } from "../../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../../lib/acesso/sessao";
import { lerSugestoesDeEstorno, type SugestaoDeEstorno } from "../../../../lib/extratos/estornos";
import {
  ERROS_DOS_EXTRATOS, FILTROS_DO_EXTRATO, LINHAS_POR_PAGINA_DO_EXTRATO, TIPOS_DE_EXTRATO, filtroDoExtrato, lerResumoDoExtrato, nomeDoMeioDoExtrato as nomeDoMeio,
  paginaDoExtrato, type FiltroDoExtrato,
} from "../../../../lib/extratos/regras";
import { brl } from "../../../../lib/formato";
import { CANAIS_DOS_MARKETPLACES } from "../../../../lib/marketplaces/leitura";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../../lib/parametros";
import { conciliarCertas, conciliarLinha, desfazerLinha, ignorarLinha } from "../acoes";
import { DebitoLigado, EstornosDoDebito, type EstornoDaLinha } from "./DebitoDeEstorno";

export const metadata: Metadata = { title: "Extrato" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** O começo do dia em São Paulo (sem horário de verão desde 2019), mais `somar` dias, como instante. */
const comecoDoDia = (dia: string, somar = 0) => {
  const d = new Date(`${dia}T00:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + somar);
  return d.toISOString();
};
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
const OK = {
  importado: "Extrato importado. Nada foi conciliado ainda: confira as sugestões de cada linha.",
  repetido: "Este arquivo já tinha sido importado: é este extrato, com o que já foi conferido.",
  conciliada: "Linha conciliada: o pagamento está conciliado com o líquido e a data do repasse da linha.",
  ja_conciliada: "Esta linha já estava conciliada com este pagamento.",
  certas: "Sugestões certas conciliadas.",
  ignorada: "Linha fora da conta; o motivo ficou na auditoria.",
  desfeita: "Linha de volta à conta; o motivo ficou na auditoria.",
  sem_mudanca: "Nada mudou: a linha já estava assim.",
  // PAY-011a: o débito do extrato e o estorno da venda.
  estorno_confirmado: "Estorno confirmado: este débito ficou como o comprovante dele.",
  estorno_ligado: "Débito ligado ao estorno, que já estava confirmado: ele ficou como a prova.",
  ja_ligado: "Este débito já estava ligado a este estorno.",
  chargeback_marcado: "Débito marcado como chargeback; o motivo ficou na auditoria.",
  chargeback_desmarcado: "Débito desmarcado como chargeback; o motivo ficou na auditoria.",
} as const;
// AUD-c (F21-02): a linha tem um uso só; "repasse" é o recebimento de um repasse de marketplace. PAY-011a: "estorno" é o
// débito do estorno (ou do chargeback) de uma venda.
const SITUACOES = {
  pendente: { nome: "a conferir", tom: "aviso" }, conciliada: { nome: "conciliada", tom: "sucesso" },
  repasse: { nome: "repasse de marketplace", tom: "info" }, estorno: { nome: "estorno de venda", tom: "info" },
  ignorada: { nome: "fora da conta", tom: "neutro" },
} as const;

type Extrato = { id: string; numero: number; unidade_id: string | null; tipo: string; fonte: string; meios: string[]; arquivo: string; periodo_inicio: string; periodo_fim: string; linhas: number; importado_em: string };
type Linha = {
  id: string; numero: number; data: string; valor_centavos: number; taxa_centavos: number | null; liquido_centavos: number | null; data_liquidacao: string | null;
  referencia: string | null; terminal: string | null; descricao: string | null; situacao: keyof typeof SITUACOES; motivo: string | null;
  pagamento: { meio: string; venda: { id: string; numero: number } | null } | null;
  // PAY-011a: o estorno que este débito comprova (o banco de antes da migration não manda).
  confirmou_o_estorno?: boolean | null; chargeback?: boolean | null;
  estorno?: EstornoDaLinha;
};
type RepasseDaLinha = { linha_id: string; canal: string; data_repasse: string };
type SemLinha = { id: string; meio: string; valor_centavos: number; comprovante: string | null; vendas: { id: string; numero: number; concluida_em: string } };
type Sugestao = { linha_id: string; pagamento_id: string; venda_numero: number; meio: string; valor_centavos: number; concluida_em: string; loja: string; terminal: string | null; pela_referencia: boolean };

// O extrato importado (lote EXT-a: ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; ADR-016): o bruto, as taxas, o líquido e o que
// ainda vai cair; cada linha com a situação e, nas que esperam, as vendas sugeridas (mesmo valor, mesmo dia, desta loja e
// dos meios do extrato). Conciliar usa a conciliação de sempre (L7a); tirar da conta e desfazer pedem o motivo.
export default async function ExtratoImportado({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ver?: ValorDeParametro; pagina?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro; conciliadas?: ValorDeParametro; de_fora?: ValorDeParametro }>;
}) {
  const [{ id }, parametros] = await Promise.all([params, searchParams]);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;
  if (!sessao.molde.permissoes.has("pagamento.conciliar")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Conciliar pagamentos é da gerência da loja.</Aviso></MoldeReal>;
  }
  const lido = ehUuid(id)
    ? await supabase.from("extratos").select("id, numero, unidade_id, tipo, fonte, meios, arquivo, periodo_inicio, periodo_fim, linhas, importado_em").eq("id", id).maybeSingle()
    : { data: null, error: null };
  if (lido.error) throw new FalhaDoServico("extratos");
  const extrato = lido.data as Extrato | null;
  if (!extrato) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">{ERROS_DOS_EXTRATOS.nao_encontrado} <Link href="/pagamentos/extratos" className="font-semibold underline">Ver os extratos</Link></Aviso></MoldeReal>;
  }

  const ver = filtroDoExtrato(textoDoParametro(parametros.ver));
  const [resumoLido, loja] = await Promise.all([
    supabase.rpc("extrato_resumo", { p_extrato: extrato.id }),
    extrato.unidade_id ? supabase.from("unidades").select("nome").eq("id", extrato.unidade_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (resumoLido.error) throw new FalhaDoServico("extrato_resumo");
  const resumo = lerResumoDoExtrato(resumoLido.data);
  if (!resumo) throw new FalhaDoServico("extrato_resumo");
  const quantas: Record<FiltroDoExtrato, number> = {
    pendente: resumo.pendentes, conciliada: resumo.conciliadas, repasse: resumo.repasses, estorno: resumo.estornos, ignorada: resumo.ignoradas,
    todas: resumo.pendentes + resumo.conciliadas + resumo.repasses + resumo.estornos + resumo.ignoradas,
  };
  const { pagina, paginas, de } = paginaDoExtrato(textoDoParametro(parametros.pagina), quantas[ver]);

  let consulta = supabase.from("extrato_linhas")
    .select("id, numero, data, valor_centavos, taxa_centavos, liquido_centavos, data_liquidacao, referencia, terminal, descricao, situacao, motivo, confirmou_o_estorno, chargeback, pagamento:venda_pagamentos(meio, venda:vendas(id, numero)), estorno:estornos_externos(numero, venda:vendas(id, numero))")
    .eq("extrato_id", extrato.id);
  if (ver !== "todas") consulta = consulta.eq("situacao", ver);
  const linhasLidas = await consulta.order("numero").range(de, de + LINHAS_POR_PAGINA_DO_EXTRATO - 1);
  if (linhasLidas.error) throw new FalhaDoServico("extrato_linhas");
  const linhas = linhasLidas.data as unknown as Linha[];
  // As sugestões só das linhas desta página que esperam conferência: as vendas de cada crédito pendente e (PAY-011a) os
  // estornos de cada débito pendente. De qual repasse é cada linha de repasse desta página (quem não vê os repasses lê a
  // linha, sem o canal e a data). As três leituras saem juntas.
  const esperando = linhas.filter((l) => l.situacao === "pendente" && l.valor_centavos > 0).map((l) => l.id);
  const debitos = linhas.filter((l) => l.situacao === "pendente" && l.valor_centavos < 0).map((l) => l.id);
  const deRepasse = linhas.filter((l) => l.situacao === "repasse").map((l) => l.id);
  const nada = { data: [], error: null };
  const [sugestoesLidas, estornosLidos, repassesLidos] = await Promise.all([
    esperando.length > 0 ? supabase.rpc("extrato_sugestoes", { p_extrato: extrato.id }).in("linha_id", esperando) : nada,
    debitos.length > 0 ? supabase.rpc("extrato_sugestoes_de_estorno", { p_extrato: extrato.id }).in("linha_id", debitos) : nada,
    deRepasse.length > 0 ? supabase.from("marketplace_repasses").select("linha_id, canal, data_repasse").in("linha_id", deRepasse) : nada,
  ]);
  if (sugestoesLidas.error) throw new FalhaDoServico("extrato_sugestoes");
  if (estornosLidos.error) throw new FalhaDoServico("extrato_sugestoes_de_estorno");
  if (repassesLidos.error) throw new FalhaDoServico("marketplace_repasses");
  const estornosSugeridos = lerSugestoesDeEstorno(estornosLidos.data);
  if (!estornosSugeridos) throw new FalhaDoServico("extrato_sugestoes_de_estorno");
  const estornosDaLinha = new Map<string, SugestaoDeEstorno[]>();
  for (const s of estornosSugeridos) estornosDaLinha.set(s.linha_id, [...(estornosDaLinha.get(s.linha_id) ?? []), s]);
  const repasseDaLinha = new Map(((repassesLidos.data ?? []) as RepasseDaLinha[]).map((r) => [r.linha_id, r]));
  // A diferença no outro sentido (PAY-009): os pagamentos do período, da loja e dos meios do extrato, ainda sem conciliação.
  // Depois de conciliar o que casa, o que sobra aqui é venda que o extrato não confirmou.
  let semLinhaConsulta = supabase.from("venda_pagamentos")
    .select("id, meio, valor_centavos, comprovante, vendas!inner(id, numero, concluida_em)", { count: "exact" })
    .in("meio", extrato.meios).eq("situacao", "confirmado").is("conciliado_em", null).eq("vendas.situacao", "concluida")
    .gte("vendas.concluida_em", comecoDoDia(extrato.periodo_inicio)).lt("vendas.concluida_em", comecoDoDia(extrato.periodo_fim, 1));
  if (extrato.unidade_id) semLinhaConsulta = semLinhaConsulta.eq("vendas.unidade_id", extrato.unidade_id);
  const semLinhaLida = await semLinhaConsulta.order("valor_centavos", { ascending: false }).order("id").limit(50);
  if (semLinhaLida.error) throw new FalhaDoServico("venda_pagamentos");
  const semLinha = semLinhaLida.data as unknown as SemLinha[];
  const sugestoes = new Map<string, Sugestao[]>();
  for (const s of (sugestoesLidas.data ?? []) as unknown as Sugestao[]) sugestoes.set(s.linha_id, [...(sugestoes.get(s.linha_id) ?? []), s]);

  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DOS_EXTRATOS, parametros.erro);
  const numeroDoParametro = (v: ValorDeParametro) => { const t = textoDoParametro(v); return t !== undefined && /^\d{1,6}$/.test(t) ? Number(t) : null; };
  const conciliadas = numeroDoParametro(parametros.conciliadas);
  const deFora = numeroDoParametro(parametros.de_fora);
  const ocultos = <><input type="hidden" name="extrato" value={extrato.id} /><input type="hidden" name="ver" value={ver} /><input type="hidden" name="pagina" value={pagina} /></>;
  const endereco = (filtro: FiltroDoExtrato, p = 1) => `/pagamentos/extratos/${extrato.id}${filtro === "pendente" && p === 1 ? "" : `?${new URLSearchParams({ ...(filtro !== "pendente" ? { ver: filtro } : {}), ...(p > 1 ? { pagina: String(p) } : {}) })}`}`;
  const onde = extrato.unidade_id ? (loja.data as { nome: string } | null)?.nome ?? "Loja" : "Rede";

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <Link href="/pagamentos/extratos" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Extratos</Link>
      <TituloPagina sobretitulo={`${onde} · ${TIPOS_DE_EXTRATO[extrato.tipo as keyof typeof TIPOS_DE_EXTRATO]?.split(" (")[0] ?? extrato.tipo}`} titulo={`Extrato nº ${extrato.numero} · ${extrato.fonte}`}
        subtitulo={`De ${dataCurta(extrato.periodo_inicio)} a ${dataCurta(extrato.periodo_fim)} · ${extrato.linhas} linhas · ${extrato.arquivo} · importado em ${quando(extrato.importado_em)}. Meios: ${extrato.meios.map(nomeDoMeio).join(", ")}.`} />
      {ok && <Aviso tom="sucesso" className="mt-4">{ok === "certas" ? `${conciliadas ?? 0} linhas conciliadas com a única sugestão de cada uma.` : OK[ok]}{ok === "importado" && deFora ? ` ${deFora} linhas do arquivo ficaram de fora (saldo, total ou sem valor).` : ""}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DOS_EXTRATOS[erro]}</Aviso>}

      {/* Venda não é dinheiro recebido (PAY-003 e PAY-010): o bruto, a taxa e o líquido de cada lado. */}
      <section aria-label="Resumo do extrato" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Vendas no extrato (bruto)" valor={brl(resumo.creditos_centavos)} detalhe={`${resumo.creditos} créditos`} icone={Scale} />
        <Indicador rotulo="Taxas" valor={brl(resumo.taxas_centavos)} detalhe="o que a maquininha ou o banco cobrou" />
        <Indicador rotulo="Líquido" valor={brl(resumo.liquido_centavos)} detalhe={resumo.debitos > 0 ? `já descontados ${resumo.debitos} estornos e saídas (${brl(resumo.debitos_centavos)})` : "sem estornos nem saídas"} />
        <Indicador rotulo="Ainda vai cair" valor={brl(resumo.a_cair_centavos)} detalhe="repasse com data futura" tom={resumo.a_cair_centavos > 0 ? "atencao" : "neutro"} />
      </section>

      <Cartao className="mt-4" titulo="Linhas do extrato" icone={ListChecks}
        acao={resumo.pendentes > 0 ? (
          <form action={conciliarCertas}>
            {ocultos}
            <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Conciliando…"><CheckCheck className="size-4" aria-hidden />Conciliar as certas</Botao>
          </form>
        ) : undefined}>
        <p className="mb-3 text-xs text-suave">&quot;Conciliar as certas&quot; concilia cada linha que tem uma sugestão só, que não é sugestão de outra linha, e cujo dinheiro já caiu. As outras ficam para você escolher. O débito de um estorno (ou de um chargeback) é ligado ao estorno da venda, um por um.</p>
        <FiltroSegmentado rotulo="Situação das linhas" opcoes={(Object.keys(FILTROS_DO_EXTRATO) as FiltroDoExtrato[]).map((f) => ({ href: endereco(f), rotulo: FILTROS_DO_EXTRATO[f], ativo: f === ver, contagem: quantas[f] }))} />
        <ul className="mt-3 divide-y divide-borda text-sm">
          {linhas.map((l) => {
            const dela = sugestoes.get(l.id) ?? [];
            const estornosDela = estornosDaLinha.get(l.id) ?? [];
            return (
              <li key={l.id} className="space-y-2 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Linha {l.numero}</span>
                  <span className={`numeros font-semibold ${l.valor_centavos < 0 ? "text-perigo" : ""}`}>{brl(l.valor_centavos)}</span>
                  <span className="numeros text-xs text-suave">
                    {dataCurta(l.data)}
                    {l.taxa_centavos !== null ? ` · taxa ${brl(l.taxa_centavos)}` : ""}
                    {l.liquido_centavos !== null ? ` · líquido ${brl(l.liquido_centavos)}` : ""}
                    {l.data_liquidacao ? ` · cai em ${dataCurta(l.data_liquidacao)}` : ""}
                    {l.referencia ? ` · ${l.referencia}` : ""}{l.terminal ? ` · ${l.terminal}` : ""}{l.descricao ? ` · ${l.descricao}` : ""}
                  </span>
                  <Selo tom={SITUACOES[l.situacao]?.tom ?? "neutro"}>{SITUACOES[l.situacao]?.nome ?? l.situacao}</Selo>
                  {l.situacao === "estorno" && l.chargeback && <Selo tom="perigo">chargeback</Selo>}
                </p>
                {l.situacao === "pendente" && l.valor_centavos > 0 && dela.map((s) => (
                  <form key={s.pagamento_id} action={conciliarLinha} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borda px-3 py-2">
                    {ocultos}<input type="hidden" name="linha" value={l.id} /><input type="hidden" name="pagamento" value={s.pagamento_id} />
                    <span className="numeros text-xs">
                      Venda nº {s.venda_numero} · {nomeDoMeio(s.meio)} · {quando(s.concluida_em)} · {s.loja}{s.terminal ? ` · ${s.terminal}` : ""}
                      {s.pela_referencia && <Selo tom="sucesso" className="ml-2">mesma referência</Selo>}
                    </span>
                    <Botao type="submit" tamanho="sm" enquanto="Conciliando…">Conciliar</Botao>
                  </form>
                ))}
                {l.situacao === "pendente" && l.valor_centavos > 0 && dela.length === 0 && (
                  <p className="text-xs text-suave">Nenhuma venda deste valor no mesmo dia (um dia antes ou depois), nesta loja e nestes meios. Confira a venda; se a linha não é de venda, tire da conta.</p>
                )}
                {l.situacao === "pendente" && l.valor_centavos < 0 && <EstornosDoDebito linha={l.id} sugestoes={estornosDela} ocultos={ocultos} />}
                {l.situacao === "pendente" && (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-acao">Tirar da conta</summary>
                    <form action={ignorarLinha} className="mt-2 flex flex-wrap items-end gap-2">
                      {ocultos}<input type="hidden" name="linha" value={l.id} />
                      <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} placeholder="Tarifa do mês" className={campo} /></label>
                      <Botao type="submit" tamanho="sm" variante="secundario" enquanto="Gravando…">Tirar da conta</Botao>
                    </form>
                  </details>
                )}
                {l.situacao === "conciliada" && (
                  <p className="text-xs">Conciliada com {l.pagamento?.venda ? <Link href={`/vendas/${l.pagamento.venda.id}`} className="font-semibold text-acao">a venda nº {l.pagamento.venda.numero}</Link> : "o pagamento"}{l.pagamento ? ` (${nomeDoMeio(l.pagamento.meio)})` : ""}.</p>
                )}
                {l.situacao === "ignorada" && <p className="text-xs text-suave">Fora da conta: {l.motivo}</p>}
                {l.situacao === "estorno" && <DebitoLigado linha={l.id} estorno={l.estorno ?? null} confirmou={l.confirmou_o_estorno === true} chargeback={l.chargeback === true} ocultos={ocultos} />}
                {l.situacao === "repasse" && (() => {
                  const r = repasseDaLinha.get(l.id);
                  const canal = r && Object.hasOwn(CANAIS_DOS_MARKETPLACES, r.canal) ? CANAIS_DOS_MARKETPLACES[r.canal as keyof typeof CANAIS_DOS_MARKETPLACES] : null;
                  return (
                    <p className="text-xs">
                      {r ? `É o recebimento do repasse ${canal ? `do ${canal}` : "de marketplace"} de ${dataCurta(r.data_repasse)}.` : "É o recebimento de um repasse de marketplace."}
                      {" "}Esta linha não concilia venda nem sai da conta; para soltá-la, desfaça o repasse em{" "}
                      <Link href={r ? `/relatorios/marketplaces/repasses?${new URLSearchParams({ inicio: r.data_repasse, fim: r.data_repasse })}` : "/relatorios/marketplaces/repasses"} className="font-semibold text-acao">Repasses dos marketplaces</Link>.
                    </p>
                  );
                })()}
                {(l.situacao === "conciliada" || l.situacao === "ignorada" || (l.situacao === "estorno" && l.confirmou_o_estorno === false)) && (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-acao">{l.situacao === "conciliada" ? "Desfazer a conciliação" : l.situacao === "estorno" ? "Soltar do estorno" : "Voltar para a conta"}</summary>
                    <form action={desfazerLinha} className="mt-2 flex flex-wrap items-end gap-2">
                      {ocultos}<input type="hidden" name="linha" value={l.id} />
                      <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                      <Botao type="submit" tamanho="sm" variante="fantasma" enquanto="Desfazendo…">Desfazer</Botao>
                    </form>
                  </details>
                )}
              </li>
            );
          })}
          {linhas.length === 0 && <li className="py-2 text-suave">{ver === "pendente" ? "Nenhuma linha esperando: o extrato está conferido." : "Nenhuma linha nesta situação."}</li>}
        </ul>
        {paginas > 1 && (
          <nav aria-label="Páginas das linhas" className="mt-3 flex items-center justify-between gap-2 text-sm">
            {pagina > 1 ? <Link href={endereco(ver, pagina - 1)} className="font-semibold text-acao">Anteriores</Link> : <span />}
            <span className="numeros text-suave">Página {pagina} de {paginas}</span>
            {pagina < paginas ? <Link href={endereco(ver, pagina + 1)} className="font-semibold text-acao">Próximas</Link> : <span />}
          </nav>
        )}
      </Cartao>

      <Cartao className="mt-4" titulo="Vendas do período ainda sem conciliação" icone={TriangleAlert}
        subtitulo={`Cartão e Pix destes meios, de ${dataCurta(extrato.periodo_inicio)} a ${dataCurta(extrato.periodo_fim)}, que nenhum extrato confirmou ainda. Depois de conciliar o que casa, o que sobra aqui é venda que o extrato não trouxe: confira.`}>
        <p className="mb-2 text-sm font-semibold">{semLinhaLida.count ?? semLinha.length} pagamentos{(semLinhaLida.count ?? 0) > semLinha.length ? ` (os ${semLinha.length} maiores abaixo)` : ""}</p>
        <ul className="divide-y divide-borda text-sm">
          {semLinha.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/vendas/${p.vendas.id}`} className="font-semibold text-acao">Venda nº {p.vendas.numero}</Link>
              <span className="numeros text-xs text-suave">{quando(p.vendas.concluida_em)} · {nomeDoMeio(p.meio)} · {brl(p.valor_centavos)}{p.comprovante ? ` · ${p.comprovante}` : ""}</span>
            </li>
          ))}
          {semLinha.length === 0 && <li className="py-2 text-suave">Nenhuma: todo cartão e Pix destes meios no período está conciliado.</li>}
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

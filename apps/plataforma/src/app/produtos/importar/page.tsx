import { ArrowLeft, FileSpreadsheet, FileUp, History, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FormularioDeArquivo } from "../../../componentes/FormularioDeArquivo";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, BotaoLink, Cartao, FiltroSegmentado, Selo, TituloPagina, type Tom } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { TIPOS_DE_PRODUTO } from "../../../lib/catalogo/cadastro";
import { centavosDoBanco } from "../../../lib/dinheiro";
import { brl, numero } from "../../../lib/formato";
import {
  ERROS_DA_IMPORTACAO, FILTROS_DA_CONFERENCIA, LINHAS_POR_PAGINA, linhasDoFiltro, paginaDaConferencia, resumoDoDesfeito, rotuloDoCampo,
  type Desfeito, type FiltroDaConferencia,
} from "../../../lib/importacao/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { aplicarImportacao, descartarImportacao, desfazerImportacao } from "./acoes";
import { EscolherColunas } from "./EscolherColunas";

export const metadata: Metadata = { title: "Importar planilha" };
export const dynamic = "force-dynamic";

const OK = {
  previa: "Prévia gravada. Nada entrou no catálogo ainda: confira e peça a aprovação.",
  previa_partes: "A planilha passa de 2.000 linhas e entrou em várias prévias, uma por parte. Esta é a primeira: confira e aplique cada parte (as outras estão na lista abaixo).",
  previa_repetida: "Este arquivo, com as mesmas colunas, já tinha prévia: é esta, comparada de novo com o cadastro de agora. Nada mudou.",
  previa_atualizada: "Este arquivo já tinha prévia: é esta. O cadastro mudou desde a última comparação e a prévia abaixo já mostra a comparação nova: confira de novo.",
  aplicada: "Importação aplicada no catálogo, numa transação só.",
  ja_aplicada: "Esta importação já estava aplicada.",
  descartada: "Prévia descartada. Nada entrou no catálogo.",
  desfeita: "Importação desfeita: os valores de antes voltaram e as variações que ela criou saíram de circulação.",
  desfeita_parcial: "Importação desfeita em parte: o que mudou depois dela, ou já foi usado, ficou como estava. Veja linha a linha abaixo.",
  ja_desfeita: "Esta importação já estava desfeita.",
} as const;
const SITUACAO: Record<string, { texto: string; tom: "info" | "sucesso" | "neutro" | "aviso" }> = {
  previa: { texto: "prévia", tom: "info" },
  aplicada: { texto: "aplicada", tom: "sucesso" },
  descartada: { texto: "descartada", tom: "neutro" },
  desfeita: { texto: "desfeita", tom: "aviso" },
};
const ACAO: Record<string, { texto: string; tom: Tom }> = {
  criar: { texto: "novo", tom: "info" },
  atualizar: { texto: "muda", tom: "aviso" },
  sem_mudanca: { texto: "igual", tom: "neutro" },
  erro: { texto: "erro", tom: "perigo" },
};
const DESFEITO: Record<"desfeita" | "parcial" | "mantida", { texto: string; tom: Tom }> = {
  desfeita: { texto: "voltou", tom: "sucesso" },
  parcial: { texto: "voltou em parte", tom: "aviso" },
  mantida: { texto: "ficou como estava", tom: "neutro" },
};
const ORDEM_DOS_FILTROS = Object.keys(FILTROS_DA_CONFERENCIA) as FiltroDaConferencia[];
const CAMPOS_DA_IMPORTACAO = "id, numero, arquivo_nome, situacao, totais, mapeamento, criado_por, criado_em, aplicado_em, encerrado_em, motivo, comparacao, comparado_em, desfazer";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "") : "—";
const dinheiro = (v: unknown) => (v === null || v === undefined ? "—" : brl(centavosDoBanco(v)));
const valorDoCampo = (campo: string, v: unknown) => (campo === "preco" || campo === "custo" ? dinheiro(v) : v === null || v === undefined ? "—" : String(v));

type Importacao = {
  id: string; numero: number; arquivo_nome: string; situacao: string; totais: Record<string, number>; mapeamento: {
    colunas?: Record<string, string>; padroes?: { tipo?: string; categoria?: string };
    // REIN-a: a parte da planilha grande e as linhas que ficaram de fora (a de total), gravadas junto com a prévia.
    parte?: { numero?: number; de?: number; linhas?: [number, number] }; ignoradas?: { linha?: number; motivo?: string; decisao?: string }[];
    // F18-02: a última linha que pode ser rodapé, sem prova: foi à prévia, e só sai por decisão de quem envia.
    candidato?: { linha?: number; motivo?: string };
  };
  criado_por: string; criado_em: string; aplicado_em: string | null; encerrado_em: string | null; motivo: string | null;
  comparacao: number; comparado_em: string | null; desfazer: { desfeitas?: number; parciais?: number; mantidas?: number } | null;
};
type LinhaDaImportacao = { numero: number; dados: Record<string, unknown>; acao: string; erros: string[]; diferencas: Record<string, [unknown, unknown]>; desfeito: Desfeito | null };

const preenchido = (v: unknown) => v !== null && v !== undefined && v !== "";
/** O que a linha nova vai gravar, por extenso: a conferência vê tudo o que veio na planilha. */
const doNovo = (d: Record<string, unknown>) => [
  preenchido(d.produto) ? `modelo ${String(d.produto)}` : null,
  TIPOS_DE_PRODUTO[d.tipo as keyof typeof TIPOS_DE_PRODUTO] ?? d.tipo,
  d.categoria, d.marca, d.cor, d.capacidade,
  preenchido(d.codigo_barras) ? `código de barras ${String(d.codigo_barras)}` : null,
  preenchido(d.preco) ? `preço ${dinheiro(d.preco)}` : "sem preço",
  preenchido(d.custo) ? `custo ${dinheiro(d.custo)}` : null,
].filter(preenchido).map(String).join(" · ");

function Motivo({ exemplo }: { exemplo: string }) {
  return <label className="block text-sm font-medium">Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={200} placeholder={exemplo} className={campo} /></label>;
}

// Importação do catálogo por planilha (lotes L3c e R2: ORA-CAT-002, ORA-CAT-010). Quem tem
// importacao.executar (administrador) envia a planilha e gera a prévia; quem tem importacao.aprovar (dono), e
// não gerou a prévia, confere o arquivo inteiro (filtro e páginas), aplica tudo de uma vez ou desfaz depois.
// O formulário de aplicar leva a comparação conferida: se o cadastro mudou depois, o banco não aplica e a
// prévia volta comparada de novo. O formato da Rein não é suposto (pendência B1).
// Custo: as linhas trazem o custo da planilha e o do cadastro. Quem lê esta tela (importacao.executar ou
// importacao.aprovar) tem custo.ver na matriz de papéis, e um teste do banco trava essa combinação.
export default async function Importar({ searchParams }: {
  searchParams: Promise<{ importacao?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro; ver?: ValorDeParametro; pagina?: ValorDeParametro; c?: ValorDeParametro }>;
}) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DA_IMPORTACAO, parametros.erro);
  const escolhida = ehUuid(parametros.importacao) ? parametros.importacao : null;
  const ver: FiltroDaConferencia = chaveDoCatalogo(FILTROS_DA_CONFERENCIA, parametros.ver) ?? "mudancas";
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario } = sessao;

  const executar = permite(sessao, "importacao.executar");
  const aprovar = permite(sessao, "importacao.aprovar");
  if (!executar && !aprovar) {
    return (
      <MoldeReal sessao={sessao}>
        <Cartao titulo="Sem permissão" icone={ShieldAlert}>
          <p className="text-sm text-suave">A importação é do administrador (envia a planilha) e do dono (aprova). O banco também recusa, mesmo que alguém digite o endereço.</p>
        </Cartao>
      </MoldeReal>
    );
  }

  const [lista, atual, categorias] = await Promise.all([
    supabase.from("importacoes").select(CAMPOS_DA_IMPORTACAO).order("criado_em", { ascending: false }).limit(20),
    escolhida ? supabase.from("importacoes").select(CAMPOS_DA_IMPORTACAO).eq("id", escolhida).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("categorias").select("nome").eq("ativa", true).order("nome"),
  ]);
  if (lista.error || atual.error || categorias.error) throw new FalhaDoServico("importacoes");
  const imp = atual.data as unknown as Importacao | null;
  const minhaPrevia = imp?.criado_por === usuario.id;

  // As linhas vêm DEPOIS da importação e por página (R2: REV-NOV-008). A comparação que vai no formulário
  // de aplicar é a lida acima: se o cadastro mudar entre as duas leituras, as linhas mostradas são de uma
  // comparação mais nova que a do formulário, e o banco recusa aplicar em vez de aplicar o que não foi visto.
  const noFiltro = imp ? linhasDoFiltro(imp.totais, ver) : 0;
  const { pagina, paginas, de } = paginaDaConferencia(textoDoParametro(parametros.pagina), noFiltro);
  let detalhes: LinhaDaImportacao[] = [];
  if (imp) {
    let consulta = supabase.from("importacao_linhas").select("numero, dados, acao, erros, diferencas, desfeito").eq("importacao_id", imp.id);
    if (ver === "mudancas") consulta = consulta.neq("acao", "sem_mudanca");
    else if (ver !== "todas") consulta = consulta.eq("acao", ver);
    const linhas = await consulta.order("numero").range(de, de + LINHAS_POR_PAGINA - 1);
    if (linhas.error) throw new FalhaDoServico("importacao_linhas");
    detalhes = (linhas.data ?? []) as unknown as LinhaDaImportacao[];
  }
  // Quem confere em várias páginas leva nos links a comparação em que estava (c). Se a prévia for comparada de
  // novo no meio da conferência (o mesmo arquivo enviado outra vez, ou uma tentativa de aplicar que voltou), a
  // página seguinte avisa e não oferece o formulário de aplicar: o que já tinha sido visto pode ter mudado.
  const conferida = textoDoParametro(parametros.c);
  const comparacaoMudou = imp?.situacao === "previa" && conferida !== undefined && /^[1-9]\d{0,8}$/.test(conferida) && Number(conferida) !== imp.comparacao;
  const endereco = (para: { ver?: FiltroDaConferencia; pagina?: number }) => {
    const busca = new URLSearchParams();
    if (imp) busca.set("importacao", imp.id);
    if (imp?.situacao === "previa") busca.set("c", String(imp.comparacao));
    const filtro = para.ver ?? ver;
    if (filtro !== "mudancas") busca.set("ver", filtro);
    if (para.pagina && para.pagina > 1) busca.set("pagina", String(para.pagina));
    return `/produtos/importar?${busca}`;
  };

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/produtos" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Cadastro de produtos</Link>
      <TituloPagina titulo="Importar planilha" subtitulo="Produtos, variações, preços e custos por planilha (Excel ou CSV). Primeiro uma prévia, sem mexer no catálogo; outra pessoa confere e aplica tudo de uma vez."
        acao={<BotaoLink href="/estoque/carga" tamanho="sm" variante="secundario">Estoque de cada loja</BotaoLink>} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_IMPORTACAO[erro]}</Aviso>}

      {imp && (
        <Cartao className="mt-4" titulo={<span className="flex flex-wrap items-center gap-2">Importação nº {imp.numero}<Selo tom={SITUACAO[imp.situacao]?.tom ?? "neutro"}>{SITUACAO[imp.situacao]?.texto ?? imp.situacao}</Selo></span>}
          subtitulo={[
            imp.arquivo_nome,
            `prévia em ${quando(imp.criado_em)}`,
            imp.comparado_em ? `comparada de novo em ${quando(imp.comparado_em)} (comparação nº ${imp.comparacao})` : null,
            imp.aplicado_em ? `aplicada em ${quando(imp.aplicado_em)}` : null,
            imp.situacao === "desfeita" && imp.encerrado_em ? `desfeita em ${quando(imp.encerrado_em)}` : null,
            imp.situacao === "descartada" && imp.encerrado_em ? `descartada em ${quando(imp.encerrado_em)}` : null,
            imp.motivo,
          ].filter(Boolean).join(" · ")} icone={FileSpreadsheet}>
          <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {([["Novos", imp.totais.criar], ["Mudam", imp.totais.atualizar], ["Iguais", imp.totais.sem_mudanca], ["Com erro", imp.totais.erro]] as const).map(([nome, n]) => (
              <div key={nome} className="rounded-xl bg-fundo px-2 py-2"><dt className="text-xs text-suave">{nome}</dt><dd className={`numeros text-xl font-bold ${nome === "Com erro" && n ? "text-perigo" : ""}`}>{n ?? 0}</dd></div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-suave">
            {imp.totais.categorias_novas ? `${imp.totais.categorias_novas} categoria(s) nova(s) · ` : ""}{imp.totais.marcas_novas ? `${imp.totais.marcas_novas} marca(s) nova(s) · ` : ""}
            Colunas: {Object.entries(imp.mapeamento.colunas ?? {}).map(([c, nome]) => `${rotuloDoCampo(c)} = "${nome}"`).join("; ")}
          </p>
          {imp.mapeamento.parte?.numero && imp.mapeamento.parte.de && (
            <p className="mt-1 text-xs font-medium">Parte {imp.mapeamento.parte.numero} de {imp.mapeamento.parte.de}{imp.mapeamento.parte.linhas ? ` (linhas ${imp.mapeamento.parte.linhas[0]} a ${imp.mapeamento.parte.linhas[1]} da planilha)` : ""}: cada parte se confere e se aplica à parte.</p>
          )}
          {(imp.mapeamento.ignoradas ?? []).map((ig) => (
            <p key={`${ig.linha}`} className="mt-1 text-xs text-aviso">Ficou de fora a linha {ig.linha} da planilha: {ig.motivo}.</p>
          ))}
          {typeof imp.mapeamento.candidato?.linha === "number" && (
            <Aviso tom="aviso" className="mt-3" titulo={`Confira a linha ${imp.mapeamento.candidato.linha} da planilha`}>
              {`${imp.mapeamento.candidato.motivo ?? "a última linha pode ser um rodapé"}. Ela está na prévia como linha com erro (sem código e sem nome). Se for um item, complete a planilha; se for rodapé, envie o arquivo de novo marcando "deixar de fora a última linha": a decisão fica registrada na prévia.`}
            </Aviso>
          )}

          {imp.situacao === "previa" && Boolean(imp.totais.erro) && (
            <Aviso tom="perigo" className="mt-3" titulo={`${numero(imp.totais.erro ?? 0)} linha(s) com erro: corrija a planilha e gere outra prévia`}>
              {ver === "erro"
                ? "As linhas com erro estão abaixo, com o motivo de cada uma."
                : <Link href={endereco({ ver: "erro", pagina: 1 })} scroll={false} className="font-semibold underline">Ver só as linhas com erro</Link>}
            </Aviso>
          )}
          {imp.situacao === "desfeita" && (imp.desfazer
            ? (
              <Aviso tom={(imp.desfazer.parciais ?? 0) + (imp.desfazer.mantidas ?? 0) > 0 ? "aviso" : "sucesso"} className="mt-3" titulo="O que o desfazer fez">
                {`${numero(imp.desfazer.desfeitas ?? 0)} linha(s) voltaram por inteiro · ${numero(imp.desfazer.parciais ?? 0)} voltaram em parte · ${numero(imp.desfazer.mantidas ?? 0)} ficaram como estavam. Fica o que mudou depois da importação ou já foi usado; categorias, marcas e modelos criados continuam no cadastro.`}
              </Aviso>
            )
            : <Aviso tom="info" className="mt-3">Esta importação foi desfeita antes de o sistema guardar o resultado linha a linha: o detalhe do que voltou não ficou registrado aqui (a auditoria tem as mudanças).</Aviso>)}

          {comparacaoMudou && (
            <Aviso tom="aviso" className="mt-3" titulo="A prévia foi comparada de novo enquanto você conferia">
              {`Agora vale a comparação nº ${imp.comparacao}: o que você já tinha visto pode ter mudado. `}
              <Link href={endereco({ ver: "mudancas", pagina: 1 })} scroll={false} className="font-semibold underline">Conferir de novo desde o começo</Link>
            </Aviso>
          )}

          <div id="linhas" className="mt-4 scroll-mt-24">
            <FiltroSegmentado rotulo="Linhas da importação" opcoes={ORDEM_DOS_FILTROS.map((f) => ({ href: endereco({ ver: f, pagina: 1 }), rotulo: FILTROS_DA_CONFERENCIA[f], ativo: f === ver, contagem: linhasDoFiltro(imp.totais, f) }))} />
            {detalhes.length === 0
              ? <p className="mt-3 text-sm text-suave">Nenhuma linha neste filtro.</p>
              : (
                <ul className="mt-2 divide-y divide-borda text-sm">
                  {detalhes.map((l) => {
                    const desfeito = resumoDoDesfeito(l.desfeito);
                    return (
                      <li key={l.numero} className="py-2">
                        <p className="flex flex-wrap items-center gap-2">
                          <Selo tom={ACAO[l.acao]?.tom ?? "neutro"}>{ACAO[l.acao]?.texto ?? l.acao}</Selo>
                          <span className="text-xs text-suave">{`Linha ${l.numero}`}</span>
                          <span className="numeros font-semibold">{String(l.dados.sku ?? "")}</span> {String(l.dados.nome ?? "")}
                        </p>
                        {l.acao === "erro" && <p className="text-xs text-perigo">{l.erros.join("; ")}</p>}
                        {l.acao === "criar" && <p className="text-xs text-suave">{doNovo(l.dados)}</p>}
                        {l.acao === "atualizar" && <p className="text-xs text-suave">{Object.entries(l.diferencas).map(([c, [antes, depois]]) => `${rotuloDoCampo(c)}: ${valorDoCampo(c, antes)} → ${valorDoCampo(c, depois)}`).join(" · ")}</p>}
                        {l.acao === "sem_mudanca" && <p className="text-xs text-suave">Igual ao cadastro: nada muda.</p>}
                        {desfeito && (
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-suave">
                            <Selo tom={DESFEITO[desfeito.situacao].tom}>{DESFEITO[desfeito.situacao].texto}</Selo>
                            {[desfeito.voltou.length ? `Voltou: ${desfeito.voltou.join(", ")}` : null, desfeito.ficou.length ? `Ficou: ${desfeito.ficou.join("; ")}` : null].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            {paginas > 1 && (
              <nav aria-label="Páginas da conferência" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-suave">{`Página ${numero(pagina)} de ${numero(paginas)} · ${numero(de + 1)}–${numero(Math.min(de + LINHAS_POR_PAGINA, noFiltro))} de ${numero(noFiltro)} neste filtro`}</span>
                <span className="flex gap-2">
                  {pagina > 1 && <BotaoLink href={`${endereco({ pagina: pagina - 1 })}#linhas`} variante="secundario" tamanho="sm">Anterior</BotaoLink>}
                  {pagina < paginas && <BotaoLink href={`${endereco({ pagina: pagina + 1 })}#linhas`} variante="secundario" tamanho="sm">Próxima</BotaoLink>}
                </span>
              </nav>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {imp.situacao === "previa" && aprovar && (minhaPrevia
              ? <Aviso tom="info">Você gerou esta prévia: outra pessoa com permissão de aprovar confere e aplica.</Aviso>
              : comparacaoMudou ? <Aviso tom="aviso">Para aplicar, confira de novo desde o começo: a comparação mudou enquanto você conferia.</Aviso> : (
                <details className="rounded-xl border border-borda px-3 py-2" open={!imp.totais.erro}>
                  <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao"><FileUp aria-hidden className="size-4" /> Aplicar no catálogo</summary>
                  <form action={aplicarImportacao} className="mt-2 space-y-2">
                    <input type="hidden" name="importacao" value={imp.id} />
                    <input type="hidden" name="comparacao" value={String(imp.comparacao)} />
                    <p className="text-xs text-suave">Tudo entra numa transação só: se alguma linha falhar, nada entra. Preços e custos de antes ficam no histórico. Antes de gravar, o sistema compara de novo com o cadastro: se algo mudou desde esta conferência, nada é aplicado e a prévia volta comparada de novo para você conferir.</p>
                    <Motivo exemplo="Carga inicial da Santa Cândida" />
                    <Botao type="submit" tamanho="sm" disabled={Boolean(imp.totais.erro)}>Aplicar</Botao>
                  </form>
                </details>
              ))}
            {imp.situacao === "previa" && (
              <details className="rounded-xl border border-borda px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold text-perigo">Descartar esta prévia</summary>
                <form action={descartarImportacao} className="mt-2 space-y-2"><input type="hidden" name="importacao" value={imp.id} /><Motivo exemplo="Arquivo errado" /><Botao type="submit" tamanho="sm" variante="perigo">Descartar</Botao></form>
              </details>
            )}
            {imp.situacao === "aplicada" && aprovar && (
              <details className="rounded-xl border border-borda px-3 py-2">
                <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-perigo"><TriangleAlert aria-hidden className="size-4" /> Desfazer esta importação</summary>
                <form action={desfazerImportacao} className="mt-2 space-y-2">
                  <input type="hidden" name="importacao" value={imp.id} />
                  <p className="text-xs text-suave">Nada é apagado. Volta só o que ainda está como a importação deixou: preço, custo e campos que ninguém mudou depois. O que mudou depois fica, e a tela mostra linha a linha o que voltou e o que ficou. Variações criadas saem de circulação se ainda não foram usadas nem alteradas; categorias, marcas e modelos criados continuam no cadastro.</p>
                  <Motivo exemplo="Arquivo com preços errados" />
                  <Botao type="submit" tamanho="sm" variante="perigo">Desfazer</Botao>
                </form>
              </details>
            )}
          </div>
        </Cartao>
      )}

      {executar ? (
        <Cartao className="mt-4" titulo="Nova prévia" subtitulo="Primeira linha com o nome das colunas; no Excel, a primeira aba. Campo vazio na planilha não apaga o valor atual." icone={FileUp}>
          <FormularioDeArquivo action="/produtos/importar/enviar" className="space-y-3">
            <EscolherColunas candidato={imp && typeof imp.mapeamento.candidato?.linha === "number" ? { linha: imp.mapeamento.candidato.linha } : null} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">Tipo para as linhas sem tipo
                <select name="tipo_padrao" required className={campo} defaultValue="acessorio">{Object.entries(TIPOS_DE_PRODUTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
              </label>
              <label className="block text-sm font-medium">Categoria para as linhas sem categoria
                <input name="categoria_padrao" required maxLength={60} list="categorias-existentes" defaultValue={categorias.data[0]?.nome ?? ""} className={campo} />
                <datalist id="categorias-existentes">{categorias.data.map((c) => <option key={c.nome} value={c.nome} />)}</datalist>
              </label>
            </div>
            <Botao type="submit" enquanto="Enviando a planilha…">Gerar prévia</Botao>
          </FormularioDeArquivo>
        </Cartao>
      ) : (
        <Aviso tom="info" className="mt-4">Quem envia a planilha é o administrador; você confere e aplica as prévias.</Aviso>
      )}

      <Cartao className="mt-4" titulo="Importações recentes" icone={History}>
        <ul className="divide-y divide-borda text-sm">
          {(lista.data as unknown as Importacao[]).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/produtos/importar?importacao=${i.id}`} className="font-semibold text-acao">nº {i.numero} · {i.arquivo_nome}</Link>
              <span className="flex items-center gap-2 text-xs text-suave"><Selo tom={SITUACAO[i.situacao]?.tom ?? "neutro"}>{SITUACAO[i.situacao]?.texto ?? i.situacao}</Selo>{quando(i.criado_em)} · {i.totais.linhas ?? 0} linhas</span>
            </li>
          ))}
          {(lista.data ?? []).length === 0 && <li className="py-2 text-suave">Nenhuma importação ainda.</li>}
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

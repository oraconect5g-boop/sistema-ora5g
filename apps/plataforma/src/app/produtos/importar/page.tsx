import { ArrowLeft, FileSpreadsheet, FileUp, History, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { TIPOS_DE_PRODUTO } from "../../../lib/catalogo/cadastro";
import { centavosDoBanco } from "../../../lib/dinheiro";
import { brl } from "../../../lib/formato";
import { ERROS_DA_IMPORTACAO, ROTULO_DOS_CAMPOS } from "../../../lib/importacao/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { aplicarImportacao, descartarImportacao, desfazerImportacao } from "./acoes";
import { EscolherColunas } from "./EscolherColunas";

export const metadata: Metadata = { title: "Importar planilha" };
export const dynamic = "force-dynamic";

const OK = {
  previa: "Prévia gravada. Nada entrou no catálogo ainda: confira e peça a aprovação.",
  previa_repetida: "Este arquivo, com as mesmas colunas, já tinha prévia: é esta.",
  aplicada: "Importação aplicada no catálogo, numa transação só.",
  ja_aplicada: "Esta importação já estava aplicada.",
  descartada: "Prévia descartada. Nada entrou no catálogo.",
  desfeita: "Importação desfeita: os valores de antes voltaram e o que ela criou saiu de circulação.",
  desfeita_parcial: "Importação desfeita em parte: o que mudou depois dela foi mantido.",
  ja_desfeita: "Esta importação já estava desfeita.",
} as const;
const SITUACAO: Record<string, { texto: string; tom: "info" | "sucesso" | "neutro" | "aviso" }> = {
  previa: { texto: "prévia", tom: "info" },
  aplicada: { texto: "aplicada", tom: "sucesso" },
  descartada: { texto: "descartada", tom: "neutro" },
  desfeita: { texto: "desfeita", tom: "aviso" },
};
const ACAO: Record<string, string> = { criar: "novo", atualizar: "muda", sem_mudanca: "igual", erro: "erro" };
const LIMITE_DE_LINHAS = 300;

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "") : "—";
const dinheiro = (v: unknown) => (v === null || v === undefined ? "—" : brl(centavosDoBanco(v)));
const valorDoCampo = (campo: string, v: unknown) => (campo === "preco" || campo === "custo" ? dinheiro(v) : v === null || v === undefined ? "—" : String(v));

type Importacao = {
  id: string; numero: number; arquivo_nome: string; situacao: string; totais: Record<string, number>; mapeamento: { colunas?: Record<string, string>; padroes?: { tipo?: string; categoria?: string } };
  criado_por: string; criado_em: string; aplicado_em: string | null; encerrado_em: string | null; motivo: string | null;
};
type LinhaDaImportacao = { numero: number; dados: Record<string, unknown>; acao: string; erros: string[]; diferencas: Record<string, [unknown, unknown]> };

function Motivo({ exemplo }: { exemplo: string }) {
  return <label className="block text-sm font-medium">Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={200} placeholder={exemplo} className={campo} /></label>;
}

// Importação do catálogo por planilha (lote L3c: ORA-CAT-002). Quem tem importacao.executar
// (administrador) envia a planilha e gera a prévia; quem tem importacao.aprovar (dono), e não gerou a
// prévia, aplica tudo de uma vez ou desfaz depois. O formato da Rein não é suposto (pendência B1).
export default async function Importar({ searchParams }: { searchParams: Promise<{ importacao?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DA_IMPORTACAO, parametros.erro);
  const escolhida = ehUuid(parametros.importacao) ? parametros.importacao : null;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario } = sessao;

  const [executar, aprovar] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "importacao.executar" }),
    supabase.rpc("tem_permissao", { p_permissao: "importacao.aprovar" }),
  ]);
  if (executar.error || aprovar.error) throw new FalhaDoServico("tem_permissao");
  if (!executar.data && !aprovar.data) {
    return (
      <MoldeReal sessao={sessao}>
        <Cartao titulo="Sem permissão" icone={ShieldAlert}>
          <p className="text-sm text-suave">A importação é do administrador (envia a planilha) e do dono (aprova). O banco também recusa, mesmo que alguém digite o endereço.</p>
        </Cartao>
      </MoldeReal>
    );
  }

  const [lista, atual, linhas, categorias] = await Promise.all([
    supabase.from("importacoes").select("id, numero, arquivo_nome, situacao, totais, mapeamento, criado_por, criado_em, aplicado_em, encerrado_em, motivo").order("criado_em", { ascending: false }).limit(20),
    escolhida ? supabase.from("importacoes").select("id, numero, arquivo_nome, situacao, totais, mapeamento, criado_por, criado_em, aplicado_em, encerrado_em, motivo").eq("id", escolhida).maybeSingle() : Promise.resolve({ data: null, error: null }),
    escolhida ? supabase.from("importacao_linhas").select("numero, dados, acao, erros, diferencas").eq("importacao_id", escolhida).neq("acao", "sem_mudanca").order("numero").limit(LIMITE_DE_LINHAS) : Promise.resolve({ data: [], error: null }),
    supabase.from("categorias").select("nome").eq("ativa", true).order("nome"),
  ]);
  if (lista.error || atual.error || linhas.error || categorias.error) throw new FalhaDoServico("importacoes");
  const imp = atual.data as unknown as Importacao | null;
  const detalhes = (linhas.data ?? []) as unknown as LinhaDaImportacao[];
  const comErro = detalhes.filter((l) => l.acao === "erro");
  const minhaPrevia = imp?.criado_por === usuario.id;

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/produtos" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Cadastro de produtos</Link>
      <TituloPagina titulo="Importar planilha" subtitulo="Produtos, variações, preços e custos por planilha (CSV). Primeiro uma prévia, sem mexer no catálogo; outra pessoa confere e aplica tudo de uma vez." />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_IMPORTACAO[erro]}</Aviso>}

      {imp && (
        <Cartao className="mt-4" titulo={<span className="flex flex-wrap items-center gap-2">Importação nº {imp.numero}<Selo tom={SITUACAO[imp.situacao]?.tom ?? "neutro"}>{SITUACAO[imp.situacao]?.texto ?? imp.situacao}</Selo></span>}
          subtitulo={`${imp.arquivo_nome} · prévia em ${quando(imp.criado_em)}${imp.aplicado_em ? ` · aplicada em ${quando(imp.aplicado_em)}` : ""}${imp.motivo ? ` · ${imp.motivo}` : ""}`} icone={FileSpreadsheet}>
          <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {([["Novos", imp.totais.criar], ["Mudam", imp.totais.atualizar], ["Iguais", imp.totais.sem_mudanca], ["Com erro", imp.totais.erro]] as const).map(([nome, n]) => (
              <div key={nome} className="rounded-xl bg-fundo px-2 py-2"><dt className="text-xs text-suave">{nome}</dt><dd className={`numeros text-xl font-bold ${nome === "Com erro" && n ? "text-perigo" : ""}`}>{n ?? 0}</dd></div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-suave">
            {imp.totais.categorias_novas ? `${imp.totais.categorias_novas} categoria(s) nova(s) · ` : ""}{imp.totais.marcas_novas ? `${imp.totais.marcas_novas} marca(s) nova(s) · ` : ""}
            Colunas: {Object.entries(imp.mapeamento.colunas ?? {}).map(([c, nome]) => `${ROTULO_DOS_CAMPOS[c as keyof typeof ROTULO_DOS_CAMPOS] ?? c} = "${nome}"`).join("; ")}
          </p>

          {comErro.length > 0 && (
            <Aviso tom="perigo" className="mt-3" titulo={`${comErro.length} linha(s) com erro: corrija a planilha e gere outra prévia`}>
              <ul className="mt-1 space-y-1 text-sm">
                {comErro.map((l) => <li key={l.numero}><strong>Linha {l.numero}</strong>{l.dados.sku ? ` (${String(l.dados.sku)})` : ""}: {l.erros.join("; ")}</li>)}
              </ul>
            </Aviso>
          )}

          <ul className="mt-3 divide-y divide-borda text-sm">
            {detalhes.filter((l) => l.acao !== "erro").map((l) => (
              <li key={l.numero} className="py-2">
                <p className="flex flex-wrap items-center gap-2"><Selo tom={l.acao === "criar" ? "info" : "aviso"}>{ACAO[l.acao] ?? l.acao}</Selo><span className="numeros font-semibold">{String(l.dados.sku ?? "")}</span> {String(l.dados.nome ?? "")}</p>
                {l.acao === "criar"
                  ? <p className="text-xs text-suave">{[TIPOS_DE_PRODUTO[l.dados.tipo as keyof typeof TIPOS_DE_PRODUTO] ?? l.dados.tipo, l.dados.categoria, l.dados.marca, l.dados.preco !== null && l.dados.preco !== undefined ? `preço ${dinheiro(l.dados.preco)}` : "sem preço"].filter(Boolean).join(" · ")}</p>
                  : <p className="text-xs text-suave">{Object.entries(l.diferencas).map(([c, [de, para]]) => `${ROTULO_DOS_CAMPOS[c as keyof typeof ROTULO_DOS_CAMPOS] ?? c}: ${valorDoCampo(c, de)} → ${valorDoCampo(c, para)}`).join(" · ")}</p>}
              </li>
            ))}
          </ul>
          {detalhes.length === LIMITE_DE_LINHAS && <p className="mt-2 text-xs text-suave">Mostrando as primeiras {LIMITE_DE_LINHAS} linhas com mudança; os totais acima contam o arquivo inteiro.</p>}

          <div className="mt-4 flex flex-col gap-2">
            {imp.situacao === "previa" && aprovar.data && (minhaPrevia
              ? <Aviso tom="info">Você gerou esta prévia: outra pessoa com permissão de aprovar confere e aplica.</Aviso>
              : (
                <details className="rounded-xl border border-borda px-3 py-2" open={!imp.totais.erro}>
                  <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao"><FileUp aria-hidden className="size-4" /> Aplicar no catálogo</summary>
                  <form action={aplicarImportacao} className="mt-2 space-y-2">
                    <input type="hidden" name="importacao" value={imp.id} />
                    <p className="text-xs text-suave">Tudo entra numa transação só: se alguma linha falhar, nada entra. Preços e custos de antes ficam no histórico.</p>
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
            {imp.situacao === "aplicada" && aprovar.data && (
              <details className="rounded-xl border border-borda px-3 py-2">
                <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-perigo"><TriangleAlert aria-hidden className="size-4" /> Desfazer esta importação</summary>
                <form action={desfazerImportacao} className="mt-2 space-y-2">
                  <input type="hidden" name="importacao" value={imp.id} />
                  <p className="text-xs text-suave">Nada é apagado: os valores de antes voltam onde ainda estão como a importação deixou; o que mudou depois fica. Variações criadas e ainda não usadas saem de circulação.</p>
                  <Motivo exemplo="Arquivo com preços errados" />
                  <Botao type="submit" tamanho="sm" variante="perigo">Desfazer</Botao>
                </form>
              </details>
            )}
          </div>
        </Cartao>
      )}

      {executar.data ? (
        <Cartao className="mt-4" titulo="Nova prévia" subtitulo="Primeira linha com o nome das colunas. Campo vazio na planilha não apaga o valor atual." icone={FileUp}>
          <form action="/produtos/importar/enviar" method="post" encType="multipart/form-data" className="space-y-3">
            <EscolherColunas />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">Tipo para as linhas sem tipo
                <select name="tipo_padrao" required className={campo} defaultValue="acessorio">{Object.entries(TIPOS_DE_PRODUTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
              </label>
              <label className="block text-sm font-medium">Categoria para as linhas sem categoria
                <input name="categoria_padrao" required maxLength={60} list="categorias-existentes" defaultValue={categorias.data[0]?.nome ?? ""} className={campo} />
                <datalist id="categorias-existentes">{categorias.data.map((c) => <option key={c.nome} value={c.nome} />)}</datalist>
              </label>
            </div>
            <Botao type="submit">Gerar prévia</Botao>
          </form>
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

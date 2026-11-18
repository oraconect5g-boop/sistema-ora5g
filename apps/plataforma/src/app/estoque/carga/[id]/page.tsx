import { ArrowLeft, Boxes, CheckCircle2, Undo2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Indicador, Selo, TituloPagina } from "../../../../componentes/ui";
import { ehUuid } from "../../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../../lib/acesso/sessao";
import { ACOES_DA_LINHA, ERROS_DA_CARGA, ROTULOS_DAS_ACOES, SITUACOES_DA_CARGA, acaoDaLinha, totaisDaCarga, type AcaoDaLinha } from "../../../../lib/estoque/carga-regras";
import { numero } from "../../../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../../lib/parametros";
import { aplicarCarga, descartarCarga, desfazerCarga } from "../acoes";

export const metadata: Metadata = { title: "Carga do estoque" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 100;
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
type Carga = {
  id: string; numero: number; arquivo_nome: string; corte: string; situacao: string; totais: unknown; mapeamento: { fora?: { linha?: unknown; motivo?: unknown } } | null;
  criado_por: string; criado_em: string; aplicado_em: string | null; encerrado_em: string | null; motivo: string | null; unidades: { nome: string } | null;
};
type Linha = {
  numero: number; sku: string; fisico: number | null; disponivel: number | null; saldo_no_corte: number; acao: string; motivo: string | null;
  desfeita_em: string | null; variantes: { nome: string } | null;
};
const quantos = (t: ReturnType<typeof totaisDaCarga>): Record<AcaoDaLinha, number> =>
  ({ entrar: t.entrar, serializado: t.serializado, conferir: t.conferir, sem_produto: t.semProduto, nada: t.nada });

// Uma carga do estoque inicial (lote REIN-b; ADR-021): os totais, as linhas de cada tipo, por página, e as ações. O banco
// confere de novo cada ação (quem aplica é o dono, e nunca quem gerou a prévia).
export default async function UmaCarga({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<"ver" | "pagina" | "ok" | "erro" | "entradas" | "unidades" | "desfeitas" | "ficaram", ValorDeParametro>>;
}) {
  const [{ id }, parametros] = await Promise.all([params, searchParams]);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario } = sessao;
  const voltar = <Link href="/estoque/carga" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />As cargas</Link>;
  if (!ehUuid(id)) return <MoldeReal sessao={sessao}>{voltar}<Aviso tom="aviso" className="mt-4">Carga não encontrada.</Aviso></MoldeReal>;
  const [executar, aprovar, lida] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "importacao.executar" }),
    supabase.rpc("tem_permissao", { p_permissao: "importacao.aprovar" }),
    supabase.from("estoque_cargas").select("id, numero, arquivo_nome, corte, situacao, totais, mapeamento, criado_por, criado_em, aplicado_em, encerrado_em, motivo, unidades(nome)")
      .eq("id", id).maybeSingle(),
  ]);
  if (executar.error || aprovar.error) throw new FalhaDoServico("tem_permissao");
  if (lida.error) throw new FalhaDoServico("estoque_cargas");
  if (!executar.data && !aprovar.data) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">{ERROS_DA_CARGA.permissao}</Aviso></MoldeReal>;
  const carga = lida.data as unknown as Carga | null;
  if (!carga) return <MoldeReal sessao={sessao}>{voltar}<Aviso tom="aviso" className="mt-4">Carga não encontrada.</Aviso></MoldeReal>;

  const t = totaisDaCarga(carga.totais);
  const contagens = quantos(t);
  const pedido = textoDoParametro(parametros.ver);
  const ver: AcaoDaLinha = pedido !== undefined && (ACOES_DA_LINHA as readonly string[]).includes(pedido) ? acaoDaLinha(pedido)
    : (ACOES_DA_LINHA.find((a) => a !== "nada" && contagens[a] > 0) ?? "entrar");
  const paginas = Math.max(1, Math.ceil(contagens[ver] / POR_PAGINA));
  const paginaPedida = Number(textoDoParametro(parametros.pagina) ?? "1");
  const pagina = Number.isSafeInteger(paginaPedida) && paginaPedida >= 1 && paginaPedida <= paginas ? paginaPedida : 1;
  const linhas = await supabase.from("estoque_carga_linhas").select("numero, sku, fisico, disponivel, saldo_no_corte, acao, motivo, desfeita_em, variantes(nome)")
    .eq("carga_id", carga.id).eq("acao", ver).order("numero").range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (linhas.error) throw new FalhaDoServico("estoque_carga_linhas");
  const lista = linhas.data as unknown as Linha[];

  const erro = chaveDoCatalogo(ERROS_DA_CARGA, parametros.erro);
  const ok = textoDoParametro(parametros.ok);
  const contagem = (v: ValorDeParametro) => { const x = textoDoParametro(v); return x !== undefined && /^\d{1,7}$/.test(x) ? Number(x) : 0; };
  const fora = carga.mapeamento?.fora;
  const minha = carga.criado_por === usuario.id;
  const motivo = (rotulo: string) => (
    <label className="block text-xs font-medium">{rotulo}<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
  );

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      {voltar}
      <TituloPagina titulo={`Carga nº ${carga.numero} · ${carga.unidades?.nome ?? "Loja"}`}
        subtitulo={`${carga.arquivo_nome} · posição de ${quando(carga.corte)} · gerada em ${quando(carga.criado_em)}`} />
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <Selo tom={carga.situacao === "aplicada" ? "sucesso" : carga.situacao === "previa" ? "aviso" : "neutro"}>{SITUACOES_DA_CARGA[carga.situacao] ?? carga.situacao}</Selo>
        {carga.aplicado_em && <span className="text-xs text-suave">{`aplicada em ${quando(carga.aplicado_em)}`}</span>}
        {carga.encerrado_em && <span className="text-xs text-suave">{`${carga.situacao === "desfeita" ? "desfeita" : "encerrada"} em ${quando(carga.encerrado_em)}${carga.motivo ? `: ${carga.motivo}` : ""}`}</span>}
      </p>
      {ok === "aplicada" && <Aviso tom="sucesso" className="mt-4">{`Carga aplicada: ${numero(contagem(parametros.entradas))} produtos e ${numero(contagem(parametros.unidades))} unidades entraram no estoque.`}</Aviso>}
      {ok === "descartada" && <Aviso tom="info" className="mt-4">Prévia descartada: nada entrou no estoque.</Aviso>}
      {ok === "desfeita" && <Aviso tom="info" className="mt-4">{`Carga desfeita: ${numero(contagem(parametros.desfeitas))} linhas voltaram${contagem(parametros.ficaram) > 0 ? `; ${numero(contagem(parametros.ficaram))} ficaram, porque a loja já usou parte (acerte pelo inventário)` : ""}.`}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_CARGA[erro]}</Aviso>}

      <section aria-label="Resumo da carga" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Entram no estoque" valor={numero(t.unidadesEntrar)} detalhe={`${numero(t.entrar)} produtos (acessórios)`} icone={Boxes} />
        <Indicador rotulo="Com IMEI ou ICCID" valor={numero(t.unidadesSerializado)} detalhe={`${numero(t.serializado)} produtos: pela Entrada de mercadoria`} />
        <Indicador rotulo="A conferir" valor={numero(t.conferir)} detalhe={`${numero(t.semProduto)} fora do catálogo`} />
        <Indicador rotulo="Físico fora do disponível" valor={numero(t.foraDoDisponivel)} detalhe="reservado ou a caminho na Rein: confira na loja" />
      </section>
      {typeof fora?.linha === "number" && typeof fora.motivo === "string" && (
        <p className="mt-2 text-xs text-aviso">{`Ficou de fora a linha ${fora.linha} do arquivo: ${fora.motivo}.`}</p>
      )}
      {t.desfeitas !== null && <p className="mt-2 text-xs text-suave">{`Ao desfazer: ${numero(t.desfeitas)} linhas voltaram e ${numero(t.ficaram ?? 0)} ficaram.`}</p>}

      <Cartao className="mt-4" titulo="As linhas da loja">
        <nav aria-label="Tipos de linha" className="mb-3 flex flex-wrap gap-2 text-sm">
          {ACOES_DA_LINHA.map((a) => (
            <Link key={a} href={`/estoque/carga/${carga.id}?ver=${a}`} aria-current={a === ver ? "page" : undefined}
              className={`rounded-botao px-3 py-2 font-semibold ${a === ver ? "bg-acao text-white" : "bg-white text-acao ring-1 ring-borda"}`}>{`${ROTULOS_DAS_ACOES[a]} (${numero(contagens[a])})`}</Link>
          ))}
        </nav>
        {lista.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma linha deste tipo.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {lista.map((l) => (
              <li key={l.numero} className="py-2">
                <p className="numeros">{`Linha ${l.numero} · ${l.sku || "sem código"}${l.variantes?.nome ? ` · ${l.variantes.nome}` : ""}`}</p>
                <p className="numeros text-xs text-suave">
                  {`físico ${l.fisico ?? "—"}${l.disponivel !== null ? ` · disponível ${l.disponivel}` : ""}${l.saldo_no_corte !== 0 ? ` · no sistema na data de corte ${l.saldo_no_corte}` : ""}`}
                  {l.motivo ? ` · ${l.motivo}` : ""}{l.desfeita_em ? " · desfeita" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {paginas > 1 && (
          <nav aria-label="Páginas" className="mt-3 flex flex-wrap gap-2 text-sm">
            {pagina > 1 && <Link href={`/estoque/carga/${carga.id}?ver=${ver}&pagina=${pagina - 1}`} className="font-semibold text-acao">Anteriores</Link>}
            <span className="text-suave">{`Página ${pagina} de ${paginas}`}</span>
            {pagina < paginas && <Link href={`/estoque/carga/${carga.id}?ver=${ver}&pagina=${pagina + 1}`} className="font-semibold text-acao">Próximas</Link>}
          </nav>
        )}
      </Cartao>

      {carga.situacao === "previa" && aprovar.data && !minha && (
        <Cartao className="mt-4" titulo="Aplicar" subtitulo={`${numero(t.unidadesEntrar)} unidades de ${numero(t.entrar)} acessórios entram no estoque da ${carga.unidades?.nome ?? "loja"}. O resto fica como está.`} icone={CheckCircle2}>
          <form action={aplicarCarga} className="space-y-3">
            <input type="hidden" name="carga" value={carga.id} />
            {motivo("Motivo (por exemplo: carga inicial da loja, conferida)")}
            <Botao type="submit" enquanto="Aplicando…">Aplicar a carga</Botao>
          </form>
        </Cartao>
      )}
      {carga.situacao === "previa" && aprovar.data && minha && (
        <Aviso tom="info" className="mt-4">Você gerou esta prévia: quem aplica é outra pessoa com a aprovação.</Aviso>
      )}
      {carga.situacao === "previa" && (
        <Cartao className="mt-4" titulo="Descartar a prévia" subtitulo="Encerra a prévia sem mexer no estoque." icone={XCircle}>
          <form action={descartarCarga} className="space-y-3">
            <input type="hidden" name="carga" value={carga.id} />
            {motivo("Motivo")}
            <Botao type="submit" variante="secundario" enquanto="Descartando…">Descartar</Botao>
          </form>
        </Cartao>
      )}
      {carga.situacao === "aplicada" && aprovar.data && (
        <Cartao className="mt-4" titulo="Desfazer a carga" subtitulo="Devolve pelo livro o que a carga lançou e ainda está livre na loja; o que já foi vendido, reservado ou transferido fica e é contado." icone={Undo2}>
          <form action={desfazerCarga} className="space-y-3">
            <input type="hidden" name="carga" value={carga.id} />
            {motivo("Motivo")}
            <Botao type="submit" variante="secundario" enquanto="Desfazendo…">Desfazer</Botao>
          </form>
        </Cartao>
      )}
    </MoldeReal>
  );
}

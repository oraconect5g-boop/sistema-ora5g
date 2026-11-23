import { ArrowLeft, Boxes, CheckCircle2, Scale, Undo2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Indicador, Selo, TituloPagina } from "../../../../componentes/ui";
import { ehUuid } from "../../../../lib/acesso/regras";
import { permite } from "../../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../../lib/acesso/sessao";
import {
  ACOES_DA_LINHA, ERROS_DA_CARGA, RESOLUCOES, RESOLUCOES_EM_BLOCO, ROTULOS_DAS_ACOES, ROTULOS_DAS_RESOLUCOES, SITUACOES_DA_CARGA, acaoDaLinha, ehResolucao,
  totaisDaCarga, type AcaoDaLinha, type Resolucao,
} from "../../../../lib/estoque/carga-regras";
import { numero } from "../../../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../../lib/parametros";
import { aplicarCarga, descartarCarga, desfazerCarga, resolverDiferenca } from "../acoes";

export const metadata: Metadata = { title: "Carga do estoque" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 100;
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
type Carga = {
  id: string; numero: number; arquivo_nome: string; corte: string; situacao: string; totais: unknown; mapeamento: { fora?: { linha?: unknown; motivo?: unknown }; candidato?: { linha?: unknown; motivo?: unknown }; fora_do_padrao?: { celulas?: unknown; linhas?: unknown } } | null;
  criado_por: string; criado_em: string; aplicado_em: string | null; encerrado_em: string | null; motivo: string | null; unidades: { nome: string } | null;
};
type Linha = {
  numero: number; sku: string; fisico: number | null; disponivel: number | null; saldo_no_corte: number; acao: string; motivo: string | null;
  desfeita_em: string | null; lancar: number | null; pendencia: string | null; resolucao: string | null; resolvido_por: string | null;
  resolvido_em: string | null; motivo_resolucao: string | null; variantes: { nome: string } | null;
};
// REIN-c: além dos tipos de linha, a vista das linhas com o físico maior que o disponível (resolvidas ou não).
type Vista = AcaoDaLinha | "diferenca";
const emLinhas = (n: number) => (n === 1 ? "1 linha" : `${numero(n)} linhas`);
const quantos = (t: ReturnType<typeof totaisDaCarga>): Record<AcaoDaLinha, number> =>
  ({ entrar: t.entrar, serializado: t.serializado, conferir: t.conferir, sem_produto: t.semProduto, nada: t.nada });

// Uma carga do estoque inicial (lote REIN-b; ADR-021): os totais, as linhas de cada tipo, por página, e as ações. O banco
// confere de novo cada ação (quem aplica é o dono, e nunca quem gerou a prévia). REIN-c (F18-03): a linha do acessório com o
// físico maior que o disponível espera uma decisão registrada, e a carga não se aplica sem ela.
export default async function UmaCarga({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<"ver" | "pagina" | "ok" | "erro" | "entradas" | "unidades" | "desfeitas" | "ficaram" | "linha" | "linhas", ValorDeParametro>>;
}) {
  const [{ id }, parametros] = await Promise.all([params, searchParams]);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario } = sessao;
  const voltar = <Link href="/estoque/carga" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />As cargas</Link>;
  if (!ehUuid(id)) return <MoldeReal sessao={sessao}>{voltar}<Aviso tom="aviso" className="mt-4">Carga não encontrada.</Aviso></MoldeReal>;
  const executar = permite(sessao, "importacao.executar");
  const aprovar = permite(sessao, "importacao.aprovar");
  const lida = await supabase.from("estoque_cargas").select("id, numero, arquivo_nome, corte, situacao, totais, mapeamento, criado_por, criado_em, aplicado_em, encerrado_em, motivo, unidades(nome)")
    .eq("id", id).maybeSingle();
  if (lida.error) throw new FalhaDoServico("estoque_cargas");
  if (!executar && !aprovar) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">{ERROS_DA_CARGA.permissao}</Aviso></MoldeReal>;
  const carga = lida.data as unknown as Carga | null;
  if (!carga) return <MoldeReal sessao={sessao}>{voltar}<Aviso tom="aviso" className="mt-4">Carga não encontrada.</Aviso></MoldeReal>;

  const t = totaisDaCarga(carga.totais);
  const contagens = quantos(t);
  const diferencas = t.aResolver + t.resolvidas;
  const pedido = textoDoParametro(parametros.ver);
  const ver: Vista = pedido === "diferenca" && diferencas > 0 ? "diferenca"
    : pedido !== undefined && (ACOES_DA_LINHA as readonly string[]).includes(pedido) ? acaoDaLinha(pedido)
      : t.aResolver > 0 ? "diferenca" : (ACOES_DA_LINHA.find((a) => a !== "nada" && contagens[a] > 0) ?? "entrar");
  const paginas = Math.max(1, Math.ceil((ver === "diferenca" ? diferencas : contagens[ver]) / POR_PAGINA));
  const paginaPedida = Number(textoDoParametro(parametros.pagina) ?? "1");
  const pagina = Number.isSafeInteger(paginaPedida) && paginaPedida >= 1 && paginaPedida <= paginas ? paginaPedida : 1;
  const consulta = supabase.from("estoque_carga_linhas")
    .select("numero, sku, fisico, disponivel, saldo_no_corte, acao, motivo, desfeita_em, lancar, pendencia, resolucao, resolvido_por, resolvido_em, motivo_resolucao, variantes(nome)")
    .eq("carga_id", carga.id);
  const linhas = await (ver === "diferenca" ? consulta.not("pendencia", "is", null) : consulta.eq("acao", ver))
    .order("numero").range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (linhas.error) throw new FalhaDoServico("estoque_carga_linhas");
  const lista = linhas.data as unknown as Linha[];
  // Quem decidiu cada linha (só na vista das diferenças, e só se alguma já tem decisão).
  const quemDecidiu = ver === "diferenca" ? [...new Set(lista.map((l) => l.resolvido_por).filter((x): x is string => Boolean(x)))] : [];
  const pessoas = quemDecidiu.length ? await supabase.from("perfis_usuario").select("id, nome").in("id", quemDecidiu) : { data: [], error: null };
  if (pessoas.error) throw new FalhaDoServico("perfis_usuario");
  const nomeDe = new Map((pessoas.data ?? []).map((p) => [p.id, p.nome]));
  const decide = carga.situacao === "previa" && (executar || aprovar);
  const rotuloDaDecisao = (r: Resolucao, l: Pick<Linha, "fisico" | "disponivel">) =>
    r === "disponivel" ? `${ROTULOS_DAS_RESOLUCOES[r].titulo} (${l.disponivel ?? 0})` : r === "fisico" ? `${ROTULOS_DAS_RESOLUCOES[r].titulo} (${l.fisico ?? 0})` : ROTULOS_DAS_RESOLUCOES[r].titulo;
  const escolhas = (lista: readonly Resolucao[], l: Pick<Linha, "fisico" | "disponivel" | "resolucao"> | null, legenda: string) => (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium">{legenda}</legend>
      {lista.map((r) => (
        <label key={r} className="flex min-h-11 items-start gap-2 text-sm">
          <input type="radio" name="resolucao" value={r} required defaultChecked={l?.resolucao === r} className="mt-1 size-4" />
          <span><span className="font-semibold">{l ? rotuloDaDecisao(r, l) : ROTULOS_DAS_RESOLUCOES[r].titulo}</span>{` · ${ROTULOS_DAS_RESOLUCOES[r].detalhe}`}</span>
        </label>
      ))}
    </fieldset>
  );

  const erro = chaveDoCatalogo(ERROS_DA_CARGA, parametros.erro);
  const ok = textoDoParametro(parametros.ok);
  const contagem = (v: ValorDeParametro) => { const x = textoDoParametro(v); return x !== undefined && /^\d{1,7}$/.test(x) ? Number(x) : 0; };
  const linhaResolvida = contagem(parametros.linha);
  const fora = carga.mapeamento?.fora;
  const candidato = carga.mapeamento?.candidato;
  // F21-01: as quantidades marcadas como número no Excel, mas escritas com vírgula, lidas pelo texto.
  const escritas = carga.mapeamento?.fora_do_padrao;
  const linhasEscritas = Array.isArray(escritas?.linhas) ? escritas.linhas.filter((n): n is number => typeof n === "number") : [];
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
      {ok === "resolvida" && linhaResolvida > 0 && <Aviso tom="sucesso" className="mt-4">{`Decisão registrada na linha ${linhaResolvida}.`}</Aviso>}
      {ok === "resolvidas" && <Aviso tom="sucesso" className="mt-4">{`Decisão registrada em ${emLinhas(contagem(parametros.linhas))} de uma vez.`}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_CARGA[erro]}</Aviso>}

      <section aria-label="Resumo da carga" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Entram no estoque" valor={numero(t.unidadesEntrar)} detalhe={`${numero(t.entrar)} produtos (acessórios)`} icone={Boxes} />
        <Indicador rotulo="Com IMEI ou ICCID" valor={numero(t.unidadesSerializado)} detalhe={`${numero(t.serializado)} produtos: pela Entrada de mercadoria`} />
        <Indicador rotulo="A conferir" valor={numero(t.conferir)} detalhe={`${numero(t.semProduto)} fora do catálogo`} />
        <Indicador rotulo="Físico fora do disponível" valor={numero(t.foraDoDisponivel)}
          detalhe={t.aResolver > 0 ? `${emLinhas(t.aResolver)} sem decisão: resolva antes de aplicar`
            : t.resolvidas > 0 ? `${emLinhas(t.resolvidas)} com a decisão registrada` : "reservado ou a caminho na Rein: confira na loja"} />
      </section>
      {typeof fora?.linha === "number" && typeof fora.motivo === "string" && (
        <p className="mt-2 text-xs text-aviso">{`Ficou de fora a linha ${fora.linha} do arquivo: ${fora.motivo}.`}</p>
      )}
      {typeof escritas?.celulas === "number" && escritas.celulas > 0 && (
        <p className="mt-2 text-xs text-aviso">{`${escritas.celulas} quantidade(s) desta loja vieram marcadas como número no Excel, mas escritas com vírgula (o formato da exportação): foram lidas como estão escritas. Confira ${linhasEscritas.length === 1 ? "a linha" : "as linhas"} ${linhasEscritas.join(", ")} do arquivo.`}</p>
      )}
      {typeof candidato?.linha === "number" && typeof candidato.motivo === "string" && (
        <p className="mt-2 text-xs text-aviso">{`Confira a linha ${candidato.linha} do arquivo: ${candidato.motivo}. Ela está na prévia, sem o código, para conferir; nada dela entra no estoque.`}</p>
      )}
      {t.desfeitas !== null && <p className="mt-2 text-xs text-suave">{`Ao desfazer: ${numero(t.desfeitas)} linhas voltaram e ${numero(t.ficaram ?? 0)} ficaram.`}</p>}

      <Cartao className="mt-4" titulo="As linhas da loja">
        <nav aria-label="Tipos de linha" className="mb-3 flex flex-wrap gap-2 text-sm">
          {diferencas > 0 && (
            <Link href={`/estoque/carga/${carga.id}?ver=diferenca`} aria-current={ver === "diferenca" ? "page" : undefined}
              className={`rounded-botao px-3 py-2 font-semibold ${ver === "diferenca" ? "bg-acao text-white" : "bg-white text-acao ring-1 ring-borda"}`}>
              {`Físico maior que o disponível (${numero(diferencas)}${t.aResolver > 0 ? `; ${numero(t.aResolver)} sem decisão` : ""})`}
            </Link>
          )}
          {ACOES_DA_LINHA.map((a) => (
            <Link key={a} href={`/estoque/carga/${carga.id}?ver=${a}`} aria-current={a === ver ? "page" : undefined}
              className={`rounded-botao px-3 py-2 font-semibold ${a === ver ? "bg-acao text-white" : "bg-white text-acao ring-1 ring-borda"}`}>{`${ROTULOS_DAS_ACOES[a]} (${numero(contagens[a])})`}</Link>
          ))}
        </nav>
        {ver === "diferenca" && (
          <p className="mb-3 text-xs text-suave">
            Na data de corte, estes acessórios tinham mais unidades na loja que livres para vender. A diferença pode estar reservada
            para um cliente, a caminho de outra loja ou ser erro de cadastro: o sistema não presume nada. Decida cada linha com o
            motivo; a carga só se aplica quando todas tiverem a decisão.
          </p>
        )}
        {lista.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma linha deste tipo.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {lista.map((l) => (
              <li key={l.numero} className="py-2">
                <p className="numeros">{`Linha ${l.numero} · ${l.sku || "sem código"}${l.variantes?.nome ? ` · ${l.variantes.nome}` : ""}`}</p>
                <p className="numeros text-xs text-suave">
                  {`físico ${l.fisico ?? "—"}${l.disponivel !== null ? ` · disponível ${l.disponivel}` : ""}${l.saldo_no_corte !== 0 ? ` · no sistema na data de corte ${l.saldo_no_corte}` : ""}`}
                  {l.acao === "entrar" && l.lancar !== null && l.lancar !== l.fisico ? ` · entram ${l.lancar}` : ""}
                  {l.motivo && !(ver === "diferenca" && l.resolucao) ? ` · ${l.motivo}` : ""}{l.desfeita_em ? " · desfeita" : ""}
                </p>
                {ver === "diferenca" && (ehResolucao(l.resolucao) ? (
                  <p className="mt-1 text-xs">
                    {`Decisão: ${rotuloDaDecisao(l.resolucao, l)}${l.resolvido_em ? `, por ${nomeDe.get(l.resolvido_por ?? "") ?? "quem importa ou aprova"} em ${quando(l.resolvido_em)}` : ""}${l.motivo_resolucao ? `: ${l.motivo_resolucao}` : ""}`}
                  </p>
                ) : <p className="mt-1 text-xs font-semibold text-aviso">Sem decisão: a carga não se aplica até resolver esta linha.</p>)}
                {ver === "diferenca" && decide && (
                  <details open={!l.resolucao} className="mt-2">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-acao">{l.resolucao ? "Mudar a decisão" : "Decidir"}</summary>
                    <form action={resolverDiferenca} className="space-y-2">
                      <input type="hidden" name="carga" value={carga.id} />
                      <input type="hidden" name="linha" value={l.numero} />
                      {escolhas(RESOLUCOES, l, `O que fazer com a linha ${l.numero}`)}
                      {motivo("Motivo (por exemplo: duas estão reservadas para clientes)")}
                      <Botao type="submit" variante="secundario" enquanto="Registrando…">Registrar a decisão</Botao>
                    </form>
                  </details>
                )}
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

      {ver === "diferenca" && decide && t.aResolver > 1 && (
        <Cartao className="mt-4" titulo={`Decidir de uma vez as ${numero(t.aResolver)} linhas sem decisão`}
          subtitulo="Só as decisões que não liberam o que pode estar comprometido. Lançar o físico é linha a linha, depois de conferir na loja." icone={Scale}>
          <form action={resolverDiferenca} className="space-y-3">
            <input type="hidden" name="carga" value={carga.id} />
            {escolhas(RESOLUCOES_EM_BLOCO, null, "O que fazer com todas")}
            {motivo("Motivo")}
            <Botao type="submit" variante="secundario" enquanto="Registrando…">Registrar para todas</Botao>
          </form>
        </Cartao>
      )}
      {carga.situacao === "previa" && aprovar && !minha && t.aResolver > 0 && (
        <Aviso tom="aviso" className="mt-4">
          {`Antes de aplicar, decida ${t.aResolver === 1 ? "a linha" : `as ${numero(t.aResolver)} linhas`} com o físico maior que o disponível. `}
          <Link href={`/estoque/carga/${carga.id}?ver=diferenca`} className="font-semibold text-acao underline">Ver as linhas</Link>
        </Aviso>
      )}
      {carga.situacao === "previa" && aprovar && !minha && t.aResolver === 0 && (
        <Cartao className="mt-4" titulo="Aplicar" subtitulo={`${numero(t.unidadesEntrar)} unidades de ${numero(t.entrar)} acessórios entram no estoque da ${carga.unidades?.nome ?? "loja"}. O resto fica como está.`} icone={CheckCircle2}>
          <form action={aplicarCarga} className="space-y-3">
            <input type="hidden" name="carga" value={carga.id} />
            {motivo("Motivo (por exemplo: carga inicial da loja, conferida)")}
            <Botao type="submit" enquanto="Aplicando…">Aplicar a carga</Botao>
          </form>
        </Cartao>
      )}
      {carga.situacao === "previa" && aprovar && minha && (
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
      {carga.situacao === "aplicada" && aprovar && (
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

import { randomUUID } from "node:crypto";

import { ArrowLeft, CalendarPlus, History, ListTodo, Route, UserRoundCog } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, ListaDados, Selo, TituloPagina } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ERROS_DO_CRM, ETAPAS, ETAPAS_ABERTAS, MOTIVOS_DE_PERDA, ORIGENS, TIPOS_DE_ATIVIDADE, ehEtapa, paraCampoLocal, type Etapa } from "../../../lib/crm/regras";
import { centavosDoBanco } from "../../../lib/dinheiro";
import { brl } from "../../../lib/formato";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { anotarOportunidade, atribuirOportunidade, criarAtividade, encerrarAtividade, moverOportunidade } from "../acoes";

export const metadata: Metadata = { title: "Oportunidade" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const caixa = "rounded-xl border border-borda bg-white px-3 py-2";
const resumo = "flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao";
const quando = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "") : "—");
const OK = {
  registrada: "Oportunidade registrada.", movida: "Oportunidade atualizada.", atribuida: "Responsável trocado; o motivo ficou no histórico.",
  anotada: "Anotação guardada.", agendada: "Atividade agendada.", feita: "Atividade concluída.", cancelada: "Atividade cancelada.",
} as const;
const EVENTOS: Record<string, string> = {
  criada: "registrou", etapa: "mudou a etapa", responsavel: "trocou o responsável", proximo_passo: "mudou o próximo passo", nota: "anotou",
  reaberta: "reabriu", atividade: "atividade",
};
const nomeDaEtapa = (v: string | null) => (v && ehEtapa(v) ? ETAPAS[v].nome : v);

type Detalhe = {
  id: string; numero: number; origem: keyof typeof ORIGENS; campanha: string | null; interesse: string; valor_estimado: number | null; etapa: Etapa;
  proximo_passo: string | null; proximo_passo_em: string | null; motivo_perda: keyof typeof MOTIVOS_DE_PERDA | null; observacao: string | null;
  venda_id: string | null; criado_em: string; encerrado_em: string | null; responsavel_id: string; gerencia: boolean; responsavel: string; atendente: string;
  cliente: { id: string; nome: string; telefone: string | null };
  eventos: { tipo: string; de: string | null; para: string | null; texto: string | null; usuario: string; em: string }[];
  atividades: { id: string; tipo: keyof typeof TIPOS_DE_ATIVIDADE; descricao: string; vence_em: string; situacao: string; resultado: string | null; atrasada: boolean; responsavel: string }[];
  equipe: { id: string; nome: string }[] | null;
};

// Uma oportunidade (lote L5b): andamento, etapa e próximo passo, ganhar ou perder, responsável (gerência),
// atividades e o histórico que só cresce.
export default async function Oportunidade({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DO_CRM, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const resposta = await supabase.rpc("oportunidade_detalhe", { p_oportunidade: id });
  if (resposta.error?.code === "P0002") notFound();
  if (resposta.error) throw new FalhaDoServico("oportunidade_detalhe");
  const o = resposta.data as unknown as Detalhe;
  const [buscaCliente, vendas] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "cliente.buscar", p_unidade: situacao.unidade_id as string }),
    supabase.from("vendas").select("id, numero, concluida_em, total_centavos").eq("cliente_id", o.cliente.id).eq("situacao", "concluida").order("concluida_em", { ascending: false }).limit(10),
  ]);
  if (buscaCliente.error || vendas.error) throw new FalhaDoServico("oportunidade_extras");
  const aberta = ETAPAS_ABERTAS.includes(o.etapa);

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/crm" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Funil</Link>
      <TituloPagina titulo={`Oportunidade nº ${o.numero}`} subtitulo={<span className="flex flex-wrap items-center gap-2">
        {buscaCliente.data ? <Link href={`/clientes/${o.cliente.id}`} className="font-semibold text-acao">{o.cliente.nome}</Link> : o.cliente.nome}
        · {o.interesse}<Selo tom={ETAPAS[o.etapa].tom}>{ETAPAS[o.etapa].nome}</Selo></span>} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CRM[erro]}</Aviso>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Andamento" icone={Route}>
          <ListaDados itens={[
            ["Origem", `${ORIGENS[o.origem] ?? o.origem}${o.campanha ? ` · ${o.campanha}` : ""}`],
            ["Responsável", o.responsavel], ["Atendeu primeiro", o.atendente],
            ["Valor estimado", o.valor_estimado ? brl(o.valor_estimado) : "—"],
            ["Próximo passo", o.proximo_passo ? `${o.proximo_passo} · ${quando(o.proximo_passo_em)}` : "—"],
            ...(o.motivo_perda ? [["Motivo da perda", `${MOTIVOS_DE_PERDA[o.motivo_perda]}${o.observacao ? `: ${o.observacao}` : ""}`] as const] : []),
            ...(o.venda_id ? [["Venda", <Link key="v" href={`/vendas/${o.venda_id}`} className="font-semibold text-acao">ver a venda</Link>] as const] : []),
            ["Registrada em", quando(o.criado_em)], ...(o.encerrado_em ? [["Encerrada em", quando(o.encerrado_em)] as const] : []),
          ]} />
        </Cartao>

        <div className="space-y-2">
          {aberta && (
            <>
              <details className={caixa} open>
                <summary className={resumo}>Mudar etapa ou próximo passo</summary>
                <form action={moverOportunidade} className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="oportunidade" value={o.id} />
                  <label className="text-sm font-medium sm:col-span-2">Etapa<select name="etapa" defaultValue={o.etapa} className={campo}>
                    {ETAPAS_ABERTAS.map((e) => <option key={e} value={e}>{ETAPAS[e].nome}</option>)}</select></label>
                  <label className="text-sm font-medium">Próximo passo<input name="proximo_passo" maxLength={200} defaultValue={o.proximo_passo ?? ""} className={campo} /></label>
                  <label className="text-sm font-medium">Quando<input name="proximo_passo_em" type="datetime-local" defaultValue={paraCampoLocal(o.proximo_passo_em)} className={campo} /></label>
                  <p className="text-xs text-suave sm:col-span-2">Para tirar o próximo passo, deixe os dois em branco.</p>
                  <Botao type="submit" tamanho="sm" className="sm:col-span-2 sm:justify-self-start">Gravar</Botao>
                </form>
              </details>
              <details className={caixa}>
                <summary className={resumo}>Ganhou</summary>
                <form action={moverOportunidade} className="mt-2 space-y-2">
                  <input type="hidden" name="oportunidade" value={o.id} /><input type="hidden" name="etapa" value="ganha" />
                  <label className="block text-sm font-medium">Venda (opcional)<select name="venda" defaultValue="" className={campo}>
                    <option value="">sem venda ligada</option>
                    {vendas.data.map((v) => <option key={v.id} value={v.id}>Venda nº {v.numero} · {quando(v.concluida_em)} · {brl(centavosDoBanco(v.total_centavos))}</option>)}
                  </select></label>
                  <label className="block text-sm font-medium">Observação (opcional)<input name="observacao" maxLength={300} className={campo} /></label>
                  <Botao type="submit" tamanho="sm">Marcar como ganha</Botao>
                </form>
              </details>
              <details className={caixa}>
                <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-perigo">Perdeu</summary>
                <form action={moverOportunidade} className="mt-2 space-y-2">
                  <input type="hidden" name="oportunidade" value={o.id} /><input type="hidden" name="etapa" value="perdida" />
                  <label className="block text-sm font-medium">Motivo<select name="motivo_perda" required defaultValue="" className={campo}>
                    <option value="" disabled>escolha</option>{Object.entries(MOTIVOS_DE_PERDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="block text-sm font-medium">Observação<input name="observacao" maxLength={300} className={campo} /></label>
                  <Botao type="submit" tamanho="sm" variante="perigo">Marcar como perdida</Botao>
                </form>
              </details>
            </>
          )}
          {!aberta && o.gerencia && (
            <details className={caixa}>
              <summary className={resumo}>Reabrir (gerência)</summary>
              <form action={moverOportunidade} className="mt-2 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="oportunidade" value={o.id} />
                <label className="text-sm font-medium sm:col-span-2">Voltar para<select name="etapa" defaultValue="negociacao" className={campo}>
                  {ETAPAS_ABERTAS.map((e) => <option key={e} value={e}>{ETAPAS[e].nome}</option>)}</select></label>
                <label className="text-sm font-medium sm:col-span-2">Motivo<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                <Botao type="submit" tamanho="sm" className="sm:justify-self-start">Reabrir</Botao>
              </form>
            </details>
          )}
          {aberta && o.gerencia && o.equipe && (
            <details className={caixa}>
              <summary className={resumo}><UserRoundCog aria-hidden className="size-4" /> Trocar o responsável</summary>
              <form action={atribuirOportunidade} className="mt-2 space-y-2">
                <input type="hidden" name="oportunidade" value={o.id} />
                <label className="block text-sm font-medium">Quem assume<select name="responsavel" defaultValue={o.responsavel_id} className={campo}>
                  {o.equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
                <label className="block text-sm font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} placeholder="Vendedor de folga" className={campo} /></label>
                <Botao type="submit" tamanho="sm">Trocar</Botao>
              </form>
            </details>
          )}
          <details className={caixa}>
            <summary className={resumo}>Anotar</summary>
            <form action={anotarOportunidade} className="mt-2 space-y-2">
              <input type="hidden" name="oportunidade" value={o.id} />
              <label className="block text-sm font-medium">Anotação<textarea name="nota" required minLength={3} maxLength={500} rows={3} className={`${campo} py-2`} /></label>
              <Botao type="submit" tamanho="sm" variante="secundario">Guardar</Botao>
            </form>
          </details>
        </div>
      </div>

      <Cartao className="mt-4" titulo="Atividades" icone={ListTodo}>
        <ul className="divide-y divide-borda text-sm">
          {o.atividades.map((a) => (
            <li key={a.id} className="space-y-1 py-2">
              <p className="flex flex-wrap items-center gap-2"><Selo tom="neutro">{TIPOS_DE_ATIVIDADE[a.tipo] ?? a.tipo}</Selo>{a.descricao}
                <span className="text-xs text-suave">{quando(a.vence_em)} · {a.responsavel}</span>
                {a.situacao === "aberta" ? (a.atrasada && <Selo tom="perigo">atrasada</Selo>) : <Selo tom={a.situacao === "feita" ? "sucesso" : "neutro"}>{a.situacao}</Selo>}</p>
              {a.resultado && <p className="text-xs text-suave">Resultado: {a.resultado}</p>}
              {a.situacao === "aberta" && (
                <form action={encerrarAtividade} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="atividade" value={a.id} /><input type="hidden" name="oportunidade" value={o.id} />
                  <label className="min-w-0 flex-1 text-xs font-medium">Resultado<input name="resultado" required minLength={3} maxLength={300} className={campo} /></label>
                  <select name="decisao" aria-label="Como terminou" className={`${campo} w-auto`}><option value="feita">feita</option><option value="cancelada">cancelada</option></select>
                  <Botao type="submit" tamanho="sm" variante="secundario">Encerrar</Botao>
                </form>
              )}
            </li>
          ))}
          {o.atividades.length === 0 && <li className="py-2 text-suave">Nenhuma atividade ainda.</li>}
        </ul>
        {aberta && (
          <details className="mt-3">
            <summary className={resumo}><CalendarPlus aria-hidden className="size-4" /> Agendar atividade</summary>
            <form action={criarAtividade} className="mt-2 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="oportunidade" value={o.id} /><input type="hidden" name="chave" value={`form:${randomUUID()}`} />
              <label className="text-sm font-medium">Tipo<select name="tipo" defaultValue="ligacao" className={campo}>{Object.entries(TIPOS_DE_ATIVIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="text-sm font-medium">Vence em<input name="vence_em" type="datetime-local" required className={campo} /></label>
              <label className="text-sm font-medium sm:col-span-2">Descrição<input name="descricao" required minLength={3} maxLength={200} placeholder="Ligar para confirmar a visita" className={campo} /></label>
              {o.gerencia && o.equipe && (
                <label className="text-sm font-medium sm:col-span-2">Para<select name="responsavel" defaultValue="" className={campo}>
                  <option value="">mim</option>{o.equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
              )}
              <Botao type="submit" tamanho="sm" className="sm:justify-self-start">Agendar</Botao>
            </form>
          </details>
        )}
      </Cartao>

      <Cartao className="mt-4" titulo="Histórico" icone={History}>
        <ul className="divide-y divide-borda text-sm">
          {o.eventos.map((e, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
              <span>{e.usuario} {EVENTOS[e.tipo] ?? e.tipo}
                {e.tipo === "etapa" || e.tipo === "reaberta" ? `: ${nomeDaEtapa(e.de) ?? "—"} → ${nomeDaEtapa(e.para)}` : e.tipo === "responsavel" ? `: ${e.de} → ${e.para}` : ""}
                {e.tipo === "atividade" ? ` ${e.para === "aberta" ? "agendada" : e.para}` : ""}
                {e.texto ? <span className="block text-xs text-suave">{e.texto}</span> : null}</span>
              <span className="text-xs text-suave">{quando(e.em)}</span>
            </li>
          ))}
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

import { randomUUID } from "node:crypto";

import { CalendarClock, Filter, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Botao, BotaoLink, Cartao, FiltroSegmentado, Selo, TituloPagina } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { ERROS_DO_CRM, ETAPAS, ETAPAS_ABERTAS, MOTIVOS_DE_PERDA, ORIGENS, type Etapa } from "../../lib/crm/regras";
import { brl } from "../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { BuscaDeCliente } from "../clientes/BuscaDeCliente";
import { registrarOportunidade } from "./acoes";

export const metadata: Metadata = { title: "Funil" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const OK = { movida: "Oportunidade atualizada." } as const;
const quando = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "") : "—");

type OportunidadeDoFunil = {
  id: string; numero: number; cliente: string; cliente_id: string; interesse: string; origem: keyof typeof ORIGENS; etapa: Etapa; responsavel: string;
  responsavel_id: string; proximo_passo: string | null; proximo_passo_em: string | null; atrasada: boolean; valor_estimado: number | null;
  motivo_perda: keyof typeof MOTIVOS_DE_PERDA | null; criado_em: string; encerrado_em: string | null;
};

// Funil da loja do turno (lote L5b: ORA-CRM-004). Quem atende vê as suas; a gerência, a loja inteira (e pode
// filtrar as próprias). A origem do contato fica guardada para medir as campanhas.
export default async function Funil({ searchParams }: { searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro; ver?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DO_CRM, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const [atende, buscaCliente] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "crm.atender", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "cliente.buscar", p_unidade: unidade }),
  ]);
  if (atende.error || buscaCliente.error) throw new FalhaDoServico("tem_permissao");
  if (!atende.data) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Seu papel não atende clientes nesta loja.</Aviso></MoldeReal>;
  const funil = await supabase.rpc("crm_funil");
  if (funil.error) throw new FalhaDoServico("crm_funil");
  const { gerencia, oportunidades } = funil.data as unknown as { gerencia: boolean; oportunidades: OportunidadeDoFunil[] };
  const soMinhas = gerencia && textoDoParametro(parametros.ver) === "minhas";
  const lista = soMinhas ? oportunidades.filter((o) => o.responsavel_id === usuario.id) : oportunidades;
  const abertas = lista.filter((o) => ETAPAS_ABERTAS.includes(o.etapa));
  const encerradas = lista.filter((o) => !ETAPAS_ABERTAS.includes(o.etapa));
  const atrasadas = abertas.filter((o) => o.atrasada).length;

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Funil de oportunidades"
        subtitulo={`${abertas.length} em andamento${atrasadas ? `, ${atrasadas} com o próximo passo atrasado` : ""}. Cada mudança fica no histórico com quem fez e quando.`}
        acao={<BotaoLink href="/crm/agenda" tamanho="sm" variante="secundario"><CalendarClock aria-hidden className="size-4" /> Agenda</BotaoLink>} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CRM[erro]}</Aviso>}
      {gerencia && (
        <div className="mt-4"><FiltroSegmentado rotulo="Mostrar" opcoes={[
          { href: "/crm", rotulo: "Da loja", ativo: !soMinhas, contagem: oportunidades.length },
          { href: "/crm?ver=minhas", rotulo: "Minhas", ativo: soMinhas },
        ]} /></div>
      )}

      <details className="mt-4 rounded-xl border border-borda bg-white px-3 py-2">
        <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao"><Plus aria-hidden className="size-4" /> Nova oportunidade</summary>
        {buscaCliente.data ? (
          <form action={registrarOportunidade} className="mt-2 space-y-3">
            <input type="hidden" name="chave" value={`form:${randomUUID()}`} />
            <div className="space-y-1"><p className="text-sm font-medium">Cliente (CPF ou telefone completos; cadastre antes se for novo)</p><BuscaDeCliente modo="escolher" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">De onde veio<select name="origem" required defaultValue="" className={campo}>
                <option value="" disabled>escolha</option>{Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="block text-sm font-medium">Campanha (opcional)<input name="campanha" maxLength={120} placeholder="Black Friday" className={campo} /></label>
              <label className="block text-sm font-medium sm:col-span-2">Interesse<input name="interesse" required minLength={3} maxLength={200} placeholder="Galaxy A15 e chip" className={campo} /></label>
              <label className="block text-sm font-medium">Valor estimado (R$, opcional)<input name="valor_estimado" inputMode="decimal" placeholder="1.299,90" className={campo} /></label>
              <span />
              <label className="block text-sm font-medium">Próximo passo (opcional)<input name="proximo_passo" maxLength={200} placeholder="Ligar para mostrar o aparelho" className={campo} /></label>
              <label className="block text-sm font-medium">Quando<input name="proximo_passo_em" type="datetime-local" className={campo} /></label>
            </div>
            <Botao type="submit">Registrar oportunidade</Botao>
          </form>
        ) : <p className="mt-2 text-sm text-suave">Seu papel não busca clientes nesta loja.</p>}
      </details>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ETAPAS_ABERTAS.map((etapa) => {
          const daEtapa = abertas.filter((o) => o.etapa === etapa);
          return (
            <section key={etapa} aria-label={ETAPAS[etapa].nome} className="rounded-xl bg-fundo p-3">
              <p className="mb-2 flex items-center justify-between text-sm font-semibold">{ETAPAS[etapa].nome}<span className="numeros rounded-full bg-white px-2 text-xs text-suave">{daEtapa.length}</span></p>
              <ul className="space-y-2">
                {daEtapa.map((o) => (
                  <li key={o.id}>
                    <Link href={`/crm/${o.id}`} className="block rounded-lg border border-borda bg-white p-2.5 text-sm shadow-sm hover:border-acao">
                      <span className="block font-medium leading-5">{o.cliente}</span>
                      <span className="block text-xs text-suave">{o.interesse}{o.valor_estimado ? ` · ${brl(o.valor_estimado)}` : ""}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1"><Selo tom="info">{ORIGENS[o.origem] ?? o.origem}</Selo>{gerencia && <Selo tom="neutro">{o.responsavel}</Selo>}
                        {o.proximo_passo && <Selo tom={o.atrasada ? "perigo" : "neutro"}>{o.atrasada ? "atrasado: " : ""}{o.proximo_passo} · {quando(o.proximo_passo_em)}</Selo>}</span>
                    </Link>
                  </li>
                ))}
                {daEtapa.length === 0 && <li className="text-xs text-suave">Nenhuma</li>}
              </ul>
            </section>
          );
        })}
      </div>

      <Cartao className="mt-4" titulo="Encerradas nos últimos 30 dias" icone={Filter}>
        <ul className="divide-y divide-borda text-sm">
          {encerradas.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/crm/${o.id}`} className="font-semibold text-acao">nº {o.numero} · {o.cliente}</Link>
              <span className="flex items-center gap-2 text-xs text-suave"><Selo tom={ETAPAS[o.etapa].tom}>{ETAPAS[o.etapa].nome}</Selo>
                {o.motivo_perda ? MOTIVOS_DE_PERDA[o.motivo_perda] : ""} · {quando(o.encerrado_em)}</span>
            </li>
          ))}
          {encerradas.length === 0 && <li className="py-2 text-suave">Nenhuma encerrada no período.</li>}
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

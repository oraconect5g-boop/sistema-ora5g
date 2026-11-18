import { randomUUID } from "node:crypto";

import { CalendarClock, CalendarPlus, Route } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, BotaoLink, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ERROS_DO_CRM, TIPOS_DE_ATIVIDADE } from "../../../lib/crm/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { criarAtividade, encerrarAtividade } from "../acoes";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
const OK = { agendada: "Atividade agendada.", feita: "Atividade concluída.", cancelada: "Atividade cancelada." } as const;
type Atividade = {
  id: string; tipo: keyof typeof TIPOS_DE_ATIVIDADE; descricao: string; vence_em: string; atrasada: boolean; responsavel: string; responsavel_id: string;
  cliente: string | null; cliente_id: string | null; oportunidade_id: string | null; oportunidade_numero: number | null;
};

// Agenda da loja do turno (lote L5b: ORA-CRM-005): ligações, mensagens, visitas e tarefas abertas, da mais antiga
// para a mais nova. Cada um vê as suas; a gerência, as da loja. Concluir e cancelar pedem o resultado.
export default async function Agenda({ searchParams }: { searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DO_CRM, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const atende = permite(sessao, "crm.atender");
  if (!atende) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Seu papel não atende clientes nesta loja.</Aviso></MoldeReal>;
  const agenda = await supabase.rpc("crm_agenda");
  if (agenda.error) throw new FalhaDoServico("crm_agenda");
  const { gerencia, atividades } = agenda.data as unknown as { gerencia: boolean; atividades: Atividade[] };
  const atrasadas = atividades.filter((a) => a.atrasada).length;

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo={gerencia ? "Agenda da loja" : "Minha agenda"}
        subtitulo={`${atividades.length} atividade(s) em aberto${atrasadas ? `, ${atrasadas} atrasada(s)` : ""}.`}
        acao={<BotaoLink href="/crm" tamanho="sm" variante="secundario"><Route aria-hidden className="size-4" /> Funil</BotaoLink>} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CRM[erro]}</Aviso>}

      <Cartao className="mt-4" titulo="Em aberto" icone={CalendarClock}>
        <ul className="divide-y divide-borda text-sm">
          {atividades.map((a) => (
            <li key={a.id} className="space-y-1 py-3">
              <p className="flex flex-wrap items-center gap-2"><Selo tom="neutro">{TIPOS_DE_ATIVIDADE[a.tipo] ?? a.tipo}</Selo><span className="font-medium">{a.descricao}</span>
                {a.atrasada && <Selo tom="perigo">atrasada</Selo>}</p>
              <p className="text-xs text-suave">{quando(a.vence_em)}{gerencia ? ` · ${a.responsavel}` : ""}{a.cliente ? ` · ${a.cliente}` : ""}
                {a.oportunidade_id && <> · <Link href={`/crm/${a.oportunidade_id}`} className="font-semibold text-acao">oportunidade nº {a.oportunidade_numero}</Link></>}</p>
              <form action={encerrarAtividade} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="atividade" value={a.id} /><input type="hidden" name="voltar" value="agenda" />
                <label className="min-w-0 flex-1 text-xs font-medium">Resultado<input name="resultado" required minLength={3} maxLength={300} className={campo} /></label>
                <select name="decisao" aria-label="Como terminou" className={`${campo} w-auto`}><option value="feita">feita</option><option value="cancelada">cancelada</option></select>
                <Botao type="submit" tamanho="sm" variante="secundario">Encerrar</Botao>
              </form>
            </li>
          ))}
          {atividades.length === 0 && <li className="py-2 text-suave">Nada em aberto.</li>}
        </ul>
      </Cartao>

      <Cartao className="mt-4" titulo="Nova tarefa" subtitulo="Para mim. Atividade com cliente se agenda na oportunidade." icone={CalendarPlus}>
        <form action={criarAtividade} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="voltar" value="agenda" /><input type="hidden" name="chave" value={`form:${randomUUID()}`} />
          <label className="text-sm font-medium">Tipo<select name="tipo" defaultValue="tarefa" className={campo}>{Object.entries(TIPOS_DE_ATIVIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-sm font-medium">Vence em<input name="vence_em" type="datetime-local" required className={campo} /></label>
          <label className="text-sm font-medium sm:col-span-2">Descrição<input name="descricao" required minLength={3} maxLength={200} placeholder="Conferir a vitrine" className={campo} /></label>
          <Botao type="submit" tamanho="sm" className="sm:justify-self-start">Agendar</Botao>
        </form>
      </Cartao>
    </MoldeReal>
  );
}

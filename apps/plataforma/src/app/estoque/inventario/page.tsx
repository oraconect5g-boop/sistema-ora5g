import { randomUUID } from "node:crypto";

import { ArrowLeft, ClipboardList, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ERROS_DO_INVENTARIO, SITUACOES_DO_INVENTARIO } from "../../../lib/estoque/inventario";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { abrirInventario } from "./acoes";
import { EscolherItens } from "./EscolherItens";

export const metadata: Metadata = { title: "Inventário" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");

// Inventário cíclico (lote L4b: ORA-INV-008): a loja conta um grupo de itens; a diferença só vira
// ajuste no livro depois da aprovação de outra pessoa com estoque.ajustar.
export default async function Inventarios({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DO_INVENTARIO, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const [confere, ajusta] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "estoque.conferir", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "estoque.ajustar", p_unidade: unidade }),
  ]);
  if (confere.error || ajusta.error) throw new FalhaDoServico("tem_permissao");
  if (!confere.data && !ajusta.data) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Seu papel não faz inventário nesta loja.</Aviso></MoldeReal>;
  }
  const lista = await supabase.from("inventarios").select("id, numero, descricao, situacao, criado_em, enviado_em, decidido_em").eq("unidade_id", unidade).order("criado_em", { ascending: false }).limit(30);
  if (lista.error) throw new FalhaDoServico("inventarios");

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/estoque" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Estoque</Link>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Inventário" subtitulo="Conte um grupo de itens; a diferença só entra no estoque depois que outra pessoa aprova. Nada se apaga: fica a trilha do antes, do contado e do ajuste." />
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_INVENTARIO[erro]}</Aviso>}

      {confere.data && (
        <Cartao className="mt-4" titulo="Novo inventário" icone={ClipboardList}>
          <form action={abrirInventario} className="space-y-3">
            <input type="hidden" name="chave" value={`form:${randomUUID()}`} />
            <label className="block text-sm font-medium">Descrição<input name="descricao" required minLength={3} maxLength={120} placeholder="Capas e películas do balcão" className={campo} /></label>
            <EscolherItens />
            <Botao type="submit">Abrir inventário</Botao>
          </form>
        </Cartao>
      )}

      <Cartao className="mt-4" titulo="Inventários desta loja" icone={ListChecks}>
        <ul className="divide-y divide-borda text-sm">
          {lista.data.map((i) => {
            const s = SITUACOES_DO_INVENTARIO[i.situacao as keyof typeof SITUACOES_DO_INVENTARIO];
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/estoque/inventario/${i.id}`} className="font-semibold text-acao">nº {i.numero} · {i.descricao}</Link>
                <span className="flex items-center gap-2 text-xs text-suave"><Selo tom={s?.tom ?? "neutro"}>{s?.texto ?? i.situacao}</Selo>{quando(i.criado_em)}</span>
              </li>
            );
          })}
          {lista.data.length === 0 && <li className="py-2 text-suave">Nenhum inventário ainda.</li>}
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

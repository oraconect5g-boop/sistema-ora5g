import { MapPin, Store } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Marca } from "../../componentes/Marca";
import { Aviso, Botao, Cartao } from "../../componentes/ui";
import { horaDoFimDoTurno } from "../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { chaveDoCatalogo, type ValorDeParametro } from "../../lib/parametros";
import { escolherLoja } from "./acoes";

export const metadata: Metadata = { title: "Escolher a loja" };
export const dynamic = "force-dynamic";

const ERROS = { loja: "Esta loja não está liberada para você. Escolha uma da lista." } as const;

// Depois do login: a pessoa escolhe em qual loja vai trabalhar neste turno. Com uma loja só,
// ela já é escolhida (um clique a menos). A lista vem do banco pelo RLS (só lojas com vínculo).
export default async function EscolherLoja({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro }> }) {
  const erro = chaveDoCatalogo(ERROS, (await searchParams).erro);
  const { supabase, situacao } = await obterSessao({ exigirLoja: false });
  const { data: unidades, error } = await supabase.from("unidades").select("id, nome, tipo, cidade").order("nome");
  if (error) throw new FalhaDoServico("unidades");

  if (!erro && !situacao.unidade_id && unidades.length === 1 && unidades[0]) {
    const escolhida = await supabase.rpc("selecionar_unidade", { p_unidade: unidades[0].id });
    if (escolhida.error) throw new FalhaDoServico("selecionar_unidade");
    if (escolhida.data) redirect("/inicio");
  }

  const fim = horaDoFimDoTurno(situacao.turno_termina_em);
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Marca tamanho="text-2xl" />
      <Cartao titulo="Em qual loja você está?" subtitulo={fim ? `Seu turno vai até ${fim}. Depois disso, entre de novo.` : undefined} icone={Store} className="mt-6">
        {erro && <Aviso tom="perigo" className="mb-3">{ERROS[erro]}</Aviso>}
        {unidades.length === 0 ? (
          <Aviso tom="aviso">Você ainda não tem loja liberada. Peça ao dono ou ao administrador para incluir você na equipe.</Aviso>
        ) : (
          <ul className="space-y-2">
            {unidades.map((u) => (
              <li key={u.id}>
                <form action={escolherLoja}>
                  <input type="hidden" name="unidade" value={u.id} />
                  <Botao type="submit" variante={u.id === situacao.unidade_id ? "primario" : "secundario"} className="w-full justify-between" tamanho="lg">
                    <span className="text-left">{u.nome}{u.tipo === "excecao" ? <span className="block text-xs font-normal opacity-80">local de exceção (DEFEITOS) · não vende</span> : u.tipo === "deposito" ? <span className="block text-xs font-normal opacity-80">depósito (centro de distribuição) · não vende</span> : null}{u.cidade ? <span className="block text-xs font-normal opacity-80"><MapPin aria-hidden className="mr-1 inline size-3" />{u.cidade}</span> : null}</span>
                    {u.id === situacao.unidade_id && <span className="text-xs">atual</span>}
                  </Botao>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </main>
  );
}

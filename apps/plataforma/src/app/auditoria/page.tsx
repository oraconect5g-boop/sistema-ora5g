import { ScrollText, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Cartao, EstadoVazio, FiltroSegmentado, Selo, TituloPagina } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { acaoDeAlerta, nomeDaAcao, PERIODOS_DA_AUDITORIA } from "../../lib/auditoria/regras";
import { inicioDoPeriodo } from "../../lib/vendas/lista";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";

export const metadata: Metadata = { title: "Auditoria" };
export const dynamic = "force-dynamic";

const LIMITE = 200;
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));

// Auditoria real (revisão de 10/11/2026): o que aconteceu na loja do turno e na rede, quem fez e
// quando. Só leitura, pelo RLS (auditoria.ver). O registro é só de inserção no banco.
export default async function Auditoria({ searchParams }: { searchParams: Promise<{ periodo?: ValorDeParametro; alertas?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const periodo = chaveDoCatalogo(PERIODOS_DA_AUDITORIA, parametros.periodo) ?? "hoje";
  const soAlertas = textoDoParametro(parametros.alertas) === "1";
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;

  const pode = await supabase.rpc("tem_permissao", { p_permissao: "auditoria.ver", p_unidade: unidade });
  if (pode.error) throw new FalhaDoServico("auditoria_permissao");
  if (!pode.data) {
    return (
      <MoldeReal sessao={sessao}>
        <TituloPagina titulo="Auditoria" />
        <Aviso tom="aviso" titulo="Sem permissão">A auditoria é do dono, do gerente e do administrador. O banco também recusa, mesmo que alguém digite o endereço.</Aviso>
      </MoldeReal>
    );
  }
  // Eventos desta loja e os da rede (sem loja), do período; o RLS confere cada linha.
  const eventos = await supabase.from("auditoria").select("id, ocorrido_em, usuario_id, unidade_id, acao, alvo_tipo, alvo_id, motivo, origem")
    .or(`unidade_id.eq.${unidade},unidade_id.is.null`).gte("ocorrido_em", inicioDoPeriodo(periodo)).order("id", { ascending: false }).limit(LIMITE);
  if (eventos.error) throw new FalhaDoServico("auditoria");
  const visiveis = soAlertas ? eventos.data.filter((e) => acaoDeAlerta(e.acao)) : eventos.data;
  const pessoaIds = [...new Set(visiveis.flatMap((e) => (e.usuario_id ? [e.usuario_id] : [])))];
  const pessoas = pessoaIds.length ? await supabase.from("perfis_usuario").select("id, nome").in("id", pessoaIds) : { data: [], error: null };
  if (pessoas.error) throw new FalhaDoServico("auditoria_pessoas");
  const quem = (id: string | null) => (id ? pessoas.data.find((p) => p.id === id)?.nome ?? "Pessoa de fora da sua equipe" : "Sistema");
  const href = (mudanca: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const valores = { periodo: periodo === "hoje" ? undefined : periodo, alertas: soAlertas ? "1" : undefined, ...mudanca };
    for (const [k, v] of Object.entries(valores)) if (v) p.set(k, v);
    const texto = p.toString();
    return `/auditoria${texto ? `?${texto}` : ""}`;
  };

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Auditoria" subtitulo="Quem fez o quê e quando, nesta loja e na rede. O registro não pode ser apagado nem alterado." />
      <div className="flex flex-wrap items-center gap-3">
        <FiltroSegmentado rotulo="Período" opcoes={(Object.keys(PERIODOS_DA_AUDITORIA) as (keyof typeof PERIODOS_DA_AUDITORIA)[]).map((p) => ({ href: href({ periodo: p === "hoje" ? undefined : p }), rotulo: PERIODOS_DA_AUDITORIA[p].rotulo, ativo: p === periodo }))} />
        <FiltroSegmentado rotulo="O que mostrar" opcoes={[{ href: href({ alertas: undefined }), rotulo: "Tudo", ativo: !soAlertas }, { href: href({ alertas: "1" }), rotulo: "Só alertas", ativo: soAlertas }]} />
      </div>
      <Cartao corpo="p-0" titulo={`${visiveis.length} registro(s)`} icone={ScrollText}>
        {visiveis.length === 0 ? (
          <div className="p-4 sm:p-5"><EstadoVazio titulo="Nada no período" icone={ScrollText}>Tente um período maior.</EstadoVazio></div>
        ) : (
          <ul className="divide-y divide-borda">
            {visiveis.map((e) => (
              <li key={e.id} className="grid gap-1 px-4 py-3 text-sm sm:px-5">
                <p className="flex flex-wrap items-center gap-2">
                  {acaoDeAlerta(e.acao) && <ShieldAlert aria-hidden className="size-4 text-perigo" />}
                  <span className="font-semibold">{nomeDaAcao(e.acao)}</span>
                  {e.unidade_id === null && <Selo tom="info">rede</Selo>}
                </p>
                <p className="text-xs text-suave">{quando(e.ocorrido_em)} · {quem(e.usuario_id)}{e.alvo_tipo ? ` · ${e.alvo_tipo} ${e.alvo_id ? String(e.alvo_id).slice(0, 8) : ""}` : ""}{e.origem ? ` · ${e.origem}` : ""}</p>
                {e.motivo && <p className="text-xs">Motivo: {e.motivo}</p>}
              </li>
            ))}
          </ul>
        )}
        {eventos.data.length === LIMITE && <p className="border-t border-borda px-5 py-3 text-xs text-suave">Mostrando os {LIMITE} registros mais recentes do período.</p>}
      </Cartao>
    </MoldeReal>
  );
}

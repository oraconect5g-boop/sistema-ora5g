import { CircleAlert } from "lucide-react";
import Link from "next/link";

import { Cartao, Selo } from "../../componentes/ui";
import { FalhaDoServico, type obterSessao } from "../../lib/acesso/sessao";

type Sessao = Awaited<ReturnType<typeof obterSessao>>;
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Pendências da venda (lote L6a: ORA-POS-009). O que espera alguém nesta loja: venda em aberto ou esperando
// aprovação de desconto (de quem vende), nota com correção pedida, estorno a confirmar e item a conferir na
// volta (o RLS decide de novo o que cada um vê). Cada linha leva à tela que resolve, sem refazer nada:
// as ações usam as mesmas chaves de idempotência, então repetir não duplica.
export async function Pendencias({ sessao, unidade }: { sessao: Sessao; unidade: string }) {
  const { supabase, usuario } = sessao;
  const [abertas, notas, estornos, retornos] = await Promise.all([
    supabase.from("vendas").select("id, numero, situacao, criado_em").eq("vendedor_id", usuario.id).eq("unidade_id", unidade)
      .in("situacao", ["rascunho", "aguardando_aprovacao"]).order("criado_em").limit(20),
    supabase.from("notas_pedidos").select("id, venda_id, situacao, criado_em").eq("unidade_id", unidade).eq("situacao", "correcao_solicitada").order("criado_em").limit(20),
    supabase.from("estornos_externos").select("id, numero, venda_id, meio, valor_centavos, solicitado_em").eq("unidade_id", unidade).eq("situacao", "pendente").order("solicitado_em").limit(20),
    supabase.from("venda_retornos").select("id, venda_id, solicitado_em").eq("unidade_id", unidade).eq("situacao", "pendente").order("solicitado_em").limit(20),
  ]);
  if (abertas.error || notas.error || estornos.error || retornos.error) throw new FalhaDoServico("pendencias");
  const itens = [
    ...abertas.data.map((v) => ({ chave: `v:${v.id}`, quando: v.criado_em, href: v.situacao === "rascunho" ? "/vender" : `/vendas/${v.id}`,
      texto: `Venda nº ${v.numero} ${v.situacao === "rascunho" ? "em aberto: retome no PDV" : "esperando aprovação de desconto"}`, tom: "aviso" as const })),
    ...notas.data.map((n) => ({ chave: `n:${n.id}`, quando: n.criado_em, href: `/vendas/${n.venda_id}`, texto: "Nota fiscal com correção pedida: corrija o destinatário", tom: "perigo" as const })),
    ...estornos.data.map((e) => ({ chave: `e:${e.id}`, quando: e.solicitado_em, href: `/vendas/${e.venda_id}`, texto: `Estorno nº ${e.numero} a confirmar com o comprovante`, tom: "aviso" as const })),
    ...retornos.data.map((r) => ({ chave: `r:${r.id}`, quando: r.solicitado_em, href: `/vendas/${r.venda_id}`, texto: "Item da venda cancelada a conferir na volta", tom: "aviso" as const })),
  ].sort((a, b) => a.quando.localeCompare(b.quando));
  if (itens.length === 0) return null;
  return (
    <Cartao className="mt-4" titulo={`Pendências (${itens.length})`} subtitulo="O que espera alguém nesta loja. Resolver de novo não duplica nada." icone={CircleAlert}>
      <ul className="divide-y divide-borda text-sm">
        {itens.map((i) => (
          <li key={i.chave} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Link href={i.href} className="font-semibold text-acao">{i.texto}</Link>
            <span className="flex items-center gap-2 text-xs text-suave"><Selo tom={i.tom}>pendente</Selo>{quando(i.quando)}</span>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

import { BadgePercent } from "lucide-react";
import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../componentes/ui";
import { permite } from "../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { centavosDoBanco } from "../../lib/dinheiro";
import { brl } from "../../lib/formato";
import { chaveDoCatalogo, type ValorDeParametro } from "../../lib/parametros";
import { ERROS_DA_VENDA } from "../../lib/vendas/regras";
import { decidirAprovacao } from "../caixa/acoes";

export const metadata: Metadata = { title: "Aprovações de desconto" };
export const dynamic = "force-dynamic";

const OK = { aprovar: "Desconto aprovado: o vendedor já pode concluir.", negar: "Desconto negado.", vencido: "O pedido venceu ou o item mudou; o vendedor precisa pedir de novo." } as const;
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";

// Pedidos de desconto da loja do turno (ADR-004). Só quem tem desconto.aprovar; nunca o próprio pedido.
export default async function Aprovacoes({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; ok?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DA_VENDA, parametros.erro);
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const pode = permite(sessao, "desconto.aprovar");
  const pedidos = pode
    ? await supabase.from("aprovacoes_desconto").select("id, solicitado_por, preco_centavos, desconto_centavos, maximo_sem_aprovacao_centavos, abaixo_do_custo, motivo, expira_em, venda_id")
        .eq("unidade_id", unidade).eq("situacao", "pendente").order("solicitado_em")
    : { data: [], error: null };
  if (pedidos.error) throw new FalhaDoServico("aprovacoes");
  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Aprovações de desconto" />
      {erro && <Aviso tom="perigo">{ERROS_DA_VENDA[erro]}</Aviso>}
      {ok && <Aviso tom={ok === "vencido" ? "aviso" : "sucesso"}>{OK[ok]}</Aviso>}
      {!pode ? <Aviso tom="aviso">Só o gerente ou o dono da loja aprovam desconto.</Aviso> : (
        <Cartao titulo={`${pedidos.data.length} pedido(s) pendente(s)`} icone={BadgePercent}>
          {pedidos.data.length === 0 ? <p className="text-sm text-suave">Nada esperando aprovação.</p> : (
            <ul className="divide-y divide-borda">
              {pedidos.data.map((p) => {
                const preco = centavosDoBanco(p.preco_centavos);
                const desconto = centavosDoBanco(p.desconto_centavos);
                const proprio = p.solicitado_por === usuario.id;
                return (
                  <li key={p.id} className="space-y-2 py-3 text-sm">
                    <p className="numeros">Preço {brl(preco)} · desconto pedido <strong>{brl(desconto)}</strong> ({((desconto / Math.max(preco, 1)) * 100).toFixed(1).replace(".", ",")}%) · sem aprovação até {brl(centavosDoBanco(p.maximo_sem_aprovacao_centavos))}</p>
                    {p.abaixo_do_custo && <Selo tom="perigo" ponto>abaixo do custo</Selo>}
                    <p className="text-xs text-suave">Motivo: {p.motivo} · vale até {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(p.expira_em))}</p>
                    {proprio ? <p className="text-xs text-aviso">Pedido seu: outra pessoa aprova.</p> : (
                      <form action={decidirAprovacao} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="pedido" value={p.id} />
                        <label className="min-w-0 flex-1 text-xs font-medium">Observação<input name="observacao" className={campo} /></label>
                        <Botao type="submit" name="decisao" value="aprovar" tamanho="sm">Aprovar</Botao>
                        <Botao type="submit" name="decisao" value="negar" tamanho="sm" variante="perigo">Negar</Botao>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      )}
    </MoldeReal>
  );
}

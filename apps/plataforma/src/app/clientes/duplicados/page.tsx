import { ArrowLeft, Combine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ERROS_DO_CLIENTE } from "../../../lib/clientes/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { marcarDiferentes, mesclarClientes } from "../acoes";

export const metadata: Metadata = { title: "Cadastros duplicados" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const OK = { diferentes: "Par marcado como pessoas diferentes; ele sai da lista." } as const;
type Lado = { id: string; numero: number; nome: string; documento: string | null; telefone: string | null; compras: number; criado_em: string };
type Par = { motivo: string; a: Lado; b: Lado };
const dia = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(iso));

// Cadastros duplicados (lote L5c: ORA-CRM-006), só para o dono. Mesclar escolhe o cadastro que fica: ele recebe
// os dados que faltavam e todo o histórico do outro (compras, oportunidades, atividades, consentimentos).
export default async function Duplicados({ searchParams }: { searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DO_CLIENTE, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;
  const pode = permite(sessao, "cliente.mesclar");
  if (!pode) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Mesclar cadastros é do dono.</Aviso></MoldeReal>;
  const lista = await supabase.rpc("clientes_duplicados");
  if (lista.error) throw new FalhaDoServico("clientes_duplicados");
  const pares = lista.data as unknown as Par[];
  const ladoTexto = (l: Lado) => `nº ${l.numero}${l.documento ? ` · ${l.documento}` : ""}${l.telefone ? ` · ${l.telefone}` : ""} · ${l.compras} compra(s) · desde ${dia(l.criado_em)}`;

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/clientes" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Clientes</Link>
      <TituloPagina titulo="Cadastros duplicados" subtitulo="Candidatos por mesmo telefone ou mesmo nome e nascimento. Mesclar não apaga nada: o cadastro que sai aponta para o que fica." />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CLIENTE[erro]}</Aviso>}
      {pares.length === 0 && <Aviso tom="info" className="mt-4">Nenhum candidato a duplicado agora.</Aviso>}
      <div className="mt-4 space-y-3">
        {pares.map((p) => (
          <Cartao key={`${p.a.id}:${p.b.id}`} titulo={`${p.a.nome} × ${p.b.nome}`} subtitulo={p.motivo} icone={Combine}>
            <ul className="space-y-1 text-sm">
              <li><Link href={`/clientes/${p.a.id}`} className="font-semibold text-acao">{p.a.nome}</Link> <span className="numeros text-xs text-suave">{ladoTexto(p.a)}</span></li>
              <li><Link href={`/clientes/${p.b.id}`} className="font-semibold text-acao">{p.b.nome}</Link> <span className="numeros text-xs text-suave">{ladoTexto(p.b)}</span></li>
            </ul>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <form action={mesclarClientes} className="space-y-2 rounded-xl border border-borda p-3">
                <fieldset className="space-y-1 text-sm">
                  <legend className="font-medium">Qual cadastro fica?</legend>
                  <label className="flex min-h-10 items-center gap-2"><input type="radio" name="manter" value={p.a.id} required className="size-4 accent-acao" /> {p.a.nome} (nº {p.a.numero})</label>
                  <label className="flex min-h-10 items-center gap-2"><input type="radio" name="manter" value={p.b.id} className="size-4 accent-acao" /> {p.b.nome} (nº {p.b.numero})</label>
                </fieldset>
                <input type="hidden" name="a" value={p.a.id} /><input type="hidden" name="b" value={p.b.id} />
                <label className="block text-sm font-medium">Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={200} placeholder="Mesma pessoa, confirmado no balcão" className={campo} /></label>
                <Botao type="submit" tamanho="sm">Mesclar</Botao>
              </form>
              <form action={marcarDiferentes} className="space-y-2 rounded-xl border border-borda p-3">
                <input type="hidden" name="a" value={p.a.id} /><input type="hidden" name="b" value={p.b.id} />
                <label className="block text-sm font-medium">Não são a mesma pessoa. Motivo<input name="motivo" required minLength={3} maxLength={200} placeholder="Mãe e filha com o mesmo telefone" className={campo} /></label>
                <Botao type="submit" tamanho="sm" variante="secundario">Marcar como diferentes</Botao>
              </form>
            </div>
          </Cartao>
        ))}
      </div>
    </MoldeReal>
  );
}

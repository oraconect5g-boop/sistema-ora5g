import { randomUUID } from "node:crypto";

import { ArrowLeft, History, PackagePlus, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { centavosDoBanco } from "../../../lib/dinheiro";
import { CONDICOES, ERROS_DA_ENTRADA, TIPOS_DE_ENTRADA } from "../../../lib/estoque/entrada";
import { brl } from "../../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { estornarEntrada, salvarFornecedor } from "./acoes";
import { FormularioEntrada } from "./FormularioEntrada";

export const metadata: Metadata = { title: "Entrada de mercadoria" };
export const dynamic = "force-dynamic";

const OK = {
  registrada: "Entrada registrada: o estoque e o custo já estão atualizados.",
  repetida: "Esta entrada já tinha sido registrada por este formulário: nada foi duplicado.",
  estornada: "Entrada estornada: os itens saíram do estoque pelo livro, com o motivo.",
  ja_estornada: "Esta entrada já estava estornada.",
  fornecedor: "Fornecedor cadastrado.",
} as const;
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");

type Entrada = {
  id: string; numero: number; tipo: string; documento: string | null; situacao: string; total_unidades: number; total_custo_centavos: number | string | null;
  criado_em: string; motivo_estorno: string | null; fornecedores: { nome: string } | null;
  entrada_itens: { linha: number; quantidade: number; custo_unitario_centavos: number | string | null; condicao: string; variantes: { sku: string; nome: string } | null }[];
};

// Entrada de mercadoria (lote L4a: ORA-INV-009, ORA-INV-004, ORA-CAT-008): compra de fornecedor ou carga
// inicial na loja do turno, por quem tem estoque.receber (dono e gerente). O custo da entrada vira o
// custo atual da variação; o estorno devolve tudo pelo livro enquanto os itens estiverem livres.
export default async function EntradaDeMercadoria({ searchParams }: { searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro; form?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DA_ENTRADA, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;

  const permitido = await supabase.rpc("tem_permissao", { p_permissao: "estoque.receber", p_unidade: unidade });
  if (permitido.error) throw new FalhaDoServico("tem_permissao");
  if (!permitido.data) {
    return (
      <MoldeReal sessao={sessao}>
        <Aviso tom="aviso" className="mt-6">Receber mercadoria é da gerência da loja (dono e gerente). O banco também recusa, mesmo que alguém digite o endereço.</Aviso>
      </MoldeReal>
    );
  }
  const [fornecedores, entradas] = await Promise.all([
    supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("entradas_estoque")
      .select("id, numero, tipo, documento, situacao, total_unidades, total_custo_centavos, criado_em, motivo_estorno, fornecedores(nome), entrada_itens(linha, quantidade, custo_unitario_centavos, condicao, variantes(sku, nome))")
      .eq("unidade_id", unidade).order("criado_em", { ascending: false }).limit(15),
  ]);
  if (fornecedores.error || entradas.error) throw new FalhaDoServico("entradas");
  const lista = entradas.data as unknown as Entrada[];

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/estoque" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Estoque</Link>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Entrada de mercadoria" subtitulo="Compra de fornecedor ou carga inicial. Aparelho e chip entram pelo IMEI/ICCID; acessório por quantidade. Tudo entra numa transação só." />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_ENTRADA[erro]}</Aviso>}

      <Cartao className="mt-4" titulo="Nova entrada" icone={PackagePlus}>
        <FormularioEntrada unidade={unidade} chave={`form:${randomUUID()}`} fornecedores={fornecedores.data} />
      </Cartao>

      <details className="mt-4 rounded-cartao border border-borda/80 bg-superficie p-4 shadow-cartao" open={textoDoParametro(parametros.form) === "fornecedor" || fornecedores.data.length === 0}>
        <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-semibold"><Truck aria-hidden className="size-4 text-acao" /> Cadastrar fornecedor</summary>
        <form action={salvarFornecedor} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Nome<input name="nome" required minLength={2} maxLength={120} className={campo} /></label>
          <label className="block text-sm font-medium">CNPJ (opcional)<input name="cnpj" inputMode="numeric" className={campo} /></label>
          <label className="block text-sm font-medium sm:col-span-2">Contato (opcional)<input name="contato" maxLength={200} placeholder="telefone ou e-mail do vendedor" className={campo} /></label>
          <label className="block text-sm font-medium sm:col-span-2">Motivo (fica na auditoria)<input name="motivo" required minLength={3} maxLength={200} placeholder="Fornecedor novo" className={campo} /></label>
          <Botao type="submit" variante="secundario" className="sm:col-span-2">Cadastrar fornecedor</Botao>
        </form>
      </details>

      <Cartao className="mt-4" titulo="Últimas entradas desta loja" icone={History}>
        <ul className="divide-y divide-borda text-sm">
          {lista.map((e) => (
            <li key={e.id} className="space-y-1 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <strong>Entrada nº {e.numero}</strong>
                <Selo tom={e.situacao === "estornada" ? "perigo" : "sucesso"}>{e.situacao === "estornada" ? "estornada" : "registrada"}</Selo>
                <span className="text-xs text-suave">{TIPOS_DE_ENTRADA[e.tipo as keyof typeof TIPOS_DE_ENTRADA] ?? e.tipo}{e.fornecedores ? ` · ${e.fornecedores.nome}` : ""}{e.documento ? ` · ${e.documento}` : ""} · {quando(e.criado_em)}</span>
              </p>
              <p className="text-xs text-suave">
                {e.total_unidades} unidade(s){e.total_custo_centavos !== null ? ` · custo ${brl(centavosDoBanco(e.total_custo_centavos))}` : ""}:{" "}
                {e.entrada_itens.sort((a, b) => a.linha - b.linha).map((i) => `${i.variantes?.sku ?? "?"} × ${i.quantidade}${i.condicao !== "novo" ? ` (${CONDICOES[i.condicao as keyof typeof CONDICOES] ?? i.condicao})` : ""}`).join(", ")}
              </p>
              {e.situacao === "estornada" && e.motivo_estorno && <p className="text-xs text-perigo">Estornada: {e.motivo_estorno}</p>}
              {e.situacao === "registrada" && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-perigo">Estornar esta entrada</summary>
                  <form action={estornarEntrada} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="entrada" value={e.id} />
                    <input name="motivo" required minLength={3} maxLength={200} placeholder="Motivo (ex.: lançada na loja errada)" aria-label="Motivo do estorno" className={campo} />
                    <Botao type="submit" tamanho="sm" variante="perigo" className="self-end">Estornar</Botao>
                  </form>
                </details>
              )}
            </li>
          ))}
          {lista.length === 0 && <li className="py-2 text-suave">Nenhuma entrada ainda nesta loja.</li>}
        </ul>
      </Cartao>
    </MoldeReal>
  );
}

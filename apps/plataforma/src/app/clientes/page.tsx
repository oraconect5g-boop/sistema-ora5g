import { ContactRound, ListChecks, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, BotaoLink, Cartao, Selo, TituloPagina } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { BuscaDeCliente } from "./BuscaDeCliente";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(iso));

// Clientes da rede (lote L5a: ORA-CRM-001 e ORA-CRM-003). O cliente é da empresa, não da loja: quem atende
// encontra pela busca exata (CPF/CNPJ ou telefone completos), cada busca registrada; só o dono lista.
export default async function Clientes() {
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const [busca, cadastro, lista] = await Promise.all([
    supabase.rpc("tem_permissao", { p_permissao: "cliente.buscar", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "cliente.cadastrar", p_unidade: unidade }),
    supabase.rpc("tem_permissao", { p_permissao: "cliente.exportar", p_unidade: unidade }),
  ]);
  if (busca.error || cadastro.error || lista.error) throw new FalhaDoServico("tem_permissao");
  if (!busca.data) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Seu papel não consulta clientes.</Aviso></MoldeReal>;
  }
  // Só o dono (cliente.exportar) lê a tabela; para os demais o banco devolve vazio (ADR-002, T11).
  const recentes = lista.data
    ? await supabase.from("clientes").select("id, numero, nome, documento_mascara, telefone_mascara, situacao, criado_em").order("criado_em", { ascending: false }).limit(30)
    : null;
  if (recentes?.error) throw new FalhaDoServico("clientes");

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Clientes" subtitulo="O cliente é da rede, não da loja: encontre pelo CPF/CNPJ ou pelo telefone completos. Cada consulta fica registrada (LGPD)."
        acao={cadastro.data ? <BotaoLink href="/clientes/novo" tamanho="sm"><UserPlus aria-hidden className="size-4" /> Novo cliente</BotaoLink> : undefined} />
      <Cartao className="mt-4" titulo="Buscar cliente" icone={ContactRound}>
        <BuscaDeCliente modo="ficha" completa={Boolean(lista.data)} />
      </Cartao>
      {recentes && (
        <Cartao className="mt-4" titulo="Cadastrados por último" subtitulo="Lista da rede, só para o dono" icone={ListChecks}>
          <ul className="divide-y divide-borda text-sm">
            {recentes.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/clientes/${c.id}`} className="font-semibold text-acao">{c.nome}</Link>
                <span className="numeros flex flex-wrap items-center gap-2 text-xs text-suave">nº {c.numero}{c.documento_mascara ? ` · ${c.documento_mascara}` : ""}{c.telefone_mascara ? ` · ${c.telefone_mascara}` : ""} · {quando(c.criado_em)}
                  {c.situacao !== "ativo" && <Selo tom="neutro">inativo</Selo>}</span>
              </li>
            ))}
            {recentes.data.length === 0 && <li className="py-2 text-suave">Nenhum cliente cadastrado ainda.</li>}
          </ul>
        </Cartao>
      )}
    </MoldeReal>
  );
}

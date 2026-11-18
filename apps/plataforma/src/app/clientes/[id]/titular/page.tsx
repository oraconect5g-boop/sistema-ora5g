import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MoldeReal } from "../../../../componentes/MoldeReal";
import { Aviso, TituloPagina } from "../../../../componentes/ui";
import { ehUuid } from "../../../../lib/acesso/regras";
import { permite } from "../../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../../lib/acesso/sessao";
import { RelatorioDoTitular } from "./RelatorioDoTitular";

export const metadata: Metadata = { title: "Dados do titular" };
export const dynamic = "force-dynamic";

// QUAL-011a (ORA-QUAL-011; LGPD, art. 18 e 19): o relatório dos dados que a rede guarda sobre o cliente, para responder ao
// pedido dele. Só o dono (cliente.exportar) vê esta tela; o banco confere de novo e pede a senha recente.
export default async function DadosDoTitular({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;
  const exporta = permite(sessao, "cliente.exportar");
  const voltar = <Link href={`/clientes/${id}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Ficha do cliente</Link>;
  if (!exporta) return <MoldeReal sessao={sessao}>{voltar}<Aviso tom="aviso" className="mt-6">Só o dono gera o relatório dos dados do titular.</Aviso></MoldeReal>;
  const ficha = await supabase.rpc("cliente_ficha", { p_cliente: id });
  if (ficha.error?.code === "P0002") notFound();
  if (ficha.error) throw new FalhaDoServico("cliente_ficha");
  const f = ficha.data as unknown as { id: string; numero: number; nome: string; mesclado_em: { id: string; nome: string; numero: number } | null };
  return (
    <MoldeReal sessao={sessao}>
      {voltar}
      <TituloPagina titulo="Dados do titular" subtitulo={`${f.nome} · nº ${f.numero}`} />
      {f.mesclado_em
        ? <Aviso tom="aviso" className="mt-4">Este cadastro foi mesclado em outro: gere o relatório do cliente que ficou, <Link href={`/clientes/${f.mesclado_em.id}/titular`} className="font-semibold underline">{`${f.mesclado_em.nome} (nº ${f.mesclado_em.numero})`}</Link>.</Aviso>
        : <RelatorioDoTitular cliente={id} />}
    </MoldeReal>
  );
}

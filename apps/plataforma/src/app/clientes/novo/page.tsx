import { randomUUID } from "node:crypto";

import { ArrowLeft, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Cartao, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { obterSessao } from "../../../lib/acesso/sessao";
import { FormularioCliente } from "../FormularioCliente";

export const metadata: Metadata = { title: "Novo cliente" };
export const dynamic = "force-dynamic";

// Cadastro de cliente (lote L5a: ORA-CRM-001): dados mínimos por finalidade; o mesmo CPF não entra duas vezes.
export default async function NovoCliente() {
  const sessao = await obterSessao({ exigirLoja: true });
  const pode = permite(sessao, "cliente.cadastrar");
  return (
    <MoldeReal sessao={sessao}>
      <Link href="/clientes" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Clientes</Link>
      <TituloPagina titulo="Novo cliente" subtitulo="Só o necessário: nome e CPF/CNPJ ou telefone. Cada finalidade marcada pede o que precisa; nada além disso fica guardado." />
      {pode
        ? <Cartao className="mt-4" titulo="Dados do cliente" icone={UserPlus}><FormularioCliente chave={`form:${randomUUID()}`} /></Cartao>
        : <Aviso tom="aviso" className="mt-4">Seu papel não cadastra clientes.</Aviso>}
    </MoldeReal>
  );
}

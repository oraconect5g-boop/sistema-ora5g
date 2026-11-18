import { randomUUID } from "node:crypto";

import { ArrowLeft, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BotaoConfirmar } from "../../../componentes/BotaoConfirmar";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Cartao, TituloPagina } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ACESSORIOS, ERROS_DA_OS, somarDias } from "../../../lib/assistencia/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { abrirOrdem } from "../acoes";

export const metadata: Metadata = { title: "Nova ordem de serviço" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
type Ficha = { id: string; nome: string; numero: number; situacao: string; telefone: string | null };

// Abertura da OS (lote L12a: ORA-OS-001): o cliente já vem escolhido pela ficha (busca ou cadastro rápido com WhatsApp).
// O aparelho, o defeito, o estado e os acessórios substituem a folha de papel; as fotos entram logo depois, na OS.
export default async function NovaOrdem({ searchParams }: { searchParams: Promise<{ cliente?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const clienteId = textoDoParametro(parametros.cliente);
  const erro = chaveDoCatalogo(ERROS_DA_OS, parametros.erro);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const pode = permite(sessao, "os.abrir");
  if (!pode) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Abrir ordem de serviço é de quem recebe aparelhos na loja.</Aviso></MoldeReal>;
  if (!ehUuid(clienteId)) {
    return (
      <MoldeReal sessao={sessao}>
        <TituloPagina titulo="Nova ordem de serviço" />
        <Aviso tom="info" className="mt-4" titulo="Primeiro, o cliente">
          Busque o cliente (ou cadastre com nome completo e WhatsApp) em <Link href="/clientes" className="font-semibold underline">Clientes</Link> e toque em &quot;Abrir ordem de serviço&quot; na ficha dele.
        </Aviso>
      </MoldeReal>
    );
  }
  const ficha = await supabase.rpc("cliente_ficha", { p_cliente: clienteId });
  if (ficha.error && ficha.error.code !== "P0002") throw new FalhaDoServico("cliente_ficha");
  const f = ficha.data as unknown as Ficha | null;
  if (!f || f.situacao !== "ativo") {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Cliente não encontrado (ou não está ativo). Busque de novo em <Link href="/clientes" className="font-semibold underline">Clientes</Link>.</Aviso></MoldeReal>;
  }

  return (
    <MoldeReal sessao={sessao}>
      <Link href={`/clientes/${f.id}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Ficha do cliente</Link>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Nova ordem de serviço" subtitulo={`Cliente: ${f.nome} (nº ${f.numero})${f.telefone ? ` · WhatsApp ${f.telefone}` : ""}`} />
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_OS[erro]}</Aviso>}
      {!f.telefone ? (
        <Aviso tom="aviso" className="mt-4">
          {ERROS_DA_OS.sem_whatsapp} <Link href={`/clientes/${f.id}`} className="font-semibold underline">Completar o cadastro</Link>
        </Aviso>
      ) : (
        <Cartao className="mt-4" titulo="Aparelho" subtitulo="O que o cliente deixa na loja: vale como a via de papel." icone={Smartphone}>
          <form action={abrirOrdem} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="cliente" value={f.id} />
            <input type="hidden" name="chave" value={randomUUID()} />
            <label className="text-sm font-medium sm:col-span-2">Aparelho (marca e modelo)<input name="aparelho" required minLength={2} maxLength={120} placeholder="Ex.: Samsung Galaxy A15" className={campo} /></label>
            <label className="text-sm font-medium">IMEI<input name="imei" inputMode="numeric" autoComplete="off" maxLength={20} placeholder="15 números (*#06#)" className={campo} /></label>
            <label className="text-sm font-medium">Número de série <span className="font-normal text-suave">(se não tiver IMEI)</span><input name="serie" autoComplete="off" maxLength={40} className={campo} /></label>
            <label className="text-sm font-medium sm:col-span-2">Defeito relatado pelo cliente<textarea name="defeito" required minLength={3} maxLength={500} rows={3} className={`${campo} py-2`} /></label>
            <label className="text-sm font-medium sm:col-span-2">Estado em que chegou (tela, tampa, riscos)<textarea name="estado" required minLength={3} maxLength={500} rows={2} className={`${campo} py-2`} /></label>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium">Acessórios deixados</legend>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(ACESSORIOS).map(([valor, nome]) => (
                  <label key={valor} className="flex min-h-11 items-center gap-2 rounded-botao border border-borda px-3 text-sm">
                    <input type="checkbox" name="acessorios" value={valor} className="size-4" /> {nome}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="text-sm font-medium">Observação dos acessórios <span className="font-normal text-suave">(opcional)</span><input name="acessorios_obs" maxLength={200} className={campo} /></label>
            <label className="text-sm font-medium">Prazo combinado <span className="font-normal text-suave">(opcional)</span><input name="prazo" type="date" min={hoje} max={somarDias(hoje, 90)} className={campo} /></label>
            <div className="sm:col-span-2">
              <BotaoConfirmar>Abrir a ordem de serviço</BotaoConfirmar>
              <p className="mt-2 text-xs text-suave">Depois de abrir: tire as fotos do aparelho e mande o comprovante pelo WhatsApp do cliente.</p>
            </div>
          </form>
        </Cartao>
      )}
    </MoldeReal>
  );
}

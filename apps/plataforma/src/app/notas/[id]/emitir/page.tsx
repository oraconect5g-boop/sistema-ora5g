import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MoldeReal } from "../../../../componentes/MoldeReal";
import { Aviso, Cartao, TituloPagina } from "../../../../componentes/ui";
import { ehUuid } from "../../../../lib/acesso/regras";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { formatarRevelado } from "../../../../lib/clientes/regras";
import { RespostaInesperada } from "../../../../lib/financeiro/painel";
import { lerDadosParaEmitir, type DadosParaEmitir } from "../../../../lib/notas/dados-para-emitir";
import { ERROS_DAS_NOTAS, erroDasNotas } from "../../../../lib/notas/regras";

export const metadata: Metadata = { title: "Dados para emitir a nota" };
export const dynamic = "force-dynamic";

const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

// Lote K1b (#76): quem aprova a nota na loja vê, enquanto ela espera a emissão, o nome, o CPF/CNPJ e o endereço
// guardados no pedido, para digitar no emissor (o sistema ainda não emite: ADR-006). O banco confere a loja e a
// permissão e registra cada abertura na auditoria, sem os valores; nada vai para o endereço da página.
export default async function DadosParaEmitirANota({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const sessao = await obterSessao({ exigirLoja: true });
  const r = await sessao.supabase.rpc("notas_dados_para_emitir", { p_pedido: id });
  if (r.error?.code === "P0002") notFound();
  let dados: DadosParaEmitir | null = null;
  let aviso: string | null = null;
  if (r.error) {
    aviso = FUNCAO_AUSENTE.has(r.error.code) ? "Indisponível neste ambiente: o banco ainda não tem os dados para emitir." : ERROS_DAS_NOTAS[erroDasNotas(r.error)];
  } else {
    try {
      dados = lerDadosParaEmitir(r.data);
    } catch (erro) {
      if (!(erro instanceof RespostaInesperada)) throw erro;
      aviso = ERROS_DAS_NOTAS.falha;
    }
  }

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/notas" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Notas fiscais</Link>
      <TituloPagina titulo={dados ? `Dados para emitir · pedido nº ${dados.numero}` : "Dados para emitir"} subtitulo="Digite no emissor exatamente o que está aqui. Abrir esta tela fica na auditoria." />
      {aviso && <Aviso tom="aviso" className="mt-4">{aviso}</Aviso>}
      {dados && (
        <Cartao className="mt-4" titulo="Destinatário" icone={ShieldCheck}
          subtitulo={dados.dadosDe ? `Do cadastro do cliente como estava em ${quando(dados.dadosDe)} (corrigir o cadastro depois não muda este pedido).` : undefined}>
          {dados.documento === null ? (
            <p className="text-sm">Nota sem cliente identificado{dados.nome ? ` (nome informado: ${dados.nome})` : ""}: emita sem destinatário, conforme a orientação do contador.</p>
          ) : (
            <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-suave">Nome</dt><dd className="font-medium">{dados.nome ?? "—"}</dd>
              <dt className="text-suave">{dados.documento.length === 14 ? "CNPJ" : "CPF"}</dt><dd className="numeros font-medium">{formatarRevelado("documento", dados.documento)}</dd>
              <dt className="text-suave">Endereço</dt><dd>{dados.endereco ? formatarRevelado("endereco", dados.endereco) : "não guardado (pedido anterior à regra do endereço ou documento digitado na venda)"}</dd>
            </dl>
          )}
        </Cartao>
      )}
    </MoldeReal>
  );
}

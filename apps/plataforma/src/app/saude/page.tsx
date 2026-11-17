import type { Metadata } from "next";

import { conferirConexaoSupabase } from "../../lib/supabase/configuracao";
import { textoDaVersao } from "../../lib/versao";
import { conferirBanco, migracaoEsperada, type SituacaoDoBanco } from "../../saude/banco";
import { formatarHorario, obterEstadoSaude } from "../../saude/estado";

export const metadata: Metadata = { title: "Saúde do sistema" };

// Precisa ser calculada a cada acesso: uma pagina estatica continuaria "no ar" com horario antigo.
export const dynamic = "force-dynamic";

const TEXTO_CONEXAO = {
  conectado: "conectado",
  nao_configurado: "não configurado neste ambiente",
  sem_resposta: "sem resposta",
} as const;

// A leitura leve do banco (SAUDE-a; ADR-012): quanto o banco levou para responder e se a migration desta versão está nele.
function textoDoBanco(banco: SituacaoDoBanco): string {
  if (banco.estado === "respondeu") return `respondeu em ${banco.ms}\u00a0ms`;
  return banco.estado === "nao_configurado" ? TEXTO_CONEXAO.nao_configurado : TEXTO_CONEXAO.sem_resposta;
}

export default async function PaginaSaude() {
  const estado = obterEstadoSaude();
  const esperada = migracaoEsperada();
  const [conexao, banco] = await Promise.all([conferirConexaoSupabase(), conferirBanco(esperada)]);
  const atencao = banco.estado === "sem_resposta" || (banco.estado === "respondeu" && banco.migracao === "atras");

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="rounded-[20px] border border-borda bg-white p-6 shadow-cartao">
        {atencao ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-perigo"><span aria-hidden className="inline-flex size-2.5 rounded-full bg-perigo" /> Em funcionamento, com problema no banco</p>
        ) : (
          <p className="flex items-center gap-2 text-sm font-semibold text-sucesso"><span aria-hidden className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-sucesso opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-sucesso" /></span> Em funcionamento</p>
        )}
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Sistema no ar</h1>
        <dl className="mt-4 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="font-semibold">Serviço</dt>
          <dd>{estado.servico}</dd>
          <dt className="font-semibold">Versão</dt>
          <dd className="numeros">{estado.versao}</dd>
          <dt className="font-semibold">Publicada</dt>
          <dd className="numeros" data-testid="versao-publicada">{textoDaVersao()}</dd>
          <dt className="font-semibold">Verificado em</dt>
          <dd>
            <time dateTime={estado.verificadoEm}>{formatarHorario(estado.verificadoEm)}</time>
          </dd>
          <dt className="font-semibold">Login (Supabase)</dt>
          <dd data-testid="conexao-supabase">{TEXTO_CONEXAO[conexao]}</dd>
          <dt className="font-semibold">Banco de dados</dt>
          <dd className="numeros" data-testid="conexao-banco">{textoDoBanco(banco)}</dd>
          {banco.estado === "respondeu" && banco.migracao !== "sem_conferir" && (
            <>
              <dt className="font-semibold">Migrations</dt>
              <dd data-testid="migracao-do-banco" className={banco.migracao === "atras" ? "font-semibold text-perigo" : undefined}>
                {banco.migracao === "em_dia" ? "em dia com esta versão" : `falta no banco a ${esperada ?? ""}, desta versão`}
              </dd>
            </>
          )}
        </dl>
        <p className="mt-4 text-sm text-suave">Confere o aplicativo, se o serviço de login responde e uma leitura leve do banco, sem dado de ninguém.</p>
      </div>
    </main>
  );
}

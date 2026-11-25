import { randomUUID } from "node:crypto";

import { RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao } from "../../../componentes/ui";
import { obterSessao } from "../../../lib/acesso/sessao";
import { ERROS_DO_CONNECT } from "../../../lib/connect/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { registrarOperacao } from "../acoes";
import { CabecalhoConnect, LARGURA_DA_CONNECT, permissoesDaConnect } from "../CabecalhoConnect";
import { campo, PagamentoANogle, PlanosEmCartoes, rotulo } from "../campos";
import { lerFormulario } from "../formularios";

export const metadata: Metadata = { title: "Recarga · Ora Connect" };
export const dynamic = "force-dynamic";

// Lote CONNECT-m (25/11/2026): a aba "Recarga" da demonstração, com o formulário real: a linha, o plano em cartões (a lista
// oficial da Nogle, com o valor de face) e o pagamento à Nogle. As recargas programadas e a recarga automática ficam em
// Bloqueio e atendimento (as ações do dono e dos gerentes, D-061).
export default async function Recarga({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro }> }) {
  const erro = chaveDoCatalogo(ERROS_DO_CONNECT, (await searchParams).erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { opera, gere } = permissoesDaConnect(sessao);
  if (!opera) {
    return <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}><CabecalhoConnect sessao={sessao} aba="recarga" /><Aviso tom="aviso" className="mt-4">Seu papel não faz recargas nesta loja.</Aviso></MoldeReal>;
  }
  const f = await lerFormulario(sessao, "recarga");
  const planos = f.lista("plano");
  return (
    <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}>
      <CabecalhoConnect sessao={sessao} aba="recarga" />
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CONNECT[erro]}</Aviso>}
      <Cartao className="mt-4" titulo="Recarga do plano" subtitulo="Renova o plano de uma linha da Ora Connect" icone={RefreshCw}>
        {!f.liberada ? (
          <Aviso tom="aviso">A recarga ainda não foi liberada nesta rede (aba Integração Nogle).</Aviso>
        ) : planos.length === 0 ? (
          <Aviso tom="aviso">Os planos da Nogle ainda não foram carregados pelo servidor.</Aviso>
        ) : (
          <form action={registrarOperacao} className="grid gap-4">
            <input type="hidden" name="tipo" value="recarga" /><input type="hidden" name="chave" value={randomUUID()} />
            <label className={`${rotulo} max-w-sm`}>Número da linha (com DDD)<input name="linha" required inputMode="tel" autoComplete="off" placeholder="(41) 99999-9999" className={campo} /></label>
            <PlanosEmCartoes planos={planos} />
            <PagamentoANogle pagos={f.pagosLivres} />
            <div><Botao type="submit" enquanto="Registrando…">Solicitar recarga</Botao></div>
          </form>
        )}
        {gere && (
          <p className="mt-4 text-xs text-suave">As recargas programadas e a recarga automática de uma linha ficam em <Link href="/connect/acoes-na-nogle" className="font-semibold text-acao underline">Bloqueio e atendimento</Link>.</p>
        )}
      </Cartao>
    </MoldeReal>
  );
}

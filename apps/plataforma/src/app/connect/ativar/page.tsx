import { randomUUID } from "node:crypto";

import { Info, Smartphone } from "lucide-react";
import type { Metadata } from "next";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Cartao } from "../../../componentes/ui";
import { obterSessao } from "../../../lib/acesso/sessao";
import { ERROS_DO_CONNECT } from "../../../lib/connect/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { CabecalhoConnect, LARGURA_DA_CONNECT, permissoesDaConnect } from "../CabecalhoConnect";
import { lerChipsParaAtivar, lerFormulario } from "../formularios";
import { AssistenteDeAtivacao } from "./AssistenteDeAtivacao";

export const metadata: Metadata = { title: "Ativar chip · Ora Connect" };
export const dynamic = "force-dynamic";

// Lote CONNECT-m (25/11/2026): a aba "Ativar chip" da demonstração, com os dados reais. CONNECT-n: o assistente da
// demonstração, um passo por vez (o chip, do estoque já vendido no PDV ou o eSIM; o cliente, cujos dados vão só para a Nogle e
// saem do sistema depois do envio; o plano e o DDD das listas oficiais; o pagamento à Nogle) e a conferência antes de
// registrar. O servidor envia à Nogle e acompanha a resposta (ADR-005).
export default async function AtivarChip({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro }> }) {
  const erro = chaveDoCatalogo(ERROS_DO_CONNECT, (await searchParams).erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { opera } = permissoesDaConnect(sessao);
  if (!opera) {
    return <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}><CabecalhoConnect sessao={sessao} aba="ativar" /><Aviso tom="aviso" className="mt-4">Seu papel não ativa chips nesta loja.</Aviso></MoldeReal>;
  }
  const [f, chips] = await Promise.all([lerFormulario(sessao, "ativacao"), lerChipsParaAtivar(sessao)]);
  const planos = f.lista("plano");
  return (
    <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}>
      <CabecalhoConnect sessao={sessao} aba="ativar" />
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CONNECT[erro]}</Aviso>}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao className="xl:col-span-2" titulo="Ativar chip na operadora" icone={Smartphone}
          subtitulo={`${sessao.situacao.unidade_nome} · a venda do chip é feita no Vender; aqui é a ativação na Nogle`}>
          {!f.liberada ? (
            <Aviso tom="aviso">A ativação ainda não foi liberada nesta rede (aba Integração Nogle).</Aviso>
          ) : planos.length === 0 ? (
            <Aviso tom="aviso">Os planos da Nogle ainda não foram carregados pelo servidor.</Aviso>
          ) : (
            <AssistenteDeAtivacao chave={randomUUID()} chips={chips} pagos={f.pagosLivres}
              planos={planos.map((p) => ({ codigo: p.codigo, nome: p.nome, valor_centavos: p.valor_centavos }))}
              ddds={f.lista("ddd").map((d) => ({ codigo: d.codigo, uf: d.uf }))}
              cidades={f.lista("cidade").map((c) => ({ codigo: c.codigo, nome: c.nome, uf: c.uf }))} />
          )}
        </Cartao>
        <Cartao titulo="Como a ativação funciona" icone={Info} className="xl:self-start">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li><span className="font-semibold">O chip:</span> o chip físico do estoque é vendido antes, no Vender (os vendidos nos últimos 7 dias aparecem para tocar); o eSIM não tem chip.</li>
            <li><span className="font-semibold">O cliente:</span> os dados e o endereço vão só para a Nogle e saem do sistema depois do envio.</li>
            <li><span className="font-semibold">O plano e o DDD</span> vêm das listas oficiais da Nogle: o valor nunca é digitado.</li>
            <li><span className="font-semibold">O pagamento à Nogle:</span> o Pix da Nogle (o QR Code aparece na operação) ou o crédito da carteira.</li>
            <li><span className="font-semibold">Conferir e registrar:</span> a linha só conta como ativa (e na produção) depois da confirmação da operadora.</li>
          </ol>
        </Cartao>
      </div>
    </MoldeReal>
  );
}

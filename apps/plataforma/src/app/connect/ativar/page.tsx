import { randomUUID } from "node:crypto";

import { Info, Smartphone } from "lucide-react";
import type { Metadata } from "next";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao } from "../../../componentes/ui";
import { obterSessao } from "../../../lib/acesso/sessao";
import { ERROS_DO_CONNECT } from "../../../lib/connect/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { registrarOperacao } from "../acoes";
import { CabecalhoConnect, LARGURA_DA_CONNECT, permissoesDaConnect } from "../CabecalhoConnect";
import { campo, lerFormulario, PagamentoANogle, PlanosEmCartoes, rotulo } from "../formularios";

export const metadata: Metadata = { title: "Ativar chip · Ora Connect" };
export const dynamic = "force-dynamic";

// Lote CONNECT-m (25/11/2026): a aba "Ativar chip" da demonstração, com o formulário real: o chip (do estoque, já vendido no
// PDV) ou o eSIM, o plano e o DDD das listas da Nogle, o pagamento à Nogle e os dados do cliente, que vão só para a Nogle e
// saem do sistema depois do envio. O servidor envia à Nogle e acompanha a resposta (ADR-005).
export default async function AtivarChip({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro }> }) {
  const erro = chaveDoCatalogo(ERROS_DO_CONNECT, (await searchParams).erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { opera } = permissoesDaConnect(sessao);
  if (!opera) {
    return <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}><CabecalhoConnect sessao={sessao} aba="ativar" /><Aviso tom="aviso" className="mt-4">Seu papel não ativa chips nesta loja.</Aviso></MoldeReal>;
  }
  const f = await lerFormulario(sessao, "ativacao");
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
            <form action={registrarOperacao} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="tipo" value="ativacao" /><input type="hidden" name="chave" value={randomUUID()} />
              <p className="text-sm font-semibold text-acao sm:col-span-2">1. O chip</p>
              <label className={rotulo}>ICCID (19 dígitos do chip)<input name="iccid" inputMode="numeric" autoComplete="off" className={campo} /></label>
              <label className="flex min-h-11 items-center gap-2 self-end rounded-xl border border-borda px-3 text-sm"><input type="checkbox" name="esim" className="size-4" /> eSIM (chip virtual, sem chip físico)</label>
              <p className="text-sm font-semibold text-acao sm:col-span-2">2. O plano e o DDD</p>
              <div className="sm:col-span-2"><PlanosEmCartoes planos={planos} /></div>
              <label className={rotulo}>DDD
                <select name="ddd" required className={campo} defaultValue=""><option value="" disabled>Escolha</option>{f.lista("ddd").map((d) => <option key={d.codigo} value={d.codigo}>{`${d.codigo} (${d.uf})`}</option>)}</select>
              </label>
              <p className="text-sm font-semibold text-acao sm:col-span-2">3. O cliente</p>
              <label className={`${rotulo} sm:col-span-2`}>Nome completo do cliente<input name="nome" required minLength={3} maxLength={120} autoComplete="off" className={campo} /></label>
              <label className={rotulo}>CPF ou CNPJ<input name="documento" required inputMode="numeric" autoComplete="off" className={campo} /></label>
              <label className={rotulo}>Nascimento (pessoa física)<input name="data_nascimento" type="date" className={campo} /></label>
              <label className={rotulo}>E-mail<input name="email" type="email" autoComplete="off" className={campo} /></label>
              <label className={rotulo}>Telefone com DDD<input name="telefone" inputMode="tel" autoComplete="off" className={campo} /></label>
              <label className={rotulo}>CEP<input name="cep" required inputMode="numeric" autoComplete="off" className={campo} /></label>
              <label className={rotulo}>Cidade
                <select name="id_cidade" required className={campo} defaultValue=""><option value="" disabled>Escolha</option>{f.lista("cidade").map((c) => <option key={c.codigo} value={c.codigo}>{`${c.nome} (${c.uf})`}</option>)}</select>
              </label>
              <label className={`${rotulo} sm:col-span-2`}>Rua<input name="rua" required maxLength={120} autoComplete="off" className={campo} /></label>
              <label className={rotulo}>Número<input name="numero_endereco" required maxLength={20} autoComplete="off" className={campo} /></label>
              <label className={rotulo}>Complemento<input name="complemento" maxLength={120} autoComplete="off" className={campo} /></label>
              <label className={`${rotulo} sm:col-span-2`}>Bairro<input name="bairro" required maxLength={120} autoComplete="off" className={campo} /></label>
              <p className="text-sm font-semibold text-acao sm:col-span-2">4. O pagamento à Nogle</p>
              <div className="sm:col-span-2"><PagamentoANogle pagos={f.pagosLivres} /></div>
              <div className="sm:col-span-2"><Botao type="submit" enquanto="Registrando…">Registrar ativação</Botao></div>
            </form>
          )}
        </Cartao>
        <Cartao titulo="Como a ativação funciona" icone={Info} className="xl:self-start">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>O chip físico do estoque é vendido antes, no <span className="font-semibold">Vender</span>; o eSIM não tem chip.</li>
            <li>O plano, o DDD e a cidade vêm das listas oficiais da Nogle: o valor nunca é digitado.</li>
            <li>O pagamento à Nogle é o <span className="font-semibold">Pix da Nogle</span> (o QR Code aparece na operação) ou o crédito da carteira.</li>
            <li>Os dados do cliente vão só para a Nogle e saem do sistema depois do envio.</li>
            <li>A linha só conta como ativa (e na produção) depois da confirmação da operadora.</li>
          </ol>
        </Cartao>
      </div>
    </MoldeReal>
  );
}

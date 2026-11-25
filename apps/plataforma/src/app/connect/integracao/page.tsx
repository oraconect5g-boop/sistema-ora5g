import { RadioTower, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NOMES_DAS_OPERACOES, TIPOS_OPERACAO } from "@ora5g/dominio/nogle";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ERROS_DO_CONNECT } from "../../../lib/connect/regras";
import { FUNCOES_NOGLE } from "../../../integracoes/nogle/catalogo";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { habilitarOperacao } from "../acoes";
import { ABAS_DA_CONNECT, CabecalhoConnect, LARGURA_DA_CONNECT, permissoesDaConnect } from "../CabecalhoConnect";
import { campo, rotulo } from "../campos";
import { quando } from "../lista";

export const metadata: Metadata = { title: "Integração Nogle · Ora Connect" };
export const dynamic = "force-dynamic";

const QUEM = { loja: "Loja", gestao: "Dono e gerentes", administracao: "Administração", sistema: "O servidor" } as const;

// Lote CONNECT-m (25/11/2026): a aba "Integração Nogle" da demonstração, com os dados reais: a liberação de cada operação
// (com a evidência na auditoria), as listas oficiais carregadas, a conciliação e todas as funções da coleção oficial da
// Nogle (62) com a aba da Ora em que cada uma aparece.
export default async function Integracao({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; ok?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DO_CONNECT, parametros.erro);
  const ok = parametros.ok === "habilitacao";
  const sessao = await obterSessao({ exigirLoja: true });
  const { gere, integra } = permissoesDaConnect(sessao);
  if (!gere && !integra) {
    return <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}><CabecalhoConnect sessao={sessao} aba="integracao" /><Aviso tom="aviso" className="mt-4">A integração com a Nogle é do dono, dos gerentes e de quem cuida das integrações.</Aviso></MoldeReal>;
  }
  const [habilitacoes, referencias] = await Promise.all([
    sessao.supabase.from("connect_habilitacoes").select("tipo, habilitada, evidencia, alterado_em"),
    sessao.supabase.from("connect_referencias").select("tipo").eq("ativo", true).limit(5000),
  ]);
  if (habilitacoes.error || referencias.error) throw new FalhaDoServico("connect_integracao");
  const habilitada = new Map(habilitacoes.data.map((h) => [h.tipo, h]));
  const contar = (tipo: string) => referencias.data.filter((r) => r.tipo === tipo).length;
  return (
    <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}>
      <CabecalhoConnect sessao={sessao} aba="integracao" />
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CONNECT[erro]}</Aviso>}
      {ok && <Aviso tom="sucesso" className="mt-4">Liberação registrada (com a evidência na auditoria).</Aviso>}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Cartao titulo="Situação da integração" icone={RadioTower} className="xl:self-start" subtitulo="O servidor fala com a Nogle; o site nunca vê a chave">
          <ul className="space-y-2 text-sm">
            {TIPOS_OPERACAO.map((t) => {
              const h = habilitada.get(t);
              return (
                <li key={t} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{NOMES_DAS_OPERACOES[t]}</span>
                  <Selo tom={h?.habilitada ? "sucesso" : "aviso"} ponto>{h?.habilitada ? `liberada${h.alterado_em ? ` em ${quando(h.alterado_em)}` : ""}` : "aguardando liberação"}</Selo>
                </li>
              );
            })}
          </ul>
          <p className="numeros mt-3 text-xs text-suave">{`Listas oficiais carregadas: ${contar("plano")} planos, ${contar("ddd")} DDDs, ${contar("cidade")} cidades e ${contar("operadora")} operadoras.`}</p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {gere && <Link href="/connect/conciliacao" className="font-semibold text-acao">Conciliação com os relatórios da Nogle</Link>}
            <Link href="/connect/chips" className="font-semibold text-acao">Chips na Nogle</Link>
          </p>
        </Cartao>
        {integra && (
          <Cartao titulo="Liberar operações" subtitulo="Só depois de conferir com a Nogle; a evidência fica na auditoria" icone={ShieldCheck} className="xl:self-start">
            <form action={habilitarOperacao} className="grid gap-3 sm:grid-cols-2">
              <label className={rotulo}>Operação
                <select name="tipo" className={campo}>{TIPOS_OPERACAO.map((t) => <option key={t} value={t}>{NOMES_DAS_OPERACOES[t]}</option>)}</select>
              </label>
              <label className={rotulo}>Situação
                <select name="habilitar" className={campo} defaultValue="sim"><option value="sim">Liberar</option><option value="nao">Suspender</option></select>
              </label>
              <label className={`${rotulo} sm:col-span-2`}>Evidência<input name="evidencia" required minLength={10} className={campo} /></label>
              <div className="sm:col-span-2"><Botao type="submit" variante="secundario" enquanto="Registrando…">Registrar</Botao></div>
            </form>
          </Cartao>
        )}
      </div>
      <Cartao className="mt-4" titulo="Todas as funções da Nogle e onde aparecem na Ora" subtitulo={`As ${FUNCOES_NOGLE.length} funções da coleção oficial (docs.nogle.tech), cada uma na sua aba`} corpo="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-fundo text-xs text-suave"><tr><th className="px-4 py-2">Função</th><th className="px-4 py-2">Rota</th><th className="px-4 py-2">Na Ora</th><th className="px-4 py-2">Quem</th></tr></thead>
            <tbody className="divide-y divide-borda">
              {FUNCOES_NOGLE.map((fn) => (
                <tr key={`${fn.metodo} ${fn.caminho} ${fn.nome}`}>
                  <td className="px-4 py-2"><span className="font-medium">{fn.nome}</span><span className="block text-xs text-suave">{fn.grupo}</span></td>
                  <td className="numeros px-4 py-2 text-xs">{`${fn.metodo} ${fn.caminho}`}</td>
                  <td className="px-4 py-2">{ABAS_DA_CONNECT[fn.aba].rotulo}</td>
                  <td className="px-4 py-2">{QUEM[fn.quem]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </MoldeReal>
  );
}

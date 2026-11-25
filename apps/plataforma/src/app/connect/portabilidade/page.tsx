import { randomUUID } from "node:crypto";

import { ArrowLeftRight } from "lucide-react";
import type { Metadata } from "next";

import { SITUACOES_OPERACAO, type SituacaoOperacao } from "@ora5g/dominio/nogle";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, EstadoVazio, FiltroSegmentado, Selo } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { linhaFormatada } from "../../../lib/connect/consultas";
import { ERROS_DO_CONNECT } from "../../../lib/connect/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { registrarOperacao } from "../acoes";
import { CabecalhoConnect, LARGURA_DA_CONNECT, permissoesDaConnect } from "../CabecalhoConnect";
import { campo, lerFormulario, rotulo, ServicoPagoOpcional } from "../formularios";
import { FILTROS_DA_LISTA, filtroDaLista, naLista, quando, TOM_DA_SITUACAO } from "../lista";

export const metadata: Metadata = { title: "Portabilidade · Ora Connect" };
export const dynamic = "force-dynamic";

// Lote CONNECT-m (25/11/2026): a aba "Portabilidade" da demonstração: trazer o número de outra operadora (o cliente aceita
// pelo SMS) e a lista das portabilidades da loja, com os filtros. O servidor envia à Nogle e acompanha (ADR-005).
export default async function Portabilidade({ searchParams }: { searchParams: Promise<{ erro?: ValorDeParametro; filtro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const erro = chaveDoCatalogo(ERROS_DO_CONNECT, parametros.erro);
  const filtro = filtroDaLista(textoDoParametro(parametros.filtro));
  const sessao = await obterSessao({ exigirLoja: true });
  const { opera, gere } = permissoesDaConnect(sessao);
  if (!opera && !gere) {
    return <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}><CabecalhoConnect sessao={sessao} aba="portabilidade" /><Aviso tom="aviso" className="mt-4">Seu papel não vê as portabilidades desta loja.</Aviso></MoldeReal>;
  }
  const [f, lidas] = await Promise.all([
    opera ? lerFormulario(sessao, "portabilidade") : Promise.resolve(null),
    sessao.supabase.from("connect_operacoes").select("id, numero, situacao, linha, linha_doadora, mensagem_operadora, criado_em")
      .eq("unidade_id", sessao.situacao.unidade_id as string).eq("tipo", "portabilidade").order("criado_em", { ascending: false }).limit(50),
  ]);
  if (lidas.error) throw new FalhaDoServico("connect_portabilidades");
  const portabilidades = lidas.data.filter((o) => naLista(filtro, o.situacao));
  const operadoras = f?.lista("operadora") ?? [];
  return (
    <MoldeReal sessao={sessao} largura={LARGURA_DA_CONNECT}>
      <CabecalhoConnect sessao={sessao} aba="portabilidade" />
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CONNECT[erro]}</Aviso>}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {f && (
          <Cartao titulo="Trazer número de outra operadora" icone={ArrowLeftRight} className="xl:self-start" subtitulo="O cliente aceita pelo SMS que chega na linha da outra operadora; a troca leva até 3 dias úteis depois do aceite">
            {!f.liberada ? <Aviso tom="aviso">A portabilidade ainda não foi liberada nesta rede (aba Integração Nogle).</Aviso> : operadoras.length === 0 ? (
              <Aviso tom="aviso">A lista das operadoras da Nogle ainda não foi carregada pelo servidor.</Aviso>
            ) : (
              <form action={registrarOperacao} className="grid gap-3">
                <input type="hidden" name="tipo" value="portabilidade" /><input type="hidden" name="chave" value={randomUUID()} />
                <label className={rotulo}>Linha Ora Connect (nova, com DDD)<input name="linha" required inputMode="tel" autoComplete="off" className={campo} /></label>
                <label className={rotulo}>Número que vai ser trazido<input name="linha_doadora" required inputMode="tel" autoComplete="off" className={campo} /></label>
                <label className={rotulo}>Operadora atual
                  <select name="operadora" required className={campo} defaultValue=""><option value="" disabled>Escolha</option>{operadoras.map((o) => <option key={o.codigo} value={o.codigo}>{o.nome}</option>)}</select>
                </label>
                <ServicoPagoOpcional pagos={f.pagosLivres} />
                <div><Botao type="submit" enquanto="Registrando…">Solicitar portabilidade</Botao></div>
              </form>
            )}
          </Cartao>
        )}
        <Cartao className={f ? "xl:col-span-2 xl:self-start" : "xl:col-span-3"} titulo="Portabilidades" subtitulo="As 50 mais recentes da loja; o status vem da operadora" corpo="p-0">
          <div className="border-b border-borda px-4 pb-3 sm:px-5">
            <FiltroSegmentado rotulo="Filtrar portabilidades" opcoes={(Object.keys(FILTROS_DA_LISTA) as (keyof typeof FILTROS_DA_LISTA)[]).map((x) => ({
              href: x === "todas" ? "/connect/portabilidade" : `/connect/portabilidade?filtro=${x}`, rotulo: FILTROS_DA_LISTA[x].rotulo, ativo: x === filtro,
              contagem: lidas.data.filter((o) => naLista(x, o.situacao)).length,
            }))} />
          </div>
          {portabilidades.length === 0 ? <div className="p-5"><EstadoVazio titulo="Nenhuma portabilidade aqui" icone={ArrowLeftRight} /></div> : (
            <ul className="divide-y divide-borda">
              {portabilidades.map((o) => {
                const s = (Object.hasOwn(SITUACOES_OPERACAO, o.situacao) ? o.situacao : "registrada") as SituacaoOperacao;
                return (
                  <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <span className="min-w-0">
                      <span className="numeros block font-medium">{`${o.linha_doadora ? linhaFormatada(o.linha_doadora) : "—"} → ${o.linha ? linhaFormatada(o.linha) : "—"}`}</span>
                      <span className="block truncate text-xs text-suave">{`Nº ${o.numero} · ${quando(o.criado_em)}${o.mensagem_operadora ? ` · ${o.mensagem_operadora}` : ""}`}</span>
                    </span>
                    <Selo tom={TOM_DA_SITUACAO[s]} ponto>{SITUACOES_OPERACAO[s].nome}</Selo>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>
    </MoldeReal>
  );
}

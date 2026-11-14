import { AlarmClock, ChartNoAxesColumn, PackageCheck, Store, Truck, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../componentes/MoldeReal";
import { EstadoDoPainel } from "../../componentes/paineis-de-vendas";
import { Aviso, Cartao, EstadoVazio, FiltroSegmentado, Indicador, Selo, TituloPagina } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { contarOrdens, ehVisao, listarOrdens, POR_PAGINA, VISOES, type Visao } from "../../lib/assistencia/consulta";
import { atrasada, diasEntre, finalDoImei, LOCAIS, SITUACOES } from "../../lib/assistencia/regras";
import { numero } from "../../lib/formato";
import { textoDoParametro, type ValorDeParametro } from "../../lib/parametros";

export const metadata: Metadata = { title: "Assistência" };
export const dynamic = "force-dynamic";

const dataBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const diaDe = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
const TOM_DO_LOCAL = { loja: "info", a_caminho_do_tecnico: "aviso", com_tecnico: "aviso", a_caminho_da_loja: "aviso", com_cliente: "neutro" } as const;

// Assistência técnica (lote L12a: ORA-OS-001 e ORA-OS-002). Todo aparelho de cliente que entra na loja tem OS numerada;
// aqui a loja (e o técnico, na assistência) acompanha onde cada aparelho está. A regra de quem vê é a do banco (RLS).
export default async function Assistencia({ searchParams }: { searchParams: Promise<{ ver?: ValorDeParametro; pagina?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const visao: Visao = ehVisao(textoDoParametro(parametros.ver)) ? (textoDoParametro(parametros.ver) as Visao) : "abertas";
  const pagina = Math.max(0, Math.min(1_000, Number.parseInt(textoDoParametro(parametros.pagina) ?? "0", 10) || 0));
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const [abrir, gerir, orcar] = await Promise.all(["os.abrir", "os.gerir", "os.orcar"].map((p) => supabase.rpc("tem_permissao", { p_permissao: p, p_unidade: unidade })));
  if (abrir?.error || gerir?.error || orcar?.error) throw new FalhaDoServico("tem_permissao");
  if (!abrir?.data && !gerir?.data && !orcar?.data) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">A assistência é de quem recebe aparelhos na loja e do técnico.</Aviso></MoldeReal>;
  const [lista, contagens] = await Promise.all([listarOrdens(supabase, visao, pagina), contarOrdens(supabase, hoje)]);
  const endereco = (v: Visao, p = 0) => `/assistencia${v === "abertas" && p === 0 ? "" : `?ver=${v}${p > 0 ? `&pagina=${p}` : ""}`}`;

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <TituloPagina
        sobretitulo={situacao.unidade_nome}
        titulo="Assistência"
        subtitulo="Todo aparelho de cliente que entra para assistência, até limpeza, tem ordem de serviço: o número é o comprovante do cliente e a posição do aparelho fica registrada da loja ao técnico e de volta."
      />
      {gerir?.data && (
        <Link href="/assistencia/relatorios" className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao">
          <ChartNoAxesColumn aria-hidden className="size-4" /> Relatórios da assistência
        </Link>
      )}
      {abrir?.data && (
        <Aviso tom="info" className="mt-4" titulo="Abrir uma OS">
          Busque o cliente (ou cadastre com nome completo e WhatsApp) em <Link href="/clientes" className="font-semibold underline">Clientes</Link> e toque em &quot;Abrir ordem de serviço&quot; na ficha dele.
        </Aviso>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Na loja" icone={Store} valor={contagens ? numero(contagens.naLoja) : "—"} detalhe={contagens ? "aparelhos de cliente aguardando" : "Sem número do banco agora"} />
        {/* L12c: conserto pronto na loja, esperando a cobrança no PDV e a entrega. */}
        <Indicador rotulo="Prontas para entregar" icone={PackageCheck} valor={contagens?.prontas != null ? numero(contagens.prontas) : "—"}
          tom={contagens?.prontas ? "atencao" : "neutro"} detalhe={contagens?.prontas != null ? "consertadas: cobrar no PDV e entregar" : "Sem número do banco agora"} />
        <Indicador rotulo="Com o técnico" icone={Truck} valor={contagens ? numero(contagens.fora) : "—"} detalhe={contagens ? "indo, com ele ou voltando" : "Sem número do banco agora"} />
        <Indicador rotulo="Atrasadas" icone={AlarmClock} valor={contagens ? numero(contagens.atrasadas) : "—"} tom={contagens && contagens.atrasadas > 0 ? "atencao" : "neutro"}
          detalhe={contagens ? "passaram do prazo combinado com o cliente" : "Sem número do banco agora"} />
      </div>

      <div className="nao-imprimir mt-4">
        <FiltroSegmentado rotulo="Ordens de serviço" opcoes={(Object.keys(VISOES) as Visao[]).map((v) => ({ href: endereco(v), rotulo: VISOES[v], ativo: v === visao }))} />
      </div>

      <Cartao className="mt-4" titulo={VISOES[visao]} icone={Wrench}
        subtitulo={lista.estado === "ok" ? `${numero(lista.dados.total)} ${lista.dados.total === 1 ? "ordem de serviço" : "ordens de serviço"}${visao === "encerradas" ? ", da mais nova para a mais antiga" : ", da mais antiga para a mais nova"}` : undefined}>
        {lista.estado !== "ok" ? (
          <EstadoDoPainel estado={lista.estado} fonte="assistencia" tentarDeNovo={endereco(visao, pagina)} />
        ) : lista.dados.ordens.length === 0 ? (
          <EstadoVazio titulo="Nenhuma ordem de serviço aqui" icone={Wrench}>A leitura está funcionando; nada nesta visão agora.</EstadoVazio>
        ) : (
          <>
            <ul className="divide-y divide-borda text-sm">
              {lista.dados.ordens.map((o) => {
                const dias = diasEntre(diaDe(o.abertaEm), hoje);
                return (
                  <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3">
                    <Link href={`/assistencia/${o.id}`} className="font-semibold text-acao">OS nº {o.numero}</Link>
                    <span className="justify-self-end">
                      {o.situacao === "aberta" ? <Selo tom={TOM_DO_LOCAL[o.local]}>{LOCAIS[o.local]}</Selo> : <Selo tom="neutro">{SITUACOES[o.situacao]}</Selo>}
                    </span>
                    <span className="min-w-0 text-suave">{[o.clienteNome, o.aparelho, finalDoImei(o.imei) ?? (o.numeroSerie ? `série ${o.numeroSerie}` : null)].filter(Boolean).join(" · ")}</span>
                    <span className="justify-self-end text-xs text-suave">
                      {atrasada(o, hoje) ? <Selo tom="perigo">{`atrasada · prazo ${dataBr(o.prazo as string)}`}</Selo>
                        : o.situacao === "aberta" ? `aberta há ${dias} ${dias === 1 ? "dia" : "dias"}${o.prazo ? ` · prazo ${dataBr(o.prazo)}` : ""}` : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            {(pagina > 0 || (pagina + 1) * POR_PAGINA < lista.dados.total) && (
              <div className="mt-3 flex justify-between text-sm font-semibold">
                {pagina > 0 ? <Link href={endereco(visao, pagina - 1)} className="text-acao">Página anterior</Link> : <span />}
                {(pagina + 1) * POR_PAGINA < lista.dados.total && <Link href={endereco(visao, pagina + 1)} className="text-acao">Próxima página</Link>}
              </div>
            )}
          </>
        )}
      </Cartao>
    </MoldeReal>
  );
}

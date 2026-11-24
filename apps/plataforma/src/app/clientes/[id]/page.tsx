import { randomUUID } from "node:crypto";

import { ArrowLeft, CalendarClock, Eye, MessageSquareHeart, PencilLine, RadioTower, ShieldCheck, ShoppingBag, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NOMES_DAS_OPERACOES, SITUACOES_OPERACAO, ehTipoOperacao, type SituacaoOperacao } from "@ora5g/dominio/nogle";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, BotaoLink, Cartao, ListaDados, Selo, TituloPagina } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { SERVICOS, SITUACOES as SITUACOES_DA_OS, ehServico } from "../../../lib/assistencia/regras";
import { lerHistoricoDoCliente, type Bloco } from "../../../lib/clientes/historico";
import { nomeDaVendaDoSite, lerVendasDoSite } from "../../../lib/loja/vendas-do-site";
import { CAMPOS_REVELAVEIS, CANAIS, ERROS_DO_CLIENTE, FINALIDADES, FINALIDADES_DE_CONTATO, FONTES, SEGMENTOS, ehFinalidade, ehSegmento } from "../../../lib/clientes/regras";
import { ETAPAS, ETAPAS_ABERTAS, ehEtapa, TIPOS_DE_ATIVIDADE } from "../../../lib/crm/regras";
import { centavosDoBanco } from "../../../lib/dinheiro";
import { brl } from "../../../lib/formato";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { registrarConsentimento } from "../acoes";
import { FormularioCliente } from "../FormularioCliente";
import { Revelar } from "../Revelar";

export const metadata: Metadata = { title: "Cliente" };
export const dynamic = "force-dynamic";

const OK = {
  criado: "Cliente cadastrado.",
  alterado: "Cadastro corrigido. O motivo ficou na auditoria.",
  sem_mudanca: "Nada mudou no cadastro.",
  consentimento: "Consentimento registrado.",
  consentimento_igual: "O consentimento já estava assim.",
  mesclado: "Cadastros mesclados: este ficou com os dados e o histórico do outro.",
} as const;
const ACESSOS: Record<string, string> = {
  "cliente.criado": "cadastrou", "cliente.alterado": "corrigiu", "cliente.busca": "encontrou na busca", "cliente.ficha": "abriu a ficha", "cliente.revelado": "viu",
};
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string | null, hora = false) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", ...(hora ? { timeStyle: "short" } : {}) }).format(new Date(iso)).replace(",", "") : "—");

type Ficha = {
  id: string; numero: number; nome: string; tipo: string; situacao: string; finalidades: string[]; documento: string | null; telefone: string | null;
  email: string | null; nascimento_informado: boolean; endereco_informado: boolean; origem: string; criado_em: string; loja_de_origem: string | null;
  consentimentos: { canal: keyof typeof CANAIS; finalidade: keyof typeof FINALIDADES_DE_CONTATO; situacao: string; fonte: keyof typeof FONTES; registrado_em: string }[];
  compras: { total: number; ultima: string | null };
  mesclado_em: { id: string; numero: number; nome: string } | null;
  segmento: { codigo: string; explicacao: string };
};

// Ficha do cliente (lote L5a: ORA-CRM-002, base). Abrir a ficha e mostrar um dado protegido ficam
// registrados no banco. As compras listadas são as que a pessoa já pode ver (RLS das vendas); o total da
// rede aparece sem detalhe.
export default async function FichaDoCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DO_CLIENTE, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;
  const busca = permite(sessao, "cliente.buscar");
  const cadastro = permite(sessao, "cliente.cadastrar");
  const auditoria = permite(sessao, "auditoria.ver");
  const abreOs = permite(sessao, "os.abrir");
  // QUAL-011a: o relatório dos dados do titular é do dono (cliente.exportar).
  const exporta = permite(sessao, "cliente.exportar");
  if (!busca) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Seu papel não consulta clientes.</Aviso></MoldeReal>;

  const ficha = await supabase.rpc("cliente_ficha", { p_cliente: id });
  if (ficha.error?.code === "P0002") notFound();
  if (ficha.error) throw new FalhaDoServico("cliente_ficha");
  const f = ficha.data as unknown as Ficha;
  const [compras, acessos] = await Promise.all([
    supabase.from("vendas").select("id, numero, concluida_em, total_centavos, situacao, canal").eq("cliente_id", id).order("concluida_em", { ascending: false }).limit(20),
    auditoria
      ? supabase.from("auditoria").select("id, ocorrido_em, acao, usuario_id, depois").eq("alvo_tipo", "cliente").eq("alvo_id", id).order("ocorrido_em", { ascending: false }).limit(20)
      : Promise.resolve(null),
  ]);
  if (compras.error || acessos?.error) throw new FalhaDoServico("cliente_historico");
  // L5e (CRM-002): as OS, o funil e a agenda e o Ora Connect das compras que a pessoa vê, cada um à parte.
  // CRM-009a: junto, as compras que nasceram de um pedido ou de uma reserva do site (a venda é do balcão; a origem, do site).
  const [historico, doSite] = await Promise.all([lerHistoricoDoCliente(supabase, id, compras.data.map((c) => c.id)), lerVendasDoSite(supabase, compras.data.map((c) => c.id))]);
  const origemNoSite = new Map((doSite.estado === "ok" ? doSite.itens : []).map((x) => [x.vendaId, x]));
  const pessoas = acessos?.data?.length
    ? await supabase.from("perfis_usuario").select("id, nome").in("id", [...new Set(acessos.data.map((a) => a.usuario_id).filter((x): x is string => Boolean(x)))])
    : null;
  const nomeDe = (usuario: string | null) => pessoas?.data?.find((p) => p.id === usuario)?.nome ?? "—";
  const visiveis = compras.data.filter((c) => c.situacao === "concluida").length;
  const ativo = f.situacao === "ativo";
  const segmento = ehSegmento(f.segmento?.codigo) ? SEGMENTOS[f.segmento.codigo] : null;

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/clientes" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Clientes</Link>
      <TituloPagina titulo={f.nome} acao={abreOs && f.situacao === "ativo" && !f.mesclado_em
        ? <BotaoLink href={`/assistencia/nova?cliente=${f.id}`} variante="secundario"><Wrench aria-hidden className="size-4" /> Abrir ordem de serviço</BotaoLink> : undefined}
        subtitulo={<span className="flex flex-wrap items-center gap-2">
        <span className="numeros">nº {f.numero}</span> · {f.tipo === "pessoa_juridica" ? "empresa" : "pessoa física"} · cliente desde {quando(f.criado_em)}{f.loja_de_origem ? ` (${f.loja_de_origem})` : ""}
        {f.situacao !== "ativo" && <Selo tom="neutro">{f.situacao}</Selo>}
        {segmento && <Selo tom={segmento.tom}>{segmento.nome}</Selo>}</span>} />
      {f.mesclado_em && <Aviso tom="aviso" className="mt-4">Este cadastro foi mesclado no cliente <Link href={`/clientes/${f.mesclado_em.id}`} className="font-semibold underline">{`${f.mesclado_em.nome} (nº ${f.mesclado_em.numero})`}</Link>: os dados e o histórico estão lá.</Aviso>}
      {segmento && <p className="mt-2 text-sm text-suave">{`Segmento ${segmento.nome.toLowerCase()}: ${f.segmento.explicacao}.`}</p>}
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DO_CLIENTE[erro]}</Aviso>}
      {/* #76: cadastro antigo sem WhatsApp continua valendo; a regularização é explícita, sem inventar número. */}
      {f.situacao === "ativo" && !f.mesclado_em && !f.telefone && (
        <Aviso tom="aviso" className="mt-4">Falta o WhatsApp deste cliente: peça o número e corrija o cadastro (em &quot;Corrigir cadastro&quot;). Sem ele, a nota não pode ser enviada pelo WhatsApp.</Aviso>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Dados" subtitulo="Protegidos: aparecem só quando você pede, e fica registrado quem viu." icone={ShieldCheck}>
          <ListaDados itens={[
            [CAMPOS_REVELAVEIS.documento, <Revelar key="d" cliente={f.id} campo="documento" mascara={f.documento} />],
            ["WhatsApp", <Revelar key="t" cliente={f.id} campo="telefone" mascara={f.telefone} />],
            [CAMPOS_REVELAVEIS.email, <Revelar key="e" cliente={f.id} campo="email" mascara={f.email} />],
            ...(f.nascimento_informado ? [[CAMPOS_REVELAVEIS.nascimento, <Revelar key="n" cliente={f.id} campo="nascimento" mascara="informada" />] as const] : []),
            ...(f.endereco_informado ? [[CAMPOS_REVELAVEIS.endereco, <Revelar key="en" cliente={f.id} campo="endereco" mascara="informado" />] as const] : []),
          ]} />
          <p className="mt-3 text-xs text-suave">Usado para: compra, garantia e histórico{f.finalidades.filter(ehFinalidade).map((x) => `; ${FINALIDADES[x].nome.toLowerCase()}`).join("")}.</p>
          {exporta && !f.mesclado_em && (
            <p className="mt-2 text-xs"><Link href={`/clientes/${f.id}/titular`} className="font-semibold text-acao">Relatório dos dados do titular (LGPD)</Link>: para responder quando o cliente pede os dados dele.</p>
          )}
        </Cartao>

        <Cartao titulo="Compras" subtitulo={`${f.compras.total} compra(s) concluída(s) na rede${f.compras.ultima ? `, a última em ${quando(f.compras.ultima)}` : ""}. Abaixo, as que você pode ver.`} icone={ShoppingBag}>
          <ul className="divide-y divide-borda text-sm">
            {compras.data.map((c) => {
              // CRM-009a: a compra que o cliente reservou no site e retirou na loja (a venda segue do balcão).
              const doSiteDaVenda = origemNoSite.get(c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/vendas/${c.id}`} className="font-semibold text-acao">Venda nº {c.numero}</Link>
                  <span className="numeros text-xs text-suave">{quando(c.concluida_em)} · {brl(centavosDoBanco(c.total_centavos))}{c.canal === "online" ? " · loja online" : ""}{c.situacao !== "concluida" ? ` · ${c.situacao}` : ""}
                    {doSiteDaVenda ? ` · ${nomeDaVendaDoSite(doSiteDaVenda)}, de ${quando(doSiteDaVenda.feitoEm)}` : ""}</span>
                </li>
              );
            })}
            {compras.data.length === 0 && <li className="py-2 text-suave">{f.compras.total > 0 ? "As compras deste cliente são de vendas que você não acompanha." : "Nenhuma compra ligada a este cadastro."}</li>}
          </ul>
          {visiveis < f.compras.total && compras.data.length > 0 && <p className="mt-2 text-xs text-suave">Outras {f.compras.total - visiveis} são de vendas que você não acompanha.</p>}
          {doSite.estado === "falha" && compras.data.length > 0 && <p className="mt-2 text-xs text-aviso">Não deu para ler agora quais destas compras vieram de um pedido do site.</p>}
        </Cartao>
      </div>

      <HistoricoDaFicha historico={historico} podeAbrirOs={Boolean(abreOs) && ativo && !f.mesclado_em} cliente={f.id} />

      <Cartao className="mt-4" titulo="Contato e consentimento" subtitulo="Ofertas e pós-venda só com consentimento; retirar vale na hora para as mensagens automáticas. Avisos do próprio serviço (nota, assistência) não dependem disto." icone={MessageSquareHeart}>
        <ul className="divide-y divide-borda text-sm">
          {f.consentimentos.map((c) => (
            <li key={`${c.canal}:${c.finalidade}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{FINALIDADES_DE_CONTATO[c.finalidade] ?? c.finalidade} por {CANAIS[c.canal] ?? c.canal}</span>
              <span className="flex items-center gap-2 text-xs text-suave"><Selo tom={c.situacao === "concedido" ? "sucesso" : "neutro"}>{c.situacao}</Selo>{FONTES[c.fonte]?.toLowerCase()} · {quando(c.registrado_em, true)}</span>
            </li>
          ))}
          {f.consentimentos.length === 0 && <li className="py-2 text-suave">Nenhum consentimento registrado: o cliente não recebe ofertas nem pós-venda.</li>}
        </ul>
        {cadastro && ativo && (
          <form action={registrarConsentimento} className="mt-3 grid gap-2 sm:grid-cols-5">
            <input type="hidden" name="cliente" value={f.id} />
            <label className="text-xs font-medium">Canal<select name="canal" className={campo}>{Object.entries(CANAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="text-xs font-medium sm:col-span-2">Para<select name="finalidade_contato" className={campo}>{Object.entries(FINALIDADES_DE_CONTATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="text-xs font-medium">Como pediu<select name="fonte" className={campo}>{Object.entries(FONTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="text-xs font-medium">Decisão<select name="decisao" className={campo}><option value="concedido">aceita</option><option value="retirado">não aceita mais</option></select></label>
            <Botao type="submit" tamanho="sm" variante="secundario" className="sm:col-span-5 sm:justify-self-start">Registrar</Botao>
          </form>
        )}
      </Cartao>

      {cadastro && ativo && (
        <details className="mt-4 rounded-xl border border-borda bg-white px-3 py-2">
          <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao"><PencilLine aria-hidden className="size-4" /> Corrigir cadastro</summary>
          <div className="mt-2">
            <FormularioCliente chave={`form:${randomUUID()}`} atual={{ id: f.id, tipo: f.tipo, nome: f.nome, finalidades: f.finalidades, documento: f.documento, telefone: f.telefone,
              email: f.email, nascimento_informado: f.nascimento_informado, endereco_informado: f.endereco_informado }} />
          </div>
        </details>
      )}

      {acessos && (
        <Cartao className="mt-4" titulo="Quem consultou ou mudou este cadastro" subtitulo="Últimos 20 registros (LGPD)" icone={Eye}>
          <ul className="divide-y divide-borda text-sm">
            {acessos.data.map((a) => {
              const d = (a.depois ?? {}) as { campo?: string; campos?: string[] };
              const detalhe = d.campo ? ` ${CAMPOS_REVELAVEIS[d.campo as keyof typeof CAMPOS_REVELAVEIS] ?? d.campo}` : d.campos ? ` (${d.campos.join(", ")})` : "";
              return <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{nomeDe(a.usuario_id)} {ACESSOS[a.acao] ?? a.acao}{detalhe}</span><span className="text-xs text-suave">{quando(a.ocorrido_em, true)}</span></li>;
            })}
          </ul>
        </Cartao>
      )}
    </MoldeReal>
  );
}

// ---------------------------------------------------------------------------------------------
// L5e (CRM-002): o que o cliente tem na assistência, no funil e na agenda e no Ora Connect. Cada bloco aparece quando
// há o que mostrar (a OS também para quem abre OS); falha de leitura aparece como falha, nunca como "nenhum".
// ---------------------------------------------------------------------------------------------
const naoLeu = (nome: string) => <p className="text-sm text-suave">{`Não deu para ler ${nome} agora. Recarregue a ficha em instantes.`}</p>;
const SITUACAO_DA_ATIVIDADE: Record<string, string> = { aberta: "a fazer", feita: "feita", cancelada: "cancelada" };
const ehSituacaoDoConnect = (s: string): s is SituacaoOperacao => Object.hasOwn(SITUACOES_OPERACAO, s);

function HistoricoDaFicha({ historico, podeAbrirOs, cliente }: { historico: Awaited<ReturnType<typeof lerHistoricoDoCliente>>; podeAbrirOs: boolean; cliente: string }) {
  const { os, oportunidades, atividades, connect } = historico;
  const temItens = <T,>(b: Bloco<T>) => b.estado === "falha" || (b.estado === "ok" && b.itens.length > 0);
  const mostraOs = os.estado === "falha" || (os.estado === "ok" && (os.itens.length > 0 || podeAbrirOs));
  const mostraCrm = temItens(oportunidades) || temItens(atividades);
  if (!mostraOs && !mostraCrm && !temItens(connect)) return null;
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {mostraOs && (
        <Cartao titulo="Assistência" subtitulo="Ordens de serviço deste cliente que você acompanha" icone={Wrench}>
          {os.estado === "falha" ? naoLeu("as ordens de serviço") : os.estado === "ok" && os.itens.length === 0 ? (
            <p className="text-sm text-suave">Nenhuma ordem de serviço deste cliente.</p>
          ) : os.estado === "ok" && (
            <ul className="divide-y divide-borda text-sm">
              {os.itens.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0"><Link href={`/assistencia/${o.id}`} className="font-semibold text-acao">OS nº {o.numero}</Link><span className="text-suave"> · {o.aparelho}</span></span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-suave">
                    <Selo tom={o.situacao === "aberta" ? "info" : "neutro"}>{o.situacao === "aberta" && ehServico(o.servico) ? SERVICOS[o.servico] : SITUACOES_DA_OS[o.situacao as keyof typeof SITUACOES_DA_OS] ?? o.situacao}</Selo>
                    {quando(o.aberta_em)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {podeAbrirOs && os.estado === "ok" && os.itens.length === 0 && <p className="mt-2 text-xs"><Link href={`/assistencia/nova?cliente=${cliente}`} className="font-semibold text-acao">Abrir ordem de serviço</Link></p>}
        </Cartao>
      )}
      {mostraCrm && (
        <Cartao titulo="Funil e agenda" subtitulo="Negociações e próximos contatos deste cliente que você acompanha" icone={CalendarClock}>
          {oportunidades.estado === "falha" && naoLeu("o funil")}
          {oportunidades.estado === "ok" && oportunidades.itens.length > 0 && (
            <ul className="divide-y divide-borda text-sm">
              {oportunidades.itens.map((o) => (
                <li key={o.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/crm/${o.id}`} className="font-semibold text-acao">{o.interesse}</Link>
                    {ehEtapa(o.etapa) && <Selo tom={ETAPAS[o.etapa].tom}>{ETAPAS[o.etapa].nome}</Selo>}
                  </div>
                  {ehEtapa(o.etapa) && ETAPAS_ABERTAS.includes(o.etapa) && o.proximo_passo && (
                    <p className="text-xs text-suave">Próximo passo: {o.proximo_passo}{o.proximo_passo_em ? ` (${quando(o.proximo_passo_em)})` : ""}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {atividades.estado === "falha" && naoLeu("a agenda")}
          {atividades.estado === "ok" && atividades.itens.length > 0 && (
            <ul className="mt-2 divide-y divide-borda border-t border-borda text-sm">
              {atividades.itens.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">{TIPOS_DE_ATIVIDADE[a.tipo as keyof typeof TIPOS_DE_ATIVIDADE] ?? a.tipo}<span className="text-suave"> · {a.descricao}</span></span>
                  <span className="flex items-center gap-2 text-xs text-suave"><Selo tom={a.situacao === "aberta" ? "aviso" : "neutro"}>{SITUACAO_DA_ATIVIDADE[a.situacao] ?? a.situacao}</Selo>{quando(a.vence_em)}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}
      {temItens(connect) && (
        <Cartao titulo="Ora Connect" subtitulo="Ativações, portabilidades e recargas das compras deste cliente que você acompanha" icone={RadioTower}>
          {connect.estado === "falha" ? naoLeu("as operações do Ora Connect") : connect.estado === "ok" && (
            <ul className="divide-y divide-borda text-sm">
              {connect.itens.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">{ehTipoOperacao(o.tipo) ? NOMES_DAS_OPERACOES[o.tipo] : o.tipo}<span className="numeros text-suave">{` nº ${o.numero}`}{o.linha ? ` · linha ${o.linha}` : ""}{o.plano ? ` · ${o.plano}` : ""}</span></span>
                  <span className="flex items-center gap-2 text-xs text-suave"><Selo tom={o.situacao === "confirmada" ? "sucesso" : ["recusada", "negada", "erro_operadora", "resultado_desconhecido"].includes(o.situacao) ? "aviso" : "neutro"}>{ehSituacaoDoConnect(o.situacao) ? SITUACOES_OPERACAO[o.situacao].nome : o.situacao}</Selo>{quando(o.criado_em)}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}
    </div>
  );
}

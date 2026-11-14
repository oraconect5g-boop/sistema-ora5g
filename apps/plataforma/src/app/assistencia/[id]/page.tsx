import { randomUUID } from "node:crypto";

import { ArrowLeft, Camera, ClipboardList, History, MessageCircle, Route, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { BotaoConfirmar } from "../../../componentes/BotaoConfirmar";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { EstadoDoPainel } from "../../../componentes/paineis-de-vendas";
import { Aviso, Cartao, ListaDados, Selo, TituloPagina } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { assistenciasDaRede, lerOrdem, type OrcamentoDaOs, type OrdemDeServico } from "../../../lib/assistencia/consulta";
import {
  ACESSORIOS, atrasada, CANAIS_DE_RESPOSTA, ERROS_DA_OS, EVENTOS, LINHAS_DE_PECAS, LOCAIS, PASSOS, SERVICOS, SITUACOES, SITUACOES_DO_ORCAMENTO, type Passo, type ServicoDaOs,
} from "../../../lib/assistencia/regras";
import { brl } from "../../../lib/formato";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { configuracaoSupabase } from "../../../lib/supabase/configuracao";
import { avisarPeloWhatsApp, concluirServico, orcarOrdem, passoDaOrdem, responderOrcamento } from "../acoes";
import { EnviarFotoDaOs } from "./EnviarFotoDaOs";

export const metadata: Metadata = { title: "Ordem de serviço" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
const dataBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
const OK = {
  aberta: "Ordem de serviço aberta. Tire as fotos do aparelho e mande o comprovante pelo WhatsApp do cliente.",
  enviar_ao_tecnico: "Saída para o técnico registrada.", tecnico_recebeu: "Recebimento pelo técnico registrado.", tecnico_devolveu: "Devolução pelo técnico registrada.",
  loja_recebeu: "Chegada na loja registrada. Avise o cliente pelo WhatsApp.", devolver_ao_cliente: "Aparelho devolvido ao cliente; a OS foi encerrada.",
  cancelar: "Ordem de serviço cancelada; o motivo ficou registrado.", sem_mudanca: "Nada mudou: este passo já estava registrado.",
  orcamento: "Orçamento registrado. A loja manda ao cliente e registra a resposta.", orcamento_aprovado: "Aprovação do cliente registrada: o técnico pode consertar.",
  orcamento_recusado: "Recusa do cliente registrada: o aparelho volta para ser devolvido (ou o técnico faz outro orçamento).", concluido: "Conserto concluído registrado.",
} as const;

// A ordem de serviço (lote L12a: ORA-OS-001, ORA-OS-002 e ORA-OS-005 em parte): os dados do aparelho, a custódia passo a
// passo, as fotos, o aviso pelo WhatsApp (clique para conversar, com a mensagem pronta) e a trilha. O banco decide quem
// faz cada passo; a tela só mostra o próximo passo possível para quem está vendo.
export default async function Ordem({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DA_OS, parametros.erro);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const [abrir, gerir, orcar] = await Promise.all(["os.abrir", "os.gerir", "os.orcar"].map((p) => supabase.rpc("tem_permissao", { p_permissao: p, p_unidade: unidade })));
  if (abrir?.error || gerir?.error || orcar?.error) throw new FalhaDoServico("tem_permissao");
  const leitura = await lerOrdem(supabase, id);
  if (leitura.estado === "nao_encontrada") notFound();
  if (leitura.estado !== "ok") {
    return <MoldeReal sessao={sessao}><Cartao className="mt-6" titulo="Ordem de serviço"><EstadoDoPainel estado={leitura.estado} fonte="assistencia" tentarDeNovo={`/assistencia/${id}`} /></Cartao></MoldeReal>;
  }
  const { os, eventos, fotos, nomes, servico, orcamentos } = leitura;
  const daLoja = os.unidade_id === unidade;
  const pela = { loja: daLoja && Boolean(abrir?.data), gerencia: daLoja && Boolean(gerir?.data), tecnico: os.assistencia_id === unidade && Boolean(orcar?.data) };
  const aberta = os.situacao === "aberta";
  const voltouDoTecnico = eventos.some((e) => e.tipo === "recebida_na_loja");
  const foiAoTecnico = eventos.some((e) => e.tipo === "enviada_ao_tecnico");
  const assistencias = aberta && os.local === "loja" && pela.loja ? await assistenciasDaRede(supabase) : null;
  const configuracao = aberta && pela.loja && fotos.length < 8 ? configuracaoSupabase() : null;

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/assistencia" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Assistência</Link>
      <TituloPagina titulo={`OS nº ${os.numero}`} subtitulo={<span className="flex flex-wrap items-center gap-2">
        {aberta ? <Selo tom="info">{LOCAIS[os.local]}</Selo> : <Selo tom="neutro">{SITUACOES[os.situacao]}</Selo>}
        {aberta && servico && <Selo tom={servico === "aprovado" || servico === "concluido" ? "sucesso" : servico === "recusado" ? "aviso" : "neutro"}>{SERVICOS[servico]}</Selo>}
        {atrasada(os, hoje) && <Selo tom="perigo">{`atrasada · prazo ${dataBr(os.prazo as string)}`}</Selo>}
        <span>{`aberta em ${quando(os.aberta_em)} por ${nomes[os.aberta_por] ?? "—"}`}</span></span>} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_OS[erro]}</Aviso>}
      {!aberta && os.motivo_encerramento && <Aviso tom="neutro" className="mt-4">{`${SITUACOES[os.situacao]} em ${quando(os.encerrada_em as string)}: ${os.motivo_encerramento}`}</Aviso>}

      <Cartao className="mt-4" titulo="Aparelho" icone={Smartphone}>
        <ListaDados itens={[
          ["Cliente", `${os.cliente_nome} · WhatsApp ${os.contato_mascarado}`],
          ["Aparelho", os.aparelho],
          [os.imei ? "IMEI" : "Número de série", <span key="id" className="numeros">{os.imei ?? os.numero_serie}</span>],
          ["Defeito relatado", os.defeito],
          ["Estado na chegada", os.estado_entrada],
          ["Acessórios deixados", os.acessorios.length ? os.acessorios.map((a) => (ACESSORIOS as Record<string, string>)[a] ?? a).join(", ") + (os.acessorios_obs ? ` (${os.acessorios_obs})` : "") : (os.acessorios_obs ?? "nenhum")],
          ["Prazo combinado", os.prazo ? dataBr(os.prazo) : "não combinado"],
        ]} />
      </Cartao>

      {aberta && (pela.loja || pela.gerencia || pela.tecnico) && (
        <Cartao className="mt-4" titulo="Onde está e o próximo passo" icone={Route} subtitulo={`Agora: ${LOCAIS[os.local].toLowerCase()}`}>
          <ProximosPassos os={os} pela={pela} foiAoTecnico={foiAoTecnico} assistencias={assistencias} />
        </Cartao>
      )}

      {orcamentos && <CartaoDoOrcamento os={os} aberta={aberta} servico={servico} orcamentos={orcamentos} pela={pela} nomes={nomes} />}

      {aberta && pela.loja && (
        <Cartao className="mt-4" titulo="Aviso ao cliente pelo WhatsApp" icone={MessageCircle}
          subtitulo="Abre a conversa no WhatsApp da loja com a mensagem pronta; quem envia é você (sem envio automático até a integração oficial).">
          <div className="flex flex-wrap gap-2">
            <form action={avisarPeloWhatsApp}><input type="hidden" name="os" value={os.id} /><input type="hidden" name="aviso" value="comprovante" />
              <BotaoConfirmar variante="secundario" tamanho="md" enquanto="Abrindo o WhatsApp…">Mandar o comprovante</BotaoConfirmar></form>
            {servico === "aguardando_cliente" && (
              <form action={avisarPeloWhatsApp}><input type="hidden" name="os" value={os.id} /><input type="hidden" name="aviso" value="orcamento" />
                <BotaoConfirmar variante="secundario" tamanho="md" enquanto="Abrindo o WhatsApp…">Mandar o orçamento</BotaoConfirmar></form>
            )}
            {os.local === "loja" && voltouDoTecnico && (
              <form action={avisarPeloWhatsApp}><input type="hidden" name="os" value={os.id} /><input type="hidden" name="aviso" value="na_loja" />
                <BotaoConfirmar variante="secundario" tamanho="md" enquanto="Abrindo o WhatsApp…">Avisar que o aparelho chegou</BotaoConfirmar></form>
            )}
          </div>
        </Cartao>
      )}

      <Cartao className="mt-4" titulo="Fotos do aparelho" icone={Camera} subtitulo={`${fotos.length} de até 8 · o estado em que chegou, para conferir na devolução`}>
        {fotos.length > 0 && (
          <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {fotos.map((f, i) => (
              <li key={f.id}>
                {f.url
                  // eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário do Storage privado
                  ? <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={`Foto ${i + 1} do aparelho`} className="aspect-square w-full rounded-lg border border-borda object-cover" /></a>
                  : <span className="grid aspect-square place-items-center rounded-lg border border-dashed border-borda text-xs text-suave">foto indisponível agora</span>}
              </li>
            ))}
          </ul>
        )}
        {configuracao ? (
          <EnviarFotoDaOs supabaseUrl={configuracao.url} chavePublica={configuracao.chavePublica} organizacao={os.organizacao_id} unidade={os.unidade_id} os={os.id} />
        ) : fotos.length === 0 && <p className="text-sm text-suave">Nenhuma foto guardada.</p>}
      </Cartao>

      <Cartao className="mt-4" titulo="Trilha" icone={History} subtitulo="Cada passo, quem fez e quando; nada se apaga">
        <ol className="space-y-2 text-sm">
          {eventos.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{(EVENTOS as Record<string, string>)[e.tipo] ?? e.tipo}</span>
              <span className="text-xs text-suave">{`${quando(e.ocorrido_em)} · ${nomes[e.usuario_id] ?? "—"}${e.em_nome_do_tecnico ? " (em nome do técnico)" : ""}`}</span>
              {e.observacao && <span className="w-full text-xs text-suave">{e.observacao}</span>}
            </li>
          ))}
        </ol>
      </Cartao>
    </MoldeReal>
  );
}

function FormularioDoPasso({ os, passo, children, observacao, assistencias }: {
  os: string; passo: Passo; children: string; observacao?: { rotulo: string; obrigatoria: boolean }; assistencias?: { id: string; nome: string }[] | null;
}) {
  return (
    <form action={passoDaOrdem} className="space-y-2 rounded-xl border border-borda p-3">
      <input type="hidden" name="os" value={os} />
      <input type="hidden" name="passo" value={passo} />
      {assistencias && assistencias.length > 1 && (
        <label className="block text-sm font-medium">Para qual assistência<select name="assistencia" required className={campo}>{assistencias.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>
      )}
      {observacao && (
        <label className="block text-sm font-medium">{observacao.rotulo}<input name="observacao" required={observacao.obrigatoria} minLength={observacao.obrigatoria ? 3 : undefined} maxLength={observacao.obrigatoria ? 200 : 300} className={campo} /></label>
      )}
      <BotaoConfirmar variante="secundario" tamanho="md">{children}</BotaoConfirmar>
    </form>
  );
}

function ProximosPassos({ os, pela, foiAoTecnico, assistencias }: {
  os: OrdemDeServico; pela: { loja: boolean; gerencia: boolean; tecnico: boolean }; foiAoTecnico: boolean; assistencias: { id: string; nome: string }[] | null;
}) {
  const passos: ReactNode[] = [];
  if (os.local === "loja" && pela.loja) {
    if (assistencias && assistencias.length === 0) passos.push(<Aviso key="sem" tom="aviso">{ERROS_DA_OS.sem_assistencia}</Aviso>);
    else passos.push(<FormularioDoPasso key="enviar" os={os.id} passo="enviar_ao_tecnico" assistencias={assistencias} observacao={{ rotulo: "Observação (opcional)", obrigatoria: false }}>{PASSOS.enviar_ao_tecnico.rotulo}</FormularioDoPasso>);
    passos.push(<FormularioDoPasso key="devolver" os={os.id} passo="devolver_ao_cliente" observacao={{ rotulo: "Motivo da devolução sem conserto", obrigatoria: true }}>{PASSOS.devolver_ao_cliente.rotulo}</FormularioDoPasso>);
  }
  if (os.local === "loja" && pela.gerencia && !foiAoTecnico) {
    passos.push(<FormularioDoPasso key="cancelar" os={os.id} passo="cancelar" observacao={{ rotulo: "Motivo do cancelamento", obrigatoria: true }}>{PASSOS.cancelar.rotulo}</FormularioDoPasso>);
  }
  for (const passo of ["tecnico_recebeu", "tecnico_devolveu"] as const) {
    if (os.local !== PASSOS[passo].de) continue;
    if (pela.tecnico) passos.push(<FormularioDoPasso key={passo} os={os.id} passo={passo} observacao={{ rotulo: "Observação (opcional)", obrigatoria: false }}>{passo === "tecnico_recebeu" ? "Recebi o aparelho" : "Mandei de volta para a loja"}</FormularioDoPasso>);
    else if (pela.gerencia) passos.push(<FormularioDoPasso key={passo} os={os.id} passo={passo} observacao={{ rotulo: "Como o técnico confirmou", obrigatoria: true }}>{`${PASSOS[passo].rotulo} (em nome dele)`}</FormularioDoPasso>);
  }
  if (os.local === "a_caminho_da_loja" && pela.loja) passos.push(<FormularioDoPasso key="chegou" os={os.id} passo="loja_recebeu">{PASSOS.loja_recebeu.rotulo}</FormularioDoPasso>);
  if (passos.length === 0) return <p className="text-sm text-suave">{`Nenhum passo seu agora: aguarde ${os.local === "com_tecnico" || os.local === "a_caminho_do_tecnico" ? "o técnico" : "a loja"}.`}</p>;
  return <div className="grid gap-3 sm:grid-cols-2">{passos}</div>;
}

function CartaoDoOrcamento({ os, aberta, servico, orcamentos, pela, nomes }: {
  os: OrdemDeServico; aberta: boolean; servico: ServicoDaOs | null; orcamentos: OrcamentoDaOs[];
  pela: { loja: boolean; gerencia: boolean; tecnico: boolean }; nomes: Record<string, string>;
}) {
  const vigente = orcamentos.find((o) => o.situacao === "aguardando_cliente");
  const comOTecnico = aberta && os.local === "com_tecnico";
  const podeOrcar = comOTecnico && servico !== "concluido" && (pela.tecnico || pela.gerencia);
  const podeConcluir = comOTecnico && servico === "aprovado" && (pela.tecnico || pela.gerencia);
  const emNome = !pela.tecnico;
  return (
    <Cartao className="mt-4" titulo="Orçamento" icone={ClipboardList}
      subtitulo={servico ? `${SERVICOS[servico]}: nada é consertado sem a resposta do cliente registrada` : "Nada é consertado sem a resposta do cliente registrada"}>
      {orcamentos.length === 0 && <p className="text-sm text-suave">{`Nenhum orçamento ainda.${aberta && os.local !== "com_tecnico" ? " O orçamento é feito com o aparelho com o técnico." : ""}`}</p>}
      <ul className="space-y-3">
        {orcamentos.map((o) => (
          <li key={o.id} className="rounded-xl border border-borda px-4 py-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {`Orçamento nº ${o.numero} · ${brl(o.total_centavos)}`}
              <Selo tom={o.situacao === "aprovado" ? "sucesso" : o.situacao === "recusado" ? "aviso" : o.situacao === "substituido" ? "neutro" : "info"}>{SITUACOES_DO_ORCAMENTO[o.situacao]}</Selo>
            </p>
            <p className="mt-1">{o.diagnostico}</p>
            <ul className="mt-1 text-xs text-suave">
              {o.pecas.map((p, i) => <li key={i}>{`${p.descricao}${p.quantidade > 1 ? ` × ${p.quantidade}` : ""}: ${brl(p.quantidade * p.valor)}`}</li>)}
              {o.mao_de_obra_centavos > 0 && <li>{`Mão de obra: ${brl(o.mao_de_obra_centavos)}`}</li>}
              {o.prazo_dias && <li>{`Prazo do conserto: ${o.prazo_dias} ${o.prazo_dias === 1 ? "dia" : "dias"} depois da aprovação`}</li>}
            </ul>
            <p className="mt-1 text-xs text-suave">{`Registrado em ${quando(o.registrado_em)} por ${nomes[o.registrado_por] ?? "—"}${o.em_nome_do_tecnico ? " (em nome do técnico)" : ""}${o.observacao ? `: ${o.observacao}` : ""}`}</p>
            {o.respondido_em && (
              <p className="mt-1 text-xs text-suave">{`${o.situacao === "aprovado" ? "Aprovado" : "Recusado"} pelo cliente ${CANAIS_DE_RESPOSTA[o.resposta_canal as keyof typeof CANAIS_DE_RESPOSTA]?.toLowerCase() ?? ""} em ${quando(o.respondido_em)}, registrado por ${nomes[o.respondido_por ?? ""] ?? "—"}${o.resposta_observacao ? `: ${o.resposta_observacao}` : ""}`}</p>
            )}
          </li>
        ))}
      </ul>

      {aberta && pela.loja && vigente && (
        <form action={responderOrcamento} className="mt-3 grid gap-2 rounded-xl border border-borda p-3 sm:grid-cols-4">
          <input type="hidden" name="os" value={os.id} />
          <input type="hidden" name="orcamento" value={vigente.id} />
          <p className="text-sm font-semibold sm:col-span-4">{`Resposta do cliente ao orçamento nº ${vigente.numero}`}</p>
          <label className="text-sm font-medium">Resposta<select name="resposta" required className={campo}><option value="aprovado">Aprovou</option><option value="recusado">Recusou</option></select></label>
          <label className="text-sm font-medium">Por onde<select name="canal" required className={campo}>{Object.entries(CANAIS_DE_RESPOSTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-sm font-medium sm:col-span-2">Observação <span className="font-normal text-suave">(opcional)</span><input name="observacao" maxLength={300} className={campo} /></label>
          <div className="sm:col-span-4"><BotaoConfirmar variante="secundario" tamanho="md">Registrar a resposta</BotaoConfirmar></div>
        </form>
      )}

      {podeOrcar && (
        <form action={orcarOrdem} className="mt-3 grid gap-2 rounded-xl border border-borda p-3 sm:grid-cols-6">
          <input type="hidden" name="os" value={os.id} />
          <input type="hidden" name="chave" value={randomUUID()} />
          <p className="text-sm font-semibold sm:col-span-6">{vigente ? "Novo orçamento (substitui o que espera o cliente)" : servico === "aprovado" ? "Novo orçamento (o cliente precisa aprovar de novo)" : "Registrar o orçamento"}</p>
          <label className="text-sm font-medium sm:col-span-6">Diagnóstico<textarea name="diagnostico" required minLength={3} maxLength={1000} rows={2} className={`${campo} py-2`} /></label>
          {Array.from({ length: LINHAS_DE_PECAS }, (_, i) => i + 1).map((i) => (
            <div key={i} className="grid gap-2 sm:col-span-6 sm:grid-cols-6">
              <label className="text-sm font-medium sm:col-span-3">{`Peça ${i}`} <span className="font-normal text-suave">(opcional)</span><input name={`peca_descricao_${i}`} maxLength={120} className={campo} /></label>
              <label className="text-sm font-medium">Qtd.<input name={`peca_quantidade_${i}`} inputMode="numeric" defaultValue="1" maxLength={2} className={campo} /></label>
              <label className="text-sm font-medium sm:col-span-2">Valor (R$)<input name={`peca_valor_${i}`} inputMode="decimal" className={campo} /></label>
            </div>
          ))}
          <label className="text-sm font-medium sm:col-span-2">Mão de obra (R$)<input name="mao_de_obra" inputMode="decimal" className={campo} /></label>
          <label className="text-sm font-medium sm:col-span-2">Prazo do conserto (dias) <span className="font-normal text-suave">(opcional)</span><input name="prazo_dias" inputMode="numeric" maxLength={2} className={campo} /></label>
          <label className="text-sm font-medium sm:col-span-2">{emNome ? "Como o técnico passou o orçamento" : "Observação (opcional)"}<input name="observacao" required={emNome} minLength={emNome ? 2 : undefined} maxLength={300} className={campo} /></label>
          <div className="sm:col-span-6"><BotaoConfirmar variante="secundario" tamanho="md">{emNome ? "Registrar o orçamento (em nome do técnico)" : "Registrar o orçamento"}</BotaoConfirmar></div>
        </form>
      )}

      {podeConcluir && (
        <form action={concluirServico} className="mt-3 space-y-2 rounded-xl border border-borda p-3">
          <input type="hidden" name="os" value={os.id} />
          <label className="block text-sm font-medium">{emNome ? "Como o técnico confirmou o conserto" : "Observação (opcional)"}<input name="observacao" required={emNome} minLength={emNome ? 2 : undefined} maxLength={300} className={campo} /></label>
          <BotaoConfirmar variante="secundario" tamanho="md">{emNome ? "Conserto concluído (em nome do técnico)" : "Conserto concluído"}</BotaoConfirmar>
        </form>
      )}
    </Cartao>
  );
}

import { ArrowLeft, Camera, History, MessageCircle, Route, Smartphone } from "lucide-react";
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
import { assistenciasDaRede, lerOrdem, type OrdemDeServico } from "../../../lib/assistencia/consulta";
import { ACESSORIOS, atrasada, ERROS_DA_OS, EVENTOS, LOCAIS, PASSOS, SITUACOES, type Passo } from "../../../lib/assistencia/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { configuracaoSupabase } from "../../../lib/supabase/configuracao";
import { avisarPeloWhatsApp, passoDaOrdem } from "../acoes";
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
  const { os, eventos, fotos, nomes } = leitura;
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

      {aberta && pela.loja && (
        <Cartao className="mt-4" titulo="Aviso ao cliente pelo WhatsApp" icone={MessageCircle}
          subtitulo="Abre a conversa no WhatsApp da loja com a mensagem pronta; quem envia é você (sem envio automático até a integração oficial).">
          <div className="flex flex-wrap gap-2">
            <form action={avisarPeloWhatsApp}><input type="hidden" name="os" value={os.id} /><input type="hidden" name="aviso" value="comprovante" />
              <BotaoConfirmar variante="secundario" tamanho="md" enquanto="Abrindo o WhatsApp…">Mandar o comprovante</BotaoConfirmar></form>
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

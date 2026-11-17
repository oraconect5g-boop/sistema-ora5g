import { Building2, CalendarClock, History, Pencil, Plus, Power, ShieldAlert, Store, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, ListaDados, Selo, TituloPagina } from "../../componentes/ui";
import { ehUuid } from "../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { dataCurta } from "../../lib/formato";
import {
  DIAS_DA_SEMANA, ERROS_DE_LOJAS, PENDENCIAS, TIPOS_DE_LOJA, ehPendencia, ehTipoDeLoja, formatarCnpj, formatarTelefone,
  isoParaHoraDeSaoPaulo, lacunasDaLoja, textoDoEndereco, textoDosHorarios, type Horario, vendeNaLoja,
} from "../../lib/lojas/regras";
import { lerRegioesDoPainel } from "../../lib/lojas/regioes";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { atualizarLoja, criarLoja, definirConfiguracao, definirSituacao } from "./acoes";
import { campo, Motivo, rotulo } from "./formulario";
import { CartaoDasRegioes, RegiaoDaLoja } from "./Regioes";

export const metadata: Metadata = { title: "Lojas da rede" };
export const dynamic = "force-dynamic";

const OK = {
  criada: "Loja cadastrada e ativa. Agora preencha telefone, endereço e horários em \"Nova configuração\".",
  repetida: "Esta loja já estava cadastrada com os mesmos dados: nada foi duplicado.",
  atualizada: "Dados da loja atualizados.",
  sem_mudanca: "Nada mudou: os dados já eram esses.",
  configurada: "Configuração gravada; vale a partir de agora.",
  agendada: "Configuração agendada; vale a partir da data escolhida.",
  configuracao_igual: "A configuração já era essa: nenhuma versão nova foi criada.",
  inativada: "Loja inativada. Ela sai da escolha de loja; o histórico continua guardado.",
  reativada: "Loja reativada. A equipe já pode escolhê-la ao entrar.",
  regiao_criada: "Região cadastrada. Agora escolha a região de cada loja (no cartão da loja).",
  regiao_repetida: "Esta região já existia: nada foi duplicado.",
  regiao_alterada: "Região atualizada.",
  regiao_da_loja: "Região da loja gravada. O Início e os Relatórios já somam as lojas por região.",
} as const;

const quando = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "") : "—";

type LojaDaRede = {
  id: string; organizacao_id: string; empresa_id: string; codigo: string; nome: string; tipo: string; cnpj: string | null;
  uf: string | null; cidade: string | null; status: string; unidade_emissora_id: string | null; vigente_desde: string | null;
  telefone: string | null; cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null;
  bairro: string | null; inscricao_estadual: string | null; inscricao_municipal: string | null; horarios: unknown;
  versoes: number; proxima_versao: string | null;
};
type Versao = {
  id: number; vigente_desde: string; telefone: string | null; cep: string | null; logradouro: string | null; numero: string | null;
  complemento: string | null; bairro: string | null; inscricao_estadual: string | null; inscricao_municipal: string | null;
  horarios: unknown; motivo: string; criado_por_nome: string | null; criado_em: string;
};

// Horários vindos do banco (jsonb): só o que tem a forma certa.
function horariosDe(valor: unknown): Horario[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((h): h is Horario =>
    typeof h === "object" && h !== null && typeof (h as Horario).dia === "number" && typeof (h as Horario).abre === "string" && typeof (h as Horario).fecha === "string");
}


// Lojas da rede (lote L2: ORA-ORG-001, ORA-ORG-008). Dono e administrador cadastram, editam,
// configuram com vigência e inativam sem apagar. Tudo passa pelas funções do banco.
export default async function Lojas({ searchParams }: {
  searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro; loja?: ValorDeParametro; falta?: ValorDeParametro; historico?: ValorDeParametro; form?: ValorDeParametro }>;
}) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DE_LOJAS, parametros.erro);
  const falta = (textoDoParametro(parametros.falta) ?? "").split(".").filter(ehPendencia);
  const lojaEmFoco = ehUuid(parametros.loja) ? parametros.loja : null;
  const historicoDe = ehUuid(parametros.historico) ? parametros.historico : null;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;

  const permitido = await supabase.rpc("tem_permissao", { p_permissao: "unidades.gerir" });
  if (permitido.error) throw new FalhaDoServico("tem_permissao");
  if (!permitido.data) {
    return (
      <MoldeReal sessao={sessao}>
        <Cartao titulo="Sem permissão" icone={ShieldAlert}>
          <p className="text-sm text-suave">Só o dono e o administrador cuidam do cadastro das lojas. O banco também recusa, mesmo que alguém digite o endereço.</p>
        </Cartao>
      </MoldeReal>
    );
  }

  // ORG-009: as regiões (num banco sem a migration, nulo: os blocos das regiões não aparecem).
  const [resposta, empresasResposta, historicoResposta, regioes] = await Promise.all([
    supabase.rpc("lojas_da_rede"),
    supabase.from("empresas").select("id, organizacao_id, razao_social, nome_fantasia, cnpj_raiz").eq("status", "ativa").order("razao_social"),
    historicoDe ? supabase.rpc("loja_historico", { p_unidade: historicoDe }) : Promise.resolve({ data: [], error: null }),
    lerRegioesDoPainel(supabase),
  ]);
  if (resposta.error || empresasResposta.error || historicoResposta.error) throw new FalhaDoServico("lojas");
  const lojas = (resposta.data ?? []) as unknown as LojaDaRede[];
  const historico = (historicoResposta.data ?? []) as unknown as Versao[];
  const organizacoes = new Set(lojas.map((l) => l.organizacao_id));
  const empresas = empresasResposta.data.filter((e) => organizacoes.has(e.organizacao_id));
  const nomeDaLoja = (id: string | null) => lojas.find((l) => l.id === id)?.nome ?? "—";
  const ativas = lojas.filter((l) => l.status === "ativa");
  const incompletas = lojas.filter((l) => lacunasDaLoja({ ...l, horarios: horariosDe(l.horarios) }).length > 0);
  const agoraEmSaoPaulo = isoParaHoraDeSaoPaulo(new Date().toISOString());

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina titulo="Lojas da rede" subtitulo="Cadastro, situação e configuração de cada loja. Toda mudança pede motivo e fica na auditoria; nada é apagado." />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && erro !== "pendencias" && <Aviso tom="perigo" className="mt-4">{ERROS_DE_LOJAS[erro]}</Aviso>}
      {erro === "pendencias" && (
        <Aviso tom="perigo" className="mt-4" titulo={`${nomeDaLoja(lojaEmFoco)} continua ativa`}>
          <p>Para inativar, resolva antes:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {(falta.length ? falta : []).map((p) => <li key={p}><strong>{PENDENCIAS[p].texto}</strong>: {PENDENCIAS[p].resolver}</li>)}
            {falta.length === 0 && <li>movimento em aberto na loja.</li>}
          </ul>
        </Aviso>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {([["Ativas", ativas.length, "text-sucesso"], ["Inativas", lojas.length - ativas.length, "text-suave"], ["Cadastro incompleto", incompletas.length, incompletas.length ? "text-aviso" : "text-suave"]] as const)
          .map(([nome, valor, cor]) => (
            <div key={nome} className="rounded-cartao border border-borda/80 bg-superficie px-2 py-3 shadow-cartao">
              <dt className="text-xs text-suave">{nome}</dt>
              <dd className={`numeros text-2xl font-bold ${cor}`}>{valor}</dd>
            </div>
          ))}
      </dl>

      <details className="group mt-4 rounded-cartao border border-borda/80 bg-superficie shadow-cartao" open={textoDoParametro(parametros.form) === "nova"}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 font-semibold sm:px-6">
          <span className="grid size-9 place-items-center rounded-full bg-acao-clara text-acao"><Plus aria-hidden className="size-4" /></span>
          Cadastrar loja
        </summary>
        <form action={criarLoja} className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-6 sm:pb-6">
          {empresas.length === 1 ? (
            <p className="text-sm text-suave sm:col-span-2">
              <input type="hidden" name="empresa" value={empresas[0]?.id} />
              Empresa: <strong className="text-texto">{empresas[0]?.nome_fantasia ?? empresas[0]?.razao_social}</strong> (CNPJ raiz {empresas[0]?.cnpj_raiz.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3")})
            </p>
          ) : (
            <label className={`${rotulo} sm:col-span-2`}>Empresa
              <select name="empresa" required className={campo}>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia ?? e.razao_social}</option>)}</select>
            </label>
          )}
          <label className={rotulo}>Nome<input name="nome" required maxLength={80} placeholder="Santa Cândida" className={campo} /></label>
          <label className={rotulo}>Código (não muda depois)
            <input name="codigo" required pattern="[a-z0-9][a-z0-9\-]{1,39}" maxLength={40} placeholder="santa-candida" autoCapitalize="none" className={campo} />
          </label>
          <label className={rotulo}>Tipo
            <select name="tipo" required className={campo} defaultValue="loja_fisica">
              {Object.entries(TIPOS_DE_LOJA).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
            </select>
          </label>
          <label className={rotulo}>CNPJ da filial (sem ele, a loja física existe, mas não vende)
            <input name="cnpj" inputMode="numeric" pattern="[0-9./\- ]{14,20}" placeholder="00.000.000/0000-00" className={campo} />
          </label>
          <label className={rotulo}>Cidade<input name="cidade" maxLength={80} className={campo} /></label>
          <label className={rotulo}>UF<input name="uf" maxLength={2} pattern="[A-Za-z]{2}" placeholder="PR" autoCapitalize="characters" className={campo} /></label>
          <label className={`${rotulo} sm:col-span-2`}>Loja online sem CNPJ próprio: qual loja emite as notas
            <select name="emissora" className={campo} defaultValue="">
              <option value="">—</option>
              {ativas.filter((l) => l.cnpj).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2"><Motivo exemplo="Abertura da loja" /></div>
          <Botao type="submit" className="sm:col-span-2"><Store aria-hidden className="size-4" /> Cadastrar loja</Botao>
        </form>
      </details>

      <ul className="mt-4 space-y-4">
        {lojas.map((l) => {
          const horarios = horariosDe(l.horarios);
          const lacunas = lacunasDaLoja({ ...l, horarios });
          const ativa = l.status === "ativa";
          const tipo = ehTipoDeLoja(l.tipo) ? TIPOS_DE_LOJA[l.tipo] : l.tipo;
          const emFoco = lojaEmFoco === l.id || historicoDe === l.id;
          const versoesDaLoja = historicoDe === l.id ? historico : [];
          return (
            <li key={l.id} id={`loja-${l.id}`} className="scroll-mt-24">
              <Cartao
                titulo={<span className="flex flex-wrap items-center gap-2">{l.nome}<Selo tom={ativa ? "sucesso" : "neutro"} ponto>{ativa ? "ativa" : "inativa"}</Selo>{!vendeNaLoja(l) && <Selo tom="aviso">não vende: falta o CNPJ</Selo>}</span>}
                subtitulo={[tipo, l.codigo, l.cnpj ? `CNPJ ${formatarCnpj(l.cnpj)}` : l.unidade_emissora_id ? `notas pela ${nomeDaLoja(l.unidade_emissora_id)}` : "sem CNPJ", [l.cidade, l.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
                icone={Building2}
                className={emFoco ? "ring-2 ring-acao/40" : ""}
              >
                {lacunas.length > 0 && (
                  <p className="mb-3 flex items-center gap-2 text-sm text-aviso"><TriangleAlert aria-hidden className="size-4 shrink-0" /> Falta cadastrar: {lacunas.join(", ")}.</p>
                )}
                <ListaDados itens={[
                  ["Telefone", formatarTelefone(l.telefone) || "—"],
                  ["Endereço", textoDoEndereco(l) || "—"],
                  ["Horário", textoDosHorarios(horarios)],
                  ["Inscrição estadual", l.inscricao_estadual ?? "—"],
                  ["Inscrição municipal", l.inscricao_municipal ?? "—"],
                  ["Configuração vale desde", l.vigente_desde ? quando(l.vigente_desde) : "sem configuração"],
                  ...(l.proxima_versao ? [["Próxima versão", <Selo key="p" tom="info">{quando(l.proxima_versao)}</Selo>] as const] : []),
                ]} />

                <div className="mt-4 flex flex-col gap-2">
                  {regioes !== null && regioes !== "falha" && <RegiaoDaLoja loja={l.id} regioes={regioes} aberta={emFoco && erro === "regiao_inativa"} />}
                  <details className="rounded-xl border border-borda px-3 py-2" open={emFoco && (erro === "dados" || erro === "nome" || erro === "cnpj" || erro === "cnpj_apagar" || erro === "cnpj_raiz" || erro === "cnpj_repetido" || erro === "uf" || erro === "cidade")}>
                    <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao"><Pencil aria-hidden className="size-4" /> Editar nome, CNPJ e cidade</summary>
                    <form action={atualizarLoja} className="mt-2 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="unidade" value={l.id} /><input type="hidden" name="tipo" value={l.tipo} />
                      <label className={rotulo}>Nome<input name="nome" required maxLength={80} defaultValue={l.nome} className={campo} /></label>
                      <label className={rotulo}>CNPJ<input name="cnpj" inputMode="numeric" pattern="[0-9./\- ]{14,20}" defaultValue={l.cnpj ? formatarCnpj(l.cnpj) : ""} className={campo} /></label>
                      <label className={rotulo}>Cidade<input name="cidade" maxLength={80} defaultValue={l.cidade ?? ""} className={campo} /></label>
                      <label className={rotulo}>UF<input name="uf" maxLength={2} pattern="[A-Za-z]{2}" defaultValue={l.uf ?? ""} className={campo} /></label>
                      <p className="text-xs text-suave sm:col-span-2">Código ({l.codigo}) e tipo não mudam: vendas, estoque e relatórios dependem deles.</p>
                      <div className="sm:col-span-2"><Motivo exemplo="Correção do nome comercial" /></div>
                      <Botao type="submit" tamanho="sm" className="sm:col-span-2">Salvar dados</Botao>
                    </form>
                  </details>

                  <details className="rounded-xl border border-borda px-3 py-2" open={emFoco && (erro === "telefone" || erro === "cep" || erro === "endereco" || erro === "inscricao_estadual" || erro === "inscricao_municipal" || erro === "horarios" || erro === "vigencia" || erro === "vigencia_repetida")}>
                    <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao"><CalendarClock aria-hidden className="size-4" /> Nova configuração (telefone, endereço, horários)</summary>
                    <form action={definirConfiguracao} className="mt-2 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="unidade" value={l.id} />
                      <label className={rotulo}>Telefone<input name="telefone" type="tel" inputMode="tel" defaultValue={formatarTelefone(l.telefone)} placeholder="(41) 3333-4444" className={campo} /></label>
                      <label className={rotulo}>CEP<input name="cep" inputMode="numeric" pattern="[0-9.\- ]{8,10}" defaultValue={l.cep ?? ""} className={campo} /></label>
                      <label className={`${rotulo} sm:col-span-2`}>Rua<input name="logradouro" maxLength={120} defaultValue={l.logradouro ?? ""} className={campo} /></label>
                      <label className={rotulo}>Número<input name="numero" maxLength={15} defaultValue={l.numero ?? ""} className={campo} /></label>
                      <label className={rotulo}>Complemento<input name="complemento" maxLength={60} defaultValue={l.complemento ?? ""} className={campo} /></label>
                      <label className={rotulo}>Bairro<input name="bairro" maxLength={80} defaultValue={l.bairro ?? ""} className={campo} /></label>
                      <label className={rotulo}>Inscrição estadual<input name="inscricao_estadual" maxLength={20} defaultValue={l.inscricao_estadual ?? ""} placeholder="só números ou ISENTO" className={campo} /></label>
                      <label className={rotulo}>Inscrição municipal<input name="inscricao_municipal" maxLength={20} defaultValue={l.inscricao_municipal ?? ""} className={campo} /></label>
                      <fieldset className="sm:col-span-2">
                        <legend className="text-sm font-medium">Horário de funcionamento</legend>
                        <div className="mt-1 divide-y divide-borda rounded-xl border border-borda">
                          {DIAS_DA_SEMANA.map((nome, dia) => {
                            const h = horarios.find((x) => x.dia === dia);
                            return (
                              <div key={nome} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                <label className="flex min-h-10 w-28 items-center gap-2"><input type="checkbox" name={`aberto_${dia}`} defaultChecked={Boolean(h)} className="size-4 accent-acao" /> {nome}</label>
                                <label className="flex items-center gap-1.5"><span className="text-suave">abre</span><input type="time" name={`abre_${dia}`} defaultValue={h?.abre ?? "09:00"} className="min-h-10 rounded-botao border border-borda px-2" /></label>
                                <label className="flex items-center gap-1.5"><span className="text-suave">fecha</span><input type="time" name={`fecha_${dia}`} defaultValue={h?.fecha ?? "18:00"} className="min-h-10 rounded-botao border border-borda px-2" /></label>
                              </div>
                            );
                          })}
                        </div>
                      </fieldset>
                      <fieldset className="space-y-2 text-sm sm:col-span-2">
                        <legend className="font-medium">Vale a partir de</legend>
                        <label className="flex min-h-10 items-center gap-2"><input type="radio" name="quando" value="agora" defaultChecked className="size-4 accent-acao" /> agora</label>
                        <label className="flex flex-wrap items-center gap-2"><input type="radio" name="quando" value="data" className="size-4 accent-acao" /> uma data futura:
                          <input type="datetime-local" name="vigencia" min={agoraEmSaoPaulo} className="min-h-10 rounded-botao border border-borda px-2" />
                        </label>
                        <p className="text-xs text-suave">A versão atual continua guardada no histórico; o passado não é reescrito.</p>
                      </fieldset>
                      <div className="sm:col-span-2"><Motivo exemplo="Novo horário de fim de ano" /></div>
                      <Botao type="submit" tamanho="sm" className="sm:col-span-2">Gravar configuração</Botao>
                    </form>
                  </details>

                  <details className="rounded-xl border border-borda px-3 py-2" open={historicoDe === l.id}>
                    <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao"><History aria-hidden className="size-4" /> Histórico da configuração ({l.versoes} {l.versoes === 1 ? "versão" : "versões"})</summary>
                    {historicoDe !== l.id ? (
                      <p className="mt-2 text-sm"><Link href={`/lojas?historico=${l.id}#loja-${l.id}`} className="font-semibold text-acao underline-offset-2 hover:underline">Mostrar as versões</Link></p>
                    ) : versoesDaLoja.length === 0 ? (
                      <p className="mt-2 text-sm text-suave">Nenhuma versão gravada ainda.</p>
                    ) : (
                      <ol className="mt-2 space-y-3 text-sm">
                        {versoesDaLoja.map((v) => {
                          const futura = new Date(v.vigente_desde).getTime() > Date.now();
                          const vigente = !futura && v.vigente_desde === l.vigente_desde;
                          return (
                            <li key={v.id} className="rounded-lg bg-fundo px-3 py-2">
                              <p className="flex flex-wrap items-center gap-2 font-medium">
                                desde {quando(v.vigente_desde)}
                                <Selo tom={futura ? "info" : vigente ? "sucesso" : "neutro"}>{futura ? "agendada" : vigente ? "vigente" : "substituída"}</Selo>
                              </p>
                              <p className="text-xs text-suave">{[formatarTelefone(v.telefone), textoDoEndereco(v), textoDosHorarios(horariosDe(v.horarios))].filter(Boolean).join(" · ")}</p>
                              <p className="text-xs text-suave">Motivo: {v.motivo} · por {v.criado_por_nome ?? "—"} em {dataCurta(new Date(v.criado_em))}</p>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </details>

                  <details className="rounded-xl border border-borda px-3 py-2" open={emFoco && erro === "pendencias"}>
                    <summary className={`flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold ${ativa ? "text-perigo" : "text-acao"}`}><Power aria-hidden className="size-4" /> {ativa ? "Inativar loja" : "Reativar loja"}</summary>
                    <form action={definirSituacao} className="mt-2 space-y-2">
                      <input type="hidden" name="unidade" value={l.id} /><input type="hidden" name="situacao" value={ativa ? "inativa" : "ativa"} />
                      <p className="text-xs text-suave">
                        {ativa
                          ? "A loja sai da escolha de loja e não recebe venda, caixa nem estoque novos. Só é possível sem caixa aberto ou sem conferência, estoque, aparelhos, reservas, transferências, vendas em aberto ou notas pendentes. Nada é apagado."
                          : "A loja volta à escolha de loja e às operações. O histórico continua o mesmo."}
                      </p>
                      <Motivo exemplo={ativa ? "Loja fechada" : "Reabertura"} />
                      <Botao type="submit" tamanho="sm" variante={ativa ? "perigo" : "primario"}>{ativa ? "Inativar" : "Reativar"}</Botao>
                    </form>
                  </details>
                </div>
              </Cartao>
            </li>
          );
        })}
      </ul>
      {lojas.length === 0 && <p className="mt-4 text-sm text-suave">Nenhuma loja nesta rede ainda.</p>}
      <CartaoDasRegioes regioes={regioes} lojas={lojas} aberta={!lojaEmFoco && (erro === "regiao_nome" || erro === "regiao_repetida" || erro === "regiao_com_loja")} />
    </MoldeReal>
  );
}

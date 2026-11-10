import { MailPlus, ShieldAlert, UserCheck, UserX, Users } from "lucide-react";
import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, Avatar, Botao, Cartao, Selo, TituloPagina } from "../../componentes/ui";
import { ERROS_DA_EQUIPE, PAPEIS, papeisQuePodeConceder, type Papel } from "../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { chaveDoCatalogo, type ValorDeParametro } from "../../lib/parametros";
import { alterarSituacao, cancelarConvite, convidar, encerrarVinculo, repetirConvite, vincular } from "./acoes";

export const metadata: Metadata = { title: "Equipe e acessos" };
export const dynamic = "force-dynamic";

const OK = {
  convite: "Convite registrado. O sistema envia o e-mail para a pessoa criar a senha.",
  vinculo: "Acesso incluído. Vale na próxima ação da pessoa.",
  encerrado: "Acesso encerrado na hora.",
  bloqueado: "Pessoa bloqueada em todas as lojas, na hora.",
  desbloqueado: "Pessoa desbloqueada.",
  cancelado: "Convite cancelado.",
  repetido: "Convite enviado de novo para a fila.",
} as const;

const SITUACAO_DO_CONVITE: Record<string, { texto: string; tom: "aviso" | "sucesso" | "perigo" | "info" }> = {
  pendente: { texto: "na fila de envio", tom: "info" },
  processando: { texto: "enviando", tom: "info" },
  enviado: { texto: "e-mail enviado; aguardando a pessoa entrar", tom: "sucesso" },
  erro: { texto: "não enviado", tom: "perigo" },
};

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const nomeDoPapel = (papel: string) => (Object.hasOwn(PAPEIS, papel) ? PAPEIS[papel as Papel].nome : papel);
const quando = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "nunca entrou";

function Motivo({ rotulo = "Motivo (fica na auditoria)" }: { rotulo?: string }) {
  return <label className="block text-sm font-medium">{rotulo}<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>;
}

// Equipe e acessos (pedido do proprietário de 08/11; ORA-ORG-001 a 010). Dono e administrador
// convidam, dão e encerram acessos e bloqueiam. Tudo passa pelas funções do banco.
export default async function Equipe({ searchParams }: { searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DA_EQUIPE, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario } = sessao;

  const permitido = await supabase.rpc("tem_permissao", { p_permissao: "usuarios.gerir" });
  if (permitido.error) throw new FalhaDoServico("tem_permissao");
  if (!permitido.data) {
    return (
      <MoldeReal sessao={sessao}>
        <Cartao titulo="Sem permissão" icone={ShieldAlert}>
          <p className="text-sm text-suave">Só o dono e o administrador cuidam da equipe e dos acessos. O banco também recusa, mesmo que alguém digite o endereço.</p>
        </Cartao>
      </MoldeReal>
    );
  }

  const meus = await supabase.from("vinculos").select("organizacao_id, papel").eq("usuario_id", usuario.id).eq("escopo", "organizacao").is("fim", null);
  if (meus.error) throw new FalhaDoServico("vinculos");
  const organizacoes = [...new Set(meus.data.filter((v) => v.papel === "dono" || v.papel === "administrador").map((v) => v.organizacao_id))];
  const souDono = (org: string) => meus.data.some((v) => v.organizacao_id === org && v.papel === "dono");

  const [orgs, unidades, vinculos, perfis, convites] = await Promise.all([
    supabase.from("organizacoes").select("id, nome").in("id", organizacoes),
    supabase.from("unidades").select("id, nome, tipo, organizacao_id").in("organizacao_id", organizacoes).eq("status", "ativa").order("nome"),
    supabase.from("vinculos").select("id, usuario_id, organizacao_id, papel, unidade_id").in("organizacao_id", organizacoes).is("fim", null),
    supabase.from("perfis_usuario").select("id, nome, email, status, ultimo_acesso_em").order("nome"),
    supabase.from("convites").select("id, organizacao_id, nome, email, papel, unidades, situacao, erro").in("organizacao_id", organizacoes)
      .in("situacao", ["pendente", "processando", "enviado", "erro"]).order("criado_em", { ascending: false }).limit(50),
  ]);
  if (orgs.error || unidades.error || vinculos.error || perfis.error || convites.error) throw new FalhaDoServico("equipe");
  const nomeDaLoja = (id: string | null) => (id ? unidades.data.find((u) => u.id === id)?.nome ?? "loja inativa" : "rede inteira");

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina titulo="Equipe e acessos" subtitulo="Quem entra em cada loja, com qual função. Toda mudança vale na hora e fica na auditoria com o motivo." />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_EQUIPE[erro]}</Aviso>}

      {orgs.data.map((org) => {
        const lojas = unidades.data.filter((u) => u.organizacao_id === org.id);
        const daOrg = vinculos.data.filter((v) => v.organizacao_id === org.id);
        const pessoas = perfis.data.filter((p) => daOrg.some((v) => v.usuario_id === p.id) || p.status === "bloqueado");
        const papeis = papeisQuePodeConceder(souDono(org.id));
        const abertos = convites.data.filter((c) => c.organizacao_id === org.id);
        return (
          <section key={org.id} className="mt-6 space-y-4">
            {orgs.data.length > 1 && <h2 className="text-lg font-semibold">{org.nome}</h2>}

            <Cartao titulo="Convidar pessoa" subtitulo="A pessoa recebe um e-mail e cria a própria senha. Ninguém mais vê a senha." icone={MailPlus}>
              <form action={convidar} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="organizacao" value={org.id} />
                <label className="text-sm font-medium">Nome<input name="nome" required minLength={2} maxLength={120} className={campo} /></label>
                <label className="text-sm font-medium">E-mail<input name="email" type="email" required inputMode="email" className={campo} /></label>
                <label className="text-sm font-medium">Função<select name="papel" required className={campo}>{papeis.map((p) => <option key={p} value={p}>{PAPEIS[p].nome}</option>)}</select></label>
                <fieldset className="text-sm"><legend className="font-medium">Lojas (vendedor, gerente e técnico)</legend>
                  <div className="mt-1 flex flex-wrap gap-2">{lojas.map((u) => <label key={u.id} className="flex items-center gap-1.5 rounded-lg border border-borda px-2 py-1.5"><input type="checkbox" name="unidades" value={u.id} className="size-4 accent-acao" /> {u.nome}</label>)}</div>
                </fieldset>
                <div className="sm:col-span-2"><Motivo rotulo="Motivo (ex.: contratação para a Santa Cândida)" /></div>
                <Botao type="submit" className="sm:col-span-2">Registrar convite</Botao>
              </form>
            </Cartao>

            {abertos.length > 0 && (
              <Cartao titulo="Convites em andamento">
                <ul className="divide-y divide-borda">
                  {abertos.map((c) => (
                    <li key={c.id} className="space-y-2 py-3 text-sm">
                      <p className="flex flex-wrap items-center gap-2"><strong>{c.nome}</strong><span className="text-suave">{c.email}</span><Selo tom={SITUACAO_DO_CONVITE[c.situacao]?.tom ?? "info"}>{SITUACAO_DO_CONVITE[c.situacao]?.texto ?? c.situacao}</Selo></p>
                      <p className="text-xs text-suave">{nomeDoPapel(c.papel)} · {c.unidades.length ? c.unidades.map(nomeDaLoja).join(", ") : "rede inteira"}</p>
                      {c.situacao === "erro" && <p className="text-xs text-perigo">Motivo: {c.erro ?? "sem detalhe"}</p>}
                      <div className="flex flex-wrap gap-2">
                        {c.situacao === "erro" && <form action={repetirConvite}><input type="hidden" name="convite" value={c.id} /><Botao type="submit" tamanho="sm" variante="secundario">Tentar de novo</Botao></form>}
                        {(c.situacao === "pendente" || c.situacao === "erro") && (
                          <details><summary className="cursor-pointer text-xs font-semibold text-perigo">Cancelar convite</summary>
                            <form action={cancelarConvite} className="mt-2 space-y-2"><input type="hidden" name="convite" value={c.id} /><Motivo /><Botao type="submit" tamanho="sm" variante="perigo">Cancelar</Botao></form>
                          </details>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Cartao>
            )}

            <Cartao titulo={`Equipe (${pessoas.length})`} icone={Users}>
              <ul className="divide-y divide-borda">
                {pessoas.map((p) => {
                  const acessos = daOrg.filter((v) => v.usuario_id === p.id);
                  const eu = p.id === usuario.id;
                  return (
                    <li key={p.id} className="space-y-2 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Avatar nome={p.nome} tamanho="size-8 text-xs" />
                        <span className="min-w-0"><strong>{p.nome}</strong>{eu && <span className="text-suave"> (você)</span>}<span className="block text-xs text-suave">{p.email} · último acesso: {quando(p.ultimo_acesso_em)}</span></span>
                        {p.status === "bloqueado" ? <Selo tom="perigo" ponto>bloqueado</Selo> : <Selo tom="sucesso" ponto>ativo</Selo>}
                      </div>
                      <ul className="flex flex-wrap gap-2">
                        {acessos.map((v) => (
                          <li key={v.id} className="rounded-lg bg-fundo px-2 py-1 text-xs">
                            {nomeDoPapel(v.papel)} · {nomeDaLoja(v.unidade_id)}
                            {!eu && (
                              <details className="mt-1"><summary className="cursor-pointer font-semibold text-perigo">Encerrar</summary>
                                <form action={encerrarVinculo} className="mt-2 space-y-2"><input type="hidden" name="vinculo" value={v.id} /><Motivo /><Botao type="submit" tamanho="sm" variante="perigo">Encerrar este acesso</Botao></form>
                              </details>
                            )}
                          </li>
                        ))}
                        {acessos.length === 0 && <li className="text-xs text-suave">Sem acesso ativo nesta rede.</li>}
                      </ul>
                      {!eu && (
                        <div className="flex flex-wrap gap-3">
                          {p.status === "ativo" && (
                            <details><summary className="cursor-pointer text-xs font-semibold text-acao">Dar mais uma loja ou função</summary>
                              <form action={vincular} className="mt-2 grid gap-2 sm:grid-cols-2">
                                <input type="hidden" name="usuario" value={p.id} /><input type="hidden" name="organizacao" value={org.id} />
                                <label className="text-sm font-medium">Função<select name="papel" className={campo}>{papeis.map((x) => <option key={x} value={x}>{PAPEIS[x].nome}</option>)}</select></label>
                                <label className="text-sm font-medium">Loja (vazio para dono e administrador)<select name="unidade" className={campo}><option value="">rede inteira</option>{lojas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>
                                <div className="sm:col-span-2"><Motivo /></div>
                                <Botao type="submit" tamanho="sm">Incluir acesso</Botao>
                              </form>
                            </details>
                          )}
                          <details><summary className={`cursor-pointer text-xs font-semibold ${p.status === "ativo" ? "text-perigo" : "text-acao"}`}>{p.status === "ativo" ? "Bloquear" : "Desbloquear"}</summary>
                            <form action={alterarSituacao} className="mt-2 space-y-2">
                              <input type="hidden" name="usuario" value={p.id} /><input type="hidden" name="situacao" value={p.status === "ativo" ? "bloqueado" : "ativo"} />
                              <Motivo />
                              <Botao type="submit" tamanho="sm" variante={p.status === "ativo" ? "perigo" : "primario"}>
                                {p.status === "ativo" ? <><UserX aria-hidden className="size-4" /> Bloquear em todas as lojas</> : <><UserCheck aria-hidden className="size-4" /> Desbloquear</>}
                              </Botao>
                            </form>
                          </details>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Cartao>
          </section>
        );
      })}
    </MoldeReal>
  );
}

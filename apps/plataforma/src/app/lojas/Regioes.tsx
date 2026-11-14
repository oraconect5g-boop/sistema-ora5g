import { MapPinned, Pencil, Plus } from "lucide-react";

import { Aviso, Botao, Cartao, Selo } from "../../componentes/ui";
import type { MapaDeRegioes, RegioesDoPainel } from "../../lib/lojas/regioes";
import { definirRegiaoDaLoja, salvarRegiao } from "./acoes";
import { campo, Motivo, rotulo } from "./formulario";

type LojaResumida = { id: string; nome: string; status: string };
const resumo = "flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-acao";

// ORG-009: as regiões da rede. A região só agrupa lojas para somar vendas e metas; não dá acesso a nada.
export function CartaoDasRegioes({ regioes, lojas, aberta }: { regioes: RegioesDoPainel; lojas: readonly LojaResumida[]; aberta: boolean }) {
  if (regioes === null) return null;
  if (regioes === "falha") {
    return <Aviso tom="perigo" className="mt-6">Não deu para ler as regiões agora; o resto do cadastro das lojas está certo. Tente de novo em instantes.</Aviso>;
  }
  const lojasDa = (id: string) => lojas.filter((l) => regioes.daLoja.get(l.id) === id);
  const semRegiao = lojas.filter((l) => l.status === "ativa" && !regioes.daLoja.has(l.id));
  return (
    <section id="regioes" className="mt-6 scroll-mt-24">
      <Cartao titulo="Regiões" icone={MapPinned}
        subtitulo="Agrupam as lojas para ver vendas e metas por região no Início e nos Relatórios. Não dão acesso: quem vê cada loja continua decidido pelo vínculo da pessoa.">
        {regioes.regioes.length === 0 ? <p className="text-sm text-suave">Nenhuma região ainda.</p> : (
          <ul className="divide-y divide-borda rounded-xl border border-borda">
            {regioes.regioes.map((r) => {
              const dela = lojasDa(r.id);
              return (
                <li key={r.id} className="px-3 py-2 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{r.nome}{!r.ativa && <Selo tom="neutro">inativa</Selo>}</p>
                  <p className="text-xs text-suave">{dela.length === 0 ? "sem loja" : dela.map((l) => l.nome).join(", ")}</p>
                  <details className="mt-1">
                    <summary className={resumo}><Pencil aria-hidden className="size-4" /> Editar região</summary>
                    <form action={salvarRegiao} className="mt-2 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label className={rotulo}>Nome<input name="nome" required minLength={2} maxLength={60} defaultValue={r.nome} className={campo} /></label>
                      <label className="flex min-h-11 items-center gap-2 self-end text-sm">
                        <input type="hidden" name="tem_ativa" value="1" />
                        <input type="checkbox" name="ativa" defaultChecked={r.ativa} className="size-4 accent-acao" /> Região ativa (inativar exige nenhuma loja ativa nela)
                      </label>
                      <div className="sm:col-span-2"><Motivo exemplo="Nome novo da região" /></div>
                      <Botao type="submit" tamanho="sm" className="sm:col-span-2">Salvar região</Botao>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        {semRegiao.length > 0 && regioes.regioes.length > 0 && <p className="mt-3 text-xs text-suave">{`Lojas ativas sem região: ${semRegiao.map((l) => l.nome).join(", ")}.`}</p>}
        <details className="mt-3 rounded-xl border border-borda px-3 py-2" open={aberta || regioes.regioes.length === 0}>
          <summary className={resumo}><Plus aria-hidden className="size-4" /> Nova região</summary>
          <form action={salvarRegiao} className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className={rotulo}>Nome<input name="nome" required minLength={2} maxLength={60} placeholder="Curitiba Norte" className={campo} /></label>
            <Motivo exemplo="Organização das lojas por região" />
            <Botao type="submit" tamanho="sm" className="sm:col-span-2">Cadastrar região</Botao>
          </form>
        </details>
      </Cartao>
    </section>
  );
}

/** A região da loja, dentro do cartão dela: mostra e muda (com motivo). */
export function RegiaoDaLoja({ loja, regioes, aberta }: { loja: string; regioes: MapaDeRegioes; aberta: boolean }) {
  const atual = regioes.daLoja.get(loja) ?? null;
  const nomeAtual = atual ? regioes.regioes.find((r) => r.id === atual)?.nome ?? "região não identificada" : "sem região";
  const opcoes = regioes.regioes.filter((r) => r.ativa || r.id === atual);
  return (
    <details className="rounded-xl border border-borda px-3 py-2" open={aberta}>
      <summary className={resumo}><MapPinned aria-hidden className="size-4" /> {`Região: ${nomeAtual}`}</summary>
      {opcoes.length === 0 ? <p className="mt-2 text-xs text-suave">Cadastre uma região em &quot;Regiões&quot;, no fim da tela.</p> : (
        <form action={definirRegiaoDaLoja} className="mt-2 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="unidade" value={loja} />
          <label className={rotulo}>Região
            <select name="regiao" defaultValue={atual ?? "nenhuma"} className={campo}>
              <option value="nenhuma">sem região</option>
              {opcoes.map((r) => <option key={r.id} value={r.id}>{r.nome}{r.ativa ? "" : " (inativa)"}</option>)}
            </select>
          </label>
          <Motivo exemplo="Loja passa para a região norte" />
          <Botao type="submit" tamanho="sm" className="sm:col-span-2">Salvar região da loja</Botao>
        </form>
      )}
    </details>
  );
}

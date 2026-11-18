import { CreditCard, Plus } from "lucide-react";
import type { Metadata } from "next";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { ERROS_DOS_PAGAMENTOS, PROVEDORES } from "../../../lib/pagamentos/regras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { alterarMaquininha, cadastrarMaquininha } from "../acoes";

export const metadata: Metadata = { title: "Maquininhas" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const OK = { cadastrada: "Maquininha cadastrada.", alterada: "Maquininha atualizada; o motivo ficou na auditoria." } as const;

// Maquininhas da loja do turno (lote L7a: ORA-PAY-012). Cada pagamento por maquininha guarda qual foi usada;
// com maquininha ativa do provedor, escolher é obrigatório no PDV. Nada se apaga: desativar mantém o histórico.
export default async function Maquininhas({ searchParams }: { searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DOS_PAGAMENTOS, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const pode = permite(sessao, "terminal.gerir");
  if (!pode) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Cadastrar maquininhas é da gerência da loja.</Aviso></MoldeReal>;
  const lista = await supabase.from("terminais").select("id, provedor, identificador, apelido, ativo, criado_em").eq("unidade_id", unidade).order("ativo", { ascending: false }).order("apelido");
  if (lista.error) throw new FalhaDoServico("terminais");

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Maquininhas" subtitulo="Cada pagamento por maquininha guarda qual foi usada. Com maquininha ativa do provedor, o PDV pede para escolher." />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DOS_PAGAMENTOS[erro]}</Aviso>}
      <Cartao className="mt-4" titulo="Maquininhas desta loja" icone={CreditCard}>
        <ul className="divide-y divide-borda text-sm">
          {lista.data.map((m) => (
            <li key={m.id} className="space-y-2 py-3">
              <p className="flex flex-wrap items-center gap-2"><strong>{m.apelido}</strong><span className="numeros text-xs text-suave">{PROVEDORES[m.provedor as keyof typeof PROVEDORES] ?? m.provedor} · {m.identificador}</span>
                <Selo tom={m.ativo ? "sucesso" : "neutro"}>{m.ativo ? "ativa" : "desativada"}</Selo></p>
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-acao">Mudar apelido ou situação</summary>
                <form action={alterarMaquininha} className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input type="hidden" name="terminal" value={m.id} />
                  <label className="text-xs font-medium">Apelido<input name="apelido" required minLength={2} maxLength={60} defaultValue={m.apelido} className={campo} /></label>
                  <label className="text-xs font-medium">Situação<select name="ativo" defaultValue={m.ativo ? "sim" : "nao"} className={campo}><option value="sim">ativa</option><option value="nao">desativada</option></select></label>
                  <label className="text-xs font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} placeholder="Maquininha quebrou" className={campo} /></label>
                  <Botao type="submit" tamanho="sm" variante="secundario" className="sm:col-span-3 sm:justify-self-start">Gravar</Botao>
                </form>
              </details>
            </li>
          ))}
          {lista.data.length === 0 && <li className="py-2 text-suave">Nenhuma maquininha cadastrada: o PDV aceita o pagamento sem escolher a maquininha.</li>}
        </ul>
      </Cartao>
      <Cartao className="mt-4" titulo="Cadastrar maquininha" icone={Plus}>
        <form action={cadastrarMaquininha} className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm font-medium">Provedor<select name="provedor" required defaultValue="" className={campo}><option value="" disabled>escolha</option>
            {Object.entries(PROVEDORES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-sm font-medium">Número do terminal<input name="identificador" required minLength={3} maxLength={40} placeholder="Etiqueta da maquininha" className={campo} /></label>
          <label className="text-sm font-medium">Apelido<input name="apelido" required minLength={2} maxLength={60} placeholder="Balcão 1" className={campo} /></label>
          <label className="text-sm font-medium">Motivo<input name="motivo" required minLength={3} maxLength={200} placeholder="Maquininha nova da loja" className={campo} /></label>
          <Botao type="submit" className="sm:col-span-2 sm:justify-self-start">Cadastrar</Botao>
        </form>
      </Cartao>
    </MoldeReal>
  );
}

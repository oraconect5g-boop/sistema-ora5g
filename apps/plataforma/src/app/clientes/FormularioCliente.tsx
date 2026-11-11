"use client";

import { useActionState, useState } from "react";

import { Aviso, Botao } from "../../componentes/ui";
import { ERROS_DO_CLIENTE, FINALIDADES, GUARDAM_ENDERECO, GUARDAM_NASCIMENTO, type Finalidade } from "../../lib/clientes/regras";
import { salvarCliente, type EstadoDoFormulario } from "./acoes";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
export type ClienteAtual = {
  id: string; tipo: string; nome: string; finalidades: string[]; documento: string | null; telefone: string | null; email: string | null;
  nascimento_informado: boolean; endereco_informado: boolean;
};

// Cadastro e correção do cliente (lote L5a). Cada finalidade marcada mostra o que ela pede; nascimento e
// endereço só aparecem quando uma finalidade os justifica (dados mínimos). Na correção, campo vazio fica
// como está (o atual aparece mascarado) e o motivo vai para a auditoria. Com erro, nada do que foi
// digitado se perde.
export function FormularioCliente({ chave, atual = null }: { chave: string; atual?: ClienteAtual | null }) {
  const [estado, acao, enviando] = useActionState<EstadoDoFormulario, FormData>(salvarCliente, { erro: null, valores: {} });
  const v = (nome: string) => { const x = estado.valores[nome]; return typeof x === "string" ? x : ""; };
  const iniciais = (estado.valores.finalidade as string[] | undefined) ?? atual?.finalidades ?? [];
  const [finalidades, setFinalidades] = useState<string[]>(iniciais);
  const [tipo, setTipo] = useState(v("tipo") || atual?.tipo || "pessoa_fisica");
  const tem = (f: Finalidade) => finalidades.includes(f);
  const pedeNascimento = GUARDAM_NASCIMENTO.some(tem);
  const pedeEndereco = GUARDAM_ENDERECO.some(tem);
  const atualDe = (mascara: string | null | undefined) => (atual ? `atual: ${mascara ?? "não informado"} · deixe em branco para manter` : undefined);

  return (
    <form action={acao} className="space-y-4">
      {atual ? <input type="hidden" name="cliente" value={atual.id} /> : <input type="hidden" name="chave" value={chave} />}
      <input type="hidden" name="finalidades_enviadas" value="sim" />
      {estado.erro && <Aviso tom="perigo">{ERROS_DO_CLIENTE[estado.erro]}</Aviso>}

      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1 text-sm font-medium">Tipo</legend>
        {(["pessoa_fisica", "pessoa_juridica"] as const).map((t) => (
          <label key={t} className="flex min-h-10 items-center gap-2">
            <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="size-4 accent-acao" />
            {t === "pessoa_fisica" ? "Pessoa física" : "Empresa"}
          </label>
        ))}
      </fieldset>
      <label className="block text-sm font-medium">Nome{atual ? "" : " completo"}
        <input name="nome" required={!atual} minLength={2} maxLength={120} defaultValue={v("nome")} placeholder={atual ? `atual: ${atual.nome}` : undefined} className={campo} autoComplete="off" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">{tipo === "pessoa_juridica" ? "CNPJ" : "CPF"}
          <input name="documento" inputMode="numeric" maxLength={18} defaultValue={v("documento")} placeholder={atualDe(atual?.documento)} className={campo} autoComplete="off" />
        </label>
        <label className="block text-sm font-medium">Telefone com DDD
          <input name="telefone" inputMode="tel" maxLength={20} defaultValue={v("telefone")} placeholder={atualDe(atual?.telefone) ?? "(41) 9 0000-0000"} className={campo} autoComplete="off" />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">E-mail (opcional)
          <input name="email" type="email" maxLength={200} defaultValue={v("email")} placeholder={atualDe(atual?.email)} className={campo} autoComplete="off" />
        </label>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="telefone_compartilhado" value="sim" defaultChecked={v("telefone_compartilhado") === "sim"} className="size-4 accent-acao" />
        O telefone é compartilhado com outro cliente (família, por exemplo)</label>

      <fieldset className="space-y-1 rounded-xl border border-borda p-3">
        <legend className="px-1 text-sm font-medium">Para que mais vamos usar este cadastro?</legend>
        <p className="text-xs text-suave">Compra, garantia e histórico já estão incluídos. Marque só o que vai acontecer agora: cada finalidade pede alguns dados.</p>
        {(Object.keys(FINALIDADES) as Finalidade[]).map((f) => (
          <label key={f} className="flex min-h-10 items-start gap-2 text-sm">
            <input type="checkbox" name="finalidade" value={f} checked={tem(f)} className="mt-1 size-4 accent-acao"
              onChange={(e) => setFinalidades((x) => (e.target.checked ? [...x, f] : x.filter((y) => y !== f)))} />
            <span>{FINALIDADES[f].nome}<span className="block text-xs text-suave">pede: {FINALIDADES[f].pede}</span></span>
          </label>
        ))}
      </fieldset>

      {(pedeNascimento || atual?.nascimento_informado) && (
        <label className="block text-sm font-medium">Data de nascimento{atual?.nascimento_informado ? " (já informada; deixe em branco para manter)" : ""}
          <input name="nascimento" type="date" defaultValue={v("nascimento")} className={campo} />
        </label>
      )}
      {(pedeEndereco || atual?.endereco_informado) && (
        <fieldset className="grid gap-2 rounded-xl border border-borda p-3 sm:grid-cols-6">
          <legend className="px-1 text-sm font-medium">Endereço{atual?.endereco_informado ? " (já informado; preencha tudo só para trocar)" : ""}</legend>
          <label className="text-xs font-medium sm:col-span-2">CEP<input name="endereco_cep" inputMode="numeric" maxLength={9} defaultValue={v("endereco_cep")} className={campo} /></label>
          <label className="text-xs font-medium sm:col-span-4">Rua<input name="endereco_logradouro" maxLength={120} defaultValue={v("endereco_logradouro")} className={campo} /></label>
          <label className="text-xs font-medium sm:col-span-2">Número<input name="endereco_numero" maxLength={10} defaultValue={v("endereco_numero")} className={campo} /></label>
          <label className="text-xs font-medium sm:col-span-4">Complemento<input name="endereco_complemento" maxLength={60} defaultValue={v("endereco_complemento")} className={campo} /></label>
          <label className="text-xs font-medium sm:col-span-3">Bairro<input name="endereco_bairro" maxLength={60} defaultValue={v("endereco_bairro")} className={campo} /></label>
          <label className="text-xs font-medium sm:col-span-2">Cidade<input name="endereco_cidade" maxLength={60} defaultValue={v("endereco_cidade")} className={campo} /></label>
          <label className="text-xs font-medium sm:col-span-1">UF<input name="endereco_uf" maxLength={2} defaultValue={v("endereco_uf")} className={`${campo} uppercase`} /></label>
        </fieldset>
      )}

      {atual && (
        <>
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="mb-1 text-sm font-medium">Apagar do cadastro (se nenhuma finalidade marcada pedir)</legend>
            {([["documento", "CPF/CNPJ"], ["telefone", "Telefone"], ["email", "E-mail"], ["nascimento", "Nascimento"], ["endereco", "Endereço"]] as const).map(([c, rotulo]) => (
              <label key={c} className="flex min-h-10 items-center gap-2"><input type="checkbox" name="remover" value={c} className="size-4 accent-acao" /> {rotulo}</label>
            ))}
          </fieldset>
          <label className="block text-sm font-medium">Motivo da correção (fica na auditoria)
            <input name="motivo" required minLength={3} maxLength={200} defaultValue={v("motivo")} placeholder="Cliente trocou de número" className={campo} />
          </label>
        </>
      )}
      <Botao type="submit" disabled={enviando}>{enviando ? "Gravando" : atual ? "Gravar correção" : "Cadastrar cliente"}</Botao>
    </form>
  );
}

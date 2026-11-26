"use client";

import { ArrowLeft, ArrowRight, CircleCheck, QrCode, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { Aviso, Botao, Etapas } from "../../../componentes/ui";
import { CAMPOS_DA_ATIVACAO } from "../../../lib/connect/cadastro-da-nogle";
import { registrarOperacao } from "../acoes";
import { BuscaNoCadastroDaNogle } from "../BuscaNoCadastroDaNogle";
import { campo, PagamentoANogle, PlanosEmCartoes, rotulo, type OpcaoDePago, type PlanoDaNogle } from "../campos";
import { ETAPAS, faltaNaEtapa, primeiraEtapaIncompleta, resumoDaAtivacao } from "./etapas";

// Lote CONNECT-n (25/11/2026; o pedido do proprietário: "as telas do ora connect da demo, que estavam muito boas"): o
// assistente de ativação da demonstração, com os dados reais: um passo por vez (o chip, o cliente, o plano e o DDD, o
// pagamento à Nogle) e a conferência antes de registrar. É um formulário só: os passos escondidos continuam nele, e o toque
// em "Registrar ativação" confere todos de novo (volta ao passo que falta, sem enviar). O formulário não tem onSubmit (a regra
// de retorno-imediato.test.ts: o botão de envio enxerga o envio do React). O servidor e o banco conferem tudo outra vez; nada
// aqui fala com a Nogle. AUD-f: no passo do cliente, a busca do cadastro na Nogle pelo CPF ou CNPJ preenche o que veio (só o
// campo vazio que a pessoa não mexeu); e o Enter num campo passa para o próximo passo, nunca registra sem a revisão.

export type DddDaNogle = { codigo: string; uf: string | null };
export type CidadeDaNogle = { codigo: string; nome: string; uf: string | null };
export type ChipVendido = { iccid: string; venda: number };

const soDigitos = (v: string) => v.replace(/\D/g, "");

export function AssistenteDeAtivacao({ chave, planos, ddds, cidades, pagos, chips }: {
  chave: string;
  planos: readonly PlanoDaNogle[];
  ddds: readonly DddDaNogle[];
  cidades: readonly CidadeDaNogle[];
  pagos: readonly OpcaoDePago[];
  chips: readonly ChipVendido[];
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const andou = useRef(false);
  const [etapa, setEtapa] = useState(0);
  const [tipo, setTipo] = useState<"fisico" | "esim">("fisico");
  const [iccid, setIccid] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<[string, string][]>([]);
  const ultima = ETAPAS.length - 1;

  // Ao trocar de passo, o foco vai para o título dele (o leitor de tela anuncia; no celular, a tela sobe até ele).
  useEffect(() => {
    if (andou.current) titulo.current?.focus();
  }, [etapa]);

  const ir = (proxima: number) => {
    andou.current = true;
    setErro(null);
    if (proxima === ultima && formulario.current) setResumo(resumoDaAtivacao(new FormData(formulario.current), { planos, cidades, pagos }));
    setEtapa(proxima);
  };
  const continuar = () => {
    if (!formulario.current) return;
    const falta = faltaNaEtapa(etapa, new FormData(formulario.current));
    if (falta) setErro(falta);
    else ir(etapa + 1);
  };
  // AUD-f: o Enter num campo é o "Continuar" do passo (que confere o passo); no último passo, nada. O registro é só pelo botão,
  // depois da revisão (sem o Enter, o navegador também não enviaria: o botão de envio só existe no último passo).
  const aoTeclar = (evento: KeyboardEvent<HTMLFormElement>) => {
    if (evento.key !== "Enter" || !(evento.target instanceof HTMLInputElement)) return;
    evento.preventDefault();
    if (etapa < ultima) continuar();
  };
  // O toque em Registrar confere todos os passos: com algo faltando, não envia e volta ao passo.
  const conferirAntesDeEnviar = (evento: MouseEvent<HTMLButtonElement>) => {
    const incompleta = formulario.current ? primeiraEtapaIncompleta(new FormData(formulario.current)) : null;
    if (!incompleta) return;
    evento.preventDefault();
    andou.current = true;
    setEtapa(incompleta.etapa);
    setErro(incompleta.falta);
  };

  return (
    <form ref={formulario} action={registrarOperacao} noValidate onKeyDown={aoTeclar} className="space-y-4">
      <input type="hidden" name="tipo" value="ativacao" />
      <input type="hidden" name="chave" value={chave} />
      {tipo === "esim" && <input type="hidden" name="esim" value="on" />}
      <Etapas etapas={ETAPAS} atual={etapa} rotulo="Etapas da ativação" />
      <h3 ref={titulo} tabIndex={-1} className="text-sm font-semibold text-suave outline-none">{`Etapa ${etapa + 1} de ${ETAPAS.length}: ${ETAPAS[etapa]}`}</h3>
      <div role="alert">{erro && <Aviso tom="perigo">{erro}</Aviso>}</div>

      <div hidden={etapa !== 0} className="space-y-4">
        <fieldset>
          <legend className="sr-only">Tipo de chip</legend>
          <div className="grid grid-cols-2 gap-2">
            {([["fisico", "Chip físico", Smartphone], ["esim", "eSIM (chip virtual)", QrCode]] as const).map(([valor, nome, Icone]) => (
              <label key={valor} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-botao border border-borda bg-white px-3 text-sm font-semibold has-[:checked]:border-acao has-[:checked]:bg-acao-clara has-[:checked]:text-acao-escura has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acao/40">
                <input type="radio" name="tipo_chip" value={valor} checked={tipo === valor} onChange={() => { setTipo(valor); setErro(null); }} className="sr-only" />
                <Icone aria-hidden className="size-4" /> {nome}
              </label>
            ))}
          </div>
        </fieldset>
        {tipo === "fisico" ? (
          <>
            <label className={rotulo}>ICCID do chip (os números impressos nele)
              <input name="iccid" value={iccid} onChange={(e) => { setIccid(e.target.value); setErro(null); }} inputMode="numeric" autoComplete="off"
                placeholder="19 ou 20 dígitos que começam com 89" className={`${campo} numeros`} />
            </label>
            {chips.length > 0 && (
              <div>
                <p className="text-xs text-suave">Chips vendidos nesta loja nos últimos 7 dias (toque para usar):</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <button key={c.iccid} type="button" aria-pressed={soDigitos(iccid) === c.iccid} onClick={() => { setIccid(c.iccid); setErro(null); }}
                      className="numeros min-h-9 rounded-full border border-borda bg-white px-3 text-xs font-medium hover:border-borda-forte aria-pressed:border-acao aria-pressed:bg-acao-clara aria-pressed:text-acao-escura">
                      {`•••• ${c.iccid.slice(-6)} · venda nº ${c.venda}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-suave">O chip do estoque é vendido antes, no Vender; aqui é a ativação na Nogle.</p>
          </>
        ) : (
          <Aviso tom="info" titulo="eSIM">Sem chip de plástico: depois da confirmação, o QR Code de instalação aparece na operação, em Operações do dia.</Aviso>
        )}
      </div>

      <div hidden={etapa !== 1} className="grid gap-4 sm:grid-cols-2">
        <label className={rotulo}>CPF ou CNPJ<input name="documento" inputMode="numeric" autoComplete="off" className={`${campo} numeros`} /></label>
        <p className="self-end text-xs text-suave">Comece pelo documento: a Nogle pode preencher o resto, e você confere com o cliente.</p>
        <BuscaNoCadastroDaNogle campos={CAMPOS_DA_ATIVACAO} modo="preencher" />
        <label className={`${rotulo} sm:col-span-2`}>Nome completo do cliente<input name="nome" maxLength={120} autoComplete="off" className={campo} /></label>
        <label className={rotulo}>Nascimento (pessoa física)<input name="data_nascimento" type="date" className={campo} /></label>
        <label className={rotulo}>E-mail (se houver)<input name="email" type="email" autoComplete="off" className={campo} /></label>
        <label className={rotulo}>Telefone com DDD (se houver)<input name="telefone" inputMode="tel" autoComplete="off" className={campo} /></label>
        <p className="text-sm font-semibold sm:col-span-2">Endereço do cliente</p>
        <label className={rotulo}>CEP<input name="cep" inputMode="numeric" autoComplete="off" className={`${campo} numeros`} /></label>
        <label className={rotulo}>Cidade
          <select name="id_cidade" className={campo} defaultValue=""><option value="" disabled>Escolha</option>{cidades.map((c) => <option key={c.codigo} value={c.codigo}>{`${c.nome}${c.uf ? ` (${c.uf})` : ""}`}</option>)}</select>
        </label>
        <label className={`${rotulo} sm:col-span-2`}>Rua<input name="rua" maxLength={120} autoComplete="off" className={campo} /></label>
        <label className={rotulo}>Número<input name="numero_endereco" maxLength={20} autoComplete="off" className={campo} /></label>
        <label className={rotulo}>Complemento (se houver)<input name="complemento" maxLength={120} autoComplete="off" className={campo} /></label>
        <label className={`${rotulo} sm:col-span-2`}>Bairro<input name="bairro" maxLength={120} autoComplete="off" className={campo} /></label>
        <p className="text-xs text-suave sm:col-span-2">Os dados do cliente vão só para a Nogle e saem do sistema depois do envio.</p>
      </div>

      <div hidden={etapa !== 2} className="space-y-4">
        <PlanosEmCartoes planos={planos} />
        <label className={`${rotulo} max-w-xs`}>DDD da linha nova
          <select name="ddd" className={campo} defaultValue=""><option value="" disabled>Escolha</option>{ddds.map((d) => <option key={d.codigo} value={d.codigo}>{`${d.codigo}${d.uf ? ` (${d.uf})` : ""}`}</option>)}</select>
        </label>
      </div>

      <div hidden={etapa !== 3}>
        <PagamentoANogle pagos={pagos} />
      </div>

      <div hidden={etapa !== ultima} className="space-y-3">
        {/* O rótulo em cima do valor no celular (o endereço é comprido); lado a lado em tela larga. */}
        <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
          {resumo.map(([nome, valor]) => (
            <div key={nome} className="contents">
              <dt className="text-suave">{nome}</dt>
              <dd className="numeros -mt-2 break-words font-medium sm:mt-0">{valor}</dd>
            </div>
          ))}
        </dl>
        <Aviso tom="aviso" titulo="Confira com o cliente antes de registrar">A ativação na operadora não se desfaz pelo sistema. O servidor envia à Nogle e a situação aparece em Operações do dia.</Aviso>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda pt-4">
        {etapa > 0 ? <Botao variante="secundario" onClick={() => ir(etapa - 1)}><ArrowLeft aria-hidden className="size-4" /> Voltar</Botao> : <span />}
        {etapa < ultima
          ? <Botao onClick={continuar}>Continuar <ArrowRight aria-hidden className="size-4" /></Botao>
          : <Botao type="submit" enquanto="Registrando…" onClick={conferirAntesDeEnviar}><CircleCheck aria-hidden className="size-4" /> Registrar ativação</Botao>}
      </div>
    </form>
  );
}

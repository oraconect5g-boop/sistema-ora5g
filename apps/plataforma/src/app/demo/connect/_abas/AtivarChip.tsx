"use client";

import { cpfValido } from "@ora5g/dominio";
import { CircleCheck, Hourglass, QrCode, RefreshCw, Signal, Smartphone } from "lucide-react";
import { useState } from "react";

import { Dialogo } from "../../../../componentes/Dialogo";
import { Aviso, Botao, Cartao, Etapas, ListaDados, Selo } from "../../../../componentes/ui";
import { codigoDoIccid, type PlanoConnect } from "../../../../demo/dados/connect";
import { situacaoDoIccid, type MetodoPagamentoNogle } from "../../../../integracoes/nogle/regras";
import { brl } from "../../../../lib/formato";
import { classeCampo, formatarLinha, mascararDocumento, soDigitos } from "./util";

type Cliente = { nome: string; cpf: string; novo: boolean };
type Resultado = { id: number; situacao: "aguardando_pagamento" | "solicitada" | "ativa"; numero: string; tipo: "fisico" | "esim" };

const ETAPAS = ["Chip", "Cliente", "Plano", "Pagamento", "Resultado"];

/** Ativação na operadora (POST /ativacao/solicitar), separada da venda do chip no PDV (CONNECT-002/005). */
export function AtivarChip({ planos, ddds, chipsDaLoja, clientes, saldoCarteira, loja }: {
  planos: readonly PlanoConnect[];
  ddds: readonly number[];
  chipsDaLoja: readonly string[];
  clientes: readonly { nome: string; cpf: string }[];
  saldoCarteira: number;
  loja: string;
}) {
  const [etapa, setEtapa] = useState(0);
  const [tipo, setTipo] = useState<"fisico" | "esim">("fisico");
  const [iccid, setIccid] = useState("");
  const [codigo, setCodigo] = useState<number | null>(null);
  const [cpf, setCpf] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [codigoCpf, setCodigoCpf] = useState<"ok" | "novo" | "invalido" | null>(null);
  const [cadastro, setCadastro] = useState<{ nome: string; nascimento: string; cep: string; numero: string; erro: string } | null>(null);
  const [plano, setPlano] = useState(planos.find((p) => !p.campanha)?.id ?? 0);
  const [ddd, setDdd] = useState(ddds[0] ?? 41);
  const [pagamento, setPagamento] = useState<MetodoPagamentoNogle>("SALDO");
  const [querPortabilidade, setQuerPortabilidade] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [saldo, setSaldo] = useState(saldoCarteira);

  const situacao = codigo === null ? null : situacaoDoIccid(codigo);
  const planoEscolhido = planos.find((p) => p.id === plano);
  // Débito simulado da carteira (80% do plano é número de exemplo da demonstração, não contrato).
  // Sem saldo, o SALDO não segue: a carteira nunca fica negativa (REV-037, #39).
  const custoNoSaldo = planoEscolhido ? Math.round(planoEscolhido.valor * 0.8) : 0;
  const semSaldo = pagamento === "SALDO" && custoNoSaldo > saldo;

  function validarIccid() {
    setCodigo(codigoDoIccid(iccid));
  }

  function buscarCliente() {
    const d = soDigitos(cpf);
    if (!cpfValido(d)) {
      setCadastro(null);
      setCliente(null);
      setCodigoCpf("invalido");
      return;
    }
    const achado = clientes.find((c) => c.cpf === d);
    setCodigoCpf(achado ? "ok" : "novo");
    if (achado) {
      setCliente({ nome: achado.nome, cpf: d, novo: false });
      setCadastro(null);
    } else {
      setCliente(null);
      setCadastro({ nome: "", nascimento: "", cep: "", numero: "", erro: "" });
    }
  }

  function salvarCadastro() {
    if (!cadastro) return;
    if (cadastro.nome.trim().length < 3) return setCadastro({ ...cadastro, erro: "Informe o nome completo, como no documento." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cadastro.nascimento)) return setCadastro({ ...cadastro, erro: "Informe a data de nascimento." });
    if (soDigitos(cadastro.cep).length !== 8) return setCadastro({ ...cadastro, erro: "CEP com 8 dígitos (a Nogle confere o endereço)." });
    if (cadastro.numero.trim() === "") return setCadastro({ ...cadastro, erro: "Informe o número do endereço." });
    setCliente({ nome: cadastro.nome.trim(), cpf: soDigitos(cpf), novo: true });
    setCadastro(null);
  }

  function solicitar() {
    setConfirmando(false);
    const numero = `${ddd}9${String(10_000_000 + Math.floor(Math.random() * 89_999_999)).slice(0, 8)}`;
    if (semSaldo) return;
    if (pagamento === "SALDO" && planoEscolhido) setSaldo((s) => s - custoNoSaldo);
    setResultado({ id: 90_000 + Math.floor(Math.random() * 9_999), situacao: pagamento === "LINK" ? "aguardando_pagamento" : "solicitada", numero, tipo });
    setEtapa(4);
  }

  function reiniciar() {
    setEtapa(0); setIccid(""); setCodigo(null); setCpf(""); setCliente(null); setCadastro(null); setCodigoCpf(null);
    setResultado(null); setQuerPortabilidade(false);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Cartao className="xl:col-span-2" titulo="Ativar chip na operadora" subtitulo={`${loja} · a venda do chip é feita em Nova venda; aqui é a ativação na Nogle`} icone={Signal}>
        <Etapas etapas={ETAPAS} atual={etapa} rotulo="Etapas da ativação" />
        <p className="mt-2 text-sm font-semibold text-suave">Etapa {etapa + 1} de {ETAPAS.length}: {ETAPAS[etapa]}</p>

        {etapa === 0 && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de chip">
              {([["fisico", "Chip físico", Smartphone], ["esim", "eSIM (chip virtual)", QrCode]] as const).map(([valor, rotulo, IconeTipo]) => (
                <button key={valor} type="button" role="radio" aria-checked={tipo === valor} onClick={() => { setTipo(valor); setCodigo(null); }} className={`flex min-h-12 items-center gap-2 rounded-botao border px-3 text-sm font-semibold ${tipo === valor ? "border-acao bg-acao-clara text-acao-escura" : "border-borda bg-white"}`}>
                  <IconeTipo aria-hidden className="size-4" /> {rotulo}
                </button>
              ))}
            </div>
            {tipo === "fisico" ? (
              <>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); validarIccid(); }}>
                  <label className="sr-only" htmlFor="iccid">ICCID do chip</label>
                  <input id="iccid" value={iccid} onChange={(e) => { setIccid(e.target.value); setCodigo(null); }} inputMode="numeric" placeholder="ICCID: 19 dígitos que começam com 8955" className={`${classeCampo} numeros`} />
                  <Botao type="submit" variante="secundario">Validar</Botao>
                </form>
                {chipsDaLoja.length > 0 && (
                  <div className="text-xs text-suave">
                    Chips desta loja (exemplo):{" "}
                    {chipsDaLoja.slice(0, 3).map((c) => <button key={c} type="button" onClick={() => { setIccid(c); setCodigo(null); }} className="numeros mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-texto hover:bg-slate-200">•••• {c.slice(-4)}</button>)}
                  </div>
                )}
                {situacao && (
                  <Aviso tom={situacao.podeAtivar ? "sucesso" : situacao.codigo === 33 ? "aviso" : "perigo"} titulo={`${situacao.nome}${situacao.codigo ? ` (código ${situacao.codigo})` : ""}`}>{situacao.orientacao}</Aviso>
                )}
              </>
            ) : (
              <Aviso tom="info" titulo="eSIM">Sem chip de plástico: depois da ativação o cliente recebe o PDF com o QR Code de instalação.</Aviso>
            )}
            <div className="flex justify-end"><Botao onClick={() => setEtapa(1)} disabled={tipo === "fisico" && !situacao?.podeAtivar}>Continuar</Botao></div>
          </div>
        )}

        {etapa === 1 && (
          <div className="mt-4 space-y-3">
            {cliente ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-acao-clara/60 px-3 py-2.5 text-sm">
                <span><strong>{cliente.nome}</strong> · CPF {mascararDocumento(cliente.cpf)} {cliente.novo && <Selo tom="info">Cadastro novo (não gravado)</Selo>}</span>
                <Botao variante="secundario" tamanho="sm" onClick={() => { setCliente(null); setCodigoCpf(null); }}>Trocar</Botao>
              </div>
            ) : (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); buscarCliente(); }}>
                <label className="sr-only" htmlFor="cpf-ativacao">CPF do titular</label>
                <input id="cpf-ativacao" value={cpf} onChange={(e) => { setCpf(e.target.value); setCodigoCpf(null); }} inputMode="numeric" placeholder="CPF do titular da linha" className={`${classeCampo} numeros`} />
                <Botao type="submit" variante="secundario">Buscar</Botao>
              </form>
            )}
            {codigoCpf === "invalido" && <p className="text-sm text-perigo">CPF inválido. Confira os dígitos.</p>}
            {cadastro && (
              <div className="space-y-3 rounded-xl border border-borda p-3">
                <p className="text-sm font-semibold">Cliente novo na Nogle: cadastrar (POST /cliente/criar)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium sm:col-span-2">Nome completo<input value={cadastro.nome} onChange={(e) => setCadastro({ ...cadastro, nome: e.target.value, erro: "" })} className={`${classeCampo} mt-1`} /></label>
                  <label className="text-sm font-medium">Data de nascimento<input type="date" value={cadastro.nascimento} onChange={(e) => setCadastro({ ...cadastro, nascimento: e.target.value, erro: "" })} className={`${classeCampo} mt-1`} /></label>
                  <label className="text-sm font-medium">CEP<input value={cadastro.cep} onChange={(e) => setCadastro({ ...cadastro, cep: e.target.value, erro: "" })} inputMode="numeric" className={`${classeCampo} numeros mt-1`} /></label>
                  <label className="text-sm font-medium">Número<input value={cadastro.numero} onChange={(e) => setCadastro({ ...cadastro, numero: e.target.value, erro: "" })} className={`${classeCampo} mt-1`} /></label>
                </div>
                {cadastro.erro && <p role="alert" className="text-sm text-perigo">{cadastro.erro}</p>}
                <Botao variante="secundario" onClick={salvarCadastro}>Usar este cadastro</Botao>
              </div>
            )}
            <p className="text-xs text-suave">A consulta de CPF na Nogle devolve nome e nascimento: use só para ativar a linha do próprio cliente (LGPD).</p>
            <div className="flex justify-between"><Botao variante="secundario" onClick={() => setEtapa(0)}>Voltar</Botao><Botao onClick={() => setEtapa(2)} disabled={!cliente}>Continuar</Botao></div>
          </div>
        )}

        {etapa === 2 && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {planos.map((p) => (
                <button key={p.id} type="button" aria-pressed={plano === p.id} onClick={() => setPlano(p.id)} className={`rounded-xl border p-3 text-left ${plano === p.id ? "border-acao bg-acao-clara/60 ring-2 ring-acao/20" : "border-borda bg-white hover:border-borda-forte"}`}>
                  <span className="flex items-center justify-between"><strong>{p.plano}</strong><span className="numeros font-semibold">{brl(p.valor)}</span></span>
                  <span className="block text-xs text-suave">{p.detalhamento} · {p.ligacoes} · {p.sms}</span>
                  {p.campanha && <Selo tom="marca" className="mt-1">Campanha</Selo>}
                </button>
              ))}
            </div>
            <label className="block max-w-xs text-sm font-medium">DDD da linha
              <select value={ddd} onChange={(e) => setDdd(Number(e.target.value))} className={`${classeCampo} mt-1`}>{ddds.map((d) => <option key={d} value={d}>{d}</option>)}</select>
            </label>
            <div className="flex justify-between"><Botao variante="secundario" onClick={() => setEtapa(1)}>Voltar</Botao><Botao onClick={() => setEtapa(3)}>Continuar</Botao></div>
          </div>
        )}

        {etapa === 3 && planoEscolhido && cliente && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Forma de pagamento da ativação">
              {([["SALDO", "Saldo da Ora na Nogle", "O cliente paga na loja; desconta do saldo pré-pago"], ["LINK", "Link de pagamento", "A Nogle manda o link ao cliente; ativa depois do pagamento"]] as const).map(([valor, rotulo, explicacao]) => (
                <button key={valor} type="button" role="radio" aria-checked={pagamento === valor} onClick={() => setPagamento(valor)} className={`rounded-xl border p-3 text-left text-sm ${pagamento === valor ? "border-acao bg-acao-clara/60" : "border-borda bg-white"}`}>
                  <strong>{rotulo}</strong><span className="block text-xs text-suave">{explicacao}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={querPortabilidade} onChange={(e) => setQuerPortabilidade(e.target.checked)} className="size-4 accent-acao" /> Cliente quer trazer o número de outra operadora (recebe SMS para a portabilidade)</label>
            {pagamento === "SALDO" && <p className="text-sm text-suave">Saldo da carteira: <strong className="numeros text-texto">{brl(saldo)}</strong></p>}
            {semSaldo && <p role="alert" className="text-sm text-perigo">Saldo da carteira insuficiente para este plano: use o link de pagamento ou recarregue a carteira.</p>}
            <div className="flex justify-between"><Botao variante="secundario" onClick={() => setEtapa(2)}>Voltar</Botao><Botao onClick={() => setConfirmando(true)} disabled={semSaldo}>Conferir e ativar</Botao></div>
          </div>
        )}

        {etapa === 4 && resultado && (
          <div className="mt-4 space-y-3" aria-live="polite">
            {resultado.situacao === "aguardando_pagamento" && (
              <Aviso tom="aviso" titulo="Aguardando o pagamento do link">A Nogle enviou o link ao cliente. A linha só é ativada depois do pagamento.
                <Botao tamanho="sm" variante="secundario" className="mt-2" onClick={() => setResultado({ ...resultado, situacao: "solicitada" })}>Cliente pagou (simulação)</Botao>
              </Aviso>
            )}
            {resultado.situacao === "solicitada" && (
              <Aviso tom="info" titulo={`Ativação ${resultado.id} solicitada`}>A ativação só conta na produção depois que a operadora confirmar. Se a resposta demorar, consulte (nunca reenvie).
                <Botao tamanho="sm" className="mt-2" onClick={() => setResultado({ ...resultado, situacao: "ativa" })}><RefreshCw aria-hidden className="size-4" /> Consultar ativação</Botao>
              </Aviso>
            )}
            {resultado.situacao === "ativa" && (
              <Aviso tom="sucesso" titulo="Linha ativa (confirmada pela operadora · simulação)">
                Número: <strong className="numeros">{formatarLinha(resultado.numero)}</strong>
                {resultado.tipo === "esim" && <span className="block">O PDF do eSIM com o QR Code foi enviado ao cliente.</span>}
                {querPortabilidade && <span className="block">O cliente recebe um SMS para cadastrar a portabilidade.</span>}
              </Aviso>
            )}
            <Botao variante="secundario" onClick={reiniciar}>Nova ativação</Botao>
          </div>
        )}
      </Cartao>

      <div className="min-w-0 space-y-4">
        <Cartao titulo="Como a ativação funciona" icone={Hourglass}>
          <ol className="space-y-2 text-sm">
            <li>1. <strong>Validar o ICCID</strong>: só chip virgem (código 88) é ativado.</li>
            <li>2. <strong>Cliente</strong> buscado ou cadastrado na Nogle pelo CPF.</li>
            <li>3. <strong>Plano e DDD</strong> da linha nova.</li>
            <li>4. <strong>Pagamento</strong> por saldo da Ora ou link ao cliente.</li>
            <li>5. A linha só conta como ativa <strong>depois da confirmação</strong> da operadora.</li>
          </ol>
        </Cartao>
        <Aviso tom="aviso" titulo="Na demonstração nada é enviado à Nogle">As respostas são simuladas no formato da documentação oficial. O número gerado é fictício.</Aviso>
      </div>

      <Dialogo
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo="Conferir antes de ativar"
        descricao="Confira com o cliente. A ativação na operadora não se desfaz pelo sistema."
        rodape={<><Botao variante="secundario" onClick={() => setConfirmando(false)}>Voltar</Botao><Botao onClick={solicitar}><CircleCheck aria-hidden className="size-4" /> Solicitar ativação</Botao></>}
      >
        {planoEscolhido && cliente && (
          <ListaDados itens={[
            ["Chip", tipo === "esim" ? "eSIM" : `ICCID •••• ${soDigitos(iccid).slice(-4)}`],
            ["Titular", cliente.nome],
            ["Plano", `${planoEscolhido.plano} · ${brl(planoEscolhido.valor)}`],
            ["DDD", String(ddd)],
            ["Pagamento", pagamento === "SALDO" ? "Saldo da Ora na Nogle" : "Link de pagamento"],
          ]} />
        )}
      </Dialogo>
    </div>
  );
}

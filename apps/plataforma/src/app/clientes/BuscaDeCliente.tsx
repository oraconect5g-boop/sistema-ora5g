"use client";

import { Search, UserCheck, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { chaveDaBusca, CRITERIOS, ERROS_DO_CLIENTE, respostaDaBuscaVale, type Criterio } from "../../lib/clientes/regras";
import { buscarClientes, type ClienteEncontrado, type ResultadoDaBusca } from "./acoes";

const campo = "min-h-11 rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";

// Busca de cliente da rede (lote L5a). Só exata para o vendedor (CPF/CNPJ ou telefone completos); o dono
// também por código e nome. O valor vai no corpo da requisição (nunca no endereço) e cada busca fica
// registrada no banco. "ficha": cada resultado abre a ficha. "escolher": dentro de outro formulário (venda),
// o escolhido vai no campo oculto `cliente_id`; o botão de buscar não envia o formulário de fora.
// AUD-f (auditoria de e7f55b2): o resultado vale só para a busca que o pediu. Mudou o CPF, o telefone ou o critério, o
// resultado anterior sai da tela (não dá para usar o cliente da busca velha); a resposta que não é a do último pedido, ou que
// chega depois de o texto mudar, é descartada (as respostas fora de ordem não trocam o que está na tela).
export function BuscaDeCliente({ modo, completa = false, inicial = null }: { modo: "ficha" | "escolher"; completa?: boolean; inicial?: ClienteEncontrado | null }) {
  const [criterio, setCriterio] = useState<Criterio>("documento");
  const [valor, setValor] = useState("");
  const [resposta, setResposta] = useState<{ chave: string; dados: ResultadoDaBusca } | null>(null);
  const ultimoPedido = useRef(0);
  const chaveAtual = useRef(chaveDaBusca(criterio, valor));
  const [escolhido, setEscolhido] = useState<ClienteEncontrado | null>(inicial);
  const [buscando, iniciar] = useTransition();
  const criterios = (Object.keys(CRITERIOS) as Criterio[]).filter((c) => completa || c === "documento" || c === "telefone");
  // Toda mudança do critério ou do texto tira o resultado da tela e invalida o pedido que ainda está no servidor.
  const mudar = (novoCriterio: Criterio, novoValor: string) => {
    chaveAtual.current = chaveDaBusca(novoCriterio, novoValor);
    ultimoPedido.current += 1;
    setResposta(null);
  };
  const buscar = () => {
    const pedido = { pedido: ultimoPedido.current + 1, chave: chaveDaBusca(criterio, valor) };
    ultimoPedido.current = pedido.pedido;
    iniciar(async () => {
      const dados = await buscarClientes(criterio, valor);
      if (respostaDaBuscaVale(pedido, { ultimoPedido: ultimoPedido.current, chave: chaveAtual.current })) setResposta({ chave: pedido.chave, dados });
    });
  };
  const resultado = resposta && resposta.chave === chaveDaBusca(criterio, valor) ? resposta.dados : null;

  if (modo === "escolher" && escolhido) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-acao/30 bg-acao-clara px-3 py-2 text-sm">
        <input type="hidden" name="cliente_id" value={escolhido.id} />
        <span className="flex items-center gap-2"><UserCheck aria-hidden className="size-4 text-acao" /><strong>{escolhido.nome}</strong>
          <span className="numeros text-xs text-suave">nº {escolhido.numero} · {escolhido.documento ?? escolhido.telefone}</span></span>
        <button type="button" onClick={() => { setEscolhido(null); mudar(criterio, valor); }} className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-acao">
          <X aria-hidden className="size-3.5" /> trocar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`criterio-${modo}`}>Buscar por</label>
        <select id={`criterio-${modo}`} value={criterio} onChange={(e) => { setCriterio(e.target.value as Criterio); mudar(e.target.value as Criterio, valor); }} className={`${campo} w-auto`}>
          {criterios.map((c) => <option key={c} value={c}>{CRITERIOS[c]}</option>)}
        </select>
        <label className="sr-only" htmlFor={`valor-${modo}`}>{CRITERIOS[criterio]}</label>
        <input id={`valor-${modo}`} value={valor} onChange={(e) => { setValor(e.target.value); mudar(criterio, e.target.value); }} autoComplete="off"
          inputMode={criterio === "nome" ? "text" : "numeric"} maxLength={40}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
          placeholder={criterio === "documento" ? "CPF ou CNPJ completo" : criterio === "telefone" ? "(41) 9 0000-0000" : criterio === "codigo" ? "nº do cliente" : "parte do nome"}
          className={`${campo} min-w-0 flex-1`} />
        <button type="button" onClick={buscar} disabled={buscando || valor.trim() === ""}
          className="inline-flex min-h-11 items-center gap-1 rounded-botao bg-acao px-4 text-sm font-semibold text-white disabled:opacity-50">
          <Search aria-hidden className="size-4" /> {buscando ? "Buscando" : "Buscar"}
        </button>
      </div>
      <p className="text-xs text-suave">A busca é sempre exata e fica registrada (LGPD).</p>
      <div aria-live="polite">
        {resultado?.erro && <p className="text-sm text-perigo">{ERROS_DO_CLIENTE[resultado.erro]}</p>}
        {resultado?.situacao === "ok" && resultado.clientes.length === 0 && (
          <p className="text-sm text-suave">Nenhum cliente com esse {CRITERIOS[criterio].toLowerCase()}. <Link href="/clientes/novo" target={modo === "escolher" ? "_blank" : undefined} className="font-semibold text-acao">Cadastrar cliente</Link></p>
        )}
        {resultado?.situacao === "ok" && resultado.clientes.length > 0 && (
          <ul className="divide-y divide-borda rounded-xl border border-borda text-sm">
            {resultado.clientes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0"><span className="font-semibold">{c.nome}</span>
                  <span className="numeros block text-xs text-suave">nº {c.numero}{c.documento ? ` · ${c.documento}` : ""}{c.telefone ? ` · ${c.telefone}` : ""}{c.situacao !== "ativo" ? " · inativo" : ""}</span></span>
                {modo === "ficha"
                  ? <Link href={`/clientes/${c.id}`} className="inline-flex min-h-10 items-center text-sm font-semibold text-acao">Abrir ficha</Link>
                  : <button type="button" onClick={() => setEscolhido(c)} disabled={c.situacao !== "ativo"} className="inline-flex min-h-10 items-center text-sm font-semibold text-acao disabled:opacity-50">Usar este cliente</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

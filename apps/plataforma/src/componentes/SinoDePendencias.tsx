"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ICONES_DAS_PENDENCIAS } from "../lib/inicio/icones-das-pendencias";
import { acessoNegado, CHAVE_DO_SINO, emblemaDoSino, lembrancaComHora, lembrar, lerRespostaDoSino, manterDepoisDaFalha, type ItemDoSino } from "../lib/inicio/sino";
import { MenuSuspenso } from "./MenuSuspenso";

type Estado = { tipo: "lendo" } | { tipo: "ok"; itens: ItemDoSino[]; lidoEm: number } | { tipo: "falha" };

// O sino do topo de todas as telas (G6, REPORT-007): o que espera a pessoa na loja do turno, a mesma leitura do Início.
// Pede /api/pendencias depois que a tela abre (não atrasa nenhuma tela) e lembra a resposta por um minuto nesta aba;
// abrir o sino lê de novo. Falha de leitura aparece como falha, nunca como zero.
export function SinoDePendencias({ unidade, usuario }: { unidade: string; usuario: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "lendo" });

  // Releitura ao abrir: se falhar, fica o que já foi lido (menos de um minuto); na primeira leitura, a falha aparece.
  const ler = useCallback(async () => {
    // #96: a falha apaga a lembrança da aba; o acesso negado (sessão encerrada ou revogada) apaga também a lista na hora,
    // e outra falha só mantém a lista enquanto ela tem menos de um minuto.
    const falhou = (negado: boolean) => {
      try { sessionStorage.removeItem(CHAVE_DO_SINO); } catch { /* aba sem armazenamento */ }
      const agora = Date.now();
      setEstado((atual) => (atual.tipo === "ok" && manterDepoisDaFalha(negado, atual.lidoEm, agora) ? atual : { tipo: "falha" }));
    };
    try {
      const resposta = await fetch("/api/pendencias", { cache: "no-store", headers: { accept: "application/json" } });
      if (acessoNegado(resposta)) {
        falhou(true);
        return;
      }
      const itens = resposta.ok ? lerRespostaDoSino(await resposta.json(), unidade) : null;
      if (!itens) {
        falhou(false);
        return;
      }
      setEstado({ tipo: "ok", itens, lidoEm: Date.now() });
      try { sessionStorage.setItem(CHAVE_DO_SINO, lembrar({ usuario, unidade }, itens, Date.now())); } catch { /* aba sem armazenamento: lê de novo na próxima tela */ }
    } catch {
      falhou(false);
    }
  }, [unidade, usuario]);

  useEffect(() => {
    const comecar = () => {
      let lembrada: { itens: ItemDoSino[]; em: number } | null = null;
      try { lembrada = lembrancaComHora(sessionStorage.getItem(CHAVE_DO_SINO), { usuario, unidade }, Date.now()); } catch { /* sem armazenamento */ }
      if (lembrada) setEstado({ tipo: "ok", itens: lembrada.itens, lidoEm: lembrada.em });
      else void ler();
    };
    comecar();
  }, [unidade, usuario, ler]);

  const emblema = estado.tipo === "ok" ? emblemaDoSino(estado.itens) : null;
  const rotulo = estado.tipo === "falha" ? "O que espera você: não deu para ler" : emblema ? `O que espera você: ${emblema}` : "O que espera você";
  return (
    // Abrir o sino (o botão ainda fechado) lê de novo; clicar num item não.
    <div onPointerDown={(evento) => {
      const botao = (evento.target as Element).closest("button[aria-expanded]");
      if (botao && botao.getAttribute("aria-expanded") === "false" && estado.tipo !== "lendo") void ler();
    }}>
      <MenuSuspenso
        rotulo={rotulo}
        largura="w-80"
        classeBotao="relative grid size-11 place-items-center rounded-full hover:bg-white"
        botao={
          <>
            <Bell aria-hidden className="size-5 text-suave" />
            {emblema && (
              <span aria-hidden className="numeros absolute right-0.5 top-0.5 min-w-5 rounded-full bg-perigo px-1 text-center text-[11px] font-bold leading-5 text-white">{emblema}</span>
            )}
            {estado.tipo === "falha" && <span aria-hidden className="absolute right-1 top-1 size-2.5 rounded-full bg-aviso ring-2 ring-white" />}
          </>
        }
      >
        <p className="px-3 pb-1 pt-2 text-sm font-semibold">O que espera você</p>
        {estado.tipo === "lendo" && <p className="px-3 py-2 text-sm text-suave">Lendo as pendências…</p>}
        {estado.tipo === "falha" && <p className="px-3 py-2 text-sm text-suave">Não deu para ler agora. Abra o sino de novo em instantes.</p>}
        {estado.tipo === "ok" && estado.itens.length === 0 && <p className="px-3 py-2 text-sm text-suave">Nada esperando você nesta loja agora.</p>}
        {estado.tipo === "ok" && estado.itens.length > 0 && (
          <ul className="max-h-80 overflow-y-auto py-1">
            {estado.itens.map((item) => {
              const IconeDoItem = ICONES_DAS_PENDENCIAS[item.icone];
              return (
                <li key={item.rotulo}>
                  <Link href={item.href} className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <IconeDoItem aria-hidden className={`size-4 shrink-0 ${item.alerta ? "text-perigo" : "text-acao"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.rotulo}</span>
                      <span className="block truncate text-xs text-suave">{item.detalhe}</span>
                    </span>
                    <span className="numeros shrink-0 font-bold">{item.quantidade}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-borda px-3 py-2">
          <Link href="/inicio" className="text-sm font-semibold text-acao">Abrir o Início</Link>
        </div>
      </MenuSuspenso>
    </div>
  );
}

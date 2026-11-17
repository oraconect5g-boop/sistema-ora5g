"use client";

import { nomeDoDispositivo } from "@ora5g/dominio/avisos";
import { BellOff, BellRing, Send } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Aviso, Botao } from "../../../componentes/ui";
import { inscreverEsteCelular, pararEsteCelular, pedirAvisoDeTeste, type ErroDosAvisos } from "./acoes";

// Lote PWA-b (ADR-014): liga e desliga os avisos NESTE celular (ou navegador) e pede um aviso de teste. O navegador
// guarda a inscrição; o servidor recebe só o endereço de envio e as duas chaves dela, e o nome curto do aparelho.
type Estado = "verificando" | "sem_suporte" | "bloqueado" | "desligado" | "ligado";
type Mensagem = { tom: "sucesso" | "perigo" | "info"; texto: string };

const ERROS: Record<ErroDosAvisos, string> = {
  formato: "Este navegador devolveu uma inscrição que o Ora 5G não aceita. Tente pelo Chrome, no Android, ou pelo ícone do Ora 5G, no iPhone.",
  sessao: "A sua sessão terminou. Entre de novo e volte aqui.",
  sem_celular: "Ligue os avisos neste celular antes de pedir o teste.",
  espere: "Espere um minuto para pedir outro aviso de teste.",
  indisponivel: "Os avisos ainda não estão disponíveis neste ambiente: chegam com a atualização do banco.",
  falha: "Não deu para fazer isso agora. Tente de novo em alguns instantes.",
};

/** A chave pública do servidor, do formato do texto (base64url) para os bytes que o navegador pede. */
function chaveEmBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const texto = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(texto.length));
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i);
  return bytes;
}

export function AvisosNoCelular({ chavePublica }: { chavePublica: string }) {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [ocupado, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setEstado("sem_suporte");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.getSubscription();
      if (!vivo) return;
      setEstado(inscricao ? "ligado" : "desligado");
      // A inscrição deste navegador volta ao servidor a cada visita: se ele tirou (o serviço disse que não existia) ou
      // outra pessoa ligou neste celular, ela volta a ser desta pessoa.
      if (inscricao) await inscreverEsteCelular(inscricao.toJSON(), nomeDoDispositivo(navigator.userAgent));
    })().catch(() => { if (vivo) setEstado("sem_suporte"); });
    return () => { vivo = false; };
  }, []);

  const ligar = () => iniciar(async () => {
    setMensagem(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const inscricao = (await registro.pushManager.getSubscription())
        ?? await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(chavePublica) });
      const r = await inscreverEsteCelular(inscricao.toJSON(), nomeDoDispositivo(navigator.userAgent));
      if (r.ok) {
        setEstado("ligado");
        setMensagem({ tom: "sucesso", texto: "Pronto: este celular recebe os avisos." });
      } else {
        setMensagem({ tom: "perigo", texto: ERROS[r.erro] });
      }
    } catch {
      setMensagem({ tom: "perigo", texto: "Não deu para ligar os avisos neste celular agora. Tente de novo." });
    }
  });

  const desligar = () => iniciar(async () => {
    setMensagem(null);
    try {
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.getSubscription();
      if (inscricao) {
        const r = await pararEsteCelular(inscricao.endpoint);
        if (!r.ok) {
          setMensagem({ tom: "perigo", texto: ERROS[r.erro] });
          return;
        }
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
      setMensagem({ tom: "info", texto: "Este celular não recebe mais os avisos." });
    } catch {
      setMensagem({ tom: "perigo", texto: ERROS.falha });
    }
  });

  const testar = () => iniciar(async () => {
    setMensagem(null);
    const r = await pedirAvisoDeTeste();
    setMensagem(r.ok
      ? { tom: "sucesso", texto: "Aviso de teste pedido. Ele chega em até um minuto, quando o envio dos avisos estiver ligado no servidor." }
      : { tom: "perigo", texto: ERROS[r.erro] });
  });

  return (
    <div className="mt-4 space-y-3" aria-live="polite">
      {estado === "verificando" && <p className="text-sm text-suave">Conferindo este celular…</p>}
      {estado === "sem_suporte" && (
        <Aviso tom="aviso" titulo="Este navegador não recebe avisos">
          No iPhone, os avisos chegam só pelo Ora 5G instalado na tela inicial (Compartilhar, depois “Adicionar à Tela de Início”), aberto pelo ícone. No Android, use o Chrome.
        </Aviso>
      )}
      {estado === "bloqueado" && (
        <Aviso tom="aviso" titulo="Os avisos estão bloqueados neste navegador">
          Libere as notificações do Ora 5G nas configurações do navegador (o cadeado ao lado do endereço, ou Configurações, Notificações) e volte aqui.
        </Aviso>
      )}
      {estado === "desligado" && (
        <Botao type="button" onClick={ligar} disabled={ocupado} className="w-full">
          <BellRing aria-hidden className="size-4" />{ocupado ? "Ligando…" : "Receber avisos neste celular"}
        </Botao>
      )}
      {estado === "ligado" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Botao type="button" onClick={testar} disabled={ocupado} className="flex-1">
            <Send aria-hidden className="size-4" />{ocupado ? "Aguarde…" : "Mandar um aviso de teste"}
          </Botao>
          <Botao type="button" variante="secundario" onClick={desligar} disabled={ocupado} className="flex-1">
            <BellOff aria-hidden className="size-4" />Desligar neste celular
          </Botao>
        </div>
      )}
      {mensagem && <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso>}
    </div>
  );
}

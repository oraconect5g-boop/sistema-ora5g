"use client";

import { useEffect, useState, type ComponentProps } from "react";

import { EnvioDeArquivo } from "./BotaoDeEnvio";

/** Depois deste tempo o botão destrava sozinho: a pessoa pode ter cancelado o envio, e nenhum aviso chega disso. */
export const ESPERA_MAXIMA_DO_ENVIO_MS = 60_000;

/**
 * Formulário que envia arquivo para uma rota do servidor (planilha da importação, boleto, nota, anexo da venda).
 * O envio é o POST comum do navegador, em multipart, e continua funcionando sem JavaScript. O que este componente
 * acrescenta (lote VEL-a: ORA-QUAL-010) é o retorno imediato: assim que o envio sai, o botão de dentro trava e mostra
 * o texto de espera, em vez de ficar igual enquanto o arquivo sobe pela rede do celular.
 *
 * Três cuidados:
 *  - o botão só trava DEPOIS que o navegador montou o envio (setTimeout): travar durante o evento tiraria o próprio
 *    botão dos dados enviados;
 *  - se a pessoa voltar para esta página pelo botão Voltar (o navegador a guarda inteira), o botão destrava;
 *  - se o envio for cancelado, o botão destrava sozinho depois de um minuto.
 */
export function FormularioDeArquivo({ children, ...props }: Omit<ComponentProps<"form">, "method" | "encType" | "onSubmit">) {
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const soltar = (evento: PageTransitionEvent) => {
      if (evento.persisted) setEnviando(false);
    };
    window.addEventListener("pageshow", soltar);
    return () => window.removeEventListener("pageshow", soltar);
  }, []);

  useEffect(() => {
    if (!enviando) return;
    const relogio = setTimeout(() => setEnviando(false), ESPERA_MAXIMA_DO_ENVIO_MS);
    return () => clearTimeout(relogio);
  }, [enviando]);

  return (
    <form {...props} method="post" encType="multipart/form-data" onSubmit={() => { setTimeout(() => setEnviando(true), 0); }}>
      <EnvioDeArquivo.Provider value={enviando}>{children}</EnvioDeArquivo.Provider>
    </form>
  );
}

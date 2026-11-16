"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

// O botão de envio dos formulários de ação (lote VEL-a: ORA-QUAL-010 e ORA-POS-002). Enquanto o pedido está no
// servidor ele trava (não deixa tocar duas vezes) e troca o texto pelo de espera. É o retorno imediato que faltava:
// antes o botão ficava igual por segundos, nada dizia que o toque tinha sido recebido e a pessoa tocava de novo.
//
// Precisa ficar DENTRO do formulário: é dele que o useFormStatus lê o envio. Quem escreve Botao com type="submit"
// (ui.tsx) já recebe este botão; aqui não se importa nada de ui.tsx, para os dois arquivos não se importarem em círculo.
//
// Formulário com mais de um botão de envio (Aprovar / Negar, cada um com name e value): todos travam, mas só o que
// foi tocado mostra o texto de espera; o outro fica apagado, com o próprio nome.

/**
 * Envio de arquivo pelo navegador (POST comum para uma rota, sem ação do React): o useFormStatus não enxerga esse
 * envio, então quem avisa o botão é o FormularioDeArquivo, por aqui.
 */
export const EnvioDeArquivo = createContext(false);

export function BotaoDeEnvio({ enquanto = "Aguarde…", disabled = false, children, ...props }: Omit<ComponentProps<"button">, "type"> & {
  /** O que o botão mostra enquanto o pedido está no servidor. */
  enquanto?: ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const arquivoIndo = useContext(EnvioDeArquivo);
  const tocado = arquivoIndo || (pending && (props.name === undefined || data?.get(props.name) === String(props.value ?? "")));
  return (
    <button {...props} type="submit" disabled={disabled || pending || arquivoIndo} aria-busy={tocado}>
      {tocado ? enquanto : children}
    </button>
  );
}

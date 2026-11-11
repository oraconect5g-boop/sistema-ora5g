"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { classeBotao, type VarianteBotao } from "./ui";

// Botão de envio que mostra a espera pela resposta do banco (lote L6a: ORA-POS-015). Enquanto o pedido não
// volta, o botão fica travado e avisa que está confirmando: a venda só aparece como concluída na tela
// seguinte, depois que o banco gravou. Clique repetido não sai (e, se sair, a chave do formulário repete
// o mesmo resultado).
export function BotaoConfirmar({ children, enquanto = "Confirmando no sistema…", variante = "primario", tamanho = "lg", className = "", disabled = false }: {
  children: ReactNode; enquanto?: string; variante?: VarianteBotao; tamanho?: "sm" | "md" | "lg"; className?: string; disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} aria-busy={pending} className={classeBotao(variante, tamanho, className)}>
      {pending ? enquanto : children}
    </button>
  );
}

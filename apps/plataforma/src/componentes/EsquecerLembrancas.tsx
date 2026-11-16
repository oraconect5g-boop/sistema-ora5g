"use client";

import { useEffect } from "react";

import { CHAVE_DO_SINO } from "../lib/inicio/sino";

/**
 * A tela de entrada apaga as lembranças da aba (#96): quem chega aqui saiu, teve a sessão revogada ou vencida, e a
 * próxima pessoa nesta aba não vê o resumo do acesso anterior. Não desenha nada.
 */
export function EsquecerLembrancas() {
  useEffect(() => {
    try { sessionStorage.removeItem(CHAVE_DO_SINO); } catch { /* aba sem armazenamento: não há o que apagar */ }
  }, []);
  return null;
}

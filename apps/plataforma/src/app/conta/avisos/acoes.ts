"use server";

import { inscricaoDoNavegador } from "@ora5g/dominio/avisos";

import { obterSessao } from "../../../lib/acesso/sessao";

// Lote PWA-b (ADR-014): ligar, desligar e testar os avisos no celular da pessoa logada. Quem decide é o banco
// (public.aviso_inscrever, aviso_cancelar e aviso_teste); aqui, o formato da inscrição que o navegador devolveu. O log
// leva só o código do erro: nada do endereço de envio nem das chaves do celular.
export type ErroDosAvisos = "formato" | "sessao" | "sem_celular" | "espere" | "indisponivel" | "falha";
export type ResultadoDosAvisos = { ok: true } | { ok: false; erro: ErroDosAvisos };

const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
function erroDosAvisos(codigo: string | undefined, onde: string): ErroDosAvisos {
  if (codigo === "42501") return "sessao";
  if (codigo === "22023") return "formato";
  if (codigo === "OR039") return "sem_celular";
  if (codigo === "OR040") return "espere";
  if (codigo && FUNCAO_AUSENTE.has(codigo)) return "indisponivel";
  console.error(`avisos: falha ao ${onde}`, { codigo: codigo || null });
  return "falha";
}

export async function inscreverEsteCelular(dados: unknown, dispositivo: unknown): Promise<ResultadoDosAvisos> {
  const inscricao = inscricaoDoNavegador(dados);
  if (!inscricao) return { ok: false, erro: "formato" };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("aviso_inscrever", {
    p_endpoint: inscricao.endpoint, p_p256dh: inscricao.p256dh, p_auth: inscricao.auth,
    p_dispositivo: typeof dispositivo === "string" ? dispositivo.slice(0, 120) : undefined,
  });
  return error ? { ok: false, erro: erroDosAvisos(error.code, "ligar") } : { ok: true };
}

export async function pararEsteCelular(endpoint: unknown): Promise<ResultadoDosAvisos> {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return { ok: false, erro: "formato" };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("aviso_cancelar", { p_endpoint: endpoint });
  // Celular que já não estava na lista (o envio tirou, ou outra pessoa ligou nele): desligado do mesmo jeito.
  if (error && error.code !== "42501") return { ok: false, erro: erroDosAvisos(error.code, "desligar") };
  return { ok: true };
}

export async function pedirAvisoDeTeste(): Promise<ResultadoDosAvisos> {
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("aviso_teste");
  return error ? { ok: false, erro: erroDosAvisos(error.code, "pedir o teste") } : { ok: true };
}

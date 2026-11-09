import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { BancoConnect } from "./connect/processar.ts";
import { mensagemSegura, type ServicoIdentidade } from "./identidade.ts";

// Bloqueio no Auth: 100 anos (o desbloqueio usa "none"). O banco é a fonte da verdade do acesso.
const BANIMENTO = "876000h";

export function clienteAdministrativo(url: string, chaveSecreta: string): SupabaseClient {
  return createClient(url, chaveSecreta, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

// Conta que já existe no Auth: o Supabase responde 422 com código email_exists.
const jaExiste = (erro: { code?: string; status?: number; message?: string }) =>
  erro.code === "email_exists" || (erro.status === 422 && /already (been )?registered/i.test(erro.message ?? ""));

export function servicoSupabase(cliente: SupabaseClient, enderecoApp: string): ServicoIdentidade {
  const rpc = async <T>(nome: string, argumentos?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await cliente.rpc(nome, argumentos);
    if (error) throw error;
    return data as T;
  };
  return {
    convitesAProcessar: (limite) => rpc("identidade_convites_a_processar", { p_limite: limite }),
    async convidarPorEmail(email, nome) {
      const { data, error } = await cliente.auth.admin.inviteUserByEmail(email, {
        data: { nome },
        redirectTo: `${enderecoApp}/auth/confirmar`,
      });
      if (error) return jaExiste(error) ? { jaExiste: true } : { erro: mensagemSegura(error) };
      return data.user ? { usuario: data.user.id } : { erro: "o Auth não devolveu a pessoa criada" };
    },
    usuarioPorEmail: (email) => rpc("identidade_usuario_por_email", { p_email: email }),
    concluir: (convite, usuario, jaExistia) => rpc("identidade_concluir_convite", { p_convite: convite, p_usuario: usuario, p_ja_existia: jaExistia }),
    falhar: (convite, erro) => rpc("identidade_falha_convite", { p_convite: convite, p_erro: erro }),
    async bloqueiosAAplicar() {
      const linhas = await rpc<{ usuario_id: string; bloquear: boolean }[]>("identidade_bloqueios_a_aplicar");
      return linhas.map((l) => ({ usuario: l.usuario_id, bloquear: l.bloquear }));
    },
    async aplicarBloqueio(usuario, bloquear) {
      const { error } = await cliente.auth.admin.updateUserById(usuario, { ban_duration: bloquear ? BANIMENTO : "none" });
      return error ? mensagemSegura(error) : null;
    },
  };
}

// Funções connect_worker_* (só service_role) da organização dona das credenciais da Nogle.
export function bancoConnect(cliente: SupabaseClient, organizacao: string): BancoConnect {
  const rpc = async <T>(nome: string, argumentos: Record<string, unknown>): Promise<T> => {
    const { data, error } = await cliente.rpc(nome, argumentos);
    if (error) throw error;
    return data as T;
  };
  return {
    reivindicarEnvios: (tipos, limite) => rpc("connect_worker_reivindicar_envios", { p_organizacao: organizacao, p_tipos: tipos, p_limite: limite }),
    registrarEnvio: (operacao, resultado) => rpc("connect_worker_registrar_envio", { p_operacao: operacao, p_resultado: resultado }),
    operacoesAConsultar: (tipos, limite) => rpc("connect_worker_operacoes_a_consultar", { p_organizacao: organizacao, p_tipos: tipos, p_limite: limite }),
    registrarConsulta: (operacao, evidencia) => rpc("connect_worker_registrar_consulta", { p_operacao: operacao, p_evidencia: evidencia }),
    atualizarReferencias: (tipo, itens) => rpc("connect_worker_atualizar_referencias", { p_organizacao: organizacao, p_tipo: tipo, p_itens: itens }),
  };
}

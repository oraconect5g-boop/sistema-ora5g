import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AvisoParaEnviar, BancoDosAvisos, ResultadoDoAviso } from "./avisos/processar.ts";
import type { BancoConnect } from "./connect/processar.ts";
import type { BancoWhatsApp, EnvioParaFazer, ResultadoDoEnvio } from "./whatsapp/processar.ts";
import { mensagemSegura, type DesfechoDoConvite, type ServicoIdentidade } from "./identidade.ts";

// Bloqueio no Auth: 100 anos (o desbloqueio usa "none"). O banco é a fonte da verdade do acesso.
const BANIMENTO = "876000h";

export function clienteAdministrativo(url: string, chaveSecreta: string): SupabaseClient {
  return createClient(url, chaveSecreta, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

// O cliente com a chave pública, sem sessão de pessoa (PWA-b): o que abre a fila dos avisos é o segredo deles.
export function clientePublico(url: string, chavePublica: string): SupabaseClient {
  return createClient(url, chavePublica, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

// A fila dos avisos no celular (PWA-b): public.avisos_a_enviar e public.avisos_resultado, com o segredo dos avisos.
export function bancoDosAvisos(cliente: SupabaseClient, segredo: string): BancoDosAvisos {
  return {
    async aEnviar(limite) {
      const { data, error } = await cliente.rpc("avisos_a_enviar", { p_segredo: segredo, p_limite: limite });
      if (error) throw error;
      return data as AvisoParaEnviar[];
    },
    async registrar(resultados: ResultadoDoAviso[]) {
      const { error } = await cliente.rpc("avisos_resultado", { p_segredo: segredo, p_resultados: resultados });
      if (error) throw error;
    },
  };
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
    concluir: (convite, usuario, jaExistia) => rpc<DesfechoDoConvite>("identidade_concluir_convite", { p_convite: convite, p_usuario: usuario, p_ja_existia: jaExistia }),
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
    registrarConciliacao: (relatorio, de, ate, linhas) => rpc("connect_worker_registrar_conciliacao",
      { p_organizacao: organizacao, p_relatorio: relatorio, p_de: de, p_ate: ate, p_linhas: linhas }),
  };
}

// Funções whatsapp_worker_* (só service_role) e o PDF da nota no bucket privado "notas" (lote WHATS-a; K1c).
type LinhaDaFila = {
  envio_id: string; organizacao_id: string; telefone: string; documento_caminho: string;
  nota_numero: number | null; nota_serie: number | null; chave_acesso: string | null; cliente_nome: string;
};
export function bancoWhatsApp(cliente: SupabaseClient): BancoWhatsApp {
  const rpc = async <T>(nome: string, argumentos: Record<string, unknown>): Promise<T> => {
    const { data, error } = await cliente.rpc(nome, argumentos);
    if (error) throw error;
    return data as T;
  };
  return {
    async reivindicar(limite): Promise<EnvioParaFazer[]> {
      const linhas = await rpc<LinhaDaFila[]>("whatsapp_worker_reivindicar", { p_limite: limite });
      return (linhas ?? []).map((l) => ({
        envioId: l.envio_id, telefone: l.telefone, documentoCaminho: l.documento_caminho, notaNumero: l.nota_numero,
        notaSerie: l.nota_serie, chaveAcesso: l.chave_acesso, clienteNome: l.cliente_nome,
      }));
    },
    registrarResultado: (envio: string, resultado: ResultadoDoEnvio) => rpc<string>("whatsapp_worker_resultado", { p_envio: envio, p_resultado: resultado }),
    async linkTemporario(caminho, segundos) {
      const { data, error } = await cliente.storage.from("notas").createSignedUrl(caminho, segundos);
      return error || !data?.signedUrl ? null : data.signedUrl;
    },
  };
}

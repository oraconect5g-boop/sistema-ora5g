import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { BancoDoRelato } from "./avisos/erros-do-site.ts";
import type { AvisoAProcessar, BancoDosPagamentos, ConfiguracaoDoPagamento, PagamentoACriar } from "./pagamentos/processar.ts";
import type { BancoDoCaixa, QrAConferir, QrACriar } from "./pagamentos/caixa.ts";
import type { BancoDoCartao, LinkDoCartaoAConferir, LinkDoCartaoACriar } from "./pagamentos/cartao.ts";
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

// O relato dos erros do site (QUAL-006a): public.erros_do_servidor_relatar, com o mesmo segredo dos avisos.
export function bancoDoRelato(cliente: SupabaseClient, segredo: string): BancoDoRelato {
  return {
    async relatar(relato) {
      const { data, error } = await cliente.rpc("erros_do_servidor_relatar", { p_segredo: segredo, p_relato: relato });
      if (error) throw error;
      const alertas = (data as { alertas?: unknown } | null)?.alertas;
      if (typeof alertas !== "number" || !Number.isInteger(alertas) || alertas < 0) throw new Error("o banco respondeu o relato fora da forma");
      return { alertas };
    },
  };
}

// O pagamento pelo site (PAY-014a; ADR-025): as funções do worker dos pagamentos, só com a chave secreta do servidor.
export function bancoDosPagamentos(cliente: SupabaseClient): BancoDosPagamentos & BancoDoCaixa & BancoDoCartao {
  const rpc = async <T>(nome: string, argumentos?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await cliente.rpc(nome, argumentos);
    if (error) throw error;
    return data as T;
  };
  return {
    configuracao: () => rpc<ConfiguracaoDoPagamento>("pagamento_configuracao"),
    async ligar(ambiente, webhookId, impressao) {
      await rpc("pagamento_ligar", { p_ambiente: ambiente, p_webhook_id: webhookId, p_impressao: impressao });
    },
    aCriar: (limite) => rpc<PagamentoACriar[]>("pagamentos_a_criar", { p_limite: limite }),
    linkRegistrado: (pagamento, linkId, url) => rpc<string>("pagamento_link_registrar", { p_pagamento: pagamento, p_link_id: linkId, p_link_url: url }),
    criacaoFalhou: (pagamento, motivo, definitiva) => rpc<string>("pagamento_criacao_falhou", { p_pagamento: pagamento, p_motivo: motivo, p_definitiva: definitiva }),
    avisosAProcessar: (limite) => rpc<AvisoAProcessar[]>("pagamento_avisos_a_processar", { p_limite: limite }),
    avisoConcluir: (aviso, resultado) => rpc<boolean>("pagamento_aviso_concluir", { p_aviso: aviso, p_resultado: resultado }),
    consultaAplicar: (aviso, consulta) => rpc<string>("pagamento_consulta_aplicar", { p_aviso: aviso, p_consulta: consulta }),
    aDesativar: (limite) => rpc<{ id: string; link: string }[]>("pagamentos_a_desativar", { p_limite: limite }),
    linkDesativado: (pagamento) => rpc<boolean>("pagamento_link_desativado", { p_pagamento: pagamento }),
    // PAY-015a: o Pix pela Asaas no caixa.
    caixaSituacao: (pronto, motivo) => rpc<boolean>("caixa_pix_situacao", { p_pronto: pronto, p_motivo: motivo }),
    caixaACriar: (limite) => rpc<QrACriar[]>("caixa_pix_a_criar", { p_limite: limite }),
    caixaQrRegistrar: (pix, qrId, copiaECola, imagem, expiraEm) =>
      rpc<string>("caixa_pix_qr_registrar", { p_pix: pix, p_qr_id: qrId, p_copia_e_cola: copiaECola, p_imagem: imagem, p_expira_em: expiraEm }),
    caixaCriacaoFalhou: (pix, motivo, definitiva) => rpc<string>("caixa_pix_criacao_falhou", { p_pix: pix, p_motivo: motivo, p_definitiva: definitiva }),
    caixaAConferir: (limite) => rpc<QrAConferir[]>("caixa_pix_a_conferir", { p_limite: limite }),
    caixaConsultaAplicar: (pix, consulta) => rpc<string>("caixa_pix_consulta_aplicar", { p_pix: pix, p_consulta: consulta }),
    caixaAExcluir: (limite) => rpc<{ id: string; qr_id: string }[]>("caixa_pix_a_excluir", { p_limite: limite }),
    caixaQrExcluido: (pix) => rpc<string>("caixa_pix_qr_excluido", { p_pix: pix }),
    // PAY-015b: o cartão pela Asaas no caixa.
    cartaoSituacao: (pronto, motivo) => rpc<boolean>("caixa_cartao_situacao", { p_pronto: pronto, p_motivo: motivo }),
    cartaoACriar: (limite) => rpc<LinkDoCartaoACriar[]>("caixa_cartao_a_criar", { p_limite: limite }),
    cartaoLinkRegistrar: (cartao, linkId, url, expiraEm) =>
      rpc<string>("caixa_cartao_link_registrar", { p_cartao: cartao, p_link_id: linkId, p_link_url: url, p_expira_em: expiraEm }),
    cartaoCriacaoFalhou: (cartao, motivo, definitiva) => rpc<string>("caixa_cartao_criacao_falhou", { p_cartao: cartao, p_motivo: motivo, p_definitiva: definitiva }),
    cartaoAConferir: (limite) => rpc<LinkDoCartaoAConferir[]>("caixa_cartao_a_conferir", { p_limite: limite }),
    cartaoConsultaAplicar: (cartao, consulta) => rpc<string>("caixa_cartao_consulta_aplicar", { p_cartao: cartao, p_consulta: consulta }),
    cartaoADesativar: (limite) => rpc<{ id: string; link_id: string }[]>("caixa_cartao_a_desativar", { p_limite: limite }),
    cartaoLinkDesativado: (cartao) => rpc<string>("caixa_cartao_link_desativado", { p_cartao: cartao }),
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
    gravarEstoque: (leitura) => rpc("connect_worker_gravar_estoque", { p_organizacao: organizacao, p_leitura: leitura }),
    transferenciasAEnviar: (limite) => rpc("connect_worker_transferencias_a_enviar", { p_organizacao: organizacao, p_limite: limite }),
    registrarTransferencia: (transferencia, resultado) => rpc("connect_worker_registrar_transferencia", { p_transferencia: transferencia, p_resultado: resultado }),
    planosNoCaixa: () => rpc("connect_worker_planos_no_caixa", { p_organizacao: organizacao }),
    chipsNoEstoque: () => rpc("connect_worker_chips_no_estoque", { p_organizacao: organizacao }),
    consultasAFazer: (limite) => rpc("connect_worker_consultas_a_fazer", { p_organizacao: organizacao, p_limite: limite }),
    registrarRespostaDaConsulta: (consulta, resposta) => rpc("connect_worker_registrar_resposta_da_consulta", { p_consulta: consulta, p_resultado: resposta }),
    limparConsultas: () => rpc("connect_worker_limpar_consultas", { p_organizacao: organizacao }),
    acoesAEnviar: (limite) => rpc("connect_worker_acoes_a_enviar", { p_organizacao: organizacao, p_limite: limite }),
    registrarAcao: (acao, resultado) => rpc("connect_worker_registrar_acao", { p_acao: acao, p_resultado: resultado }),
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

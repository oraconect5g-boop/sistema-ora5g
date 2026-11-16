"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { enderecoDaConfirmacao, precisaConfirmar } from "../../lib/acesso/confirmacao";
import { obterSessao } from "../../lib/acesso/sessao";
import { ehPeriodo, ehTipoDeDivergencia, enderecoDaConciliacao, erroDaConciliacao } from "../../lib/notas/conciliacao";
import { erroDasNotas } from "../../lib/notas/regras";

// Fila fiscal (ADR-006): cada ação chama UMA função do banco como a pessoa logada. Nada é emitido
// pelo sistema (sem emissor contratado): a emissão é registrada pela chave de acesso.
const chaveDe = (dados: FormData) => {
  const chave = dados.get("chave");
  return typeof chave === "string" && /^[0-9a-f-]{36}$/.test(chave) ? chave : randomUUID();
};
const texto = (dados: FormData, nome: string, maximo = 200) => {
  const valor = dados.get(nome);
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
};
// ORG-006b: aprovar a nota pede a senha digitada há pouco (OR033): a confirmação, e volta para a fila.
const voltarParaFila = (erro: { code?: string } | null, ok: string): never =>
  redirect(precisaConfirmar(erro) ? enderecoDaConfirmacao("/notas") : erro ? `/notas?erro=${erroDasNotas(erro)}` : `/notas?ok=${ok}`);

export async function pedirNota(dados: FormData) {
  const venda = dados.get("venda");
  if (!ehUuid(venda)) redirect("/vender?erro=dados");
  // L6a: "no nome do cliente da venda" manda só o cliente; o banco copia nome e documento do cadastro.
  const cliente = dados.get("cliente");
  const destinatario = dados.get("usar_cliente") === "sim" && ehUuid(cliente)
    ? { cliente }
    : { ...(texto(dados, "nome", 120) ? { nome: texto(dados, "nome", 120) } : {}), ...(texto(dados, "documento", 20) ? { documento: texto(dados, "documento", 20) } : {}) };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_solicitar", { p_venda: venda, p_destinatario: destinatario, p_chave: chaveDe(dados) });
  redirect(error ? `/vendas/${venda}?erro_nota=${erroDasNotas(error)}` : `/vendas/${venda}?nota=pedida`);
}

// K1c (#76): pedir o envio da nota emitida ao WhatsApp do cliente. O banco confere tudo (nota emitida, PDF guardado,
// cliente com WhatsApp, quem pede) e só põe na fila: quem envia é o worker, pela integração oficial.
export async function enviarNotaPeloWhatsApp(dados: FormData) {
  const pedido = dados.get("pedido");
  const venda = dados.get("venda");
  if (!ehUuid(pedido) || !ehUuid(venda)) redirect("/vendas?erro=dados");
  const motivo = texto(dados, "motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("nota_enviar_whatsapp", { p_pedido: pedido, p_chave: chaveDe(dados), p_motivo: motivo || (null as unknown as string) });
  redirect(error ? `/vendas/${venda}?erro_nota=${erroDasNotas(error)}` : `/vendas/${venda}?nota=whatsapp`);
}

// Resultado desconhecido conferido por quem aprova a nota: "não chegou", com motivo, libera o reenvio.
export async function conferirEnvioDesconhecido(dados: FormData) {
  const envio = dados.get("envio");
  const venda = dados.get("venda");
  if (!ehUuid(envio) || !ehUuid(venda)) redirect("/vendas?erro=dados");
  const motivo = texto(dados, "motivo");
  if (motivo.length < 3) redirect(`/vendas/${venda}?erro_nota=motivo`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("whatsapp_envio_resolver", { p_envio: envio, p_motivo: motivo });
  redirect(error ? `/vendas/${venda}?erro_nota=${erroDasNotas(error)}` : `/vendas/${venda}?nota=whatsapp_conferido`);
}

export async function decidirNota(dados: FormData) {
  const pedido = dados.get("pedido");
  const decisao = dados.get("decisao");
  if (!ehUuid(pedido) || (decisao !== "aprovar" && decisao !== "corrigir")) redirect("/notas?erro=dados");
  if (decisao === "corrigir" && texto(dados, "observacao").length < 3) redirect("/notas?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_decidir", { p_pedido: pedido, p_aprovar: decisao === "aprovar", p_observacao: texto(dados, "observacao") });
  voltarParaFila(error, decisao === "aprovar" ? "aprovada" : "correcao");
}

export async function corrigirNota(dados: FormData) {
  const pedido = dados.get("pedido");
  const venda = dados.get("venda");
  if (!ehUuid(pedido) || !ehUuid(venda)) redirect("/vender?erro=dados");
  // INTEG-a (#87): "usar o cadastro atualizado" manda só o cliente da venda; o banco guarda de novo o destinatário inteiro.
  const cliente = dados.get("cliente");
  const destinatario = dados.get("usar_cadastro") === "sim" && ehUuid(cliente)
    ? { cliente }
    : { ...(texto(dados, "nome", 120) ? { nome: texto(dados, "nome", 120) } : {}), ...(texto(dados, "documento", 20) ? { documento: texto(dados, "documento", 20) } : {}) };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_corrigir", { p_pedido: pedido, p_destinatario: destinatario });
  redirect(error ? `/vendas/${venda}?erro_nota=${erroDasNotas(error)}` : `/vendas/${venda}?nota=corrigida`);
}

export async function registrarEmissao(dados: FormData) {
  const pedido = dados.get("pedido");
  const chaveAcesso = texto(dados, "chave_acesso", 80).replace(/\D/g, "");
  if (!ehUuid(pedido) || chaveAcesso.length !== 44) redirect("/notas?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_registrar_emissao", { p_pedido: pedido, p_chave_acesso: chaveAcesso, p_observacao: texto(dados, "observacao") });
  voltarParaFila(error, "emitida");
}

export async function cancelarPedidoDeNota(dados: FormData) {
  const pedido = dados.get("pedido");
  const motivo = texto(dados, "motivo");
  if (!ehUuid(pedido)) redirect("/notas?erro=dados");
  if (motivo.length < 3) redirect("/notas?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_cancelar", { p_pedido: pedido, p_motivo: motivo });
  voltarParaFila(error, "cancelada");
}

export async function definirPrazo(dados: FormData) {
  const minutos = texto(dados, "alerta_minutos", 6);
  const fonte = texto(dados, "fonte", 300);
  if (minutos && !/^\d{1,5}$/.test(minutos)) redirect("/notas?erro=dados");
  if (fonte.length < 10) redirect("/notas?erro=fonte");
  const { supabase } = await obterSessao({ exigirLoja: true });
  // Sem minutos = sem prazo de alerta (aguardando o contador). O tipo gerado não marca o parâmetro como opcional.
  const { error } = await supabase.rpc("fiscal_definir_politica", { p_alerta_minutos: (minutos ? Number(minutos) : null) as number, p_fonte: fonte });
  voltarParaFila(error, "prazo");
}

// L10c (ORA-FISC-009): o cancelamento da nota feito no portal do fisco, registrado com o protocolo do evento e a
// justificativa. Depois dele a venda pode ser cancelada ou pedir outra nota; o banco confere quem e a nota.
export async function registrarCancelamentoNoFisco(dados: FormData) {
  const pedido = dados.get("pedido");
  const venda = dados.get("venda");
  if (!ehUuid(pedido) || !ehUuid(venda)) redirect("/vendas?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_registrar_cancelamento", {
    p_pedido: pedido, p_protocolo: texto(dados, "protocolo", 30), p_justificativa: texto(dados, "justificativa", 255),
  });
  redirect(error ? `/vendas/${venda}?erro_nota=${erroDasNotas(error)}` : `/vendas/${venda}?nota=cancelada_no_fisco`);
}

// L10c: a chave registrada errada (digitada errado ou de outra nota) trocada pela certa, com o motivo; a anterior fica no
// histórico da nota. Com o XML guardado, o banco recusa (a chave é a do XML).
export async function corrigirChaveDaNota(dados: FormData) {
  const pedido = dados.get("pedido");
  const venda = dados.get("venda");
  if (!ehUuid(pedido) || !ehUuid(venda)) redirect("/vendas?erro=dados");
  const motivo = texto(dados, "motivo", 300);
  if (motivo.length < 10) redirect(`/vendas/${venda}?erro_nota=chave_motivo`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_corrigir_chave", { p_pedido: pedido, p_chave_acesso: texto(dados, "chave_acesso", 80), p_motivo: motivo });
  redirect(error ? `/vendas/${venda}?erro_nota=${erroDasNotas(error)}` : `/vendas/${venda}?nota=chave_corrigida`);
}

// FISC-009b (ORA-FISC-009): a carta de correção da NF-e feita no portal do fisco, registrada com o número do evento, o
// protocolo e o texto. O banco confere quem, a nota (NF-e emitida e não cancelada) e as regras do evento; repetir a
// mesma carta não muda nada. O texto não é cortado aqui (o banco recusa o que passar de 1.000 caracteres).
export async function registrarCartaDeCorrecao(dados: FormData) {
  const pedido = dados.get("pedido");
  const venda = dados.get("venda");
  if (!ehUuid(pedido) || !ehUuid(venda)) redirect("/vendas?erro=dados");
  const digitado = texto(dados, "numero", 10);
  const numero = /^[0-9]{1,2}$/.test(digitado) ? Number(digitado) : 0;
  if (numero < 1 || numero > 20) redirect(`/vendas/${venda}?erro_nota=carta_numero`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("notas_registrar_carta_de_correcao", {
    p_pedido: pedido, p_numero: numero, p_protocolo: texto(dados, "protocolo", 60), p_correcao: texto(dados, "correcao", 1001),
  });
  redirect(error ? `/vendas/${venda}?erro_nota=${erroDasNotas(error)}` : `/vendas/${venda}?nota=${data === false ? "carta_repetida" : "carta_registrada"}`);
}

// L10b (ORA-FISC-008): quem aprova nota registra que conferiu uma divergência da conciliação (o que viu e o que fez). O
// banco confere a permissão na loja do pedido e se a divergência ainda existe; a conferência fica na auditoria.
export async function conferirDivergencia(dados: FormData) {
  const periodo = dados.get("periodo");
  const loja = dados.get("loja");
  const volta = enderecoDaConciliacao(ehPeriodo(periodo) ? periodo : "mes", ehUuid(loja) ? loja : null);
  const pedido = dados.get("pedido");
  const tipo = dados.get("tipo");
  if (!ehUuid(pedido) || !ehTipoDeDivergencia(tipo)) redirect(`${volta}&erro=dados`);
  const observacao = texto(dados, "observacao", 500);
  if (observacao.length < 10) redirect(`${volta}&erro=observacao`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_conferir_divergencia", { p_pedido: pedido, p_tipo: tipo, p_observacao: observacao });
  redirect(error ? `${volta}&erro=${erroDaConciliacao(error)}` : `${volta}&ok=conferida`);
}

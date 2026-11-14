"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import {
  ehCanal, erroDaOs, ehPasso, lerAbertura, lerOrcamento, lerPeca, linkDoWhatsApp, mensagemDoAviso, skuExato, tipoDaImagem, type AvisoDaOs, type EntregaDoAviso,
  type ErroDaOs, type OrcamentoDoAviso,
} from "../../lib/assistencia/regras";

// Ações da assistência (lote L12a). Cada uma chama a função do banco como a pessoa logada; o banco confere a loja do
// turno, a permissão e o estado da OS de novo.

const hojeEmSaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const textoDo = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export async function abrirOrdem(dados: FormData) {
  const cliente = dados.get("cliente");
  const voltar = (erro: ErroDaOs): never => redirect(`/assistencia/nova?cliente=${ehUuid(cliente) ? cliente : ""}&erro=${erro}`);
  const lido = lerAbertura(dados, hojeEmSaoPaulo());
  if (!lido.ok) voltar(lido.erro);
  const { dados: os, chave } = lido as Extract<typeof lido, { ok: true }>;
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("os_abrir", { p_dados: os, p_chave: chave });
  if (error) voltar(erroDaOs(error));
  const id = (data as { id?: unknown } | null)?.id;
  if (!ehUuid(id)) voltar("falha");
  revalidatePath("/assistencia");
  redirect(`/assistencia/${id as string}?ok=aberta`);
}

export async function passoDaOrdem(dados: FormData) {
  const os = dados.get("os");
  const passo = dados.get("passo");
  if (!ehUuid(os)) redirect("/assistencia");
  if (!ehPasso(passo)) redirect(`/assistencia/${os}?erro=dados`);
  const assistencia = dados.get("assistencia");
  const observacao = textoDo(dados.get("observacao"));
  if (observacao.length > 300) redirect(`/assistencia/${os}?erro=dados`);
  if ((passo === "devolver_ao_cliente" || passo === "cancelar") && (observacao.length < 3 || observacao.length > 200)) redirect(`/assistencia/${os}?erro=motivo`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("os_custodia", {
    p_os: os, p_passo: passo, p_assistencia: (ehUuid(assistencia) ? assistencia : null) as string, p_observacao: (observacao || null) as string,
  });
  if (error) redirect(`/assistencia/${os}?erro=${erroDaOs(error)}`);
  revalidatePath("/assistencia");
  redirect(`/assistencia/${os}?ok=${data ? passo : "sem_mudanca"}`);
}

/** Pega o WhatsApp do cliente (fica registrado) e abre a conversa com a mensagem pronta (clique para conversar). */
export async function avisarPeloWhatsApp(dados: FormData) {
  const os = dados.get("os");
  const aviso = dados.get("aviso");
  if (!ehUuid(os)) redirect("/assistencia");
  if (aviso !== "comprovante" && aviso !== "na_loja" && aviso !== "orcamento" && aviso !== "entrega") redirect(`/assistencia/${os}?erro=dados`);
  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  const ordem = await supabase.from("ordens_servico").select("numero, aparelho, imei, numero_serie, defeito, acessorios, prazo, cliente_nome, encerrada_em").eq("id", os).maybeSingle();
  if (ordem.error || !ordem.data) redirect(`/assistencia/${os}?erro=nao_encontrada`);
  // L12c: o comprovante da entrega leva o dia e o número da venda que cobrou o conserto (da trilha da OS).
  let entrega: EntregaDoAviso | undefined;
  if (aviso === "entrega") {
    const cobrada = await supabase.from("os_eventos").select("observacao").eq("os_id", os).eq("tipo", "cobrada").order("id", { ascending: false }).limit(1).maybeSingle();
    const numero = /nº (\d+)/.exec(cobrada.data?.observacao ?? "")?.[1];
    const encerrada = ordem.data?.encerrada_em;
    entrega = {
      dia: encerrada ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(encerrada)) : hojeEmSaoPaulo(),
      vendaNumero: numero ? Number(numero) : null,
    };
  }
  // L12b: o aviso do orçamento leva o que espera o cliente (diagnóstico, peças, mão de obra e total).
  let orcamento: OrcamentoDoAviso | undefined;
  if (aviso === "orcamento") {
    const lido = await supabase.from("os_orcamentos").select("numero, diagnostico, pecas, mao_de_obra_centavos, total_centavos, prazo_dias")
      .eq("os_id", os).eq("situacao", "aguardando_cliente").maybeSingle();
    if (lido.error || !lido.data) redirect(`/assistencia/${os}?erro=aviso_orcamento`);
    orcamento = lido.data as unknown as OrcamentoDoAviso;
  }
  const contato = await supabase.rpc("os_contato_whatsapp", { p_os: os, p_aviso: aviso as AvisoDaOs });
  if (contato.error || typeof contato.data !== "string") redirect(`/assistencia/${os}?erro=${erroDaOs(contato.error)}`);
  const link = linkDoWhatsApp(contato.data as string, mensagemDoAviso(aviso as AvisoDaOs, ordem.data!, situacao.unidade_nome ?? "Ora 5G", orcamento, entrega));
  if (!link) redirect(`/assistencia/${os}?erro=sem_whatsapp`);
  redirect(link as string);
}

/** Depois do envio ao Storage pelo celular: o servidor baixa o arquivo, confere que é imagem e registra com o SHA-256. */
export async function registrarFotoDaOs(dados: { os: string; caminho: string }): Promise<{ ok: true } | { ok: false; erro: ErroDaOs }> {
  if (!ehUuid(dados.os) || typeof dados.caminho !== "string" || dados.caminho.length > 300) return { ok: false, erro: "dados" };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const arquivo = await supabase.storage.from("os").download(dados.caminho);
  if (arquivo.error || !arquivo.data) return { ok: false, erro: "foto" };
  const bytes = new Uint8Array(await arquivo.data.arrayBuffer());
  if (!tipoDaImagem(bytes)) return { ok: false, erro: "foto" };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.rpc("os_anexar_foto", { p_os: dados.os, p_caminho: dados.caminho, p_sha256: sha256 });
  if (error) return { ok: false, erro: erroDaOs(error) };
  revalidatePath(`/assistencia/${dados.os}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Orçamento (L12b): registrar (técnico ou gerência em nome dele), a resposta do cliente (loja) e o conserto pronto
// ---------------------------------------------------------------------------------------------
export async function orcarOrdem(dados: FormData) {
  const os = dados.get("os");
  if (!ehUuid(os)) redirect("/assistencia");
  const lido = lerOrcamento(dados);
  if (!lido.ok) redirect(`/assistencia/${os}?erro=${lido.erro}`);
  const { dados: orcamento, chave } = lido as Extract<typeof lido, { ok: true }>;
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("os_orcar", { p_os: os, p_dados: orcamento, p_chave: chave });
  if (error) redirect(`/assistencia/${os}?erro=${erroDaOs(error)}`);
  revalidatePath("/assistencia");
  redirect(`/assistencia/${os}?ok=orcamento`);
}

export async function responderOrcamento(dados: FormData) {
  const os = dados.get("os");
  const orcamento = dados.get("orcamento");
  const resposta = dados.get("resposta");
  const canal = dados.get("canal");
  if (!ehUuid(os)) redirect("/assistencia");
  if (!ehUuid(orcamento) || (resposta !== "aprovado" && resposta !== "recusado")) redirect(`/assistencia/${os}?erro=resposta`);
  if (!ehCanal(canal)) redirect(`/assistencia/${os}?erro=canal`);
  const observacao = textoDo(dados.get("observacao"));
  if (observacao.length === 1 || observacao.length > 300) redirect(`/assistencia/${os}?erro=dados`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("os_responder_orcamento", {
    p_orcamento: orcamento as string, p_resposta: resposta as string, p_canal: canal as string, p_observacao: (observacao || null) as string,
  });
  if (error) redirect(`/assistencia/${os}?erro=${erroDaOs(error)}`);
  revalidatePath("/assistencia");
  redirect(`/assistencia/${os}?ok=${data ? `orcamento_${resposta as string}` : "sem_mudanca"}`);
}

export async function concluirServico(dados: FormData) {
  const os = dados.get("os");
  if (!ehUuid(os)) redirect("/assistencia");
  const observacao = textoDo(dados.get("observacao"));
  if (observacao.length === 1 || observacao.length > 300) redirect(`/assistencia/${os}?erro=dados`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("os_concluir_servico", { p_os: os, p_observacao: (observacao || null) as string });
  if (error) redirect(`/assistencia/${os}?erro=${erroDaOs(error)}`);
  revalidatePath("/assistencia");
  redirect(`/assistencia/${os}?ok=${data ? "concluido" : "sem_mudanca"}`);
}

// ---------------------------------------------------------------------------------------------
// Cobrança no PDV e entrega (L12c): o conserto pronto vai para o carrinho de quem cobra; a entrega vem depois da venda
// ---------------------------------------------------------------------------------------------
/** Põe o conserto no carrinho do PDV (a venda aberta de quem cobra nesta loja, ou uma nova) e leva ao PDV. */
export async function cobrarNoPdv(dados: FormData) {
  const os = dados.get("os");
  const chaveVenda = dados.get("chave_venda");
  const chaveItem = dados.get("chave_item");
  if (!ehUuid(os)) redirect("/assistencia");
  if (!ehUuid(chaveVenda) || !ehUuid(chaveItem)) redirect(`/assistencia/${os}?erro=dados`);
  const { supabase, usuario, situacao } = await obterSessao({ exigirLoja: true });
  // A mesma venda que o PDV mostra: a aberta mais recente de quem cobra, nesta loja.
  const aberta = await supabase.from("vendas").select("id").eq("vendedor_id", usuario.id).eq("unidade_id", situacao.unidade_id as string)
    .in("situacao", ["rascunho", "aguardando_aprovacao"]).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (aberta.error) redirect(`/assistencia/${os}?erro=falha`);
  let venda = aberta.data?.id ?? null;
  if (!venda) {
    const nova = await supabase.rpc("criar_venda", { p_chave: chaveVenda as string });
    if (nova.error || !ehUuid(nova.data)) redirect(`/assistencia/${os}?erro=${nova.error?.code === "42501" ? "sem_permissao" : "venda"}`);
    venda = nova.data as string;
  }
  const { error } = await supabase.rpc("os_cobrar", { p_venda: venda, p_os: os as string, p_chave: chaveItem as string });
  if (error) redirect(`/assistencia/${os}?erro=${erroDaOs(error)}`);
  revalidatePath("/vender");
  redirect("/vender?os=no_carrinho");
}

/** Registra a entrega ao cliente, depois da venda concluída que cobrou o conserto. */
export async function entregarOrdem(dados: FormData) {
  const os = dados.get("os");
  if (!ehUuid(os)) redirect("/assistencia");
  const observacao = textoDo(dados.get("observacao"));
  if (observacao.length === 1 || observacao.length > 300) redirect(`/assistencia/${os}?erro=dados`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("os_entregar", { p_os: os, p_observacao: (observacao || null) as string });
  if (error) redirect(`/assistencia/${os}?erro=${erroDaOs(error)}`);
  revalidatePath("/assistencia");
  redirect(`/assistencia/${os}?ok=${data ? "entregue" : "sem_mudanca"}`);
}

// ---------------------------------------------------------------------------------------------
// Peças (L12d): o técnico (ou a gerência em nome dele) registra a peça usada pelo SKU; a que sobrou volta ao estoque
// ---------------------------------------------------------------------------------------------
export async function usarPeca(dados: FormData) {
  const os = dados.get("os");
  if (!ehUuid(os)) redirect("/assistencia");
  const lido = lerPeca(dados);
  if (!lido.ok) redirect(`/assistencia/${os}?erro=${lido.erro}`);
  const { sku, quantidade, observacao, chave } = lido as Extract<typeof lido, { ok: true }>;
  const { supabase } = await obterSessao({ exigirLoja: true });
  // O SKU é único na rede sem diferença de maiúsculas (índice do catálogo); o catálogo é lido por quem é da rede.
  const variantes = await supabase.from("variantes").select("id").ilike("sku", skuExato(sku)).limit(2);
  if (variantes.error) redirect(`/assistencia/${os}?erro=falha`);
  if (variantes.data?.length !== 1) redirect(`/assistencia/${os}?erro=peca_nao_encontrada`);
  const { error } = await supabase.rpc("os_usar_peca", {
    p_os: os, p_variante: variantes.data![0]!.id, p_quantidade: quantidade, p_observacao: (observacao ?? null) as string, p_chave: chave,
  });
  if (error) redirect(`/assistencia/${os}?erro=${erroDaOs(error)}`);
  revalidatePath(`/assistencia/${os}`);
  redirect(`/assistencia/${os}?ok=peca_usada`);
}

export async function devolverPeca(dados: FormData) {
  const os = dados.get("os");
  const peca = dados.get("peca");
  if (!ehUuid(os)) redirect("/assistencia");
  if (!ehUuid(peca)) redirect(`/assistencia/${os}?erro=dados`);
  const motivo = textoDo(dados.get("motivo"));
  if (motivo.length < 3 || motivo.length > 200) redirect(`/assistencia/${os}?erro=motivo`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("os_devolver_peca", { p_peca: peca as string, p_motivo: motivo });
  if (error) redirect(`/assistencia/${os}?erro=${erroDaOs(error)}`);
  revalidatePath(`/assistencia/${os}`);
  redirect(`/assistencia/${os}?ok=${data ? "peca_devolvida" : "sem_mudanca"}`);
}

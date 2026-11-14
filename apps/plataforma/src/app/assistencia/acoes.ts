"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDaOs, ehPasso, lerAbertura, linkDoWhatsApp, mensagemDoAviso, tipoDaImagem, type AvisoDaOs, type ErroDaOs } from "../../lib/assistencia/regras";

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
  if (aviso !== "comprovante" && aviso !== "na_loja") redirect(`/assistencia/${os}?erro=dados`);
  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  const ordem = await supabase.from("ordens_servico").select("numero, aparelho, imei, numero_serie, defeito, acessorios, prazo, cliente_nome").eq("id", os).maybeSingle();
  if (ordem.error || !ordem.data) redirect(`/assistencia/${os}?erro=nao_encontrada`);
  const contato = await supabase.rpc("os_contato_whatsapp", { p_os: os, p_aviso: aviso as AvisoDaOs });
  if (contato.error || typeof contato.data !== "string") redirect(`/assistencia/${os}?erro=${erroDaOs(contato.error)}`);
  const link = linkDoWhatsApp(contato.data as string, mensagemDoAviso(aviso as AvisoDaOs, ordem.data!, situacao.unidade_nome ?? "Ora 5G"));
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

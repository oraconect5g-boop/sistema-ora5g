// Documentos da venda (lote L5d: ORA-CRM-008): os tipos, a conferência do arquivo pelo conteúdo (o servidor confere
// antes de guardar no bucket privado "anexos") e as mensagens. A regra que vale é a do banco
// (packages/banco/src/anexos-da-venda.test.ts); nada do conteúdo vai para log.
export const TIPOS_DE_ANEXO = {
  contrato_financiamento: "Contrato do financiamento",
  termo_garantia: "Termo de garantia",
  contrato_linha: "Contrato da linha",
  comprovante_assinado: "Comprovante assinado",
  outro: "Outro documento",
} as const;
export type TipoDeAnexo = keyof typeof TIPOS_DE_ANEXO;
export const ehTipoDeAnexo = (v: unknown): v is TipoDeAnexo => typeof v === "string" && Object.hasOwn(TIPOS_DE_ANEXO, v);

export const TAMANHO_MAXIMO_DO_ANEXO = 5 * 1024 * 1024;
const CONTEUDO = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
export type FormatoDoAnexo = keyof typeof CONTEUDO;

/** O formato real do arquivo pelos primeiros bytes (PDF, JPEG, PNG ou WebP); outro conteúdo é recusado. */
export function conferirAnexo(bytes: Uint8Array): { ok: true; formato: FormatoDoAnexo; contentType: string } | { ok: false; erro: "anexo_tipo" | "anexo_grande" } {
  if (bytes.length === 0) return { ok: false, erro: "anexo_tipo" };
  if (bytes.length > TAMANHO_MAXIMO_DO_ANEXO) return { ok: false, erro: "anexo_grande" };
  const texto = (inicio: number, n: number) => String.fromCharCode(...bytes.subarray(inicio, inicio + n));
  let formato: FormatoDoAnexo | null = null;
  if (texto(0, 5) === "%PDF-") formato = "pdf";
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) formato = "jpg";
  else if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) formato = "png";
  else if (bytes.length >= 12 && texto(0, 4) === "RIFF" && texto(8, 4) === "WEBP") formato = "webp";
  return formato ? { ok: true, formato, contentType: CONTEUDO[formato] } : { ok: false, erro: "anexo_tipo" };
}

/**
 * Lê o tipo (de um catálogo com "outro") e a descrição do formulário: a descrição tem de 3 a 120 letras e é obrigatória
 * em "Outro documento". Serve aos documentos da venda e aos da conta a pagar (FIN-004b).
 */
export function lerTipoEDescricao<T extends string>(ehTipo: (v: unknown) => v is T, tipo: unknown, descricao: unknown): { ok: true; tipo: T; descricao: string | null } | { ok: false } {
  const texto = typeof descricao === "string" ? descricao.trim().replace(/\s+/g, " ") : "";
  if (!ehTipo(tipo) || texto.length > 120 || (texto.length > 0 && texto.length < 3) || (tipo === "outro" && texto.length === 0)) return { ok: false };
  return { ok: true, tipo, descricao: texto || null };
}
/** Lê o tipo e a descrição do formulário (a descrição é obrigatória em "Outro documento"). */
export const lerDadosDoAnexo = (tipo: unknown, descricao: unknown) => lerTipoEDescricao(ehTipoDeAnexo, tipo, descricao);

export const ERROS_DOS_ANEXOS = {
  anexo_tipo: "Envie PDF ou foto (JPEG, PNG ou WebP); o arquivo é conferido pelo conteúdo.",
  anexo_grande: "O documento passa de 5 MB: reduza a foto ou envie o PDF menor.",
  anexo_dados: "Escolha o tipo do documento (e descreva, de 3 a 120 letras, se for \"Outro documento\").",
  anexo_venda_aberta: "Anexe o documento depois de concluir a venda.",
  anexo_limite: "Esta venda já tem 20 documentos: a gerência retira um errado antes.",
  anexo_permissao: "Só quem vendeu ou a gerência da loja anexa documento; retirar é da gerência.",
  anexo_motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  anexo_falha: "Não deu para guardar o documento agora. Tente de novo em instantes.",
} as const;
export type ErroDoAnexo = keyof typeof ERROS_DOS_ANEXOS;

/** Traduz o erro do banco para a mensagem da tela (pelo código e por um trecho da mensagem do banco). */
export function erroDosAnexos(erro: { code?: string; message?: string } | null | undefined): ErroDoAnexo {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "P0002" && m.includes("storage")) return "anexo_falha";
  if (codigo === "42501" || codigo === "P0002") return "anexo_permissao";
  if (codigo !== "22023") return "anexo_falha";
  if (m.includes("depois de concluir")) return "anexo_venda_aberta";
  if (m.includes("20 documentos")) return "anexo_limite";
  if (m.includes("motivo")) return "anexo_motivo";
  if (m.includes("tipo de documento") || m.includes("descrição") || m.includes("que documento")) return "anexo_dados";
  if (m.includes("formato")) return "anexo_tipo";
  return "anexo_falha";
}

/** Tamanho legível: "850 KB", "1,2 MB". */
export const tamanhoDoAnexo = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
